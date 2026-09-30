import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/public/webhooks/17track")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { verifyTrackingSignature, applyTrackingUpdate } =
          await import("@/lib/order-tracking.server");
        const { data: integration, error } = await supabaseAdmin
          .from("integrations")
          .select("api_key,enabled")
          .eq("provider", "17track")
          .maybeSingle();
        if (error || !integration?.enabled || !integration.api_key)
          return new Response("Not configured", { status: 503 });
        const raw = await request.text();
        if (!verifyTrackingSignature(raw, integration.api_key, request.headers.get("sign") || ""))
          return new Response("Unauthorized", { status: 401 });
        let payload;
        try {
          payload = JSON.parse(raw);
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        if (payload.event !== "TRACKING_UPDATED" || !payload.data)
          return Response.json({ code: 0 });
        for (const item of Array.isArray(payload.data.accepted)
          ? payload.data.accepted
          : [payload.data])
          await applyTrackingUpdate(supabaseAdmin, item);
        return Response.json({ code: 0 });
      },
    },
  },
});
