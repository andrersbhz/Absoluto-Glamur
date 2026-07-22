import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Trash2, ChevronDown, ChevronUp, ImagePlus, Loader2, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { homepageBlocksAdminQuery, type HomepageBlock } from "@/lib/marketing";
import { imageFileToWebpDataUri } from "@/lib/image-webp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { BENEFIT_ICONS } from "@/components/home/HomeBlocks";

const BLOCK_KINDS = [
  { value: "announcement_bar", label: "Barra de anúncio (topo)" },
  { value: "hero_fullwidth", label: "Banner Hero 100% largura" },
  { value: "benefits_bar", label: "Barra de vantagens (ícones)" },
  { value: "category_circles", label: "Categorias em círculos" },
  { value: "product_showcase", label: "Vitrine de produtos (Best Sellers / Queridinhos / etc.)" },
  { value: "banner_duo", label: "Banner duplo (2 colunas)" },
  { value: "advantages_grid", label: "Vantagens de comprar (grid 4)" },
  { value: "promo_fullwidth", label: "Banner promocional 100%" },
  { value: "manifesto", label: "Manifesto editorial" },
  { value: "newsletter", label: "Newsletter" },
];

const ICON_OPTIONS = Object.keys(BENEFIT_ICONS);

type D = Record<string, unknown>;

export function HomepageBlocksEditor() {
  const qc = useQueryClient();
  const { data: blocks = [], isLoading } = useQuery(homepageBlocksAdminQuery());
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showAdd, setShowAdd] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const refresh = () => qc.invalidateQueries({ queryKey: ["homepage-blocks"] });

  const addBlock = async (kind: string) => {
    const nextPos = (blocks[blocks.length - 1]?.position ?? 0) + 10;
    const defaults = defaultDataFor(kind);
    const { error, data } = await supabase.from("homepage_blocks").insert({
      kind, title: defaults.title, subtitle: defaults.subtitle ?? null, data: defaults.data, position: nextPos, is_active: true,
    }).select("id").single();
    setShowAdd(false);
    if (error) return toast.error(error.message);
    toast.success("Bloco adicionado");
    if (data?.id) setExpanded((e) => ({ ...e, [data.id]: true }));
    refresh();
  };

  const updateBlock = async (id: string, patch: Record<string, unknown>) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase.from("homepage_blocks").update(patch as any).eq("id", id);
    if (error) return toast.error(error.message);
    refresh();
  };

  const deleteBlock = async (id: string) => {
    if (!confirm("Remover bloco?")) return;
    const { error } = await supabase.from("homepage_blocks").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Bloco removido"); refresh();
  };

  const onDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = blocks.findIndex((b) => b.id === active.id);
    const newIndex = blocks.findIndex((b) => b.id === over.id);
    const reordered = arrayMove(blocks, oldIndex, newIndex);
    // Optimistic set
    qc.setQueryData(["homepage-blocks", "admin"], reordered);
    // Persist new positions (10, 20, 30…)
    const updates = reordered.map((b, i) => supabase.from("homepage_blocks").update({ position: (i + 1) * 10 }).eq("id", b.id));
    const results = await Promise.all(updates);
    const err = results.find((r) => r.error);
    if (err?.error) toast.error(err.error.message);
    refresh();
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando blocos…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Arraste os blocos pela alça para reordenar. Clique em um bloco para editar.
        </p>
        <div className="relative">
          <Button onClick={() => setShowAdd((v) => !v)}><Plus className="mr-2 h-4 w-4" /> Adicionar bloco</Button>
          {showAdd && (
            <div className="absolute right-0 z-20 mt-2 w-80 max-h-96 overflow-auto rounded-xl border border-border bg-popover p-2 shadow-elegant">
              {BLOCK_KINDS.map((k) => (
                <button key={k.value} onClick={() => addBlock(k.value)} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-foreground hover:bg-secondary">
                  {k.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {blocks.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Nenhum bloco. Adicione o primeiro para começar.
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {blocks.map((b) => (
              <SortableRow
                key={b.id}
                block={b}
                expanded={!!expanded[b.id]}
                onToggle={() => setExpanded((e) => ({ ...e, [b.id]: !e[b.id] }))}
                onUpdate={updateBlock}
                onDelete={deleteBlock}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SortableRow({ block, expanded, onToggle, onUpdate, onDelete }: {
  block: HomepageBlock; expanded: boolean; onToggle: () => void;
  onUpdate: (id: string, patch: Record<string, unknown>) => void | Promise<void>;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };
  const kindLabel = BLOCK_KINDS.find((k) => k.value === block.kind)?.label ?? block.kind;

  return (
    <div ref={setNodeRef} style={style} className="rounded-2xl border border-border bg-card shadow-soft">
      <div className="flex items-center gap-2 px-3 py-3">
        <button {...attributes} {...listeners} className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Arrastar">
          <GripVertical className="h-5 w-5" />
        </button>
        <Badge variant={block.is_active ? "default" : "outline"} className="shrink-0">{block.is_active ? "Ativo" : "Inativo"}</Badge>
        <button onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span className="truncate text-sm font-medium text-foreground">{block.title ?? kindLabel}</span>
          <span className="hidden text-xs uppercase tracking-widest text-muted-foreground sm:inline">· {kindLabel}</span>
        </button>
        <Button variant="ghost" size="icon" onClick={() => onUpdate(block.id, { is_active: !block.is_active })} title={block.is_active ? "Desativar" : "Ativar"}>
          {block.is_active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="icon" onClick={onToggle}>
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="icon" onClick={() => onDelete(block.id)}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>

      {expanded && (
        <div className="border-t border-border p-4">
          <BlockEditor block={block} onUpdate={onUpdate} />
        </div>
      )}
    </div>
  );
}

function BlockEditor({ block, onUpdate }: { block: HomepageBlock; onUpdate: (id: string, patch: Record<string, unknown>) => void | Promise<void> }) {
  const [local, setLocal] = useState<{ title: string; subtitle: string; data: D }>(() => ({
    title: block.title ?? "",
    subtitle: block.subtitle ?? "",
    data: (block.data ?? {}) as D,
  }));
  const [saving, setSaving] = useState(false);
  const data = local.data;
  const setData = (patch: D) => setLocal((l) => ({ ...l, data: { ...l.data, ...patch } }));

  const save = async () => {
    setSaving(true);
    await onUpdate(block.id, { title: local.title || null, subtitle: local.subtitle || null, data: local.data });
    setSaving(false);
    toast.success("Bloco salvo");
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="text-muted-foreground">Título interno</span>
          <Input value={local.title} onChange={(e) => setLocal((l) => ({ ...l, title: e.target.value }))} />
        </label>
        <label className="text-sm">
          <span className="text-muted-foreground">Subtítulo interno</span>
          <Input value={local.subtitle} onChange={(e) => setLocal((l) => ({ ...l, subtitle: e.target.value }))} />
        </label>
      </div>

      <KindFields kind={block.kind} data={data} setData={setData} />

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Salvar bloco
        </Button>
      </div>
    </div>
  );
}

function KindFields({ kind, data, setData }: { kind: string; data: D; setData: (p: D) => void }) {
  const s = (k: string, d = "") => (typeof data[k] === "string" ? (data[k] as string) : d);

  if (kind === "announcement_bar") {
    return (
      <div className="grid gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={data.enabled !== false} onChange={(e) => setData({ enabled: e.target.checked })} />
          Ativa
        </label>
        <Input placeholder="Texto (ex: Frete grátis para todo Brasil · 5% off no PIX)" value={s("text")} onChange={(e) => setData({ text: e.target.value })} />
      </div>
    );
  }

  if (kind === "hero_fullwidth") {
    return (
      <div className="grid gap-3">
        <ImageField label="Imagem desktop" value={s("image_url")} onChange={(v) => setData({ image_url: v })} />
        <ImageField label="Imagem mobile (opcional)" value={s("image_url_mobile")} onChange={(v) => setData({ image_url_mobile: v })} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input placeholder="Selo (badge)" value={s("badge")} onChange={(e) => setData({ badge: e.target.value })} />
          <select className="rounded-lg border border-border bg-background px-3 py-2 text-sm" value={s("text_align", "left")} onChange={(e) => setData({ text_align: e.target.value })}>
            <option value="left">Texto à esquerda</option>
            <option value="center">Texto centralizado</option>
            <option value="right">Texto à direita</option>
          </select>
          <Input placeholder="Título" value={s("title")} onChange={(e) => setData({ title: e.target.value })} />
          <Input placeholder="Subtítulo" value={s("subtitle")} onChange={(e) => setData({ subtitle: e.target.value })} />
          <Input placeholder="CTA — texto (ex: Comprar agora)" value={s("cta_label")} onChange={(e) => setData({ cta_label: e.target.value })} />
          <Input placeholder="CTA — link (ex: /categoria/nome-do-produto)" value={s("cta_href")} onChange={(e) => setData({ cta_href: e.target.value })} />
          <Input placeholder="CTA secundário — texto" value={s("cta_secondary_label")} onChange={(e) => setData({ cta_secondary_label: e.target.value })} />
          <Input placeholder="CTA secundário — link" value={s("cta_secondary_href")} onChange={(e) => setData({ cta_secondary_href: e.target.value })} />
        </div>
      </div>
    );
  }

  if (kind === "benefits_bar" || kind === "advantages_grid") {
    const items = Array.isArray(data.items) ? (data.items as { icon?: string; title?: string; subtitle?: string; body?: string }[]) : [];
    const update = (i: number, patch: Partial<{ icon: string; title: string; subtitle: string; body: string }>) => {
      const next = [...items]; next[i] = { ...next[i], ...patch }; setData({ items: next });
    };
    const remove = (i: number) => setData({ items: items.filter((_, j) => j !== i) });
    const add = () => setData({ items: [...items, { icon: "sparkles", title: "", subtitle: "", body: "" }] });
    const useSub = kind === "benefits_bar";
    return (
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">Deixe vazio para usar os padrões (Frete grátis, 12x, Compra segura, PIX).</p>
        {items.map((it, i) => (
          <div key={i} className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-[160px_1fr_2fr_auto]">
            <select className="rounded-lg border border-border bg-background px-3 py-2 text-sm" value={it.icon ?? "sparkles"} onChange={(e) => update(i, { icon: e.target.value })}>
              {ICON_OPTIONS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <Input placeholder="Título" value={it.title ?? ""} onChange={(e) => update(i, { title: e.target.value })} />
            {useSub
              ? <Input placeholder="Descrição curta" value={it.subtitle ?? ""} onChange={(e) => update(i, { subtitle: e.target.value })} />
              : <Textarea rows={2} placeholder="Descrição" value={it.body ?? ""} onChange={(e) => update(i, { body: e.target.value })} />}
            <Button variant="ghost" size="icon" onClick={() => remove(i)}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={add}><Plus className="mr-1 h-4 w-4" /> Adicionar ícone</Button>
      </div>
    );
  }

  if (kind === "product_showcase") {
    const source = s("source", "collection");
    const slugs = Array.isArray(data.slugs) ? (data.slugs as string[]) : [];
    return (
      <div className="grid gap-3">
        <label className="text-sm">
          <span className="text-muted-foreground">Fonte dos produtos</span>
          <select className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" value={source} onChange={(e) => setData({ source: e.target.value })}>
            <option value="collection">Coleção (ex: mais-vendidos, lancamentos)</option>
            <option value="category">Categoria</option>
            <option value="manual">Manual (slugs de produtos)</option>
          </select>
        </label>
        {source === "collection" && (
          <Input placeholder="Slug da coleção (ex: mais-vendidos)" value={s("collection")} onChange={(e) => setData({ collection: e.target.value })} />
        )}
        {source === "category" && (
          <Input placeholder="Slug da categoria (ex: skincare)" value={s("category")} onChange={(e) => setData({ category: e.target.value })} />
        )}
        {source === "manual" && (
          <Textarea rows={3} placeholder="slugs separados por vírgula (ex: serum-vitamina-c, mascara-hidratante)" value={slugs.join(", ")} onChange={(e) => setData({ slugs: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} />
        )}
        <Input type="number" placeholder="Limite de produtos" value={typeof data.limit === "number" ? String(data.limit) : "8"} onChange={(e) => setData({ limit: Number(e.target.value) || 8 })} />
      </div>
    );
  }

  if (kind === "banner_duo") {
    const left = ((data.left as D) ?? {}) as D;
    const right = ((data.right as D) ?? {}) as D;
    const setSide = (which: "left" | "right", patch: D) => setData({ [which]: { ...(which === "left" ? left : right), ...patch } });
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {(["left", "right"] as const).map((side) => {
          const it = side === "left" ? left : right;
          const sf = (k: string, d = "") => (typeof it[k] === "string" ? (it[k] as string) : d);
          return (
            <div key={side} className="space-y-2 rounded-xl border border-border p-3">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Banner {side === "left" ? "esquerdo" : "direito"}</p>
              <ImageField label="Imagem" value={sf("image_url")} onChange={(v) => setSide(side, { image_url: v })} />
              <Input placeholder="Eyebrow" value={sf("eyebrow")} onChange={(e) => setSide(side, { eyebrow: e.target.value })} />
              <Input placeholder="Título" value={sf("title")} onChange={(e) => setSide(side, { title: e.target.value })} />
              <Input placeholder="CTA — texto" value={sf("cta_label")} onChange={(e) => setSide(side, { cta_label: e.target.value })} />
              <Input placeholder="Link (ex: /products?category=skincare)" value={sf("href")} onChange={(e) => setSide(side, { href: e.target.value })} />
            </div>
          );
        })}
      </div>
    );
  }

  if (kind === "promo_fullwidth") {
    return (
      <div className="grid gap-3">
        <ImageField label="Imagem de fundo" value={s("image_url")} onChange={(v) => setData({ image_url: v })} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input placeholder="Eyebrow" value={s("eyebrow")} onChange={(e) => setData({ eyebrow: e.target.value })} />
          <Input placeholder="Título" value={s("title")} onChange={(e) => setData({ title: e.target.value })} />
          <Input placeholder="Subtítulo" value={s("subtitle")} onChange={(e) => setData({ subtitle: e.target.value })} />
          <Input placeholder="CTA — texto" value={s("cta_label")} onChange={(e) => setData({ cta_label: e.target.value })} />
          <Input placeholder="CTA — link" value={s("cta_href")} onChange={(e) => setData({ cta_href: e.target.value })} />
        </div>
      </div>
    );
  }

  if (kind === "manifesto") {
    return (
      <div className="grid gap-3">
        <Input placeholder="Eyebrow" value={s("eyebrow")} onChange={(e) => setData({ eyebrow: e.target.value })} />
        <Textarea rows={4} placeholder="Corpo do manifesto" value={s("body")} onChange={(e) => setData({ body: e.target.value })} />
        <Input placeholder="Assinatura" value={s("signature")} onChange={(e) => setData({ signature: e.target.value })} />
      </div>
    );
  }

  if (kind === "newsletter") {
    return (
      <Textarea rows={2} placeholder="Descrição (ex: Assine e ganhe 10% off na primeira compra)" value={s("body")} onChange={(e) => setData({ body: e.target.value })} />
    );
  }

  if (kind === "category_circles") {
    const images = ((data.images as Record<string, string>) ?? {}) as Record<string, string>;
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Preenche automaticamente com as categorias cadastradas. Opcionalmente, defina uma imagem por slug de categoria.</p>
        <Textarea rows={4} placeholder='{"skincare": "https://…", "maquiagem": "https://…"}' value={JSON.stringify(images)} onChange={(e) => { try { setData({ images: JSON.parse(e.target.value || "{}") }); } catch { /* ignore */ } }} />
      </div>
    );
  }

  return <p className="text-sm text-muted-foreground">Este tipo de bloco não possui campos editáveis.</p>;
}

function ImageField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [uploading, setUploading] = useState(false);
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex flex-wrap items-center gap-3">
        {value ? (
          <img src={value} alt="" className="h-16 w-24 rounded-lg border border-border object-cover" />
        ) : (
          <div className="grid h-16 w-24 place-items-center rounded-lg border border-dashed border-border text-muted-foreground">
            <ImagePlus className="h-5 w-5" />
          </div>
        )}
        <div className="flex-1 min-w-[240px]">
          <Input placeholder="Cole uma URL da imagem…" value={value} onChange={(e) => onChange(e.target.value)} />
        </div>
        <label className="cursor-pointer rounded-lg border border-border px-3 py-2 text-xs uppercase tracking-widest text-foreground transition hover:bg-secondary">
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enviar arquivo"}
          <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
            const file = e.target.files?.[0]; if (!file) return;
            setUploading(true);
            try {
              const dataUri = await imageFileToWebpDataUri(file, { maxWidth: 1920, quality: 0.85 });
              onChange(dataUri);
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Falha ao processar imagem");
            } finally { setUploading(false); }
          }} />
        </label>
      </div>
    </div>
  );
}

function defaultDataFor(kind: string): { title: string; subtitle?: string; data: D } {
  switch (kind) {
    case "announcement_bar": return { title: "Barra de anúncio", data: { enabled: true, text: "Frete grátis para todo o Brasil · 5% off no PIX" } };
    case "hero_fullwidth": return { title: "Nova coleção", data: { title: "Nova coleção", subtitle: "Descubra as novidades da estação", cta_label: "Comprar agora", cta_href: "/products", text_align: "left", badge: "Novidades" } };
    case "benefits_bar": return { title: "Vantagens", data: { items: [] } };
    case "category_circles": return { title: "Categorias", subtitle: "Navegue por seções", data: { images: {} } };
    case "product_showcase": return { title: "Best Sellers", subtitle: "Os favoritos das clientes", data: { source: "collection", collection: "mais-vendidos", limit: 8 } };
    case "banner_duo": return { title: "Banner duplo", data: { left: { title: "Skincare", cta_label: "Ver skincare", href: "/products?category=skincare" }, right: { title: "Maquiagem", cta_label: "Ver maquiagem", href: "/products?category=maquiagem" } } };
    case "advantages_grid": return { title: "Vantagens de comprar", subtitle: "Por que comprar com a gente", data: { items: [] } };
    case "promo_fullwidth": return { title: "Promoção", data: { eyebrow: "Oferta limitada", title: "Até 40% off em skincare", subtitle: "Enquanto durarem os estoques", cta_label: "Aproveitar", cta_href: "/products?collection=promocoes" } };
    case "manifesto": return { title: "Manifesto", data: { eyebrow: "Manifesto", body: "Beleza que celebra você.", signature: "— Absoluto Glamur" } };
    case "newsletter": return { title: "Receba novidades e ofertas exclusivas", subtitle: "Newsletter", data: { body: "Assine e ganhe 10% de desconto na sua primeira compra." } };
    default: return { title: "Bloco", data: {} };
  }
}
