import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  FileVideo,
  ImageIcon,
  Plus,
  Save,
  Search,
  Star,
  Tag,
  Trash2,
  Upload,
} from "lucide-react";


import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { isVideoUrl } from "@/lib/media-kind";
import { AdminLayout } from "@/components/admin/AdminLayout";
import {
  getAdminProduct,
  listBrandsAndCategories,
  upsertAdminProduct,
  type AdminProductInput,
} from "@/lib/admin-catalog.functions";
import { syncAliexpressStock } from "@/lib/aliexpress-stock.functions";
import { syncAliexpressVariants } from "@/lib/aliexpress-variants.functions";
import { RefreshCw } from "lucide-react";

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
  const n = Number(v.replace(/\./g, "").replace(",", "."));
  if (!isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}
function fromCents(c: number | null | undefined): string {
  if (c == null) return "";
  return (c / 100).toFixed(2).replace(".", ",");
}
function slugify(v: string) {
  return v
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 80);
}
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

type TabId = "general" | "pricing" | "variants" | "media" | "seo" | "publish";

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
  const [tab, setTab] = useState<TabId>("general");
  const [slugTouched, setSlugTouched] = useState(false);

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
      setSlugTouched(true);
    }
  }, [isNew, prodQ.data]);

  // Auto-slug from name until user touches slug field
  useEffect(() => {
    if (isNew && !slugTouched) {
      setForm((f) => ({ ...f, slug: slugify(f.name) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.name]);

  const listCents = toCents(form.list_price);
  const saleCents = form.sale_price.trim() ? toCents(form.sale_price) : 0;
  const discount =
    saleCents > 0 && saleCents < listCents ? Math.round((1 - saleCents / listCents) * 100) : 0;

  const save = useMutation({
    mutationFn: (payload: AdminProductInput) => upsert({ data: payload }),
    onSuccess: (r) => {
      toast.success("Produto salvo com sucesso");
      if (isNew) navigate({ to: "/admin/catalog/$id", params: { id: r.id! } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const syncStockFn = useServerFn(syncAliexpressStock);
  const syncStock = useMutation({
    mutationFn: (opts: { silent?: boolean } | void) =>
      syncStockFn({ data: { product_id: id } }).then((r) => ({ ...r, silent: !!opts?.silent })),
    onSuccess: (r) => {
      setForm((f) => ({ ...f, stock: String(r.total_stock) }));
      if (!r.silent) {
        toast.success(`Estoque AliExpress: ${r.total_stock} unidades (${r.variants_updated} variantes)`);
      }
      prodQ.refetch();
    },
    onError: (e: Error, vars) => {
      if (!vars || !(vars as { silent?: boolean }).silent) toast.error(e.message);
    },
  });


  const syncVariantsFn = useServerFn(syncAliexpressVariants);
  const syncVariants = useMutation({
    mutationFn: () => syncVariantsFn({ data: { product_id: id } }),
    onSuccess: (r) => {
      toast.success(`Variações sincronizadas: ${r.variants_upserted}${r.total_skus ? ` de ${r.total_skus}` : ""}`);
      prodQ.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });


  // Auto-sync stock from AliExpress on first open (silently, only if linked).
  const autoSyncedRef = useRef<string | null>(null);
  useEffect(() => {
    if (isNew) return;
    if (!prodQ.data) return;
    if (autoSyncedRef.current === id) return;
    autoSyncedRef.current = id;
    syncStock.mutate({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, prodQ.data]);


  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Informe o nome do produto.");
      setTab("general");
      return;
    }
    if (!form.sku.trim()) {
      toast.error("Informe o SKU.");
      setTab("pricing");
      return;
    }
    if (listCents <= 0) {
      toast.error("Informe um preço válido.");
      setTab("pricing");
      return;
    }
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
        list_price_cents: listCents,
        sale_price_cents: saleCents > 0 && saleCents < listCents ? saleCents : null,
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
  const cover = form.media[0]?.url;

  const tabs: { id: TabId; label: string; hint?: string }[] = useMemo(
    () => [
      { id: "general", label: "Geral" },
      { id: "pricing", label: "Preço & Estoque" },
      { id: "media", label: `Mídia (${form.media.length})` },
      { id: "seo", label: "SEO" },
      { id: "publish", label: "Publicação" },
    ],
    [form.media.length],
  );

  function moveMedia(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= form.media.length) return;
    const media = [...form.media];
    [media[i], media[j]] = [media[j], media[i]];
    setForm({ ...form, media });
  }

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function handleUploadFiles(files: FileList | File[]) {
    const arr = Array.from(files).filter((f) =>
      /^(image|video)\//.test(f.type),
    );
    if (arr.length === 0) {
      toast.error("Selecione imagens ou vídeos válidos.");
      return;
    }
    const MAX = 50 * 1024 * 1024;
    const oversized = arr.filter((f) => f.size > MAX);
    if (oversized.length) {
      toast.error(`${oversized.length} arquivo(s) acima de 50MB foram ignorados.`);
    }
    const toUpload = arr.filter((f) => f.size <= MAX);
    if (toUpload.length === 0) return;

    setUploading(true);
    setUploadProgress({ done: 0, total: toUpload.length });
    const uploaded: { url: string; alt: string }[] = [];
    try {
      for (let i = 0; i < toUpload.length; i++) {
        const file = toUpload[i];
        const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 60);
        const path = `${id}/${Date.now()}-${i}-${safeName}`.replace(/\/{2,}/g, "/");
        const { error: upErr } = await supabase.storage
          .from("product-media")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) {
          toast.error(`Falha ao enviar ${file.name}: ${upErr.message}`);
          continue;
        }
        const { data: signed, error: signErr } = await supabase.storage
          .from("product-media")
          .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
        if (signErr || !signed?.signedUrl) {
          toast.error(`Falha ao gerar URL de ${file.name}`);
          continue;
        }
        uploaded.push({ url: signed.signedUrl, alt: file.name.replace(/\.[^.]+$/, "") });
        setUploadProgress({ done: i + 1, total: toUpload.length });
        void ext;
      }
      if (uploaded.length) {
        setForm((f) => ({ ...f, media: [...f.media, ...uploaded] }));
        toast.success(`${uploaded.length} mídia(s) adicionada(s).`);
      }
    } finally {
      setUploading(false);
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }



  return (
    <AdminLayout>
      <div className="mx-auto max-w-6xl pb-32">
        <Link
          to="/admin/catalog"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar ao catálogo
        </Link>

        {/* Header */}
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate font-display text-3xl">
                {isNew ? "Novo produto" : form.name || "Editar produto"}
              </h1>
              <StatusBadge status={form.status} />
              {form.is_featured && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] text-primary">
                  <Star className="h-3 w-3" /> Destaque
                </span>
              )}
            </div>
            {form.slug && (
              <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                /produtos/{form.slug}
              </p>
            )}
          </div>
        </div>

        {loading ? (
          <p className="mt-10 text-sm text-muted-foreground">Carregando…</p>
        ) : (
          <form onSubmit={submit} className="mt-6">
            {/* Tabs */}
            <div className="sticky top-0 z-10 -mx-2 flex gap-1 overflow-x-auto border-b border-border bg-background/95 px-2 py-2 backdrop-blur">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition ${
                    tab === t.id
                      ? "bg-primary text-primary-foreground shadow-soft"
                      : "text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
              <div className="space-y-6">
                {tab === "general" && (
                  <Section title="Informações básicas">
                    <Field label="Nome do produto" required>
                      <input
                        required
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        className="input"
                        placeholder="Ex: Sérum facial vitamina C 30ml"
                      />
                    </Field>
                    <Field label="Slug (URL)" hint="Gerado automaticamente a partir do nome.">
                      <div className="flex items-center rounded-lg border border-border bg-background focus-within:outline focus-within:outline-2 focus-within:outline-primary/40">
                        <span className="pl-3 font-mono text-xs text-muted-foreground">
                          /produtos/
                        </span>
                        <input
                          value={form.slug}
                          onChange={(e) => {
                            setSlugTouched(true);
                            setForm({ ...form, slug: slugify(e.target.value) });
                          }}
                          placeholder="serum-vitamina-c"
                          className="w-full bg-transparent px-2 py-2 font-mono text-sm focus:outline-none"
                        />
                      </div>
                    </Field>
                    <div className="grid gap-4 sm:grid-cols-2">
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
                    <Field
                      label="Descrição curta"
                      hint={`${form.short_description.length}/200 · aparece nos cards e listagens.`}
                    >
                      <textarea
                        value={form.short_description}
                        onChange={(e) =>
                          setForm({ ...form, short_description: e.target.value.slice(0, 200) })
                        }
                        rows={2}
                        className="input"
                        placeholder="Frase que resume o benefício principal."
                      />
                    </Field>
                    <Field label="Descrição completa" hint="Suporta quebras de linha.">
                      <textarea
                        value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                        rows={8}
                        className="input"
                        placeholder="Ingredientes, modo de uso, benefícios detalhados…"
                      />
                    </Field>
                    <Field label="Tags" hint="Separadas por vírgula.">
                      <div className="relative">
                        <Tag className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <input
                          value={form.tags}
                          onChange={(e) => setForm({ ...form, tags: e.target.value })}
                          className="input pl-8"
                          placeholder="hidratante, vegano, sensível"
                        />
                      </div>
                      {form.tags.trim() && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {form.tags
                            .split(",")
                            .map((t) => t.trim())
                            .filter(Boolean)
                            .map((t, i) => (
                              <span
                                key={i}
                                className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground"
                              >
                                #{t}
                              </span>
                            ))}
                        </div>
                      )}
                    </Field>
                  </Section>
                )}

                {tab === "pricing" && (
                  <Section title="Preço, SKU e estoque">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="SKU (código único)" required>
                        <input
                          required
                          value={form.sku}
                          onChange={(e) => setForm({ ...form, sku: e.target.value })}
                          className="input font-mono"
                          placeholder="AG-SER-VITC-30"
                        />
                      </Field>
                      <Field label="Estoque disponível" hint={isNew ? undefined : "Sincroniza automaticamente ao abrir. Use o botão para forçar atualização."}>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            min={0}
                            value={form.stock}
                            onChange={(e) => setForm({ ...form, stock: e.target.value })}
                            className="input flex-1"
                          />
                          {!isNew && (
                            <>
                              <button
                                type="button"
                                onClick={() => syncStock.mutate()}

                                disabled={syncStock.isPending}
                                title="Sincronizar estoque com AliExpress"
                                className="inline-flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/10 px-3 text-xs font-medium text-primary transition hover:bg-primary/20 disabled:opacity-50"
                              >
                                <RefreshCw className={`h-3.5 w-3.5 ${syncStock.isPending ? "animate-spin" : ""}`} />
                                AliExpress
                              </button>
                              <button
                                type="button"
                                onClick={() => syncVariants.mutate()}
                                disabled={syncVariants.isPending}
                                title="Buscar e criar variações (cor/tamanho) do AliExpress"
                                className="inline-flex items-center gap-1 rounded-lg border border-champagne/40 bg-champagne/10 px-3 text-xs font-medium text-champagne transition hover:bg-champagne/20 disabled:opacity-50"
                              >
                                <RefreshCw className={`h-3.5 w-3.5 ${syncVariants.isPending ? "animate-spin" : ""}`} />
                                Variações
                              </button>
                            </>
                          )}
                        </div>
                      </Field>

                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Preço cheio" required hint="Valor em reais (R$).">
                        <MoneyInput
                          value={form.list_price}
                          onChange={(v) => setForm({ ...form, list_price: v })}
                          required
                        />
                      </Field>
                      <Field
                        label="Preço promocional"
                        hint="Opcional. Precisa ser menor que o preço cheio."
                      >
                        <MoneyInput
                          value={form.sale_price}
                          onChange={(v) => setForm({ ...form, sale_price: v })}
                        />
                      </Field>
                    </div>
                    {(listCents > 0 || saleCents > 0) && (
                      <div className="rounded-xl border border-border bg-secondary/40 p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Como aparecerá na loja
                        </p>
                        <div className="mt-2 flex items-baseline gap-3">
                          {saleCents > 0 && saleCents < listCents ? (
                            <>
                              <span className="font-display text-2xl text-foreground">
                                {brl.format(saleCents / 100)}
                              </span>
                              <span className="text-sm text-muted-foreground line-through">
                                {brl.format(listCents / 100)}
                              </span>
                              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">
                                −{discount}%
                              </span>
                            </>
                          ) : (
                            <span className="font-display text-2xl text-foreground">
                              {brl.format(listCents / 100)}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    <Field label="Peso (gramas)" hint="Usado para cálculo de frete.">
                      <input
                        type="number"
                        min={0}
                        value={form.weight}
                        onChange={(e) => setForm({ ...form, weight: e.target.value })}
                        className="input"
                        placeholder="80"
                      />
                    </Field>
                  </Section>
                )}

                {tab === "media" && (
                  <Section title="Mídias do produto">
                    <p className="text-xs text-muted-foreground">
                      A primeira mídia é a capa. Envie do computador (imagens JPG/PNG/WEBP/GIF ou
                      vídeos MP4/WEBM/MOV) ou cole URLs externas. Você pode selecionar vários
                      arquivos de uma vez.
                    </p>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*,video/*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files && e.target.files.length > 0) {
                          void handleUploadFiles(e.target.files);
                        }
                      }}
                    />

                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (e.dataTransfer.files?.length) {
                          void handleUploadFiles(e.dataTransfer.files);
                        }
                      }}
                      className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 p-6 text-center"
                    >
                      <Upload className="h-6 w-6 text-primary" />
                      <p className="text-sm text-foreground">
                        Arraste arquivos aqui ou selecione múltiplos do computador
                      </p>
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <button
                          type="button"
                          disabled={uploading}
                          onClick={() => fileInputRef.current?.click()}
                          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground shadow-soft transition hover:opacity-90 disabled:opacity-50"
                        >
                          <Upload className="h-4 w-4" />
                          {uploading
                            ? uploadProgress
                              ? `Enviando ${uploadProgress.done}/${uploadProgress.total}…`
                              : "Enviando…"
                            : "Selecionar arquivos"}
                        </button>
                        <span className="text-[11px] text-muted-foreground">
                          Até 50MB por arquivo · imagens e vídeos
                        </span>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {form.media.map((m, i) => {
                        const isVideo = isVideoUrl(m.url);
                        return (
                        <div
                          key={i}
                          className="grid gap-3 rounded-xl border border-border bg-card p-3 sm:grid-cols-[72px_1fr_auto]"
                        >
                          <div className="flex h-[72px] w-[72px] items-center justify-center overflow-hidden rounded-lg border border-border bg-secondary">
                            {m.url ? (
                              <MediaThumb url={m.url} alt={m.alt} isVideo={isVideo} />
                            ) : (
                              <ImageIcon className="h-6 w-6 text-muted-foreground" />
                            )}
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              {i === 0 && (
                                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] text-primary">
                                  Capa
                                </span>
                              )}
                              <span className="text-[11px] text-muted-foreground">
                                Posição {i + 1}
                              </span>
                              {m.url && (
                                <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                                  {isVideo ? "Vídeo" : /\.gif(\?|#|$)/i.test(m.url) ? "GIF" : "Imagem"}
                                </span>
                              )}
                            </div>
                            <input
                              value={m.url}
                              onChange={(e) => {
                                const media = [...form.media];
                                media[i] = { ...media[i], url: e.target.value };
                                setForm({ ...form, media });
                              }}
                              placeholder="https://… (imagem, gif ou vídeo)"
                              className="input font-mono text-xs"
                            />
                            <input
                              value={m.alt}
                              onChange={(e) => {
                                const media = [...form.media];
                                media[i] = { ...media[i], alt: e.target.value };
                                setForm({ ...form, media });
                              }}
                              placeholder="Descrição da mídia (acessibilidade)"
                              className="input text-xs"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <button
                              type="button"
                              onClick={() => moveMedia(i, -1)}
                              disabled={i === 0}
                              className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-secondary disabled:opacity-30"
                              aria-label="Mover para cima"
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveMedia(i, 1)}
                              disabled={i === form.media.length - 1}
                              className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-secondary disabled:opacity-30"
                              aria-label="Mover para baixo"
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setForm({ ...form, media: form.media.filter((_, j) => j !== i) })
                              }
                              className="rounded-md border border-border p-1.5 text-destructive hover:bg-destructive/10"
                              aria-label="Remover imagem"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() =>
                          setForm({ ...form, media: [...form.media, { url: "", alt: "" }] })
                        }
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground hover:bg-secondary"
                      >
                        <Plus className="h-4 w-4" /> Adicionar URL manualmente
                      </button>
                    </div>
                  </Section>
                )}


                {tab === "seo" && (
                  <Section title="Otimização para busca (SEO)">
                    <Field
                      label="Meta title"
                      hint={`${form.meta_title.length}/60 · título mostrado no Google.`}
                    >
                      <input
                        value={form.meta_title}
                        onChange={(e) =>
                          setForm({ ...form, meta_title: e.target.value.slice(0, 80) })
                        }
                        className="input"
                        placeholder={form.name || "Título otimizado para o Google"}
                      />
                    </Field>
                    <Field
                      label="Meta description"
                      hint={`${form.meta_description.length}/160 · resumo mostrado no Google.`}
                    >
                      <textarea
                        value={form.meta_description}
                        onChange={(e) =>
                          setForm({ ...form, meta_description: e.target.value.slice(0, 200) })
                        }
                        className="input"
                        rows={3}
                        placeholder={
                          form.short_description || "Descrição atrativa com benefícios e call-to-action."
                        }
                      />
                    </Field>
                    <div className="rounded-xl border border-border bg-secondary/40 p-4">
                      <p className="mb-2 flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground">
                        <Search className="h-3 w-3" /> Prévia no Google
                      </p>
                      <p className="truncate text-sm text-primary underline">
                        {form.meta_title || form.name || "Título do produto"}
                      </p>
                      <p className="text-xs text-emerald-600 dark:text-emerald-400">
                        absolutoglamur.com.br › produtos › {form.slug || "slug-do-produto"}
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {form.meta_description ||
                          form.short_description ||
                          "Escreva uma descrição atrativa para aparecer aqui."}
                      </p>
                    </div>
                  </Section>
                )}

                {tab === "publish" && (
                  <Section title="Status e visibilidade">
                    <Field label="Status na loja">
                      <select
                        value={form.status}
                        onChange={(e) =>
                          setForm({ ...form, status: e.target.value as FormState["status"] })
                        }
                        className="input"
                      >
                        <option value="draft">Rascunho — invisível na loja</option>
                        <option value="active">Ativo — visível para clientes</option>
                        <option value="archived">Arquivado — removido do catálogo</option>
                      </select>
                    </Field>
                    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-card p-4">
                      <input
                        type="checkbox"
                        checked={form.is_featured}
                        onChange={(e) => setForm({ ...form, is_featured: e.target.checked })}
                        className="h-4 w-4"
                      />
                      <div>
                        <p className="text-sm font-medium">Destacar na home</p>
                        <p className="text-xs text-muted-foreground">
                          Produtos em destaque aparecem em blocos configurados no marketing.
                        </p>
                      </div>
                    </label>
                  </Section>
                )}
              </div>

              {/* Aside preview */}
              <aside className="space-y-4 lg:sticky lg:top-16 lg:self-start">
                <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
                  <div className="relative flex aspect-[4/5] items-center justify-center overflow-hidden bg-secondary">
                    {cover ? (
                      isVideoUrl(cover) ? (
                        <video
                          src={cover}
                          className="h-full w-full object-cover"
                          muted
                          loop
                          autoPlay
                          playsInline
                        />
                      ) : (
                        <img src={cover} alt={form.name} className="h-full w-full object-cover" />
                      )
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <ImageIcon className="h-8 w-8" />
                        <p className="text-xs">Sem imagem</p>
                      </div>
                    )}
                  </div>
                  {form.media.length > 1 && (
                    <div className="flex gap-1.5 overflow-x-auto border-t border-border bg-secondary/40 p-2">
                      {form.media.slice(0, 8).map((m, idx) =>
                        m.url ? (
                          <div
                            key={`${m.url}-${idx}`}
                            className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-md border border-border bg-background"
                          >
                            {isVideoUrl(m.url) ? (
                              <>
                                <video src={m.url} className="h-full w-full object-cover" muted playsInline />
                                <span className="absolute bottom-0 right-0 rounded-tl bg-black/60 px-1 text-[9px] text-white">
                                  vídeo
                                </span>
                              </>
                            ) : (
                              <img src={m.url} alt={m.alt ?? ""} className="h-full w-full object-cover" />
                            )}
                          </div>
                        ) : null,
                      )}
                    </div>
                  )}
                  <div className="space-y-2 p-4">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {metaQ.data?.brands.find((b) => b.id === form.brand_id)?.name ??
                        "Sem marca"}
                    </p>
                    <p className="line-clamp-2 font-display text-base">
                      {form.name || "Nome do produto"}
                    </p>
                    {listCents > 0 ? (
                      <div className="flex items-baseline gap-2">
                        <span className="font-display text-lg">
                          {brl.format(
                            (saleCents > 0 && saleCents < listCents ? saleCents : listCents) / 100,
                          )}
                        </span>
                        {saleCents > 0 && saleCents < listCents && (
                          <span className="text-xs text-muted-foreground line-through">
                            {brl.format(listCents / 100)}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">Sem preço</span>
                    )}
                  </div>
                </div>
                <div className="rounded-2xl border border-border bg-card p-4 text-xs shadow-soft">
                  <p className="mb-2 font-medium">Checklist</p>
                  <ul className="space-y-1.5 text-muted-foreground">
                    <Check ok={!!form.name.trim()}>Nome preenchido</Check>
                    <Check ok={!!form.sku.trim()}>SKU definido</Check>
                    <Check ok={listCents > 0}>Preço cheio</Check>
                    <Check ok={form.media.length > 0 && !!form.media[0].url}>
                      Pelo menos 1 imagem
                    </Check>
                    <Check ok={!!form.short_description.trim()}>Descrição curta</Check>
                    <Check ok={!!form.category_id}>Categoria selecionada</Check>
                  </ul>
                </div>
              </aside>
            </div>

            {/* Sticky save bar */}
            <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
              <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
                <p className="hidden text-xs text-muted-foreground sm:block">
                  {isNew
                    ? "O produto é criado como rascunho até você mudar o status para Ativo."
                    : "As alterações entram no ar assim que você salvar."}
                </p>
                <div className="flex items-center gap-2">
                  <Link
                    to="/admin/catalog"
                    className="rounded-lg border border-border px-4 py-2.5 text-sm text-muted-foreground hover:bg-secondary"
                  >
                    Cancelar
                  </Link>
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
      <span className="mb-1 block text-xs font-medium text-muted-foreground">
        {label} {required && <span className="text-destructive">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

function MoneyInput({
  value,
  onChange,
  required,
}: {
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
        R$
      </span>
      <input
        required={required}
        inputMode="decimal"
        value={value}
        onChange={(e) => {
          const cleaned = e.target.value.replace(/[^0-9,.]/g, "");
          onChange(cleaned);
        }}
        className="input pl-12"
        placeholder="0,00"
      />
    </div>
  );
}

function StatusBadge({ status }: { status: "draft" | "active" | "archived" }) {
  const map = {
    draft: { label: "Rascunho", cls: "bg-muted text-muted-foreground" },
    active: { label: "Ativo", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
    archived: { label: "Arquivado", cls: "bg-orange-500/15 text-orange-600 dark:text-orange-400" },
  } as const;
  const cfg = map[status];
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] ${cfg.cls}`}>{cfg.label}</span>
  );
}

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      <span
        className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${
          ok ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"
        }`}
      >
        {ok ? "✓" : "•"}
      </span>
      <span className={ok ? "text-foreground" : ""}>{children}</span>
    </li>
  );
}

function MediaThumb({ url, alt, isVideo }: { url: string; alt: string; isVideo: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
        {isVideo ? <FileVideo className="h-6 w-6" /> : <ImageIcon className="h-6 w-6" />}
        <span className="text-[9px] uppercase tracking-wide">{isVideo ? "vídeo" : "imagem"}</span>
      </div>
    );
  }
  if (isVideo) {
    return (
      <video
        src={url}
        className="h-full w-full object-cover"
        muted
        playsInline
        loop
        autoPlay
        preload="metadata"
        crossOrigin="anonymous"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <img
      src={url}
      alt={alt || ""}
      className="h-full w-full object-cover"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

