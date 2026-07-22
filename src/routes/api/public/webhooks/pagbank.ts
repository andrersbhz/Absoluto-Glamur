import { createFileRoute } from "@tanstack/react-router";

type PagBankCharge = {
  id?: string;
  reference_id?: string;
  status?: string;
  payment_response?: { code?: string; message?: string };
  payment_method?: { type?: string };
};

type WebhookPayload = {
  id?: string;
  reference_id?: string;
  status?: string;
  charges?: PagBankCharge[];
};

export const Route = createFileRoute("/api/public/webhooks/pagbank")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { PAGBANK_STATUS_MAP } = await import("@/lib/pagbank.server");

        const { data: integ } = await supabaseAdmin
          .from("integrations")
          .select("webhook_token")
          .eq("provider", "pagbank")
          .maybeSingle();

        // PagBank envia notificações POST com header x-authenticity-token (quando configurado)
        // ou você pode validar via HMAC. Aceita também Authorization: Bearer <token>.
        const provided =
          request.headers.get("x-authenticity-token") ??
          request.headers.get("x-pagbank-signature") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          "";

        // Token opcional — se configurado, exige match. Se vazio, aceita (útil em sandbox).
        if (integ?.webhook_token && provided !== integ.webhook_token) {
          return new Response("unauthorized", { status: 401 });
        }

        let payload: WebhookPayload;
        try {
          payload = (await request.json()) as WebhookPayload;
        } catch {
          return new Response("bad payload", { status: 400 });
        }

        const orderId = payload.reference_id ?? null;
        const charge = payload.charges?.[0];
        const externalId = charge?.id ?? payload.id ?? null;
        const statusRaw = (charge?.status ?? payload.status ?? "").toUpperCase();

        await supabaseAdmin.from("payment_events").insert({
          provider: "pagbank",
          event_type: statusRaw || "unknown",
          external_id: externalId,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          payload: payload as any,
        });

        const map = PAGBANK_STATUS_MAP[statusRaw];
        if (map) {
          const paidAt = map.paidAt ? new Date().toISOString() : null;
          const updateFilter = orderId
            ? { column: "order_id" as const, value: orderId }
            : externalId
              ? { column: "external_id" as const, value: externalId }
              : null;

          if (updateFilter) {
            const q = supabaseAdmin
              .from("payments")
              .update({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                status: map.payment as any,
                paid_at: paidAt,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                raw: payload as any,
              })
              .eq("provider", "pagbank")
              .eq(updateFilter.column, updateFilter.value);
            const { data: pay } = await q.select("order_id").maybeSingle();

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
                  console.error("[push] pagbank notify failed", e);
                }
              }
            }
          }
        }

        return new Response("ok");
      },
    },
  },
});
