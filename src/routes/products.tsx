import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { StoreLayout } from "@/components/store/StoreLayout";
import { ProductCard } from "@/components/store/ProductCard";
import { categoriesQuery, collectionsQuery, productListQuery } from "@/lib/catalog";

const searchSchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  collection: z.string().optional(),
});

export const Route = createFileRoute("/products")({
  validateSearch: (search) => searchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Produtos · Absoluto Glamur" },
      { name: "description", content: "Explore nosso catálogo de skincare, maquiagem e cabelos." },
    ],
  }),
  component: ProductsPage,
});

function ProductsPage() {
  const { q, category, collection } = Route.useSearch();
  const { data: products = [], isLoading } = useQuery(productListQuery({ q, category, collection }));
  const { data: categories = [] } = useQuery(categoriesQuery());
  const { data: collections = [] } = useQuery(collectionsQuery());

  const title =
    (collection && collections.find((c) => c.slug === collection)?.name) ||
    (category && categories.find((c) => c.slug === category)?.name) ||
    (q ? `Resultados para "${q}"` : "Todos os produtos");

  return (
    <StoreLayout>
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <header className="mb-8 flex flex-col gap-3">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Catálogo</p>
          <h1 className="font-display text-4xl text-foreground">{title}</h1>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/products"
              search={{} as never}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                !category && !collection ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-secondary"
              }`}
            >
              Todos
            </Link>
            {categories.map((c) => (
              <Link
                key={c.id}
                to="/products"
                search={{ category: c.slug } as never}
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  category === c.slug ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-secondary"
                }`}
              >
                {c.name}
              </Link>
            ))}
          </div>
        </header>

        {isLoading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-[3/4] animate-pulse rounded-2xl bg-secondary/60" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-secondary/40 p-12 text-center">
            <h2 className="font-display text-2xl text-foreground">Nada por aqui ainda</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {q ? "Nenhum produto correspondeu à sua busca." : "Os primeiros produtos aparecerão em breve."}
            </p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </div>
    </StoreLayout>
  );
}
