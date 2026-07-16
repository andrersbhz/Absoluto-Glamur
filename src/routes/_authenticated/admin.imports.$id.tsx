import { createFileRoute, redirect, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Package, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Badge } from "@/components/ui/badge";
import {
  getImport,
  updateImportDraft,
  commitImport,
  getImportSettings,
  computeSalePriceCents,
  type NormalizedProduct,
} from "@/lib/aliexpress-import.functions";
import { listBrandsAndCategories } from "@/lib/admin-catalog.functions";
import { formatBRL } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/imports/$id")({
  head: () => ({ meta: [{ title: "Editar importação · Admin" }] }),
  beforeLoad: async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw redirect({ to: "/auth" });
    const { data: isAdm } = await supabase.rpc("is_admin", { _user_id: userData.user.id });
    if (isAdm) return;
    const { data: isCat } = await supabase.rpc("has_role", { _user_id: userData.user.id, _role: "catalog" });
    if (!isCat) throw redirect({ to: "/account" });
  },
  component: ImportDetail,
});

function ImportDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const getFn = useServerFn(getImport);
  const updateFn = useServerFn(updateImportDraft);
  const commitFn = useServerFn(commitImport);
  const getSettings = useServerFn(getImportSettings);
  const getRefs = useServerFn(listBrandsAndCategories);

  const { data: imp, isLoading, refetch } = useQuery({
    queryKey: ["import", id],
    queryFn: () => getFn({ data: { id } }),
  });
  const { data: settings } = useQuery({ queryKey: ["import-settings"], queryFn: () => getSettings() });
  const { data: refs } = useQuery({ queryKey: ["admin-refs"], queryFn: () => getRefs() });

  const [form, setForm] = useState<NormalizedProduct | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [brandId, setBrandId] = useState<string | null>(null);
  const [stock, setStock] = useState(10);
  const [markupOverride, setMarkupOverride] = useState<string>("");
  const [priceOverride, setPriceOverride] = useState<string>("");
  const [status, setStatus] = useState<"draft" | "active">("draft");

  useEffect(() => {
    if (imp && !form) {
      setForm(imp.normalized_data);
    }
  }, [imp, form]);

  useEffect(() => {
    if (settings) setStatus(settings.default_status);
  }, [settings]);

  const saveDraft = useMutation({
    mutationFn: () =>
      updateFn({
        data: {
          id,
          normalized: {
            title: form!.title,
            description: form!.description,
            images: form!.images,
            price_original: form!.price_original,
            currency: form!.currency,
            sku: form!.sku,
            weight_grams: form!.weight_grams,
          },
        },
      }),
    onSuccess: () => {
      toast.success("Rascunho atualizado");
      refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const commit = useMutation({
    mutationFn: async () => {
      await updateFn({
        data: {
          id,
          normalized: {
            title: form!.title,
            description: form!.description,
            images: form!.images,
            price_original: form!.price_original,
            currency: form!.currency,
            sku: form!.sku,
            weight_grams: form!.weight_grams,
          },
        },
      });
      return commitFn({
        data: {
          id,
          status,
          category_id: categoryId,
          brand_id: brandId,
          stock,
          markup_override_percent: markupOverride ? Number(markupOverride) : null,
          sale_price_cents_override: priceOverride ? Math.round(Number(priceOverride) * 100) : null,
        },
      });
    },
    onSuccess: (r) => {
      toast.success(`Publicado: ${formatBRL(r.price_cents)}`);
      navigate({ to: "/admin/catalog/$id", params: { id: r.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !imp || !form) {
    return (
      <AdminLayout>
        <div className="p-6 text-sm text-muted-foreground">Carregando...</div>
      </AdminLayout>
    );
  }

  const effectiveSettings = settings && {
    ...settings,
    markup_percent: markupOverride ? Number(markupOverride) : settings.markup_percent,
  };
  const previewCents = priceOverride
    ? Math.round(Number(priceOverride) * 100)
    : effectiveSettings
      ? computeSalePriceCents(form.price_original, form.currency, effectiveSettings)
      : 0;

  return (
    <AdminLayout>
      <div className="mx-auto max-w-5xl p-6">
        <Link
          to="/admin/imports"
          className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl">Editar importação</h1>
            <p className="text-xs text-muted-foreground">
              Fonte: <code>{imp.source}</code>
              {imp.source_url && (
                <>
                  {" · "}
                  <a href={imp.source_url} target="_blank" rel="noreferrer" className="text-primary underline">
                    ver original
                  </a>
                </>
              )}
            </p>
          </div>
          <Badge variant={imp.status === "imported" ? "default" : "secondary"}>{imp.status}</Badge>
        </div>

        {imp.status === "imported" && imp.product_id && (
          <div className="mb-6 flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            <span>Já publicado. </span>
            <Link
              to="/admin/catalog/$id"
              params={{ id: imp.product_id }}
              className="text-primary underline"
            >
              Abrir produto no catálogo
            </Link>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <Card title="Informações">
              <Fld label="Título">
                <input
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </Fld>
              <div className="grid gap-4 md:grid-cols-3">
                <Fld label="SKU">
                  <input
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    value={form.sku ?? ""}
                    onChange={(e) => setForm({ ...form, sku: e.target.value || null })}
                  />
                </Fld>
                <Fld label="Preço original">
                  <input
                    type="number"
                    step="0.01"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    value={form.price_original ?? ""}
                    onChange={(e) =>
                      setForm({ ...form, price_original: e.target.value ? Number(e.target.value) : null })
                    }
                  />
                </Fld>
                <Fld label="Moeda">
                  <input
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    value={form.currency ?? ""}
                    onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() || null })}
                  />
                </Fld>
              </div>
              <Fld label="Descrição">
                <textarea
                  rows={6}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={form.description ?? ""}
                  onChange={(e) => setForm({ ...form, description: e.target.value || null })}
                />
              </Fld>
              <Fld label="Imagens (uma URL por linha)">
                <textarea
                  rows={4}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={form.images.join("\n")}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      images: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean),
                    })
                  }
                />
              </Fld>
            </Card>
          </div>

          <div className="space-y-4">
            <Card title="Publicação">
              <Fld label="Status">
                <select
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as "draft" | "active")}
                >
                  <option value="draft">Rascunho</option>
                  <option value="active">Ativo (publicar)</option>
                </select>
              </Fld>
              <Fld label="Categoria">
                <select
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={categoryId ?? ""}
                  onChange={(e) => setCategoryId(e.target.value || null)}
                >
                  <option value="">— nenhuma —</option>
                  {refs?.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Fld>
              <Fld label="Marca">
                <select
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={brandId ?? ""}
                  onChange={(e) => setBrandId(e.target.value || null)}
                >
                  <option value="">— nenhuma —</option>
                  {refs?.brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </Fld>
              <Fld label="Estoque inicial">
                <input
                  type="number"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={stock}
                  onChange={(e) => setStock(Number(e.target.value))}
                />
              </Fld>
            </Card>

            <Card title="Preço de venda">
              <Fld label={`Markup override (%) — padrão: ${settings?.markup_percent ?? 150}%`}>
                <input
                  type="number"
                  placeholder="usar padrão"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={markupOverride}
                  onChange={(e) => setMarkupOverride(e.target.value)}
                />
              </Fld>
              <Fld label="Ou preço fixo (R$) — ignora markup">
                <input
                  type="number"
                  step="0.01"
                  placeholder="opcional"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={priceOverride}
                  onChange={(e) => setPriceOverride(e.target.value)}
                />
              </Fld>
              <div className="rounded-lg bg-primary/10 p-3 text-center">
                <div className="text-xs text-muted-foreground">Preço final calculado</div>
                <div className="font-display text-2xl text-primary">{formatBRL(previewCents)}</div>
              </div>
            </Card>

            <div className="flex flex-col gap-2">
              <button
                onClick={() => saveDraft.mutate()}
                disabled={saveDraft.isPending}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                Salvar rascunho
              </button>
              <button
                onClick={() => commit.mutate()}
                disabled={commit.isPending || imp.status === "imported"}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                <Package className="h-4 w-4" />
                {commit.isPending ? "Publicando..." : "Publicar no catálogo"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="mb-4 font-display text-lg">{title}</h3>
      <div className="space-y-4">{children}</div>
    </div>
  );
}
function Fld({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
