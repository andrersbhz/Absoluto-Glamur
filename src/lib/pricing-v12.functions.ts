import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertCatalog(context: any) {
  const { data: admin } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
  if (admin) return;
  const { data: catalog } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "catalog" });
  if (!catalog) throw new Error("Acesso restrito à equipe de catálogo");
}

const pct = (base: number, percent: number) => Math.round(base * (percent / 100));
const round99 = (cents: number) => Math.max(99, Math.floor(cents / 100) * 100 + 99);

export const listPricingProfiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertCatalog(context);
    const db = context.supabase;
    const { data, error } = await db.from("pricing_profiles").select("*").order("is_default", { ascending: false }).order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const savePricingProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => z.object({
    id: z.string().uuid().optional(),
    name: z.string().min(1),
    is_default: z.boolean().default(false),
    enabled: z.boolean().default(true),
    gateway_pct: z.number().min(0).max(100),
    gateway_fixed_cents: z.number().int().min(0),
    tax_pct: z.number().min(0).max(100),
    fx_spread_pct: z.number().min(0).max(100),
    returns_pct: z.number().min(0).max(100),
    chargeback_pct: z.number().min(0).max(100),
    operational_pct: z.number().min(0).max(100),
    desired_margin_pct: z.number().min(1).max(90),
    target_ad_cost_pct: z.number().min(0).max(90),
    shipping_subsidy_cents: z.number().int().min(0),
    packaging_cents: z.number().int().min(0),
  }).parse(value))
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const db = context.supabase;
    if (data.is_default) await db.from("pricing_profiles").update({ is_default: false }).eq("is_default", true);
    const payload = { ...data, updated_at: new Date().toISOString() };
    if (data.id) {
      const { error } = await db.from("pricing_profiles").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: inserted, error } = await db.from("pricing_profiles").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { id: inserted.id };
  });

export const simulateProfessionalPrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => z.object({
    product_id: z.string().uuid(),
    profile_id: z.string().uuid().nullable().optional(),
    supplier_shipping_cents: z.number().int().min(0).default(0),
    discount_pct: z.number().min(0).max(90).default(0),
  }).parse(value))
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const db = context.supabase;

    const [costRes, profileRes] = await Promise.all([
      db.from("pricing_cost_components").select("key,label,amount_cents").eq("product_id", data.product_id),
      data.profile_id
        ? db.from("pricing_profiles").select("*").eq("id", data.profile_id).maybeSingle()
        : db.from("pricing_profiles").select("*").eq("is_default", true).eq("enabled", true).maybeSingle(),
    ]);
    if (costRes.error) throw new Error(costRes.error.message);
    if (profileRes.error) throw new Error(profileRes.error.message);
    const profile = profileRes.data;
    if (!profile) throw new Error("Configure um perfil de precificação v1.2");

    const baseProductCost = (costRes.data ?? []).reduce((sum, row) => sum + Number(row.amount_cents ?? 0), 0);
    const landedBase = baseProductCost + data.supplier_shipping_cents + Number(profile.packaging_cents ?? 0) + Number(profile.shipping_subsidy_cents ?? 0);
    const landedWithFx = landedBase + pct(landedBase, Number(profile.fx_spread_pct ?? 0));

    const variablePct =
      Number(profile.gateway_pct ?? 0) + Number(profile.tax_pct ?? 0) + Number(profile.returns_pct ?? 0) +
      Number(profile.chargeback_pct ?? 0) + Number(profile.operational_pct ?? 0) +
      Number(profile.target_ad_cost_pct ?? 0) + Number(profile.desired_margin_pct ?? 0);
    if (variablePct >= 95) throw new Error("A soma de custos percentuais e margem está alta demais para calcular um preço sustentável.");

    const breakEvenRaw = Math.ceil((landedWithFx + Number(profile.gateway_fixed_cents ?? 0)) / (1 - (variablePct - Number(profile.desired_margin_pct ?? 0)) / 100));
    const recommendedRaw = Math.ceil((landedWithFx + Number(profile.gateway_fixed_cents ?? 0)) / (1 - variablePct / 100));
    const minimumPrice = round99(breakEvenRaw);
    const recommendedPrice = round99(recommendedRaw);
    const listPrice = round99(Math.ceil(recommendedPrice / 0.9));
    const promotionalPrice = round99(Math.max(minimumPrice, Math.round(recommendedPrice * (1 - data.discount_pct / 100))));

    const gatewayCost = pct(promotionalPrice, Number(profile.gateway_pct ?? 0)) + Number(profile.gateway_fixed_cents ?? 0);
    const taxCost = pct(promotionalPrice, Number(profile.tax_pct ?? 0));
    const returnReserve = pct(promotionalPrice, Number(profile.returns_pct ?? 0));
    const chargebackReserve = pct(promotionalPrice, Number(profile.chargeback_pct ?? 0));
    const operationalCost = pct(promotionalPrice, Number(profile.operational_pct ?? 0));
    const targetAdCost = pct(promotionalPrice, Number(profile.target_ad_cost_pct ?? 0));
    const nonAdCost = landedWithFx + gatewayCost + taxCost + returnReserve + chargebackReserve + operationalCost;
    const profitAfterTargetAd = promotionalPrice - nonAdCost - targetAdCost;
    const grossMarginPct = promotionalPrice > 0 ? ((promotionalPrice - nonAdCost) / promotionalPrice) * 100 : 0;
    const netMarginPct = promotionalPrice > 0 ? (profitAfterTargetAd / promotionalPrice) * 100 : 0;
    const maxCpa = Math.max(0, promotionalPrice - nonAdCost - Math.round(promotionalPrice * (Number(profile.desired_margin_pct ?? 0) / 100)));
    const breakEvenRoas = maxCpa > 0 ? promotionalPrice / maxCpa : 0;

    return {
      cost: {
        supplier_product_cents: baseProductCost,
        supplier_shipping_cents: data.supplier_shipping_cents,
        packaging_cents: Number(profile.packaging_cents ?? 0),
        shipping_subsidy_cents: Number(profile.shipping_subsidy_cents ?? 0),
        fx_spread_cents: landedWithFx - landedBase,
        landed_cost_cents: landedWithFx,
      },
      prices: {
        break_even_cents: minimumPrice,
        recommended_cents: recommendedPrice,
        promotional_cents: promotionalPrice,
        list_cents: listPrice,
      },
      economics: {
        gateway_cents: gatewayCost,
        tax_cents: taxCost,
        returns_reserve_cents: returnReserve,
        chargeback_reserve_cents: chargebackReserve,
        operational_cents: operationalCost,
        target_ad_cost_cents: targetAdCost,
        profit_after_target_ad_cents: profitAfterTargetAd,
        gross_margin_pct: Math.round(grossMarginPct * 100) / 100,
        net_margin_pct: Math.round(netMarginPct * 100) / 100,
        max_cpa_cents: maxCpa,
        break_even_roas: Math.round(breakEvenRoas * 100) / 100,
      },
      profile,
      components: costRes.data ?? [],
    };
  });
