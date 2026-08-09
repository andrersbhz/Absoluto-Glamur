import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, RefreshCw, Search, Sparkles } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { computeGrowthScore, listGrowthOpportunities } from "@/lib/growth-intelligence.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/opportunities")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  component: OpportunitiesPage,
});

type OpportunityRow = Awaited<ReturnType<ReturnType<typeof listGrowthOpportunities>["handler"]>>;

function OpportunitiesPage() {
  const list = useServerFn(listGrowthOpportunities);
  const compute = useServerFn(computeGrowthScore);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [bucket, setBucket] = useState("all");

  const load = async () => {
    setLoading(true);
    try {
      const result = await list();
      setRows(result as any[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao carregar oportunidades");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => rows.filter((row) => {
    const score = row.score ?? {};
    const textOk = !query || String(row.name ?? "").toLowerCase().includes(query.toLowerCase());
    if (!textOk) return false;
    const overall = Number(score.overall ?? 0);
    const margin = Number(score.margin ?? 0);
    const trend = Number(score.trend ?? 0);
    if (bucket === "exploding") return trend >= 70 || overall >= 85;
    if (bucket === "promising") return overall >= 60;
    if (bucket === "margin") return margin >= 65;
    if (bucket === "watch") return overall >= 45 && overall < 60;
    if (bucket === "avoid") return overall > 0 && overall < 45;
    return true;
  }), [rows, query, bucket]);

  async function recompute(productId: string) {
    setBusy(productId);
    try {
      await compute({ data: { product_id: productId } });
      toast.success("Score v1.2 recalculado");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao recalcular");
    } finally {
      setBusy(null);
    }
  }

  return (
    <AdminLayout>
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Badge variant="secondary">Inteligência 2.0 · v1.2</Badge>
            <h1 className="mt-2 font-display text-3xl">Oportunidades de produtos</h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Opportunity, Commercial, Trend e Confidence Score combinam dados comerciais, mercado, fornecedor, frete, margem, estoque e avaliações.</p>
          </div>
          <Button variant="outline" onClick={load} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar</Button>
        </header>

        <div className="grid gap-3 rounded-2xl border border-border bg-card p-4 lg:grid-cols-[1fr_auto]">
          <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Buscar produto…" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
          <select className="rounded-lg border border-border bg-background px-3 py-2 text-sm" value={bucket} onChange={(e) => setBucket(e.target.value)}>
            <option value="all">Todos</option>
            <option value="exploding">🔥 Explodindo</option>
            <option value="promising">⭐ Promissores</option>
            <option value="margin">💰 Alta margem</option>
            <option value="watch">👀 Observar</option>
            <option value="avoid">⚠️ Evitar</option>
          </select>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-secondary/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr><th className="px-4 py-3 text-left">Produto</th><th className="px-3 py-3">Geral</th><th className="px-3 py-3">Oportunidade</th><th className="px-3 py-3">Comercial</th><th className="px-3 py-3">Tendência</th><th className="px-3 py-3">Confiança</th><th className="px-3 py-3">Vendas ext.</th><th className="px-3 py-3">Cresc. 30d</th><th className="px-3 py-3"></th></tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const score = row.score ?? {};
                const market = row.market ?? {};
                return (
                  <tr key={row.id} className="border-t border-border">
                    <td className="px-4 py-3"><p className="font-medium">{row.name}</p><p className="mt-1 text-xs text-muted-foreground">{score.label ?? "Ainda não calculado"}</p></td>
                    <ScoreCell value={score.overall} />
                    <ScoreCell value={score.opportunity} />
                    <ScoreCell value={score.commercial} />
                    <ScoreCell value={score.trend} />
                    <ScoreCell value={score.confidence} />
                    <td className="px-3 py-3 text-center">{Number(market.external_sales ?? 0).toLocaleString("pt-BR")}</td>
                    <td className="px-3 py-3 text-center">{market.growth_30d_pct == null ? "—" : `${Number(market.growth_30d_pct).toFixed(1)}%`}</td>
                    <td className="px-3 py-3"><div className="flex justify-end gap-1"><Button size="sm" variant="outline" onClick={() => recompute(row.id)} disabled={busy === row.id}>{busy === row.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}</Button><Button size="sm" variant="ghost" asChild><a href={`/admin/intelligence/${row.id}`}><ArrowUpRight className="h-4 w-4" /></a></Button></div></td>
                  </tr>
                );
              })}
              {!loading && filtered.length === 0 ? <tr><td colSpan={9} className="px-6 py-12 text-center text-muted-foreground">Nenhum produto neste filtro.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}

function ScoreCell({ value }: { value: unknown }) {
  const n = Number(value ?? 0);
  return <td className="px-3 py-3 text-center"><span className="inline-flex min-w-10 justify-center rounded-full border border-border px-2 py-1 font-semibold">{n || "—"}</span></td>;
}
