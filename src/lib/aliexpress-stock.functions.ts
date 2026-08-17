import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callAli } from "./aliexpress-discovery.functions";

/* eslint-disable @typescript-eslint/no-explicit-any */

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
  costBrlCents: number | null;
  priceBrlCents: number | null;
}> {
  const json = await callAli("aliexpress.ds.product.get", {
    product_id: productId,
    ship_to_country: "BR",
    target_currency: "BRL",
    target_language: "PT",
  }, credentialClient);
  const root =
    (json as any).aliexpress_ds_product_get_response ??
    (json as any).aliexpress_ds_productdetail_get_response ??
    json;
  const result = (root as any).result ?? root;
  const skusBlock = result.ae_item_sku_info_dtos ?? result.skus ?? {};
  const skus: any[] = Array.isArray(skusBlock?.ae_item_sku_info_d_t_o)
    ? skusBlock.ae_item_sku_info_d_t_o
    : Array.isArray(skusBlock)
      ? skusBlock
      : [];

  const bySku: Record<string, number> = {};
  let total = 0;
  const priceCandidates: number[] = [];
  const parsePrice = (v: unknown): number | null => {
    if (v == null) return null;
    const s = String(v).replace(/[^\d.,-]/g, "").replace(",", ".");
    const n = parseFloat(s);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
  };
  for (const s of skus) {
    const stock = num(
      s.sku_available_stock ?? s.available_stock ?? s.sku_stock ?? s.stock ?? s.inventory,
    );
    total += stock;
    const code = String(s.sku_code ?? s.sku_id ?? "").trim();
    if (code) bySku[code] = stock;
    const p = parsePrice(
      s.offer_sale_price ?? s.sku_price ?? s.offer_bulk_sale_price ?? s.price,
    );
    if (p != null) priceCandidates.push(p);
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
  return { total, bySku, costBrlCents: productPrice, priceBrlCents: productPrice };
}

// Alias de compatibilidade para chamadas antigas.
async function fetchAliexpressStock(productId: string) {
  const r = await fetchAliexpressLive(productId);
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
      .in("source", ["aliexpress", "aliexpress_api"])
      .not("source_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!imp?.source_id) {
      // Produto sem vínculo AliExpress: não é erro, apenas não há o que sincronizar.
      return {
        skipped: true as const,
        reason: "Produto não está conectado ao AliExpress.",
        source_id: null,
        total_stock: 0,
        variants_updated: 0,
      };
    }

    const { total, bySku, costBrlCents } = await fetchAliexpressLive(imp.source_id, db);

    const { data: variants } = await db
      .from("product_variants")
      .select("id, sku, is_default")
      .eq("product_id", data.product_id);

    const rows: { variant_id: string; stock: number }[] = [];
    if (variants && variants.length > 0) {
      const single = variants.length === 1;
      for (const v of variants) {
        const matched = v.sku && bySku[v.sku] != null ? bySku[v.sku] : null;
        const stock = matched != null ? matched : single || v.is_default ? total : 0;
        rows.push({ variant_id: v.id, stock: Math.max(0, stock) });
      }
    }

    if (rows.length > 0) {
      await db
        .from("product_inventory")
        .upsert(rows, { onConflict: "variant_id" });
    }

    // Registra custo (BRL) em pricing_calculations para exibir no admin.
    if (costBrlCents && costBrlCents > 0) {
      await db.from("pricing_calculations").insert({
        product_id: data.product_id,
        cost_cents: costBrlCents,
        suggested_price_cents: costBrlCents,
        final_price_cents: costBrlCents,
        margin_pct: 0,
        breakdown: { source: "aliexpress_live", synced_at: new Date().toISOString() },
        applied: false,
      } as any);
    }

    // Marca a última sincronização no import.
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
    const { db } = await import("@/integrations/supabase/client.server");
    db = db;
  }
  const { data: imports } = await db
    .from("product_imports")
    .select("product_id, source_id")
    .in("source", ["aliexpress", "aliexpress_api"])
    .not("product_id", "is", null)
    .not("source_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  const seen = new Set<string>();
  const list = (imports ?? []).filter((r) => {
    const key = r.product_id!;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  let ok = 0;
  const errors: { product_id: string; error: string }[] = [];

  // Concorrência controlada (4 requests em paralelo) para respeitar rate-limit.
  let cursor = 0;
  const workers = Array.from({ length: Math.min(4, list.length) }, async () => {
    while (cursor < list.length) {
      const row = list[cursor++];
      try {
        const { total, bySku, costBrlCents } = await fetchAliexpressLive(row.source_id!, db);
        const { data: variants } = await db
          .from("product_variants")
          .select("id, sku, is_default")
          .eq("product_id", row.product_id!);
        if (variants && variants.length > 0) {
          const single = variants.length === 1;
          const rows = variants.map((v) => {
            const matched = v.sku && bySku[v.sku] != null ? bySku[v.sku] : null;
            const stock = matched != null ? matched : single || v.is_default ? total : 0;
            return { variant_id: v.id, stock: Math.max(0, stock) };
          });
          await db
            .from("product_inventory")
            .upsert(rows, { onConflict: "variant_id" });
        }
        if (costBrlCents && costBrlCents > 0) {
          await db.from("pricing_calculations").insert({
            product_id: row.product_id!,
            cost_cents: costBrlCents,
            suggested_price_cents: costBrlCents,
            final_price_cents: costBrlCents,
            margin_pct: 0,
            breakdown: { source: "aliexpress_live", synced_at: new Date().toISOString() },
            applied: false,
          } as any);
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
