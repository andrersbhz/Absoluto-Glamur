/**
 * Helper server-only para chamar a API do NuPay Business (Nubank).
 * Docs: https://docs.nupaybusiness.com.br/checkout/docs/openapi/index.html
 */

export type NuPayEnv = "sandbox" | "production";

export type NuPayConfig = {
  merchantKey: string;
  merchantToken: string;
  env: NuPayEnv;
};

export function nupayBaseUrl(env: NuPayEnv) {
  return env === "production"
    ? "https://api.nupaybusiness.com.br"
    : "https://sandbox.api.nupaybusiness.com.br";
}

export async function nupayFetch<T = unknown>(
  config: NuPayConfig,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(nupayBaseUrl(config.env) + path, {
    ...init,
    headers: {
      "X-Merchant-Key": config.merchantKey,
      "X-Merchant-Token": config.merchantToken,
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "absoluto-glamur-checkout/1.0",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  const body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) {
    const msg =
      (body as { message?: string; error?: string; error_description?: string }).message ??
      (body as { error_description?: string }).error_description ??
      (body as { error?: string }).error ??
      `NuPay ${res.status}`;
    throw new Error(`NuPay: ${msg}`);
  }
  return body as T;
}

export type NuPaySession = {
  id: string;
  status: string;
  redirect_url?: string;
  redirectUrl?: string;
  qrCode?: string;
  amount?: number;
};

/**
 * Mapeia o status NuPay -> status interno de pagamento/pedido.
 */
export const NUPAY_STATUS_MAP: Record<
  string,
  { payment: string; order?: string; paidAt?: boolean }
> = {
  CREATED: { payment: "pending" },
  PENDING: { payment: "pending" },
  AUTHORIZED: { payment: "confirmed", order: "paid", paidAt: true },
  APPROVED: { payment: "confirmed", order: "paid", paidAt: true },
  COMPLETED: { payment: "received", order: "paid", paidAt: true },
  PAID: { payment: "received", order: "paid", paidAt: true },
  DECLINED: { payment: "failed", order: "failed" },
  FAILED: { payment: "failed", order: "failed" },
  CANCELLED: { payment: "cancelled", order: "cancelled" },
  CANCELED: { payment: "cancelled", order: "cancelled" },
  EXPIRED: { payment: "cancelled", order: "cancelled" },
  REFUNDED: { payment: "refunded", order: "refunded" },
};
