import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Crown, Gem, Sparkles } from "lucide-react";
import { StoreLayout } from "@/components/store/StoreLayout";
import { ProductCard } from "@/components/store/ProductCard";
import { HeroSlider } from "@/components/store/HeroSlider";
import {
  categoriesQuery,
  featuredProductsQuery,
  productListQuery,
  productsByCategoryQuery,
  type ProductListItem,
} from "@/lib/catalog";
import { homeContentQuery, homepageBlocksQuery, type AnnouncementProduct, type HomepageBlock } from "@/lib/marketing";

type BlockData = {
  mode?: "all" | "selected";
  categories?: string[];
  category_slug?: string;
  collection_slug?: string;
  slug?: string;
  product_ids?: string[];
  limit?: number;
  columns?: number;
  image_url?: string;
  image_mobile_url?: string;
  href?: string;
  cta_href?: string;
  cta_label?: string;
  cta_target?: "_self" | "_blank";
  body?: string;
  height?: number;
  height_desktop?: number;
  height_mobile?: number;
  margin_top?: number;
  margin_bottom?: number;
  full_width?: boolean;
  border_radius?: number;
  title_color?: string;
  subtitle_color?: string;
  title_size_desktop?: number;
  title_size_mobile?: number;
  subtitle_size_desktop?: number;
  subtitle_size_mobile?: number;
  button_bg?: string;
  button_color?: string;
  button_hover_bg?: string;
  overlay_color?: string;
  overlay_opacity?: number;
  image_position_x?: number;
  image_position_y?: number;
  text_align?: "left" | "center" | "right";
  vertical_align?: "top" | "center" | "bottom";
  content_max_width?: number;
};

export function HomePageV12() {
  const { data: home = {} } = useQuery(homeContentQuery());
  const { data: blocks = [] } = useQuery(homepageBlocksQuery());
  const { data: categories = [] } = useQuery(categoriesQuery());
  const { data: fallbackCategoryRows = [] } = useQuery(productsByCategoryQuery(4));

  const activeBlocks = [...blocks].filter((b) => b.is_active).sort((a, b) => a.position - b.position);
  const announcement = home.announcement ?? {};
  const slider = home.hero_slider ?? {};
  const slides = slider.slides ?? [];
  const hero = home.hero ?? {};

  return (
    <StoreLayout>
      {announcement.enabled !== false && (announcement.text || announcement.product?.slug) ? <AnnouncementBar announcement={announcement} /> : null}
      {slider.enabled !== false && slides.length > 0 ? <HeroSlider slides={slides} autoplayMs={slider.autoplay_ms ?? 6000} /> : <LegacyHero hero={hero} />}

      {activeBlocks.length > 0 ? (
        <div className="relative z-0">
          {activeBlocks.map((block) => <HomeBlock key={block.id} block={block} categories={categories} />)}
        </div>
      ) : (
        <>
          <CategoryGrid title="Categorias" categories={categories} selected={[]} mode="all" />
          {fallbackCategoryRows.map((row) => <ProductSection key={row.category.id} title={row.category.name} subtitle="Novidades e mais vendidos" products={row.products} search={{ category: row.category.slug }} />)}
        </>
      )}
    </StoreLayout>
  );
}

function HomeBlock({ block, categories }: { block: HomepageBlock; categories: { id: string; slug: string; name: string; position: number }[] }) {
  const data = (block.data ?? {}) as BlockData;
  const collectionSlug = data.collection_slug ?? data.slug ?? "";
  const { data: collectionProducts = [] } = useQuery({ ...featuredProductsQuery(collectionSlug), enabled: block.kind === "collection" && collectionSlug.length > 0 });
  const { data: categoryProducts = [] } = useQuery({ ...productListQuery({ category: data.category_slug, limit: data.limit ?? 4 }), enabled: block.kind === "category_products" && data.mode === "selected" && !!data.category_slug });
  const { data: allCategoryRows = [] } = useQuery({ ...productsByCategoryQuery(data.limit ?? 4), enabled: block.kind === "category_products" && (data.mode ?? "all") === "all" });

  if (block.kind === "category_grid") return <CategoryGrid title={block.title ?? "Categorias"} subtitle={block.subtitle ?? undefined} categories={categories} selected={data.categories ?? []} mode={data.mode ?? "all"} columns={data.columns ?? 4} />;

  if (block.kind === "category_products") {
    if ((data.mode ?? "all") === "all") {
      const selected = new Set(data.categories ?? []);
      const rows = selected.size > 0 ? allCategoryRows.filter((r) => selected.has(r.category.slug)) : allCategoryRows;
      return <>{block.title ? <SectionIntro title={block.title} subtitle={block.subtitle ?? undefined} /> : null}{rows.map((row) => <ProductSection key={row.category.id} title={row.category.name} subtitle={block.subtitle ?? "Novidades e mais vendidos"} products={row.products} search={{ category: row.category.slug }} limit={data.limit ?? 4} />)}</>;
    }
    if (!data.category_slug) return null;
    const category = categories.find((c) => c.slug === data.category_slug);
    return <ProductSection title={block.title || category?.name || "Categoria"} subtitle={block.subtitle ?? "Produtos selecionados"} products={categoryProducts} search={{ category: data.category_slug }} limit={data.limit ?? 4} />;
  }

  if (block.kind === "collection") {
    if (!collectionSlug || collectionProducts.length === 0) return null;
    return <ProductSection title={block.title ?? "Coleção"} subtitle={block.subtitle ?? "Seleção especial"} products={collectionProducts} search={{ collection: collectionSlug }} limit={data.limit ?? 4} />;
  }

  if (block.kind === "banner") {
    const href = data.href ?? data.cta_href ?? "/products";
    const x = Math.max(0, Math.min(100, data.image_position_x ?? 50));
    const y = Math.max(0, Math.min(100, data.image_position_y ?? 50));
    return (
      <section className={data.full_width ? "w-full" : "mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"} style={{ marginTop: data.margin_top ?? 32, marginBottom: data.margin_bottom ?? 32 }}>
        <a href={href} target={data.cta_target ?? "_self"} rel={data.cta_target === "_blank" ? "noreferrer" : undefined} className="group relative block overflow-hidden border border-border bg-card shadow-elegant" style={{ borderRadius: data.border_radius ?? 32 }}>
          {data.image_url ? <picture className="block"><source media="(max-width:767px)" srcSet={data.image_mobile_url || data.image_url} /><img src={data.image_url} alt={block.title ?? ""} className="w-full object-cover transition duration-500 group-hover:scale-[1.01]" style={{ height: data.height_desktop ?? 360, objectPosition: `${x}% ${y}%` }} /></picture> : <div className="min-h-[260px] bg-gradient-to-br from-plum via-primary to-berry" />}
        </a>
      </section>
    );
  }

  if (block.kind === "hero") {
    const href = data.cta_href ?? data.href ?? "/products";
    const align = data.text_align ?? "left";
    const vertical = data.vertical_align ?? "center";
    const x = Math.max(0, Math.min(100, data.image_position_x ?? 50));
    const y = Math.max(0, Math.min(100, data.image_position_y ?? 50));
    const overlayOpacity = Math.max(0, Math.min(1, data.overlay_opacity ?? 0.42));
    const titleDesktop = Math.max(24, Math.min(96, data.title_size_desktop ?? 48));
    const titleMobile = Math.max(22, Math.min(64, data.title_size_mobile ?? 34));
    const subtitleDesktop = Math.max(12, Math.min(40, data.subtitle_size_desktop ?? 16));
    const subtitleMobile = Math.max(12, Math.min(32, data.subtitle_size_mobile ?? 14));
    const alignItems = align === "right" ? "flex-end" : align === "center" ? "center" : "flex-start";
    const textAlign = align as "left" | "center" | "right";
    const justifyContent = vertical === "top" ? "flex-start" : vertical === "bottom" ? "flex-end" : "center";
    return (
      <section className={data.full_width ? "w-full" : "mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"} style={{ marginTop: data.margin_top ?? 48, marginBottom: data.margin_bottom ?? 48 }}>
        <div className="relative isolate flex overflow-hidden border border-border bg-gradient-to-br from-plum via-primary to-berry shadow-elegant h-[var(--hero2-mobile)] md:h-[var(--hero2-desktop)]" style={{ borderRadius: data.border_radius ?? 32, ["--hero2-mobile" as string]: `${Math.max(280, data.height_mobile ?? 420)}px`, ["--hero2-desktop" as string]: `${Math.max(320, data.height_desktop ?? 520)}px` }}>
          {data.image_url || data.image_mobile_url ? <picture className="absolute inset-0"><source media="(max-width:767px)" srcSet={data.image_mobile_url || data.image_url} /><img src={data.image_url || data.image_mobile_url} alt="" className="h-full w-full object-cover" style={{ objectPosition: `${x}% ${y}%` }} /></picture> : null}
          <div className="absolute inset-0" style={{ backgroundColor: data.overlay_color ?? "#000000", opacity: overlayOpacity }} />
          <div className="relative z-10 flex h-full w-full px-8 py-10 sm:px-12" style={{ justifyContent, alignItems }}>
            <div className="flex w-full flex-col gap-4" style={{ maxWidth: data.content_max_width ?? 720, alignItems, textAlign }}>
              {block.subtitle ? <p className="uppercase tracking-[0.28em]" style={{ color: data.subtitle_color ?? "#ead6af", fontSize: subtitleMobile }}>{block.subtitle}</p> : null}
              {block.title ? <h2 className="font-display leading-tight text-[length:var(--hero2-title-mobile)] md:text-[length:var(--hero2-title-desktop)]" style={{ color: data.title_color ?? "#ffffff", ["--hero2-title-mobile" as string]: `${titleMobile}px`, ["--hero2-title-desktop" as string]: `${titleDesktop}px` }}>{block.title}</h2> : null}
              {data.cta_label ? <a href={href} target={data.cta_target ?? "_self"} rel={data.cta_target === "_blank" ? "noreferrer" : undefined} className="mt-2 inline-flex items-center gap-2 px-6 py-3 text-xs font-semibold uppercase tracking-[0.2em] transition hover:scale-105" style={{ backgroundColor: data.button_bg ?? "#d7b47a", color: data.button_color ?? "#6d405f", borderRadius: data.border_radius ? Math.min(data.border_radius, 999) : 999 }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = data.button_hover_bg ?? data.button_bg ?? "#c8a366"; }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = data.button_bg ?? "#d7b47a"; }}>{data.cta_label}<ArrowRight className="h-4 w-4" /></a> : null}
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (block.kind === "text") return <section className="mx-auto max-w-4xl px-4 py-12 text-center sm:px-6 lg:px-8">{block.subtitle ? <p className="text-[11px] uppercase tracking-[0.32em] text-champagne">{block.subtitle}</p> : null}{block.title ? <h2 className="mt-2 font-display text-4xl">{block.title}</h2> : null}{data.body ? <p className="mx-auto mt-5 max-w-3xl whitespace-pre-line text-sm leading-7 text-muted-foreground sm:text-base">{data.body}</p> : null}</section>;
  if (block.kind === "divider") return <div className="mx-auto my-8 h-px max-w-6xl bg-gradient-to-r from-transparent via-champagne/70 to-transparent" />;
  if (block.kind === "spacer") return <div aria-hidden style={{ height: Math.max(8, Math.min(240, Number(data.height ?? 48))) }} />;
  return null;
}

function CategoryGrid({ title, subtitle, categories, selected, mode, columns = 4 }: { title: string; subtitle?: string; categories: { id: string; slug: string; name: string }[]; selected: string[]; mode: "all" | "selected"; columns?: number }) {
  const allow = new Set(selected);
  const visible = mode === "all" || allow.size === 0 ? categories : categories.filter((c) => allow.has(c.slug));
  if (visible.length === 0) return null;
  const grid = columns >= 5 ? "lg:grid-cols-5" : columns === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4";
  return <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8"><div className="mb-8 text-center">{subtitle ? <p className="text-[11px] uppercase tracking-[0.32em] text-champagne">{subtitle}</p> : null}<h2 className="mt-2 font-display text-4xl">{title}</h2><GoldRule /></div><div className={`grid gap-3 sm:grid-cols-2 ${grid}`}>{visible.map((category) => <Link key={category.id} to="/products" search={{ category: category.slug } as never} className="group flex min-h-24 items-center justify-between rounded-2xl border border-border bg-card px-5 py-4 shadow-soft transition hover:-translate-y-0.5 hover:border-champagne hover:shadow-elegant"><span className="font-display text-xl">{category.name}</span><ArrowRight className="h-4 w-4 text-champagne transition-transform group-hover:translate-x-1" /></Link>)}</div></section>;
}

function SectionIntro({ title, subtitle }: { title: string; subtitle?: string }) { return <section className="mx-auto max-w-7xl px-4 pt-12 text-center sm:px-6 lg:px-8">{subtitle ? <p className="text-[11px] uppercase tracking-[0.32em] text-champagne">{subtitle}</p> : null}<h2 className="mt-2 font-display text-4xl">{title}</h2><GoldRule /></section>; }

function ProductSection({ title, subtitle, products, search, limit = 4 }: { title: string; subtitle: string; products: ProductListItem[]; search: Record<string, string>; limit?: number }) {
  if (products.length === 0) return null;
  return <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8"><div className="mb-8 flex items-end justify-between gap-4 border-b border-champagne/30 pb-4"><div><p className="text-[11px] uppercase tracking-[0.32em] text-champagne">{subtitle}</p><h2 className="mt-2 font-display text-4xl">{title}</h2></div><Link to="/products" search={search as never} className="text-xs uppercase tracking-[0.24em] text-plum hover:text-primary">Ver todos →</Link></div><div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{products.slice(0, limit).map((product) => <ProductCard key={product.id} product={product} />)}</div></section>;
}

function LegacyHero({ hero }: { hero: NonNullable<Awaited<ReturnType<typeof getEmptyHome>>["hero"]> }) {
  const href = hero.cta_primary_href ?? "/products";
  const x = Math.max(0, Math.min(100, hero.image_position_x ?? 50));
  const y = Math.max(0, Math.min(100, hero.image_position_y ?? 50));
  const align = hero.align ?? "left";
  const alignItems = align === "right" ? "flex-end" : align === "center" ? "center" : "flex-start";
  return <section className="relative isolate flex overflow-hidden bg-gradient-to-br from-background via-secondary/40 to-champagne/15 h-[var(--legacy-mobile)] md:h-[var(--legacy-desktop)]" style={{ ["--legacy-mobile" as string]: `${hero.height_mobile ?? 500}px`, ["--legacy-desktop" as string]: `${hero.height_desktop ?? 620}px` }}>{hero.image_url || hero.image_mobile_url ? <picture className="absolute inset-0"><source media="(max-width:767px)" srcSet={hero.image_mobile_url || hero.image_url} /><img src={hero.image_url || hero.image_mobile_url} alt="" className="h-full w-full object-cover" style={{ objectPosition: `${x}% ${y}%` }} /></picture> : null}<div className="absolute inset-0" style={{ backgroundColor: hero.overlay_color ?? "#000000", opacity: hero.overlay_opacity ?? (hero.image_url ? 0.45 : 0) }} /><div className="relative z-10 mx-auto flex h-full w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8" style={{ alignItems: "center", justifyContent: align === "right" ? "flex-end" : align === "center" ? "center" : "flex-start" }}><div className="flex w-full flex-col gap-5" style={{ maxWidth: hero.content_max_width ?? 720, alignItems, textAlign: align }}>{hero.badge ? <p className="inline-flex rounded-full border border-white/40 px-4 py-1.5 text-[11px] uppercase tracking-[0.3em]" style={{ color: hero.title_color ?? "#ffffff" }}>{hero.badge}</p> : null}<h1 className="font-display leading-tight text-[length:var(--legacy-title-mobile)] md:text-[length:var(--legacy-title-desktop)]" style={{ color: hero.title_color ?? (hero.image_url ? "#ffffff" : "inherit"), ["--legacy-title-mobile" as string]: `${hero.title_size_mobile ?? 42}px`, ["--legacy-title-desktop" as string]: `${hero.title_size_desktop ?? 64}px` }}>{hero.title_line1 ?? "Beleza rara,"} <span style={{ color: hero.highlight_color ?? "#d7b47a" }}>{hero.title_highlight ?? "assinatura sua."}</span></h1>{hero.subtitle ? <p className="leading-7" style={{ color: hero.subtitle_color ?? (hero.image_url ? "rgba(255,255,255,.9)" : "inherit"), fontSize: hero.subtitle_size_desktop ?? 16 }}>{hero.subtitle}</p> : null}<a href={href} target={hero.cta_primary_target ?? "_self"} rel={hero.cta_primary_target === "_blank" ? "noreferrer" : undefined} className="inline-flex px-7 py-3 text-xs font-medium uppercase tracking-[0.24em] transition hover:scale-105" style={{ backgroundColor: hero.button_bg ?? "#c64b76", color: hero.button_color ?? "#ffffff", borderRadius: 999 }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = hero.button_hover_bg ?? hero.button_bg ?? "#a83c64"; }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = hero.button_bg ?? "#c64b76"; }}>{hero.cta_primary_label ?? "Explorar coleção"}</a></div></div></section>;
}

async function getEmptyHome() { return { hero: {} as NonNullable<import("@/lib/marketing").HomeContent["hero"]> }; }
function GoldRule() { return <div className="mx-auto mt-4 flex items-center justify-center gap-3 text-champagne"><span className="h-px w-12 bg-gradient-to-r from-transparent to-champagne" /><Gem className="h-3 w-3" /><span className="h-px w-12 bg-gradient-to-l from-transparent to-champagne" /></div>; }

function AnnouncementBar({ announcement }: { announcement: { text?: string; product?: AnnouncementProduct } }) {
  const product = announcement.product;
  const hasProduct = !!(product?.slug && product?.category_slug);
  const href = product?.cta_href || (hasProduct ? `/${product!.category_slug}/${product!.slug}${product?.variant_id ? `?variant=${product.variant_id}` : ""}` : "/products");
  const label = product?.cta_label || "Ver produto";
  const eyebrow = product?.eyebrow || announcement.text || "Destaque do dia";
  if (!hasProduct) return <div className="bg-plum text-primary-foreground"><div className="mx-auto flex max-w-7xl items-center justify-center gap-3 px-4 py-2 text-[11px] uppercase tracking-[0.28em]"><Crown className="h-3 w-3 text-champagne" /><span>{announcement.text}</span><Crown className="h-3 w-3 text-champagne" /></div></div>;
  return <div className="bg-gradient-to-r from-plum to-primary/90 text-primary-foreground"><div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8"><div className="flex min-w-0 items-center gap-3">{product?.image_url ? <img src={product.image_url} alt={product.name ?? ""} className="h-12 w-12 rounded-full object-cover ring-2 ring-champagne/70" /> : <Sparkles className="h-6 w-6 text-champagne" />}<div className="min-w-0"><p className="text-[10px] uppercase tracking-[0.28em] text-champagne">{eyebrow}</p><p className="truncate font-display text-base">{product?.name}</p></div></div><a href={href} className="inline-flex shrink-0 items-center gap-2 rounded-full bg-champagne px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-plum">{label}<ArrowRight className="h-3.5 w-3.5" /></a></div></div>;
}
