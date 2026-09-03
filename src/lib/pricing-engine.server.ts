import {
  computeLegacyListPrice,
  computeProfessionalListPrice,
  resolveDiscountPercent,
  salePriceFromDiscount,
  type LegacyImportPricing,
} from "./pricing-core";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type ApplyProductPricingOptions = {
  fallbackSettings: LegacyImportPricing;
  defaultSupplierCostCents?: number | null;
};

function supplierCostFromOptions(options: unknown): number | null {
  if (!options || typeof options !== "object") return null;
  const raw = Number((options as Record<string, unknown>).supplier_cost_cents ?? 0);
  return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : null;
}

/** Único caminho usado pelas sincronizações para transformar custo em preço de venda. */
export async function applyProductPricing(
  db: any,
  productId: string,
  options: ApplyProductPricingOptions,
): Promise<{ variantsPriced: number; discountPercent: number; mode: "professional" | "legacy" | "preserved" }> {
  const [productRes, variantsRes, profileRes, costsRes, discountsRes] = await Promise.all([
    db.from("products").select("id,category_id").eq("id", productId).maybeSingle(),
    db.from("product_variants")
      .select("id,options,prices:product_prices(id,list_price_cents,is_active)")
      .eq("product_id", productId),
    db.from("pricing_profiles").select("*").eq("is_default", true).eq("enabled", true).maybeSingle(),
    db.from("pricing_cost_components").select("key,amount_cents").eq("product_id", productId),
    db.from("discount_settings").select("scope,target_id,percent,enabled").eq("enabled", true),
  ]);
  if (productRes.error) throw new Error(productRes.error.message);
  if (variantsRes.error) throw new Error(variantsRes.error.message);
  if (!productRes.data) throw new Error("Produto não encontrado para aplicar a precificação.");

  const productDiscounts = new Map<string, number>();
  const categoryDiscounts = new Map<string, number>();
  let globalDiscount: number | null = null;
  for (const row of discountsRes.data ?? []) {
    const value = Number(row.percent ?? 0);
    if (row.scope === "global") globalDiscount = value;
    else if (row.scope === "product" && row.target_id) productDiscounts.set(row.target_id, value);
    else if (row.scope === "category" && row.target_id) categoryDiscounts.set(row.target_id, value);
  }
  const discountPercent = resolveDiscountPercent(
    productId,
    productRes.data.category_id ?? null,
    productDiscounts,
    categoryDiscounts,
    globalDiscount,
  );
  // O custo do fornecedor é específico de cada SKU. Componentes "product" antigos
  // não são somados novamente; os demais são custos adicionais do produto.
  const additionalCostCents = (costsRes.data ?? [])
    .filter((row: any) => row.key !== "product")
    .reduce((sum: number, row: any) => sum + Math.max(0, Number(row.amount_cents ?? 0)), 0);

  let variantsPriced = 0;
  let mode: "professional" | "legacy" | "preserved" = profileRes.data ? "professional" : "legacy";
  for (const variant of variantsRes.data ?? []) {
    const active = variant.prices?.find((price: any) => price.is_active) ?? variant.prices?.[0];
    const supplierCost = supplierCostFromOptions(variant.options) ?? options.defaultSupplierCostCents ?? null;
    let listCents = Number(active?.list_price_cents ?? 0);
    if (supplierCost && supplierCost > 0) {
      listCents = profileRes.data
        ? computeProfessionalListPrice(supplierCost, additionalCostCents, profileRes.data)
        : computeLegacyListPrice(supplierCost, options.fallbackSettings);
    } else {
      mode = "preserved";
    }
    if (!(listCents > 0)) continue;
    const priceRow = {
      list_price_cents: listCents,
      sale_price_cents: salePriceFromDiscount(listCents, discountPercent),
      currency: "BRL",
      is_active: true,
    };
    const { error } = active?.id
      ? await db.from("product_prices").update(priceRow).eq("id", active.id)
      : await db.from("product_prices").insert({ variant_id: variant.id, ...priceRow });
    if (error) throw new Error(`Falha ao aplicar preço à variação: ${error.message}`);
    variantsPriced += 1;
  }
  return { variantsPriced, discountPercent, mode };
}