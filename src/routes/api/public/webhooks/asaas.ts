import { createFileRoute } from "@tanstack/react-router";

type WebhookPayload = {
  event?: string;
  payment?: {
    id?: string;
    status?: string;
    value?: number;
    externalReference?: string;
  };
};

const STATUS_MAP: Record<string, { payment: string; order?: string; paidAt?: boolean }> = {
  PAYMENT_CONFIRMED: { payment: "confirmed", order: "paid", paidAt: true },
  PAYMENT_RECEIVED: { payment: "received", order: "paid", paidAt: true },
  PAYMENT_OVERDUE: { payment: "overdue" },
  PAYMENT_REFUNDED: { payment: "refunded", order: "refunded" },
  PAYMENT_DELETED: { payment: "cancelled", order: "cancelled" },
  PAYMENT_RESTORED: { payment: "pending" },
  PAYMENT_CHARGEBACK_REQUESTED: { payment: "refunded" },
};

export const Route = createFileRoute("/api/public/webhooks/asaas")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: integ } = await supabaseAdmin
          .from("integrations")
          .select("webhook_token")
          .eq("provider", "asaas")
          .maybeSingle();

        const provided = request.headers.get("asaas-access-token") ?? "";
        if (!integ?.webhook_token || provided !== integ.webhook_token) {
          return new Response("unauthorized", { status: 401 });
        }

        let payload: WebhookPayload;
        try {
          payload = (await request.json()) as WebhookPayload;
        } catch {
          return new Response("bad payload", { status: 400 });
        }

        await supabaseAdmin.from("payment_events").insert({
          provider: "asaas",
          event_type: payload.event ?? "unknown",
          external_id: payload.payment?.id ?? null,
          payload: payload as unknown as Record<string, unknown>,
        });

        const chargeId = payload.payment?.id;
        const map = payload.event ? STATUS_MAP[payload.event] : undefined;
        if (chargeId && map) {
          const paidAt = map.paidAt ? new Date().toISOString() : null;
          const { data: pay } = await supabaseAdmin
            .from("payments")
            .update({
              status: map.payment,
              paid_at: paidAt,
              raw: (payload.payment ?? {}) as unknown as Record<string, unknown>,
            })
            .eq("provider", "asaas")
            .eq("external_id", chargeId)
            .select("order_id")
            .maybeSingle();

          if (pay?.order_id && map.order) {
            await supabaseAdmin
              .from("orders")
              .update({
                status: map.order,
                paid_at: paidAt,
              })
              .eq("id", pay.order_id);
          }
        }

        return new Response("ok");
      },
    },
  },
});
