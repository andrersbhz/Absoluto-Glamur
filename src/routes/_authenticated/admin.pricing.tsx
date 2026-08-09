import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Calculator, Save, Search } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { listPricingProfiles, savePricingProfile, simulateProfessionalPrice } from "@/lib/pricing-v12.functions";
import { formatBRL } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/pricing")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  component: PricingV12Page,
});

type ProfileDraft = {
  id?: string;
  name: string;
  is_default: boolean;
  enabled: boolean;
  gateway_pct: number;
  gateway_fixed_cents: number;
  tax_pct: number;
  fx_spread_pct: number;
  returns_pct: number;
  chargeback_pct: number;
  operational_pct: number;
  desired_margin_pct: number;
  target_ad_cost_pct: number;
  shipping_subsidy_cents: number;
  packaging_cents: number;
};

const DEFAULT_PROFILE: ProfileDraft = {
  name: "Padrão v1.2",
  is_default: true,
  enabled: true,
  gateway_pct: 4.99,
  gateway_fixed_cents: 0,
  tax_pct: 0,
  fx_spread_pct: 4,
  returns_pct: 2,
  chargeback_pct: 1,
  operational_pct: 5,
  desired_margin_pct: 35,
  target_ad_cost_pct: 20,
  shipping_subsidy_cents: 0,
  packaging_cents: 0,
};

function PricingV12Page() {
  const listProfiles = useServerFn(listPricingProfiles);
  const saveProfile = useServerFn(savePricingProfile);
  const simulate = useServerFn(simulateProfessionalPrice);
  const [profile, setProfile] = useState<ProfileDraft>(DEFAULT_PROFILE);
  const [products, setProducts] = useState<{ id: string; name: string; slug: string }[]>([]);
  const [term, setTerm] = useState("");
  const [selected, setSelected] = useState<string>("");
  const [shipping, setShipping] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [result, setResult] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const profiles = await listProfiles();
        const current = (profiles as any[]).find((p) => p.is_default) ?? (profiles as any[])[0];
        if (current) setProfile({ ...DEFAULT_PROFILE, ...current });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha ao carregar perfil de preço");
      }
    })();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      if (!term.trim()) { setProducts([]); return; }
      const { data } = await supabase.from("products").select("id,name,slug").ilike("name", `%${term.trim()}%`).limit(20);
      setProducts((data ?? []) as { id: string; name: string; slug: string }[]);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [term]);

  const pctSum = useMemo(() => profile.gateway_pct + profile.tax_pct + profile.returns_pct + profile.chargeback_pct + profile.operational_pct + profile.target_ad_cost_pct + profile.desired_margin_pct, [profile]);
  const patch = (key: keyof ProfileDraft, value: string | number | boolean) => setProfile((old) => ({ ...old, [key]: value }));

  async function save() {
    setSaving(true);
    try {
      const response = await saveProfile({ data: profile });
      setProfile((old) => ({ ...old, id: response.id }));
      toast.success("Perfil de precificação salvo");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar perfil");
    } finally { setSaving(false); }
  }

  async function runSimulation() {
    if (!selected) return toast.error("Selecione um produto");
    setRunning(true);
    try {
      const data = await simulate({ data: { product_id: selected, profile_id: profile.id ?? null, supplier_shipping_cents: shipping, discount_pct: discount } });
      setResult(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível simular");
    } finally { setRunning(false); }
  }

  return (
    <AdminLayout>
      <div className="mx-auto max-w-7xl space-y-6">
        <div><Badge variant="secondary">Precificador profissional · v1.2</Badge><h1 className="mt-2 font-display text-3xl">Preço, lucro, CPA e ROAS</h1><p className="mt-1 text-sm text-muted-foreground">Inclui fornecedor, frete, câmbio, gateway, impostos, devoluções, chargeback, operação, mídia e margem desejada.</p></div>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_.9fr]">
          <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <div className="flex items-center justify-between"><div><h2 className="font-display text-xl">Perfil de custos</h2><p className="text-xs text-muted-foreground">Percentuais são aplicados sobre a venda, exceto custos fixos.</p></div><Button onClick={save} disabled={saving}><Save className="mr-2 h-4 w-4" /> Salvar</Button></div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Gateway %" value={profile.gateway_pct} onChange={(v) => patch("gateway_pct", v)} />
              <MoneyField label="Gateway fixo" value={profile.gateway_fixed_cents} onChange={(v) => patch("gateway_fixed_cents", v)} />
              <Field label="Impostos %" value={profile.tax_pct} onChange={(v) => patch("tax_pct", v)} />
              <Field label="Spread cambial %" value={profile.fx_spread_pct} onChange={(v) => patch("fx_spread_pct", v)} />
              <Field label="Reserva devoluções %" value={profile.returns_pct} onChange={(v) => patch("returns_pct", v)} />
              <Field label="Reserva chargeback %" value={profile.chargeback_pct} onChange={(v) => patch("chargeback_pct", v)} />
              <Field label="Operacional %" value={profile.operational_pct} onChange={(v) => patch("operational_pct", v)} />
              <Field label="CAC/meta mídia %" value={profile.target_ad_cost_pct} onChange={(v) => patch("target_ad_cost_pct", v)} />
              <Field label="Margem desejada %" value={profile.desired_margin_pct} onChange={(v) => patch("desired_margin_pct", v)} />
              <MoneyField label="Embalagem" value={profile.packaging_cents} onChange={(v) => patch("packaging_cents", v)} />
              <MoneyField label="Frete subsidiado" value={profile.shipping_subsidy_cents} onChange={(v) => patch("shipping_subsidy_cents", v)} />
            </div>
            <div className={`mt-5 rounded-xl border p-3 text-sm ${pctSum >= 95 ? "border-destructive/40 bg-destructive/5 text-destructive" : "border-border bg-secondary/30"}`}>Custos percentuais + mídia + margem: <strong>{pctSum.toFixed(2)}%</strong>{pctSum >= 95 ? " — reduza os percentuais para o cálculo ser sustentável." : ""}</div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <h2 className="font-display text-xl">Simulador por produto</h2>
            <div className="relative mt-4"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Pesquisar produto…" value={term} onChange={(e) => setTerm(e.target.value)} /></div>
            {products.length > 0 ? <div className="mt-2 max-h-44 overflow-auto rounded-xl border border-border">{products.map((p) => <button key={p.id} className={`block w-full border-b border-border px-3 py-2 text-left text-sm last:border-0 ${selected === p.id ? "bg-primary/10" : "hover:bg-secondary"}`} onClick={() => { setSelected(p.id); setTerm(p.name); setProducts([]); }}>{p.name}</button>)}</div> : null}
            <div className="mt-4 grid gap-3 sm:grid-cols-2"><MoneyField label="Frete fornecedor" value={shipping} onChange={setShipping} /><Field label="Desconto promocional %" value={discount} onChange={setDiscount} /></div>
            <Button className="mt-4 w-full" onClick={runSimulation} disabled={running || !selected}><Calculator className="mr-2 h-4 w-4" /> Calcular viabilidade</Button>

            {result ? <div className="mt-5 grid gap-3 sm:grid-cols-2"><Metric label="Custo real" value={formatBRL(result.cost.landed_cost_cents)} /><Metric label="Preço equilíbrio" value={formatBRL(result.prices.break_even_cents)} /><Metric label="Preço recomendado" value={formatBRL(result.prices.recommended_cents)} /><Metric label="Preço promocional" value={formatBRL(result.prices.promotional_cents)} /><Metric label="Preço de tabela" value={formatBRL(result.prices.list_cents)} /><Metric label="Lucro pós-mídia" value={formatBRL(result.economics.profit_after_target_ad_cents)} /><Metric label="Margem líquida" value={`${result.economics.net_margin_pct.toFixed(2)}%`} /><Metric label="CPA máximo" value={formatBRL(result.economics.max_cpa_cents)} /><Metric label="ROAS mínimo" value={`${result.economics.break_even_roas.toFixed(2)}x`} /></div> : null}
          </section>
        </div>
      </div>
    </AdminLayout>
  );
}

function Field({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) { return <label className="text-sm"><span className="text-muted-foreground">{label}</span><Input type="number" step="0.01" min={0} value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} /></label>; }
function MoneyField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) { return <label className="text-sm"><span className="text-muted-foreground">{label} (R$)</span><Input type="number" step="0.01" min={0} value={(value / 100).toFixed(2)} onChange={(e) => onChange(Math.round((Number(e.target.value) || 0) * 100))} /></label>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-border bg-secondary/30 p-3"><p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 font-display text-xl">{value}</p></div>; }
