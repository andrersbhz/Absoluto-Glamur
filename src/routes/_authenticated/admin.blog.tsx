import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Archive, BookOpen, CheckCircle2, CircleAlert, Plus, RefreshCw, Save, Send, Share2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import {
  archiveBlogPost,
  createBlogCategory,
  createBlogDraft,
  generateBlogPostWithGemini,
  listBlogAdmin,
  publishBlogPost,
  retryBlogSocial,
  saveBlogPost,
  type BlogPostAdminInput,
} from "@/lib/blog-admin.functions";
import {
  getBlogMetaIntegrations,
  saveBlogMetaIntegration,
  testBlogMetaIntegration,
} from "@/lib/blog-meta.functions";

export const Route = createFileRoute("/_authenticated/admin/blog")({
  head: () => ({ meta: [{ title: "Blog SEO & Social · Admin Absoluto Glamur" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: admin } = await supabase.rpc("is_admin", { _user_id: data.user.id });
    if (!admin) throw redirect({ to: "/account" });
  },
  component: BlogAdminPage,
});

type EditorState = {
  id: string;
  category_id: string;
  title: string;
  slug: string;
  excerpt: string;
  content_html: string;
  featured_image_url: string;
  featured_image_alt: string;
  seo_title: string;
  meta_description: string;
  focus_keyword: string;
  secondary_keywords: string;
  tags: string;
  faq_json: string;
  social_caption_facebook: string;
  social_caption_instagram: string;
  social_hashtags: string;
  product_ids: string[];
};

function blankEditor(): EditorState {
  return {
    id: "",
    category_id: "",
    title: "",
    slug: "",
    excerpt: "",
    content_html: "",
    featured_image_url: "",
    featured_image_alt: "",
    seo_title: "",
    meta_description: "",
    focus_keyword: "",
    secondary_keywords: "",
    tags: "",
    faq_json: "[]",
    social_caption_facebook: "",
    social_caption_instagram: "",
    social_hashtags: "",
    product_ids: [],
  };
}

function commaArray(value: string) {
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
}

function editorFromPost(post: any, productIds: string[]): EditorState {
  return {
    id: String(post.id),
    category_id: String(post.category_id ?? ""),
    title: String(post.title ?? ""),
    slug: String(post.slug ?? ""),
    excerpt: String(post.excerpt ?? ""),
    content_html: String(post.content_html ?? ""),
    featured_image_url: String(post.featured_image_url ?? ""),
    featured_image_alt: String(post.featured_image_alt ?? ""),
    seo_title: String(post.seo_title ?? ""),
    meta_description: String(post.meta_description ?? ""),
    focus_keyword: String(post.focus_keyword ?? ""),
    secondary_keywords: Array.isArray(post.secondary_keywords) ? post.secondary_keywords.join(", ") : "",
    tags: Array.isArray(post.tags) ? post.tags.join(", ") : "",
    faq_json: JSON.stringify(Array.isArray(post.faq) ? post.faq : [], null, 2),
    social_caption_facebook: String(post.social_caption_facebook ?? ""),
    social_caption_instagram: String(post.social_caption_instagram ?? ""),
    social_hashtags: Array.isArray(post.social_hashtags) ? post.social_hashtags.join(", ") : "",
    product_ids: productIds,
  };
}

function BlogAdminPage() {
  const qc = useQueryClient();
  const list = useServerFn(listBlogAdmin);
  const createDraft = useServerFn(createBlogDraft);
  const createCategory = useServerFn(createBlogCategory);
  const savePost = useServerFn(saveBlogPost);
  const generate = useServerFn(generateBlogPostWithGemini);
  const publish = useServerFn(publishBlogPost);
  const archive = useServerFn(archiveBlogPost);
  const retrySocial = useServerFn(retryBlogSocial);

  const q = useQuery({ queryKey: ["blog-admin"], queryFn: () => list() });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState>(blankEditor());
  const [productSearch, setProductSearch] = useState("");
  const [generationTopic, setGenerationTopic] = useState("");

  const selectedPost = useMemo(
    () => (q.data?.posts ?? []).find((post: any) => post.id === selectedId) ?? null,
    [q.data?.posts, selectedId],
  );

  useEffect(() => {
    const posts = q.data?.posts ?? [];
    if (!selectedId && posts.length) setSelectedId(posts[0].id);
  }, [q.data?.posts, selectedId]);

  useEffect(() => {
    if (!selectedPost || !q.data) return;
    const ids = (q.data.links ?? [])
      .filter((link: any) => link.post_id === selectedPost.id)
      .sort((a: any, b: any) => Number(a.position ?? 0) - Number(b.position ?? 0))
      .map((link: any) => String(link.product_id));
    setEditor(editorFromPost(selectedPost, ids));
    setGenerationTopic(selectedPost.focus_keyword ? `Crie um guia completo sobre ${selectedPost.focus_keyword}` : "");
  }, [selectedPost, q.data]);

  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["blog-admin"] }),
      qc.invalidateQueries({ queryKey: ["blog-posts-public"] }),
      qc.invalidateQueries({ queryKey: ["blog-posts-latest"] }),
      qc.invalidateQueries({ queryKey: ["blog-post-public"] }),
    ]);
  }

  const createMut = useMutation({
    mutationFn: () => createDraft({ data: { title: "Novo artigo" } }),
    onSuccess: async (post) => {
      await refresh();
      setSelectedId(post.id);
      toast.success("Rascunho criado");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveMut = useMutation({
    mutationFn: (input: BlogPostAdminInput) => savePost({ data: input }),
    onSuccess: async (result) => {
      await refresh();
      toast.success(`Artigo salvo · SEO ${result.seo.score}/100`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const generateMut = useMutation({
    mutationFn: () => generate({
      data: {
        post_id: editor.id,
        topic: generationTopic,
        focus_keyword: editor.focus_keyword,
        category_id: editor.category_id || null,
        product_ids: editor.product_ids,
      },
    }),
    onSuccess: async (result) => {
      await refresh();
      toast.success(`Artigo gerado com Gemini · SEO ${result.seo.score}/100`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const publishMut = useMutation({
    mutationFn: () => publish({ data: { post_id: editor.id } }),
    onSuccess: async (result) => {
      await refresh();
      const social = result.social
        .map((item) => `${item.platform}: ${item.status === "published" ? "publicado" : item.status === "skipped" ? "ignorado" : "falhou"}`)
        .join(" · ");
      toast.success(`Artigo publicado · SEO ${result.seo.score}/100 · ${social}`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const archiveMut = useMutation({
    mutationFn: () => archive({ data: { post_id: editor.id } }),
    onSuccess: async () => {
      await refresh();
      toast.success("Artigo arquivado");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function buildSaveInput(): BlogPostAdminInput {
    let faq: Array<{ question: string; answer: string }> = [];
    try {
      faq = JSON.parse(editor.faq_json || "[]");
      if (!Array.isArray(faq)) throw new Error();
    } catch {
      throw new Error("FAQ precisa ser um array JSON válido.");
    }
    return {
      id: editor.id,
      category_id: editor.category_id || null,
      title: editor.title,
      slug: editor.slug,
      excerpt: editor.excerpt || null,
      content_html: editor.content_html,
      featured_image_url: editor.featured_image_url || null,
      featured_image_alt: editor.featured_image_alt || null,
      seo_title: editor.seo_title || null,
      meta_description: editor.meta_description || null,
      focus_keyword: editor.focus_keyword || null,
      secondary_keywords: commaArray(editor.secondary_keywords),
      tags: commaArray(editor.tags),
      faq,
      social_caption_facebook: editor.social_caption_facebook || null,
      social_caption_instagram: editor.social_caption_instagram || null,
      social_hashtags: commaArray(editor.social_hashtags),
      product_ids: editor.product_ids,
    };
  }

  const filteredProducts = useMemo(() => {
    const term = productSearch.toLowerCase().trim();
    return (q.data?.products ?? [])
      .filter((product: any) => !term || String(product.name).toLowerCase().includes(term) || String(product.category?.name ?? "").toLowerCase().includes(term))
      .slice(0, 60);
  }, [q.data?.products, productSearch]);

  const socialByPlatform = useMemo(() => {
    const map = new Map<string, any>();
    for (const item of q.data?.social ?? []) {
      if (item.post_id === selectedId && !map.has(item.platform)) map.set(item.platform, item);
    }
    return map;
  }, [q.data?.social, selectedId]);

  return (
    <AdminLayout>
      <div className="mx-auto max-w-[1500px]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Conteúdo orgânico + social</p>
            <h1 className="mt-2 text-3xl font-semibold">Blog SEO & Social</h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Produza conteúdo conectado aos produtos, gere com Gemini usando sua própria API e distribua automaticamente para Facebook e Instagram.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => createMut.mutate()}
              disabled={createMut.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> Novo artigo
            </button>
            <button
              onClick={async () => {
                const name = window.prompt("Nome da nova categoria editorial:");
                if (!name?.trim()) return;
                const description = window.prompt("Descrição curta da categoria (opcional):") ?? "";
                try {
                  await createCategory({ data: { name: name.trim(), description } });
                  await refresh();
                  toast.success("Categoria criada");
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Erro ao criar categoria");
                }
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-secondary"
            >
              <Plus className="h-4 w-4" /> Categoria
            </button>
          </div>
        </div>

        <MetaConnections />

        <div className="mt-8 grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="rounded-2xl border border-border bg-card p-3 shadow-soft xl:sticky xl:top-6 xl:self-start">
            <div className="flex items-center justify-between px-2 py-2">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Artigos</p>
              <button onClick={() => q.refetch()} className="rounded p-1.5 hover:bg-secondary" aria-label="Atualizar artigos">
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[72vh] space-y-1 overflow-auto pr-1">
              {(q.data?.posts ?? []).map((post: any) => (
                <button
                  key={post.id}
                  onClick={() => setSelectedId(post.id)}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition ${selectedId === post.id ? "border-primary/40 bg-primary/10" : "border-transparent hover:bg-secondary"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${post.status === "published" ? "text-success" : post.status === "archived" ? "text-muted-foreground" : "text-warning"}`}>
                      {post.status === "published" ? "Publicado" : post.status === "archived" ? "Arquivado" : "Rascunho"}
                    </span>
                    <span className={`text-xs font-semibold ${Number(post.seo_score ?? 0) >= 75 ? "text-success" : "text-warning"}`}>SEO {post.seo_score ?? 0}</span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm font-semibold leading-5">{post.title}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{post.focus_keyword || "Sem palavra-chave foco"}</p>
                </button>
              ))}
              {!q.isLoading && (q.data?.posts ?? []).length === 0 && (
                <p className="p-4 text-center text-sm text-muted-foreground">Crie o primeiro artigo.</p>
              )}
            </div>
          </aside>

          <main>
            {!editor.id ? (
              <div className="rounded-2xl border border-dashed border-border bg-card p-16 text-center">
                <BookOpen className="mx-auto h-9 w-9 text-primary/50" />
                <p className="mt-4 text-lg font-semibold">Selecione ou crie um artigo.</p>
              </div>
            ) : (
              <div className="space-y-6">
                <section className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-champagne/10 p-6 shadow-soft">
                  <div className="flex items-start gap-3">
                    <Sparkles className="mt-1 h-5 w-5 text-primary" />
                    <div className="flex-1">
                      <h2 className="text-lg font-semibold">Gerador Gemini com regras SEO</h2>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        O Gemini usa apenas sua chave configurada. Produtos selecionados entram como contexto e links internos reais.
                      </p>
                      <textarea
                        value={generationTopic}
                        onChange={(event) => setGenerationTopic(event.target.value)}
                        rows={3}
                        placeholder="Ex.: Guia completo para montar uma rotina de skincare para pele oleosa, explicando ordem dos passos, erros comuns e como escolher os produtos."
                        className="mt-4 w-full rounded-xl border border-border bg-background p-3 text-sm"
                      />
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <input
                          value={editor.focus_keyword}
                          onChange={(event) => setEditor((prev) => ({ ...prev, focus_keyword: event.target.value }))}
                          placeholder="Palavra-chave foco"
                          className="min-w-[260px] flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                        />
                        <button
                          onClick={() => generateMut.mutate()}
                          disabled={generateMut.isPending || generationTopic.trim().length < 10 || editor.focus_keyword.trim().length < 3}
                          className="inline-flex items-center gap-2 rounded-lg bg-plum px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                        >
                          <Sparkles className={`h-4 w-4 ${generateMut.isPending ? "animate-pulse" : ""}`} />
                          {generateMut.isPending ? "Gerando artigo..." : "Gerar com Gemini"}
                        </button>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold">Editor</h2>
                      <p className="text-xs text-muted-foreground">Todos os campos continuam editáveis depois da geração.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <SeoBadge post={selectedPost} />
                      {selectedPost?.status === "published" && (
                        <a href={`/blog/${editor.slug}`} target="_blank" rel="noreferrer" className="rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-secondary">
                          Ver artigo ↗
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="mt-6 grid gap-4 md:grid-cols-2">
                    <Field label="Título do artigo" className="md:col-span-2">
                      <input value={editor.title} onChange={(e) => setEditor((p) => ({ ...p, title: e.target.value }))} className="input-admin" />
                    </Field>
                    <Field label="Slug / URL">
                      <input value={editor.slug} onChange={(e) => setEditor((p) => ({ ...p, slug: e.target.value }))} className="input-admin font-mono text-xs" />
                    </Field>
                    <Field label="Categoria">
                      <select value={editor.category_id} onChange={(e) => setEditor((p) => ({ ...p, category_id: e.target.value }))} className="input-admin">
                        <option value="">Sem categoria</option>
                        {(q.data?.categories ?? []).map((category: any) => <option key={category.id} value={category.id}>{category.name}</option>)}
                      </select>
                    </Field>
                    <Field label="Resumo / excerpt" className="md:col-span-2">
                      <textarea value={editor.excerpt} onChange={(e) => setEditor((p) => ({ ...p, excerpt: e.target.value }))} rows={3} className="input-admin" />
                    </Field>
                    <Field label="Imagem destacada URL" className="md:col-span-2">
                      <input value={editor.featured_image_url} onChange={(e) => setEditor((p) => ({ ...p, featured_image_url: e.target.value }))} placeholder="https://..." className="input-admin" />
                    </Field>
                    <Field label="ALT da imagem" className="md:col-span-2">
                      <input value={editor.featured_image_alt} onChange={(e) => setEditor((p) => ({ ...p, featured_image_alt: e.target.value }))} className="input-admin" />
                    </Field>
                  </div>

                  <Field label="Conteúdo HTML do artigo" className="mt-4">
                    <textarea
                      value={editor.content_html}
                      onChange={(e) => setEditor((p) => ({ ...p, content_html: e.target.value }))}
                      rows={28}
                      spellCheck
                      className="input-admin font-mono text-[12px] leading-5"
                    />
                  </Field>
                </section>

                <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
                  <h2 className="text-lg font-semibold">SEO on-page</h2>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <Field label="SEO title">
                      <input value={editor.seo_title} onChange={(e) => setEditor((p) => ({ ...p, seo_title: e.target.value }))} className="input-admin" />
                      <Counter value={editor.seo_title} target="45–68" />
                    </Field>
                    <Field label="Palavra-chave foco">
                      <input value={editor.focus_keyword} onChange={(e) => setEditor((p) => ({ ...p, focus_keyword: e.target.value }))} className="input-admin" />
                    </Field>
                    <Field label="Meta description" className="md:col-span-2">
                      <textarea value={editor.meta_description} onChange={(e) => setEditor((p) => ({ ...p, meta_description: e.target.value }))} rows={3} className="input-admin" />
                      <Counter value={editor.meta_description} target="130–165" />
                    </Field>
                    <Field label="Palavras-chave secundárias">
                      <input value={editor.secondary_keywords} onChange={(e) => setEditor((p) => ({ ...p, secondary_keywords: e.target.value }))} placeholder="separadas por vírgula" className="input-admin" />
                    </Field>
                    <Field label="Tags">
                      <input value={editor.tags} onChange={(e) => setEditor((p) => ({ ...p, tags: e.target.value }))} placeholder="separadas por vírgula" className="input-admin" />
                    </Field>
                    <Field label="FAQ JSON" className="md:col-span-2">
                      <textarea value={editor.faq_json} onChange={(e) => setEditor((p) => ({ ...p, faq_json: e.target.value }))} rows={8} className="input-admin font-mono text-xs" />
                    </Field>
                  </div>
                  <SeoChecks post={selectedPost} />
                </section>

                <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
                  <h2 className="text-lg font-semibold">Produtos e links internos</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Selecione os produtos que podem ser citados no artigo. O Gemini só recebe dados desses itens.</p>
                  <input
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Buscar produto ou categoria"
                    className="input-admin mt-4"
                  />
                  <div className="mt-3 grid max-h-80 gap-2 overflow-auto sm:grid-cols-2">
                    {filteredProducts.map((product: any) => {
                      const checked = editor.product_ids.includes(product.id);
                      return (
                        <label key={product.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${checked ? "border-primary/40 bg-primary/5" : "border-border"}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => setEditor((prev) => ({
                              ...prev,
                              product_ids: e.target.checked
                                ? [...prev.product_ids, product.id]
                                : prev.product_ids.filter((id) => id !== product.id),
                            }))}
                            className="mt-1 h-4 w-4"
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold">{product.name}</span>
                            <span className="block text-xs text-muted-foreground">{product.category?.name ?? "Sem categoria"}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </section>

                <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
                  <h2 className="text-lg font-semibold">Distribuição social</h2>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <Field label="Legenda Facebook">
                      <textarea value={editor.social_caption_facebook} onChange={(e) => setEditor((p) => ({ ...p, social_caption_facebook: e.target.value }))} rows={6} className="input-admin" />
                    </Field>
                    <Field label="Legenda Instagram">
                      <textarea value={editor.social_caption_instagram} onChange={(e) => setEditor((p) => ({ ...p, social_caption_instagram: e.target.value }))} rows={6} className="input-admin" />
                    </Field>
                    <Field label="Hashtags" className="md:col-span-2">
                      <input value={editor.social_hashtags} onChange={(e) => setEditor((p) => ({ ...p, social_hashtags: e.target.value }))} placeholder="beleza, skincare, absolutoglamur" className="input-admin" />
                    </Field>
                  </div>
                  {selectedPost?.status === "published" && (
                    <div className="mt-5 grid gap-3 md:grid-cols-2">
                      {(["facebook", "instagram"] as const).map((platform) => {
                        const status = socialByPlatform.get(platform);
                        return (
                          <div key={platform} className="rounded-xl border border-border p-4">
                            <div className="flex items-center justify-between gap-3">
                              <p className="font-semibold capitalize">{platform}</p>
                              <SocialStatus status={status?.status} />
                            </div>
                            {status?.error && <p className="mt-2 text-xs text-destructive">{status.error}</p>}
                            {status?.status === "failed" && (
                              <button
                                onClick={async () => {
                                  try {
                                    const result = await retrySocial({ data: { post_id: editor.id, platform } });
                                    await refresh();
                                    result.status === "published" ? toast.success(`${platform} publicado`) : toast.error(result.error ?? "Falha na publicação");
                                  } catch (error) {
                                    toast.error(error instanceof Error ? error.message : "Falha ao tentar novamente");
                                  }
                                }}
                                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-secondary"
                              >
                                <RefreshCw className="h-3.5 w-3.5" /> Tentar novamente
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                <div className="sticky bottom-4 z-20 flex flex-wrap justify-end gap-2 rounded-2xl border border-border bg-background/95 p-3 shadow-elegant backdrop-blur">
                  <button
                    onClick={() => archiveMut.mutate()}
                    disabled={archiveMut.isPending}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-secondary"
                  >
                    <Archive className="h-4 w-4" /> Arquivar
                  </button>
                  <button
                    onClick={() => {
                      try { saveMut.mutate(buildSaveInput()); } catch (error) { toast.error((error as Error).message); }
                    }}
                    disabled={saveMut.isPending}
                    className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/20"
                  >
                    <Save className="h-4 w-4" /> {saveMut.isPending ? "Salvando..." : "Salvar"}
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        await savePost({ data: buildSaveInput() });
                        publishMut.mutate();
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : "Revise os campos antes de publicar");
                      }
                    }}
                    disabled={publishMut.isPending || saveMut.isPending}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" /> {publishMut.isPending ? "Publicando..." : "Publicar agora"}
                  </button>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </AdminLayout>
  );
}

function MetaConnections() {
  const qc = useQueryClient();
  const getMeta = useServerFn(getBlogMetaIntegrations);
  const saveMeta = useServerFn(saveBlogMetaIntegration);
  const testMeta = useServerFn(testBlogMetaIntegration);
  const q = useQuery({ queryKey: ["blog-meta-integrations"], queryFn: () => getMeta() });

  return (
    <section className="mt-8 rounded-2xl border border-border bg-card p-5 shadow-soft">
      <div className="flex items-center gap-3">
        <Share2 className="h-5 w-5 text-primary" />
        <div>
          <h2 className="text-lg font-semibold">Facebook + Instagram</h2>
          <p className="text-xs text-muted-foreground">Credenciais ficam no servidor. Ao publicar um artigo, a distribuição acontece imediatamente.</p>
        </div>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {(q.data ?? []).map((integration: any) => (
          <MetaCard
            key={integration.provider}
            integration={integration}
            onSave={async (payload) => {
              await saveMeta({ data: payload });
              await qc.invalidateQueries({ queryKey: ["blog-meta-integrations"] });
              toast.success(`${integration.display_name} salvo`);
            }}
            onTest={async () => {
              const result = await testMeta({ data: { provider: integration.provider } });
              await qc.invalidateQueries({ queryKey: ["blog-meta-integrations"] });
              toast.success(`Conectado: ${result.info.name}`);
            }}
          />
        ))}
      </div>
      <p className="mt-4 text-[11px] leading-5 text-muted-foreground">
        Use uma conta Instagram profissional conectada ao ecossistema empresarial da Meta. O token deve possuir as permissões necessárias para publicar nos ativos escolhidos.
      </p>
    </section>
  );
}

function MetaCard({ integration, onSave, onTest }: { integration: any; onSave: (payload: any) => Promise<void>; onTest: () => Promise<void> }) {
  const cfg = integration.config ?? {};
  const [enabled, setEnabled] = useState(integration.enabled === true);
  const [token, setToken] = useState("");
  const [objectId, setObjectId] = useState(integration.provider === "facebook" ? String(cfg.page_id ?? "") : String(cfg.ig_user_id ?? ""));
  const [version, setVersion] = useState(String(cfg.graph_version ?? "v23.0"));
  const [host, setHost] = useState(cfg.api_host === "https://graph.instagram.com" ? "https://graph.instagram.com" : "https://graph.facebook.com");
  const [auto, setAuto] = useState(cfg.auto_publish_blog !== false);
  const [busy, setBusy] = useState(false);

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold">{integration.display_name}</p>
          <p className="text-xs text-muted-foreground">{integration.token_masked ?? "Token não configurado"}</p>
        </div>
        <SocialStatus status={integration.last_status} />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label={integration.provider === "facebook" ? "Facebook Page ID" : "Instagram User ID"}>
          <input value={objectId} onChange={(e) => setObjectId(e.target.value)} className="input-admin font-mono text-xs" />
        </Field>
        <Field label="Versão Graph API">
          <input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="v23.0" className="input-admin font-mono text-xs" />
        </Field>
        <Field label="Token de acesso" className="sm:col-span-2">
          <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder={integration.has_token ? "Deixe vazio para manter o atual" : "Cole o token da Meta"} className="input-admin font-mono text-xs" />
        </Field>
        <Field label="Host da API">
          <select value={host} onChange={(e) => setHost(e.target.value)} className="input-admin">
            <option value="https://graph.facebook.com">graph.facebook.com</option>
            <option value="https://graph.instagram.com">graph.instagram.com</option>
          </select>
        </Field>
        <div className="flex flex-col justify-end gap-2 pb-1 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Integração ativa</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Publicar blog automaticamente</label>
        </div>
      </div>
      {integration.last_error && <p className="mt-3 text-xs text-destructive">{integration.last_error}</p>}
      <div className="mt-4 flex gap-2">
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onSave({
                provider: integration.provider,
                enabled,
                access_token: token || undefined,
                page_id: integration.provider === "facebook" ? objectId : undefined,
                ig_user_id: integration.provider === "instagram" ? objectId : undefined,
                graph_version: version,
                api_host: host,
                auto_publish_blog: auto,
              });
              setToken("");
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Erro ao salvar integração");
            } finally {
              setBusy(false);
            }
          }}
          className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >Salvar integração</button>
        <button
          disabled={busy || !integration.has_token}
          onClick={async () => {
            setBusy(true);
            try { await onTest(); } catch (error) { toast.error(error instanceof Error ? error.message : "Falha no teste"); } finally { setBusy(false); }
          }}
          className="rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-secondary disabled:opacity-50"
        >Testar conexão</button>
      </div>
    </div>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={`block text-sm ${className}`}><span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>{children}</label>;
}

function Counter({ value, target }: { value: string; target: string }) {
  return <span className="mt-1 block text-[10px] text-muted-foreground">{value.length} caracteres · referência {target}</span>;
}

function SeoBadge({ post }: { post: any }) {
  const score = Number(post?.seo_score ?? 0);
  const good = score >= 75;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${good ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
      {good ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleAlert className="h-3.5 w-3.5" />} SEO {score}/100
    </span>
  );
}

function SeoChecks({ post }: { post: any }) {
  const checks = post?.seo_checks && typeof post.seo_checks === "object" ? Object.values(post.seo_checks) as any[] : [];
  if (!checks.length) return null;
  return (
    <div className="mt-5 grid gap-2 md:grid-cols-2">
      {checks.map((check, index) => (
        <div key={`${check.label}-${index}`} className={`rounded-xl border p-3 ${check.ok ? "border-success/20 bg-success/5" : "border-warning/20 bg-warning/5"}`}>
          <p className={`flex items-center gap-2 text-xs font-semibold ${check.ok ? "text-success" : "text-warning"}`}>
            {check.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleAlert className="h-3.5 w-3.5" />} {check.label}
          </p>
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{check.detail}</p>
        </div>
      ))}
    </div>
  );
}

function SocialStatus({ status }: { status?: string | null }) {
  const normalized = status ?? "pending";
  const cls = normalized === "published" || normalized === "ok" ? "bg-success/10 text-success" : normalized === "failed" || normalized === "error" ? "bg-destructive/10 text-destructive" : "bg-secondary text-muted-foreground";
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] ${cls}`}>{normalized}</span>;
}
