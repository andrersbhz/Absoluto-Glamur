import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowLeft, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import {
  getAdminProduct,
  listBrandsAndCategories,
  upsertAdminProduct,
  type AdminProductInput,
} from "@/lib/admin-catalog.functions";

export const Route = createFileRoute("/_authenticated/admin/catalog/$id")({
  head: () => ({ meta: [{ title: "Editar produto · Admin Absoluto Glamur" }] }),
  beforeLoad: async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw redirect({ to: "/auth" });
    const { data: adm } = await supabase.rpc("is_admin", { _user_id: userData.user.id });
    if (adm) return;
    const { data: cat } = await supabase.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "catalog",
    });
    if (!cat) throw redirect({ to: "/account" });
  },
  component: CatalogEditor,
});

type FormState = {
  name: string;
  slug: string;
  short_description: string;
  description: string;
  status: "draft" | "active" | "archived";
  is_featured: boolean;
  brand_id: string;
  category_id: string;
  tags: string;
  sku: string;
  list_price: string;
  sale_price: string;
  stock: string;
  weight: string;
  media: { url: string; alt: string }[];
  meta_title: string;
  meta_description: string;
};

const empty: FormState = {
  name: "",
  slug: "",
  short_description: "",
  description: "",
  status: "draft",
  is_featured: false,
  brand_id: "",
  category_id: "",
  tags: "",
  sku: "",
  list_price: "",
  sale_price: "",
  stock: "0",
  weight: "",
  media: [],
  meta_title: "",
  meta_description: "",
};

function toCents(v: string): number {
  const n = Number(v.replace(",", "."));
  if (!isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}
function fromCents(c: number | null | undefined): string {
  if (c == null) return "";
  return (c / 100).toFixed(2);
}

function CatalogEditor() {
  const { id } = Route.useParams();
  const isNew = id === "new";
  const navigate = useNavigate();
  const getProd = useServerFn(getAdminProduct);
  const meta = useServerFn(listBrandsAndCategories);
  const upsert = useServerFn(upsertAdminProduct);

  const metaQ = useQuery({ queryKey: ["admin-cat-meta"], queryFn: () => meta() });
  const prodQ = useQuery({
    queryKey: ["admin-product", id],
    queryFn: () => getProd({ data: { id } }),
    enabled: !isNew,
  });

  const [form, setForm] = useState<FormState>(empty);

  useEffect(() => {
    if (!isNew && prodQ.data) {
      const p = prodQ.data;
      setForm({
        name: p.name,
        slug: p.slug,
        short_description: p.short_description ?? "",
        description: p.description ?? "",
        status: p.status,
        is_featured: p.is_featured,
        brand_id: p.brand_id ?? "",
        category_id: p.category_id ?? "",
        tags: p.tags.join(", "),
        sku: p.variant.sku,
        list_price: fromCents(p.variant.list_price_cents),
        sale_price: fromCents(p.variant.sale_price_cents),
        stock: String(p.variant.stock),
        weight: p.variant.weight_grams != null ? String(p.variant.weight_grams) : "",
        media: p.media.map((m) => ({ url: m.url, alt: m.alt ?? "" })),
        meta_title: p.seo.title ?? "",
        meta_description: p.seo.description ?? "",
      });
    }
  }, [isNew, prodQ.data]);

  const save = useMutation({
    mutationFn: (payload: AdminProductInput) => upsert({ data: payload }),
    onSuccess: (r) => {
      toast.success("Produto salvo");
      if (isNew) navigate({ to: "/admin/catalog/$id", params: { id: r.id! } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const list = toCents(form.list_price);
    if (list <= 0) {
      toast.error("Informe um preço válido.");
      return;
    }
    const saleNum = form.sale_price.trim() ? toCents(form.sale_price) : null;
    const payload: AdminProductInput = {
      id: isNew ? null : id,
      name: form.name.trim(),
      slug: form.slug.trim() || undefined,
      short_description: form.short_description.trim() || null,
      description: form.description.trim() || null,
      status: form.status,
      is_featured: form.is_featured,
      brand_id: form.brand_id || null,
      category_id: form.category_id || null,
      tags: form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      variant: {
        sku: form.sku.trim(),
        list_price_cents: list,
        sale_price_cents: saleNum && saleNum > 0 && saleNum < list ? saleNum : null,
        stock: Math.max(0, parseInt(form.stock || "0", 10) || 0),
        weight_grams: form.weight ? Math.max(0, parseInt(form.weight, 10) || 0) : null,
      },
      media: form.media
        .filter((m) => m.url.trim())
        .map((m) => ({ url: m.url.trim(), alt: m.alt.trim() || null })),
      seo: {
        title: form.meta_title.trim() || null,
        description: form.meta_description.trim() || null,
      },
    };
    save.mutate(payload);
  }

  const loading = !isNew && prodQ.isLoading;

  return (
    <AdminLayout>
      <div className="mx-auto max-w-4xl">
        <Link
          to="/admin/catalog"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar ao catálogo
        </Link>

        <h1 className="mt-3 font-display text-3xl">
          {isNew ? "Novo produto" : form.name || "Editar produto"}
        </h1>

        {loading ? (
          <p className="mt-10 text-sm text-muted-foreground">Carregando…</p>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-6">
            <Section title="Informações">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nome" required>
                  <input
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="input"
                  />
                </Field>
                <Field label="Slug (URL)" hint="Deixe vazio para gerar automaticamente.">
                  <input
                    value={form.slug}
                    onChange={(e) => setForm({ ...form, slug: e.target.value })}
                    placeholder="ex: serum-vitamina-c"
                    className="input font-mono text-sm"
                  />
                </Field>
                <Field label="Marca">
                  <select
                    value={form.brand_id}
                    onChange={(e) => setForm({ ...form, brand_id: e.target.value })}
                    className="input"
                  >
                    <option value="">— sem marca —</option>
                    {metaQ.data?.brands.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Categoria">
                  <select
                    value={form.category_id}
                    onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                    className="input"
                  >
                    <option value="">— sem categoria —</option>
                    {metaQ.data?.categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Descrição curta" hint="Aparece nos cards e listagens (máx. ~200 caracteres).">
                <textarea
                  value={form.short_description}
                  onChange={(e) => setForm({ ...form, short_description: e.target.value })}
                  rows={2}
                  className="input"
                />
              </Field>
              <Field label="Descrição completa">
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={6}
                  className="input"
                />
              </Field>
              <Field label="Tags" hint="Separadas por vírgula.">
                <input
                  value={form.tags}
                  onChange={(e) => setForm({ ...form, tags: e.target.value })}
                  className="input"
                  placeholder="hidratante, vegano, sensível"
                />
              </Field>
            </Section>

            <Section title="Preço e estoque">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="SKU" required>
                  <input
                    required
                    value={form.sku}
                    onChange={(e) => setForm({ ...form, sku: e.target.value })}
                    className="input font-mono"
                  />
                </Field>
                <Field label="Preço (R$)" required>
                  <input
                    required
                    inputMode="decimal"
                    value={form.list_price}
                    onChange={(e) => setForm({ ...form, list_price: e.target.value })}
                    className="input"
                    placeholder="0,00"
                  />
                </Field>
                <Field label="Preço promocional (R$)" hint="Opcional. Precisa ser menor que o preço.">
                  <input
                    inputMode="decimal"
                    value={form.sale_price}
                    onChange={(e) => setForm({ ...form, sale_price: e.target.value })}
                    className="input"
                    placeholder="0,00"
                  />
                </Field>
                <Field label="Estoque">
                  <input
                    type="number"
                    min={0}
                    value={form.stock}
                    onChange={(e) => setForm({ ...form, stock: e.target.value })}
                    className="input"
                  />
                </Field>
                <Field label="Peso (gramas)" hint="Usado para frete futuro.">
                  <input
                    type="number"
                    min={0}
                    value={form.weight}
                    onChange={(e) => setForm({ ...form, weight: e.target.value })}
                    className="input"
                  />
                </Field>
              </div>
            </Section>

            <Section title="Mídia (imagens)">
              <div className="space-y-3">
                {form.media.map((m, i) => (
                  <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                    <input
                      value={m.url}
                      onChange={(e) => {
                        const media = [...form.media];
                        media[i] = { ...media[i], url: e.target.value };
                        setForm({ ...form, media });
                      }}
                      placeholder="https://…"
                      className="input font-mono text-xs"
                    />
                    <input
                      value={m.alt}
                      onChange={(e) => {
                        const media = [...form.media];
                        media[i] = { ...media[i], alt: e.target.value };
                        setForm({ ...form, media });
                      }}
                      placeholder="Texto alternativo (acessibilidade)"
                      className="input text-xs"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setForm({ ...form, media: form.media.filter((_, j) => j !== i) })
                      }
                      className="rounded-lg border border-border p-2 text-destructive hover:bg-destructive/10"
                      aria-label="Remover imagem"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setForm({ ...form, media: [...form.media, { url: "", alt: "" }] })}
                  className="inline-flex items-center gap-1 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary"
                >
                  <Plus className="h-3.5 w-3.5" /> Adicionar imagem
                </button>
              </div>
            </Section>

            <Section title="SEO">
              <div className="grid gap-4">
                <Field label="Meta title" hint="Título mostrado no Google (recomendado &lt; 60 caracteres).">
                  <input
                    value={form.meta_title}
                    onChange={(e) => setForm({ ...form, meta_title: e.target.value })}
                    className="input"
                    maxLength={80}
                  />
                </Field>
                <Field label="Meta description" hint="Resumo no Google (recomendado &lt; 160 caracteres).">
                  <textarea
                    value={form.meta_description}
                    onChange={(e) => setForm({ ...form, meta_description: e.target.value })}
                    className="input"
                    rows={3}
                    maxLength={200}
                  />
                </Field>
              </div>
            </Section>

            <Section title="Publicação">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Status">
                  <select
                    value={form.status}
                    onChange={(e) =>
                      setForm({ ...form, status: e.target.value as FormState["status"] })
                    }
                    className="input"
                  >
                    <option value="draft">Rascunho (invisível na loja)</option>
                    <option value="active">Ativo (visível na loja)</option>
                    <option value="archived">Arquivado</option>
                  </select>
                </Field>
                <label className="flex items-end gap-2 pb-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.is_featured}
                    onChange={(e) => setForm({ ...form, is_featured: e.target.checked })}
                    className="h-4 w-4"
                  />
                  <span>Destacar na home</span>
                </label>
              </div>
            </Section>

            <div className="sticky bottom-0 -mx-6 border-t border-border bg-background/95 px-6 py-4 backdrop-blur lg:-mx-10 lg:px-10">
              <div className="mx-auto flex max-w-4xl items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {isNew ? "O produto é criado como rascunho até você mudar o status." : "As alterações entram no ar assim que você salvar."}
                </p>
                <button
                  type="submit"
                  disabled={save.isPending}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm text-primary-foreground shadow-soft disabled:opacity-60"
                >
                  <Save className="h-4 w-4" />
                  {save.isPending ? "Salvando…" : "Salvar produto"}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>

      <style>{`
        .input {
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid hsl(var(--border));
          background: hsl(var(--background));
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
        }
        .input:focus {
          outline: 2px solid hsl(var(--primary) / 0.4);
          outline-offset: 1px;
        }
      `}</style>
    </AdminLayout>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
      <h2 className="font-display text-lg">{title}</h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs text-muted-foreground">
        {label} {required && <span className="text-destructive">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}
