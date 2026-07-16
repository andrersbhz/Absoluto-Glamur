import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, Download, TrendingUp, ShoppingCart, Users, Sparkles, Package, AlertTriangle } from "lucide-react";
import { formatBRL } from "@/lib/format";
import { getDashboardMetrics, exportOrdersCsv } from "@/lib/dashboard.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/dashboard")({
  beforeLoad: async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw redirect({ to: "/auth" });
    const { data: rolesData } = await supabase.from("user_roles").select("role").eq("user_id", userData.user.id);
    const roles = (rolesData ?? []).map((r) => r.role as string);
    if (!roles.includes("admin") && !roles.includes("superadmin")) throw redirect({ to: "/account" });
  },
  component: Dashboard,
});

function Dashboard() {
  const fn = useServerFn(getDashboardMetrics);
  const exportFn = useServerFn(exportOrdersCsv);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = useQuery({ queryKey: ["dashboard-metrics"], queryFn: () => fn({ data: undefined as any }) });

  async function download() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { csv, count } = await exportFn({ data: undefined as any });
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pedidos-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${count} pedidos exportados`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao exportar");
    }
  }

  if (q.isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando métricas…
        </div>
      </AdminLayout>
    );
  }

  const m = q.data;
  if (!m) return <AdminLayout><p>Sem dados.</p></AdminLayout>;

  const maxRev = Math.max(1, ...m.sales_series.map((s) => s.revenue_cents));

  return (
    <AdminLayout>
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl">Dashboard executivo</h1>
            <p className="text-sm text-muted-foreground">Últimos 30 dias · atualizado em tempo real.</p>
          </div>
          <Button onClick={download} variant="outline"><Download className="mr-2 h-4 w-4" /> Exportar CSV</Button>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi icon={TrendingUp} label="Receita (30d)" value={formatBRL(m.revenue_cents_30d / 100)} />
          <Kpi icon={ShoppingCart} label="Pedidos pagos" value={String(m.paid_orders_30d)} sub={`${m.orders_30d} totais`} />
          <Kpi icon={TrendingUp} label="Ticket médio" value={formatBRL(m.aov_cents / 100)} />
          <Kpi icon={TrendingUp} label="Conversão" value={`${(m.conversion_rate * 100).toFixed(1)}%`} />
          <Kpi icon={Package} label="Produtos ativos" value={String(m.products_active)} sub={`${m.products_draft} rascunhos`} />
          <Kpi icon={Users} label="Clientes" value={String(m.customers_total)} sub={`+${m.new_customers_30d} novos`} />
          <Kpi icon={Sparkles} label="Chamadas IA" value={String(m.ai_calls_30d)} sub={`${m.ai_tokens_30d.toLocaleString("pt-BR")} tokens`} />
          <Kpi icon={ShoppingCart} label="Pendentes" value={String(m.orders_pending)} tone={m.orders_pending > 0 ? "warn" : "ok"} />
        </div>

        <div className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-soft">
          <h2 className="font-display text-xl">Receita diária</h2>
          <div className="mt-4 flex h-48 items-end gap-1">
            {m.sales_series.map((s) => {
              const h = (s.revenue_cents / maxRev) * 100;
              return (
                <div key={s.day} className="flex-1" title={`${s.day}: ${formatBRL(s.revenue_cents / 100)} · ${s.orders} pedidos`}>
                  <div className="mx-auto w-full rounded-t bg-primary/70 transition-all hover:bg-primary" style={{ height: `${Math.max(2, h)}%` }} />
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
            <span>{m.sales_series[0]?.day}</span>
            <span>{m.sales_series[m.sales_series.length - 1]?.day}</span>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
            <h2 className="font-display text-xl">Top produtos (30d)</h2>
            <table className="mt-4 w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr><th className="py-2">Produto</th><th>Qtd</th><th className="text-right">Receita</th></tr>
              </thead>
              <tbody>
                {m.top_products.map((p) => (
                  <tr key={p.product_name} className="border-t border-border">
                    <td className="py-2 pr-2">{p.product_name}</td>
                    <td>{p.qty}</td>
                    <td className="text-right">{formatBRL(p.revenue_cents / 100)}</td>
                  </tr>
                ))}
                {m.top_products.length === 0 && (
                  <tr><td colSpan={3} className="py-6 text-center text-muted-foreground">Sem vendas ainda.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
            <h2 className="font-display text-xl">Pedidos por status</h2>
            <ul className="mt-4 space-y-2">
              {m.orders_by_status.map((s) => (
                <li key={s.status} className="flex items-center justify-between text-sm">
                  <Badge variant="outline">{s.status}</Badge>
                  <span className="font-medium">{s.count}</span>
                </li>
              ))}
              {m.orders_by_status.length === 0 && (
                <li className="text-sm text-muted-foreground">Sem pedidos no período.</li>
              )}
            </ul>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-soft">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            <h2 className="font-display text-xl">Uso do plano gratuito</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Alertas em 70% / 85% / 95%. Estimativas baseadas em contagens de linhas.</p>
          <div className="mt-4 space-y-4">
            <UsageBar label="Linhas no banco (estimativa)" value={m.usage_limits.database_rows} limit={m.usage_limits.database_rows_limit} unit="linhas" />
            <UsageBar label="Novos usuários (30d)" value={m.usage_limits.monthly_active_users} limit={m.usage_limits.mau_limit} unit="MAU" />
            <UsageBar label="Storage" value={m.usage_limits.storage_bytes} limit={m.usage_limits.storage_bytes_limit} unit="bytes" />
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

function Kpi({ icon: Icon, label, value, sub, tone = "ok" }: { icon: typeof TrendingUp; label: string; value: string; sub?: string; tone?: "ok" | "warn" }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <p className="text-xs uppercase tracking-widest">{label}</p>
      </div>
      <p className={`mt-2 font-display text-2xl ${tone === "warn" ? "text-destructive" : "text-foreground"}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function UsageBar({ label, value, limit, unit }: { label: string; value: number; limit: number; unit: string }) {
  const pct = Math.min(100, (value / limit) * 100);
  const tone = pct >= 95 ? "destructive" : pct >= 85 ? "warn" : pct >= 70 ? "attention" : "ok";
  const color = tone === "destructive" ? "bg-destructive" : tone === "warn" ? "bg-warning" : tone === "attention" ? "bg-primary" : "bg-success";
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="text-muted-foreground">
          {value.toLocaleString("pt-BR")} / {limit.toLocaleString("pt-BR")} {unit} ({pct.toFixed(1)}%)
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      {pct >= 70 && (
        <p className="mt-1 text-xs text-muted-foreground">
          {pct >= 95 ? "⚠ Crítico: considere upgrade." : pct >= 85 ? "Atenção: aproximando do limite." : "Monitore o crescimento."}
        </p>
      )}
    </div>
  );
}
