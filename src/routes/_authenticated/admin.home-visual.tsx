import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Eye, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { HomeImageUpload } from "@/components/admin/HomeImageUpload";
import { HeroSlider } from "@/components/store/HeroSlider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { homeContentQuery, homepageBlocksAdminQuery, type HeroSlide, type HomeContent, type HomepageBlock } from "@/lib/marketing";
import { upsertSiteSetting } from "@/lib/site-settings.functions";

export const Route = createFileRoute("/_authenticated/admin/home-visual")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
    if (!(roles ?? []).some((r) => ["admin", "superadmin", "marketing"].includes(String(r.role)))) throw redirect({ to: "/account" });
  },
  head: () => ({ meta: [{ title: "Editor visual da Home · Absoluto Glamur" }] }),
  component: HomeVisualEditor,
});

type VisualBlockData = Record<string, unknown> & {
  image_url?: string; image_mobile_url?: string; cta_label?: string; cta_href?: string; cta_target?: "_self" | "_blank";
  title_color?: string; subtitle_color?: string; title_size_desktop?: number; title_size_mobile?: number;
  subtitle_size_desktop?: number; subtitle_size_mobile?: number; button_bg?: string; button_color?: string; button_hover_bg?: string;
  overlay_color?: string; overlay_opacity?: number; image_position_x?: number; image_position_y?: number;
  height_desktop?: number; height_mobile?: number; margin_top?: number; margin_bottom?: number; border_radius?: number;
  text_align?: "left" | "center" | "right"; vertical_align?: "top" | "center" | "bottom"; full_width?: boolean; content_max_width?: number;
};

function HomeVisualEditor() {
  const qc = useQueryClient();
  const saveSetting = useServerFn(upsertSiteSetting);
  const { data: currentHome = {} } = useQuery(homeContentQuery());
  const { data: blocks = [] } = useQuery(homepageBlocksAdminQuery());
  const [homeDraft, setHomeDraft] = useState<HomeContent | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [blockDraft, setBlockDraft] = useState<HomepageBlock | null>(null);
  const home = homeDraft ?? currentHome;
  const slides = home.hero_slider?.slides ?? [];
  const heroBlocks = useMemo(() => blocks.filter((b) => b.kind === "hero"), [blocks]);

  const patchHome = (mutator: (value: HomeContent) => HomeContent) => setHomeDraft(mutator(structuredClone(home)));
  const patchSlide = (index: number, patch: Partial<HeroSlide>) => patchHome((value) => ({ ...value, hero_slider: { ...value.hero_slider, slides: (value.hero_slider?.slides ?? []).map((s, i) => i === index ? { ...s, ...patch } : s) } }));
  const patchHero = (patch: Partial<NonNullable<HomeContent["hero"]>>) => patchHome((value) => ({ ...value, hero: { ...(value.hero ?? {}), ...patch } }));

  async function saveHome() {
    if (!homeDraft) return;
    setSaving(true);
    try {
      await saveSetting({ data: { key: "home_content", value: homeDraft as Record<string, unknown> } });
      await qc.invalidateQueries({ queryKey: ["site-settings", "home_content"] });
      setHomeDraft(null);
      toast.success("Configuração visual da Home salva.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao salvar a Home."); }
    finally { setSaving(false); }
  }

  async function saveBlock() {
    if (!blockDraft) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("homepage_blocks").update({ title: blockDraft.title, subtitle: blockDraft.subtitle, data: blockDraft.data, is_active: blockDraft.is_active } as never).eq("id", blockDraft.id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["homepage-blocks"] });
      toast.success("Hero secundário salvo.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao salvar hero secundário."); }
    finally { setSaving(false); }
  }

  function addSlide() {
    patchHome((value) => ({ ...value, hero_slider: { enabled: true, autoplay_ms: value.hero_slider?.autoplay_ms ?? 6000, ...value.hero_slider, slides: [...(value.hero_slider?.slides ?? []), { title: "Novo destaque", subtitle: "", cta_label: "Ver produtos", cta_href: "/products", align: "left", image_position_x: 50, image_position_y: 50, overlay_opacity: .45, height_desktop: 640, height_mobile: 500 }] } }));
  }

  return (
    <AdminLayout>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto pr-1">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h1 className="font-display text-3xl">Editor visual da Home</h1><p className="mt-1 text-sm text-muted-foreground">Controle responsivo de Hero principal, Slider e Hero secundário sem alterar a estrutura da loja.</p></div>
          <div className="flex gap-2"><a href="/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm"><Eye className="h-4 w-4" />Ver Home</a><Button onClick={saveHome} disabled={!homeDraft || saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Salvar Home</Button></div>
        </div>

        <Tabs defaultValue="slider">
          <TabsList><TabsTrigger value="slider">Slider principal</TabsTrigger><TabsTrigger value="hero">Hero principal</TabsTrigger><TabsTrigger value="secondary">Hero secundário</TabsTrigger></TabsList>

          <TabsContent value="slider" className="space-y-5">
            <div className="grid gap-4 rounded-2xl border border-border bg-card p-5 md:grid-cols-3">
              <Field label="Autoplay (ms)"><Input type="number" value={home.hero_slider?.autoplay_ms ?? 6000} onChange={(e) => patchHome((v) => ({ ...v, hero_slider: { ...v.hero_slider, autoplay_ms: Number(e.target.value) } }))} /></Field>
              <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={home.hero_slider?.enabled !== false} onChange={(e) => patchHome((v) => ({ ...v, hero_slider: { ...v.hero_slider, enabled: e.target.checked } }))} /> Slider ativo na Home</label>
              <div className="flex items-end"><Button type="button" variant="outline" onClick={addSlide}><Plus className="mr-2 h-4 w-4" />Adicionar slide</Button></div>
            </div>
            {slides.map((slide, index) => <SlideEditor key={index} index={index} slide={slide} patch={(p) => patchSlide(index, p)} remove={() => patchHome((v) => ({ ...v, hero_slider: { ...v.hero_slider, slides: (v.hero_slider?.slides ?? []).filter((_, i) => i !== index) } }))} />)}
            {slides.length > 0 && <div className="overflow-hidden rounded-2xl border border-border"><HeroSlider slides={slides} autoplayMs={0} /></div>}
          </TabsContent>

          <TabsContent value="hero" className="space-y-5">
            <HeroFields value={home.hero ?? {}} patch={patchHero} />
          </TabsContent>

          <TabsContent value="secondary" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
              <div className="space-y-2 rounded-2xl border border-border bg-card p-3">{heroBlocks.map((b) => <button key={b.id} onClick={() => { setSelectedBlockId(b.id); setBlockDraft({ ...b, data: { ...(b.data ?? {}) } }); }} className={`w-full rounded-xl border px-3 py-3 text-left text-sm ${selectedBlockId === b.id ? "border-primary bg-primary/10" : "border-border"}`}><strong>{b.title || "Hero secundário"}</strong><span className="mt-1 block text-xs text-muted-foreground">{b.is_active ? "Publicado" : "Oculto"}</span></button>)}</div>
              <div>{blockDraft ? <SecondaryHeroEditor block={blockDraft} setBlock={setBlockDraft} onSave={saveBlock} saving={saving} /> : <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">Selecione um Hero secundário.</div>}</div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}

function SlideEditor({ index, slide, patch, remove }: { index: number; slide: HeroSlide; patch: (p: Partial<HeroSlide>) => void; remove: () => void }) {
  return <div className="space-y-4 rounded-2xl border border-border bg-card p-5"><div className="flex justify-between"><h2 className="font-display text-2xl">Slide {index + 1}</h2><Button variant="ghost" size="icon" onClick={remove}><Trash2 className="h-4 w-4 text-destructive" /></Button></div><div className="grid gap-4 md:grid-cols-2"><Field label="Título"><Input value={slide.title ?? ""} onChange={(e) => patch({ title: e.target.value })} /></Field><Field label="Subtítulo"><Input value={slide.subtitle ?? ""} onChange={(e) => patch({ subtitle: e.target.value })} /></Field><Field label="Texto do botão"><Input value={slide.cta_label ?? ""} onChange={(e) => patch({ cta_label: e.target.value })} /></Field><Field label="Link do botão"><Input value={slide.cta_href ?? ""} onChange={(e) => patch({ cta_href: e.target.value })} /></Field></div><HomeImageUpload label="Imagem desktop" value={slide.image_url} onChange={(v) => patch({ image_url: v })} recommended="1920×800" /><HomeImageUpload label="Imagem mobile" value={slide.image_mobile_url} onChange={(v) => patch({ image_mobile_url: v })} recommended="900×1200" /><VisualControls value={slide} patch={patch} /></div>;
}

function HeroFields({ value, patch }: { value: NonNullable<HomeContent["hero"]>; patch: (p: Partial<NonNullable<HomeContent["hero"]>>) => void }) {
  return <div className="space-y-4 rounded-2xl border border-border bg-card p-5"><div className="grid gap-4 md:grid-cols-2"><Field label="Badge"><Input value={value.badge ?? ""} onChange={(e) => patch({ badge: e.target.value })} /></Field><Field label="Título"><Input value={value.title_line1 ?? ""} onChange={(e) => patch({ title_line1: e.target.value })} /></Field><Field label="Destaque do título"><Input value={value.title_highlight ?? ""} onChange={(e) => patch({ title_highlight: e.target.value })} /></Field><Field label="Subtítulo"><Input value={value.subtitle ?? ""} onChange={(e) => patch({ subtitle: e.target.value })} /></Field><Field label="Texto do botão"><Input value={value.cta_primary_label ?? ""} onChange={(e) => patch({ cta_primary_label: e.target.value })} /></Field><Field label="Link"><Input value={value.cta_primary_href ?? ""} onChange={(e) => patch({ cta_primary_href: e.target.value })} /></Field></div><HomeImageUpload label="Imagem desktop" value={value.image_url} onChange={(v) => patch({ image_url: v })} /><HomeImageUpload label="Imagem mobile" value={value.image_mobile_url} onChange={(v) => patch({ image_mobile_url: v })} /><VisualControls value={value} patch={patch} /></div>;
}

function SecondaryHeroEditor({ block, setBlock, onSave, saving }: { block: HomepageBlock; setBlock: (b: HomepageBlock) => void; onSave: () => void; saving: boolean }) {
  const data = block.data as VisualBlockData;
  const patchData = (p: Partial<VisualBlockData>) => setBlock({ ...block, data: { ...data, ...p } });
  return <div className="space-y-4 rounded-2xl border border-border bg-card p-5"><div className="flex justify-between"><h2 className="font-display text-2xl">Hero secundário</h2><Button onClick={onSave} disabled={saving}><Save className="mr-2 h-4 w-4" />Salvar bloco</Button></div><div className="grid gap-4 md:grid-cols-2"><Field label="Título"><Input value={block.title ?? ""} onChange={(e) => setBlock({ ...block, title: e.target.value })} /></Field><Field label="Subtítulo"><Input value={block.subtitle ?? ""} onChange={(e) => setBlock({ ...block, subtitle: e.target.value })} /></Field><Field label="Texto do botão"><Input value={data.cta_label ?? ""} onChange={(e) => patchData({ cta_label: e.target.value })} /></Field><Field label="Link do botão"><Input value={data.cta_href ?? ""} onChange={(e) => patchData({ cta_href: e.target.value })} /></Field></div><HomeImageUpload label="Imagem desktop" value={data.image_url} onChange={(v) => patchData({ image_url: v })} /><HomeImageUpload label="Imagem mobile" value={data.image_mobile_url} onChange={(v) => patchData({ image_mobile_url: v })} /><VisualControls value={data as HeroSlide} patch={patchData as (p: Partial<HeroSlide>) => void} /><div className="grid gap-4 md:grid-cols-3"><NumberField label="Margem superior" value={data.margin_top ?? 48} onChange={(v) => patchData({ margin_top: v })} /><NumberField label="Margem inferior" value={data.margin_bottom ?? 48} onChange={(v) => patchData({ margin_bottom: v })} /><NumberField label="Raio da borda" value={data.border_radius ?? 32} onChange={(v) => patchData({ border_radius: v })} /></div></div>;
}

function VisualControls({ value, patch }: { value: HeroSlide; patch: (p: Partial<HeroSlide>) => void }) {
  return <div className="grid gap-4 rounded-xl border border-border bg-secondary/20 p-4 md:grid-cols-4"><ColorField label="Cor título" value={value.title_color ?? "#ffffff"} onChange={(v) => patch({ title_color: v })} /><ColorField label="Cor subtítulo" value={value.subtitle_color ?? "#ffffff"} onChange={(v) => patch({ subtitle_color: v })} /><ColorField label="Fundo botão" value={value.button_bg ?? "#c64b76"} onChange={(v) => patch({ button_bg: v })} /><ColorField label="Cor botão" value={value.button_color ?? "#ffffff"} onChange={(v) => patch({ button_color: v })} /><ColorField label="Hover botão" value={value.button_hover_bg ?? "#a83c64"} onChange={(v) => patch({ button_hover_bg: v })} /><ColorField label="Overlay" value={value.overlay_color ?? "#000000"} onChange={(v) => patch({ overlay_color: v })} /><NumberField label="Overlay 0–1" step="0.05" value={value.overlay_opacity ?? .45} onChange={(v) => patch({ overlay_opacity: v })} /><NumberField label="Altura desktop" value={value.height_desktop ?? 640} onChange={(v) => patch({ height_desktop: v })} /><NumberField label="Altura mobile" value={value.height_mobile ?? 500} onChange={(v) => patch({ height_mobile: v })} /><NumberField label="Título desktop" value={value.title_size_desktop ?? 60} onChange={(v) => patch({ title_size_desktop: v })} /><NumberField label="Título mobile" value={value.title_size_mobile ?? 38} onChange={(v) => patch({ title_size_mobile: v })} /><NumberField label="Posição X (%)" value={value.image_position_x ?? 50} onChange={(v) => patch({ image_position_x: v })} /><NumberField label="Posição Y (%)" value={value.image_position_y ?? 50} onChange={(v) => patch({ image_position_y: v })} /><Field label="Alinhamento"><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={value.align ?? "left"} onChange={(e) => patch({ align: e.target.value as HeroSlide["align"] })}><option value="left">Esquerda</option><option value="center">Centro</option><option value="right">Direita</option></select></Field><Field label="Posição vertical"><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={value.vertical_align ?? "center"} onChange={(e) => patch({ vertical_align: e.target.value as HeroSlide["vertical_align"] })}><option value="top">Topo</option><option value="center">Centro</option><option value="bottom">Baixo</option></select></Field></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div><Label className="mb-1.5 block text-xs">{label}</Label>{children}</div>; }
function NumberField({ label, value, onChange, step = "1" }: { label: string; value: number; onChange: (v: number) => void; step?: string }) { return <Field label={label}><Input type="number" step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} /></Field>; }
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) { return <Field label={label}><div className="flex gap-2"><input type="color" value={value.startsWith("#") ? value : "#000000"} onChange={(e) => onChange(e.target.value)} className="h-10 w-12 rounded border border-input" /><Input value={value} onChange={(e) => onChange(e.target.value)} /></div></Field>; }
