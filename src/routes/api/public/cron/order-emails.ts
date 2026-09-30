import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/public/cron/order-emails")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.CRON_SECRET;
        if (!secret) return new Response("CRON_SECRET not configured", { status: 503 });
        if (request.headers.get("authorization") !== `Bearer ${secret}`)
          return new Response("Unauthorized", { status: 401 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { processOrderEmails } = await import("@/lib/order-notifications.server");
        return Response.json(await processOrderEmails(supabaseAdmin));
      },
    },
  },
});
