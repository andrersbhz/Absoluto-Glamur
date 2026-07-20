import { createFileRoute } from "@tanstack/react-router";
import { runBulkSync } from "@/lib/aliexpress-stock.functions";

/**
 * Cron/webhook endpoint para sincronizar o estoque de todos os produtos
 * conectados ao AliExpress.
 *
 * Uso:
 *   curl -X POST https://<projeto>.lovable.app/api/public/cron/aliexpress-stock \
 *        -H "Authorization: Bearer $CRON_SECRET"
 */
export const Route = createFileRoute("/api/public/cron/aliexpress-stock")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.CRON_SECRET;
        if (!secret) {
          return new Response("CRON_SECRET not configured", { status: 500 });
        }
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.replace(/^Bearer\s+/i, "").trim();
        if (token !== secret) {
          return new Response("Unauthorized", { status: 401 });
        }
        const url = new URL(request.url);
        const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") ?? 200)));
        try {
          const result = await runBulkSync(limit);
          return Response.json({ ok: true, ...result });
        } catch (e) {
          return Response.json(
            { ok: false, error: e instanceof Error ? e.message : String(e) },
            { status: 500 },
          );
        }
      },
      GET: async () =>
        new Response("Use POST with Authorization: Bearer <CRON_SECRET>", { status: 405 }),
    },
  },
});
