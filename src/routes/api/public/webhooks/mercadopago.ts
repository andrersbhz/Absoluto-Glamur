import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/webhooks/mercadopago")({
  server: { handlers: { POST: async ({ request }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getMercadoPagoPayment, verifyMercadoPagoSignature } = await import("@/lib/mercadopago.server");
    const url = new URL(request.url);
    const body = await request.json().catch(() => ({})) as { data?: { id?: string | number }; id?: string | number; type?: string };
    const dataId = String(body.data?.id ?? body.id ?? url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? "");
    if (!dataId) return new Response("ok", { status: 200 });
    const { data: integration } = await supabaseAdmin.from("integrations").select("api_key, webhook_token, enabled").eq("provider", "mercadopago").maybeSingle();
    if (!integration?.enabled || !integration.api_key || !integration.webhook_token) return new Response("not configured", { status: 503 });
    const valid = verifyMercadoPagoSignature({ signature: request.headers.get("x-signature"), requestId: request.headers.get("x-request-id"), dataId, secret: integration.webhook_token });
    if (!valid) return new Response("invalid signature", { status: 401 });
    if (body.type && body.type !== "payment") return new Response("ok", { status: 200 });
    const payment = await getMercadoPagoPayment({ accessToken: integration.api_key }, dataId);
    const orderId = payment.external_reference;
    if (!orderId) return new Response("ok", { status: 200 });
    const status = payment.status === "approved" ? "confirmed" : payment.status === "refunded" ? "refunded" : payment.status === "cancelled" ? "cancelled" : payment.status === "rejected" ? "failed" : "pending";
    await supabaseAdmin.from("payments").update({ status, external_id: String(payment.id), raw: payment }).eq("order_id", orderId).eq("provider", "mercadopago");
    if (status === "confirmed") await supabaseAdmin.from("orders").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", orderId).eq("status", "awaiting_payment");
    else if (["refunded", "cancelled", "failed"].includes(status)) await supabaseAdmin.from("orders").update({ status }).eq("id", orderId);
    return new Response("ok", { status: 200 });
  } } },
});
