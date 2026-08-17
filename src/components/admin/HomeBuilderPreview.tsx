import { Eye, Monitor, Smartphone, Tablet } from "lucide-react";
import type { HomeContent, HomepageBlock } from "@/lib/marketing";

export type PreviewDevice = "desktop" | "tablet" | "mobile";
export type PreviewFocus =
  | { type: "hero" }
  | { type: "slider"; index: number }
  | { type: "announcement" }
  | { type: "categories" }
  | { type: "block"; id: string };

type Category = { id: string; name: string; slug: string; position: number };

type Props = {
  device: PreviewDevice;
  onDeviceChange: (device: PreviewDevice) => void;
  focus: PreviewFocus;
  home: HomeContent;
  blocks: HomepageBlock[];
  categories: Category[];
};

const WIDTH: Record<PreviewDevice, string> = {
  desktop: "w-full",
  tablet: "w-[78%]",
  mobile: "w-[390px] max-w-full",
};

export function HomeBuilderPreview({ device, onDeviceChange, focus, home, blocks, categories }: Props) {
  const selectedBlock = focus.type === "block" ? blocks.find((block) => block.id === focus.id) ?? null : null;
  const sliderActive = home.hero_slider?.enabled !== false && (home.hero_slider?.slides?.length ?? 0) > 0;

  return (
    <aside className="xl:sticky xl:top-5 xl:self-start">
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold"><Eye className="h-4 w-4 text-primary" /> Preview</p>
            <p className="text-[10px] text-muted-foreground">Atualiza enquanto você edita, antes de salvar.</p>
          </div>
          <div className="flex rounded-lg border border-border bg-background p-1">
            <DeviceButton active={device === "desktop"} title="Desktop" onClick={() => onDeviceChange("desktop")}><Monitor className="h-3.5 w-3.5" /></DeviceButton>
            <DeviceButton active={device === "tablet"} title="Tablet" onClick={() => onDeviceChange("tablet")}><Tablet className="h-3.5 w-3.5" /></DeviceButton>
            <DeviceButton active={device === "mobile"} title="Celular" onClick={() => onDeviceChange("mobile")}><Smartphone className="h-3.5 w-3.5" /></DeviceButton>
          </div>
        </div>

        <div className="min-h-[580px] overflow-auto bg-[#ece7e8] p-3 sm:p-5">
          <div className={`mx-auto min-h-[520px] overflow-hidden rounded-xl bg-[#fff8f7] shadow-lg transition-all ${WIDTH[device]}`}>
            <div className="flex h-10 items-center justify-between border-b border-[#e9dddf] bg-white px-4">
              <span className="font-serif text-sm font-semibold text-[#6d405f]">absoluto glamur.</span>
              <span className="text-[9px] uppercase tracking-widest text-[#70636b]">preview</span>
            </div>
            {focus.type === "announcement" && <AnnouncementPreview value={home.announcement} />}
            {focus.type === "hero" && (
              <>
                {sliderActive && <PreviewNotice text="O Hero está salvo, mas o Slider está ativo e é o destaque publicado na Home." />}
                <HeroPreview value={home.hero ?? {}} />
              </>
            )}
            {focus.type === "slider" && (
              <>
                {!sliderActive && <PreviewNotice text="O Slider está desativado ou sem slides; o Hero principal será publicado no lugar dele." />}
                <SlidePreview slide={home.hero_slider?.slides?.[focus.index]} index={focus.index} />
              </>
            )}
            {focus.type === "categories" && <CategoriesPreview categories={categories} device={device} />}
            {focus.type === "block" && selectedBlock && <BlockPreview block={selectedBlock} categories={categories} />}
          </div>
        </div>
      </div>
      <a
        href="/"
        target="_blank"
        rel="noreferrer"
        className="mt-3 flex items-center justify-center rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-semibold text-plum transition hover:bg-secondary"
      >
        Abrir Home publicada em nova aba ↗
      </a>
    </aside>
  );
}

function DeviceButton({ active, title, onClick, children }: { active: boolean; title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" title={title} onClick={onClick} className={`rounded-md p-1.5 transition ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}>
      {children}
    </button>
  );
}

function PreviewNotice({ text }: { text: string }) {
  return <div className="border-b border-[#e4cfa2] bg-[#fff4d8] px-4 py-2 text-[10px] font-medium leading-4 text-[#76581f]">{text}</div>;
}

function AnnouncementPreview({ value }: { value: HomeContent["announcement"] }) {
  const product = value?.product;
  return (
    <div className="bg-[#6d405f] px-3 py-3 text-white">
      <div className="mx-auto flex max-w-4xl items-center gap-3">
        {product?.image_url && <img src={product.image_url} alt="" className="h-9 w-9 rounded-full object-cover ring-1 ring-[#d7b47a]" />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[8px] uppercase tracking-[0.2em] text-[#ead6af]">{product?.eyebrow || value?.text || "Barra de anúncio"}</p>
          {product?.name && <p className="truncate text-xs font-semibold">{product.name}</p>}
        </div>
        {product?.cta_label && <span className="rounded-full bg-[#d7b47a] px-3 py-1 text-[8px] font-semibold uppercase tracking-wider text-[#6d405f]">{product.cta_label}</span>}
      </div>
    </div>
  );
}

function HeroPreview({ value }: { value: NonNullable<HomeContent["hero"]> }) {
  const titleColor = value.title_color ?? (value.image_url ? "#ffffff" : "#251e23");
  const highlightColor = value.highlight_color ?? "#d7b47a";
  const subtitleColor = value.subtitle_color ?? (value.image_url ? "rgba(255,255,255,.9)" : "#70636b");
  const overlayOpacity = Math.max(0, Math.min(1, value.overlay_opacity ?? 0.4));
  const x = Math.max(0, Math.min(100, value.image_position_x ?? 50));
  const y = Math.max(0, Math.min(100, value.image_position_y ?? 50));
  return (
    <div className="relative flex min-h-[330px] items-center overflow-hidden bg-gradient-to-br from-[#f7efee] to-[#ead7dd] bg-cover px-7 py-10" style={value.image_url ? { backgroundImage: `url(${value.image_url})`, backgroundPosition: `${x}% ${y}%` } : undefined}>
      {value.image_url && <div className="absolute inset-0" style={{ backgroundColor: value.overlay_color ?? "#000000", opacity: overlayOpacity }} />}
      <div className="relative z-10 max-w-[72%]">
        {value.badge && <span className="rounded-full border border-[#d7b47a]/60 px-3 py-1 text-[8px] uppercase tracking-[0.22em]" style={{ color: titleColor }}>{value.badge}</span>}
        <h2 className="mt-4 text-3xl font-semibold leading-[1.02]" style={{ color: titleColor }}>{value.title_line1 || "Título principal"}<br /><span style={{ color: highlightColor }}>{value.title_highlight || "destaque"}</span></h2>
        {value.subtitle && <p className="mt-4 text-[11px] leading-5" style={{ color: subtitleColor }}>{value.subtitle}</p>}
        <div className="mt-5 flex flex-wrap gap-2">
          {value.cta_primary_label && <span className="rounded-full px-4 py-2 text-[8px] font-semibold uppercase tracking-wider" style={{ backgroundColor: value.button_bg ?? "#c64b76", color: value.button_color ?? "#ffffff" }}>{value.cta_primary_label}</span>}
          {value.cta_secondary_label && <span className="rounded-full border border-current px-4 py-2 text-[8px] font-semibold uppercase tracking-wider" style={{ color: titleColor }}>{value.cta_secondary_label}</span>}
        </div>
      </div>
    </div>
  );
}

function SlidePreview({ slide, index }: { slide: NonNullable<NonNullable<HomeContent["hero_slider"]>["slides"]>[number] | undefined; index: number }) {
  if (!slide) return <EmptyPreview text="Selecione ou crie um slide." />;
  const align = slide.align ?? "center";
  const alignment = align === "left" ? "items-start text-left" : align === "right" ? "items-end text-right ml-auto" : "items-center text-center mx-auto";
  const titleColor = slide.title_color ?? "#ffffff";
  const subtitleColor = slide.subtitle_color ?? "rgba(255,255,255,.88)";
  const overlayOpacity = Math.max(0, Math.min(1, slide.overlay_opacity ?? 0.48));
  const x = Math.max(0, Math.min(100, slide.image_position_x ?? 50));
  const y = Math.max(0, Math.min(100, slide.image_position_y ?? 50));
  return (
    <div className="relative flex min-h-[330px] items-center bg-[#ead7dd] bg-cover px-7 py-10" style={slide.image_url ? { backgroundImage: `url(${slide.image_url})`, backgroundPosition: `${x}% ${y}%` } : undefined}>
      <div className="absolute inset-0" style={{ backgroundColor: slide.overlay_color ?? "#000000", opacity: overlayOpacity }} />
      <div className={`relative z-10 flex max-w-[75%] flex-col ${alignment}`}>
        <p className="text-[8px] uppercase tracking-[0.25em]" style={{ color: subtitleColor }}>Slide {index + 1}</p>
        <h2 className="mt-2 text-3xl font-semibold leading-tight" style={{ color: titleColor }}>{slide.title || "Título do slide"}</h2>
        {slide.subtitle && <p className="mt-3 text-[11px] leading-5" style={{ color: subtitleColor }}>{slide.subtitle}</p>}
        {slide.cta_label && <span className="mt-5 rounded-full px-4 py-2 text-[8px] font-semibold uppercase tracking-wider" style={{ backgroundColor: slide.button_bg ?? "#c64b76", color: slide.button_color ?? "#ffffff" }}>{slide.cta_label}</span>}
      </div>
    </div>
  );
}

function CategoriesPreview({ categories, device }: { categories: Category[]; device: PreviewDevice }) {
  const cols = device === "mobile" ? "grid-cols-1" : device === "tablet" ? "grid-cols-2" : "grid-cols-3";
  return (
    <div className="p-6">
      <p className="text-[8px] uppercase tracking-[0.25em] text-[#a84c69]">Ordem na Home</p>
      <h2 className="mt-2 text-2xl font-semibold text-[#251e23]">Categorias</h2>
      <div className={`mt-5 grid gap-2 ${cols}`}>
        {categories.map((category, index) => (
          <div key={category.id} className="rounded-xl border border-[#e9dddf] bg-white p-3">
            <span className="text-[9px] font-semibold text-[#c64b76]">#{index + 1}</span>
            <p className="mt-1 text-xs font-semibold text-[#251e23]">{category.name}</p>
            <p className="text-[8px] text-[#70636b]">Novidades e mais vendidos</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function BlockPreview({ block, categories }: { block: HomepageBlock; categories: Category[] }) {
  const data = (block.data ?? {}) as Record<string, any>;
  if (!block.is_active) {
    return <div className="border-b border-dashed border-[#d0c2c5] bg-[#f7efee] px-5 py-2 text-center text-[9px] uppercase tracking-wider text-[#70636b]">Bloco oculto · preview administrativo</div>;
  }
  if (block.kind === "banner") {
    return (
      <div className="p-5">
        <div className="overflow-hidden rounded-2xl border border-[#e9dddf] bg-white">
          {data.image_url ? <img src={String(data.image_url)} alt="" className="aspect-[16/6] w-full object-cover" /> : <div className="flex aspect-[16/6] items-center justify-center bg-[#f7efee] text-xs text-[#70636b]">Banner sem imagem</div>}
          {!data.image_url && (block.title || block.subtitle) && <div className="p-4"><p className="text-lg font-semibold">{block.title}</p><p className="text-xs text-[#70636b]">{block.subtitle}</p></div>}
        </div>
      </div>
    );
  }
  if (block.kind === "hero") {
    return (
      <div className="p-5">
        <div className="relative flex min-h-64 items-center overflow-hidden rounded-2xl bg-gradient-to-br from-[#c64b76] to-[#6d405f] bg-cover bg-center p-7 text-white" style={data.image_url ? { backgroundImage: `url(${String(data.image_url)})` } : undefined}>
          {data.image_url && <div className="absolute inset-0 bg-black/35" />}
          <div className="relative z-10 max-w-[75%]">
            <p className="text-[8px] uppercase tracking-[0.2em] text-[#ead6af]">{block.subtitle}</p>
            <h2 className="mt-2 text-2xl font-semibold">{block.title || "Hero complementar"}</h2>
            {data.cta_label && <span className="mt-4 inline-block rounded-full bg-white px-4 py-2 text-[8px] font-semibold uppercase text-[#6d405f]">{String(data.cta_label)}</span>}
          </div>
        </div>
      </div>
    );
  }
  if (block.kind === "text") {
    return <div className="p-8 text-center"><p className="text-2xl font-semibold text-[#251e23]">{block.title}</p><p className="mt-3 whitespace-pre-line text-xs leading-5 text-[#70636b]">{String(data.body ?? block.subtitle ?? "")}</p></div>;
  }
  if (block.kind === "collection") {
    return <div className="p-6"><p className="text-[8px] uppercase tracking-[0.2em] text-[#d7b47a]">{block.subtitle || "Coleção"}</p><h2 className="mt-1 text-2xl font-semibold text-[#251e23]">{block.title || "Coleção em destaque"}</h2><div className="mt-4 grid grid-cols-4 gap-2">{[1,2,3,4].map((n) => <div key={n} className="aspect-[3/4] rounded-lg bg-[#f7efee]" />)}</div></div>;
  }
  if (block.kind === "category_grid") {
    const inlineConfigured = data.layout === "inline";
    const selected = inlineConfigured && data.mode === "selected" && Array.isArray(data.categories)
      ? data.categories
      : categories.map((category) => category.slug);
    const limit = inlineConfigured && typeof data.limit === "number" ? Math.max(1, Math.min(50, data.limit)) : selected.length;
    const names = selected.slice(0, limit).map((slug: string) => categories.find((category) => category.slug === slug)?.name ?? slug);
    const pillClass = data.pill_style === "solid"
      ? "border-[#c64b76] bg-[#c64b76] text-white"
      : data.pill_style === "soft"
        ? "border-transparent bg-[#f7efee] text-[#251e23]"
        : "border-[#e9dddf] bg-white text-[#251e23]";
    return (
      <div className="overflow-hidden p-6">
        {data.show_heading === true ? (
          <div className={data.align === "left" ? "text-left" : "text-center"}>
            <p className="text-[8px] uppercase tracking-[0.2em] text-[#a84c69]">{block.subtitle || "Explore por categoria"}</p>
            <p className="mt-1 text-2xl font-semibold text-[#251e23]">{block.title || "Categorias"}</p>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 text-[#d7b47a]"><span className="h-px w-8 bg-[#d7b47a]" /><span>◇</span><span className="h-px w-8 bg-[#d7b47a]" /></div>
        )}
        <div className={`mt-4 flex flex-nowrap gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${data.align === "left" ? "justify-start" : "lg:justify-center"}`}>
          {names.map((name: string) => <span key={name} className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-2 text-[9px] uppercase tracking-[0.14em] ${pillClass}`}>{name}</span>)}
        </div>
      </div>
    );
  }
  if (block.kind === "category_products") {
    const limit = typeof data.limit === "number" ? Math.max(1, Math.min(8, data.limit)) : 4;
    return (
      <div className="p-6">
        <p className="text-[8px] uppercase tracking-[0.2em] text-[#d7b47a]">{block.subtitle || "Novidades e mais vendidos"}</p>
        <h2 className="mt-1 text-2xl font-semibold text-[#251e23]">{block.title || "Todas as categorias"}</h2>
        <div className="mt-5 space-y-4">
          {categories.slice(0, 3).map((category) => (
            <div key={category.id}>
              <p className="mb-2 text-[10px] font-semibold text-[#6d405f]">{category.name}</p>
              <div className="grid grid-cols-4 gap-2">
                {Array.from({ length: Math.min(limit, 4) }, (_, index) => <div key={index} className="aspect-[3/4] rounded-lg bg-[#f7efee]" />)}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="p-7">
      <div className="rounded-xl border border-dashed border-[#d0c2c5] bg-white p-5 text-center">
        <p className="text-xs font-semibold text-[#251e23]">{block.title || block.kind}</p>
        <p className="mt-1 text-[9px] text-[#70636b]">Bloco existente: {block.kind}. O Builder preserva seus dados sem alterar sua função.</p>
      </div>
    </div>
  );
}

function EmptyPreview({ text }: { text: string }) {
  return <div className="flex min-h-[330px] items-center justify-center p-8 text-center text-xs text-[#70636b]">{text}</div>;
}
