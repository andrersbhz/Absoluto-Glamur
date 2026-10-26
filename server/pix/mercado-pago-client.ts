/**
 * Server-only Mercado Pago Pix client.
 * This is an adapter; do not call it from browser code or expose the token.
 * The existing checkout must validate order ownership, inventory, price and
 * customer data before invoking createPixPayment().
 * API: https://www.mercadopago.com.br/developers/pt/docs/checkout-api-payments/integration-configuration/integrate-pix
 */
const MP_ENDPOINT = 'https://api.mercadopago.com';
function credentials() {
  const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!token) throw new Error('Mercado Pago is not configured');
  return token;
}
export type MercadoPagoPixCreated = {
  id: number;
  status: string;
  external_reference?: string;
  transaction_details?: {
    external_resource_url?: string;
    total_paid_amount?: number;
  };
  point_of_interaction?: {
    transaction_data?: { qr_code?: string; qr_code_base64?: string; ticket_url?: string };
  };
};
export type MercadoPagoPixStatus = {
  id: number;
  status: string;
  external_reference?: string;
  transaction_amount: number;
  currency_id?: string;
  payment_method_id?: string;
};
async function mpRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(MP_ENDPOINT + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${credentials()}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Payment provider request failed (HTTP ${res.status})`);
  return res.json() as Promise<T>;
}
export async function createPixPayment(input: {
  orderId: string;
  amountCents: number;
  payerEmail: string;
  idempotencyKey: string;
}): Promise<MercadoPagoPixCreated> {
  if (!/^[0-9a-f-]{36}$/i.test(input.orderId)) throw new Error('Invalid order ID');
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0)
    throw new Error('Invalid amount');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.payerEmail)) throw new Error('Invalid payer email');
  if (!/^[0-9a-f-]{36}$/i.test(input.idempotencyKey)) throw new Error('Invalid idempotency key');
  return mpRequest<MercadoPagoPixCreated>('/v1/payments', {
    method: 'POST',
    headers: { 'X-Idempotency-Key': input.idempotencyKey },
    body: JSON.stringify({
      transaction_amount: input.amountCents / 100,
      description: 'Pedido Absoluto Glamour',
      payment_method_id: 'pix',
      external_reference: input.orderId,
      payer: { email: input.payerEmail },
    }),
  });
}
export async function fetchPixPayment(paymentId: string): Promise<MercadoPagoPixStatus> {
  if (!/^\d{1,24}$/.test(paymentId)) throw new Error('Invalid payment ID');
  return mpRequest<MercadoPagoPixStatus>(`/v1/payments/${paymentId}`);
}
export function verifyPixSettlement(
  stored: { orderId: string; amountCents: number; paymentId: number },
  remote: MercadoPagoPixStatus,
): boolean {
  return remote.id === stored.paymentId
    && remote.status === 'approved'
    && remote.payment_method_id === 'pix'
    && remote.external_reference === stored.orderId
    && (!remote.currency_id || remote.currency_id === 'BRL')
    && Number.isSafeInteger(remote.transaction_amount * 100)
    && Math.round(remote.transaction_amount * 100) === stored.amountCents;
}
