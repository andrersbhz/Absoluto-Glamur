import { Link } from "@tanstack/react-router";
import { Heart, Star } from "lucide-react";
import { pickActivePrice, pickDefaultVariant, type ProductListItem } from "@/lib/catalog";
import { effectivePrice, formatBRL } from "@/lib/format";
import { useFavorites } from "@/lib/favorites";
import { useCart } from "@/lib/cart-store";
import { toast } from "sonner";
import { isVideoUrl } from "@/lib/media-kind";

export function ProductCard({ product }: { product: ProductListItem }) {
  const variant = pickDefaultVariant(product);
  const priceRow = pickActivePrice(variant);
  const price = priceRow ? effectivePrice(priceRow.list_price_cents, priceRow.sale_price_cents) : null;

  const media = [...(product.media ?? [])].sort(
    (a, b) => (a as { position?: number }).position ?? 0 - ((b as { position?: number }).position ?? 0),
  );
  const cover = media[0]?.url ?? null;

  const { isFavorite, toggle, canFavorite } = useFavorites();
  const fav = isFavorite(product.id);
  const addToCart = useCart((s) => s.add);

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border bg-card shadow-soft transition hover:shadow-elegant">
      <Link
        to="/$categoria/$produto"
        params={{ categoria: product.category?.slug ?? "produto", produto: product.slug }}
        aria-label={product.name}
        className="absolute inset-0 z-10"
      />
      <div className="relative block aspect-square overflow-hidden bg-secondary/40">
        {cover ? (
          isVideoUrl(cover) ? (
            <video
              src={cover}
              className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
              muted
              playsInline
              loop
              autoPlay
              preload="metadata"
            />
          ) : (
            <img
              src={cover}
              alt={media[0]?.alt ?? product.name}
              loading="lazy"
              className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            />
          )
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/30 to-plum text-primary-foreground/60">
            <span className="font-display text-4xl opacity-40">absoluto glamur.</span>
          </div>
        )}
      </div>

      <button
        type="button"
        aria-label={fav ? "Remover dos favoritos" : "Favoritar"}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!canFavorite) {
            toast.info("Entre para salvar seus favoritos.");
            return;
          }
          toggle(product.id);
        }}
        className="absolute right-3 top-3 z-20 rounded-full bg-background/80 p-2 text-foreground backdrop-blur transition hover:bg-background"
      >
        <Heart className={`h-4 w-4 ${fav ? "fill-primary text-primary" : ""}`} />
      </button>

      <div className="relative flex flex-col gap-2 p-[15px]">
        {product.brand && (
          <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{product.brand.name}</p>
        )}
        <h3 className="font-display text-base leading-snug text-foreground">{product.name}</h3>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Star className="h-3.5 w-3.5 fill-champagne text-champagne" />
          <span>{product.rating_avg?.toFixed(1) ?? "0.0"}</span>
          <span>({product.rating_count ?? 0})</span>
        </div>

        <div className="mt-1 flex items-baseline gap-2">
          {price ? (
            <>
              <span className="font-display text-lg text-foreground">{formatBRL(price.price)}</span>
              {price.hasSale && (
                <span className="text-xs text-muted-foreground line-through">{formatBRL(price.listPrice)}</span>
              )}
            </>
          ) : (
            <span className="text-sm text-muted-foreground">Preço indisponível</span>
          )}
        </div>

        <button
          type="button"
          disabled={!variant || !price}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!variant || !price) return;
            addToCart({
              productId: product.id,
              variantId: variant.id,
              slug: product.slug,
              name: product.name,
              variantName: null,
              imageUrl: cover,
              unitCents: price.price,
            });
            toast.success("Adicionado ao carrinho");
          }}
          className="relative z-20 mt-2 inline-flex items-center justify-center rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground shadow-soft transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Adicionar
        </button>
      </div>
    </div>
  );
}
