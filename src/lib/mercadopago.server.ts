import { createHmac, timingSafeEqual } from "node:crypto";

export type MercadoPagoConfig = { accessToken: string };

async function mercadoPagoFetch<T>(cfg: MercadoPagoConfig, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`https://api.mercadopago.com${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${cfg.accessToken}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await response.text();
  const body = (text ? JSON.parse(text) : {}) as T & { message?: string; error?: string };
  if (!response.ok) throw new Error(body.message ?? body.error ?? `Mercado Pago HTTP ${response.status}`);
  return body;
}

export type MercadoPagoPreference = { id: string; init_point?: string; sandbox_init_point?: string };

export async function createMercadoPagoPreference(cfg: MercadoPagoConfig, input: {
  orderId: string; code: string; amountCents: number; currency: string; customer: { name: string; email: string }; returnUrl: string; notificationUrl: string; sandbox: boolean;
}) {
  const preference = await mercadoPagoFetch<MercadoPagoPreference>(cfg, "/checkout/preferences", {
    method: "POST",
    headers: { "X-Idempotency-Key": input.orderId },
    body: JSON.stringify({
      external_reference: input.orderId,
      items: [{ id: input.orderId, title: `Pedido ${input.code} · Absoluto Glamur`, quantity: 1, currency_id: input.currency, unit_price: Number((input.amountCents / 100).toFixed(2)) }],
      payer: { name: input.customer.name, email: input.customer.email },
      back_urls: { success: input.returnUrl, pending: input.returnUrl, failure: input.returnUrl },
      auto_return: "approved",
      notification_url: input.notificationUrl,
      statement_descriptor: "ABSOLUTO GLAMUR",
      binary_mode: false,
    }),
  });
  const redirectUrl = input.sandbox ? preference.sandbox_init_point : preference.init_point;
  if (!redirectUrl) throw new Error("Mercado Pago não retornou a URL do checkout.");
  return { preference, redirectUrl };
}

export async function getMercadoPagoPayment(cfg: MercadoPagoConfig, paymentId: string) {
  return mercadoPagoFetch<{ id: number; status: string; external_reference?: string; transaction_amount?: number; currency_id?: string }>(cfg, `/v1/payments/${encodeURIComponent(paymentId)}`);
}

export function verifyMercadoPagoSignature(input: { signature: string | null; requestId: string | null; dataId: string; secret: string }) {
  if (!input.signature || !input.requestId || !input.secret) return false;
  const parts = Object.fromEntries(input.signature.split(",").map((part) => part.trim().split("=", 2)));
  const ts = parts.ts;
  const received = parts.v1;
  if (!ts || !received) return false;
  const manifest = `id:${input.dataId};request-id:${input.requestId};ts:${ts};`;
  const expected = createHmac("sha256", input.secret).update(manifest).digest("hex");
  const a = Buffer.from(received, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
