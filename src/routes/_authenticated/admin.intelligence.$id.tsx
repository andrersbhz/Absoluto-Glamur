import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, RefreshCw, Trash2, Plus, Calculator, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatBRL } from "@/lib/format";
import {
  getProductIntelligence, computeProductScore, saveCostComponents,
  simulatePrice, applyPriceToProduct,
} from "@/lib/intelligence.functions";

export const Route = createFileRoute("/_authenticated/admin/intelligence/$id")({
  head: () => ({ meta: [{ title: "Análise · Admin Bloom" }] }),
  beforeLoad: async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw redirect({ to: "/auth" });
    const { data: adm } = await supabase.rpc("is_admin", { _user_id: userData.user.id });
    if (adm) return;
    const { data: cat } = await supabase.rpc("has_role", { _user_id: userData.user.id, _role: "catalog" });
    if (!cat) throw redirect({ to: "/account" });
  },
  component: ProductIntelDetail,
});

type CostRow = { key: string; label: string; amount_cents: number; notes?: string };

const DEFAULT_COSTS: CostRow[] = [
  { key: "product", label: "Custo do produto", amount_cents: 0 },
  { key: "shipping", label: "Frete importação", amount_cents: 0 },
  { key: "tax", label: "Impostos", amount_cents: 0 },
  { key: "gateway", label: "Taxa gateway", amount_cents: 0 },
  { key: "packaging", label: "Embalagem", amount_cents: 0 },
];

function scoreColor(v: number | null | undefined) {
  if (v == null) return "bg-muted text-muted-foreground";
  if (v >= 80) return "bg-success text-white";
  if (v >= 60) return "bg-primary text-primary-foreground";
  if (v >= 40) return "bg-amber-500 text-white";
  return "bg-destructive text-white";
}

function ProductIntelDetail() {
  const { id } = Route.useParams();
  const get = useServerFn(getProductIntelligence);
  const compute = useServerFn(computeProductScore);
  const saveCosts = useServerFn(saveCostComponents);
  const simulate = useServerFn(simulatePrice);
  const apply = useServerFn(applyPriceToProduct);
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["intel", id],
    queryFn: () => get({ data: { product_id: id } }),
  });

  const [costs, setCosts] = useState<CostRow[]>(DEFAULT_COSTS);
  const [ruleId, setRuleId] = useState<string | null>(null);
  const [override, setOverride] = useState<string>("");
  const [sim, setSim] = useState<any>(null);

  useEffect(() => {
    if (query.data?.costs?.length) {
      setCosts(query.data.costs.map((c: any) => ({
        key: c.key, label: c.label, amount_cents: c.amount_cents, notes: c.notes ?? undefined,
      })));
    }
  }, [query.data?.costs]);

  const computeMut = useMutation({
    mutationFn: () => compute({ data: { product_id: id } }),
    onSuccess: () => {
      toast.success("Score recalculado");
      qc.invalidateQueries({ queryKey: ["intel", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveCostsMut = useMutation({
    mutationFn: () => saveCosts({
      data: {
        product_id: id,
        components: costs.filter((c) => c.label).map((c) => ({
          key: c.key || c.label.toLowerCase().replace(/\s+/g, "_"),
          label: c.label,
          amount_cents: c.amount_cents,
        })),
      },
    }),
    onSuccess: () => {
      toast.success("Custos salvos");
      qc.invalidateQueries({ queryKey: ["intel", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const simMut = useMutation({
    mutationFn: () => simulate({
      data: {
        product_id: id,
        rule_id: ruleId,
        override_markup_pct: override ? Number(override) : null,
      },
    }),
    onSuccess: (r) => setSim(r),
    onError: (e: Error) => toast.error(e.message),
  });

  const applyMut = useMutation({
    mutationFn: () => apply({
      data: {
        product_id: id,
        rule_id: ruleId,
        override_markup_pct: override ? Number(override) : null,
      },
    }),
    onSuccess: (r) => {
      toast.success(`Preço aplicado: ${formatBRL(r.final_price_cents)}`);
      qc.invalidateQueries({ queryKey: ["intel", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (query.isLoading) {
    return <AdminLayout><div className="p-8 text-muted-foreground">Carregando…</div></AdminLayout>;
  }

  const { product, score, rules, calculations } = query.data ?? { product: null, score: null, rules: [], calculations: [] };

  if (!product) {
    return (
      <AdminLayout>
        <div className="p-8 text-muted-foreground">Produto não encontrado.</div>
      </AdminLayout>
    );
  }

  const totalCost = costs.reduce((s, c) => s + (c.amount_cents ?? 0), 0);

  return (
    <AdminLayout>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Link to="/admin/intelligence" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
              <ArrowLeft className="h-3 w-3" /> Voltar para inteligência
            </Link>
            <h1 className="mt-2 font-display text-3xl">{product.name}</h1>
            <p className="text-sm text-muted-foreground">Slug: {product.slug} · Status: {product.status}</p>
          </div>
          <Link
            to="/admin/catalog/$id" params={{ id: product.id }}
            className="rounded-lg border border-border bg-secondary px-3 py-1.5 text-sm hover:bg-secondary/70"
          >
            Editar produto
          </Link>
        </div>

        {/* Score card */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <div className="flex items-start gap-6">
            <div className={`flex h-24 w-24 flex-col items-center justify-center rounded-2xl font-display ${scoreColor(score?.overall)}`}>
              <span className="text-3xl">{score?.overall ?? "—"}</span>
              <span className="text-[10px] uppercase tracking-wider opacity-90">{score?.label ?? "sem score"}</span>
            </div>
            <div className="flex-1">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {[
                  ["Qualidade", score?.quality],
                  ["Demanda", score?.demand],
                  ["Margem", score?.margin],
                  ["Concorrência", score?.competitiveness],
                  ["Risco", score?.risk],
                ].map(([k, v]) => (
                  <div key={k as string} className="rounded-lg bg-muted/40 p-3">
                    <p className="text-[10px] uppercase text-muted-foreground">{k}</p>
                    <p className="mt-1 font-display text-xl">{v ?? "—"}</p>
                  </div>
                ))}
              </div>
              {score?.recommendation && (
                <p className="mt-4 rounded-lg border border-border bg-muted/30 p-3 text-sm">
                  <strong>Recomendações:</strong> {score.recommendation}
                </p>
              )}
            </div>
            <Button onClick={() => computeMut.mutate()} disabled={computeMut.isPending}>
              <RefreshCw className="mr-2 h-4 w-4" /> Recalcular
            </Button>
          </div>

          {score?.components?.length ? (
            <details className="mt-6">
              <summary className="cursor-pointer text-sm text-muted-foreground">Memória de cálculo ({score.components.length} componentes)</summary>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-left text-muted-foreground">
                    <tr><th className="py-1">Componente</th><th>Peso</th><th>Valor bruto</th><th>Normalizado</th><th>Fonte</th></tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {score.components.map((c: any) => (
                      <tr key={c.id}>
                        <td className="py-1.5">{c.label}</td>
                        <td>{c.weight}%</td>
                        <td>{c.raw_value ?? "—"}</td>
                        <td><Badge variant="outline">{c.normalized}</Badge></td>
                        <td className="text-muted-foreground">{c.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ) : null}
        </div>

        {/* Cost components + pricing */}
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <h3 className="font-display text-lg">Componentes de custo</h3>
            <div className="mt-3 space-y-2">
              {costs.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    className="flex-1"
                    placeholder="Rótulo"
                    value={c.label}
                    onChange={(e) => {
                      const next = [...costs];
                      next[i] = { ...c, label: e.target.value };
                      setCosts(next);
                    }}
                  />
                  <Input
                    className="w-32"
                    type="number" step="0.01"
                    value={c.amount_cents / 100}
                    onChange={(e) => {
                      const next = [...costs];
                      next[i] = { ...c, amount_cents: Math.round(Number(e.target.value) * 100) };
                      setCosts(next);
                    }}
                  />
                  <button onClick={() => setCosts(costs.filter((_, k) => k !== i))}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </button>
                </div>
              ))}
              <Button variant="outline" size="sm"
                onClick={() => setCosts([...costs, { key: `custom_${costs.length}`, label: "", amount_cents: 0 }])}>
                <Plus className="mr-1 h-3 w-3" /> Adicionar linha
              </Button>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
              <div>
                <p className="text-xs text-muted-foreground">Custo total</p>
                <p className="font-display text-2xl">{formatBRL(totalCost)}</p>
              </div>
              <Button onClick={() => saveCostsMut.mutate()} disabled={saveCostsMut.isPending}>Salvar custos</Button>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <h3 className="font-display text-lg">Simulação de preço</h3>
            <div className="mt-3 space-y-3">
              <div>
                <Label>Regra de precificação</Label>
                <Select value={ruleId ?? "default"} onValueChange={(v) => setRuleId(v === "default" ? null : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Padrão do sistema</SelectItem>
                    {rules.map((r: any) => (
                      <SelectItem key={r.id} value={r.id}>{r.name} ({r.markup_pct}%)</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Markup override (%)</Label>
                <Input type="number" value={override} onChange={(e) => setOverride(e.target.value)} placeholder="Deixe vazio para usar a regra" />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => simMut.mutate()} disabled={simMut.isPending}>
                  <Calculator className="mr-1 h-4 w-4" /> Simular
                </Button>
                <Button onClick={() => applyMut.mutate()} disabled={applyMut.isPending || totalCost === 0}>
                  <CheckCircle2 className="mr-1 h-4 w-4" /> Aplicar ao produto
                </Button>
              </div>

              {sim && (
                <div className="mt-3 space-y-1 rounded-lg border border-border bg-muted/30 p-3 text-sm">
                  <p>Custo: <strong>{formatBRL(sim.cost_cents)}</strong></p>
                  <p>Sugerido: <strong>{formatBRL(sim.suggested_price_cents)}</strong></p>
                  <p>Final (após arredondamento): <strong className="text-primary text-lg">{formatBRL(sim.final_price_cents)}</strong></p>
                  <p>Margem: <strong>{sim.margin_pct}%</strong></p>
                  <p className="text-xs text-muted-foreground">Regra: {sim.breakdown.rule_name}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* History */}
        {calculations?.length ? (
          <div className="rounded-2xl border border-border bg-card shadow-soft">
            <div className="border-b border-border p-4 font-display text-lg">Histórico de precificação</div>
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-left text-xs uppercase text-muted-foreground">
                <tr><th className="p-3">Data</th><th>Custo</th><th>Sugerido</th><th>Final</th><th>Margem</th><th>Aplicado</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {calculations.map((c: any) => (
                  <tr key={c.id}>
                    <td className="p-3 text-xs">{new Date(c.computed_at).toLocaleString("pt-BR")}</td>
                    <td>{formatBRL(c.cost_cents)}</td>
                    <td>{formatBRL(c.suggested_price_cents)}</td>
                    <td className="font-medium">{formatBRL(c.final_price_cents)}</td>
                    <td>{c.margin_pct}%</td>
                    <td>{c.applied ? <Badge className="bg-success text-white">Sim</Badge> : <Badge variant="outline">Simulado</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </AdminLayout>
  );
}
