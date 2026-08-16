import { supabaseAdmin } from "@/integrations/supabase/client.server";

type AuthContext = {
  // The authenticated middleware supplies the generated, strongly typed client.
  // Keep this boundary structural because its generic RPC signature is invariant.
  supabase: any;
  userId: string;
};

type AnalyticsPeriod = "today" | "24h" | "7d" | "30d";

async function assertAdmin(context: AuthContext) {
  const { data: isAdmin, error } = await context.supabase.rpc("is_admin", {
    _user_id: context.userId,
  });

  if (error || !isAdmin) {
    throw new Error("Acesso restrito a administradores");
  }
}

function getPeriodStart(period: AnalyticsPeriod) {
  const since = new Date();
  if (period === "today") since.setHours(0, 0, 0, 0);
  else if (period === "24h") since.setHours(since.getHours() - 24);
  else if (period === "7d") since.setDate(since.getDate() - 7);
  else since.setDate(since.getDate() - 30);
  return since;
}

export async function loadAnalyticsStats(context: AuthContext, period: AnalyticsPeriod) {
  await assertAdmin(context);

  const sinceStr = getPeriodStart(period).toISOString();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [salesToday, onlineStats, funnelHistory] = await Promise.all([
    supabaseAdmin.from("orders")
      .select("total_cents")
      .gte("created_at", todayStart.toISOString())
      .or("status.eq.paid,paid_at.not.is.null"),
    supabaseAdmin.from("visitor_sessions")
      .select("funnel_stage, current_page")
      .eq("is_online", true),
    supabaseAdmin.from("analytics_events")
      .select("event_name, value_cents")
      .gte("created_at", sinceStr),
  ]);

  const revenuePeriod = (funnelHistory.data ?? [])
    .filter((event) => event.event_name === "purchase")
    .reduce((total, event) => total + (event.value_cents ?? 0), 0);
  const revenueToday = (salesToday.data ?? [])
    .reduce((total, order) => total + (order.total_cents ?? 0), 0);
  const online = onlineStats.data ?? [];

  return {
    revenueToday,
    ordersToday: (salesToday.data ?? []).length,
    revenuePeriod,
    onlineTotal: online.length,
    funnel: {
      browsing: online.filter((visitor) => visitor.funnel_stage === "browsing").length,
      product_view: online.filter((visitor) => visitor.funnel_stage === "product_view").length,
      cart: online.filter((visitor) => visitor.funnel_stage === "cart").length,
      checkout: online.filter((visitor) => visitor.funnel_stage === "checkout").length,
    },
    period,
  };
}

export async function buildAnalyticsCsv(context: AuthContext, period: AnalyticsPeriod) {
  await assertAdmin(context);

  const { data, error } = await supabaseAdmin
    .from("analytics_events")
    .select("created_at, event_name, page_path, product_name, value_cents, visitor_id")
    .gte("created_at", getPeriodStart(period).toISOString())
    .order("created_at", { ascending: false });

  if (error) throw new Error("Não foi possível exportar os dados de analytics");

  const header = ["Data", "Evento", "Página", "Produto", "Valor (R$)", "ID Visitante"];
  const rows = (data ?? []).map((row) => [
    row.created_at ? new Date(row.created_at).toLocaleString("pt-BR") : "",
    row.event_name,
    row.page_path,
    row.product_name ?? "",
    ((row.value_cents ?? 0) / 100).toFixed(2),
    row.visitor_id,
  ].map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(","));

  return {
    csv: [header.join(","), ...rows].join("\n"),
    filename: `analytics-${period}-${new Date().toISOString().slice(0, 10)}.csv`,
  };
}

export async function loadOperatorNotifications(context: AuthContext) {
  await assertAdmin(context);

  const { data, error } = await supabaseAdmin
    .from("operator_notifications")
    .select("*, session:visitor_sessions(*)")
    .eq("is_read", false)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) throw new Error("Não foi possível carregar as notificações");
  return data ?? [];
}

export async function setOperatorNotificationRead(context: AuthContext, id: string) {
  await assertAdmin(context);

  const { error } = await supabaseAdmin
    .from("operator_notifications")
    .update({ is_read: true })
    .eq("id", id);

  if (error) throw new Error("Não foi possível atualizar a notificação");
  return { success: true };
}