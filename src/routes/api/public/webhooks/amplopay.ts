import { createFileRoute } from "@tanstack/react-router";

type Payload = {
  event?: string;
  token?: string;
  transaction?: { id?: string; identifier?: string; status?: string };
  transactionId?: string;
  status?: string;
};

export const Route = createFileRoute("/api/public/webhooks/amplopay")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: Payload;
        try {
          payload = (await request.json()) as Payload;
        } catch {
          return new Response("bad payload", { status: 400 });
        }
        const txId = payload.transaction?.id ?? payload.transactionId;
        if (!txId) return new Response("missing id", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: integ } = await supabaseAdmin
          .from("integrations")
          .select("api_key, config")
          .eq("provider", "amplopay")
          .maybeSingle();
        const secret = (integ?.config as { merchant_key?: string } | null)?.merchant_key;
        if (!integ?.api_key || !secret) return new Response("not configured", { status: 503 });

        const { data: pay } = await supabaseAdmin
          .from("payments")
          .select("id, order_id, status")
          .eq("provider", "amplopay")
          .eq("external_id", txId)
          .maybeSingle();
        if (!pay) return new Response("unknown transaction", { status: 404 });

        await supabaseAdmin.from("payment_events").insert({
          provider: "amplopay",
          event_type: payload.event ?? "unknown",
          external_id: txId,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          payload: payload as any,
        });

        // Nunca confiar só no corpo: confirma o status direto na AmploPay.
        const { amplopayFetch, isAmploPayPaid } = await import("@/lib/amplopay.server");
        let status = "";
        try {
          const r = await amplopayFetch<Record<string, unknown>>(
            { clientId: integ.api_key, clientSecret: secret },
            `/gateway/transactions?id=${encodeURIComponent(txId)}`,
          );
          status = String(r.status ?? (r.transaction as { status?: string } | undefined)?.status ?? "");
        } catch (e) {
          console.error("[amplopay] verify failed", e);
          return new Response("verify failed", { status: 502 });
        }

        const upper = status.toUpperCase();
        if (isAmploPayPaid(upper) && pay.status !== "confirmed") {
          const paidAt = new Date().toISOString();
          await supabaseAdmin
            .from("payments")
            .update({ status: "confirmed", paid_at: paidAt })
            .eq("id", pay.id);
          await supabaseAdmin
            .from("orders")
            .update({ status: "paid", paid_at: paidAt })
            .eq("id", pay.order_id);
          try {
            const { notifyAdminsOfPaidOrder } = await import("@/lib/push.server");
            await notifyAdminsOfPaidOrder(pay.order_id);
          } catch (e) {
            console.error("[push] amplopay notify failed", e);
          }
        } else if (["CANCELED", "CANCELLED", "FAILED", "REFUSED"].includes(upper)) {
          await supabaseAdmin.from("payments").update({ status: "cancelled" }).eq("id", pay.id);
        } else if (["REFUNDED", "CHARGED_BACK", "CHARGEBACK"].includes(upper)) {
          await supabaseAdmin.from("payments").update({ status: "refunded" }).eq("id", pay.id);
          await supabaseAdmin.from("orders").update({ status: "refunded" }).eq("id", pay.order_id);
        }
        return new Response("ok");
      },
    },
  },
});
