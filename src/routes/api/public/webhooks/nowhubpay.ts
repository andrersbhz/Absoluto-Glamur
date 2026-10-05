import { createFileRoute } from "@tanstack/react-router";

type Payload = { id?: string; type?: string; data?: { transaction_id?: string; status?: string } };

export const Route = createFileRoute("/api/public/webhooks/nowhubpay")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: Payload;
        try {
          payload = (await request.json()) as Payload;
        } catch {
          return new Response("bad payload", { status: 400 });
        }
        const txId = payload.data?.transaction_id;
        if (!txId || typeof txId !== "string" || txId.length > 200) {
          return new Response("missing id", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: integ } = await supabaseAdmin
          .from("integrations")
          .select("api_key, config")
          .eq("provider", "nowhubpay")
          .maybeSingle();
        const secret = (integ?.config as { merchant_key?: string } | null)?.merchant_key;
        if (!integ?.api_key || !secret) return new Response("not configured", { status: 503 });

        const { data: pay } = await supabaseAdmin
          .from("payments")
          .select("id, order_id, status")
          .eq("provider", "nowhubpay")
          .eq("external_id", txId)
          .maybeSingle();
        if (!pay) return new Response("unknown transaction", { status: 404 });

        await supabaseAdmin.from("payment_events").insert({
          provider: "nowhubpay",
          event_type: payload.type ?? "unknown",
          external_id: txId,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          payload: payload as any,
        });

        // Nunca confiar no corpo: consulta o status real na NowHubPay.
        const { nowhubFetch, isNowHubPaid } = await import("@/lib/nowhubpay.server");
        let status = "";
        try {
          const r = await nowhubFetch<{ status?: string }>(
            { clientId: integ.api_key, clientSecret: secret },
            `/v1/transactions/${encodeURIComponent(txId)}`,
          );
          status = String(r.status ?? "").toUpperCase();
        } catch (e) {
          console.error("[nowhubpay] verify failed", e);
          return new Response("verify failed", { status: 502 });
        }

        if (isNowHubPaid(status) && pay.status !== "confirmed") {
          const paidAt = new Date().toISOString();
          await supabaseAdmin.from("payments").update({ status: "confirmed", paid_at: paidAt }).eq("id", pay.id);
          await supabaseAdmin
            .from("orders")
            .update({ status: "paid", paid_at: paidAt })
            .eq("id", pay.order_id)
            .in("status", ["pending", "awaiting_payment", "failed"]);
        } else if (["FAILED", "CANCELED", "REJECTED"].includes(status) && pay.status === "pending") {
          await supabaseAdmin.from("payments").update({ status: "failed" }).eq("id", pay.id);
        }
        return new Response("ok");
      },
    },
  },
});
