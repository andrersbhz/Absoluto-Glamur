import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Gem, ShieldCheck, Truck, Crown, ArrowRight } from "lucide-react";
import { StoreLayout } from "@/components/store/StoreLayout";
import { ProductCard } from "@/components/store/ProductCard";
import { categoriesQuery, productListQuery } from "@/lib/catalog";

export const Route = createFileRoute("/home-luxo")({
  head: () => ({
    meta: [
      { title: "Maison Absoluto Glamur · Prévia do visual luxo" },
      { name: "description", content: "Prévia da nova home sofisticada da Absoluto Glamur: beleza e perfumaria com curadoria de luxo." },
      { property: "og:title", content: "Maison Absoluto Glamur · Prévia luxo" },
      { property: "og:description", content: "Beleza e perfumaria com curadoria de luxo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: HomeLuxo,
});

function Ornament() {
  return (
    <div className="mx-auto my-5 flex items-center justify-center gap-3 text-champagne">
      <span className="h-px w-16 bg-gradient-to-r from-transparent to-champagne" />
      <Gem className="h-3 w-3" />
      <span className="h-px w-16 bg-gradient-to-l from-transparent to-champagne" />
    </div>
  );
}

function Heading({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div className="text-center">
      <p className="text-[11px] uppercase tracking-[0.4em] text-champagne">{kicker}</p>
      <h2 className="mt-3 font-serif text-3xl font-light md:text-5xl">{title}</h2>
      <Ornament />
    </div>
  );
}

function HomeLuxo() {
  const { data: best = [] } = useQuery(productListQuery({ sort: "best_selling", limit: 8 }));
  const { data: top = [] } = useQuery(productListQuery({ sort: "top_rated", limit: 4 }));
  const { data: categories = [] } = useQuery(categoriesQuery());

  return (
    <div className="maison-luxo">
      <StoreLayout>
        <div className="bg-[var(--maison-ink)] py-2 text-center text-xs tracking-widest text-[var(--maison-ink-foreground)]">
          PRÉVIA DO NOVO VISUAL ·{" "}
          <Link to="/" className="underline underline-offset-4 hover:text-champagne">ver home atual</Link>
        </div>

        <section className="relative overflow-hidden border-b border-border">
          <div className="mx-auto max-w-5xl px-6 py-24 text-center md:py-36">
            <p className="text-[11px] uppercase tracking-[0.5em] text-champagne">Maison de beleza · Desde a curadoria</p>
            <h1 className="mt-6 font-serif text-5xl font-light leading-[1.05] md:text-7xl">
              A arte de ser <em className="text-champagne">absoluta</em>
            </h1>
            <Ornament />
            <p className="mx-auto max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
              Perfumaria, skincare e maquiagem selecionados peça a peça, para rituais que merecem o extraordinário.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-4">
              <Link to="/products" className="inline-flex items-center gap-2 bg-primary px-8 py-4 text-xs uppercase tracking-[0.3em] text-primary-foreground transition hover:opacity-90">
                Explorar a coleção <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        <section className="border-b border-border">
          <div className="mx-auto grid max-w-6xl grid-cols-1 divide-y divide-border px-6 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {[
              { i: Crown, t: "Curadoria exclusiva", d: "Apenas marcas selecionadas" },
              { i: ShieldCheck, t: "Autenticidade", d: "Compra 100% protegida" },
              { i: Truck, t: "Frete cortesia", d: "Acima de R$ 199" },
            ].map(({ i: Icon, t, d }) => (
              <div key={t} className="flex flex-col items-center gap-2 py-8 text-center">
                <Icon className="h-5 w-5 text-champagne" />
                <p className="font-serif text-lg">{t}</p>
                <p className="text-xs uppercase tracking-widest text-muted-foreground">{d}</p>
              </div>
            ))}
          </div>
        </section>

        {categories.length > 0 && (
          <section className="mx-auto max-w-6xl px-6 py-20">
            <Heading kicker="Universos" title="Nossas maisons" />
            <div className="flex flex-wrap justify-center gap-3">
              {categories.map((c) => (
                <Link key={c.id} to="/products" search={{ category: c.slug } as never}
                  className="border border-border px-6 py-3 font-serif text-sm tracking-wide transition hover:border-champagne hover:text-champagne">
                  {c.name}
                </Link>
              ))}
            </div>
          </section>
        )}

        {best.length > 0 && (
          <section className="mx-auto max-w-7xl px-6 pb-20">
            <Heading kicker="Os mais desejados" title="Ícones da Maison" />
            <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
              {best.map((p) => <ProductCard key={p.id} product={p} />)}
            </div>
          </section>
        )}

        <section className="bg-[var(--maison-ink)] text-[var(--maison-ink-foreground)]">
          <div className="mx-auto max-w-3xl px-6 py-24 text-center">
            <Gem className="mx-auto h-5 w-5 text-champagne" />
            <p className="mt-6 font-serif text-3xl font-light italic leading-snug md:text-4xl">
              “Luxo é o cuidado nos detalhes que só você percebe.”
            </p>
            <p className="mt-6 text-[11px] uppercase tracking-[0.4em] text-champagne">Absoluto Glamur</p>
          </div>
        </section>

        {top.length > 0 && (
          <section className="mx-auto max-w-7xl px-6 py-20">
            <Heading kicker="Aclamados" title="Mais bem avaliados" />
            <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
              {top.map((p) => <ProductCard key={p.id} product={p} />)}
            </div>
          </section>
        )}
      </StoreLayout>
    </div>
  );
}
