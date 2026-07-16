import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

// ============ SCORING ============

type ScoreComponent = {
  key: string;
  label: string;
  weight: number;
  raw_value: number | null;
  normalized: number;
  source: string;
  notes?: string;
};

function clamp(v: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, v));
}

export const computeProductScore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ product_id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: product } = await supabaseAdmin
      .from("products")
      .select(
        `id, name, description, status, is_featured,
         media:product_media(id),
         variants:product_variants(id, is_default,
           prices:product_prices(list_price_cents, sale_price_cents, is_active),
           inventory:product_inventory(stock)
         ),
         reviews:product_reviews(rating),
         seo:product_seo(title, description, keywords),
         costs:pricing_cost_components(amount_cents)`,
      )
      .eq("id", data.product_id)
      .maybeSingle();

    if (!product) throw new Error("Produto não encontrado");

    const p: any = product;
    const mediaCount = p.media?.length ?? 0;
    const descLen = (p.description ?? "").length;
    const seoRow = Array.isArray(p.seo) ? p.seo[0] : p.seo;
    const hasSEO = !!(seoRow?.title && seoRow?.description);
    const reviews = p.reviews ?? [];
    const avgRating = reviews.length
      ? reviews.reduce((s: number, r: any) => s + Number(r.rating ?? 0), 0) / reviews.length
      : 0;

    const defVar = p.variants?.find((v: any) => v.is_default) ?? p.variants?.[0];
    const invRow = Array.isArray(defVar?.inventory) ? defVar.inventory[0] : defVar?.inventory;
    const stock = invRow?.stock ?? 0;
    const activePrice = defVar?.prices?.find((pr: any) => pr.is_active);
    const priceCents = activePrice?.sale_price_cents ?? activePrice?.list_price_cents ?? 0;
    const costCents = (p.costs ?? []).reduce((s: number, c: any) => s + (c.amount_cents ?? 0), 0);
    const marginPct = priceCents > 0 ? ((priceCents - costCents) / priceCents) * 100 : 0;

    const { count: favCount } = await supabaseAdmin
      .from("favorites")
      .select("product_id", { count: "exact", head: true })
      .eq("product_id", data.product_id);

    // Components
    const comps: ScoreComponent[] = [];
    // Quality (25%)
    const qMedia = clamp(mediaCount * 20);
    const qDesc = clamp((descLen / 400) * 100);
    const qSeo = hasSEO ? 100 : 0;
    const quality = Math.round((qMedia * 0.5 + qDesc * 0.3 + qSeo * 0.2));
    comps.push({ key: "quality_media", label: "Mídias", weight: 12.5, raw_value: mediaCount, normalized: qMedia, source: "product_media" });
    comps.push({ key: "quality_desc", label: "Descrição", weight: 7.5, raw_value: descLen, normalized: qDesc, source: "products.description" });
    comps.push({ key: "quality_seo", label: "SEO configurado", weight: 5, raw_value: hasSEO ? 1 : 0, normalized: qSeo, source: "product_seo" });

    // Demand (20%)
    const dFav = clamp((favCount ?? 0) * 10);
    const dFeatured = p.is_featured ? 100 : 40;
    const demand = Math.round(dFav * 0.6 + dFeatured * 0.4);
    comps.push({ key: "demand_favorites", label: "Favoritos", weight: 12, raw_value: favCount ?? 0, normalized: dFav, source: "favorites" });
    comps.push({ key: "demand_featured", label: "Em destaque", weight: 8, raw_value: p.is_featured ? 1 : 0, normalized: dFeatured, source: "products.is_featured" });

    // Margin (25%)
    const margin = clamp(marginPct * 1.5);
    comps.push({ key: "margin_pct", label: "Margem", weight: 25, raw_value: Math.round(marginPct * 100) / 100, normalized: margin, source: "pricing_cost_components" });

    // Competitiveness (15%)
    const cRating = clamp((avgRating / 5) * 100);
    const cReviews = clamp(reviews.length * 20);
    const competitiveness = Math.round(cRating * 0.6 + cReviews * 0.4);
    comps.push({ key: "comp_rating", label: "Avaliação média", weight: 9, raw_value: Math.round(avgRating * 100) / 100, normalized: cRating, source: "product_reviews" });
    comps.push({ key: "comp_reviews", label: "Volume de avaliações", weight: 6, raw_value: reviews.length, normalized: cReviews, source: "product_reviews" });

    // Risk inverse (15%): higher = safer
    const rStock = stock >= 5 ? 100 : stock > 0 ? 50 : 0;
    const rStatus = p.status === "active" ? 100 : 40;
    const risk = Math.round(rStock * 0.6 + rStatus * 0.4);
    comps.push({ key: "risk_stock", label: "Estoque", weight: 9, raw_value: stock, normalized: rStock, source: "product_inventory" });
    comps.push({ key: "risk_status", label: "Status", weight: 6, raw_value: p.status === "active" ? 1 : 0, normalized: rStatus, source: "products.status" });

    const overall = Math.round(
      quality * 0.25 + demand * 0.20 + margin * 0.25 + competitiveness * 0.15 + risk * 0.15,
    );

    const label =
      overall >= 80 ? "Excelente" :
      overall >= 60 ? "Promissor" :
      overall >= 40 ? "Requer atenção" : "Crítico";

    const recommendations: string[] = [];
    if (mediaCount < 3) recommendations.push("Adicionar pelo menos 3 imagens.");
    if (descLen < 200) recommendations.push("Ampliar descrição para 200+ caracteres.");
    if (!hasSEO) recommendations.push("Preencher SEO (title/description).");
    if (marginPct < 40) recommendations.push("Revisar precificação — margem baixa.");
    if (stock < 5) recommendations.push("Repor estoque.");
    if (!reviews.length) recommendations.push("Solicitar avaliações a clientes.");

    // Upsert score
    const { data: existing } = await supabaseAdmin
      .from("product_scores")
      .select("id")
      .eq("product_id", data.product_id)
      .maybeSingle();

    const scorePayload = {
      product_id: data.product_id,
      overall,
      quality,
      demand,
      margin,
      competitiveness,
      risk,
      label,
      recommendation: recommendations.join(" "),
      computed_at: new Date().toISOString(),
    };

    let scoreId: string;
    if (existing) {
      scoreId = existing.id;
      await supabaseAdmin.from("product_scores").update(scorePayload).eq("id", scoreId);
      await supabaseAdmin.from("product_score_components").delete().eq("score_id", scoreId);
    } else {
      const { data: inserted } = await supabaseAdmin
        .from("product_scores")
        .insert(scorePayload)
        .select("id")
        .single();
      scoreId = inserted!.id;
    }

    await supabaseAdmin.from("product_score_components").insert(
      comps.map((c) => ({ score_id: scoreId, ...c })),
    );

    await supabaseAdmin.from("product_score_versions").insert({
      product_id: data.product_id,
      overall,
      snapshot: { score: scorePayload, components: comps, recommendations },
      computed_by: context.userId,
    });

    return { overall, quality, demand, margin, competitiveness, risk, label, components: comps, recommendations };
  });

export const getProductIntelligence = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ product_id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: product }, { data: score }, { data: costs }, { data: rules }, { data: calcs }] =
      await Promise.all([
        supabaseAdmin
          .from("products")
          .select(
            `id, name, slug, status, category_id, brand_id,
             variants:product_variants(id, is_default,
               prices:product_prices(id, list_price_cents, sale_price_cents, is_active)
             )`,
          )
          .eq("id", data.product_id)
          .maybeSingle(),
        supabaseAdmin
          .from("product_scores")
          .select("*, components:product_score_components(*)")
          .eq("product_id", data.product_id)
          .maybeSingle(),
        supabaseAdmin
          .from("pricing_cost_components")
          .select("*")
          .eq("product_id", data.product_id)
          .order("created_at", { ascending: true }),
        supabaseAdmin.from("pricing_rules").select("*").eq("is_active", true).order("priority"),
        supabaseAdmin
          .from("pricing_calculations")
          .select("*")
          .eq("product_id", data.product_id)
          .order("computed_at", { ascending: false })
          .limit(20),
      ]);

    return { product, score, costs: costs ?? [], rules: rules ?? [], calculations: calcs ?? [] };
  });

// ============ COST COMPONENTS ============

export const saveCostComponents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        product_id: z.string().uuid(),
        components: z.array(
          z.object({
            key: z.string().min(1),
            label: z.string().min(1),
            amount_cents: z.number().int().min(0),
            pct_of_price: z.number().nullable().optional(),
            notes: z.string().nullable().optional(),
          }),
        ),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("pricing_cost_components").delete().eq("product_id", data.product_id);
    if (data.components.length) {
      const { error } = await supabaseAdmin
        .from("pricing_cost_components")
        .insert(data.components.map((c) => ({ product_id: data.product_id, ...c })));
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// ============ PRICING RULES ============

export const listPricingRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertCatalog(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("pricing_rules").select("*").order("priority");
    return data ?? [];
  });

const RuleInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  is_default: z.boolean().default(false),
  is_active: z.boolean().default(true),
  markup_pct: z.number().min(0),
  fixed_fee_cents: z.number().int().min(0).default(0),
  rounding: z.enum(["none", "psychological_99", "psychological_90", "nearest_1", "nearest_5"]),
  min_margin_pct: z.number().nullable().optional(),
  max_margin_pct: z.number().nullable().optional(),
  applies_to_category_id: z.string().uuid().nullable().optional(),
  applies_to_brand_id: z.string().uuid().nullable().optional(),
  priority: z.number().int().default(100),
});

export const upsertPricingRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => RuleInput.parse(v))
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.is_default) {
      await supabaseAdmin.from("pricing_rules").update({ is_default: false }).eq("is_default", true);
    }
    if (data.id) {
      const { error } = await supabaseAdmin.from("pricing_rules").update(data).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: inserted, error } = await supabaseAdmin
      .from("pricing_rules")
      .insert(data)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted!.id };
  });

export const deletePricingRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("pricing_rules").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ PRICE SIMULATION ============

function applyRounding(cents: number, mode: string): number {
  const value = cents / 100;
  switch (mode) {
    case "psychological_99":
      return Math.floor(value) * 100 + 99;
    case "psychological_90":
      return Math.floor(value) * 100 + 90;
    case "nearest_1":
      return Math.round(value) * 100;
    case "nearest_5":
      return Math.round(value / 5) * 500;
    default:
      return Math.round(cents);
  }
}

export const simulatePrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        product_id: z.string().uuid(),
        rule_id: z.string().uuid().nullable().optional(),
        override_markup_pct: z.number().nullable().optional(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: costs } = await supabaseAdmin
      .from("pricing_cost_components")
      .select("*")
      .eq("product_id", data.product_id);
    const totalCost = (costs ?? []).reduce((s, c) => s + (c.amount_cents ?? 0), 0);

    let rule: any = null;
    if (data.rule_id) {
      const { data: r } = await supabaseAdmin.from("pricing_rules").select("*").eq("id", data.rule_id).maybeSingle();
      rule = r;
    } else {
      const { data: r } = await supabaseAdmin
        .from("pricing_rules")
        .select("*")
        .eq("is_default", true)
        .eq("is_active", true)
        .maybeSingle();
      rule = r;
    }

    const markupPct = data.override_markup_pct ?? rule?.markup_pct ?? 100;
    const fixedFee = rule?.fixed_fee_cents ?? 0;
    const rounding = rule?.rounding ?? "psychological_99";

    const withMarkup = Math.round(totalCost * (1 + markupPct / 100)) + fixedFee;
    const suggested = withMarkup;
    let final = applyRounding(withMarkup, rounding);
    if (final < totalCost) final = withMarkup;

    const marginPct = final > 0 ? ((final - totalCost) / final) * 100 : 0;

    const breakdown = {
      costs: costs ?? [],
      total_cost_cents: totalCost,
      rule_id: rule?.id ?? null,
      rule_name: rule?.name ?? "sem regra",
      markup_pct: markupPct,
      fixed_fee_cents: fixedFee,
      rounding,
      suggested_before_rounding: suggested,
    };

    return {
      cost_cents: totalCost,
      suggested_price_cents: suggested,
      final_price_cents: final,
      margin_pct: Math.round(marginPct * 100) / 100,
      breakdown,
      rule_used: rule,
    };
  });

export const applyPriceToProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        product_id: z.string().uuid(),
        rule_id: z.string().uuid().nullable().optional(),
        override_markup_pct: z.number().nullable().optional(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Reuse simulate logic inline
    const { data: costs } = await supabaseAdmin
      .from("pricing_cost_components")
      .select("*")
      .eq("product_id", data.product_id);
    const totalCost = (costs ?? []).reduce((s, c) => s + (c.amount_cents ?? 0), 0);

    let rule: any = null;
    if (data.rule_id) {
      const { data: r } = await supabaseAdmin.from("pricing_rules").select("*").eq("id", data.rule_id).maybeSingle();
      rule = r;
    } else {
      const { data: r } = await supabaseAdmin
        .from("pricing_rules")
        .select("*")
        .eq("is_default", true)
        .eq("is_active", true)
        .maybeSingle();
      rule = r;
    }

    const markupPct = data.override_markup_pct ?? rule?.markup_pct ?? 100;
    const fixedFee = rule?.fixed_fee_cents ?? 0;
    const rounding = rule?.rounding ?? "psychological_99";
    const withMarkup = Math.round(totalCost * (1 + markupPct / 100)) + fixedFee;
    let final = applyRounding(withMarkup, rounding);
    if (final < totalCost) final = withMarkup;
    const marginPct = final > 0 ? ((final - totalCost) / final) * 100 : 0;

    // Find default variant / active price
    const { data: variants } = await supabaseAdmin
      .from("product_variants")
      .select("id, is_default, prices:product_prices(id, is_active)")
      .eq("product_id", data.product_id);
    const def = variants?.find((v) => v.is_default) ?? variants?.[0];
    if (!def) throw new Error("Produto não tem variantes");
    const activePrice = def.prices?.find((p: any) => p.is_active);

    if (activePrice) {
      await supabaseAdmin
        .from("product_prices")
        .update({ list_price_cents: final, sale_price_cents: null })
        .eq("id", activePrice.id);
    } else {
      await supabaseAdmin.from("product_prices").insert({
        variant_id: def.id,
        list_price_cents: final,
        currency: "BRL",
        is_active: true,
      });
    }

    await supabaseAdmin.from("pricing_calculations").insert({
      product_id: data.product_id,
      rule_id: rule?.id ?? null,
      cost_cents: totalCost,
      suggested_price_cents: withMarkup,
      final_price_cents: final,
      margin_pct: marginPct,
      breakdown: { rule, markup_pct: markupPct, fixed_fee: fixedFee, rounding, costs: costs ?? [] },
      applied: true,
      computed_by: context.userId,
    });

    return { final_price_cents: final, margin_pct: Math.round(marginPct * 100) / 100 };
  });

// ============ LIST FOR DASHBOARD ============

export const listProductsWithScores = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertCatalog(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("products")
      .select(
        `id, name, slug, status,
         score:product_scores(overall, label, computed_at)`,
      )
      .order("updated_at", { ascending: false })
      .limit(200);
    return (data ?? []).map((p: any) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      status: p.status,
      score: p.score?.[0] ?? p.score ?? null,
    }));
  });
