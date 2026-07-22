import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Truck, CreditCard, ShieldCheck, Percent, Gift, Sparkles, Heart, Award, Leaf, Gem, Crown, Star,
  RefreshCcw, Lock, Instagram, MessageCircle, Clock, Package,
} from "lucide-react";
import type { ComponentType } from "react";
import { ProductCard } from "@/components/store/ProductCard";
import {
  featuredProductsQuery,
  productListQuery,
  categoriesQuery,
  type ProductListItem,
} from "@/lib/catalog";
import type { HomepageBlock } from "@/lib/marketing";

export const BENEFIT_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  truck: Truck, credit: CreditCard, shield: ShieldCheck, percent: Percent, gift: Gift,
  sparkles: Sparkles, heart: Heart, award: Award, leaf: Leaf, gem: Gem, crown: Crown,
  star: Star, refresh: RefreshCcw, lock: Lock, instagram: Instagram, chat: MessageCircle,
  clock: Clock, package: Package,
};

type D = Record<string, unknown>;
const s = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const bool = (v: unknown, d = true): boolean => (typeof v === "boolean" ? v : d);

function useProductsByRef(ref?: { collection?: string; category?: string; slugs?: string[]; limit?: number }) {
  const limit = ref?.limit ?? 8;
  const collectionQ = useQuery({
    ...featuredProductsQuery(ref?.collection ?? ""),
    enabled: !!ref?.collection,
  });
  const categoryQ = useQuery({
    ...productListQuery({ category: ref?.category, limit }),
    enabled: !!ref?.category && !ref?.collection,
  });
  const explicitQ = useQuery({
    ...productListQuery({ limit: 60 }),
    enabled: !!ref?.slugs && ref.slugs.length > 0 && !ref.collection && !ref.category,
  });
  if (ref?.collection) return (collectionQ.data ?? []).slice(0, limit);
  if (ref?.category) return (categoryQ.data ?? []).slice(0, limit);
  if (ref?.slugs && ref.slugs.length > 0) {
    const set = new Set(ref.slugs);
    return (explicitQ.data ?? []).filter((p) => set.has(p.slug)).slice(0, limit);
  }
  return [] as ProductListItem[];
}

export function HomeBlock({ block }: { block: HomepageBlock }) {
  const data = (block.data ?? {}) as D;
  const kind = block.kind;

  if (kind === "announcement_bar") {
    if (!bool(data.enabled)) return null;
    return (
      <div className="bg-plum text-primary-foreground">
        <div className="mx-auto flex max-w-7xl items-center justify-center gap-3 px-4 py-2 text-[11px] uppercase tracking-[0.28em] sm:px-6 lg:px-8">
          <Crown className="h-3 w-3 text-champagne" />
          <span>{s(data.text, "Frete grátis para todo o Brasil · 5% off no PIX")}</span>
          <Crown className="h-3 w-3 text-champagne" />
        </div>
      </div>
    );
  }

  if (kind === "hero_fullwidth") {
    const img = s(data.image_url);
    const imgMobile = s(data.image_url_mobile) || img;
    const href = s(data.cta_href, "/products");
    const title = s(data.title, block.title ?? "Nova coleção");
    const subtitle = s(data.subtitle, block.subtitle ?? "");
    const badge = s(data.badge);
    const ctaLabel = s(data.cta_label, "Comprar agora");
    const cta2 = s(data.cta_secondary_label);
    const cta2Href = s(data.cta_secondary_href, "/products");
    const align = s(data.text_align, "left");
    return (
      <section className="relative w-full overflow-hidden">
        <div className="relative aspect-[16/9] w-full sm:aspect-[21/9] md:aspect-[21/8]">
          {img && (
            <>
              <img src={img} alt={title} className="absolute inset-0 hidden h-full w-full object-cover md:block" loading="eager" />
              <img src={imgMobile} alt={title} className="absolute inset-0 h-full w-full object-cover md:hidden" loading="eager" />
              <div className="absolute inset-0 bg-black/25" />
            </>
          )}
          {!img && (
            <div className="absolute inset-0 bg-gradient-to-br from-primary via-berry to-plum" />
          )}
          <div className={`relative z-10 mx-auto flex h-full max-w-7xl flex-col justify-center px-6 py-10 text-white sm:px-10 lg:px-16 ${align === "center" ? "items-center text-center" : align === "right" ? "items-end text-right" : "items-start text-left"}`}>
            {badge && (
              <span className="mb-4 inline-flex rounded-full border border-champagne/60 bg-white/10 px-4 py-1.5 text-[11px] uppercase tracking-[0.32em] backdrop-blur">
                {badge}
              </span>
            )}
            <h2 className="font-display text-4xl leading-tight sm:text-5xl md:text-6xl lg:text-7xl">{title}</h2>
            {subtitle && <p className="mt-4 max-w-xl text-base sm:text-lg text-white/90">{subtitle}</p>}
            <div className={`mt-8 flex flex-wrap items-center gap-4 ${align === "center" ? "justify-center" : align === "right" ? "justify-end" : ""}`}>
              <a href={href} className="rounded-full bg-white px-8 py-3.5 text-xs font-medium uppercase tracking-[0.28em] text-foreground shadow-elegant transition hover:bg-champagne">
                {ctaLabel}
              </a>
              {cta2 && (
                <a href={cta2Href} className="text-xs uppercase tracking-[0.28em] text-white/90 underline-offset-4 hover:underline">
                  {cta2} →
                </a>
              )}
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (kind === "benefits_bar") {
    const items = arr<{ icon?: string; title?: string; subtitle?: string }>(data.items);
    const defaults = [
      { icon: "truck", title: "Frete grátis", subtitle: "Para todo o Brasil" },
      { icon: "credit", title: "Até 12x", subtitle: "No cartão de crédito" },
      { icon: "shield", title: "Compra segura", subtitle: "Ambiente 100% protegido" },
      { icon: "percent", title: "5% off no PIX", subtitle: "Desconto automático" },
    ];
    const list = items.length > 0 ? items : defaults;
    return (
      <section className="border-y border-border bg-secondary/40">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-4 py-6 sm:px-6 md:grid-cols-4 lg:px-8">
          {list.map((it, i) => {
            const Icon = BENEFIT_ICONS[it.icon ?? "sparkles"] ?? Sparkles;
            return (
              <div key={i} className="flex items-center gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-background text-primary ring-1 ring-champagne/40">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{it.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{it.subtitle}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  if (kind === "category_circles") {
    return <CategoryCirclesBlock block={block} />;
  }

  if (kind === "banner_duo") {
    const left = (data.left ?? {}) as D;
    const right = (data.right ?? {}) as D;
    return (
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-4 md:grid-cols-2">
          {[left, right].map((it, i) => (
            <a key={i} href={s(it.href, "/products")} className="group relative block overflow-hidden rounded-2xl shadow-soft">
              <div className="aspect-[4/3] w-full">
                {s(it.image_url) ? (
                  <img src={s(it.image_url)} alt={s(it.title, "Banner")} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" />
                ) : (
                  <div className="h-full w-full bg-gradient-to-br from-secondary to-champagne/40" />
                )}
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
              <div className="absolute bottom-6 left-6 right-6 text-white">
                {s(it.eyebrow) && <p className="text-[11px] uppercase tracking-[0.32em] text-champagne">{s(it.eyebrow)}</p>}
                <h3 className="mt-2 font-display text-2xl sm:text-3xl">{s(it.title, "Banner")}</h3>
                <span className="mt-3 inline-flex text-xs uppercase tracking-[0.28em]">{s(it.cta_label, "Ver mais")} →</span>
              </div>
            </a>
          ))}
        </div>
      </section>
    );
  }

  if (kind === "product_showcase") {
    return <ProductShowcaseBlock block={block} />;
  }

  if (kind === "advantages_grid") {
    const items = arr<{ icon?: string; title?: string; body?: string }>(data.items);
    const defaults = [
      { icon: "gift", title: "Presente em cada pedido", body: "Amostra exclusiva selecionada." },
      { icon: "refresh", title: "Troca fácil em 7 dias", body: "Sem burocracia, sem surpresas." },
      { icon: "lock", title: "Compra 100% segura", body: "Certificado SSL e antifraude." },
      { icon: "chat", title: "Atendimento humano", body: "Todos os dias, via WhatsApp." },
    ];
    const list = items.length > 0 ? items : defaults;
    return (
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        {(block.subtitle || block.title) && (
          <div className="mb-10 text-center">
            {block.subtitle && <p className="text-[11px] uppercase tracking-[0.32em] text-champagne">{block.subtitle}</p>}
            {block.title && <h2 className="mt-3 font-display text-4xl">{block.title}</h2>}
          </div>
        )}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {list.map((it, i) => {
            const Icon = BENEFIT_ICONS[it.icon ?? "sparkles"] ?? Sparkles;
            return (
              <div key={i} className="rounded-2xl border border-border bg-card p-6 text-center shadow-soft transition hover:-translate-y-1 hover:border-champagne hover:shadow-elegant">
                <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary/15 to-champagne/25 text-primary ring-1 ring-champagne/40">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="mt-5 font-display text-lg">{it.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{it.body}</p>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  if (kind === "promo_fullwidth") {
    const img = s(data.image_url);
    return (
      <section className="relative w-full overflow-hidden">
        <a href={s(data.cta_href, "/products")} className="group relative block">
          <div className="relative aspect-[21/6] w-full min-h-[220px]">
            {img ? (
              <img src={img} alt={s(data.title, "Promoção")} className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-[1.02]" loading="lazy" />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-r from-plum via-berry to-primary" />
            )}
            <div className="absolute inset-0 bg-black/35" />
            <div className="relative z-10 mx-auto flex h-full max-w-7xl flex-col items-center justify-center px-6 text-center text-white">
              {s(data.eyebrow) && <p className="text-[11px] uppercase tracking-[0.35em] text-champagne">{s(data.eyebrow)}</p>}
              <h2 className="mt-3 font-display text-3xl sm:text-5xl">{s(data.title, "Descubra a nova coleção")}</h2>
              {s(data.subtitle) && <p className="mt-3 max-w-2xl text-sm sm:text-base text-white/90">{s(data.subtitle)}</p>}
              <span className="mt-6 inline-flex rounded-full bg-white px-8 py-3 text-xs font-medium uppercase tracking-[0.28em] text-foreground">
                {s(data.cta_label, "Ver agora")}
              </span>
            </div>
          </div>
        </a>
      </section>
    );
  }

  if (kind === "manifesto") {
    return (
      <section className="mx-auto my-10 max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-plum via-berry to-primary px-8 py-16 text-primary-foreground shadow-elegant sm:px-16 sm:py-24">
          <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_20%_10%,rgba(255,255,255,0.35),transparent_45%),radial-gradient(circle_at_90%_90%,color-mix(in_oklab,var(--champagne)_70%,transparent),transparent_50%)]" />
          <div className="relative max-w-3xl">
            {s(data.eyebrow) && <p className="text-[11px] uppercase tracking-[0.35em] text-champagne">{s(data.eyebrow)}</p>}
            <p className="mt-6 font-display text-3xl leading-snug sm:text-4xl">{s(data.body, block.title ?? "")}</p>
            <div className="mt-8 h-px w-24 bg-champagne" />
            {s(data.signature) && <p className="mt-6 text-xs uppercase tracking-[0.35em] text-champagne">{s(data.signature)}</p>}
          </div>
        </div>
      </section>
    );
  }

  if (kind === "newsletter") {
    return (
      <section className="border-y border-border bg-secondary/40">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-4 px-4 py-14 text-center sm:px-6 lg:px-8">
          {block.subtitle && <p className="text-[11px] uppercase tracking-[0.32em] text-champagne">{block.subtitle}</p>}
          <h2 className="font-display text-3xl sm:text-4xl">{block.title ?? "Receba novidades e ofertas exclusivas"}</h2>
          <p className="text-sm text-muted-foreground">{s(data.body, "Assine e ganhe 10% de desconto na sua primeira compra.")}</p>
          <form className="mt-3 flex w-full max-w-md flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); alert("Obrigado! Você foi inscrito(a)."); }}>
            <input type="email" required placeholder="Seu melhor e-mail" className="flex-1 rounded-full border border-border bg-background px-5 py-3 text-sm outline-none focus:border-primary" />
            <button className="rounded-full bg-primary px-6 py-3 text-xs uppercase tracking-[0.28em] text-primary-foreground shadow-soft transition hover:opacity-90">Assinar</button>
          </form>
        </div>
      </section>
    );
  }

  // Legacy kinds fallback (keep working)
  if (kind === "hero") return <LegacyHero block={block} />;
  if (kind === "banner") return <LegacyBanner block={block} />;
  if (kind === "text") return <LegacyText block={block} />;
  if (kind === "collection") return <ProductShowcaseBlock block={{ ...block, kind: "product_showcase", data: { source: "collection", collection: s(data.slug), title: block.title, subtitle: block.subtitle } as unknown as Record<string, unknown> }} />;

  return null;
}

function block_title(b: HomepageBlock, fallback: string) { return b.title ?? fallback; }

function CategoryCirclesBlock({ block }: { block: HomepageBlock }) {
  const { data: categories = [] } = useQuery(categoriesQuery());
  const data = (block.data ?? {}) as D;
  const list = categories.slice(0, 8);
  if (list.length === 0) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      {(block.title || block.subtitle) && (
        <div className="mb-8 text-center">
          {block.subtitle && <p className="text-[11px] uppercase tracking-[0.32em] text-champagne">{block.subtitle}</p>}
          {block.title && <h2 className="mt-2 font-display text-3xl">{block.title}</h2>}
        </div>
      )}
      <div className="flex flex-wrap justify-center gap-6">
        {list.map((c) => {
          const img = ((data.images as Record<string, string> | undefined) ?? {})[c.slug];
          return (
            <Link key={c.id} to="/products" search={{ category: c.slug } as never} className="group flex w-20 flex-col items-center gap-2 sm:w-24">
              <div className="relative h-20 w-20 overflow-hidden rounded-full bg-gradient-to-br from-secondary to-champagne/40 ring-1 ring-champagne/40 transition group-hover:ring-primary sm:h-24 sm:w-24">
                {img && <img src={img} alt={c.name} className="h-full w-full object-cover" loading="lazy" />}
              </div>
              <span className="text-center text-xs font-medium text-foreground">{c.name}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function ProductShowcaseBlock({ block }: { block: HomepageBlock }) {
  const data = (block.data ?? {}) as D;
  const source = s(data.source, "collection");
  const products = useProductsByRef({
    collection: source === "collection" ? s(data.collection) : undefined,
    category: source === "category" ? s(data.category) : undefined,
    slugs: source === "manual" ? arr<string>(data.slugs) : undefined,
    limit: typeof data.limit === "number" ? (data.limit as number) : 8,
  });
  if (products.length === 0) return null;
  const linkSearch = source === "collection" ? { collection: s(data.collection) } : source === "category" ? { category: s(data.category) } : {};
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-8 flex items-end justify-between gap-4 border-b border-champagne/30 pb-4">
        <div>
          {block.subtitle && <p className="text-[11px] uppercase tracking-[0.32em] text-champagne">{block.subtitle}</p>}
          <h2 className="mt-2 font-display text-4xl text-foreground">{block.title ?? "Produtos"}</h2>
        </div>
        <Link to="/products" search={linkSearch as never} className="text-xs uppercase tracking-[0.28em] text-plum transition hover:text-primary">
          Ver todos →
        </Link>
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {products.slice(0, 8).map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </section>
  );
}

function LegacyHero({ block }: { block: HomepageBlock }) {
  const data = (block.data ?? {}) as D;
  return (
    <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary/80 via-berry to-plum p-10 text-primary-foreground shadow-elegant ring-1 ring-champagne/40" style={s(data.image_url) ? { backgroundImage: `url(${s(data.image_url)})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>
        <div className="relative z-10 max-w-xl">
          {block.subtitle && <p className="text-[11px] uppercase tracking-[0.32em] text-champagne">{block.subtitle}</p>}
          {block.title && <h2 className="mt-3 font-display text-4xl">{block.title}</h2>}
          {s(data.cta_href) && (
            <a href={s(data.cta_href)} className="mt-6 inline-flex rounded-full bg-background px-6 py-2.5 text-xs uppercase tracking-[0.28em] font-medium text-foreground shadow-soft hover:opacity-90">
              {s(data.cta_label, "Ver mais")}
            </a>
          )}
        </div>
        {s(data.image_url) && <div className="absolute inset-0 bg-black/25" />}
      </div>
    </section>
  );
}

function LegacyBanner({ block }: { block: HomepageBlock }) {
  const data = (block.data ?? {}) as D;
  const href = s(data.href, "#");
  const img = s(data.image_url);
  return (
    <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <a href={href} className="block overflow-hidden rounded-2xl border border-border shadow-soft">
        {img ? (
          <img src={img} alt={`${block.title ?? "Banner"} · Absoluto Glamur`} className="w-full object-cover" loading="lazy" />
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

function LegacyText({ block }: { block: HomepageBlock }) {
  const data = (block.data ?? {}) as D;
  return (
    <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8 text-center">
      {block.title && <h2 className="font-display text-3xl">{block.title}</h2>}
      {s(data.body) && <p className="mt-3 text-muted-foreground whitespace-pre-line">{s(data.body)}</p>}
    </section>
  );
}
