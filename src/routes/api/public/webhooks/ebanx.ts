import { createFileRoute } from "@tanstack/react-router";

/**
 * Webhook do EBANX. A notificação traz apenas identificadores; o status real
 * é consultado na API (/ws/query) antes de atualizar pagamento e pedido.
 * Proteja a URL com ?token=<webhook_token> configurado em Admin → Integrações.
 */
export const Route = createFileRoute("/api/public/webhooks/ebanx")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { queryEbanxPayment, mapEbanxStatus } = await import("@/lib/ebanx.server");

        const { data: integ } = await supabaseAdmin
          .from("integrations")
          .select("api_key, mode, webhook_token")
          .eq("provider", "ebanx")
          .maybeSingle();

        if (!integ?.api_key) return new Response("not configured", { status: 503 });

        const url = new URL(request.url);
        const providedToken =
          url.searchParams.get("token") ??
          request.headers.get("x-webhook-token") ??
          "";
        if (!integ.webhook_token || providedToken !== integ.webhook_token) {
          return new Response("unauthorized", { status: 401 });
        }

        const rawBody = await request.text();
        let hashes: string[] = [];
        try {
          const parsed = JSON.parse(rawBody) as {
            hash?: string;
            hash_codes?: string | string[];
            payment_hash?: string;
          };
          const codes = parsed.hash_codes;
          hashes = [
            parsed.hash,
            parsed.payment_hash,
            ...(Array.isArray(codes) ? codes : typeof codes === "string" ? codes.split(",") : []),
          ].filter(Boolean) as string[];
        } catch {
          const form = new URLSearchParams(rawBody);
          const codes = form.get("hash_codes") ?? form.get("hash") ?? "";
          hashes = codes.split(",").filter(Boolean);
        }

        if (hashes.length === 0) return new Response("bad payload", { status: 400 });

        const cfg = {
          integrationKey: integ.api_key,
          env: (integ.mode as "sandbox" | "production") ?? "sandbox",
        };

        for (const hash of hashes.map((h) => h.trim())) {
          let status: string | undefined;
          let detail: unknown = null;
          try {
            const q = await queryEbanxPayment(cfg, hash);
            status = q.payment?.status;
            detail = q;
          } catch (e) {
            console.error("[ebanx] query failed", e);
            continue;
          }

          await supabaseAdmin.from("payment_events").insert({
            provider: "ebanx",
            event_type: `payment.${(status ?? "unknown").toLowerCase()}`,
            external_id: hash,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            payload: detail as any,
          });

          const map = mapEbanxStatus(status);
          const paidAt = map.paid ? new Date().toISOString() : null;

          const { data: pay } = await supabaseAdmin
            .from("payments")
            .update({
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              status: map.payment as any,
              paid_at: paidAt,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              raw: detail as any,
            })
            .eq("provider", "ebanx")
            .or(`external_id.eq.${hash},session_id.eq.${hash}`)
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
                console.error("[push] ebanx notify failed", e);
              }
            }
          }
        }

        return new Response("ok");
      },
    },
  },
});
