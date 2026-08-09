import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { BarChart3, RefreshCw, Save } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { getPerformanceV12, saveMarketingSpend } from "@/lib/performance-v12.functions";
import { formatBRL } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/performance")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  component: PerformancePage,
});

function PerformancePage() {
  const loadPerformance = useServerFn(getPerformanceV12);
  const saveSpend = useServerFn(saveMarketingSpend);
  const [days, setDays] = useState(30);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ day: new Date().toISOString().slice(0, 10), channel: "Meta Ads", campaign: "", spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 });

  async function load() {
    setLoading(true);
    try { setData(await loadPerformance({ data: { days } })); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao carregar performance"); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [days]);

  async function save() {
    try {
      await saveSpend({ data: {
        day: form.day,
        channel: form.channel,
        campaign: form.campaign,
        spend_cents: Math.round(form.spend * 100),
        impressions: form.impressions,
        clicks: form.clicks,
        conversions: form.conversions,
        attributed_revenue_cents: Math.round(form.revenue * 100),
        source: "manual",
      } });
      toast.success("Investimento salvo");
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao salvar investimento"); }
  }

  return (
    <AdminLayout>
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div><Badge variant="secondary">Performance · v1.2</Badge><h1 className="mt-2 font-display text-3xl">Funil, CAC, ROAS e MER</h1><p className="mt-1 text-sm text-muted-foreground">Cruza vendas, eventos da loja, carrinhos recuperáveis e investimento de mídia.</p></div>
          <div className="flex gap-2"><select className="rounded-lg border border-border bg-background px-3 py-2 text-sm" value={days} onChange={(e) => setDays(Number(e.target.value))}><option value={7}>7 dias</option><option value={30}>30 dias</option><option value={90}>90 dias</option></select><Button variant="outline" onClick={load} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar</Button></div>
        </header>

        {data ? <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
            <Metric label="Receita" value={formatBRL(data.revenue_cents)} />
            <Metric label="Investimento" value={formatBRL(data.ad_spend_cents)} />
            <Metric label="ROAS" value={`${data.roas.toFixed(2)}x`} />
            <Metric label="MER" value={`${data.mer.toFixed(2)}x`} />
            <Metric label="CAC" value={formatBRL(data.cac_cents)} />
            <Metric label="Pedidos pagos" value={String(data.paid_orders)} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-2xl border border-border bg-card p-5 shadow-soft"><h2 className="font-display text-xl">Funil</h2><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><Mini label="Visualização" value={data.funnel.product_view_sessions} /><Mini label="Carrinho" value={data.funnel.add_to_cart_sessions} /><Mini label="Checkout" value={data.funnel.checkout_sessions} /><Mini label="Compra" value={data.funnel.purchase_sessions} /></div><div className="mt-4 space-y-2 text-sm"><Rate label="Conversão visita → compra" value={data.funnel.conversion_rate} /><Rate label="Carrinho → checkout" value={data.funnel.cart_to_checkout_rate} /><Rate label="Checkout → compra" value={data.funnel.checkout_to_purchase_rate} /></div></section>
            <section className="rounded-2xl border border-border bg-card p-5 shadow-soft"><h2 className="font-display text-xl">Recuperação</h2><div className="mt-4 grid grid-cols-2 gap-3"><Mini label="Abandonados" value={data.recovery.abandoned} /><Mini label="Recuperados" value={data.recovery.recovered} /><Metric label="Taxa recuperação" value={`${(data.recovery.recovery_rate * 100).toFixed(1)}%`} /><Metric label="Valor em aberto" value={formatBRL(data.recovery.open_value_cents)} /></div></section>
          </div>

          <section className="overflow-hidden rounded-2xl border border-border bg-card"><div className="border-b border-border p-4"><h2 className="font-display text-xl">Desempenho por canal</h2></div><table className="w-full text-sm"><thead className="bg-secondary/50 text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="px-4 py-3 text-left">Canal</th><th>Gasto</th><th>Receita atribuída</th><th>ROAS</th><th>CTR</th><th>CPC</th></tr></thead><tbody>{data.channels.map((row: any) => <tr key={row.channel} className="border-t border-border"><td className="px-4 py-3 font-medium">{row.channel}</td><td className="text-center">{formatBRL(row.spend_cents)}</td><td className="text-center">{formatBRL(row.attributed_revenue_cents)}</td><td className="text-center">{row.roas.toFixed(2)}x</td><td className="text-center">{(row.ctr * 100).toFixed(2)}%</td><td className="text-center">{formatBRL(row.cpc_cents)}</td></tr>)}</tbody></table></section>
        </> : null}

        <section className="rounded-2xl border border-border bg-card p-5 shadow-soft"><div className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-primary" /><h2 className="font-display text-xl">Registrar investimento de mídia</h2></div><p className="mt-1 text-xs text-muted-foreground">Enquanto Google Ads/Meta não enviarem custos automaticamente, registre ou importe os valores aqui. O schema já está preparado para sincronização automática.</p><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Input type="date" value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })} /><Input placeholder="Canal" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })} /><Input placeholder="Campanha" value={form.campaign} onChange={(e) => setForm({ ...form, campaign: e.target.value })} /><MoneyInput placeholder="Investimento R$" value={form.spend} onChange={(spend) => setForm({ ...form, spend })} /><NumberInput placeholder="Impressões" value={form.impressions} onChange={(impressions) => setForm({ ...form, impressions })} /><NumberInput placeholder="Cliques" value={form.clicks} onChange={(clicks) => setForm({ ...form, clicks })} /><NumberInput placeholder="Conversões" value={form.conversions} onChange={(conversions) => setForm({ ...form, conversions })} /><MoneyInput placeholder="Receita atribuída R$" value={form.revenue} onChange={(revenue) => setForm({ ...form, revenue })} /></div><div className="mt-4 flex justify-end"><Button onClick={save}><Save className="mr-2 h-4 w-4" /> Salvar investimento</Button></div></section>
      </div>
    </AdminLayout>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-border bg-card p-4 shadow-soft"><p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 font-display text-2xl">{value}</p></div>; }
function Mini({ label, value }: { label: string; value: number }) { return <div className="rounded-xl bg-secondary/50 p-3 text-center"><p className="font-display text-2xl">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>; }
function Rate({ label, value }: { label: string; value: number }) { return <div className="flex items-center justify-between"><span className="text-muted-foreground">{label}</span><strong>{(value * 100).toFixed(1)}%</strong></div>; }
function MoneyInput({ placeholder, value, onChange }: { placeholder: string; value: number; onChange: (v: number) => void }) { return <Input type="number" step="0.01" min={0} placeholder={placeholder} value={value || ""} onChange={(e) => onChange(Number(e.target.value) || 0)} />; }
function NumberInput({ placeholder, value, onChange }: { placeholder: string; value: number; onChange: (v: number) => void }) { return <Input type="number" min={0} placeholder={placeholder} value={value || ""} onChange={(e) => onChange(Number(e.target.value) || 0)} />; }
