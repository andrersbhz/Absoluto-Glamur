import { createFileRoute } from "@tanstack/react-router";

/**
 * Legacy endpoint intentionally disabled.
 * OAuth must be initiated from the authenticated admin panel so the request
 * receives a short-lived signed state before leaving for AliExpress.
 */
export const Route = createFileRoute("/api/public/aliexpress/start")({
  server: {
    handlers: {
      GET: async () =>
        new Response(
          "<!doctype html><meta charset=utf-8><h1>Fluxo de autorização atualizado</h1><p>Abra Admin → Integrações e use o botão Autorizar AliExpress.</p>",
          {
            status: 403,
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "Cache-Control": "no-store",
            },
          },
        ),
    },
  },
});
