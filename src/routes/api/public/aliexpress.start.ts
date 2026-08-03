import { createFileRoute } from "@tanstack/react-router";

/**
 * Inicia o fluxo OAuth do AliExpress. Lê App Key server-side (evita expor no browser)
 * e redireciona o usuário para a tela de autorização.
 */
export const Route = createFileRoute("/api/public/aliexpress/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data } = await supabaseAdmin
          .from("integrations")
          .select("api_key, config")
          .eq("provider", "aliexpress")
          .maybeSingle();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cfg = (data?.config as any) ?? {};
        const appKey = data?.api_key ?? cfg.app_key ?? "";
        if (!appKey) {
          return new Response(
            "<!doctype html><meta charset=utf-8><h1>App Key não cadastrada</h1><p>Preencha App Key e App Secret em /admin/integrations e tente novamente.</p>",
            { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
          );
        }
        const origin = new URL(request.url).origin;
        // Priority: explicit cfg.redirect_uri (must match EXACTLY the Callback URL registered in AliExpress console)
        // → falls back to current origin (useful in preview). If they mismatch, AliExpress returns
        //   "Redirect uri does not match the callback url of the APP".
        const redirect =
          (typeof cfg.redirect_uri === "string" && cfg.redirect_uri.trim()) ||
          `${origin}/api/public/webhooks/aliexpress`;
        const authUrl = `https://api-sg.aliexpress.com/oauth/authorize?response_type=code&client_id=${encodeURIComponent(
          appKey,
        )}&redirect_uri=${encodeURIComponent(redirect)}&sp=ae&force_auth=true`;
        return Response.redirect(authUrl, 302);
      },
    },
  },
});
