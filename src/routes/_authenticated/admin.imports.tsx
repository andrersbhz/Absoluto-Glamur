import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  Boxes,
  Download,
  ExternalLink,
  FileJson,
  ImageOff,
  Link2,
  Save,
  Settings2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { formatBRL } from "@/lib/format";
import {
  listImports,
  scrapeUrlPreview,
  saveImportDraft,
  bulkImportJson,
  deleteImport,
  getImportSettings,
  saveImportSettings,
  type ImportRow,
  type NormalizedProduct,
  type ImportSettings,
} from "@/lib/aliexpress-import.functions";
import {
  discoverAliexpressProducts,
  importAliexpressProductToStore,
  type DiscoveryProduct,
} from "@/lib/aliexpress-discovery.functions";
import { suggestNicheKeywords } from "@/lib/ai-suggest-keywords.functions";


export const Route = createFileRoute("/_authenticated/admin/imports")({
  head: () => ({ meta: [{ title: "Importador · Admin Absoluto Glamur" }] }),
  beforeLoad: async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw redirect({ to: "/auth" });
    const { data: isAdm } = await supabase.rpc("is_admin", { _user_id: userData.user.id });
    if (isAdm) return;
    const { data: isCat } = await supabase.rpc("has_role", { _user_id: userData.user.id, _role: "catalog" });
    if (!isCat) throw redirect({ to: "/account" });
  },
  component: ImportsPage,
});

type Tab = "url" | "json" | "history" | "settings" | "api";

function ImportsPage() {
  const [tab, setTab] = useState<Tab>("url");
  return (
    <AdminLayout>
      <div className="mx-auto max-w-6xl p-6">
        <div className="mb-6 flex items-center gap-3">
          <Boxes className="h-6 w-6 text-primary" />
          <div>
            <h1 className="font-display text-3xl">Importador de produtos</h1>
            <p className="text-sm text-muted-foreground">
              Importe do AliExpress via URL, API oficial ou JSON/CSV. Configure markup e publique.
            </p>
          </div>
        </div>

        <div className="mb-6 flex flex-wrap gap-2 border-b border-border">
          <TabBtn active={tab === "url"} onClick={() => setTab("url")} icon={<Link2 className="h-4 w-4" />}>
            URL (Firecrawl)
          </TabBtn>
          <TabBtn active={tab === "json"} onClick={() => setTab("json")} icon={<FileJson className="h-4 w-4" />}>
            JSON / CSV
          </TabBtn>
          <TabBtn active={tab === "api"} onClick={() => setTab("api")} icon={<Sparkles className="h-4 w-4" />}>
            API oficial
          </TabBtn>
          <TabBtn active={tab === "history"} onClick={() => setTab("history")} icon={<Download className="h-4 w-4" />}>
            Histórico
          </TabBtn>
          <TabBtn active={tab === "settings"} onClick={() => setTab("settings")} icon={<Settings2 className="h-4 w-4" />}>
            Configurações
          </TabBtn>
        </div>

        {tab === "url" && <UrlTab />}
        {tab === "json" && <JsonTab />}
        {tab === "api" && <ApiTab />}
        {tab === "history" && <HistoryTab />}
        {tab === "settings" && <SettingsTab />}
      </div>
    </AdminLayout>
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm transition ${
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

// ============== URL TAB ==============

function UrlTab() {
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState<NormalizedProduct | null>(null);
  const scrape = useServerFn(scrapeUrlPreview);
  const save = useServerFn(saveImportDraft);
  const qc = useQueryClient();

  const previewMut = useMutation({
    mutationFn: (u: string) => scrape({ data: { url: u } }),
    onSuccess: (p) => {
      setPreview(p);
      toast.success("Produto extraído. Revise e salve como rascunho.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveMut = useMutation({
    mutationFn: () =>
      save({
        data: {
          source: "aliexpress_url",
          source_url: preview!.source_url,
          source_id: preview!.source_id,
          normalized: {
            title: preview!.title,
            description: preview!.description,
            images: preview!.images,
            price_original: preview!.price_original,
            currency: preview!.currency,
            sku: preview!.sku,
            weight_grams: preview!.weight_grams,
          },
        },
      }),
    onSuccess: () => {
      toast.success("Rascunho criado no Catálogo — abra em Catálogo para revisar e publicar");
      setPreview(null);
      setUrl("");
      qc.invalidateQueries({ queryKey: ["imports"] });
      qc.invalidateQueries({ queryKey: ["admin-products"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <label className="mb-2 block text-sm font-medium">Cole a URL do produto AliExpress</label>
        <div className="flex gap-2">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://pt.aliexpress.com/item/1005006123456789.html"
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <button
            disabled={!url || previewMut.isPending}
            onClick={() => previewMut.mutate(url)}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {previewMut.isPending ? "Extraindo..." : "Extrair"}
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Requer o conector <strong>Firecrawl</strong>. Sem ele, use a aba JSON/CSV.
        </p>
      </div>

      {preview && (
        <PreviewEditor
          value={preview}
          onChange={setPreview}
          onSave={() => saveMut.mutate()}
          saving={saveMut.isPending}
        />
      )}
    </div>
  );
}

function PreviewEditor({
  value,
  onChange,
  onSave,
  saving,
}: {
  value: NormalizedProduct;
  onChange: (v: NormalizedProduct) => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h3 className="mb-4 font-display text-xl">Prévia (edite antes de salvar)</h3>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Título">
          <input
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            value={value.title}
            onChange={(e) => onChange({ ...value, title: e.target.value })}
          />
        </Field>
        <Field label="SKU">
          <input
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            value={value.sku ?? ""}
            onChange={(e) => onChange({ ...value, sku: e.target.value || null })}
          />
        </Field>
        <Field label="Preço original">
          <input
            type="number"
            step="0.01"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            value={value.price_original ?? ""}
            onChange={(e) =>
              onChange({ ...value, price_original: e.target.value ? Number(e.target.value) : null })
            }
          />
        </Field>
        <Field label="Moeda">
          <input
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            value={value.currency ?? ""}
            onChange={(e) => onChange({ ...value, currency: e.target.value.toUpperCase() || null })}
          />
        </Field>
        <Field label="Peso (g)">
          <input
            type="number"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            value={value.weight_grams ?? ""}
            onChange={(e) =>
              onChange({ ...value, weight_grams: e.target.value ? Number(e.target.value) : null })
            }
          />
        </Field>
        <Field label="Imagens (uma URL por linha)" className="md:col-span-2">
          <textarea
            rows={4}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            value={value.images.join("\n")}
            onChange={(e) =>
              onChange({ ...value, images: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })
            }
          />
        </Field>
        <Field label="Descrição" className="md:col-span-2">
          <textarea
            rows={6}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            value={value.description ?? ""}
            onChange={(e) => onChange({ ...value, description: e.target.value || null })}
          />
        </Field>
      </div>
      <div className="mt-6 flex justify-end">
        <button
          onClick={onSave}
          disabled={saving || !value.title}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saving ? "Salvando..." : "Salvar rascunho"}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

// ============== JSON TAB ==============

function JsonTab() {
  const [json, setJson] = useState(
    JSON.stringify(
      [
        {
          title: "Sérum Vitamina C 30ml",
          description: "Sérum facial com ácido ascórbico 20% para uniformizar o tom da pele.",
          images: ["https://exemplo.com/serum.jpg"],
          price_original: 89.9,
          currency: "BRL",
          sku: "SER-VITC-30",
          weight_grams: 80,
        },
      ],
      null,
      2,
    ),
  );
  const bulk = useServerFn(bulkImportJson);
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: async () => {
      const parsed = JSON.parse(json);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      return bulk({ data: { items } });
    },
    onSuccess: (r) => {
      toast.success(`${r.count} rascunho(s) criado(s) no Catálogo.`);
      qc.invalidateQueries({ queryKey: ["imports"] });
      qc.invalidateQueries({ queryKey: ["admin-products"] });
    },
    onError: (e: Error) => toast.error("Erro: " + e.message),
  });

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="mb-2 font-display text-xl">Importação em massa (JSON)</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Cole um array JSON de produtos. Campos: <code>title</code> (obrigatório), <code>description</code>,{" "}
          <code>images</code>, <code>price_original</code>, <code>currency</code>, <code>sku</code>,{" "}
          <code>weight_grams</code>.
        </p>
        <textarea
          rows={16}
          value={json}
          onChange={(e) => setJson(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs"
        />
        <div className="mt-4 flex justify-end">
          <button
            onClick={() => mut.mutate()}
            disabled={mut.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {mut.isPending ? "Importando..." : "Importar rascunhos"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============== API OFICIAL — Sync IA best-sellers ==============

function ApiTab() {
  const [niche, setNiche] = useState("cosméticos e beleza");
  const [productType, setProductType] = useState("");
  const [minRating, setMinRating] = useState(4.5);
  const [perKeyword, setPerKeyword] = useState(8);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [items, setItems] = useState<DiscoveryProduct[]>([]);
  const [progress, setProgress] = useState<{ current: number; total: number; label: string } | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);

  const suggestFn = useServerFn(suggestNicheKeywords);
  const discoverFn = useServerFn(discoverAliexpressProducts);
  const importFn = useServerFn(importAliexpressProductToStore);
  const qc = useQueryClient();

  const syncMut = useMutation({
    mutationFn: async () => {
      setItems([]);
      setKeywords([]);
      setProgress({ current: 0, total: 1, label: "Consultando IA para termos best-sellers..." });
      const { keywords: kws } = await suggestFn({
        data: { niche, product_type: productType, count: 6 },
      });
      setKeywords(kws);
      if (kws.length === 0) throw new Error("A IA não retornou palavras-chave. Ajuste o nicho.");

      const map = new Map<string, DiscoveryProduct>();
      for (let i = 0; i < kws.length; i++) {
        const kw = kws[i];
        setProgress({ current: i + 1, total: kws.length, label: `Buscando: "${kw}"` });
        try {
          const res = await discoverFn({
            data: {
              keyword: kw,
              page: 1,
              page_size: perKeyword,
              sort: "SALE_PRICE_ASC",
              min_rating: minRating,
            },
          });
          for (const it of res.items) {
            if (!it.product_id || map.has(it.product_id)) continue;
            if (it.evaluate_rate != null && it.evaluate_rate < minRating) continue;
            map.set(it.product_id, it);
          }
        } catch (e) {
          console.warn("discover falhou para keyword", kw, e);
        }
      }
      // sort by (rating * log(sales))
      const sorted = Array.from(map.values()).sort((a, b) => {
        const sa = Math.log((a.lastest_volume ?? 0) + 1) * (a.evaluate_rate ?? 0);
        const sb = Math.log((b.lastest_volume ?? 0) + 1) * (b.evaluate_rate ?? 0);
        return sb - sa;
      });
      return sorted.slice(0, 60);
    },
    onSuccess: (arr) => {
      setItems(arr);
      setProgress(null);
      toast.success(`${arr.length} produto(s) best-seller encontrados`);
    },
    onError: (e: Error) => {
      setProgress(null);
      toast.error(e.message);
    },
  });

  const addToStore = async (productId: string) => {
    setAddingId(productId);
    try {
      await importFn({ data: { product_id: productId, status: "draft", stock: 10 } });
      toast.success("Adicionado ao Catálogo como rascunho");
      qc.invalidateQueries({ queryKey: ["admin-products"] });
      qc.invalidateQueries({ queryKey: ["imports"] });
      setItems((prev) => prev.filter((p) => p.product_id !== productId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setAddingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="mb-4 flex items-start gap-3">
          <Sparkles className="mt-1 h-5 w-5 text-primary" />
          <div>
            <h3 className="font-display text-xl">Sincronizar best-sellers via IA</h3>
            <p className="text-sm text-muted-foreground">
              A IA (Gemini via Lovable AI Gateway) gera palavras-chave estratégicas para o seu nicho e
              busca automaticamente os produtos mais vendidos e melhor avaliados na API oficial do AliExpress.
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Nicho da loja">
            <input
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              placeholder="cosméticos e beleza"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Tipo / categoria de produto (opcional)">
            <input
              value={productType}
              onChange={(e) => setProductType(e.target.value)}
              placeholder="ex.: sérum facial, batom líquido, máscara capilar"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Nota mínima do produto">
            <input
              type="number"
              step="0.1"
              min="0"
              max="5"
              value={minRating}
              onChange={(e) => setMinRating(Number(e.target.value))}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Produtos por palavra-chave">
            <input
              type="number"
              min="3"
              max="30"
              value={perKeyword}
              onChange={(e) => setPerKeyword(Number(e.target.value))}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </Field>
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            Requer a integração <strong>AliExpress</strong> conectada em{" "}
            <Link to="/admin/integrations" className="text-primary underline">
              Integrações
            </Link>
            .
          </div>
          <button
            onClick={() => syncMut.mutate()}
            disabled={syncMut.isPending || !niche.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" />
            {syncMut.isPending ? "Sincronizando..." : "Sincronizar com IA"}
          </button>
        </div>

        {progress && (
          <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3 text-xs">
            <div className="mb-2 flex justify-between">
              <span>{progress.label}</span>
              <span>
                {progress.current}/{progress.total}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {keywords.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {keywords.map((k) => (
              <Badge key={k} variant="outline" className="text-xs">
                {k}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {items.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => (
            <DiscoveryCard
              key={p.product_id}
              product={p}
              adding={addingId === p.product_id}
              onAdd={() => addToStore(p.product_id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DiscoveryCard({
  product,
  adding,
  onAdd,
}: {
  product: DiscoveryProduct;
  adding: boolean;
  onAdd: () => void;
}) {
  const priceLabel =
    product.price_original != null
      ? `${(product.currency ?? "USD").toUpperCase()} ${product.price_original.toFixed(2)}`
      : "—";
  const brlEstimate =
    product.price_brl_estimate_cents != null
      ? formatBRL(product.price_brl_estimate_cents)
      : null;
  const suggested =
    product.price_brl_estimate_cents != null
      ? formatBRL(Math.floor((product.price_brl_estimate_cents * 2.5) / 100) * 100 + 99)
      : null;

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="relative aspect-square bg-muted">
        {product.image ? (
          <img
            src={product.image}
            alt={product.title}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <ImageOff className="h-8 w-8" />
          </div>
        )}
        {product.evaluate_rate != null && (
          <div className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-xs font-medium text-white">
            ★ {product.evaluate_rate.toFixed(1)}
          </div>
        )}
        {product.lastest_volume != null && product.lastest_volume > 0 && (
          <div className="absolute right-2 top-2 rounded-full bg-primary/90 px-2 py-0.5 text-xs font-medium text-primary-foreground">
            {product.lastest_volume}+ vendas
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <h4 className="line-clamp-2 text-sm font-medium leading-snug">{product.title}</h4>
        <div className="text-xs text-muted-foreground">
          {product.shop_title ?? "Loja AliExpress"}
          {product.shop_rating != null && ` · ★ ${product.shop_rating.toFixed(1)}`}
        </div>
        <div className="mt-auto space-y-1 pt-2 text-xs">
          <div className="flex justify-between text-muted-foreground">
            <span>Custo</span>
            <span>{priceLabel}{brlEstimate ? ` (~${brlEstimate})` : ""}</span>
          </div>
          {suggested && (
            <div className="flex justify-between font-medium text-primary">
              <span>Sugerido</span>
              <span>{suggested}</span>
            </div>
          )}
        </div>
        <div className="mt-2 flex gap-2">
          {product.product_url && (
            <a
              href={product.product_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-3 w-3" />
              Ver
            </a>
          )}
          <button
            onClick={onAdd}
            disabled={adding}
            className="flex-1 rounded-lg bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            {adding ? "Adicionando..." : "Adicionar à loja"}
          </button>
        </div>
      </div>
    </div>
  );
}


// ============== HISTORY ==============

function suggestedSaleCents(priceOriginal: number | null, currency: string | null, s: ImportSettings | null) {
  if (priceOriginal == null || !s) return null;
  const inBrl = (currency ?? "BRL").toUpperCase() === "BRL" ? priceOriginal : priceOriginal * s.fx_rate;
  const baseCents = Math.round(inBrl * 100);
  const withMarkup = Math.round(baseCents * (1 + s.markup_percent / 100)) + s.markup_fixed_cents;
  if (!s.round_to_99) return withMarkup;
  const reais = Math.floor(withMarkup / 100);
  return reais * 100 + 99;
}

function statusVariant(status: ImportRow["status"]): "default" | "destructive" | "secondary" | "outline" {
  if (status === "imported") return "default";
  if (status === "failed") return "destructive";
  if (status === "archived") return "outline";
  return "secondary";
}

function sourceLabel(source: string) {
  if (source.startsWith("aliexpress")) return "AliExpress";
  if (source === "json") return "JSON/CSV";
  return source;
}

function HistoryTab() {
  const list = useServerFn(listImports);
  const del = useServerFn(deleteImport);
  const getSettings = useServerFn(getImportSettings);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["imports"],
    queryFn: () => list({ data: {} }),
  });
  const { data: settings } = useQuery({
    queryKey: ["import-settings"],
    queryFn: () => getSettings(),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Removido");
      qc.invalidateQueries({ queryKey: ["imports"] });
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando...</p>;
  if (!data || data.length === 0)
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
        <p className="text-sm text-muted-foreground">Nenhuma importação ainda.</p>
      </div>
    );

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-3">Produto</th>
            <th className="px-4 py-3">Fonte</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3 text-right">Preço original</th>
            <th className="px-4 py-3 text-right">Venda sugerida</th>
            <th className="px-4 py-3 text-center">AliExpress</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {data.map((r: ImportRow) => {
            const norm = r.normalized_data;
            const thumb = norm.images?.[0] ?? null;
            const currency = (norm.currency ?? "BRL").toUpperCase();
            const originalLabel =
              norm.price_original == null
                ? "—"
                : currency === "BRL"
                  ? formatBRL(Math.round(norm.price_original * 100))
                  : `${currency} ${norm.price_original.toFixed(2)}`;
            const sale = suggestedSaleCents(norm.price_original, norm.currency, settings ?? null);
            return (
              <tr key={r.id} className="border-t border-border">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
                      {thumb ? (
                        <img
                          src={thumb}
                          alt={norm.title}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                          <ImageOff className="h-4 w-4" />
                        </div>
                      )}
                    </div>
                    <Link
                      to="/admin/imports/$id"
                      params={{ id: r.id }}
                      className="line-clamp-2 font-medium text-foreground hover:text-primary"
                    >
                      {norm.title}
                    </Link>
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{sourceLabel(r.source)}</td>
                <td className="px-4 py-3">
                  <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                </td>
                <td className="px-4 py-3 text-right text-xs">{originalLabel}</td>
                <td className="px-4 py-3 text-right text-xs font-medium text-primary">
                  {sale != null ? formatBRL(sale) : "—"}
                </td>
                <td className="px-4 py-3 text-center">
                  {r.source_url ? (
                    <a
                      href={r.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Ver no AliExpress"
                      className="inline-flex items-center justify-center text-muted-foreground transition hover:text-primary"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => {
                      if (confirm("Remover esta importação?")) delMut.mutate(r.id);
                    }}
                    className="text-muted-foreground hover:text-destructive"
                    title="Remover"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}


// ============== SETTINGS ==============

function SettingsTab() {
  const get = useServerFn(getImportSettings);
  const save = useServerFn(saveImportSettings);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["import-settings"], queryFn: () => get() });
  const [form, setForm] = useState<ImportSettings | null>(null);
  const current = form ?? data ?? null;

  const mut = useMutation({
    mutationFn: (s: ImportSettings) => save({ data: s }),
    onSuccess: () => {
      toast.success("Configurações salvas");
      qc.invalidateQueries({ queryKey: ["import-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!current) return <p className="text-sm text-muted-foreground">Carregando...</p>;

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h3 className="mb-2 font-display text-xl">Regras de precificação</h3>
      <p className="mb-6 text-sm text-muted-foreground">
        Aplicado automaticamente ao publicar cada importação. Você ainda pode ajustar por produto.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Markup percentual (%)">
          <input
            type="number"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            value={current.markup_percent}
            onChange={(e) => setForm({ ...current, markup_percent: Number(e.target.value) })}
          />
        </Field>
        <Field label="Taxa fixa adicional (R$ centavos)">
          <input
            type="number"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            value={current.markup_fixed_cents}
            onChange={(e) => setForm({ ...current, markup_fixed_cents: Number(e.target.value) })}
          />
        </Field>
        <Field label="Câmbio (1 USD → BRL)">
          <input
            type="number"
            step="0.01"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            value={current.fx_rate}
            onChange={(e) => setForm({ ...current, fx_rate: Number(e.target.value) })}
          />
        </Field>
        <Field label="Status padrão na publicação">
          <select
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            value={current.default_status}
            onChange={(e) =>
              setForm({ ...current, default_status: e.target.value as "draft" | "active" })
            }
          >
            <option value="draft">Rascunho</option>
            <option value="active">Ativo (publicar direto)</option>
          </select>
        </Field>
        <label className="col-span-full mt-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={current.round_to_99}
            onChange={(e) => setForm({ ...current, round_to_99: e.target.checked })}
          />
          Arredondar preço final para R$ X,99 (mais atrativo)
        </label>
      </div>
      <div className="mt-6 flex justify-end">
        <button
          onClick={() => mut.mutate(current)}
          disabled={mut.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {mut.isPending ? "Salvando..." : "Salvar configurações"}
        </button>
      </div>

      <div className="mt-8 rounded-lg bg-muted/50 p-4 text-xs text-muted-foreground">
        <strong>Como o preço é calculado:</strong> preço original → converte para BRL (via câmbio) →
        aplica markup% → soma taxa fixa → arredonda para X,99 (se ativo). Exemplo: US$ 8.50 × 5.5 = R$
        46.75; +150% = R$ 116.87; arredondado → R$ 116,99.
      </div>
    </div>
  );
}
