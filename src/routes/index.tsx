import { createFileRoute, Link } from "@tanstack/react-router";
import { Sparkles, ShieldCheck, Truck } from "lucide-react";
import { StoreLayout } from "@/components/store/StoreLayout";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <StoreLayout>
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--secondary)_0%,_var(--background)_60%)]" />
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:flex lg:items-center lg:gap-12 lg:px-8 lg:py-28">
          <div className="max-w-xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
              <Sparkles className="h-3.5 w-3.5 text-champagne" /> Nova coleção · em breve
            </p>
            <h1 className="mt-6 font-display text-5xl leading-[1.05] text-foreground sm:text-6xl">
              Beleza que floresce{" "}
              <span className="text-primary">com você.</span>
            </h1>
            <p className="mt-5 text-lg text-muted-foreground">
              Skincare, maquiagem e cabelos com curadoria feminina. Bloom em construção — a loja abrirá em breve.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/auth"
                className="inline-flex items-center justify-center rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-soft transition hover:opacity-90"
              >
                Criar conta
              </Link>
              <a
                href="#recursos"
                className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-6 py-3 text-sm font-medium text-foreground transition hover:bg-secondary"
              >
                Saiba mais
              </a>
            </div>
          </div>
          <div className="mt-12 flex-1 lg:mt-0">
            <div className="mx-auto aspect-[4/5] max-w-md rounded-3xl bg-gradient-to-br from-primary/80 via-berry to-plum shadow-elegant" />
          </div>
        </div>
      </section>

      <section id="recursos" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
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

      <section className="mx-auto mb-16 max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-dashed border-border bg-secondary/50 p-10 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Em construção</p>
          <h2 className="mt-2 font-display text-3xl">O catálogo chega na próxima fase</h2>
          <p className="mx-auto mt-3 max-w-lg text-sm text-muted-foreground">
            A Fase 1 entregou a fundação: autenticação, perfis, funções e design system. A Fase 2 traz o catálogo completo,
            variantes, imagens e carrinho.
          </p>
        </div>
      </section>
    </StoreLayout>
  );
}
