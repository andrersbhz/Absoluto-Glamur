import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, GripVertical, Plus, Save, Trash2 } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { categoriesQuery, collectionsQuery } from "@/lib/catalog";
import { homepageBlocksAdminQuery, type HomepageBlock } from "@/lib/marketing";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/home")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
    const allowed = (roles ?? []).some((r) => ["admin", "superadmin", "marketing"].includes(String(r.role)));
    if (!allowed) throw redirect({ to: "/account" });
  },
  component: HomeBuilderPage,
});

type BlockKind =
  | "category_grid"
  | "category_products"
  | "collection"
  | "products"
  | "banner"
  | "text"
  | "spacer"
  | "divider";

type BlockData = {
  mode?: "all" | "selected";
  categories?: string[];
  category_slug?: string;
  collection_slug?: string;
  product_ids?: string[];
  limit?: number;
  columns?: number;
  image_url?: string;
  href?: string;
  cta_label?: string;
  body?: string;
  height?: number;
  background?: string;
  full_width?: boolean;
};

const BLOCK_TYPES: { value: BlockKind; label: string; description: string }[] = [
  { value: "category_grid", label: "Grade de categorias", description: "Exibe todas as categorias ou somente as selecionadas." },
  { value: "category_products", label: "Produtos por categoria", description: "Cria vitrines de produtos para todas as categorias ou uma categoria específica." },
  { value: "collection", label: "Coleção", description: "Vitrine de uma coleção cadastrada." },
  { value: "products", label: "Produtos manuais", description: "Reserva um bloco para curadoria manual de produtos." },
  { value: "banner", label: "Banner", description: "Imagem, título, subtítulo e link promocional." },
  { value: "text", label: "Texto editorial", description: "Título e texto livre." },
  { value: "divider", label: "Divisor", description: "Separador visual entre seções." },
  { value: "spacer", label: "Espaçamento", description: "Espaço vertical configurável." },
];

function HomeBuilderPage() {
  const qc = useQueryClient();
  const { data: blocks = [], isLoading } = useQuery(homepageBlocksAdminQuery());
  const { data: categories = [] } = useQuery(categoriesQuery());
  const { data: collections = [] } = useQuery(collectionsQuery());
  const [creating, setCreating] = useState(false);

  const ordered = useMemo(() => [...blocks].sort((a, b) => a.position - b.position), [blocks]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["homepage-blocks"] });

  async function addBlock(kind: BlockKind = "category_grid") {
    setCreating(true);
    try {
      const position = (ordered.at(-1)?.position ?? 0) + 10;
      const defaults: Record<BlockKind, BlockData> = {
        category_grid: { mode: "all", columns: 4 },
        category_products: { mode: "all", limit: 4 },
        collection: { limit: 4 },
        products: { limit: 4, product_ids: [] },
        banner: { href: "/products", cta_label: "Ver produtos" },
        text: { body: "" },
        spacer: { height: 48 },
        divider: {},
      };
      const type = BLOCK_TYPES.find((x) => x.value === kind);
      const { error } = await supabase.from("homepage_blocks").insert({
        kind,
        title: type?.label ?? "Novo bloco",
        subtitle: null,
        data: defaults[kind],
        position,
        is_active: true,
      });
      if (error) throw error;
      toast.success("Bloco adicionado à Home");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível adicionar o bloco");
    } finally {
      setCreating(false);
    }
  }

  async function patch(id: string, values: Record<string, unknown>) {
    const { error } = await supabase.from("homepage_blocks").update(values).eq("id", id);
    if (error) return toast.error(error.message);
    refresh();
  }

  async function patchData(block: HomepageBlock, values: Partial<BlockData>) {
    await patch(block.id, { data: { ...((block.data ?? {}) as BlockData), ...values } });
  }

  async function move(block: HomepageBlock, direction: -1 | 1) {
    const index = ordered.findIndex((b) => b.id === block.id);
    const target = ordered[index + direction];
    if (!target) return;
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from("homepage_blocks").update({ position: target.position }).eq("id", block.id),
      supabase.from("homepage_blocks").update({ position: block.position }).eq("id", target.id),
    ]);
    if (e1 || e2) return toast.error(e1?.message ?? e2?.message ?? "Erro ao ordenar");
    refresh();
  }

  async function duplicate(block: HomepageBlock) {
    const { error } = await supabase.from("homepage_blocks").insert({
      kind: block.kind,
      title: block.title ? `${block.title} — cópia` : "Cópia",
      subtitle: block.subtitle,
      data: block.data,
      position: (ordered.at(-1)?.position ?? 0) + 10,
      is_active: false,
    });
    if (error) return toast.error(error.message);
    toast.success("Bloco duplicado como rascunho");
    refresh();
  }

  async function remove(id: string) {
    if (!confirm("Remover este bloco da Home?")) return;
    const { error } = await supabase.from("homepage_blocks").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Bloco removido");
    refresh();
  }

  if (isLoading) {
    return <AdminLayout><p className="text-sm text-muted-foreground">Carregando Home Builder…</p></AdminLayout>;
  }

  return (
    <AdminLayout>
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Badge variant="secondary">Versão 1.2</Badge>
            <h1 className="mt-2 font-display text-3xl">Home Builder</h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Monte a página inicial por blocos. Você pode adicionar, remover, duplicar, ordenar, ocultar e editar cada seção sem alterar código ou JSON.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild><a href="/" target="_blank" rel="noreferrer"><Eye className="mr-2 h-4 w-4" /> Visualizar Home</a></Button>
            <select
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              defaultValue="category_grid"
              onChange={(e) => addBlock(e.target.value as BlockKind)}
              disabled={creating}
            >
              <option value="" disabled>Adicionar bloco…</option>
              {BLOCK_TYPES.map((type) => <option key={type.value} value={type.value}>+ {type.label}</option>)}
            </select>
          </div>
        </header>

        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm">
          <strong>Todas as categorias:</strong> use “Grade de categorias” em modo <strong>Todas</strong> para mostrar automaticamente qualquer categoria cadastrada agora ou no futuro. Use “Produtos por categoria” em modo <strong>Todas</strong> para criar uma vitrine para cada categoria que tenha produtos ativos.
        </div>

        {ordered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-12 text-center">
            <p className="font-display text-2xl">Sua Home ainda não tem blocos</p>
            <p className="mt-2 text-sm text-muted-foreground">Comece exibindo todas as categorias.</p>
            <Button className="mt-5" onClick={() => addBlock("category_grid")}><Plus className="mr-2 h-4 w-4" /> Adicionar categorias</Button>
          </div>
        ) : (
          <div className="space-y-4">
            {ordered.map((block, index) => (
              <BlockEditor
                key={block.id}
                block={block}
                index={index}
                total={ordered.length}
                categories={categories}
                collections={collections}
                onPatch={patch}
                onPatchData={patchData}
                onMove={move}
                onDuplicate={duplicate}
                onRemove={remove}
              />
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

function BlockEditor({ block, index, total, categories, collections, onPatch, onPatchData, onMove, onDuplicate, onRemove }: {
  block: HomepageBlock;
  index: number;
  total: number;
  categories: { id: string; slug: string; name: string; position: number }[];
  collections: { id: string; slug: string; name: string; description: string | null; is_featured: boolean; position: number }[];
  onPatch: (id: string, values: Record<string, unknown>) => Promise<void>;
  onPatchData: (block: HomepageBlock, values: Partial<BlockData>) => Promise<void>;
  onMove: (block: HomepageBlock, direction: -1 | 1) => Promise<void>;
  onDuplicate: (block: HomepageBlock) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const data = (block.data ?? {}) as BlockData;
  const type = BLOCK_TYPES.find((x) => x.value === block.kind);
  const [draftTitle, setDraftTitle] = useState(block.title ?? "");
  const [draftSubtitle, setDraftSubtitle] = useState(block.subtitle ?? "");

  const saveText = async () => {
    await onPatch(block.id, { title: draftTitle || null, subtitle: draftSubtitle || null });
    toast.success("Texto do bloco atualizado");
  };

  return (
    <section className={`rounded-2xl border bg-card shadow-soft ${block.is_active ? "border-border" : "border-dashed border-border opacity-75"}`}>
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <GripVertical className="h-4 w-4 text-muted-foreground" />
        <Badge variant={block.is_active ? "default" : "outline"}>{block.is_active ? "Visível" : "Oculto"}</Badge>
        <div className="min-w-0 flex-1">
          <p className="font-medium">{type?.label ?? block.kind}</p>
          <p className="text-xs text-muted-foreground">{type?.description}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" disabled={index === 0} onClick={() => onMove(block, -1)} title="Mover para cima"><ArrowUp className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" disabled={index === total - 1} onClick={() => onMove(block, 1)} title="Mover para baixo"><ArrowDown className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" onClick={() => onDuplicate(block)} title="Duplicar"><Copy className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" onClick={() => onPatch(block.id, { is_active: !block.is_active })} title={block.is_active ? "Ocultar" : "Mostrar"}>{block.is_active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>
          <Button size="icon" variant="ghost" onClick={() => onRemove(block.id)} title="Remover"><Trash2 className="h-4 w-4 text-destructive" /></Button>
        </div>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-2">
        <label className="text-sm">
          <span className="text-muted-foreground">Título</span>
          <Input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} />
        </label>
        <label className="text-sm">
          <span className="text-muted-foreground">Subtítulo</span>
          <Input value={draftSubtitle} onChange={(e) => setDraftSubtitle(e.target.value)} />
        </label>
        <div className="lg:col-span-2 flex justify-end"><Button size="sm" variant="outline" onClick={saveText}><Save className="mr-2 h-4 w-4" /> Salvar título</Button></div>

        {(block.kind === "category_grid" || block.kind === "category_products") && (
          <>
            <label className="text-sm">
              <span className="text-muted-foreground">Quais categorias?</span>
              <select className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2" value={data.mode ?? "all"} onChange={(e) => onPatchData(block, { mode: e.target.value as "all" | "selected" })}>
                <option value="all">Todas — automático</option>
                <option value="selected">Selecionadas manualmente</option>
              </select>
            </label>
            {block.kind === "category_products" && (
              <label className="text-sm"><span className="text-muted-foreground">Produtos por categoria</span><Input type="number" min={1} max={12} value={data.limit ?? 4} onChange={(e) => onPatchData(block, { limit: Number(e.target.value) || 4 })} /></label>
            )}
            {data.mode === "selected" && (
              <div className="lg:col-span-2 rounded-xl border border-border p-3">
                <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Categorias selecionadas</p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {categories.map((category) => {
                    const checked = (data.categories ?? []).includes(category.slug);
                    return <label key={category.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"><input type="checkbox" checked={checked} onChange={(e) => {
                      const current = data.categories ?? [];
                      const next = e.target.checked ? [...new Set([...current, category.slug])] : current.filter((slug) => slug !== category.slug);
                      onPatchData(block, { categories: next });
                    }} />{category.name}</label>;
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {block.kind === "collection" && (
          <>
            <label className="text-sm"><span className="text-muted-foreground">Coleção</span><select className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2" value={data.collection_slug ?? ""} onChange={(e) => onPatchData(block, { collection_slug: e.target.value })}><option value="">Selecione…</option>{collections.map((collection) => <option key={collection.id} value={collection.slug}>{collection.name}</option>)}</select></label>
            <label className="text-sm"><span className="text-muted-foreground">Quantidade</span><Input type="number" min={1} max={12} value={data.limit ?? 4} onChange={(e) => onPatchData(block, { limit: Number(e.target.value) || 4 })} /></label>
          </>
        )}

        {block.kind === "banner" && (
          <>
            <label className="text-sm lg:col-span-2"><span className="text-muted-foreground">URL da imagem</span><Input value={data.image_url ?? ""} onChange={(e) => onPatchData(block, { image_url: e.target.value })} placeholder="https://…" /></label>
            <label className="text-sm"><span className="text-muted-foreground">Link</span><Input value={data.href ?? ""} onChange={(e) => onPatchData(block, { href: e.target.value })} placeholder="/products" /></label>
            <label className="text-sm"><span className="text-muted-foreground">Texto do botão</span><Input value={data.cta_label ?? ""} onChange={(e) => onPatchData(block, { cta_label: e.target.value })} /></label>
          </>
        )}

        {block.kind === "text" && <label className="text-sm lg:col-span-2"><span className="text-muted-foreground">Texto</span><Textarea rows={6} value={data.body ?? ""} onChange={(e) => onPatchData(block, { body: e.target.value })} /></label>}
        {block.kind === "spacer" && <label className="text-sm"><span className="text-muted-foreground">Altura em pixels</span><Input type="number" min={8} max={240} value={data.height ?? 48} onChange={(e) => onPatchData(block, { height: Number(e.target.value) || 48 })} /></label>}
      </div>
    </section>
  );
}
