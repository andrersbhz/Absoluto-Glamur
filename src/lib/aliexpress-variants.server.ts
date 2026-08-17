/* eslint-disable @typescript-eslint/no-explicit-any */
import { callAli } from "./aliexpress-discovery.functions";
import { computeSalePriceCents, type ImportSettings } from "./aliexpress-import.functions";

const DEFAULT_SETTINGS: ImportSettings = {
  markup_percent: 150,
  markup_fixed_cents: 0,
  round_to_99: true,
  default_status: "draft",
  default_category_id: null,
  default_brand_id: null,
  fx_rate: 5.5,
};

export type ParsedSku = {
  /** Identificador do SKU no AliExpress (sku_id) */
  external_sku_id: string;
  /** sku_attr usado no fulfillment (ex.: "14:193#Preto;5:100014064") */
  external_sku_attr: string | null;
  /** Código legível do SKU */
  sku_code: string;
  /** { "Cor": "Preto", "Voltagem": "110V" } */
  attributes: Record<string, string>;
  image_url: string | null;
  /** Custo do fornecedor (moeda alvo, normalmente BRL) */
  cost: number | null;
  /** Preço "de" do fornecedor, se existir e for maior que o custo */
  cost_list: number | null;
  stock: number;
  weight_grams: number | null;
};

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[^\d.,-]/g, "").replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function parseAmount(v: unknown): number | null {
  if (v == null) return null;
  const n = num(v);
  return n > 0 ? n : null;
}

function asArray(block: any, key: string): any[] {
  if (Array.isArray(block)) return block;
  if (block && Array.isArray(block[key])) return block[key];
  return [];
}

/** Extrai todos os SKUs reais retornados pela API do AliExpress. */
export function parseSkus(json: any): ParsedSku[] {
  const root =
    json?.aliexpress_ds_product_get_response ??
    json?.aliexpress_ds_productdetail_get_response ??
    json;
  const result = root?.result ?? root;
  const skus = asArray(
    result?.ae_item_sku_info_dtos ?? result?.skus ?? result?.sku_info_list,
    "ae_item_sku_info_d_t_o",
  );

  const out: ParsedSku[] = [];
  for (const s of skus) {
    const externalId = String(s.sku_id ?? s.id ?? s.sku_code ?? "").trim();
    if (!externalId) continue;

    const attributes: Record<string, string> = {};
    let image_url: string | null = null;
    const props = asArray(
      s.ae_sku_property_dtos ?? s.sku_property_list ?? s.sku_property_dtos,
      "ae_sku_property_d_t_o",
    );
    for (const p of props) {
      const key = String(p.sku_property_name ?? p.property_name ?? p.name ?? "").trim();
      const val = String(
        p.property_value_definition_name ?? p.sku_property_value ?? p.value ?? "",
      ).trim();
      if (key && val) attributes[key] = val;
      const img = p.sku_image ?? p.image ?? null;
      if (typeof img === "string" && img.startsWith("http") && !image_url) image_url = img;
    }

    const cost =
      parseAmount(s.offer_sale_price) ??
      parseAmount(s.sku_price) ??
      parseAmount(s.offer_bulk_sale_price) ??
      parseAmount(s.price);
    const costList = parseAmount(s.sku_price);

    out.push({
      external_sku_id: externalId,
      external_sku_attr:
        typeof s.sku_attr === "string" && s.sku_attr.trim() ? s.sku_attr.trim() : null,
      sku_code: String(s.sku_code ?? externalId).trim(),
      attributes,
      image_url,
      cost,
      cost_list: costList && cost && costList > cost ? costList : null,
      stock: Math.max(
        0,
        Math.round(num(s.sku_available_stock ?? s.available_stock ?? s.sku_stock ?? s.stock)),
      ),
      weight_grams: (() => {
        const w = num(s.package_weight ?? s.sku_weight ?? 0); // kg
        return w > 0 ? Math.round(w * 1000) : null;
      })(),
    });
  }
  return out;
}

export function variantLabel(attrs: Record<string, string>): string | null {
  const values = Object.values(attrs).filter(Boolean);
  if (values.length === 0) return null;
  return values.join(" · ").slice(0, 120);
}

async function loadSettings(admin: any): Promise<ImportSettings> {
  try {
    const { data } = await admin
      .from("integrations")
      .select("config")
      .eq("provider", "aliexpress")
      .maybeSingle();
    const raw = (data?.config as any)?.import_settings ?? data?.config ?? null;
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...raw } as ImportSettings;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export type SyncVariantsResult = {
  source_id: string;
  total_skus: number;
  created: number;
  updated: number;
  unavailable: number;
  errors: string[];
  note?: string;
};

/**
 * Sincroniza (cria/atualiza) as variações reais de um produto a partir do AliExpress.
 * - Nunca apaga variações: as que sumiram do fornecedor viram `is_available = false`
 *   (preserva o vínculo com pedidos antigos).
 * - Atualiza preço (com markup da loja), estoque e imagem de cada SKU.
 */
export async function syncVariantsForProduct(
  admin: any,
  productId: string,
  sourceId: string,
  settingsOverride?: ImportSettings,
): Promise<SyncVariantsResult> {
  const settings = settingsOverride ?? (await loadSettings(admin));

  const json = await callAli("aliexpress.ds.product.get", {
    product_id: sourceId,
    ship_to_country: "BR",
    target_currency: "BRL",
    target_language: "PT",
  }, admin);
  const skus = parseSkus(json);
  if (skus.length === 0) {
    return {
      source_id: sourceId,
      total_skus: 0,
      created: 0,
      updated: 0,
      unavailable: 0,
      errors: [],
      note: "Nenhum SKU retornado pelo AliExpress.",
    };
  }

  const { data: existing } = await admin
    .from("product_variants")
    .select("id, sku, external_sku_id, is_default, created_at")
    .eq("product_id", productId)
    .order("created_at", { ascending: true });

  type Row = {
    id: string;
    sku: string;
    external_sku_id: string | null;
    is_default: boolean;
  };
  const rows: Row[] = (existing ?? []) as Row[];
  const byExternal = new Map<string, Row>();
  rows.forEach((r) => r.external_sku_id && byExternal.set(r.external_sku_id, r));
  // Variantes antigas (importação single-SKU) que podem ser "adotadas" pelo 1º SKU real.
  const adoptable = rows.filter((r) => !r.external_sku_id);
  const matchedIds = new Set<string>();

  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  for (let i = 0; i < skus.length; i += 1) {
    const s = skus[i];
    const name = variantLabel(s.attributes);
    const options = {
      attributes: s.attributes,
      image_url: s.image_url,
      external_sku_id: s.external_sku_id,
      sku_attr: s.external_sku_attr,
      source_id: sourceId,
    };
    const payload: Record<string, unknown> = {
      name,
      options,
      external_sku_id: s.external_sku_id,
      external_sku_attr: s.external_sku_attr,
      is_available: true,
    };
    if (s.weight_grams) payload.weight_grams = s.weight_grams;

    let row = byExternal.get(s.external_sku_id) ?? null;
    if (!row) {
      const adopted = adoptable.find((r) => !matchedIds.has(r.id));
      if (adopted) row = adopted;
    }

    let variantId: string;
    if (row) {
      const { error } = await admin.from("product_variants").update(payload).eq("id", row.id);
      if (error) {
        errors.push(`SKU ${s.external_sku_id}: falha ao atualizar variação (${error.message})`);
        continue;
      }
      variantId = row.id;
      matchedIds.add(row.id);
      updated += 1;
    } else {
      const sku = `AE-${sourceId}-${s.external_sku_id}`;
      const { data: ins, error } = await admin
        .from("product_variants")
        .insert({
          ...payload,
          product_id: productId,
          sku,
          is_default: rows.length === 0 && i === 0,
        })
        .select("id")
        .single();
      if (error || !ins) {
        errors.push(
          `SKU ${s.external_sku_id}: falha ao criar variação (${error?.message ?? "sem retorno"})`,
        );
        continue;
      }
      variantId = ins.id;
      matchedIds.add(variantId);
      created += 1;
    }

    // Preço com markup da loja (mantém a mesma regra do importador).
    const listCents = computeSalePriceCents(s.cost_list ?? s.cost, "BRL", settings);
    const saleCents = s.cost_list ? computeSalePriceCents(s.cost, "BRL", settings) : 0;
    if (listCents > 0) {
      const { data: activePrice } = await admin
        .from("product_prices")
        .select("id")
        .eq("variant_id", variantId)
        .eq("is_active", true)
        .maybeSingle();
      const priceRow = {
        list_price_cents: listCents,
        sale_price_cents: saleCents > 0 && saleCents < listCents ? saleCents : null,
        is_active: true,
      };
      const { error: priceErr } = activePrice?.id
        ? await admin.from("product_prices").update(priceRow).eq("id", activePrice.id)
        : await admin.from("product_prices").insert({ variant_id: variantId, ...priceRow });
      if (priceErr) {
        errors.push(`SKU ${s.external_sku_id}: falha ao gravar preço (${priceErr.message})`);
      }
    }

    const { error: invErr } = await admin
      .from("product_inventory")
      .upsert({ variant_id: variantId, stock: s.stock }, { onConflict: "variant_id" });
    if (invErr) {
      errors.push(`SKU ${s.external_sku_id}: falha ao gravar estoque (${invErr.message})`);
    }
  }

  // SKUs que não vieram mais do fornecedor → indisponíveis (nunca excluídos).
  const stale = rows.filter((r) => !matchedIds.has(r.id));
  for (const r of stale) {
    await admin
      .from("product_variants")
      .update({ is_available: false, is_default: false })
      .eq("id", r.id);
    await admin
      .from("product_inventory")
      .upsert({ variant_id: r.id, stock: 0 }, { onConflict: "variant_id" });
  }

  // Garante uma variação padrão entre as disponíveis.
  const { data: after } = await admin
    .from("product_variants")
    .select("id, is_default, is_available")
    .eq("product_id", productId);
  const available = (after ?? []).filter((v: any) => v.is_available);
  if (available.length > 0 && !available.some((v: any) => v.is_default)) {
    await admin.from("product_variants").update({ is_default: true }).eq("id", available[0].id);
  }

  return {
    source_id: sourceId,
    total_skus: skus.length,
    created,
    updated,
    unavailable: stale.length,
    errors,
  };
}
