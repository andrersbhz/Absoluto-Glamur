import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertCatalog(context: any) {
  const { data: admin } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
  if (admin) return;
  const { data: catalog } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "catalog" });
  if (!catalog) throw new Error("Acesso restrito à equipe de catálogo");
}

export const saveMarketMetrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => z.object({
    product_id: z.string().uuid(),
    external_sales: z.number().int().min(0).default(0),
    sales_7d: z.number().int().min(0).default(0),
    sales_30d: z.number().int().min(0).default(0),
    sales_90d: z.number().int().min(0).default(0),
    growth_7d_pct: z.number().nullable().optional(),
    growth_30d_pct: z.number().nullable().optional(),
    growth_90d_pct: z.number().nullable().optional(),
    supplier_score: z.number().min(0).max(100).nullable().optional(),
    shipping_score: z.number().min(0).max(100).nullable().optional(),
    competition_score: z.number().min(0).max(100).nullable().optional(),
    source: z.string().default("manual"),
    data_points: z.number().int().min(0).default(0),
    raw: z.record(z.string(), z.unknown()).default({}),
  }).parse(value))
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const db = context.supabase;
    const trend = clamp(
      Math.max(0, data.growth_7d_pct ?? 0) * 0.9 +
      Math.max(0, data.growth_30d_pct ?? 0) * 0.55 +
      Math.max(0, data.growth_90d_pct ?? 0) * 0.25,
    );
    const { error } = await db.from("product_market_metrics").upsert({
      ...data,
      raw: (data.raw ?? {}) as never,
      trend_score: trend,
      captured_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "product_id" });
    if (error) throw new Error(error.message);
    return { ok: true, trend_score: trend };
  });

export const computeGrowthScore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => z.object({ product_id: z.string().uuid() }).parse(value))
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const db = context.supabase;

    const [productRes, metricsRes, costsRes, favoriteRes] = await Promise.all([
      db.from("products").select(`
        id, name, status, rating_avg, rating_count,
        variants:product_variants(id, is_default, prices:product_prices(list_price_cents, sale_price_cents, is_active), inventory:product_inventory(stock))
      `).eq("id", data.product_id).maybeSingle(),
      db.from("product_market_metrics").select("*").eq("product_id", data.product_id).maybeSingle(),
      db.from("pricing_cost_components").select("amount_cents").eq("product_id", data.product_id),
      db.from("favorites").select("product_id", { count: "exact", head: true }).eq("product_id", data.product_id),
    ]);

    if (productRes.error) throw new Error(productRes.error.message);
    if (metricsRes.error) throw new Error(metricsRes.error.message);
    if (costsRes.error) throw new Error(costsRes.error.message);
    if (favoriteRes.error) throw new Error(favoriteRes.error.message);
    if (!productRes.data) throw new Error("Produto não encontrado");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const product: any = productRes.data;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const metrics: any = metricsRes.data ?? {};
    const variant = product.variants?.find((v: { is_default: boolean }) => v.is_default) ?? product.variants?.[0];
    const priceRow = variant?.prices?.find((p: { is_active: boolean }) => p.is_active) ?? variant?.prices?.[0];
    const price = Number(priceRow?.sale_price_cents ?? priceRow?.list_price_cents ?? 0);
    const cost = (costsRes.data ?? []).reduce((sum, row) => sum + Number(row.amount_cents ?? 0), 0);
    const marginPct = price > 0 ? ((price - cost) / price) * 100 : 0;
    const stock = Number(variant?.inventory?.[0]?.stock ?? variant?.inventory?.stock ?? 0);

    const demand = clamp(
      Math.log10(Number(metrics.external_sales ?? 0) + 1) * 18 +
      Math.log10(Number(product.rating_count ?? 0) + 1) * 14 +
      Math.min(20, Number(favoriteRes.count ?? 0) * 2),
    );
    const rating = clamp((Number(product.rating_avg ?? 0) / 5) * 100);
    const trend = clamp(Number(metrics.trend_score ?? 0));
    const supplier = clamp(Number(metrics.supplier_score ?? 50));
    const shipping = clamp(Number(metrics.shipping_score ?? 50));
    const competition = clamp(100 - Number(metrics.competition_score ?? 50));
    const margin = clamp(marginPct * 1.8);
    const availability = stock >= 10 ? 100 : stock > 0 ? 60 : 0;

    const opportunity = clamp(
      demand * 0.25 + trend * 0.22 + rating * 0.13 + supplier * 0.12 + shipping * 0.10 + competition * 0.08 + availability * 0.10,
    );
    const commercial = clamp(margin * 0.45 + demand * 0.20 + shipping * 0.12 + supplier * 0.13 + availability * 0.10);
    const confidence = clamp(
      Math.min(50, Number(metrics.data_points ?? 0) * 2) +
      Math.min(25, Number(product.rating_count ?? 0) / 4) +
      (metrics.updated_at ? 15 : 0) +
      (Number(metrics.external_sales ?? 0) > 0 ? 10 : 0),
    );
    const overall = clamp(opportunity * 0.38 + commercial * 0.30 + trend * 0.20 + confidence * 0.12);

    const label = overall >= 85 ? "Explodindo" : overall >= 72 ? "Excelente oportunidade" : overall >= 60 ? "Promissor" : overall >= 45 ? "Observar" : "Baixa prioridade";
    const recommendations: string[] = [];
    if (trend >= 70) recommendations.push("Priorizar criativos e campanha: crescimento forte.");
    if (margin < 55) recommendations.push("Revisar preço/custos antes de escalar mídia.");
    if (shipping < 55) recommendations.push("Buscar opção de frete ou fornecedor melhor.");
    if (supplier < 60) recommendations.push("Validar fornecedor antes de aumentar volume.");
    if (competition < 45) recommendations.push("Concorrência elevada: diferenciar oferta e criativo.");
    if (confidence < 50) recommendations.push("Coletar mais dados antes de decisão agressiva.");

    const payload = {
      product_id: data.product_id,
      overall,
      opportunity,
      commercial,
      trend,
      confidence,
      quality: rating,
      demand,
      margin,
      competitiveness: competition,
      risk: clamp((supplier + shipping + availability) / 3),
      label,
      recommendation: recommendations.join(" "),
      computed_at: new Date().toISOString(),
    };

    const { error } = await db.from("product_scores").upsert(payload, { onConflict: "product_id" });
    if (error) throw new Error(error.message);

    const { error: versionError } = await db.from("product_score_versions").insert({
      product_id: data.product_id,
      overall,
      snapshot: {
        version: "1.2",
        scores: payload,
        metrics: {
          external_sales: metrics.external_sales ?? 0,
          growth_7d_pct: metrics.growth_7d_pct ?? null,
          growth_30d_pct: metrics.growth_30d_pct ?? null,
          growth_90d_pct: metrics.growth_90d_pct ?? null,
          supplier,
          shipping,
          competition,
          margin_pct: Math.round(marginPct * 100) / 100,
          stock,
        },
        recommendations,
      },
      computed_by: context.userId,
    });
    if (versionError) throw new Error(versionError.message);

    return { overall, opportunity, commercial, trend, confidence, label, margin_pct: Math.round(marginPct * 100) / 100, recommendations };
  });

export const listGrowthOpportunities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertCatalog(context);
    const db = context.supabase;
    const { data, error } = await db.from("products").select(`
      id, name, slug, status, rating_avg, rating_count,
      score:product_scores(overall, opportunity, commercial, trend, confidence, label, recommendation, computed_at),
      market:product_market_metrics(external_sales, growth_7d_pct, growth_30d_pct, growth_90d_pct, supplier_score, shipping_score, competition_score, updated_at)
    `).order("updated_at", { ascending: false }).limit(250);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      ...row,
      score: Array.isArray(row.score) ? row.score[0] ?? null : row.score,
      market: Array.isArray(row.market) ? row.market[0] ?? null : row.market,
    }));
  });
