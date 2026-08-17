import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, ShieldCheck, Truck, Gem, Crown, Star, Heart, Award, Leaf, ArrowRight } from "lucide-react";
import type { ComponentType } from "react";
import { StoreLayout } from "@/components/store/StoreLayout";
import { ProductCard } from "@/components/store/ProductCard";
import { HeroSlider } from "@/components/store/HeroSlider";
import { categoriesQuery, collectionsQuery, featuredProductsQuery, productsByCategoryQuery } from "@/lib/catalog";
import { homepageBlocksQuery, homeContentQuery, type HomepageBlock, type AnnouncementProduct } from "@/lib/marketing";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Absoluto Glamur · Cosméticos premium com curadoria" },
      {
        name: "description",
        content:
          "Absoluto Glamur — maison digital de beleza. Skincare, maquiagem e cabelos selecionados com curadoria, com envio para todo o Brasil.",
      },
      { property: "og:title", content: "Absoluto Glamur · Cosméticos premium" },
      {
        property: "og:description",
        content:
          "Skincare, maquiagem e cabelos com curadoria. Envio para todo o Brasil.",
      },
      { property: "og:url", content: "https://absolutoglamur.com.br/" },
      { property: "og:type", content: "website" },
      {
        property: "og:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/be040f5f-bd15-4a98-8b8d-e90c140eacaf/id-preview-0aae106e--c8e28b23-eac8-4d4a-9c23-26a7e47a2ec8.lovable.app-1784319380473.png",
      },
      {
        name: "twitter:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/be040f5f-bd15-4a98-8b8d-e90c140eacaf/id-preview-0aae106e--c8e28b23-eac8-4d4a-9c23-26a7e47a2ec8.lovable.app-1784319380473.png",
      },
    ],
    links: [{ rel: "canonical", href: "https://absolutoglamur.com.br/" }],
  }),
  component: Index,
});

const ICON_MAP: Record<string, ComponentType<{ className?: string }>> = {
  sparkles: Sparkles,
  shield: ShieldCheck,
  truck: Truck,
  gem: Gem,
  crown: Crown,
  star: Star,
  heart: Heart,
  award: Award,
  leaf: Leaf,
};

function GoldRule() {
  return (
    <div className="mx-auto mt-4 flex items-center justify-center gap-3 text-champagne">
      <span className="h-px w-12 bg-gradient-to-r from-transparent to-champagne" />
      <Gem className="h-3 w-3" />
      <span className="h-px w-12 bg-gradient-to-l from-transparent to-champagne" />
    </div>
  );
}

type StructureBlockData = {
  mode?: string;
  categories?: string[];
  category_slug?: string;
  limit?: number;
  columns?: number;
  layout?: "inline" | "grid";
  align?: "left" | "center";
  pill_style?: "outline" | "soft" | "solid";
  show_heading?: boolean;
};

function blockData(block: HomepageBlock): StructureBlockData {
  const raw = (block.data ?? {}) as Record<string, unknown>;
  return {
    mode: typeof raw.mode === "string" ? raw.mode : undefined,
    categories: Array.isArray(raw.categories)
      ? raw.categories.filter((value): value is string => typeof value === "string" && value.length > 0)
      : undefined,
    category_slug: typeof raw.category_slug === "string" ? raw.category_slug : undefined,
    limit: typeof raw.limit === "number" && Number.isFinite(raw.limit) ? raw.limit : undefined,
    columns: typeof raw.columns === "number" && Number.isFinite(raw.columns) ? raw.columns : undefined,
    layout: raw.layout === "inline" || raw.layout === "grid" ? raw.layout : undefined,
    align: raw.align === "left" || raw.align === "center" ? raw.align : undefined,
    pill_style: raw.pill_style === "soft" || raw.pill_style === "solid" || raw.pill_style === "outline" ? raw.pill_style : undefined,
    show_heading: typeof raw.show_heading === "boolean" ? raw.show_heading : undefined,
  };
}

function selectedSlugs(data: StructureBlockData): string[] {
  const list = [...(data.categories ?? [])];
  if (data.category_slug && !list.includes(data.category_slug)) list.unshift(data.category_slug);
  return list;
}

function clampInt(value: number | undefined, fallback: number, min: number, max: number) {
  if (value == null) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function Index() {
  const { data: bestsellers = [] } = useQuery(featuredProductsQuery("mais-vendidos"));
  const { data: newArrivals = [] } = useQuery(featuredProductsQuery("lancamentos"));
  const { data: categories = [] } = useQuery(categoriesQuery());
  const { data: blocks = [] } = useQuery(homepageBlocksQuery());
  const { data: collections = [] } = useQuery(collectionsQuery());
  const { data: byCategory = [] } = useQuery(productsByCategoryQuery(8));
  const { data: home = {} } = useQuery(homeContentQuery());
  const featuredCollections = collections.filter((c) => c.is_featured);

  const announcement = home.announcement ?? {};
  const heroSlider = home.hero_slider ?? {};
  const heroSlides = heroSlider.slides ?? [];
  const hero = home.hero ?? {};
  const trustBadges = home.trust_badges ?? [];
  const manifesto = home.manifesto ?? {};
  const pillars = home.pillars ?? {};
  const pillarItems = pillars.items ?? [];
  const sliderActive = heroSlider.enabled !== false && heroSlides.length > 0;

  const hasCategoryGridBlock = blocks.some((block) => block.kind === "category_grid");
  const categoryGridBlockId = blocks.find((block) => block.kind === "category_grid")?.id ?? null;
  const hasCategoryProductsBlock = blocks.some((block) => block.kind === "category_products");

  const primaryHref = hero.cta_primary_href ?? "/products";
  const secondaryHref = hero.cta_secondary_href ?? "/products?collection=promocoes";

  const dynamicHeroProduct =
    bestsellers[0] ??
    newArrivals[0] ??
    byCategory.flatMap((r) => r.products)[0] ??
    null;
  const heroImageUrl =
    hero.image_url && hero.image_url.trim().length > 0
      ? hero.image_url
      : dynamicHeroProduct?.media?.find((m) => m.kind !== "video")?.url ??
        dynamicHeroProduct?.media?.[0]?.url ??
        null;

  return (
    <StoreLayout>
      {announcement.enabled !== false && (announcement.text || announcement.product?.slug) ? (
        <AnnouncementBar announcement={announcement} />
      ) : null}

      {sliderActive ? (
        <HeroSlider slides={heroSlides} autoplayMs={heroSlider.autoplay_ms ?? 6000} />
      ) : null}

      {!sliderActive && (
      <section
        className="relative isolate overflow-hidden min-h-[420px] lg:min-h-[500px] flex items-center"
        style={
          heroImageUrl
            ? {
                backgroundImage: `url(${heroImageUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                backgroundRepeat: "no-repeat",
              }
            : undefined
        }
      >
        {!heroImageUrl && (
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(1200px_600px_at_20%_-10%,var(--secondary),transparent_60%),radial-gradient(900px_500px_at_100%_10%,color-mix(in_oklab,var(--champagne)_35%,transparent),transparent_60%),linear-gradient(180deg,var(--background),var(--background))]" />
        )}
        {heroImageUrl && (
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/60 via-black/35 to-black/10" />
        )}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06] mix-blend-multiply"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.7'/></svg>\")",
          }}
        />

        <div className="relative z-10 mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="max-w-2xl">
            {hero.badge ? (
              <p className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-[11px] uppercase tracking-[0.32em] backdrop-blur ${heroImageUrl ? "border-white/40 bg-black/30 text-white" : "border-champagne/40 bg-background/60 text-plum"}`}>
                <Sparkles className="h-3.5 w-3.5 text-champagne" /> {hero.badge}
              </p>
            ) : null}
            <h1 className={`mt-8 font-display text-5xl leading-[0.98] tracking-tight sm:text-6xl lg:text-7xl ${heroImageUrl ? "text-white drop-shadow-[0_2px_20px_rgba(0,0,0,0.5)]" : "text-foreground"}`}>
              {hero.title_line1 ?? "Beleza rara,"}
              <br />
              <span className={heroImageUrl ? "text-champagne" : "bg-gradient-to-r from-plum via-primary to-champagne bg-clip-text text-transparent"}>
                {hero.title_highlight ?? "assinatura sua."}
              </span>
            </h1>
            {hero.subtitle ? (
              <p className={`mt-6 max-w-xl text-base leading-relaxed sm:text-lg ${heroImageUrl ? "text-white/90" : "text-muted-foreground"}`}>
                {hero.subtitle}
              </p>
            ) : null}
            <div className="mt-8 flex flex-wrap items-center gap-6">
              <a
                href={primaryHref}
                className="group relative inline-flex items-center justify-center overflow-hidden rounded-full bg-primary px-8 py-3.5 text-xs font-medium uppercase tracking-[0.28em] text-primary-foreground shadow-elegant transition hover:shadow-[0_20px_60px_-20px_var(--primary)]"
              >
                <span className="relative z-10">{hero.cta_primary_label ?? "Explorar coleção"}</span>
                <span className="absolute inset-0 -translate-x-[120%] bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-[120%]" />
              </a>
              {hero.cta_secondary_label ? (
                <a
                  href={secondaryHref}
                  className={`inline-flex items-center gap-2 text-xs uppercase tracking-[0.32em] transition ${heroImageUrl ? "text-white hover:text-champagne" : "text-plum hover:text-primary"}`}
                >
                  {hero.cta_secondary_label} <span aria-hidden>→</span>
                </a>
              ) : null}
            </div>

            {trustBadges.length > 0 && (
              <div className={`mt-12 flex flex-wrap items-center gap-x-8 gap-y-3 text-[11px] uppercase tracking-[0.28em] ${heroImageUrl ? "text-white/85" : "text-muted-foreground"}`}>
                {trustBadges.map((b, i) => (
                  <span key={i} className="flex items-center gap-2">
                    <Gem className="h-3 w-3 text-champagne" /> {b.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
      )}

      {!hasCategoryGridBlock && <CategoryGridSection categories={categories} />}

      {blocks.map((block) => {
        if (block.kind === "category_grid") {
          // Several legacy category_grid rows can exist from the old Builder. Render only
          // the first one so the storefront always has one canonical inline category strip.
          if (block.id !== categoryGridBlockId) return null;
          return <CategoryGridBlock key={block.id} block={block} categories={categories} />;
        }
        if (block.kind === "category_products") {
          return <CategoryProductsBlock key={block.id} block={block} rows={byCategory} />;
        }
        return <CustomBlock key={block.id} block={block} />;
      })}

      {featuredCollections.map((c) => (
        <FeaturedCollectionSection key={c.id} slug={c.slug} name={c.name} description={c.description} />
      ))}

      {!hasCategoryProductsBlock && <CategoryProductsSections rows={byCategory} productLimit={4} />}

      {newArrivals.length > 0 && (
        <FeaturedSection
          title="Lançamentos"
          subtitle="Acabaram de chegar"
          link={{ label: "Ver todos", search: { collection: "lancamentos" } }}
          products={newArrivals}
        />
      )}

      {bestsellers.length > 0 && (
        <FeaturedSection
          title="Mais vendidos"
          subtitle="Amados pelas clientes"
          link={{ label: "Ver todos", search: { collection: "mais-vendidos" } }}
          products={bestsellers}
        />
      )}

      {manifesto.enabled !== false && manifesto.body ? (
        <section className="mx-auto my-10 max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-plum via-berry to-primary px-8 py-16 text-primary-foreground shadow-elegant sm:px-16 sm:py-24">
            <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_20%_10%,rgba(255,255,255,0.35),transparent_45%),radial-gradient(circle_at_90%_90%,color-mix(in_oklab,var(--champagne)_70%,transparent),transparent_50%)]" />
            <div className="relative max-w-3xl">
              {manifesto.eyebrow ? (
                <p className="text-[11px] uppercase tracking-[0.35em] text-champagne">{manifesto.eyebrow}</p>
              ) : null}
              <p className="mt-6 font-display text-3xl leading-snug sm:text-4xl">{manifesto.body}</p>
              <div className="mt-8 h-px w-24 bg-champagne" />
              {manifesto.signature ? (
                <p className="mt-6 text-xs uppercase tracking-[0.35em] text-champagne">{manifesto.signature}</p>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {pillars.enabled !== false && pillarItems.length > 0 ? (
        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            {pillars.eyebrow ? (
              <p className="text-[11px] uppercase tracking-[0.35em] text-muted-foreground">{pillars.eyebrow}</p>
            ) : null}
            {pillars.title ? (
              <h2 className="mt-3 font-display text-4xl text-foreground">{pillars.title}</h2>
            ) : null}
            <GoldRule />
          </div>
          <div className="grid gap-6 sm:grid-cols-3">
            {pillarItems.map((item, i) => {
              const Icon = ICON_MAP[item.icon ?? "sparkles"] ?? Sparkles;
              return (
                <div
                  key={i}
                  className="group relative overflow-hidden rounded-2xl border border-border bg-card p-8 shadow-soft transition hover:-translate-y-1 hover:border-champagne hover:shadow-elegant"
                >
                  <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br from-champagne/40 to-transparent blur-2xl transition group-hover:from-champagne/70" />
                  <div className="relative inline-flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary/15 to-champagne/25 text-primary ring-1 ring-champagne/40">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="relative mt-6 font-display text-2xl">{item.title}</h3>
                  <p className="relative mt-3 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </StoreLayout>
  );
}

function CategoryGridBlock({
  block,
  categories,
}: {
  block: HomepageBlock;
  categories: Array<{ id: string; name: string; slug: string }>;
}) {
  const data = blockData(block);
  const slugs = selectedSlugs(data);
  const inlineConfigured = data.layout === "inline";
  let visible = categories;

  // Legacy category_grid blocks did not have a layout flag. Treat them as the new
  // "all categories" inline block so an old two-item selection cannot keep the Home broken.
  if (inlineConfigured && data.mode === "selected" && slugs.length > 0) {
    const bySlug = new Map(categories.map((category) => [category.slug, category]));
    visible = slugs.map((slug) => bySlug.get(slug)).filter((value): value is (typeof categories)[number] => !!value);
  }

  const limit = inlineConfigured
    ? clampInt(data.limit, visible.length || categories.length, 1, 50)
    : visible.length;

  return (
    <CategoryGridSection
      categories={visible.slice(0, limit)}
      title={block.title ?? undefined}
      subtitle={block.subtitle ?? undefined}
      showHeading={data.show_heading === true}
      align={data.align ?? "center"}
      pillStyle={data.pill_style ?? "outline"}
    />
  );
}

function CategoryGridSection({
  categories,
  title,
  subtitle,
  showHeading = false,
  align = "center",
  pillStyle = "outline",
}: {
  categories: Array<{ id: string; name: string; slug: string }>;
  title?: string;
  subtitle?: string;
  showHeading?: boolean;
  align?: "left" | "center";
  pillStyle?: "outline" | "soft" | "solid";
}) {
  if (categories.length === 0) return null;
  const pillClass = pillStyle === "solid"
    ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
    : pillStyle === "soft"
      ? "border-transparent bg-secondary text-foreground hover:border-champagne hover:text-primary"
      : "border-border bg-card text-foreground hover:border-champagne hover:text-primary";

  return (
    <section className="mx-auto max-w-7xl overflow-hidden px-4 py-8 sm:px-6 lg:px-8">
      {showHeading && (title || subtitle) ? (
        <div className={align === "left" ? "text-left" : "text-center"}>
          {subtitle ? <p className="text-[11px] uppercase tracking-[0.3em] text-champagne">{subtitle}</p> : null}
          {title ? <h2 className="mt-2 font-display text-3xl text-foreground sm:text-4xl">{title}</h2> : null}
          {align === "center" ? <GoldRule /> : null}
        </div>
      ) : (
        <GoldRule />
      )}
      <div
        className={`mt-6 flex w-full flex-nowrap items-center gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${align === "center" ? "lg:justify-center" : "justify-start"}`}
        aria-label="Categorias da loja"
      >
        {categories.map((category) => (
          <Link
            key={category.id}
            to="/products"
            search={{ category: category.slug } as never}
            className={`shrink-0 whitespace-nowrap rounded-full border px-5 py-2.5 text-xs uppercase tracking-[0.2em] shadow-soft transition ${pillClass}`}
          >
            {category.name}
          </Link>
        ))}
      </div>
    </section>
  );
}

function CategoryProductsBlock({
  block,
  rows,
}: {
  block: HomepageBlock;
  rows: Array<{
    category: { id: string; name: string; slug: string };
    products: Parameters<typeof ProductCard>[0]["product"][];
  }>;
}) {
  const data = blockData(block);
  const slugs = selectedSlugs(data);
  let visible = rows;
  if (data.mode === "selected" && slugs.length > 0) {
    const bySlug = new Map(rows.map((row) => [row.category.slug, row]));
    visible = slugs.map((slug) => bySlug.get(slug)).filter((value): value is (typeof rows)[number] => !!value);
  }
  const productLimit = clampInt(data.limit, 4, 1, 8);
  return <CategoryProductsSections rows={visible} productLimit={productLimit} />;
}

function CategoryProductsSections({
  rows,
  productLimit = 4,
}: {
  rows: Array<{
    category: { id: string; name: string; slug: string };
    products: Parameters<typeof ProductCard>[0]["product"][];
  }>;
  productLimit?: number;
}) {
  return (
    <>
      {rows.map((row) => (
        <FeaturedSection
          key={row.category.id}
          title={row.category.name}
          subtitle="Novidades e mais vendidos"
          link={{ label: "Ver todos", search: { category: row.category.slug } }}
          products={row.products}
          productLimit={productLimit}
        />
      ))}
    </>
  );
}

function CustomBlock({ block }: { block: HomepageBlock }) {
  const data = (block.data ?? {}) as Record<string, string | number | string[] | undefined>;
  const { data: collProducts = [] } = useQuery({
    ...featuredProductsQuery(String(data.slug ?? "")),
    enabled: block.kind === "collection" && !!data.slug,
  });

  if (block.kind === "hero") {
    return (
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div
          className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary/80 via-berry to-plum p-10 text-primary-foreground shadow-elegant ring-1 ring-champagne/40"
          style={
            typeof data.image_url === "string"
              ? { backgroundImage: `url(${data.image_url})`, backgroundSize: "cover", backgroundPosition: "center" }
              : undefined
          }
        >
          <div className="relative z-10 max-w-xl">
            {block.subtitle && (
              <p className="text-[11px] uppercase tracking-[0.32em] text-champagne">{block.subtitle}</p>
            )}
            {block.title && <h2 className="mt-3 font-display text-4xl">{block.title}</h2>}
            {typeof data.cta_href === "string" && (
              <a
                href={data.cta_href}
                className="mt-6 inline-flex rounded-full bg-background px-6 py-2.5 text-xs uppercase tracking-[0.28em] font-medium text-foreground shadow-soft hover:opacity-90"
              >
                {typeof data.cta_label === "string" ? data.cta_label : "Ver mais"}
              </a>
            )}
          </div>
          {typeof data.image_url === "string" && <div className="absolute inset-0 bg-black/25" />}
        </div>
      </section>
    );
  }

  if (block.kind === "banner") {
    const href = typeof data.href === "string" ? data.href : "#";
    const img = typeof data.image_url === "string" ? data.image_url : null;
    return (
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <a href={href} className="block overflow-hidden rounded-2xl border border-border shadow-soft">
          {img ? (
            <img src={img} alt={`${block.title ?? "Banner promocional"}${block.subtitle ? ` — ${block.subtitle}` : " · Absoluto Glamur"}`} className="w-full object-cover" loading="lazy" />
          ) : (
            <div className="flex items-center justify-between bg-secondary px-6 py-8">
              <div>
                {block.title && <h3 className="font-display text-2xl">{block.title}</h3>}
                {block.subtitle && <p className="text-sm text-muted-foreground">{block.subtitle}</p>}
              </div>
            </div>
          )}
        </a>
      </section>
    );
  }

  if (block.kind === "collection" && collProducts.length > 0) {
    return (
      <FeaturedSection
        title={block.title ?? "Coleção"}
        subtitle={block.subtitle ?? ""}
        link={{ label: "Ver todos", search: { collection: String(data.slug ?? "") } }}
        products={collProducts}
      />
    );
  }

  if (block.kind === "text") {
    return (
      <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8 text-center">
        {block.title && <h2 className="font-display text-3xl">{block.title}</h2>}
        {typeof data.body === "string" && (
          <p className="mt-3 text-muted-foreground whitespace-pre-line">{data.body}</p>
        )}
      </section>
    );
  }

  if (block.kind === "divider") {
    return (
      <section className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <div className="border-t border-champagne/30" />
      </section>
    );
  }

  if (block.kind === "spacer") {
    const height = clampInt(typeof data.height === "number" ? data.height : undefined, 32, 8, 160);
    return <div aria-hidden style={{ height }} />;
  }

  return null;
}

function FeaturedCollectionSection({ slug, name, description }: { slug: string; name: string; description: string | null }) {
  const { data: products = [] } = useQuery(featuredProductsQuery(slug));
  if (products.length === 0) return null;
  return (
    <FeaturedSection
      title={name}
      subtitle={description ?? "Coleção em destaque"}
      link={{ label: "Ver todos", search: { collection: slug } }}
      products={products}
    />
  );
}

function FeaturedSection({
  title,
  subtitle,
  link,
  products,
  productLimit = 4,
}: {
  title: string;
  subtitle: string;
  link: { label: string; search: Record<string, string> };
  products: Parameters<typeof ProductCard>[0]["product"][];
  productLimit?: number;
}) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-8 flex items-end justify-between gap-4 border-b border-champagne/30 pb-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.32em] text-champagne">{subtitle}</p>
          <h2 className="mt-2 font-display text-4xl text-foreground">{title}</h2>
        </div>
        <Link
          to="/products"
          search={link.search as never}
          className="text-xs uppercase tracking-[0.28em] text-plum transition hover:text-primary"
        >
          {link.label} →
        </Link>
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {products.slice(0, productLimit).map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </section>
  );
}

function AnnouncementBar({
  announcement,
}: {
  announcement: { text?: string; product?: AnnouncementProduct };
}) {
  const product = announcement.product;
  const hasProduct = !!(product?.slug && product?.category_slug);
  const href =
    product?.cta_href ||
    (hasProduct
      ? `/${product!.category_slug}/${product!.slug}${product?.variant_id ? `?variant=${product.variant_id}` : ""}`
      : "/products");
  const label = product?.cta_label || "Ver produto";
  const eyebrow = product?.eyebrow || announcement.text || "Destaque do dia";

  if (!hasProduct) {
    return (
      <div className="bg-plum text-primary-foreground">
        <div className="mx-auto flex max-w-7xl items-center justify-center gap-3 px-4 py-2 text-[11px] uppercase tracking-[0.28em] sm:px-6 lg:px-8">
          <Crown className="h-3 w-3 text-champagne" />
          <span>{announcement.text}</span>
          <Crown className="h-3 w-3 text-champagne" />
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden bg-gradient-to-r from-plum via-plum to-primary/90 text-primary-foreground">
      <span className="pointer-events-none absolute -left-24 top-1/2 h-40 w-40 -translate-y-1/2 rounded-full bg-champagne/25 blur-3xl" />
      <span className="pointer-events-none absolute -right-24 top-1/2 h-40 w-40 -translate-y-1/2 rounded-full bg-primary/40 blur-3xl" />
      <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-4 px-4 py-3 sm:grid-cols-[1fr_auto] sm:px-6 sm:py-3.5 lg:px-8">
        <div className="flex min-w-0 items-center gap-4">
          <div className="relative shrink-0">
            <span className="absolute inset-0 -m-1 rounded-full bg-champagne/30 blur-md" />
            {product?.image_url ? (
              <img
                src={product.image_url}
                alt={product.name ?? ""}
                className="relative h-14 w-14 rounded-full object-cover ring-2 ring-champagne/70 shadow-[0_0_20px_rgba(212,175,55,0.35)]"
              />
            ) : (
              <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-champagne/20 ring-2 ring-champagne/60">
                <Sparkles className="h-6 w-6 text-champagne" />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.32em] text-champagne">
              <Sparkles className="h-3 w-3" /> {eyebrow}
            </p>
            <p className="mt-0.5 truncate font-display text-base leading-tight sm:text-lg">
              {product?.name}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end">
          <a
            href={href}
            className="group inline-flex items-center gap-2 rounded-full bg-champagne px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.24em] text-plum shadow-[0_8px_30px_rgba(212,175,55,0.35)] transition hover:shadow-[0_10px_40px_rgba(212,175,55,0.6)]"
          >
            {label}
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </a>
        </div>
      </div>
    </div>
  );
}
