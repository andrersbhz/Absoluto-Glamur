import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, ShieldCheck, Truck } from "lucide-react";
import { StoreLayout } from "@/components/store/StoreLayout";
import { ProductCard } from "@/components/store/ProductCard";
import { categoriesQuery, featuredProductsQuery } from "@/lib/catalog";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { data: bestsellers = [] } = useQuery(featuredProductsQuery("mais-vendidos"));
  const { data: newArrivals = [] } = useQuery(featuredProductsQuery("lancamentos"));
  const { data: categories = [] } = useQuery(categoriesQuery());

  return (
    <StoreLayout>
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--secondary)_0%,_var(--background)_60%)]" />
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:flex lg:items-center lg:gap-12 lg:px-8 lg:py-28">
          <div className="max-w-xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
              <Sparkles className="h-3.5 w-3.5 text-champagne" /> Curadoria feminina
            </p>
            <h1 className="mt-6 font-display text-5xl leading-[1.05] text-foreground sm:text-6xl">
              Beleza que floresce{" "}
              <span className="text-primary">com você.</span>
            </h1>
            <p className="mt-5 text-lg text-muted-foreground">
              Skincare, maquiagem e cabelos com curadoria feminina. Descubra o que combina com o seu ritual.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/products"
                search={{} as never}
                className="inline-flex items-center justify-center rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-soft transition hover:opacity-90"
              >
                Explorar catálogo
              </Link>
              <Link
                to="/products"
                search={{ collection: "promocoes" } as never}
                className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-6 py-3 text-sm font-medium text-foreground transition hover:bg-secondary"
              >
                Ver ofertas
              </Link>
            </div>
          </div>
          <div className="mt-12 flex-1 lg:mt-0">
            <div className="mx-auto aspect-[4/5] max-w-md rounded-3xl bg-gradient-to-br from-primary/80 via-berry to-plum shadow-elegant" />
          </div>
        </div>
      </section>

      {categories.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-wrap gap-3">
            {categories.map((c) => (
              <Link
                key={c.id}
                to="/products"
                search={{ category: c.slug } as never}
                className="rounded-full border border-border bg-card px-4 py-2 text-sm text-foreground shadow-soft transition hover:border-primary hover:text-primary"
              >
                {c.name}
              </Link>
            ))}
          </div>
        </section>
      )}

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

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-6 sm:grid-cols-3">
          {[
            { icon: Sparkles, title: "Curadoria autoral", body: "Seleção rigorosa de produtos com foco em resultado real." },
            { icon: ShieldCheck, title: "Conformidade cosmética", body: "Fabricantes e ingredientes verificados antes de publicar." },
            { icon: Truck, title: "Envio para todo o Brasil", body: "Frete rápido e rastreável em cada pedido." },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-2xl border border-border bg-card p-6 shadow-soft">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-display text-xl">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>
    </StoreLayout>
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
    <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{subtitle}</p>
          <h2 className="font-display text-3xl text-foreground">{title}</h2>
        </div>
        <Link
          to="/products"
          search={link.search as never}
          className="text-sm text-primary hover:underline"
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
