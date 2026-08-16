import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Loader2, 
  Download, 
  TrendingUp, 
  ShoppingCart, 
  Users, 
  Sparkles, 
  Package, 
  AlertTriangle,
  Globe,
  ArrowRight
} from "lucide-react";
import { formatBRL } from "@/lib/format";
import { getDashboardMetrics, exportOrdersCsv } from "@/lib/dashboard.functions";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

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
  const [onlineCount, setOnlineCount] = useState(0);
  
  const q = useQuery({ 
    queryKey: ["dashboard-metrics"], 
    queryFn: () => fn({ data: undefined as any }) 
  });

  useEffect(() => {
    // Buscar contagem online inicial
    const fetchOnline = async () => {
      const { count } = await supabase
        .from("visitor_sessions")
        .select("*", { count: 'exact', head: true })
        .eq("is_online", true);
      setOnlineCount(count || 0);
    };
    fetchOnline();

    // Ouvir mudanças em tempo real nas sessões
    const channel = supabase
      .channel("dashboard_stats")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "visitor_sessions" },
        () => fetchOnline()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  async function download() {
    try {
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
          <div className="flex items-center gap-3">
             <Link 
              to="/admin/map"
              className="inline-flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2 text-sm font-medium text-primary transition hover:bg-primary/10"
            >
              <Globe className="h-4 w-4" />
              <span>Ver Mapa ao Vivo</span>
              <div className="relative ml-1 flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary"></span>
              </div>
            </Link>
            <Button onClick={download} variant="outline"><Download className="mr-2 h-4 w-4" /> Exportar CSV</Button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi 
            icon={Users} 
            label="Visitantes Online" 
            value={String(onlineCount)} 
            sub="Navegando agora" 
            tone="ok"
            highlight={true}
          />
          <Kpi icon={TrendingUp} label="Receita (30d)" value={formatBRL(m.revenue_cents_30d / 100)} />
          <Kpi icon={ShoppingCart} label="Pedidos pagos" value={String(m.paid_orders_30d)} sub={`${m.orders_30d} totais`} />
          <Kpi icon={TrendingUp} label="Ticket médio" value={formatBRL(m.aov_cents / 100)} />
          <Kpi icon={TrendingUp} label="Conversão" value={`${(m.conversion_rate * 100).toFixed(1)}%`} />
          <Kpi icon={Package} label="Produtos ativos" value={String(m.products_active)} sub={`${m.products_draft} rascunhos`} />
          <Kpi icon={Users} label="Clientes" value={String(m.customers_total)} sub={`+${m.new_customers_30d} novos`} />
          <Kpi icon={Sparkles} label="Chamadas IA" value={String(m.ai_calls_30d)} sub={`${m.ai_tokens_30d.toLocaleString("pt-BR")} tokens`} />
        </div>

        {/* ... restante do componente ... */}
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
              </tbody>
            </table>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
            <h2 className="font-display text-xl">Funil Comercial</h2>
            <div className="mt-6 space-y-4">
               {/* Aqui entra a lógica do funil em tempo real simplificada */}
               <FunnelBar label="Browsing" value={onlineCount} total={onlineCount} color="bg-primary/40" />
               <FunnelBar label="Carrinho" value={0} total={onlineCount} color="bg-yellow-500/40" />
               <FunnelBar label="Checkout" value={0} total={onlineCount} color="bg-blue-500/40" />
               <FunnelBar label="Vendas" value={m.paid_orders_30d} total={m.orders_30d || 1} color="bg-green-500/40" />
               <p className="text-[10px] text-muted-foreground text-center mt-2 italic">Dados de carrinho e checkout atualizam via heatmap no mapa.</p>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

function Kpi({ icon: Icon, label, value, sub, tone = "ok", highlight = false }: any) {
  return (
    <div className={`rounded-2xl border p-5 shadow-soft transition-all ${highlight ? 'border-primary/50 bg-primary/5 shadow-[0_0_20px_rgba(var(--primary),0.05)]' : 'border-border bg-card'}`}>
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className={`h-4 w-4 ${highlight ? 'text-primary' : ''}`} />
        <p className="text-xs uppercase tracking-widest">{label}</p>
      </div>
      <p className={`mt-2 font-display text-2xl ${tone === "warn" ? "text-destructive" : highlight ? "text-primary" : "text-foreground"}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function FunnelBar({ label, value, total, color }: any) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{value}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${Math.max(5, pct)}%` }} />
      </div>
    </div>
  );
}
