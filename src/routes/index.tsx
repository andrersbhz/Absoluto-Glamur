import { Component, type ErrorInfo, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { HomePageV12 } from "@/components/store/HomePageV12";
import { StoreLayout } from "@/components/store/StoreLayout";

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
        content: "Skincare, maquiagem e cabelos com curadoria. Envio para todo o Brasil.",
      },
      { property: "og:url", content: "https://absolutoglamur.com.br/" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://absolutoglamur.com.br/" }],
  }),
  component: GuardedHomePage,
});

type ErrorBoundaryProps = { children: ReactNode };
type ErrorBoundaryState = { hasError: boolean };

class HomeErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[home-v1.2.1] HomePageV12 runtime error", error, info);
  }

  render() {
    if (this.state.hasError) return <SafeHomeFallback />;
    return this.props.children;
  }
}

function GuardedHomePage() {
  return (
    <HomeErrorBoundary>
      <HomePageV12 />
    </HomeErrorBoundary>
  );
}

function SafeHomeFallback() {
  return (
    <StoreLayout>
      <section className="relative isolate flex min-h-[520px] items-center overflow-hidden bg-gradient-to-br from-background via-secondary/50 to-champagne/15">
        <div className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-[11px] font-medium uppercase tracking-[0.32em] text-plum">Absoluto Glamur</p>
            <h1 className="mt-5 font-display text-5xl leading-tight text-foreground sm:text-6xl">
              Beleza rara, <span className="text-primary">assinatura sua.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground">
              Cosméticos, skincare, maquiagem e cuidados selecionados para sua rotina.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="/products"
                className="inline-flex rounded-full bg-primary px-7 py-3 text-xs font-semibold uppercase tracking-[0.22em] text-primary-foreground shadow-elegant"
              >
                Ver produtos
              </a>
              <a
                href="/products"
                className="inline-flex rounded-full border border-border bg-card px-7 py-3 text-xs font-semibold uppercase tracking-[0.22em] text-foreground"
              >
                Explorar loja
              </a>
            </div>
          </div>
        </div>
      </section>
    </StoreLayout>
  );
}
