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
  href?: string;
  cta_href?: string;
  cta_label?: string;
  body?: string;
  height?: number;
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
      {announcement.enabled !== false && (announcement.text || announcement.product?.slug) ? (
        <AnnouncementBar announcement={announcement} />
      ) : null}

      {slider.enabled !== false && slides.length > 0 ? (
        <HeroSlider slides={slides} autoplayMs={slider.autoplay_ms ?? 6000} />
      ) : (
        <LegacyHero hero={hero} />
      )}

      {activeBlocks.length > 0 ? (
        activeBlocks.map((block) => <HomeBlock key={block.id} block={block} categories={categories} />)
      ) : (
        <>
          <CategoryGrid title="Categorias" categories={categories} selected={[]} mode="all" />
          {fallbackCategoryRows.map((row) => (
            <ProductSection
              key={row.category.id}
              title={row.category.name}
              subtitle="Novidades e mais vendidos"
              products={row.products}
              search={{ category: row.category.slug }}
            />
          ))}
        </>
      )}
    </StoreLayout>
  );
}

function HomeBlock({ block, categories }: { block: HomepageBlock; categories: { id: string; slug: string; name: string; position: number }[] }) {
  const data = (block.data ?? {}) as BlockData;
  const collectionSlug = data.collection_slug ?? data.slug ?? "";
  const { data: collectionProducts = [] } = useQuery({
    ...featuredProductsQuery(collectionSlug),
    enabled: block.kind === "collection" && collectionSlug.length > 0,
  });
  const { data: categoryProducts = [] } = useQuery({
    ...productListQuery({ category: data.category_slug, limit: data.limit ?? 4 }),
    enabled: block.kind === "category_products" && data.mode === "selected" && !!data.category_slug,
  });
  const { data: allCategoryRows = [] } = useQuery({
    ...productsByCategoryQuery(data.limit ?? 4),
    enabled: block.kind === "category_products" && (data.mode ?? "all") === "all",
  });

  if (block.kind === "category_grid") {
    return (
      <CategoryGrid
        title={block.title ?? "Categorias"}
        subtitle={block.subtitle ?? undefined}
        categories={categories}
        selected={data.categories ?? []}
        mode={data.mode ?? "all"}
        columns={data.columns ?? 4}
      />
    );
  }

  if (block.kind === "category_products") {
    if ((data.mode ?? "all") === "all") {
      const selected = new Set(data.categories ?? []);
      const rows = selected.size > 0 ? allCategoryRows.filter((r) => selected.has(r.category.slug)) : allCategoryRows;
      return (
        <>
          {block.title ? <SectionIntro title={block.title} subtitle={block.subtitle ?? undefined} /> : null}
          {rows.map((row) => (
            <ProductSection
              key={row.category.id}
              title={row.category.name}
              subtitle={block.subtitle ?? "Novidades e mais vendidos"}
              products={row.products}
              search={{ category: row.category.slug }}
              limit={data.limit ?? 4}
            />
          ))}
        </>
      );
    }
    if (!data.category_slug) return null;
    const category = categories.find((c) => c.slug === data.category_slug);
    return (
      <ProductSection
        title={block.title || category?.name || "Categoria"}
        subtitle={block.subtitle ?? "Produtos selecionados"}
        products={categoryProducts}
        search={{ category: data.category_slug }}
        limit={data.limit ?? 4}
      />
    );
  }

  if (block.kind === "collection") {
    if (!collectionSlug || collectionProducts.length === 0) return null;
    return (
      <ProductSection
        title={block.title ?? "Coleção"}
        subtitle={block.subtitle ?? "Seleção especial"}
        products={collectionProducts}
        search={{ collection: collectionSlug }}
        limit={data.limit ?? 4}
      />
    );
  }

  if (block.kind === "banner" || block.kind === "hero") {
    const href = data.href ?? data.cta_href ?? "/products";
    return (
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <a
          href={href}
          className="group relative flex min-h-[260px] items-end overflow-hidden rounded-[2rem] border border-border bg-gradient-to-br from-plum via-primary to-berry p-8 text-white shadow-elegant sm:p-12"
          style={data.image_url ? { backgroundImage: `url(${data.image_url})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
        >
          {data.image_url ? <span className="absolute inset-0 bg-gradient-to-r from-black/65 via-black/30 to-transparent" /> : null}
          <div className="relative z-10 max-w-2xl">
            {block.subtitle ? <p className="text-[11px] uppercase tracking-[0.32em] text-champagne">{block.subtitle}</p> : null}
            {block.title ? <h2 className="mt-2 font-display text-4xl sm:text-5xl">{block.title}</h2> : null}
            <span className="mt-6 inline-flex items-center gap-2 rounded-full bg-champagne px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.22em] text-plum">
              {data.cta_label ?? "Ver mais"} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </span>
          </div>
        </a>
      </section>
    );
  }

  if (block.kind === "text") {
    return (
      <section className="mx-auto max-w-4xl px-4 py-12 text-center sm:px-6 lg:px-8">
        {block.subtitle ? <p className="text-[11px] uppercase tracking-[0.32em] text-champagne">{block.subtitle}</p> : null}
        {block.title ? <h2 className="mt-2 font-display text-4xl">{block.title}</h2> : null}
        {data.body ? <p className="mx-auto mt-5 max-w-3xl whitespace-pre-line text-sm leading-7 text-muted-foreground sm:text-base">{data.body}</p> : null}
      </section>
    );
  }

  if (block.kind === "divider") {
    return <div className="mx-auto my-8 h-px max-w-6xl bg-gradient-to-r from-transparent via-champagne/70 to-transparent" />;
  }

  if (block.kind === "spacer") {
    const height = Math.max(8, Math.min(240, Number(data.height ?? 48)));
    return <div aria-hidden style={{ height }} />;
  }

  return null;
}

function CategoryGrid({ title, subtitle, categories, selected, mode, columns = 4 }: {
  title: string;
  subtitle?: string;
  categories: { id: string; slug: string; name: string }[];
  selected: string[];
  mode: "all" | "selected";
  columns?: number;
}) {
  const allow = new Set(selected);
  const visible = mode === "all" || allow.size === 0 ? categories : categories.filter((c) => allow.has(c.slug));
  if (visible.length === 0) return null;
  const grid = columns >= 5 ? "lg:grid-cols-5" : columns === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4";
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-8 text-center">
        {subtitle ? <p className="text-[11px] uppercase tracking-[0.32em] text-champagne">{subtitle}</p> : null}
        <h2 className="mt-2 font-display text-4xl">{title}</h2>
        <GoldRule />
      </div>
      <div className={`grid gap-3 sm:grid-cols-2 ${grid}`}>
        {visible.map((category) => (
          <Link
            key={category.id}
            to="/products"
            search={{ category: category.slug } as never}
            className="group flex min-h-24 items-center justify-between rounded-2xl border border-border bg-card px-5 py-4 shadow-soft transition hover:-translate-y-0.5 hover:border-champagne hover:shadow-elegant"
          >
            <span className="font-display text-xl">{category.name}</span>
            <ArrowRight className="h-4 w-4 text-champagne transition-transform group-hover:translate-x-1" />
          </Link>
        ))}
      </div>
    </section>
  );
}

function SectionIntro({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <section className="mx-auto max-w-7xl px-4 pt-12 text-center sm:px-6 lg:px-8">
      {subtitle ? <p className="text-[11px] uppercase tracking-[0.32em] text-champagne">{subtitle}</p> : null}
      <h2 className="mt-2 font-display text-4xl">{title}</h2>
      <GoldRule />
    </section>
  );
}

function ProductSection({ title, subtitle, products, search, limit = 4 }: {
  title: string;
  subtitle: string;
  products: ProductListItem[];
  search: Record<string, string>;
  limit?: number;
}) {
  if (products.length === 0) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-8 flex items-end justify-between gap-4 border-b border-champagne/30 pb-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.32em] text-champagne">{subtitle}</p>
          <h2 className="mt-2 font-display text-4xl">{title}</h2>
        </div>
        <Link to="/products" search={search as never} className="text-xs uppercase tracking-[0.24em] text-plum hover:text-primary">Ver todos →</Link>
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {products.slice(0, limit).map((product) => <ProductCard key={product.id} product={product} />)}
      </div>
    </section>
  );
}

function LegacyHero({ hero }: { hero: NonNullable<Awaited<ReturnType<typeof getEmptyHome>>["hero"]> }) {
  const href = hero.cta_primary_href ?? "/products";
  return (
    <section className="relative isolate flex min-h-[440px] items-center overflow-hidden bg-gradient-to-br from-background via-secondary/40 to-champagne/15">
      {hero.image_url ? <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${hero.image_url})` }} /> : null}
      {hero.image_url ? <div className="absolute inset-0 bg-gradient-to-r from-black/65 via-black/25 to-transparent" /> : null}
      <div className="relative z-10 mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          {hero.badge ? <p className={`inline-flex rounded-full border px-4 py-1.5 text-[11px] uppercase tracking-[0.3em] ${hero.image_url ? "border-white/40 text-white" : "border-champagne/40 text-plum"}`}>{hero.badge}</p> : null}
          <h1 className={`mt-6 font-display text-5xl leading-tight sm:text-6xl ${hero.image_url ? "text-white" : "text-foreground"}`}>
            {hero.title_line1 ?? "Beleza rara,"} <span className="text-champagne">{hero.title_highlight ?? "assinatura sua."}</span>
          </h1>
          {hero.subtitle ? <p className={`mt-5 max-w-xl text-base leading-7 ${hero.image_url ? "text-white/90" : "text-muted-foreground"}`}>{hero.subtitle}</p> : null}
          <a href={href} className="mt-7 inline-flex rounded-full bg-primary px-7 py-3 text-xs font-medium uppercase tracking-[0.24em] text-primary-foreground">{hero.cta_primary_label ?? "Explorar coleção"}</a>
        </div>
      </div>
    </section>
  );
}

async function getEmptyHome() {
  return { hero: {} as { badge?: string; title_line1?: string; title_highlight?: string; subtitle?: string; cta_primary_label?: string; cta_primary_href?: string; image_url?: string } };
}

function GoldRule() {
  return <div className="mx-auto mt-4 flex items-center justify-center gap-3 text-champagne"><span className="h-px w-12 bg-gradient-to-r from-transparent to-champagne" /><Gem className="h-3 w-3" /><span className="h-px w-12 bg-gradient-to-l from-transparent to-champagne" /></div>;
}

function AnnouncementBar({ announcement }: { announcement: { text?: string; product?: AnnouncementProduct } }) {
  const product = announcement.product;
  const hasProduct = !!(product?.slug && product?.category_slug);
  const href = product?.cta_href || (hasProduct ? `/${product!.category_slug}/${product!.slug}${product?.variant_id ? `?variant=${product.variant_id}` : ""}` : "/products");
  const label = product?.cta_label || "Ver produto";
  const eyebrow = product?.eyebrow || announcement.text || "Destaque do dia";
  if (!hasProduct) {
    return <div className="bg-plum text-primary-foreground"><div className="mx-auto flex max-w-7xl items-center justify-center gap-3 px-4 py-2 text-[11px] uppercase tracking-[0.28em]"><Crown className="h-3 w-3 text-champagne" /><span>{announcement.text}</span><Crown className="h-3 w-3 text-champagne" /></div></div>;
  }
  return (
    <div className="bg-gradient-to-r from-plum to-primary/90 text-primary-foreground">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          {product?.image_url ? <img src={product.image_url} alt={product.name ?? ""} className="h-12 w-12 rounded-full object-cover ring-2 ring-champagne/70" /> : <Sparkles className="h-6 w-6 text-champagne" />}
          <div className="min-w-0"><p className="text-[10px] uppercase tracking-[0.28em] text-champagne">{eyebrow}</p><p className="truncate font-display text-base">{product?.name}</p></div>
        </div>
        <a href={href} className="inline-flex shrink-0 items-center gap-2 rounded-full bg-champagne px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-plum">{label}<ArrowRight className="h-3.5 w-3.5" /></a>
      </div>
    </div>
  );
}
