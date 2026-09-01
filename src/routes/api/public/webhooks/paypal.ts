import { createFileRoute } from "@tanstack/react-router";

type PayPalEvent = {
  event_type?: string;
  resource?: {
    id?: string;
    status?: string;
    custom_id?: string;
    supplementary_data?: { related_ids?: { order_id?: string } };
    purchase_units?: { custom_id?: string; reference_id?: string }[];
  };
};

const STATUS_MAP: Record<
  string,
  { payment: string; order?: string; paid?: boolean }
> = {
  "CHECKOUT.ORDER.APPROVED": { payment: "pending" },
  "PAYMENT.CAPTURE.COMPLETED": { payment: "confirmed", order: "paid", paid: true },
  "PAYMENT.CAPTURE.DENIED": { payment: "failed", order: "failed" },
  "PAYMENT.CAPTURE.REFUNDED": { payment: "refunded", order: "refunded" },
  "PAYMENT.CAPTURE.REVERSED": { payment: "refunded", order: "refunded" },
  "CHECKOUT.ORDER.VOIDED": { payment: "cancelled", order: "cancelled" },
};

export const Route = createFileRoute("/api/public/webhooks/paypal")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { verifyPayPalWebhook, capturePayPalOrder } = await import("@/lib/paypal.server");

        const { data: integ } = await supabaseAdmin
          .from("integrations")
          .select("api_key, api_secret, mode, webhook_token, config")
          .eq("provider", "paypal")
          .maybeSingle();

        if (!integ?.api_key || !integ.api_secret) {
          return new Response("not configured", { status: 503 });
        }

        const raw = await request.text();
        const cfg = {
          clientId: integ.api_key,
          clientSecret: integ.api_secret,
          env: (integ.mode as "sandbox" | "production") ?? "sandbox",
        };

        const webhookId =
          ((integ.config as Record<string, unknown> | null)?.["webhook_id"] as string | undefined) ??
          integ.webhook_token ??
          "";
        if (!webhookId) return new Response("missing webhook id", { status: 503 });

        const valid = await verifyPayPalWebhook(cfg, webhookId, request.headers, raw);
        if (!valid) return new Response("unauthorized", { status: 401 });

        let payload: PayPalEvent;
        try {
          payload = JSON.parse(raw) as PayPalEvent;
        } catch {
          return new Response("bad payload", { status: 400 });
        }

        const eventType = payload.event_type ?? "unknown";
        const orderExternalId =
          payload.resource?.supplementary_data?.related_ids?.order_id ??
          payload.resource?.id ??
          null;

        await supabaseAdmin.from("payment_events").insert({
          provider: "paypal",
          event_type: eventType,
          external_id: orderExternalId,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          payload: payload as any,
        });

        // Ordem aprovada pelo cliente → capturar o valor
        if (eventType === "CHECKOUT.ORDER.APPROVED" && payload.resource?.id) {
          try {
            await capturePayPalOrder(cfg, payload.resource.id);
          } catch (e) {
            console.error("[paypal] capture failed", e);
          }
        }

        const map = STATUS_MAP[eventType];
        if (orderExternalId && map) {
          const paidAt = map.paid ? new Date().toISOString() : null;
          const { data: pay } = await supabaseAdmin
            .from("payments")
            .update({
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              status: map.payment as any,
              paid_at: paidAt,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              raw: payload as any,
            })
            .eq("provider", "paypal")
            .or(`external_id.eq.${orderExternalId},session_id.eq.${orderExternalId}`)
            .select("order_id")
            .maybeSingle();

          if (pay?.order_id && map.order) {
            await supabaseAdmin
              .from("orders")
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .update({ status: map.order as any, paid_at: paidAt })
              .eq("id", pay.order_id);

            if (map.order === "paid") {
              try {
                const { notifyAdminsOfPaidOrder } = await import("@/lib/push.server");
                await notifyAdminsOfPaidOrder(pay.order_id);
              } catch (e) {
                console.error("[push] paypal notify failed", e);
              }
            }
          }
        }

        return new Response("ok");
      },
    },
  },
});
