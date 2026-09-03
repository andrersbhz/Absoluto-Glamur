import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/format";
import {
  listDiscountSettings,
  removeDiscountSetting,
  saveDiscountSetting,
} from "@/lib/discounts.functions";

type Row = { id: string; scope: string; target_id: string | null; percent: number; enabled: boolean; name?: string };
type Settings = { global: Row | null; categories: Row[]; products: Row[] };

const clampPct = (value: string) => Math.min(100, Math.max(0, Number(value) || 0));

export function DiscountManager() {
  const load = useServerFn(listDiscountSettings);
  const save = useServerFn(saveDiscountSetting);
  const remove = useServerFn(removeDiscountSetting);

  const [settings, setSettings] = useState<Settings>({ global: null, categories: [], products: [] });
  const [busy, setBusy] = useState<string | null>(null);

  const [globalPct, setGlobalPct] = useState("0");
  const [globalOn, setGlobalOn] = useState(false);

  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [categoryPct, setCategoryPct] = useState("0");
  const [categoryOn, setCategoryOn] = useState(true);

  const [term, setTerm] = useState("");
  const [results, setResults] = useState<{ id: string; name: string }[]>([]);
  const [productId, setProductId] = useState("");
  const [productPct, setProductPct] = useState("0");
  const [productOn, setProductOn] = useState(true);
  const [productList, setProductList] = useState<number | null>(null);

  async function refresh() {
    try {
      const data = (await load()) as Settings;
      setSettings(data);
      setGlobalPct(String(Number(data.global?.percent ?? 0)));
      setGlobalOn(Boolean(data.global?.enabled));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao carregar descontos");
    }
  }

  useEffect(() => {
    void refresh();
    void (async () => {
      const { data } = await supabase.from("categories").select("id,name").order("name");
      setCategories((data ?? []) as { id: string; name: string }[]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      if (!term.trim()) { setResults([]); return; }
      const { data } = await supabase.from("products").select("id,name").ilike("name", `%${term.trim()}%`).limit(20);
      setResults((data ?? []) as { id: string; name: string }[]);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [term]);

  // Preço de tabela do produto selecionado (apenas para pré-visualização).
  useEffect(() => {
    if (!productId) { setProductList(null); return; }
    void (async () => {
      const { data } = await supabase
        .from("product_variants")
        .select("is_default, prices:product_prices(list_price_cents,is_active)")
        .eq("product_id", productId);
      const rows = (data ?? []) as { is_default: boolean; prices: { list_price_cents: number; is_active: boolean }[] | null }[];
      const variant = rows.find((v) => v.is_default) ?? rows[0];
      const price = variant?.prices?.find((p) => p.is_active) ?? variant?.prices?.[0];
      setProductList(price ? Number(price.list_price_cents) : null);
    })();
  }, [productId]);

  const productPreview = useMemo(() => {
    const pct = clampPct(productPct);
    if (!productList) return null;
    const final = pct > 0 ? Math.max(0, Math.round(productList * (1 - pct / 100))) : productList;
    return `${formatBRL(productList)} → ${pct}% OFF → ${formatBRL(final)}`;
  }, [productList, productPct]);

  async function apply(scope: "global" | "category" | "product", targetId: string | null, percent: number, enabled: boolean) {
    if (percent < 0 || percent > 100) return toast.error("O desconto deve ficar entre 0% e 100%");
    if (scope !== "global" && !targetId) return toast.error("Selecione o alvo do desconto");
    setBusy(scope);
    try {
      const res = await save({ data: { scope, target_id: targetId, percent, enabled } });
      toast.success(`Descontos atualizados com sucesso em ${res.updated} produto${res.updated === 1 ? "" : "s"}.`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível atualizar os descontos");
    } finally { setBusy(null); }
  }

  async function drop(id: string) {
    setBusy(id);
    try {
      const res = await remove({ data: { id } });
      toast.success(`Configuração removida. ${res.updated} produto(s) recalculado(s).`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível remover");
    } finally { setBusy(null); }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <div>
        <h2 className="font-display text-xl">Descontos e preço promocional</h2>
        <p className="text-xs text-muted-foreground">
          Prioridade: produto &gt; categoria &gt; global. Os descontos não se somam e só são aplicados ao clicar em
          “Atualizar”. Um produto definido com 0% permanece sem desconto.
        </p>
      </div>

      {/* Global */}
      <div className="mt-5 rounded-xl border border-border p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="text-muted-foreground">Desconto global %</span>
            <Input type="number" min={0} max={100} step="0.01" value={globalPct} onChange={(e) => setGlobalPct(e.target.value)} />
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <Switch checked={globalOn} onCheckedChange={setGlobalOn} /> Ativo
          </label>
          <Button
            className="ml-auto"
            disabled={busy === "global"}
            onClick={() => void apply("global", null, clampPct(globalPct), globalOn)}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${busy === "global" ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </div>
      </div>

      {/* Categoria */}
      <div className="mt-4 rounded-xl border border-border p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="text-muted-foreground">Categoria</span>
            <select className="input h-10 w-56 rounded-md border border-input bg-background px-3 text-sm" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Selecione…</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-muted-foreground">Desconto %</span>
            <Input type="number" min={0} max={100} step="0.01" value={categoryPct} onChange={(e) => setCategoryPct(e.target.value)} />
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <Switch checked={categoryOn} onCheckedChange={setCategoryOn} /> Ativo
          </label>
          <Button
            className="ml-auto"
            disabled={busy === "category"}
            onClick={() => void apply("category", categoryId || null, clampPct(categoryPct), categoryOn)}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${busy === "category" ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </div>
        <RuleList rows={settings.categories} busy={busy} onRemove={drop} onEdit={(r) => { setCategoryId(r.target_id ?? ""); setCategoryPct(String(Number(r.percent))); setCategoryOn(r.enabled); }} />
      </div>

      {/* Produto */}
      <div className="mt-4 rounded-xl border border-border p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Pesquisar produto…" value={term} onChange={(e) => { setTerm(e.target.value); setProductId(""); }} />
        </div>
        {results.length > 0 ? (
          <div className="mt-2 max-h-44 overflow-auto rounded-xl border border-border">
            {results.map((p) => (
              <button
                key={p.id}
                className={`block w-full border-b border-border px-3 py-2 text-left text-sm last:border-0 ${productId === p.id ? "bg-primary/10" : "hover:bg-secondary"}`}
                onClick={() => { setProductId(p.id); setTerm(p.name); setResults([]); }}
              >
                {p.name}
              </button>
            ))}
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="text-muted-foreground">Desconto %</span>
            <Input type="number" min={0} max={100} step="0.01" value={productPct} onChange={(e) => setProductPct(e.target.value)} />
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <Switch checked={productOn} onCheckedChange={setProductOn} /> Ativo
          </label>
          <Button
            className="ml-auto"
            disabled={busy === "product"}
            onClick={() => void apply("product", productId || null, clampPct(productPct), productOn)}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${busy === "product" ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </div>
        {productPreview ? <p className="mt-2 text-sm text-muted-foreground">{productPreview}</p> : null}
        <RuleList rows={settings.products} busy={busy} onRemove={drop} onEdit={(r) => { setProductId(r.target_id ?? ""); setTerm(r.name ?? ""); setProductPct(String(Number(r.percent))); setProductOn(r.enabled); }} />
      </div>
    </section>
  );
}

function RuleList({ rows, busy, onRemove, onEdit }: { rows: Row[]; busy: string | null; onRemove: (id: string) => void; onEdit: (row: Row) => void }) {
  if (!rows.length) return <p className="mt-3 text-xs text-muted-foreground">Nenhuma configuração salva.</p>;
  return (
    <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
      {rows.map((r) => (
        <li key={r.id} className="flex items-center gap-3 px-3 py-2 text-sm">
          <button className="flex-1 text-left hover:underline" onClick={() => onEdit(r)}>{r.name}</button>
          <span className="tabular-nums">{Number(r.percent)}%</span>
          <span className={`text-xs ${r.enabled ? "text-primary" : "text-muted-foreground"}`}>{r.enabled ? "ativo" : "inativo"}</span>
          <Button variant="ghost" size="icon" disabled={busy === r.id} onClick={() => onRemove(r.id)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </li>
      ))}
    </ul>
  );
}
