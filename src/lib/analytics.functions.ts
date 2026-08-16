import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertAdmin(context: any) {
  const { data: adm } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
  if (!adm) throw new Error("Acesso restrito a administradores");
}

export const getAnalyticsStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => z.object({
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

    // KPIs de Vendas Hoje
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStr = todayStart.toISOString();

    const [salesToday, onlineStats] = await Promise.all([
      supabaseAdmin.from("orders")
        .select("total_cents")
        .gte("created_at", todayStr)
        .or("status.eq.paid,paid_at.not.is.null"),
      supabaseAdmin.from("visitor_sessions")
        .select("funnel_stage, current_page")
        .eq("is_online", true)
    ]);

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
      onlineTotal: online.length,
      funnel,
      period: input.period
    };
  });
