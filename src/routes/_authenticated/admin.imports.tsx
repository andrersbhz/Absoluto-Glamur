import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Boxes, Download, FileJson, Link2, Save, Settings2, Sparkles, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Badge } from "@/components/ui/badge";
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

// ============== API OFICIAL (placeholder) ==============

function ApiTab() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
      <Sparkles className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
      <h3 className="mb-2 font-display text-xl">API oficial AliExpress</h3>
      <p className="mx-auto max-w-md text-sm text-muted-foreground">
        Requer aprovação como parceiro/afiliado (AliExpress Open Platform). Após obter{" "}
        <code>AppKey</code> e <code>AppSecret</code>, cadastre em{" "}
        <Link to="/admin/integrations" className="text-primary underline">
          Integrações
        </Link>{" "}
        (provedor <code>aliexpress_api</code>) e este painel habilitará busca por ID de produto.
      </p>
      <p className="mt-4 text-xs text-muted-foreground">
        Enquanto isso, use <strong>URL (Firecrawl)</strong> ou <strong>JSON/CSV</strong>.
      </p>
    </div>
  );
}

// ============== HISTORY ==============

function HistoryTab() {
  const list = useServerFn(listImports);
  const del = useServerFn(deleteImport);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["imports"],
    queryFn: () => list({ data: {} }),
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
            <th className="px-4 py-3">Preço orig.</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {data.map((r: ImportRow) => (
            <tr key={r.id} className="border-t border-border">
              <td className="px-4 py-3">
                <Link
                  to="/admin/imports/$id"
                  params={{ id: r.id }}
                  className="font-medium text-foreground hover:text-primary"
                >
                  {r.normalized_data.title}
                </Link>
              </td>
              <td className="px-4 py-3 text-xs text-muted-foreground">{r.source}</td>
              <td className="px-4 py-3">
                <Badge
                  variant={
                    r.status === "imported" ? "default" : r.status === "failed" ? "destructive" : "secondary"
                  }
                >
                  {r.status}
                </Badge>
              </td>
              <td className="px-4 py-3 text-xs">
                {r.normalized_data.price_original
                  ? `${r.normalized_data.price_original} ${r.normalized_data.currency ?? ""}`
                  : "—"}
              </td>
              <td className="px-4 py-3 text-right">
                <button
                  onClick={() => {
                    if (confirm("Remover esta importação?")) delMut.mutate(r.id);
                  }}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </td>
            </tr>
          ))}
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
