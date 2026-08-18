import { useEffect, type ReactNode } from "react";
import {
  Outlet,
  ScrollRestoration,
  Scripts,
  HeadContent,
  createRootRouteWithContext,
  useRouter,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAnalyticsTracker } from "@/lib/analytics-tracker";
import { CustomerPushPrompt } from "@/components/store/CustomerPushPrompt";
import { AliExpressReviewSyncBridge } from "@/components/store/AliExpressReviewSyncBridge";
import appCss from "@/styles.css?url";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Absoluto Glamur" },
      { name: "twitter:card", content: "summary_large_image" },
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
          "@type": "BeautyBusiness",
          name: "Absoluto Glamur",
          url: "https://absolutoglamur.com.br",
          logo: "https://absolutoglamur.com.br/logo.png",
          sameAs: [
            "https://instagram.com/absolutoglamur",
            "https://facebook.com/absolutoglamur",
          ],
        }),
      },
    ],
  }),
  loader: async () => {
    try {
      const { getGtmContainerId } = await import("@/lib/gtm.functions");
      return { gtmId: await getGtmContainerId() };
    } catch {
      // Analytics is optional and must never make the storefront fail.
      return { gtmId: null as string | null };
    }
  },
  shellComponent: RootShell,
  component: RootComponent,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useAnalyticsTracker();

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;

      // Revalida apenas a árvore de rotas. Antes, o login invalidava todas as queries
      // do React Query, disparando novamente dashboard, catálogo e módulos admin ao mesmo tempo.
      void router.invalidate();

      if (event === "SIGNED_OUT") {
        queryClient.clear();
      }
    });

    return () => data.subscription.unsubscribe();
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <CustomerPushPrompt />
      <AliExpressReviewSyncBridge />
      <audio
        id="whatsapp-alert"
        src="https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3"
        preload="none"
      />
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  );
}

function RootShell({ children }: { children: ReactNode }) {
  const loaderData = Route.useLoaderData() as { gtmId?: string | null } | undefined;
  const gtmId = loaderData?.gtmId ?? null;

  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
        {gtmId ? (
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtmId}');`,
            }}
          />
        ) : null}
      </head>
      <body>
        {gtmId ? (
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${gtmId}`}
              height="0"
              width="0"
              style={{ display: "none", visibility: "hidden" }}
            />
          </noscript>
        ) : null}
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
