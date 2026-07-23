import { createFileRoute, Link, notFound, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Heart, Star, ShoppingBag, ChevronLeft, Pencil } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { StoreLayout } from "@/components/store/StoreLayout";
import { pickActivePrice, productDetailQuery } from "@/lib/catalog";
import { effectivePrice, formatBRL } from "@/lib/format";
import { useCart } from "@/lib/cart-store";
import { useFavorites } from "@/lib/favorites";
import { useAuth } from "@/hooks/use-auth";
import { isVideoMedia } from "@/lib/media-kind";
import { ProductReviews } from "@/components/store/ProductReviews";

const ALLOWED_TAGS = new Set(["p", "br", "ul", "ol", "li", "strong", "b", "em", "i", "h2", "h3", "h4"]);
function sanitizeDescriptionHtml(html: string): string {
  // strip script/style blocks entirely
  let out = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "");
  // strip all attributes and disallowed tags, keep only allowlisted tags without attrs
  out = out.replace(/<\/?([a-zA-Z0-9]+)(\s[^>]*)?>/g, (_m, tag: string, _attrs) => {
    const t = tag.toLowerCase();
    if (!ALLOWED_TAGS.has(t)) return "";
    return _m.startsWith("</") ? `</${t}>` : `<${t}>`;
  });
  // collapse excess whitespace between block tags
  out = out.replace(/(&nbsp;|\u00a0)+/g, " ").replace(/[ \t]{2,}/g, " ").trim();
  return out;
}

export const Route = createFileRoute("/$categoria/$produto")({
  loader: async ({ params, context }) => {
    const product = await context.queryClient.ensureQueryData(productDetailQuery(params.produto));
    if (!product) throw notFound();
    // Canonicalize: redirect to the correct category slug if it does not match
    const expected = product.category?.slug ?? "produto";
    if (params.categoria !== expected) {
      throw redirect({
        to: "/$categoria/$produto",
        params: { categoria: expected, produto: product.slug },
        replace: true,
      });
    }
    return { product };
  },
  head: ({ loaderData, params }) => {
    if (!loaderData) return { meta: [{ title: "Produto não encontrado · Absoluto Glamur" }, { name: "robots", content: "noindex" }] };
    const p = loaderData.product;
    const image = p.seo?.og_image_url ?? p.media?.[0]?.url ?? undefined;
    const defaultVariant = p.variants?.find((v) => v.is_default) ?? p.variants?.[0];
    const activePrice = defaultVariant?.prices?.find((pr) => pr.is_active);
    const priceBRL =
      activePrice && ((activePrice.sale_price_cents ?? activePrice.list_price_cents) / 100).toFixed(2);
    const url = `/${params.categoria}/${params.produto}`;
    return {
      meta: [
        { title: (p.seo?.meta_title ?? p.name) + " · Absoluto Glamur" },
        { name: "description", content: p.seo?.meta_description ?? p.short_description ?? p.name },
        { property: "og:title", content: p.seo?.meta_title ?? p.name },
        { property: "og:description", content: p.seo?.meta_description ?? p.short_description ?? "" },
        { property: "og:type", content: "product" },
        { property: "og:url", content: url },
        ...(image ? [{ property: "og:image", content: image }, { property: "twitter:image", content: image }] : []),
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: p.name,
            description: p.seo?.meta_description ?? p.short_description ?? undefined,
            image: image ? [image] : undefined,
            brand: p.brand?.name ? { "@type": "Brand", name: p.brand.name } : undefined,
            aggregateRating:
              p.rating_count > 0
                ? { "@type": "AggregateRating", ratingValue: p.rating_avg, reviewCount: p.rating_count }
                : undefined,
            offers: priceBRL
              ? { "@type": "Offer", priceCurrency: "BRL", price: priceBRL, availability: "https://schema.org/InStock" }
              : undefined,
          }),
        },
      ],
    };
  },
  notFoundComponent: () => (
    <StoreLayout>
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <h1 className="font-display text-4xl">Produto não encontrado</h1>
        <p className="mt-3 text-muted-foreground">Pode ter sido arquivado ou o link está incorreto.</p>
        <Link to="/products" search={{} as never} className="mt-6 inline-block rounded-lg bg-primary px-5 py-2.5 text-sm text-primary-foreground">
          Ver todos os produtos
        </Link>
      </div>
    </StoreLayout>
  ),
  errorComponent: ({ error }) => (
    <StoreLayout>
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <h1 className="font-display text-3xl">Não foi possível carregar o produto</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      </div>
    </StoreLayout>
  ),
  component: ProductPage,
});

function ProductPage() {
  const { produto } = Route.useParams();
  const { data: product } = useQuery(productDetailQuery(produto));

  const [variantId, setVariantId] = useState<string | null>(null);

  const variants = product?.variants ?? [];
  const selectedVariant = useMemo(
    () => variants.find((v) => v.id === variantId) ?? variants.find((v) => v.is_default) ?? variants[0],
    [variants, variantId],
  );
  const priceRow = pickActivePrice(selectedVariant);
  const price = priceRow ? effectivePrice(priceRow.list_price_cents, priceRow.sale_price_cents) : null;
  const stock = selectedVariant?.inventory?.stock ?? 0;

  const addToCart = useCart((s) => s.add);
  const { isFavorite, toggle, canFavorite } = useFavorites();
  const { isAdmin } = useAuth();

  const media = useMemo(() => [...(product?.media ?? [])], [product]);
  const [activeIdx, setActiveIdx] = useState(0);

  // Ao trocar de variação, se ela tiver imagem própria, tenta ativar essa mídia.
  const variantImageUrl =
    (selectedVariant?.options as { image_url?: string } | undefined)?.image_url ?? null;
  useMemo(() => {
    if (!variantImageUrl) return;
    const idx = media.findIndex((m) => m.url === variantImageUrl);
    if (idx >= 0) setActiveIdx(idx);
  }, [variantImageUrl, media]);

  if (!product) return null;
  const active = media[activeIdx] ?? media[0];
  const activeUrl = variantImageUrl && !media.some((m) => m.url === variantImageUrl)
    ? variantImageUrl
    : active?.url;
  const activeIsVideo = isVideoMedia(active) && !(variantImageUrl && !media.some((m) => m.url === variantImageUrl));

  const fav = isFavorite(product.id);

  return (
    <StoreLayout>
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <Link to="/products" search={{} as never} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-4 w-4" /> Voltar ao catálogo
          </Link>
          {isAdmin && (
            <Link
              to="/admin/catalog/$id"
              params={{ id: product.id }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary shadow-[0_0_12px_theme(colors.primary/25%)] transition hover:bg-primary/20"
            >
              <Pencil className="h-3.5 w-3.5" /> Editar produto
            </Link>
          )}
        </div>
        <div className="grid gap-10 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="aspect-square overflow-hidden rounded-3xl bg-secondary/40">
              {activeUrl ? (
                activeIsVideo ? (
                  <video key={activeUrl} src={activeUrl} className="h-full w-full object-cover" controls playsInline loop autoPlay muted />
                ) : (
                  <img src={activeUrl} alt={active?.alt ?? product.name} className="h-full w-full object-cover" />
                )
              ) : (
                <div className="flex h-full items-center justify-center bg-gradient-to-br from-primary/40 to-plum">
                  <span className="font-display text-6xl text-primary-foreground/40">absoluto glamur.</span>
                </div>
              )}
            </div>
            {media.length > 1 && (
              <div className="grid grid-cols-5 gap-2">
                {media.map((m, i) => {
                  const video = isVideoMedia(m);
                  return (
                    <button
                      type="button"
                      key={i}
                      onClick={() => setActiveIdx(i)}
                      className={`relative aspect-square overflow-hidden rounded-lg bg-secondary/40 ring-2 transition ${
                        i === activeIdx ? "ring-primary" : "ring-transparent hover:ring-border"
                      }`}
                      aria-label={`Ver mídia ${i + 1}`}
                    >
                      {video ? (
                        <>
                          <video src={m.url} className="h-full w-full object-cover" muted playsInline preload="metadata" />
                          <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 py-0.5 text-[9px] font-medium uppercase text-white">
                            Vídeo
                          </span>
                        </>
                      ) : (
                        <img src={m.url} alt={m.alt ?? ""} className="h-full w-full object-cover" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div>
            {product.brand && (
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{product.brand.name}</p>
            )}
            <h1 className="mt-2 font-display text-4xl text-foreground">{product.name}</h1>
            <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Star className="h-4 w-4 fill-champagne text-champagne" />
              <span>{product.rating_avg?.toFixed(1) ?? "0.0"}</span>
              <span>· {product.rating_count} avaliações</span>
            </div>

            {product.short_description && (
              <p className="mt-5 text-base text-muted-foreground">{product.short_description}</p>
            )}

            <div className="mt-6 flex items-baseline gap-3">
              {price ? (
                <>
                  <span className="font-display text-3xl text-foreground">{formatBRL(price.price)}</span>
                  {price.hasSale && (
                    <span className="text-sm text-muted-foreground line-through">{formatBRL(price.listPrice)}</span>
                  )}
                </>
              ) : (
                <span className="text-muted-foreground">Preço indisponível</span>
              )}
            </div>

            {variants.length > 1 && (
              <div className="mt-6">
                <p className="mb-2 text-sm font-medium">Variação</p>
                <div className="flex flex-wrap gap-2">
                  {variants.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setVariantId(v.id)}
                      className={`rounded-lg border px-3 py-2 text-sm transition ${
                        (variantId ?? variants.find((x) => x.is_default)?.id ?? variants[0]?.id) === v.id
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-foreground hover:bg-secondary"
                      }`}
                    >
                      {v.name ?? v.sku}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <p className="mt-4 text-xs text-muted-foreground">
              {stock > 0 ? `${stock} unidades em estoque` : "Fora de estoque"}
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={!selectedVariant || !price || stock <= 0}
                onClick={() => {
                  if (!selectedVariant || !price) return;
                  addToCart({
                    productId: product.id,
                    variantId: selectedVariant.id,
                    slug: product.slug,
                    name: product.name,
                    variantName: selectedVariant.name ?? null,
                    imageUrl: media.find((m) => !isVideoMedia(m))?.url ?? null,
                    unitCents: price.price,
                  });
                  toast.success("Adicionado ao carrinho");
                }}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-soft transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ShoppingBag className="h-4 w-4" /> Adicionar ao carrinho
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!canFavorite) return toast.info("Entre para salvar seus favoritos.");
                  toggle(product.id);
                }}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-3 text-sm font-medium text-foreground transition hover:bg-secondary"
              >
                <Heart className={`h-4 w-4 ${fav ? "fill-primary text-primary" : ""}`} />
                {fav ? "Favoritado" : "Favoritar"}
              </button>
            </div>

            {product.description && (
              <div className="mt-10 border-t border-border pt-6">
                <h2 className="font-display text-xl">Sobre o produto</h2>
                <div
                  className="prose prose-sm prose-invert mt-3 max-w-none text-sm leading-relaxed text-muted-foreground [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:text-foreground [&_h2]:font-display [&_h2]:text-lg [&_h2]:text-foreground [&_h3]:font-display [&_h3]:text-base [&_h3]:text-foreground"
                  dangerouslySetInnerHTML={{ __html: sanitizeDescriptionHtml(product.description) }}
                />
              </div>
            )}
          </div>
        </div>

        <ProductReviews productId={product.id} />
      </div>
    </StoreLayout>
  );
}
