import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveDiscountPercent, salePriceFromDiscount } from "./pricing-core";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertCatalog(context: any) {
  const { data: admin } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
  if (admin) return;
  const { data: catalog } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "catalog" });
  if (!catalog) throw new Error("Acesso restrito à equipe de catálogo");
}

type Setting = { id: string; scope: string; target_id: string | null; percent: number; enabled: boolean };

/** Preço promocional a partir do preço de tabela e do percentual. Nunca negativo. */
export function salePriceFromPercent(listCents: number, percent: number): number | null {
  return salePriceFromDiscount(listCents, percent);
}

/** Hierarquia: produto > categoria > global. `null` = não configurado (herda). */
function resolvePercent(
  productId: string,
  categoryId: string | null,
  byProduct: Map<string, number>,
  byCategory: Map<string, number>,
  global: number | null,
): number {
  return resolveDiscountPercent(productId, categoryId, byProduct, byCategory, global);
}

export const listDiscountSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertCatalog(context);
    const db = context.supabase;
    const { data, error } = await db.from("discount_settings").select("*");
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Setting[];

    const categoryIds = rows.filter((r) => r.scope === "category" && r.target_id).map((r) => r.target_id!);
    const productIds = rows.filter((r) => r.scope === "product" && r.target_id).map((r) => r.target_id!);

    const [catsRes, prodsRes] = await Promise.all([
      categoryIds.length ? db.from("categories").select("id,name").in("id", categoryIds) : Promise.resolve({ data: [] }),
      productIds.length ? db.from("products").select("id,name").in("id", productIds) : Promise.resolve({ data: [] }),
    ]);
    const catName = new Map((catsRes.data ?? []).map((c: { id: string; name: string }) => [c.id, c.name]));
    const prodName = new Map((prodsRes.data ?? []).map((p: { id: string; name: string }) => [p.id, p.name]));

    return {
      global: rows.find((r) => r.scope === "global") ?? null,
      categories: rows
        .filter((r) => r.scope === "category")
        .map((r) => ({ ...r, name: catName.get(r.target_id!) ?? "Categoria removida" })),
      products: rows
        .filter((r) => r.scope === "product")
        .map((r) => ({ ...r, name: prodName.get(r.target_id!) ?? "Produto removido" })),
    };
  });

const SaveSchema = z.object({
  scope: z.enum(["global", "category", "product"]),
  target_id: z.string().uuid().nullable().optional(),
  percent: z.number().min(0).max(100),
  enabled: z.boolean().default(true),
});

/** Salva a configuração e recalcula os preços promocionais dos produtos afetados. */
export const saveDiscountSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => SaveSchema.parse(v))
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const db = context.supabase;
    if (data.scope !== "global" && !data.target_id) throw new Error("Selecione o alvo do desconto");

    const percent = Math.round(data.percent * 100) / 100;

    const existingQuery = db.from("discount_settings").select("id").eq("scope", data.scope);
    const { data: existing } = data.scope === "global"
      ? await existingQuery.is("target_id", null).maybeSingle()
      : await existingQuery.eq("target_id", data.target_id!).maybeSingle();

    if (existing?.id) {
      const { error } = await db
        .from("discount_settings")
        .update({ percent, enabled: data.enabled })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await db.from("discount_settings").insert({
        scope: data.scope,
        target_id: data.scope === "global" ? null : data.target_id!,
        percent,
        enabled: data.enabled,
      });
      if (error) throw new Error(error.message);
    }

    const updated = await recalculate(db, data.scope, data.target_id ?? null);
    return { updated };
  });

export const removeDiscountSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const db = context.supabase;
    const { data: row } = await db.from("discount_settings").select("scope,target_id").eq("id", data.id).maybeSingle();
    const { error } = await db.from("discount_settings").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    const updated = row
      ? await recalculate(db, row.scope as string, (row.target_id as string | null) ?? null)
      : 0;
    return { updated };
  });

/** Reaplica a hierarquia em todo o catálogo. */
export const recalculateAllDiscounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertCatalog(context);
    return { updated: await recalculate(context.supabase, "global", null) };
  });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function recalculate(db: any, scope: string, targetId: string | null): Promise<number> {
  const { data: settingsData, error: settingsErr } = await db.from("discount_settings").select("*");
  if (settingsErr) throw new Error(settingsErr.message);
  const settings = (settingsData ?? []) as Setting[];

  const byProduct = new Map<string, number>();
  const byCategory = new Map<string, number>();
  let global: number | null = null;
  for (const s of settings) {
    if (!s.enabled) continue;
    const pct = Number(s.percent);
    if (s.scope === "global") global = pct;
    else if (s.scope === "category" && s.target_id) byCategory.set(s.target_id, pct);
    else if (s.scope === "product" && s.target_id) byProduct.set(s.target_id, pct);
  }

  let productQuery = db.from("products").select("id,category_id");
  if (scope === "product" && targetId) productQuery = productQuery.eq("id", targetId);
  else if (scope === "category" && targetId) productQuery = productQuery.eq("category_id", targetId);
  const { data: products, error: prodErr } = await productQuery;
  if (prodErr) throw new Error(prodErr.message);
  const rows = (products ?? []) as { id: string; category_id: string | null }[];
  if (!rows.length) return 0;

  const productIds = rows.map((p) => p.id);
  const percentByProduct = new Map(
    rows.map((p) => [p.id, resolvePercent(p.id, p.category_id, byProduct, byCategory, global)]),
  );

  let changed = 0;
  for (let i = 0; i < productIds.length; i += 200) {
    const chunk = productIds.slice(i, i + 200);
    const { data: variants, error: varErr } = await db
      .from("product_variants")
      .select("id,product_id,prices:product_prices(id,list_price_cents,sale_price_cents,is_active)")
      .in("product_id", chunk);
    if (varErr) throw new Error(varErr.message);

    const touchedProducts = new Set<string>();
    const updates: { id: string; sale_price_cents: number | null }[] = [];
    for (const v of (variants ?? []) as {
      id: string;
      product_id: string;
      prices: { id: string; list_price_cents: number; sale_price_cents: number | null; is_active: boolean }[] | null;
    }[]) {
      const pct = percentByProduct.get(v.product_id) ?? 0;
      for (const price of v.prices ?? []) {
        if (!price.is_active) continue;
        const next = salePriceFromPercent(Number(price.list_price_cents), pct);
        if ((price.sale_price_cents ?? null) === next) continue;
        updates.push({ id: price.id, sale_price_cents: next });
        touchedProducts.add(v.product_id);
      }
    }

    for (let j = 0; j < updates.length; j += 25) {
      await Promise.all(
        updates.slice(j, j + 25).map((u) =>
          db.from("product_prices").update({ sale_price_cents: u.sale_price_cents }).eq("id", u.id),
        ),
      );
    }
    changed += touchedProducts.size;
  }

  return changed;
}
