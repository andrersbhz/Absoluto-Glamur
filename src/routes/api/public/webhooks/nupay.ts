import { createFileRoute } from "@tanstack/react-router";

type WebhookPayload = {
  event?: string;
  event_type?: string;
  status?: string;
  order?: {
    id?: string;
    reference_id?: string;
    status?: string;
  };
  payment?: {
    id?: string;
    status?: string;
    approval_code?: string;
  };
  data?: Record<string, unknown>;
};

export const Route = createFileRoute("/api/public/webhooks/nupay")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { NUPAY_STATUS_MAP } = await import("@/lib/nupay.server");

        const { data: integ } = await supabaseAdmin
          .from("integrations")
          .select("webhook_token")
          .eq("provider", "nupay")
          .maybeSingle();

        const providedToken =
          request.headers.get("x-webhook-token") ??
          request.headers.get("x-nupay-signature") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          "";

        if (!integ?.webhook_token || providedToken !== integ.webhook_token) {
          return new Response("unauthorized", { status: 401 });
        }

        let payload: WebhookPayload;
        try {
          payload = (await request.json()) as WebhookPayload;
        } catch {
          return new Response("bad payload", { status: 400 });
        }

        const eventType = payload.event ?? payload.event_type ?? "unknown";
        const externalId = payload.order?.id ?? payload.payment?.id ?? null;
        const statusRaw = (
          payload.status ??
          payload.order?.status ??
          payload.payment?.status ??
          ""
        ).toUpperCase();

        await supabaseAdmin.from("payment_events").insert({
          provider: "nupay",
          event_type: eventType,
          external_id: externalId,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          payload: payload as any,
        });

        const map = NUPAY_STATUS_MAP[statusRaw];
        if (externalId && map) {
          const paidAt = map.paidAt ? new Date().toISOString() : null;
          const { data: pay } = await supabaseAdmin
            .from("payments")
            .update({
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              status: map.payment as any,
              paid_at: paidAt,
              approval_code: payload.payment?.approval_code ?? null,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              raw: payload as any,
            })
            .eq("provider", "nupay")
            .or(`external_id.eq.${externalId},session_id.eq.${externalId}`)
            .select("order_id")
            .maybeSingle();

          if (pay?.order_id && map.order) {
            await supabaseAdmin
              .from("orders")
              .update({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                status: map.order as any,
                paid_at: paidAt,
              })
              .eq("id", pay.order_id);
            if (map.order === "paid") {
              try {
                const { notifyAdminsOfPaidOrder } = await import("@/lib/push.server");
                await notifyAdminsOfPaidOrder(pay.order_id);
              } catch (e) {
                console.error("[push] nupay notify failed", e);
              }
            }
          }
        }

        return new Response("ok");
      },
    },
  },
});
