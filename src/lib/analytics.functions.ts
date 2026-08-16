import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertAdmin } from "./analytics-guard.server";


export const getAnalyticsStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({
    period: z.enum(["today", "24h", "7d", "30d"]).default("today"),
    dimension: z.string().optional()
  }).parse(data))
  .handler(async ({ data: input, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    
    const now = new Date();
    let since = new Date();
    if (input.period === "today") since.setHours(0, 0, 0, 0);
    else if (input.period === "24h") since.setHours(since.getHours() - 24);
    else if (input.period === "7d") since.setDate(since.getDate() - 7);
    else if (input.period === "30d") since.setDate(since.getDate() - 30);
    
    const sinceStr = since.toISOString();

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStr = todayStart.toISOString();

    const [salesToday, onlineStats, funnelHistory] = await Promise.all([
      supabaseAdmin.from("orders")
        .select("total_cents")
        .gte("created_at", todayStr)
        .or("status.eq.paid,paid_at.not.is.null"),
      supabaseAdmin.from("visitor_sessions")
        .select("funnel_stage, current_page")
        .eq("is_online", true),
      supabaseAdmin.from("analytics_events")
        .select("event_name, value_cents")
        .gte("created_at", sinceStr)
    ]);

    const revenuePeriod = (funnelHistory.data ?? [])
      .filter(e => e.event_name === 'purchase')
      .reduce((acc, e) => acc + (e.value_cents ?? 0), 0);

    const revenueToday = (salesToday.data ?? []).reduce((acc, o) => acc + (o.total_cents ?? 0), 0);
    const ordersToday = (salesToday.data ?? []).length;

    const online = onlineStats.data ?? [];
    const funnel = {
      browsing: online.filter(v => v.funnel_stage === 'browsing').length,
      product_view: online.filter(v => v.funnel_stage === 'product_view').length,
      cart: online.filter(v => v.funnel_stage === 'cart').length,
      checkout: online.filter(v => v.funnel_stage === 'checkout').length,
    };

    return {
      revenueToday,
      ordersToday,
      revenuePeriod,
      onlineTotal: online.length,
      funnel,
      period: input.period
    };
  });

export const exportAnalyticsCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({
    period: z.enum(["today", "24h", "7d", "30d"]).default("today")
  }).parse(data))
  .handler(async ({ data: input, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    
    let since = new Date();
    if (input.period === "today") since.setHours(0, 0, 0, 0);
    else if (input.period === "24h") since.setHours(since.getHours() - 24);
    else if (input.period === "7d") since.setDate(since.getDate() - 7);
    else if (input.period === "30d") since.setDate(since.getDate() - 30);

    const { data } = await (supabaseAdmin.from("analytics_events") as any)
      .select("created_at, event_name, page_path, product_name, value_cents, visitor_id")
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false });

    const header = ["Data", "Evento", "Página", "Produto", "Valor (R$)", "ID Visitante"];
    const rows = (data ?? []).map((r: any) => [
      new Date(r.created_at).toLocaleString('pt-BR'),
      r.event_name,
      r.page_path,
      r.product_name || "",
      ((r.value_cents || 0) / 100).toFixed(2),
      r.visitor_id
    ].map(s => `"${String(s || '').replace(/"/g, '""')}"`).join(","));

    return { csv: [header.join(","), ...rows].join("\n"), filename: `analytics-${input.period}-${new Date().toISOString().slice(0, 10)}.csv` };
  });

export const getOperatorNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<any[]> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin.from("operator_notifications" as any) as any)
      .select("*, session:visitor_sessions(*)")
      .eq("is_read", false)
      .order("created_at", { ascending: false })
      .limit(20);
    return data || [];
  });

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin.from("operator_notifications" as any) as any)
      .update({ is_read: true })
      .eq("id", data.id);
    return { success: true };
  });
