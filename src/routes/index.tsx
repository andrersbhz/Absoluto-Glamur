import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, ShieldCheck, Truck, Gem, Crown, Star, Heart, Award, Leaf } from "lucide-react";
import type { ComponentType } from "react";
import { StoreLayout } from "@/components/store/StoreLayout";
import { ProductCard } from "@/components/store/ProductCard";
import { HeroSlider } from "@/components/store/HeroSlider";
import { categoriesQuery, collectionsQuery, featuredProductsQuery, productsByCategoryQuery } from "@/lib/catalog";
import { homepageBlocksQuery, homeContentQuery, type HomepageBlock } from "@/lib/marketing";

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

function Index() {
  const { data: bestsellers = [] } = useQuery(featuredProductsQuery("mais-vendidos"));
  const { data: newArrivals = [] } = useQuery(featuredProductsQuery("lancamentos"));
  const { data: categories = [] } = useQuery(categoriesQuery());
  const { data: blocks = [] } = useQuery(homepageBlocksQuery());
  const { data: collections = [] } = useQuery(collectionsQuery());
  const { data: byCategory = [] } = useQuery(productsByCategoryQuery(4));
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

  const primaryHref = hero.cta_primary_href ?? "/products";
  const secondaryHref = hero.cta_secondary_href ?? "/products?collection=promocoes";

  // Fallback dinâmico: se não houver imagem configurada no hero, usa a capa
  // do primeiro produto em destaque (mais vendidos → lançamentos → categorias).
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
  const heroProductName = !hero.image_url ? dynamicHeroProduct?.name ?? null : null;

  return (
    <StoreLayout>
      {/* Announcement bar */}
      {announcement.enabled !== false && announcement.text ? (
        <div className="bg-plum text-primary-foreground">
          <div className="mx-auto flex max-w-7xl items-center justify-center gap-3 px-4 py-2 text-[11px] uppercase tracking-[0.28em] sm:px-6 lg:px-8">
            <Crown className="h-3 w-3 text-champagne" />
            <span>{announcement.text}</span>
            <Crown className="h-3 w-3 text-champagne" />
          </div>
        </div>
      ) : null}

      {/* Hero Slider (editável) */}
      {heroSlider.enabled !== false && heroSlides.length > 0 ? (
        <HeroSlider slides={heroSlides} autoplayMs={heroSlider.autoplay_ms ?? 6000} />
      ) : null}

      {/* HERO */}
      <section className="relative isolate overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(1200px_600px_at_20%_-10%,var(--secondary),transparent_60%),radial-gradient(900px_500px_at_100%_10%,color-mix(in_oklab,var(--champagne)_35%,transparent),transparent_60%),linear-gradient(180deg,var(--background),var(--background))]" />
        <div
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.06] mix-blend-multiply"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.7'/></svg>\")",
          }}
        />

        <div className="mx-auto grid max-w-7xl gap-14 px-4 py-24 sm:px-6 lg:grid-cols-12 lg:items-center lg:gap-16 lg:px-8 lg:py-32">
          <div className="lg:col-span-7">
            {hero.badge ? (
              <p className="inline-flex items-center gap-2 rounded-full border border-champagne/40 bg-background/60 px-4 py-1.5 text-[11px] uppercase tracking-[0.32em] text-plum backdrop-blur">
                <Sparkles className="h-3.5 w-3.5 text-champagne" /> {hero.badge}
              </p>
            ) : null}
            <h1 className="mt-8 font-display text-6xl leading-[0.98] tracking-tight text-foreground sm:text-7xl lg:text-[5.5rem]">
              {hero.title_line1 ?? "Beleza rara,"}
              <br />
              <span className="bg-gradient-to-r from-plum via-primary to-champagne bg-clip-text text-transparent">
                {hero.title_highlight ?? "assinatura sua."}
              </span>
            </h1>
            {hero.subtitle ? (
              <p className="mt-8 max-w-xl text-lg leading-relaxed text-muted-foreground">{hero.subtitle}</p>
            ) : null}
            <div className="mt-10 flex flex-wrap items-center gap-6">
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
                  className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.32em] text-plum transition hover:text-primary"
                >
                  {hero.cta_secondary_label} <span aria-hidden>→</span>
                </a>
              ) : null}
            </div>

            {trustBadges.length > 0 && (
              <div className="mt-14 flex flex-wrap items-center gap-x-10 gap-y-4 text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
                {trustBadges.map((b, i) => (
                  <span key={i} className="flex items-center gap-2">
                    <Gem className="h-3 w-3 text-champagne" /> {b.label}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Vitrine */}
          <div className="relative lg:col-span-5">
            <div className="relative mx-auto aspect-[4/5] max-w-md">
              <div className="absolute -inset-6 rounded-[2.5rem] bg-gradient-to-br from-champagne/60 via-champagne/10 to-transparent blur-2xl" />
              <div
                className="relative h-full w-full overflow-hidden rounded-[2rem] bg-gradient-to-br from-primary via-berry to-plum shadow-elegant ring-1 ring-champagne/40"
                style={
                  heroImageUrl
                    ? { backgroundImage: `url(${heroImageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
                    : undefined
                }
              >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.35),transparent_45%)]" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_90%,color-mix(in_oklab,var(--champagne)_65%,transparent),transparent_50%)]" />
                {!heroImageUrl && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="font-display text-[9rem] leading-none text-white/15">{hero.monogram ?? "A·G"}</span>
                  </div>
                )}
                <div className="absolute bottom-6 left-6 right-6 flex items-center justify-between rounded-full border border-champagne/60 bg-black/25 px-5 py-2.5 text-[10px] uppercase tracking-[0.3em] text-white backdrop-blur">
                  <span>{heroProductName ?? hero.seal_left ?? "Maison Absoluto"}</span>
                  <span className="text-champagne">{hero.seal_right ?? "Est. 2025"}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Categorias */}
      {categories.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <GoldRule />
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {categories.map((c) => (
              <Link
                key={c.id}
                to="/products"
                search={{ category: c.slug } as never}
                className="rounded-full border border-border bg-card px-5 py-2 text-xs uppercase tracking-[0.22em] text-foreground shadow-soft transition hover:border-champagne hover:text-primary"
              >
                {c.name}
              </Link>
            ))}
          </div>
        </section>
      )}
      {blocks.map((b) => (
        <CustomBlock key={b.id} block={b} />
      ))}

      {featuredCollections.map((c) => (
        <FeaturedCollectionSection key={c.id} slug={c.slug} name={c.name} description={c.description} />
      ))}

      {byCategory.map((row) => (
        <FeaturedSection
          key={row.category.id}
          title={row.category.name}
          subtitle="Novidades e mais vendidos"
          link={{ label: "Ver todos", search: { category: row.category.slug } }}
          products={row.products}
        />
      ))}

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

      {/* Manifesto */}
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

      {/* Pilares */}
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
}: {
  title: string;
  subtitle: string;
  link: { label: string; search: Record<string, string> };
  products: Parameters<typeof ProductCard>[0]["product"][];
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
        {products.slice(0, 4).map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </section>
  );
}
