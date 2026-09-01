import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown, ArrowUp, Check, ChevronDown, Copy, Eye, EyeOff, GripVertical, ImageIcon, Info,
  LayoutDashboard, Loader2, MonitorPlay, Move, Pencil, Plus, RotateCcw, Save, Sparkles, Trash2, X,
} from "lucide-react";
import { toast } from "sonner";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { HomeImageUpload } from "@/components/admin/HomeImageUpload";
import {
  HomeBuilderPreview,
  type PreviewDevice,
  type PreviewFocus,
} from "@/components/admin/HomeBuilderPreview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { categoriesQuery, collectionsQuery } from "@/lib/catalog";
import {
  homeContentQuery,
  homepageBlocksAdminQuery,
  type HomeContent,
  type HomepageBlock,
} from "@/lib/marketing";
import { upsertSiteSetting } from "@/lib/site-settings.functions";
import { createCategory, deleteCategory, renameCategory } from "@/lib/admin-categories.functions";

export const Route = createFileRoute("/_authenticated/admin/home")({
  head: () => ({ meta: [{ title: "Home Page Builder · Admin Absoluto Glamur" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
    const allowed = (roles ?? []).some((role) => ["admin", "superadmin", "marketing"].includes(String(role.role)));
    if (!allowed) throw redirect({ to: "/account" });
  },
  component: HomeBuilderPage,
});

type CategoryRow = { id: string; name: string; slug: string; position: number };
type EditableBlockData = Record<string, unknown> & {
  image_url?: string;
  href?: string;
  cta_href?: string;
  cta_label?: string;
  body?: string;
  slug?: string;
  collection_slug?: string;
  text_align?: "left" | "center" | "right";
  mode?: "all" | "selected";
  categories?: string[];
  limit?: number;
  layout?: "inline" | "grid";
  align?: "left" | "center";
  pill_style?: "outline" | "soft" | "solid";
  show_heading?: boolean;
};

type BlockDraft = HomepageBlock & { data: EditableBlockData };

type AddableBlock = "banner" | "hero" | "collection" | "text" | "category_grid";

const ADDABLE_BLOCKS: Array<{ kind: AddableBlock; label: string; description: string }> = [
  { kind: "banner", label: "Banner de imagem", description: "Banner clicável usando imagem própria ou URL." },
  { kind: "hero", label: "Hero complementar", description: "Título, subtítulo, imagem e CTA em destaque." },
  { kind: "collection", label: "Coleção destacada", description: "Vitrine conectada a uma coleção existente." },
  { kind: "text", label: "Texto editorial", description: "Bloco simples para mensagem, manifesto curto ou apoio." },
  { kind: "category_grid", label: "Categorias em linha", description: "Exibe todas as categorias em uma única faixa horizontal responsiva." },
];

const KNOWN_PUBLIC_KINDS = new Set(["banner", "hero", "collection", "text", "category_grid"]);
const BANNER_LIKE_KINDS = new Set(["banner", "hero", "banner_duo", "promo_fullwidth"]);

/** Explica, em linguagem simples, o que cada bloco faz e onde ele aparece na loja. */
const KIND_HELP: Record<string, string> = {
  banner: "Imagem larga clicável no meio da Home. Use para campanhas e promoções.",
  hero: "Faixa de destaque com título, imagem de fundo e botão. Aparece na posição em que estiver na lista.",
  collection: "Vitrine que puxa automaticamente os produtos de uma coleção cadastrada.",
  text: "Texto editorial (manifesto, aviso, história da marca). Sem imagem.",
  category_grid: "Faixa com os atalhos de categorias. Novas categorias entram sozinhas quando o modo é “Todas”.",
  category_products: "Vitrines “Novidades e mais vendidos” separadas por categoria, na ordem definida na aba Categorias.",
  products: "Lista de produtos escolhidos manualmente.",
  spacer: "Espaço em branco entre blocos.",
  divider: "Linha decorativa entre blocos.",
  product_showcase: "Vitrine de produtos em destaque.",
  banner_duo: "Dois banners lado a lado.",
  promo_fullwidth: "Banner promocional de largura total.",
  manifesto: "Bloco de texto institucional.",
  newsletter: "Bloco de captura de e-mail.",
};

function helpForKind(kind: string) {
  return KIND_HELP[kind] ?? "Bloco existente do projeto. O Builder mantém a função original dele.";
}

function cloneBlock(block: HomepageBlock): BlockDraft {
  const rawData = { ...((block.data ?? {}) as EditableBlockData) };
  const data: EditableBlockData = block.kind === "category_grid"
    ? {
        ...rawData,
        // Old category blocks are upgraded in the draft to the requested all-category inline layout.
        mode: rawData.layout === "inline" && rawData.mode === "selected" ? "selected" : "all",
        layout: "inline",
        limit: typeof rawData.limit === "number" && Number.isFinite(rawData.limit) ? rawData.limit : 50,
        align: rawData.align === "left" ? "left" : "center",
        pill_style: rawData.pill_style === "soft" || rawData.pill_style === "solid" ? rawData.pill_style : "outline",
        show_heading: rawData.show_heading === true,
      }
    : rawData;
  return { ...block, data };
}

function HomeBuilderPage() {
  const qc = useQueryClient();
  const saveSetting = useServerFn(upsertSiteSetting);
  const createCategoryFn = useServerFn(createCategory);
  const renameCategoryFn = useServerFn(renameCategory);
  const deleteCategoryFn = useServerFn(deleteCategory);
  const { data: blocks = [], isLoading: blocksLoading } = useQuery(homepageBlocksAdminQuery());
  const { data: categories = [], isLoading: categoriesLoading } = useQuery(categoriesQuery());
  const { data: collections = [] } = useQuery(collectionsQuery());
  const { data: homeCurrent = {}, isLoading: homeLoading } = useQuery(homeContentQuery());

  const orderedBlocks = useMemo(() => [...blocks].sort((a, b) => a.position - b.position), [blocks]);
  const orderedCategories = useMemo(
    () => [...categories].sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0)) as CategoryRow[],
    [categories],
  );

  const [tab, setTab] = useState("structure");
  const [device, setDevice] = useState<PreviewDevice>("desktop");
  const [focus, setFocus] = useState<PreviewFocus>({ type: "hero" });
  const [blockOrder, setBlockOrder] = useState<HomepageBlock[]>([]);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [blockDraft, setBlockDraft] = useState<BlockDraft | null>(null);
  const [blockDirty, setBlockDirty] = useState(false);
  const [savingBlock, setSavingBlock] = useState(false);
  const [creatingBlock, setCreatingBlock] = useState(false);
  const [dragBlockIndex, setDragBlockIndex] = useState<number | null>(null);

  const [homeDraft, setHomeDraft] = useState<HomeContent | null>(null);
  const [savingHome, setSavingHome] = useState(false);
  const home = homeDraft ?? homeCurrent ?? {};

  const [categoryOrder, setCategoryOrder] = useState<CategoryRow[]>([]);
  const [categoryDirty, setCategoryDirty] = useState(false);
  const [savingCategories, setSavingCategories] = useState(false);
  const [dragCategoryIndex, setDragCategoryIndex] = useState<number | null>(null);

  useEffect(() => {
    setBlockOrder(orderedBlocks);
    if (!selectedBlockId && orderedBlocks[0]) {
      setSelectedBlockId(orderedBlocks[0].id);
      setBlockDraft(cloneBlock(orderedBlocks[0]));
      setFocus({ type: "block", id: orderedBlocks[0].id });
    } else if (selectedBlockId && !blockDirty) {
      const fresh = orderedBlocks.find((block) => block.id === selectedBlockId);
      if (fresh) setBlockDraft(cloneBlock(fresh));
    }
  }, [orderedBlocks, selectedBlockId, blockDirty]);

  useEffect(() => {
    if (!categoryDirty) setCategoryOrder(orderedCategories);
  }, [orderedCategories, categoryDirty]);

  const previewBlocks = useMemo(() => {
    if (!blockDraft) return blockOrder;
    return blockOrder.map((block) => block.id === blockDraft.id ? blockDraft : block);
  }, [blockDraft, blockOrder]);

  const previewCategories = categoryOrder.length ? categoryOrder : orderedCategories;
  const isLoading = blocksLoading || categoriesLoading || homeLoading;
  const activeCount = orderedBlocks.filter((block) => block.is_active).length;
  const bannerCount = orderedBlocks.filter((block) => BANNER_LIKE_KINDS.has(block.kind)).length;

  function selectBlock(block: HomepageBlock) {
    if (blockDirty && blockDraft && block.id !== blockDraft.id) {
      const proceed = window.confirm("Há alterações neste bloco ainda não salvas. Deseja trocar de bloco e descartá-las?");
      if (!proceed) return;
    }
    setSelectedBlockId(block.id);
    setBlockDraft(cloneBlock(block));
    setBlockDirty(false);
    setFocus({ type: "block", id: block.id });
  }

  function patchBlock(patch: Partial<BlockDraft>) {
    setBlockDraft((current) => current ? { ...current, ...patch } : current);
    setBlockDirty(true);
  }

  function patchBlockData(patch: Partial<EditableBlockData>) {
    setBlockDraft((current) => current ? { ...current, data: { ...current.data, ...patch } } : current);
    setBlockDirty(true);
  }

  function patchHome(mutator: (value: HomeContent) => HomeContent) {
    setHomeDraft(mutator(home));
  }

  async function refreshBlocks() {
    await qc.invalidateQueries({ queryKey: ["homepage-blocks"] });
  }

  async function saveCurrentBlock() {
    if (!blockDraft) return;
    setSavingBlock(true);
    try {
      const { error } = await supabase
        .from("homepage_blocks")
        .update({
          kind: blockDraft.kind,
          title: blockDraft.title || null,
          subtitle: blockDraft.subtitle || null,
          data: blockDraft.data,
          is_active: blockDraft.is_active,
        } as never)
        .eq("id", blockDraft.id);
      if (error) throw error;
      setBlockDirty(false);
      await refreshBlocks();
      toast.success("Bloco salvo");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar o bloco.");
    } finally {
      setSavingBlock(false);
    }
  }

  async function saveHomeContent() {
    if (!homeDraft) return;
    setSavingHome(true);
    try {
      await saveSetting({ data: { key: "home_content", value: homeDraft as Record<string, unknown> } });
      await qc.invalidateQueries({ queryKey: ["site-settings", "home_content"] });
      setHomeDraft(null);
      toast.success("Banners principais atualizados");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar os banners.");
    } finally {
      setSavingHome(false);
    }
  }

  async function addBlock(kind: AddableBlock) {
    if (kind === "category_grid") {
      const existing = blockOrder.find((block) => block.kind === "category_grid");
      if (existing) {
        selectBlock(existing);
        toast.info("O bloco de categorias já existe. Ele foi selecionado para edição.");
        return;
      }
    }
    setCreatingBlock(true);
    try {
      const position = (blockOrder.at(-1)?.position ?? 0) + 10;
      const defaults: Record<AddableBlock, { title: string; subtitle: string | null; data: EditableBlockData }> = {
        banner: { title: "Novo banner", subtitle: null, data: { image_url: "", href: "/products" } },
        hero: { title: "Novo destaque", subtitle: "", data: { image_url: "", cta_label: "Ver produtos", cta_href: "/products" } },
        collection: { title: "Coleção em destaque", subtitle: "", data: { slug: collections[0]?.slug ?? "" } },
        text: { title: "Novo conteúdo", subtitle: null, data: { body: "" } },
        category_grid: {
          title: "Categorias",
          subtitle: "Explore por categoria",
          data: { mode: "all", categories: [], limit: 50, layout: "inline", align: "center", pill_style: "outline", show_heading: false },
        },
      };
      const preset = defaults[kind];
      const { data, error } = await supabase
        .from("homepage_blocks")
        .insert({ kind, title: preset.title, subtitle: preset.subtitle, data: preset.data, position, is_active: false } as never)
        .select("id,kind,title,subtitle,data,position,is_active")
        .single();
      if (error) throw error;
      await refreshBlocks();
      if (data) {
        const created = data as unknown as HomepageBlock;
        setSelectedBlockId(created.id);
        setBlockDraft(cloneBlock(created));
        setBlockDirty(false);
        setFocus({ type: "block", id: created.id });
      }
      toast.success("Bloco criado como rascunho");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível criar o bloco.");
    } finally {
      setCreatingBlock(false);
    }
  }

  async function duplicateBlock(block: HomepageBlock) {
    try {
      const { data, error } = await supabase
        .from("homepage_blocks")
        .insert({
          kind: block.kind,
          title: `${block.title ?? "Bloco"} — cópia`,
          subtitle: block.subtitle,
          data: block.data ?? {},
          position: (blockOrder.at(-1)?.position ?? 0) + 10,
          is_active: false,
        } as never)
        .select("id,kind,title,subtitle,data,position,is_active")
        .single();
      if (error) throw error;
      await refreshBlocks();
      if (data) selectBlock(data as unknown as HomepageBlock);
      toast.success("Cópia criada como rascunho");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao duplicar.");
    }
  }

  async function deleteBlock(block: HomepageBlock) {
    if (!window.confirm(`Remover o bloco “${block.title || block.kind}”? Esta ação não pode ser desfeita.`)) return;
    try {
      const { error } = await supabase.from("homepage_blocks").delete().eq("id", block.id);
      if (error) throw error;
      if (selectedBlockId === block.id) {
        setSelectedBlockId(null);
        setBlockDraft(null);
        setBlockDirty(false);
      }
      await refreshBlocks();
      toast.success("Bloco removido");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao remover.");
    }
  }

  async function toggleBlock(block: HomepageBlock) {
    try {
      const next = !block.is_active;
      const { error } = await supabase.from("homepage_blocks").update({ is_active: next }).eq("id", block.id);
      if (error) throw error;
      setBlockDraft((current) => current?.id === block.id ? { ...current, is_active: next } : current);
      await refreshBlocks();
      toast.success(next ? "Bloco publicado na Home" : "Bloco ocultado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao alterar visibilidade.");
    }
  }

  async function persistBlockOrder(next: HomepageBlock[]) {
    setBlockOrder(next);
    try {
      const results = await Promise.all(
        next.map((block, index) => supabase.from("homepage_blocks").update({ position: (index + 1) * 10 }).eq("id", block.id)),
      );
      const error = results.find((result) => result.error)?.error;
      if (error) throw error;
      await refreshBlocks();
    } catch (error) {
      setBlockOrder(orderedBlocks);
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar a nova ordem.");
    }
  }

  function moveBlock(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= blockOrder.length) return;
    const next = [...blockOrder];
    [next[index], next[target]] = [next[target], next[index]];
    void persistBlockOrder(next);
  }

  function dropBlock(targetIndex: number) {
    if (dragBlockIndex === null || dragBlockIndex === targetIndex) return setDragBlockIndex(null);
    const next = [...blockOrder];
    const [moved] = next.splice(dragBlockIndex, 1);
    next.splice(targetIndex, 0, moved);
    setDragBlockIndex(null);
    void persistBlockOrder(next);
  }

  function moveCategory(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= previewCategories.length) return;
    const next = [...previewCategories];
    [next[index], next[target]] = [next[target], next[index]];
    setCategoryOrder(next);
    setCategoryDirty(true);
  }

  function dropCategory(targetIndex: number) {
    if (dragCategoryIndex === null || dragCategoryIndex === targetIndex) return setDragCategoryIndex(null);
    const next = [...previewCategories];
    const [moved] = next.splice(dragCategoryIndex, 1);
    next.splice(targetIndex, 0, moved);
    setCategoryOrder(next);
    setCategoryDirty(true);
    setDragCategoryIndex(null);
  }

  async function saveCategoryOrder() {
    if (!categoryDirty) return;
    setSavingCategories(true);
    try {
      const results = await Promise.all(
        previewCategories.map((category, index) => supabase.from("categories").update({ position: index * 10 }).eq("id", category.id)),
      );
      const error = results.find((result) => result.error)?.error;
      if (error) throw error;
      setCategoryDirty(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["categories"] }),
        qc.invalidateQueries({ queryKey: ["products-by-category"] }),
      ]);
      toast.success("Posição das categorias atualizada na Home");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar a ordem das categorias.");
    } finally {
      setSavingCategories(false);
    }
  }

  function resetCategoryOrder() {
    setCategoryOrder(orderedCategories);
    setCategoryDirty(false);
  }

  async function refreshCategories() {
    setCategoryDirty(false);
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["categories"] }),
      qc.invalidateQueries({ queryKey: ["products-by-category"] }),
    ]);
  }

  async function handleCreateCategory(name: string) {
    try {
      await createCategoryFn({ data: { name } });
      await refreshCategories();
      toast.success("Categoria criada. Ela já aparece no menu e nos blocos automáticos.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível criar a categoria.");
    }
  }

  async function handleRenameCategory(id: string, name: string) {
    try {
      await renameCategoryFn({ data: { id, name } });
      await refreshCategories();
      toast.success("Nome da categoria atualizado em toda a loja.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível renomear a categoria.");
    }
  }

  async function handleDeleteCategory(id: string, name: string) {
    if (!window.confirm(`Remover a categoria “${name}”? Ela sairá do menu e da Home.`)) return;
    try {
      await deleteCategoryFn({ data: { id } });
      await refreshCategories();
      toast.success("Categoria removida.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível remover a categoria.");
    }
  }

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando Home Page Builder…
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="mx-auto max-w-[1680px] pb-16">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Editor visual</p>
            <h1 className="mt-2 text-3xl font-semibold text-foreground">Home Page Builder</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Controle a estrutura, os banners e a ordem das categorias usando as mesmas configurações que a loja já utiliza. Nenhuma alteração é publicada até você salvar ou ativar o item.
            </p>
          </div>
          <a href="/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary">
            <MonitorPlay className="h-4 w-4 text-primary" /> Ver Home publicada ↗
          </a>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric icon={<LayoutDashboard className="h-4 w-4" />} label="Blocos cadastrados" value={orderedBlocks.length} />
          <Metric icon={<Eye className="h-4 w-4" />} label="Blocos ativos" value={activeCount} />
          <Metric icon={<ImageIcon className="h-4 w-4" />} label="Banners/blocos visuais" value={bannerCount + (home.hero_slider?.slides?.length ?? 0) + 1} />
          <Metric icon={<Move className="h-4 w-4" />} label="Categorias ordenáveis" value={orderedCategories.length} />
        </div>

        <div className="mt-6 rounded-2xl border border-primary/25 bg-primary/5 p-5">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground"><Info className="h-4 w-4 text-primary" /> Como funciona esta página (leia uma vez)</p>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <GuideCard
              step="1"
              title="Topo e banners"
              text="Barra de anúncio, Hero principal e Slider — tudo que aparece no alto da Home, antes dos blocos."
            />
            <GuideCard
              step="2"
              title="Blocos da Home"
              text="A sequência de seções abaixo do topo. Arraste para mudar a ordem, clique para editar e use o olho para publicar ou ocultar."
            />
            <GuideCard
              step="3"
              title="Categorias"
              text="Renomeie (ex.: “Skincare” → “Bolsas”), crie, remova e ordene. As 5 primeiras viram o menu do topo e a mesma ordem vale nas vitrines da Home."
            />
          </div>
        </div>

        <Tabs value={tab} onValueChange={(value) => {
          setTab(value);
          if (value === "banners") setFocus({ type: "hero" });
          if (value === "categories") setFocus({ type: "categories" });
        }} className="mt-6">
          <TabsList className="h-auto flex-wrap justify-start gap-1 bg-secondary/60 p-1">
            <TabsTrigger value="banners" className="gap-2"><ImageIcon className="h-4 w-4" /> 1 · Topo e banners</TabsTrigger>
            <TabsTrigger value="structure" className="gap-2"><LayoutDashboard className="h-4 w-4" /> 2 · Blocos da Home</TabsTrigger>
            <TabsTrigger value="categories" className="gap-2"><Move className="h-4 w-4" /> 3 · Categorias e menu</TabsTrigger>
          </TabsList>

          <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.85fr)]">
            <div>
              <TabsContent value="structure" className="m-0">
                <StructurePanel
                  blocks={blockOrder}
                  selectedBlockId={selectedBlockId}
                  blockDraft={blockDraft}
                  blockDirty={blockDirty}
                  savingBlock={savingBlock}
                  creatingBlock={creatingBlock}
                  collections={collections}
                  categories={orderedCategories}
                  dragIndex={dragBlockIndex}
                  onDragIndex={setDragBlockIndex}
                  onDrop={dropBlock}
                  onMove={moveBlock}
                  onSelect={selectBlock}
                  onAdd={addBlock}
                  onDuplicate={duplicateBlock}
                  onDelete={deleteBlock}
                  onToggle={toggleBlock}
                  onPatch={patchBlock}
                  onPatchData={patchBlockData}
                  onSave={saveCurrentBlock}
                  onDiscard={() => {
                    const fresh = orderedBlocks.find((block) => block.id === blockDraft?.id);
                    if (fresh) setBlockDraft(cloneBlock(fresh));
                    setBlockDirty(false);
                  }}
                />
              </TabsContent>

              <TabsContent value="banners" className="m-0">
                <BannersPanel
                  value={home}
                  dirty={!!homeDraft}
                  saving={savingHome}
                  focus={focus}
                  onFocus={setFocus}
                  onPatch={patchHome}
                  onSave={saveHomeContent}
                  onDiscard={() => setHomeDraft(null)}
                />
              </TabsContent>

              <TabsContent value="categories" className="m-0">
                <CategoryOrderPanel
                  categories={previewCategories}
                  dirty={categoryDirty}
                  saving={savingCategories}
                  dragIndex={dragCategoryIndex}
                  onDragIndex={setDragCategoryIndex}
                  onDrop={dropCategory}
                  onMove={moveCategory}
                  onSave={saveCategoryOrder}
                  onReset={resetCategoryOrder}
                  onCreate={handleCreateCategory}
                  onRename={handleRenameCategory}
                  onDeleteCategory={handleDeleteCategory}
                />
              </TabsContent>
            </div>

            <HomeBuilderPreview
              device={device}
              onDeviceChange={setDevice}
              focus={focus}
              home={home}
              blocks={previewBlocks}
              categories={previewCategories}
            />
          </div>
        </Tabs>
      </div>
    </AdminLayout>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
      <div className="flex items-center gap-2 text-primary">{icon}<span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</span></div>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

function GuideCard({ step, title, text }: { step: string; title: string; text: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">{step}</span>
        <p className="text-sm font-semibold text-foreground">{title}</p>
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{text}</p>
    </div>
  );
}

function HelpNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 rounded-xl border border-border bg-secondary/30 p-3 text-[11px] leading-5 text-muted-foreground">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
      <span>{children}</span>
    </div>
  );
}



function StructurePanel({
  blocks, selectedBlockId, blockDraft, blockDirty, savingBlock, creatingBlock, collections, categories,
  dragIndex, onDragIndex, onDrop, onMove, onSelect, onAdd, onDuplicate, onDelete, onToggle,
  onPatch, onPatchData, onSave, onDiscard,
}: {
  blocks: HomepageBlock[];
  selectedBlockId: string | null;
  blockDraft: BlockDraft | null;
  blockDirty: boolean;
  savingBlock: boolean;
  creatingBlock: boolean;
  collections: Array<{ id: string; slug: string; name: string }>;
  categories: CategoryRow[];
  dragIndex: number | null;
  onDragIndex: (index: number | null) => void;
  onDrop: (index: number) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onSelect: (block: HomepageBlock) => void;
  onAdd: (kind: AddableBlock) => void;
  onDuplicate: (block: HomepageBlock) => void;
  onDelete: (block: HomepageBlock) => void;
  onToggle: (block: HomepageBlock) => void;
  onPatch: (patch: Partial<BlockDraft>) => void;
  onPatchData: (patch: Partial<EditableBlockData>) => void;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const [showLibrary, setShowLibrary] = useState(false);
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Estrutura e ordem</h2>
            <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">Esta é a ordem real das seções da Home, de cima para baixo. Arraste pela alça (ou use as setas) para reposicionar — a ordem é salva na hora. Clique no bloco para editar o conteúdo e no ícone de olho para publicar/ocultar.</p>
          </div>
          <div className="relative">
            <Button onClick={() => setShowLibrary((value) => !value)} disabled={creatingBlock}>
              {creatingBlock ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />} Adicionar bloco <ChevronDown className="ml-2 h-3.5 w-3.5" />
            </Button>
            {showLibrary && (
              <div className="absolute right-0 top-12 z-30 w-[340px] max-w-[90vw] rounded-xl border border-border bg-popover p-2 shadow-xl">
                {ADDABLE_BLOCKS.map((item) => (
                  <button key={item.kind} type="button" onClick={() => { setShowLibrary(false); onAdd(item.kind); }} className="w-full rounded-lg p-3 text-left transition hover:bg-secondary">
                    <p className="text-sm font-semibold">{item.label}</p>
                    <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{item.description}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {blocks.map((block, index) => {
            const selected = block.id === selectedBlockId;
            const supported = KNOWN_PUBLIC_KINDS.has(block.kind);
            return (
              <div
                key={block.id}
                draggable
                onDragStart={() => onDragIndex(index)}
                onDragEnd={() => onDragIndex(null)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => onDrop(index)}
                className={`group flex items-center gap-2 rounded-xl border p-2.5 transition ${selected ? "border-primary/50 bg-primary/5 shadow-soft" : dragIndex === index ? "border-dashed border-primary/50 bg-secondary" : "border-border bg-background hover:border-primary/25"}`}
              >
                <button type="button" className="cursor-grab p-1 text-muted-foreground active:cursor-grabbing" title="Arrastar"><GripVertical className="h-4 w-4" /></button>
                <button type="button" onClick={() => onSelect(block)} className="min-w-0 flex-1 text-left">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold">{block.title || labelForKind(block.kind)}</span>
                    <Badge variant={block.is_active ? "default" : "outline"} className="h-5 text-[9px]">{block.is_active ? "Ativo" : "Oculto"}</Badge>
                    {!supported && <Badge variant="secondary" className="h-5 text-[9px]">Preservado</Badge>}
                  </div>
                  <p className="mt-0.5 truncate text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Posição #{index + 1} · {labelForKind(block.kind)}</p>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{helpForKind(block.kind)}</p>
                </button>
                <div className="flex shrink-0 items-center">
                  <Button size="icon" variant="ghost" disabled={index === 0} onClick={() => onMove(index, -1)} title="Subir"><ArrowUp className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" disabled={index === blocks.length - 1} onClick={() => onMove(index, 1)} title="Descer"><ArrowDown className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => onToggle(block)} title={block.is_active ? "Ocultar" : "Ativar"}>{block.is_active ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}</Button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {blockDraft && (
        <BlockEditor
          block={blockDraft}
          dirty={blockDirty}
          saving={savingBlock}
          collections={collections}
          categories={categories}
          onPatch={onPatch}
          onPatchData={onPatchData}
          onSave={onSave}
          onDiscard={onDiscard}
          onDuplicate={() => onDuplicate(blockDraft)}
          onDelete={() => onDelete(blockDraft)}
          onToggle={() => onToggle(blockDraft)}
        />
      )}
    </div>
  );
}

function BlockEditor({ block, dirty, saving, collections, categories, onPatch, onPatchData, onSave, onDiscard, onDuplicate, onDelete, onToggle }: {
  block: BlockDraft;
  dirty: boolean;
  saving: boolean;
  collections: Array<{ id: string; slug: string; name: string }>;
  categories: CategoryRow[];
  onPatch: (patch: Partial<BlockDraft>) => void;
  onPatchData: (patch: Partial<EditableBlockData>) => void;
  onSave: () => void;
  onDiscard: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  const known = KNOWN_PUBLIC_KINDS.has(block.kind);
  const categoryMode = block.kind === "category_grid" && block.data.layout === "inline" && block.data.mode === "selected" ? "selected" : "all";
  const selectedCategorySlugs = Array.isArray(block.data.categories)
    ? block.data.categories.filter((value): value is string => typeof value === "string")
    : [];

  function toggleCategorySlug(slug: string, checked: boolean) {
    const next = checked
      ? [...selectedCategorySlugs.filter((value) => value !== slug), slug]
      : selectedCategorySlugs.filter((value) => value !== slug);
    onPatchData({ categories: next, mode: "selected", layout: "inline" });
  }

  return (
    <section className="rounded-2xl border border-border bg-card shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">Editando bloco</p>
          <h2 className="mt-1 text-xl font-semibold">{block.title || labelForKind(block.kind)}</h2>
          <p className="mt-1 text-xs text-muted-foreground">Tipo: {labelForKind(block.kind)}</p>
        </div>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" onClick={onToggle} title={block.is_active ? "Ocultar bloco" : "Ativar bloco"}>{block.is_active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</Button>
          <Button size="icon" variant="ghost" onClick={onDuplicate} title="Duplicar"><Copy className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" onClick={onDelete} title="Excluir"><Trash2 className="h-4 w-4 text-destructive" /></Button>
        </div>
      </div>

      <div className="space-y-4 p-5">
        <HelpNote>
          <strong className="text-foreground">O que é este bloco:</strong> {helpForKind(block.kind)}{" "}
          {block.is_active
            ? "Ele está publicado e visível na loja."
            : "Ele está oculto — clique no ícone de olho acima para publicar."}
        </HelpNote>

        {!known && (
          <div className="rounded-xl border border-warning/30 bg-warning/5 p-4 text-xs leading-5 text-muted-foreground">
            <strong className="text-foreground">Bloco preservado.</strong> Este tipo já existia no projeto. Para evitar qualquer regressão, o Builder não muda automaticamente a lógica dele; você pode editar título, subtítulo e dados avançados sem converter o bloco.
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Título (texto grande da seção)">
            <Input value={block.title ?? ""} onChange={(event) => onPatch({ title: event.target.value })} placeholder="Ex.: Novidades da semana" />
          </Field>
          <Field label="Subtítulo (linha pequena acima/abaixo do título)">
            <Input value={block.subtitle ?? ""} onChange={(event) => onPatch({ subtitle: event.target.value })} placeholder="Ex.: Selecionados pela nossa curadoria" />
          </Field>
        </div>


        {(block.kind === "banner" || block.kind === "hero") && (
          <>
            <HomeImageUpload
              label={block.kind === "hero" ? "Imagem de fundo" : "Imagem do banner"}
              value={String(block.data.image_url ?? "")}
              onChange={(imageUrl) => onPatchData({ image_url: imageUrl })}
              recommended={block.kind === "hero" ? "1920×900 px ou proporção semelhante" : "1600×600 px ou proporção semelhante"}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Link de destino">
                <Input
                  value={String((block.kind === "hero" ? block.data.cta_href : block.data.href) ?? "")}
                  onChange={(event) => onPatchData(block.kind === "hero" ? { cta_href: event.target.value } : { href: event.target.value })}
                  placeholder="/products ou https://..."
                />
              </Field>
              {block.kind === "hero" && (
                <Field label="Texto do botão">
                  <Input value={String(block.data.cta_label ?? "")} onChange={(event) => onPatchData({ cta_label: event.target.value })} />
                </Field>
              )}
            </div>
          </>
        )}

        {block.kind === "collection" && (
          <Field label="Coleção conectada">
            <select
              value={String(block.data.slug ?? block.data.collection_slug ?? "")}
              onChange={(event) => onPatchData({ slug: event.target.value, collection_slug: event.target.value })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">Selecione uma coleção</option>
              {collections.map((collection) => <option key={collection.id} value={collection.slug}>{collection.name}</option>)}
            </select>
          </Field>
        )}

        {block.kind === "text" && (
          <Field label="Texto do bloco">
            <Textarea rows={7} value={String(block.data.body ?? "")} onChange={(event) => onPatchData({ body: event.target.value })} />
          </Field>
        )}

        {block.kind === "category_grid" && (
          <div className="space-y-4 rounded-xl border border-border bg-secondary/20 p-4">
            <div>
              <p className="text-sm font-semibold text-foreground">Categorias em linha</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">No desktop ficam em uma única linha; no celular a faixa desliza horizontalmente sem quebrar os botões.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Quais categorias exibir">
                <select
                  value={categoryMode}
                  onChange={(event) => onPatchData({ mode: event.target.value === "selected" ? "selected" : "all", layout: "inline" })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="all">Todas as categorias</option>
                  <option value="selected">Somente selecionadas</option>
                </select>
              </Field>
              <Field label="Máximo de categorias">
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={Number(block.data.limit ?? 50)}
                  onChange={(event) => onPatchData({ limit: Math.max(1, Math.min(50, Number(event.target.value) || 1)), layout: "inline" })}
                />
              </Field>
              <Field label="Alinhamento no desktop">
                <select
                  value={block.data.align === "left" ? "left" : "center"}
                  onChange={(event) => onPatchData({ align: event.target.value === "left" ? "left" : "center", layout: "inline" })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="center">Centralizado</option>
                  <option value="left">À esquerda</option>
                </select>
              </Field>
              <Field label="Estilo dos botões">
                <select
                  value={block.data.pill_style === "soft" || block.data.pill_style === "solid" ? block.data.pill_style : "outline"}
                  onChange={(event) => onPatchData({ pill_style: event.target.value as "outline" | "soft" | "solid", layout: "inline" })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="outline">Contorno elegante</option>
                  <option value="soft">Fundo suave</option>
                  <option value="solid">Cor principal</option>
                </select>
              </Field>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={block.data.show_heading === true}
                onChange={(event) => onPatchData({ show_heading: event.target.checked, layout: "inline" })}
              />
              Exibir título e subtítulo acima das categorias
            </label>

            {categoryMode === "selected" && (
              <div>
                <p className="text-xs font-medium text-muted-foreground">Selecione as categorias</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {categories.map((category) => (
                    <label key={category.id} className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium">
                      <input
                        type="checkbox"
                        checked={selectedCategorySlugs.includes(category.slug)}
                        onChange={(event) => toggleCategorySlug(category.slug, event.target.checked)}
                      />
                      <span className="truncate">{category.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-lg bg-background px-3 py-2 text-[11px] leading-5 text-muted-foreground">
              A ordem dos botões segue <strong className="text-foreground">Categorias e posição</strong>. Com “Todas as categorias”, novas categorias entram automaticamente neste bloco.
            </div>
          </div>
        )}

        {!known && <AdvancedJsonEditor block={block} onChange={(data) => onPatch({ data })} />}
      </div>

      <div className="sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card/95 p-4 backdrop-blur">
        <span className={`text-xs ${dirty ? "font-semibold text-warning" : "text-muted-foreground"}`}>{dirty ? "Alterações não salvas" : "Bloco sincronizado"}</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={!dirty || saving} onClick={onDiscard}><RotateCcw className="mr-2 h-3.5 w-3.5" /> Descartar</Button>
          <Button size="sm" disabled={!dirty || saving} onClick={onSave}>{saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />} Salvar bloco</Button>
        </div>
      </div>
    </section>
  );
}

function AdvancedJsonEditor({ block, onChange }: { block: BlockDraft; onChange: (data: EditableBlockData) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  return (
    <div className="rounded-xl border border-border">
      <button type="button" onClick={() => { if (!open) setText(JSON.stringify(block.data ?? {}, null, 2)); setOpen((value) => !value); }} className="flex w-full items-center justify-between p-3 text-left text-xs font-semibold">
        Dados avançados do bloco <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="border-t border-border p-3">
          <Textarea className="font-mono text-[11px]" rows={12} value={text} onChange={(event) => setText(event.target.value)} />
          <div className="mt-2 flex justify-end">
            <Button size="sm" variant="outline" onClick={() => {
              try {
                const parsed = JSON.parse(text || "{}");
                onChange(parsed as EditableBlockData);
                toast.success("Dados avançados aplicados ao rascunho. Salve o bloco para publicar.");
              } catch {
                toast.error("JSON inválido");
              }
            }}>Aplicar JSON</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function BannersPanel({ value, dirty, saving, focus, onFocus, onPatch, onSave, onDiscard }: {
  value: HomeContent;
  dirty: boolean;
  saving: boolean;
  focus: PreviewFocus;
  onFocus: (focus: PreviewFocus) => void;
  onPatch: (mutator: (value: HomeContent) => HomeContent) => void;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const hero = value.hero ?? {};
  const slider = value.hero_slider ?? {};
  const slides = slider.slides ?? [];
  const announcement = value.announcement ?? {};
  const [expanded, setExpanded] = useState<"hero" | "slider" | "announcement">("hero");

  function updateSlide(index: number, patch: Partial<(typeof slides)[number]>) {
    onPatch((current) => {
      const nextSlides = [...(current.hero_slider?.slides ?? [])];
      nextSlides[index] = { ...nextSlides[index], ...patch };
      return { ...current, hero_slider: { ...current.hero_slider, slides: nextSlides } };
    });
    onFocus({ type: "slider", index });
  }

  function moveSlide(index: number, direction: -1 | 1) {
    onPatch((current) => {
      const nextSlides = [...(current.hero_slider?.slides ?? [])];
      const target = index + direction;
      if (target < 0 || target >= nextSlides.length) return current;
      [nextSlides[index], nextSlides[target]] = [nextSlides[target], nextSlides[index]];
      return { ...current, hero_slider: { ...current.hero_slider, slides: nextSlides } };
    });
    onFocus({ type: "slider", index: Math.max(0, index + direction) });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Banners principais da Home</h2>
            <p className="mt-1 text-xs text-muted-foreground">Edite os elementos que a Home já usa: barra superior, Hero e Slider. O preview à direita usa o rascunho em tempo real.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={!dirty || saving} onClick={onDiscard}><RotateCcw className="mr-2 h-3.5 w-3.5" /> Descartar</Button>
            <Button size="sm" disabled={!dirty || saving} onClick={onSave}>{saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />} Salvar banners</Button>
          </div>
        </div>
        <div className={`mt-3 rounded-lg px-3 py-2 text-xs ${dirty ? "bg-warning/10 font-semibold text-warning" : "bg-success/10 text-success"}`}>
          {dirty ? "Você está visualizando alterações ainda não publicadas." : "Todos os banners estão sincronizados."}
        </div>
      </div>

      <EditorAccordion title="Hero principal" subtitle="Banner principal quando o slider não está em uso" open={expanded === "hero"} onOpen={() => { setExpanded("hero"); onFocus({ type: "hero" }); }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Selo / badge"><Input value={hero.badge ?? ""} onChange={(event) => onPatch((current) => ({ ...current, hero: { ...current.hero, badge: event.target.value } }))} /></Field>
          <Field label="Título principal"><Input value={hero.title_line1 ?? ""} onChange={(event) => onPatch((current) => ({ ...current, hero: { ...current.hero, title_line1: event.target.value } }))} /></Field>
          <Field label="Título em destaque"><Input value={hero.title_highlight ?? ""} onChange={(event) => onPatch((current) => ({ ...current, hero: { ...current.hero, title_highlight: event.target.value } }))} /></Field>
          <Field label="Subtítulo" className="sm:col-span-2"><Textarea rows={3} value={hero.subtitle ?? ""} onChange={(event) => onPatch((current) => ({ ...current, hero: { ...current.hero, subtitle: event.target.value } }))} /></Field>
          <Field label="CTA principal"><Input value={hero.cta_primary_label ?? ""} onChange={(event) => onPatch((current) => ({ ...current, hero: { ...current.hero, cta_primary_label: event.target.value } }))} /></Field>
          <Field label="Link CTA principal"><Input value={hero.cta_primary_href ?? ""} onChange={(event) => onPatch((current) => ({ ...current, hero: { ...current.hero, cta_primary_href: event.target.value } }))} /></Field>
          <Field label="CTA secundário"><Input value={hero.cta_secondary_label ?? ""} onChange={(event) => onPatch((current) => ({ ...current, hero: { ...current.hero, cta_secondary_label: event.target.value } }))} /></Field>
          <Field label="Link CTA secundário"><Input value={hero.cta_secondary_href ?? ""} onChange={(event) => onPatch((current) => ({ ...current, hero: { ...current.hero, cta_secondary_href: event.target.value } }))} /></Field>
        </div>
        <div className="mt-4">
          <HomeImageUpload label="Imagem do Hero" recommended="1920×900 px" value={hero.image_url ?? ""} onChange={(imageUrl) => onPatch((current) => ({ ...current, hero: { ...current.hero, image_url: imageUrl } }))} />
        </div>
      </EditorAccordion>

      <EditorAccordion title="Hero Slider" subtitle={`${slides.length} slide(s) · até 5`} open={expanded === "slider"} onOpen={() => { setExpanded("slider"); onFocus({ type: "slider", index: 0 }); }}>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-secondary/50 p-3">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={slider.enabled !== false} onChange={(event) => onPatch((current) => ({ ...current, hero_slider: { ...current.hero_slider, enabled: event.target.checked } }))} /> Slider ativo</label>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Autoplay</span>
            <Input className="w-28" type="number" min={0} value={slider.autoplay_ms ?? 6000} onChange={(event) => onPatch((current) => ({ ...current, hero_slider: { ...current.hero_slider, autoplay_ms: Number(event.target.value) || 0 } }))} />
          </div>
          <Button size="sm" variant="outline" disabled={slides.length >= 5} onClick={() => {
            onPatch((current) => ({ ...current, hero_slider: { ...current.hero_slider, slides: [...(current.hero_slider?.slides ?? []), { title: "Novo slide", subtitle: "", cta_label: "Comprar", cta_href: "/products", image_url: "", align: "center" }] } }));
            onFocus({ type: "slider", index: slides.length });
          }}><Plus className="mr-2 h-3.5 w-3.5" /> Novo slide</Button>
        </div>

        <div className="mt-4 space-y-3">
          {slides.map((slide, index) => (
            <div key={index} className={`rounded-xl border p-4 ${focus.type === "slider" && focus.index === index ? "border-primary/50 bg-primary/5" : "border-border"}`} onClick={() => onFocus({ type: "slider", index })}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Slide {index + 1}</p>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" disabled={index === 0} onClick={(event) => { event.stopPropagation(); moveSlide(index, -1); }}><ArrowUp className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" disabled={index === slides.length - 1} onClick={(event) => { event.stopPropagation(); moveSlide(index, 1); }}><ArrowDown className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" onClick={(event) => { event.stopPropagation(); onPatch((current) => ({ ...current, hero_slider: { ...current.hero_slider, slides: (current.hero_slider?.slides ?? []).filter((_, itemIndex) => itemIndex !== index) } })); }}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                </div>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Título"><Input value={slide.title ?? ""} onChange={(event) => updateSlide(index, { title: event.target.value })} /></Field>
                <Field label="Alinhamento"><select value={slide.align ?? "center"} onChange={(event) => updateSlide(index, { align: event.target.value as "left" | "center" | "right" })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"><option value="left">Esquerda</option><option value="center">Centro</option><option value="right">Direita</option></select></Field>
                <Field label="Subtítulo" className="sm:col-span-2"><Textarea rows={2} value={slide.subtitle ?? ""} onChange={(event) => updateSlide(index, { subtitle: event.target.value })} /></Field>
                <Field label="Texto do botão"><Input value={slide.cta_label ?? ""} onChange={(event) => updateSlide(index, { cta_label: event.target.value })} /></Field>
                <Field label="Link"><Input value={slide.cta_href ?? ""} onChange={(event) => updateSlide(index, { cta_href: event.target.value })} /></Field>
              </div>
              <div className="mt-3"><HomeImageUpload compact label={`Imagem do slide ${index + 1}`} recommended="1920×900 px" value={slide.image_url ?? ""} onChange={(imageUrl) => updateSlide(index, { image_url: imageUrl })} /></div>
            </div>
          ))}
          {slides.length === 0 && <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Nenhum slide cadastrado.</div>}
        </div>
      </EditorAccordion>

      <EditorAccordion title="Barra de anúncio" subtitle="Faixa no topo da Home" open={expanded === "announcement"} onOpen={() => { setExpanded("announcement"); onFocus({ type: "announcement" }); }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={announcement.enabled !== false} onChange={(event) => onPatch((current) => ({ ...current, announcement: { ...current.announcement, enabled: event.target.checked } }))} /> Exibir barra</label>
          <div />
          <Field label="Texto / chamada" className="sm:col-span-2"><Input value={announcement.text ?? ""} onChange={(event) => onPatch((current) => ({ ...current, announcement: { ...current.announcement, text: event.target.value } }))} /></Field>
          <Field label="Eyebrow do destaque"><Input value={announcement.product?.eyebrow ?? ""} onChange={(event) => onPatch((current) => ({ ...current, announcement: { ...current.announcement, product: { ...current.announcement?.product, eyebrow: event.target.value } } }))} /></Field>
          <Field label="Nome exibido"><Input value={announcement.product?.name ?? ""} onChange={(event) => onPatch((current) => ({ ...current, announcement: { ...current.announcement, product: { ...current.announcement?.product, name: event.target.value } } }))} /></Field>
          <Field label="Texto do botão"><Input value={announcement.product?.cta_label ?? ""} onChange={(event) => onPatch((current) => ({ ...current, announcement: { ...current.announcement, product: { ...current.announcement?.product, cta_label: event.target.value } } }))} /></Field>
          <Field label="Link do botão"><Input value={announcement.product?.cta_href ?? ""} onChange={(event) => onPatch((current) => ({ ...current, announcement: { ...current.announcement, product: { ...current.announcement?.product, cta_href: event.target.value } } }))} /></Field>
        </div>
        <div className="mt-4"><HomeImageUpload compact label="Imagem do destaque" recommended="quadrada, 400×400 px ou maior" maxWidth={800} value={announcement.product?.image_url ?? ""} onChange={(imageUrl) => onPatch((current) => ({ ...current, announcement: { ...current.announcement, product: { ...current.announcement?.product, image_url: imageUrl } } }))} /></div>
      </EditorAccordion>
    </div>
  );
}

function CategoryOrderPanel({ categories, dirty, saving, dragIndex, onDragIndex, onDrop, onMove, onSave, onReset, onCreate, onRename, onDeleteCategory }: {
  categories: CategoryRow[];
  dirty: boolean;
  saving: boolean;
  dragIndex: number | null;
  onDragIndex: (index: number | null) => void;
  onDrop: (index: number) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onSave: () => void;
  onReset: () => void;
  onCreate: (name: string) => void | Promise<void>;
  onRename: (id: string, name: string) => void | Promise<void>;
  onDeleteCategory: (id: string, name: string) => void | Promise<void>;
}) {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  function startEdit(category: CategoryRow) {
    setEditingId(category.id);
    setEditingName(category.name);
  }

  async function confirmEdit(category: CategoryRow) {
    const name = editingName.trim();
    setEditingId(null);
    if (name.length < 2 || name === category.name) return;
    await onRename(category.id, name);
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">Categorias da loja</p>
            <h2 className="mt-1 text-lg font-semibold">Nomes, ordem e onde cada categoria aparece</h2>
            <p className="mt-2 max-w-2xl text-xs leading-5 text-muted-foreground">
              Renomeie uma categoria (ex.: trocar “Skincare” por “Bolsas”) e o novo nome muda na loja inteira. Arraste para reordenar: a mesma sequência é usada no menu do topo, nos atalhos de categoria e nas vitrines “Novidades e mais vendidos” da Home.
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={!dirty || saving} onClick={onReset}><RotateCcw className="mr-2 h-3.5 w-3.5" /> Desfazer</Button>
            <Button size="sm" disabled={!dirty || saving} onClick={onSave}>{saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />} Salvar posições</Button>
          </div>
        </div>
        <div className={`mt-4 rounded-lg px-3 py-2 text-xs ${dirty ? "bg-warning/10 font-semibold text-warning" : "bg-success/10 text-success"}`}>
          {dirty ? "Preview atualizado. Salve para aplicar a nova ordem na Home." : "A ordem exibida corresponde ao que está salvo no catálogo."}
        </div>
        <div className="mt-3">
          <HelpNote>
            Toda categoria criada aqui entra <strong className="text-foreground">automaticamente</strong> no menu do topo, nos atalhos da Home e no bloco “Categorias em linha” quando ele estiver no modo “Todas”. Renomear e reordenar não exige nenhuma outra configuração.
          </HelpNote>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
        <p className="text-sm font-semibold">Criar nova categoria</p>
        <p className="mt-1 text-xs text-muted-foreground">Digite o nome como o cliente deve ver (ex.: Bolsas, Perfumes, Cabelos).</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Input
            className="max-w-xs"
            value={newName}
            placeholder="Nome da categoria"
            onChange={(event) => setNewName(event.target.value)}
          />
          <Button
            size="sm"
            disabled={newName.trim().length < 2}
            onClick={async () => { const name = newName.trim(); setNewName(""); await onCreate(name); }}
          >
            <Plus className="mr-2 h-3.5 w-3.5" /> Criar categoria
          </Button>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-soft">
        <div className="space-y-2">
          {categories.map((category, index) => {
            const editing = editingId === category.id;
            return (
              <div
                key={category.id}
                draggable={!editing}
                onDragStart={() => onDragIndex(index)}
                onDragEnd={() => onDragIndex(null)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => onDrop(index)}
                className={`flex items-center gap-3 rounded-xl border p-3 transition ${dragIndex === index ? "border-dashed border-primary bg-primary/5" : "border-border bg-background hover:border-primary/30"}`}
              >
                <button type="button" className="cursor-grab text-muted-foreground active:cursor-grabbing" title="Arrastar para reposicionar"><GripVertical className="h-5 w-5" /></button>
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{index + 1}</div>
                <div className="min-w-0 flex-1">
                  {editing ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        autoFocus
                        className="h-8 max-w-[240px]"
                        value={editingName}
                        onChange={(event) => setEditingName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") void confirmEdit(category);
                          if (event.key === "Escape") setEditingId(null);
                        }}
                      />
                      <Button size="icon" variant="ghost" title="Salvar nome" onClick={() => void confirmEdit(category)}><Check className="h-4 w-4 text-success" /></Button>
                      <Button size="icon" variant="ghost" title="Cancelar" onClick={() => setEditingId(null)}><X className="h-4 w-4" /></Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold">{category.name}</p>
                        {index < 5 && <Badge variant="secondary" className="h-5 text-[9px]">Aparece no menu do topo</Badge>}
                      </div>
                      <p className="text-[10px] text-muted-foreground">Endereço /{category.slug} · o endereço não muda ao renomear (links antigos continuam funcionando)</p>
                    </>
                  )}
                </div>
                <div className="flex shrink-0">
                  <Button size="icon" variant="ghost" title="Renomear" onClick={() => startEdit(category)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" disabled={index === 0} title="Subir" onClick={() => onMove(index, -1)}><ArrowUp className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" disabled={index === categories.length - 1} title="Descer" onClick={() => onMove(index, 1)}><ArrowDown className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" title="Remover categoria" onClick={() => void onDeleteCategory(category.id, category.name)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </div>
            );
          })}
          {categories.length === 0 && <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Nenhuma categoria cadastrada ainda.</div>}
        </div>
      </section>
    </div>
  );
}

function EditorAccordion({ title, subtitle, open, onOpen, children }: { title: string; subtitle: string; open: boolean; onOpen: () => void; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
      <button type="button" onClick={onOpen} className="flex w-full items-center justify-between gap-3 p-5 text-left">
        <div><h3 className="text-base font-semibold">{title}</h3><p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p></div>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="border-t border-border p-5">{children}</div>}
    </section>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={`block ${className}`}><span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>{children}</label>;
}

function labelForKind(kind: string) {
  const labels: Record<string, string> = {
    banner: "Banner",
    hero: "Hero",
    collection: "Coleção",
    text: "Texto editorial",
    category_grid: "Categorias em linha",
    category_products: "Produtos por categoria",
    products: "Produtos manuais",
    spacer: "Espaçamento",
    divider: "Divisor",
    product_showcase: "Vitrine de produtos",
    banner_duo: "Banner duplo",
    promo_fullwidth: "Banner promocional",
    manifesto: "Manifesto",
    newsletter: "Newsletter",
  };
  return labels[kind] ?? kind;
}
