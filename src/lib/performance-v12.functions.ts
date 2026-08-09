import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertMarketing(context: any) {
  const { data: admin } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
  if (admin) return;
  const { data: marketing } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "marketing" });
  if (!marketing) throw new Error("Acesso restrito à equipe de marketing");
}

export const saveMarketingSpend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => z.object({
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    channel: z.string().min(1),
    campaign: z.string().default(""),
    spend_cents: z.number().int().min(0),
    impressions: z.number().int().min(0).default(0),
    clicks: z.number().int().min(0).default(0),
    conversions: z.number().int().min(0).default(0),
    attributed_revenue_cents: z.number().int().min(0).default(0),
    source: z.string().default("manual"),
  }).parse(value))
  .handler(async ({ data, context }) => {
    await assertMarketing(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("marketing_spend_daily").upsert({ ...data, updated_at: new Date().toISOString() }, { onConflict: "day,channel,campaign" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getPerformanceV12 = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => z.object({ days: z.number().int().min(1).max(365).default(30) }).parse(value ?? { days: 30 }))
  .handler(async ({ data, context }) => {
    await assertMarketing(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sinceDate = new Date(Date.now() - (data.days - 1) * 24 * 3600 * 1000);
    const sinceIso = sinceDate.toISOString();
    const sinceDay = sinceIso.slice(0, 10);

    const [ordersRes, spendRes, eventsRes, abandonedRes, newCustomersRes] = await Promise.all([
      supabaseAdmin.from("orders").select("id,status,total_cents,paid_at,created_at").gte("created_at", sinceIso),
      supabaseAdmin.from("marketing_spend_daily").select("*").gte("day", sinceDay),
      supabaseAdmin.from("commerce_events").select("event_name,session_id,value_cents,channel,campaign,occurred_at").gte("occurred_at", sinceIso),
      supabaseAdmin.from("abandoned_checkouts").select("id,total_cents,recovered_at,last_seen_at,source").gte("last_seen_at", sinceIso),
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", sinceIso),
    ]);

    const orders = ordersRes.data ?? [];
    const paid = orders.filter((order) => order.status === "paid" || order.paid_at);
    const revenue = paid.reduce((sum, order) => sum + Number(order.total_cents ?? 0), 0);
    const spend = spendRes.data ?? [];
    const totalSpend = spend.reduce((sum, row) => sum + Number(row.spend_cents ?? 0), 0);
    const attributedRevenue = spend.reduce((sum, row) => sum + Number(row.attributed_revenue_cents ?? 0), 0);
    const events = eventsRes.data ?? [];

    const uniqueSessions = (name: string) => new Set(events.filter((event) => event.event_name === name).map((event) => event.session_id).filter(Boolean)).size;
    const addToCartSessions = uniqueSessions("add_to_cart");
    const checkoutSessions = uniqueSessions("begin_checkout");
    const purchaseSessions = Math.max(uniqueSessions("purchase"), paid.length);
    const productViewSessions = uniqueSessions("view_item");

    const abandoned = abandonedRes.data ?? [];
    const recovered = abandoned.filter((row) => row.recovered_at).length;
    const abandonedValue = abandoned.filter((row) => !row.recovered_at).reduce((sum, row) => sum + Number(row.total_cents ?? 0), 0);

    const channels = new Map<string, { spend_cents: number; attributed_revenue_cents: number; clicks: number; impressions: number; conversions: number }>();
    for (const row of spend) {
      const key = row.channel || "outros";
      const current = channels.get(key) ?? { spend_cents: 0, attributed_revenue_cents: 0, clicks: 0, impressions: 0, conversions: 0 };
      current.spend_cents += Number(row.spend_cents ?? 0);
      current.attributed_revenue_cents += Number(row.attributed_revenue_cents ?? 0);
      current.clicks += Number(row.clicks ?? 0);
      current.impressions += Number(row.impressions ?? 0);
      current.conversions += Number(row.conversions ?? 0);
      channels.set(key, current);
    }

    const newCustomers = newCustomersRes.count ?? 0;
    const roas = totalSpend > 0 ? (attributedRevenue || revenue) / totalSpend : 0;
    const mer = totalSpend > 0 ? revenue / totalSpend : 0;
    const cac = newCustomers > 0 ? totalSpend / newCustomers : 0;
    const conversion = productViewSessions > 0 ? purchaseSessions / productViewSessions : 0;
    const cartToCheckout = addToCartSessions > 0 ? checkoutSessions / addToCartSessions : 0;
    const checkoutToPurchase = checkoutSessions > 0 ? purchaseSessions / checkoutSessions : 0;
    const recoveryRate = abandoned.length > 0 ? recovered / abandoned.length : 0;

    return {
      period_days: data.days,
      revenue_cents: revenue,
      paid_orders: paid.length,
      ad_spend_cents: totalSpend,
      attributed_revenue_cents: attributedRevenue,
      roas: Math.round(roas * 100) / 100,
      mer: Math.round(mer * 100) / 100,
      cac_cents: Math.round(cac),
      new_customers: newCustomers,
      funnel: {
        product_view_sessions: productViewSessions,
        add_to_cart_sessions: addToCartSessions,
        checkout_sessions: checkoutSessions,
        purchase_sessions: purchaseSessions,
        conversion_rate: conversion,
        cart_to_checkout_rate: cartToCheckout,
        checkout_to_purchase_rate: checkoutToPurchase,
      },
      recovery: {
        abandoned: abandoned.length,
        recovered,
        recovery_rate: recoveryRate,
        open_value_cents: abandonedValue,
      },
      channels: Array.from(channels.entries()).map(([channel, values]) => ({
        channel,
        ...values,
        roas: values.spend_cents > 0 ? Math.round((values.attributed_revenue_cents / values.spend_cents) * 100) / 100 : 0,
        ctr: values.impressions > 0 ? values.clicks / values.impressions : 0,
        cpc_cents: values.clicks > 0 ? Math.round(values.spend_cents / values.clicks) : 0,
      })).sort((a, b) => b.spend_cents - a.spend_cents),
    };
  });
