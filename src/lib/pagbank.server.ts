/**
 * Helper server-only para chamar a API do PagBank (PagSeguro).
 * Docs: https://developer.pagbank.com.br/reference/criar-checkout
 *
 * Auth: Bearer token (gerado em PagBank → Aplicações → Integrações).
 * O mesmo token vale para PIX, cartão e boleto via /checkouts (hosted checkout).
 */

export type PagBankEnv = "sandbox" | "production";

export type PagBankConfig = {
  token: string;
  env: PagBankEnv;
};

export function pagbankBaseUrl(env: PagBankEnv) {
  return env === "production"
    ? "https://api.pagseguro.com"
    : "https://sandbox.api.pagseguro.com";
}

export async function pagbankFetch<T = unknown>(
  config: PagBankConfig,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(pagbankBaseUrl(config.env) + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "absoluto-glamur-checkout/1.0",
      "x-api-version": "4.0",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  const body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) {
    const errorMessages = (body as { error_messages?: { description?: string; parameter_name?: string }[] })
      .error_messages;
    const msg =
      errorMessages?.[0]?.description ??
      (body as { message?: string }).message ??
      (body as { error?: string }).error ??
      `PagBank ${res.status}`;
    throw new Error(`PagBank: ${msg}`);
  }
  return body as T;
}

export type PagBankCheckoutMethod = "pix" | "credit_card" | "boleto";

/**
 * Mapeia status PagBank → status interno.
 * Referência: docs de Notificações — https://developer.pagbank.com.br/reference/notificacoes
 */
export const PAGBANK_STATUS_MAP: Record<
  string,
  { payment: string; order?: string; paidAt?: boolean }
> = {
  AUTHORIZED: { payment: "confirmed", order: "paid", paidAt: true },
  PAID: { payment: "received", order: "paid", paidAt: true },
  IN_ANALYSIS: { payment: "pending" },
  WAITING: { payment: "pending" },
  PROCESSING: { payment: "pending" },
  DECLINED: { payment: "failed", order: "failed" },
  CANCELED: { payment: "cancelled", order: "cancelled" },
  CANCELLED: { payment: "cancelled", order: "cancelled" },
  REFUNDED: { payment: "refunded", order: "refunded" },
};

/** Métodos internos → strings aceitas em payment_methods[].type */
export function pagbankMethodType(method: PagBankCheckoutMethod): string {
  return method === "pix" ? "PIX" : method === "boleto" ? "BOLETO" : "CREDIT_CARD";
}
