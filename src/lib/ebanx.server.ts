/**
 * Helper server-only para a API do EBANX (Direct API / ws).
 * Credenciais em Admin → Integrações (api_key = Integration Key).
 * Docs: https://developers.ebanxpagamentos.com/api-reference/
 */

export type EbanxEnv = "sandbox" | "production";

export type EbanxConfig = {
  integrationKey: string;
  env: EbanxEnv;
};

export function ebanxBaseUrl(env: EbanxEnv) {
  return env === "production"
    ? "https://api.ebanx.com.br"
    : "https://sandbox.ebanxpay.com";
}

type EbanxResponse = {
  status?: string;
  status_code?: string;
  status_message?: string;
  redirect_url?: string;
  payment?: {
    hash?: string;
    status?: string;
    boleto_url?: string;
    boleto_barcode?: string;
    due_date?: string;
    merchant_payment_code?: string;
    amount_br?: number;
  };
};

async function ebanxPost(cfg: EbanxConfig, path: string, payload: unknown): Promise<EbanxResponse> {
  const res = await fetch(ebanxBaseUrl(cfg.env) + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  const body = (text ? JSON.parse(text) : {}) as EbanxResponse;
  if (!res.ok || body.status === "ERROR") {
    throw new Error(body.status_message ?? `EBANX ${res.status}`);
  }
  return body;
}

export type EbanxPaymentType = "creditcard" | "boleto";

/**
 * Cria um pagamento no EBANX.
 * - boleto: retorna a URL do boleto.
 * - creditcard: usa o fluxo hospedado (redirect) quando não há token de cartão.
 */
export async function createEbanxPayment(
  cfg: EbanxConfig,
  input: {
    merchantPaymentCode: string;
    amountCents: number;
    currency: string;
    countryCode: string;
    paymentType: EbanxPaymentType;
    customer: { name: string; email: string; document: string; phone: string };
    address: {
      street: string;
      number: string;
      complement?: string | null;
      district: string;
      city: string;
      state: string;
      zipCode: string;
    };
    returnUrl: string;
  },
) {
  const payload = {
    integration_key: cfg.integrationKey,
    operation: "request",
    mode: "full",
    payment: {
      merchant_payment_code: input.merchantPaymentCode,
      amount_total: Number((input.amountCents / 100).toFixed(2)),
      currency_code: input.currency,
      name: input.customer.name,
      email: input.customer.email,
      document: input.customer.document,
      phone_number: input.customer.phone,
      country: input.countryCode.toLowerCase(),
      payment_type_code: input.paymentType,
      address: input.address.street,
      street_number: input.address.number,
      street_complement: input.address.complement ?? "",
      city: input.address.city,
      state: input.address.state,
      zipcode: input.address.zipCode,
      ...(input.paymentType === "creditcard"
        ? { creditcard: { auto_capture: true } }
        : {}),
    },
    redirect_url: input.returnUrl,
  };

  const body = await ebanxPost(cfg, "/ws/direct", payload);
  return {
    hash: body.payment?.hash ?? "",
    status: body.payment?.status ?? "PE",
    boletoUrl: body.payment?.boleto_url ?? null,
    redirectUrl: body.redirect_url ?? body.payment?.boleto_url ?? null,
    raw: body,
  };
}

/** Consulta um pagamento pelo hash (usado pelo webhook, que só envia identificadores). */
export async function queryEbanxPayment(cfg: EbanxConfig, hash: string) {
  const url = `${ebanxBaseUrl(cfg.env)}/ws/query?integration_key=${encodeURIComponent(
    cfg.integrationKey,
  )}&hash=${encodeURIComponent(hash)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  const text = await res.text();
  const body = (text ? JSON.parse(text) : {}) as EbanxResponse;
  if (!res.ok || body.status === "ERROR") {
    throw new Error(body.status_message ?? `EBANX query ${res.status}`);
  }
  return body;
}

/** Mapeia o status do EBANX para o status interno de pagamento. */
export function mapEbanxStatus(status: string | undefined): {
  payment: "pending" | "confirmed" | "cancelled" | "refunded" | "failed";
  order?: "paid" | "cancelled" | "refunded" | "failed";
  paid?: boolean;
} {
  switch ((status ?? "").toUpperCase()) {
    case "CO":
      return { payment: "confirmed", order: "paid", paid: true };
    case "CA":
      return { payment: "cancelled", order: "cancelled" };
    case "RE":
      return { payment: "refunded", order: "refunded" };
    default:
      return { payment: "pending" };
  }
}
