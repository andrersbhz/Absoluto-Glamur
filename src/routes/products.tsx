import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ListFilter } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StoreLayout } from "@/components/store/StoreLayout";
import { ProductCard } from "@/components/store/ProductCard";
import { categoriesQuery, collectionsQuery, productListQuery } from "@/lib/catalog";

const searchSchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  collection: z.string().optional(),
  sort: z.enum(["recent", "price_asc", "price_desc", "best_selling", "top_rated"]).optional(),
});

export const Route = createFileRoute("/products")({
  validateSearch: (search) => searchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Catálogo de Beleza · Absoluto Glamur" },
      {
        name: "description",
        content:
          "Catálogo completo de skincare, maquiagem, cabelos e fitness da Absoluto Glamur. Selecione por categoria ou coleção e receba em todo o Brasil.",
      },
      { property: "og:title", content: "Catálogo Absoluto Glamur" },
      {
        property: "og:description",
        content:
          "Skincare, maquiagem e cabelos com curadoria. Explore o catálogo completo da Absoluto Glamur.",
      },
      { property: "og:url", content: "https://absolutoglamur.com.br/products" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://absolutoglamur.com.br/products" }],
  }),
  component: ProductsPage,
});


function ProductsPage() {
  const { q, category, collection, sort } = Route.useSearch();
  const navigate = useNavigate();
  const { data: products = [], isLoading } = useQuery(productListQuery({ q, category, collection, sort }));
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
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
            <div className="flex min-w-0 flex-wrap gap-2">
              <Link
                to="/products"
                search={{ q, sort } as never}
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
                  search={{ q, category: c.slug, sort } as never}
                  className={`rounded-full border px-3 py-1 text-xs transition ${
                    category === c.slug ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  {c.name}
                </Link>
              ))}
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant={sort ? "secondary" : "outline"}
                  size="sm"
                  className="shrink-0 rounded-full"
                  aria-label="Escolher ordenação dos produtos"
                >
                  <ListFilter />
                  <span className="hidden sm:inline">Ordenar</span>
                  <ChevronDown className="hidden sm:block" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuRadioGroup
                  value={sort ?? ""}
                  onValueChange={(value) => {
                    const nextSort = value === sort ? undefined : value;
                    navigate({
                      to: "/products",
                      search: { q, category, collection, sort: nextSort } as never,
                    });
                  }}
                >
                  {(
                    [
                      { value: "best_selling", label: "Mais vendidos" },
                      { value: "top_rated", label: "Mais bem avaliados" },
                      { value: "price_asc", label: "Menor preço" },
                      { value: "price_desc", label: "Maior preço" },
                    ] as const
                  ).map((option) => (
                    <DropdownMenuRadioItem
                      key={option.value}
                      value={option.value}
                      onSelect={() => {
                        if (sort !== option.value) return;
                        navigate({
                          to: "/products",
                          search: { q, category, collection, sort: undefined } as never,
                        });
                      }}
                    >
                      {option.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
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
