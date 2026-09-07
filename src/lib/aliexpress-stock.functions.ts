import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callAli } from "./aliexpress-discovery.functions";
import { parseSkus } from "./aliexpress-variants.server";

/* eslint-disable @typescript-eslint/no-explicit-any */

const ALI_SOURCES = ["aliexpress", "aliexpress_api", "aliexpress_url"];
const FALLBACK_PRICING = { markup_percent: 150, markup_fixed_cents: 0, round_to_99: true };

async function loadFallbackPricing(db: any) {
  const { data } = await db.from("integrations").select("config").eq("provider", "aliexpress").maybeSingle();
  const raw = (data?.config as any)?.import_settings ?? data?.config ?? {};
  return {
    markup_percent: Number(raw.markup_percent ?? 150),
    markup_fixed_cents: Number(raw.markup_fixed_cents ?? 0),
    round_to_99: raw.round_to_99 !== false,
  };
}

async function assertCatalog(context: any) {
  const { data: adm } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
  if (adm) return;
  const { data: hasCat } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "catalog",
  });
  if (!hasCat) throw new Error("Acesso restrito a administradores ou equipe de catálogo");
}

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseInt(v.replace(/[^\d-]/g, ""), 10);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

/**
 * Faz uma chamada à API AliExpress DS para obter estoque + preço/custo atual
 * do produto (em BRL, moeda alvo BR). Retorna também mapa SKU→estoque.
 */
async function fetchAliexpressLive(productId: string, credentialClient?: any): Promise<{
  total: number;
  bySku: Record<string, number>;
  costBySku: Record<string, number>;
  costBrlCents: number | null;
  priceBrlCents: number | null;
}> {
  const json = await callAli("aliexpress.ds.product.get", {
    product_id: productId,
    ship_to_country: "BR",
    target_currency: "BRL",
    target_language: "PT",
  }, credentialClient);
  const root = (json as any).aliexpress_ds_product_get_response ?? (json as any).aliexpress_ds_productdetail_get_response ?? json;
  const result = (root as any).result ?? root;
  const skus = parseSkus(json);

  const bySku: Record<string, number> = {};
  const costBySku: Record<string, number> = {};
  let total = 0;
  const priceCandidates: number[] = [];
  const parsePrice = (v: unknown): number | null => {
    if (v == null) return null;
    const s = String(v).replace(/[^\d.,-]/g, "").replace(",", ".");
    const n = parseFloat(s);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
  };
  for (const s of skus) {
    const stock = s.stock;
    total += stock;
    const ids = [s.external_sku_id, s.sku_code, s.external_sku_attr].filter((value): value is string => Boolean(value));
    for (const id of ids) bySku[id] = stock;
    const p = s.cost == null ? null : Math.round(s.cost * 100);
    if (p != null) priceCandidates.push(p);
    if (p != null) for (const id of ids) costBySku[id] = p;
  }
  if (total === 0) {
    total = num(result.total_available_stock ?? result.stock ?? result.available_stock);
  }
  // Fallbacks a nível de produto (quando não vieram SKUs individuais).
  const productPriceInfo =
    result.ae_item_base_info_dto ?? result.ae_multimedia_info_dto ?? result;
  const productPrice =
    parsePrice(
      productPriceInfo.sale_price ??
        productPriceInfo.offer_sale_price ??
        productPriceInfo.min_amount ??
        result.min_amount ??
        result.sale_price,
    ) ??
    (priceCandidates.length > 0 ? Math.min(...priceCandidates) : null);
  return { total, bySku, costBySku, costBrlCents: productPrice, priceBrlCents: productPrice };
}

// Alias de compatibilidade para chamadas antigas.
async function fetchAliexpressStock(productId: string, credentialClient?: any) {
  const r = await fetchAliexpressLive(productId, credentialClient);
  return { total: r.total, bySku: r.bySku };
}

/**
 * Sincroniza o estoque de UM produto conectado ao AliExpress.
 * - Localiza `product_imports` com o produto para descobrir o `source_id` AliExpress.
 * - Atualiza `product_inventory` de todas as variantes (match por SKU quando disponível,
 *   caso contrário divide o total ou aplica ao default).
 */
export const syncAliexpressStock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ product_id: z.string().uuid() }).parse(v),
  )
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const db = context.supabase;

    const { data: imp } = await db
      .from("product_imports")
      .select("source_id, source")
      .eq("product_id", data.product_id)
      .in("source", ALI_SOURCES)
      .not("source_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!imp?.source_id) {
      return {
        skipped: true as const,
        reason: "Produto não está conectado ao AliExpress.",
        source_id: null,
        total_stock: 0,
        variants_updated: 0,
      };
    }

    const { total, bySku, costBySku, costBrlCents } = await fetchAliexpressLive(imp.source_id, db);

    const { data: variants } = await db
      .from("product_variants")
      .select("id, sku, external_sku_id, external_sku_attr, is_default, options")
      .eq("product_id", data.product_id);

    const rows: { variant_id: string; stock: number }[] = [];
    if (variants && variants.length > 0) {
      const single = variants.length === 1;
      for (const v of variants) {
        const matchKey = [v.external_sku_id, v.external_sku_attr, v.sku].find((key) => key && bySku[key] != null);
        const matched = matchKey ? bySku[matchKey] : null;
        const stock = matched != null ? matched : single && Object.keys(bySku).length === 0 ? total : null;
        if (stock != null) rows.push({ variant_id: v.id, stock: Math.max(0, stock) });
      }
    }

    if (rows.length > 0) {
      await db
        .from("product_inventory")
        .upsert(rows, { onConflict: "variant_id" });
    }

    await db
      .from("product_imports")
      .update({
        raw_data: {
          ...(imp as any).raw_data,
          last_stock_sync_at: new Date().toISOString(),
          last_stock_total: total,
        } as any,
      } as any)
      .eq("product_id", data.product_id)
      .eq("source_id", imp.source_id);

    return {
      skipped: false as const,
      reason: null,
      source_id: imp.source_id,
      total_stock: total,
      variants_updated: rows.length,
    };
  });

/**
 * Sincroniza o estoque de TODOS os produtos importados do AliExpress.
 * Rodar sob demanda (admin) ou via cron endpoint.
 */
export const syncAllAliexpressStock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({ limit: z.number().int().min(1).max(500).default(200) })
      .parse(v ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    return await runBulkSync(data.limit, context.supabase);
  });

export async function runBulkSync(limit: number, client?: any) {
  let db = client;
  if (!db) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    db = supabaseAdmin;
  }
  const { data: imports } = await db
    .from("product_imports")
    .select("product_id, source_id")
    .in("source", ALI_SOURCES)
    .not("product_id", "is", null)
    .not("source_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  const seen = new Set<string>();
  const list = (imports ?? []).filter((r: any) => {
    const key = r.product_id!;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  let ok = 0;
  const errors: { product_id: string; error: string }[] = [];

  let cursor = 0;
  const workers = Array.from({ length: Math.min(4, list.length) }, async () => {
    while (cursor < list.length) {
      const row = list[cursor++];
      try {
        const { total, bySku, costBySku, costBrlCents } = await fetchAliexpressLive(row.source_id!, db);
        const { data: variants } = await db
          .from("product_variants")
            .select("id, sku, external_sku_id, external_sku_attr, is_default, options")
          .eq("product_id", row.product_id!);
        if (variants && variants.length > 0) {
          const single = variants.length === 1;
          const rows = variants.map((v: any) => {
            const matchKey = [v.external_sku_id, v.external_sku_attr, v.sku].find((key) => key && bySku[key] != null);
            const matched = matchKey ? bySku[matchKey] : null;
            const stock = matched != null ? matched : single && Object.keys(bySku).length === 0 ? total : null;
            return stock == null ? null : { variant_id: v.id, stock: Math.max(0, stock) };
          }).filter((row: { variant_id: string; stock: number } | null): row is { variant_id: string; stock: number } => row != null);
          if (rows.length > 0) {
            await db
              .from("product_inventory")
              .upsert(rows, { onConflict: "variant_id" });
          }
        }
        ok += 1;
      } catch (e) {
        errors.push({
          product_id: row.product_id!,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  });
  await Promise.all(workers);

  return { total: list.length, updated: ok, errors };
}
