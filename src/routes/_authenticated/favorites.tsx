import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { StoreLayout } from "@/components/store/StoreLayout";
import { ProductCard } from "@/components/store/ProductCard";
import { favoriteProductsQuery } from "@/lib/favorites";
import { useAuth } from "@/hooks/use-auth";
import type { ProductListItem } from "@/lib/catalog";

export const Route = createFileRoute("/_authenticated/favorites")({
  head: () => ({ meta: [{ title: "Favoritos · Bloom" }, { name: "robots", content: "noindex" }] }),
  component: FavoritesPage,
});

function FavoritesPage() {
  const { user } = useAuth();
  const { data = [], isLoading } = useQuery(favoriteProductsQuery(user?.id));
  const products = data as ProductListItem[];

  return (
    <StoreLayout>
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <h1 className="font-display text-4xl">Meus favoritos</h1>
        <p className="mt-1 text-sm text-muted-foreground">Produtos que você salvou para depois.</p>

        {isLoading ? (
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="aspect-[3/4] animate-pulse rounded-2xl bg-secondary/60" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-border bg-secondary/40 p-12 text-center">
            <h2 className="font-display text-2xl">Nada por aqui ainda</h2>
            <p className="mt-2 text-sm text-muted-foreground">Toque no coração dos produtos para salvá-los aqui.</p>
            <Link to="/products" search={{} as never} className="mt-6 inline-block rounded-lg bg-primary px-5 py-2.5 text-sm text-primary-foreground">
              Descobrir produtos
            </Link>
          </div>
        ) : (
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </div>
    </StoreLayout>
  );
}
