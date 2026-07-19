import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { supabase } from "@/integrations/supabase/client";
import { getGtmContainerId } from "@/lib/gtm.functions";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-7xl text-primary">404</h1>
        <h2 className="mt-4 font-display text-2xl text-foreground">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          O endereço que você acessou não existe ou foi movido.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-soft transition hover:opacity-90"
          >
            Voltar para a loja
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-2xl text-foreground">Algo não carregou</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tivemos um problema ao exibir esta página. Tente novamente ou volte para o início.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            Tentar novamente
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-5 py-2.5 text-sm font-medium text-foreground transition hover:bg-secondary"
          >
            Ir para a loja
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: ({ loaderData }) => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Absoluto Glamur · Cosméticos premium" },
      {
        name: "description",
        content:
          "Absoluto Glamur — beleza, skincare e maquiagem selecionadas com curadoria. Loja online com envio para todo o Brasil.",
      },
      { property: "og:title", content: "Absoluto Glamur · Cosméticos premium" },
      {
        property: "og:description",
        content: "Absoluto Glamur — beleza, skincare e maquiagem selecionadas com curadoria. Loja online com envio para todo o Brasil.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Absoluto Glamur · Cosméticos premium" },
      { name: "twitter:description", content: "Absoluto Glamur — beleza, skincare e maquiagem selecionadas com curadoria. Loja online com envio para todo o Brasil." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/be040f5f-bd15-4a98-8b8d-e90c140eacaf/id-preview-0aae106e--c8e28b23-eac8-4d4a-9c23-26a7e47a2ec8.lovable.app-1784319380473.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/be040f5f-bd15-4a98-8b8d-e90c140eacaf/id-preview-0aae106e--c8e28b23-eac8-4d4a-9c23-26a7e47a2ec8.lovable.app-1784319380473.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600;700&display=swap",
      },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "Absoluto Glamur",
          description: "Curadoria feminina de skincare, maquiagem e cabelos.",
          url: "/",
        }),
      },
      ...(loaderData?.gtmId
        ? [
            {
              children: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${loaderData.gtmId}');`,
            },
          ]
        : []),
    ],
  }),
  loader: async () => ({ gtmId: await getGtmContainerId() }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => data.subscription.unsubscribe();
  }, [router, queryClient]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    if (w.__gtmLoaded) return;
    getGtmContainerId()
      .then((id) => {
        if (!id || w.__gtmLoaded) return;
        w.__gtmLoaded = true;
        w.dataLayer = w.dataLayer || [];
        w.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
        const s = document.createElement("script");
        s.async = true;
        s.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(id)}`;
        document.head.appendChild(s);
        const ns = document.createElement("noscript");
        const iframe = document.createElement("iframe");
        iframe.src = `https://www.googletagmanager.com/ns.html?id=${encodeURIComponent(id)}`;
        iframe.height = "0";
        iframe.width = "0";
        iframe.style.display = "none";
        iframe.style.visibility = "hidden";
        ns.appendChild(iframe);
        document.body.insertBefore(ns, document.body.firstChild);
      })
      .catch(() => {});
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  );
}
