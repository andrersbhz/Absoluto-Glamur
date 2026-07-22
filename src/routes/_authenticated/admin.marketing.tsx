import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, ArrowUp, ArrowDown, Save, ImagePlus, Loader2 } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { homepageBlocksAdminQuery, collectionsAdminQuery, homeContentQuery, type HomeContent } from "@/lib/marketing";
import { upsertSiteSetting } from "@/lib/site-settings.functions";
import { useServerFn } from "@tanstack/react-start";
import { imageFileToWebpDataUri } from "@/lib/image-webp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/admin/marketing")({
  beforeLoad: async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);
    const list = (roles ?? []).map((r) => r.role as string);
    if (!list.includes("admin") && !list.includes("superadmin") && !list.includes("marketing")) {
      throw redirect({ to: "/account" });
    }
  },
  component: MarketingAdmin,
});

const BLOCK_KINDS = [
  { value: "hero", label: "Hero (banner)" },
  { value: "collection", label: "Coleção destacada" },
  { value: "category_grid", label: "Grade de categorias" },
  { value: "banner", label: "Banner promocional" },
  { value: "text", label: "Texto livre" },
];

function MarketingAdmin() {
  return (
    <AdminLayout>
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl">Marketing & SEO</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Controle os blocos da homepage, coleções em destaque e SEO da loja.
            </p>
          </div>
        </div>

        <Tabs defaultValue="homepage" className="mt-6">
          <TabsList>
            <TabsTrigger value="homepage">Homepage</TabsTrigger>
            <TabsTrigger value="content">Conteúdo Home</TabsTrigger>
            <TabsTrigger value="collections">Coleções</TabsTrigger>
            <TabsTrigger value="seo">SEO</TabsTrigger>
          </TabsList>
          <TabsContent value="homepage" className="mt-6">
            <HomepageBlocksPanel />
          </TabsContent>
          <TabsContent value="content" className="mt-6">
            <HomeContentPanel />
          </TabsContent>
          <TabsContent value="collections" className="mt-6">
            <CollectionsPanel />
          </TabsContent>
          <TabsContent value="seo" className="mt-6">
            <SeoPanel />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}

function HomeContentPanel() {
  const qc = useQueryClient();
  const { data: current } = useQuery(homeContentQuery());
  const save = useServerFn(upsertSiteSetting);
  const [draft, setDraft] = useState<HomeContent | null>(null);
  const [saving, setSaving] = useState(false);

  const value: HomeContent = draft ?? current ?? {};
  const patch = (fn: (v: HomeContent) => HomeContent) => setDraft(fn(value));

  const handleSave = async () => {
    setSaving(true);
    try {
      await save({ data: { key: "home_content", value: value as Record<string, unknown> } });
      toast.success("Conteúdo da home atualizado");
      qc.invalidateQueries({ queryKey: ["site-settings", "home_content"] });
      setDraft(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const hero = value.hero ?? {};
  const manifesto = value.manifesto ?? {};
  const pillars = value.pillars ?? {};
  const pillarItems = pillars.items ?? [];
  const badges = value.trust_badges ?? [];
  const slider = value.hero_slider ?? {};
  const sliderSlides = slider.slides ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Edite os textos e imagens editoriais da home. Ativo em tempo real após salvar.
        </p>
        <Button onClick={handleSave} disabled={saving || !draft}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Salvar
        </Button>
      </div>

      <section className="rounded-2xl border border-border bg-card p-5">
        <h3 className="font-display text-lg">Barra de anúncio</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-[auto_1fr] sm:items-center">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={value.announcement?.enabled !== false}
              onChange={(e) => patch((v) => ({ ...v, announcement: { ...v.announcement, enabled: e.target.checked } }))}
            />
            Ativa
          </label>
          <Input
            placeholder="Frete grátis acima de R$ 299 · Embalagem assinatura"
            value={value.announcement?.text ?? ""}
            onChange={(e) => patch((v) => ({ ...v, announcement: { ...v.announcement, text: e.target.value } }))}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <h3 className="font-display text-lg">Hero</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Input placeholder="Selo (badge)" value={hero.badge ?? ""} onChange={(e) => patch((v) => ({ ...v, hero: { ...v.hero, badge: e.target.value } }))} />
          <Input placeholder="URL da imagem (opcional)" value={hero.image_url ?? ""} onChange={(e) => patch((v) => ({ ...v, hero: { ...v.hero, image_url: e.target.value } }))} />
          <Input placeholder="Título linha 1" value={hero.title_line1 ?? ""} onChange={(e) => patch((v) => ({ ...v, hero: { ...v.hero, title_line1: e.target.value } }))} />
          <Input placeholder="Título em destaque" value={hero.title_highlight ?? ""} onChange={(e) => patch((v) => ({ ...v, hero: { ...v.hero, title_highlight: e.target.value } }))} />
          <Textarea className="sm:col-span-2" placeholder="Subtítulo" value={hero.subtitle ?? ""} onChange={(e) => patch((v) => ({ ...v, hero: { ...v.hero, subtitle: e.target.value } }))} />
          <Input placeholder="CTA primário — texto" value={hero.cta_primary_label ?? ""} onChange={(e) => patch((v) => ({ ...v, hero: { ...v.hero, cta_primary_label: e.target.value } }))} />
          <Input placeholder="CTA primário — link" value={hero.cta_primary_href ?? ""} onChange={(e) => patch((v) => ({ ...v, hero: { ...v.hero, cta_primary_href: e.target.value } }))} />
          <Input placeholder="CTA secundário — texto" value={hero.cta_secondary_label ?? ""} onChange={(e) => patch((v) => ({ ...v, hero: { ...v.hero, cta_secondary_label: e.target.value } }))} />
          <Input placeholder="CTA secundário — link" value={hero.cta_secondary_href ?? ""} onChange={(e) => patch((v) => ({ ...v, hero: { ...v.hero, cta_secondary_href: e.target.value } }))} />
          <Input placeholder="Monograma (ex: A·G)" value={hero.monogram ?? ""} onChange={(e) => patch((v) => ({ ...v, hero: { ...v.hero, monogram: e.target.value } }))} />
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Selo esquerda" value={hero.seal_left ?? ""} onChange={(e) => patch((v) => ({ ...v, hero: { ...v.hero, seal_left: e.target.value } }))} />
            <Input placeholder="Selo direita" value={hero.seal_right ?? ""} onChange={(e) => patch((v) => ({ ...v, hero: { ...v.hero, seal_right: e.target.value } }))} />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg">Selos de confiança</h3>
          <Button size="sm" variant="outline" onClick={() => patch((v) => ({ ...v, trust_badges: [...(v.trust_badges ?? []), { label: "" }] }))}>
            <Plus className="mr-1 h-4 w-4" /> Adicionar
          </Button>
        </div>
        <div className="mt-3 space-y-2">
          {badges.map((b, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={b.label}
                onChange={(e) => patch((v) => {
                  const arr = [...(v.trust_badges ?? [])];
                  arr[i] = { label: e.target.value };
                  return { ...v, trust_badges: arr };
                })}
              />
              <Button size="icon" variant="ghost" onClick={() => patch((v) => ({ ...v, trust_badges: (v.trust_badges ?? []).filter((_, j) => j !== i) }))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <h3 className="font-display text-lg">Manifesto</h3>
        <div className="mt-3 grid gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={manifesto.enabled !== false}
              onChange={(e) => patch((v) => ({ ...v, manifesto: { ...v.manifesto, enabled: e.target.checked } }))}
            />
            Exibir seção
          </label>
          <Input placeholder="Eyebrow (ex: Manifesto)" value={manifesto.eyebrow ?? ""} onChange={(e) => patch((v) => ({ ...v, manifesto: { ...v.manifesto, eyebrow: e.target.value } }))} />
          <Textarea rows={4} placeholder="Corpo do manifesto" value={manifesto.body ?? ""} onChange={(e) => patch((v) => ({ ...v, manifesto: { ...v.manifesto, body: e.target.value } }))} />
          <Input placeholder="Assinatura" value={manifesto.signature ?? ""} onChange={(e) => patch((v) => ({ ...v, manifesto: { ...v.manifesto, signature: e.target.value } }))} />
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg">Pilares</h3>
          <Button size="sm" variant="outline" onClick={() => patch((v) => ({ ...v, pillars: { ...v.pillars, items: [...(v.pillars?.items ?? []), { icon: "sparkles", title: "", body: "" }] } }))}>
            <Plus className="mr-1 h-4 w-4" /> Adicionar pilar
          </Button>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={pillars.enabled !== false}
              onChange={(e) => patch((v) => ({ ...v, pillars: { ...v.pillars, enabled: e.target.checked } }))}
            />
            Exibir seção
          </label>
          <div />
          <Input placeholder="Eyebrow" value={pillars.eyebrow ?? ""} onChange={(e) => patch((v) => ({ ...v, pillars: { ...v.pillars, eyebrow: e.target.value } }))} />
          <Input placeholder="Título" value={pillars.title ?? ""} onChange={(e) => patch((v) => ({ ...v, pillars: { ...v.pillars, title: e.target.value } }))} />
        </div>
        <div className="mt-4 space-y-3">
          {pillarItems.map((item, i) => (
            <div key={i} className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-[140px_1fr_2fr_auto]">
              <Input placeholder="Ícone" value={item.icon ?? ""} onChange={(e) => patch((v) => {
                const arr = [...(v.pillars?.items ?? [])];
                arr[i] = { ...arr[i], icon: e.target.value };
                return { ...v, pillars: { ...v.pillars, items: arr } };
              })} />
              <Input placeholder="Título" value={item.title ?? ""} onChange={(e) => patch((v) => {
                const arr = [...(v.pillars?.items ?? [])];
                arr[i] = { ...arr[i], title: e.target.value };
                return { ...v, pillars: { ...v.pillars, items: arr } };
              })} />
              <Textarea rows={2} placeholder="Descrição" value={item.body ?? ""} onChange={(e) => patch((v) => {
                const arr = [...(v.pillars?.items ?? [])];
                arr[i] = { ...arr[i], body: e.target.value };
                return { ...v, pillars: { ...v.pillars, items: arr } };
              })} />
              <Button size="icon" variant="ghost" onClick={() => patch((v) => ({ ...v, pillars: { ...v.pillars, items: (v.pillars?.items ?? []).filter((_, j) => j !== i) } }))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Ícones disponíveis: sparkles, shield, truck, gem, crown, star, heart, award, leaf.
        </p>
      </section>
    </div>
  );
}

function HomepageBlocksPanel() {
  const qc = useQueryClient();
  const { data: blocks = [], isLoading } = useQuery(homepageBlocksAdminQuery());
  const [saving, setSaving] = useState<string | null>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["homepage-blocks"] });
  };

  const addBlock = async () => {
    const nextPos = (blocks[blocks.length - 1]?.position ?? 0) + 10;
    const { error } = await supabase.from("homepage_blocks").insert({
      kind: "banner",
      title: "Novo bloco",
      subtitle: null,
      data: {},
      position: nextPos,
      is_active: false,
    });
    if (error) return toast.error(error.message);
    toast.success("Bloco criado");
    refresh();
  };

  const updateBlock = async (id: string, patch: Record<string, unknown>) => {
    setSaving(id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase.from("homepage_blocks").update(patch as any).eq("id", id);
    setSaving(null);
    if (error) return toast.error(error.message);
    refresh();
  };

  const deleteBlock = async (id: string) => {
    if (!confirm("Remover bloco?")) return;
    const { error } = await supabase.from("homepage_blocks").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Bloco removido");
    refresh();
  };

  const move = async (id: string, direction: -1 | 1) => {
    const idx = blocks.findIndex((b) => b.id === id);
    const other = blocks[idx + direction];
    if (!other) return;
    await Promise.all([
      supabase.from("homepage_blocks").update({ position: other.position }).eq("id", id),
      supabase.from("homepage_blocks").update({ position: blocks[idx].position }).eq("id", other.id),
    ]);
    refresh();
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando blocos…</p>;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={addBlock}>
          <Plus className="mr-2 h-4 w-4" /> Novo bloco
        </Button>
      </div>
      {blocks.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Nenhum bloco configurado. Adicione o primeiro bloco para começar a montar a homepage.
        </div>
      )}
      {blocks.map((block, idx) => (
        <div key={block.id} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2">
              <Badge variant={block.is_active ? "default" : "outline"}>
                {block.is_active ? "Ativo" : "Rascunho"}
              </Badge>
              <span className="text-xs uppercase tracking-widest text-muted-foreground">
                {block.kind}
              </span>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" disabled={idx === 0} onClick={() => move(block.id, -1)}>
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                disabled={idx === blocks.length - 1}
                onClick={() => move(block.id, 1)}
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => deleteBlock(block.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="text-muted-foreground">Tipo</span>
              <select
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                value={block.kind}
                onChange={(e) => updateBlock(block.id, { kind: e.target.value })}
              >
                {BLOCK_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="text-muted-foreground">Título</span>
              <Input
                defaultValue={block.title ?? ""}
                onBlur={(e) => updateBlock(block.id, { title: e.target.value || null })}
              />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="text-muted-foreground">Subtítulo</span>
              <Input
                defaultValue={block.subtitle ?? ""}
                onBlur={(e) => updateBlock(block.id, { subtitle: e.target.value || null })}
              />
            </label>
            {(block.kind === "hero" || block.kind === "banner") && (
              <div className="sm:col-span-2">
                <BannerUpload
                  currentUrl={(block.data as { image_url?: string } | null)?.image_url ?? null}
                  onUploaded={(dataUri) => {
                    const next = { ...(block.data ?? {}), image_url: dataUri };
                    updateBlock(block.id, { data: next });
                  }}
                  onClear={() => {
                    const next = { ...(block.data ?? {}) } as Record<string, unknown>;
                    delete next.image_url;
                    updateBlock(block.id, { data: next });
                  }}
                />
              </div>
            )}
            <label className="text-sm sm:col-span-2">
              <span className="text-muted-foreground">
                Dados (JSON) —{" "}
                {block.kind === "hero" && "ex.: { cta_href, cta_label, image_url }"}
                {block.kind === "collection" && 'ex.: { slug: "mais-vendidos", limit: 4 }'}
                {block.kind === "category_grid" && 'ex.: { categories: ["skincare","cabelos"] }'}
                {block.kind === "banner" && "ex.: { image_url, href }"}
                {block.kind === "text" && "ex.: { body: 'Markdown/Texto' }"}
              </span>
              <Textarea
                rows={4}
                defaultValue={JSON.stringify(block.data ?? {}, null, 2)}
                onBlur={(e) => {
                  try {
                    const parsed = JSON.parse(e.target.value || "{}");
                    updateBlock(block.id, { data: parsed });
                  } catch {
                    toast.error("JSON inválido");
                  }
                }}
                className="font-mono text-xs"
              />
            </label>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={block.is_active}
                onChange={(e) => updateBlock(block.id, { is_active: e.target.checked })}
              />
              Ativo (visível na homepage)
            </label>
            {saving === block.id && (
              <span className="text-xs text-muted-foreground">
                <Save className="mr-1 inline h-3 w-3" /> Salvando…
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function CollectionsPanel() {
  const qc = useQueryClient();
  const { data: collections = [], isLoading } = useQuery(collectionsAdminQuery());
  const [newColl, setNewColl] = useState({ slug: "", name: "", description: "" });

  const refresh = () => qc.invalidateQueries({ queryKey: ["collections"] });

  const create = async () => {
    if (!newColl.slug || !newColl.name) return toast.error("Slug e nome são obrigatórios");
    const nextPos = (collections[collections.length - 1]?.position ?? 0) + 1;
    const { error } = await supabase.from("collections").insert({
      slug: newColl.slug,
      name: newColl.name,
      description: newColl.description || null,
      is_featured: false,
      position: nextPos,
    });
    if (error) return toast.error(error.message);
    toast.success("Coleção criada");
    setNewColl({ slug: "", name: "", description: "" });
    refresh();
  };

  const update = async (id: string, patch: Record<string, unknown>) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase.from("collections").update(patch as any).eq("id", id);
    if (error) return toast.error(error.message);
    refresh();
  };

  const remove = async (id: string) => {
    if (!confirm("Remover coleção?")) return;
    const { error } = await supabase.from("collections").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Coleção removida");
    refresh();
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando coleções…</p>;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
        <h3 className="font-display text-lg">Nova coleção</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Input
            placeholder="slug (ex: promocoes-verao)"
            value={newColl.slug}
            onChange={(e) => setNewColl({ ...newColl, slug: e.target.value })}
          />
          <Input
            placeholder="Nome"
            value={newColl.name}
            onChange={(e) => setNewColl({ ...newColl, name: e.target.value })}
          />
          <Input
            placeholder="Descrição"
            value={newColl.description}
            onChange={(e) => setNewColl({ ...newColl, description: e.target.value })}
          />
        </div>
        <div className="mt-3 flex justify-end">
          <Button onClick={create}>
            <Plus className="mr-2 h-4 w-4" /> Criar coleção
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card shadow-soft">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">Nome</th>
              <th className="px-4 py-3 text-left">Slug</th>
              <th className="px-4 py-3 text-left">Descrição</th>
              <th className="px-4 py-3 text-center">Destaque</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {collections.map((c) => (
              <tr key={c.id} className="border-t border-border">
                <td className="px-4 py-3">
                  <Input defaultValue={c.name} onBlur={(e) => update(c.id, { name: e.target.value })} />
                </td>
                <td className="px-4 py-3 font-mono text-xs">{c.slug}</td>
                <td className="px-4 py-3">
                  <Input
                    defaultValue={c.description ?? ""}
                    onBlur={(e) => update(c.id, { description: e.target.value || null })}
                  />
                </td>
                <td className="px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={c.is_featured}
                    onChange={(e) => update(c.id, { is_featured: e.target.checked })}
                  />
                </td>
                <td className="px-4 py-3 text-right">
                  <Button variant="ghost" size="icon" onClick={() => remove(c.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SeoPanel() {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
        <h3 className="font-display text-xl">Recursos de SEO ativos</h3>
        <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
          <li>
            ✓ <span className="text-foreground">Sitemap dinâmico</span> em{" "}
            <a href="/sitemap.xml" target="_blank" rel="noreferrer" className="text-primary hover:underline">
              /sitemap.xml
            </a>{" "}
            — regenerado a cada requisição incluindo produtos, categorias e coleções em destaque.
          </li>
          <li>
            ✓ <span className="text-foreground">robots.txt</span> em{" "}
            <a href="/robots.txt" target="_blank" rel="noreferrer" className="text-primary hover:underline">
              /robots.txt
            </a>{" "}
            liberando indexação e bloqueando rotas privadas.
          </li>
          <li>
            ✓ <span className="text-foreground">Meta tags dinâmicas</span> por produto — cada página usa
            title/description/OG image do <code>product_seo</code> quando preenchido.
          </li>
          <li>
            ✓ <span className="text-foreground">JSON-LD Organization</span> injetado no layout raiz.
          </li>
          <li>
            ✓ <span className="text-foreground">JSON-LD Product</span> nas páginas de produto com preço, disponibilidade e avaliações.
          </li>
        </ul>
        <p className="mt-4 text-xs text-muted-foreground">
          O SEO por produto é editado dentro do editor de catálogo (aba SEO).
        </p>
      </div>
    </div>
  );
}

function BannerUpload({
  currentUrl,
  onUploaded,
  onClear,
}: {
  currentUrl: string | null;
  onUploaded: (dataUri: string) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [meta, setMeta] = useState<{ w: number; h: number; kb: number } | null>(null);

  const handleFile = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Envie um arquivo de imagem (JPEG, PNG, WebP, AVIF, GIF).");
      return;
    }
    setBusy(true);
    try {
      const { dataUri, width, height, sizeKb } = await imageFileToWebpDataUri(file, {
        maxWidth: 1600,
        quality: 0.82,
      });
      if (sizeKb > 900) {
        toast.warning(
          `Banner com ${sizeKb} KB — considere reduzir a resolução ou usar imagem mais simples.`,
        );
      }
      setMeta({ w: width, h: height, kb: sizeKb });
      onUploaded(dataUri);
      toast.success(`Convertido para WebP · ${width}×${height} · ${sizeKb} KB`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao processar imagem");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="rounded-xl border border-dashed border-border bg-secondary/30 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {currentUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={currentUrl}
              alt="Preview do banner"
              className="h-16 w-28 rounded-md border border-border object-cover"
            />
          ) : (
            <div className="flex h-16 w-28 items-center justify-center rounded-md border border-border bg-background text-xs text-muted-foreground">
              sem imagem
            </div>
          )}
          <div className="text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Imagem do banner</p>
            <p>Envie JPEG/PNG — convertemos para WebP otimizado (até 1600px).</p>
            {meta && (
              <p className="mt-0.5 text-[11px]">
                Última: {meta.w}×{meta.h}px · {meta.kb} KB
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-2 h-4 w-4" />}
            {currentUrl ? "Trocar" : "Enviar imagem"}
          </Button>
          {currentUrl && (
            <Button type="button" variant="ghost" size="sm" onClick={onClear} disabled={busy}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
