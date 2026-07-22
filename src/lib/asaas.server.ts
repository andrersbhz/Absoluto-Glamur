/**
 * Helper server-only para chamar a API do Asaas.
 * Nunca importar em código do cliente (extensão .server.ts bloqueia).
 */

export type AsaasEnv = "sandbox" | "production";
export type AsaasConfig = { apiKey: string; env: AsaasEnv };

export function asaasBaseUrl(env: AsaasEnv) {
  return env === "production"
    ? "https://api.asaas.com/v3"
    : "https://api-sandbox.asaas.com/v3";
}

export async function asaasFetch<T = unknown>(
  config: AsaasConfig,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(asaasBaseUrl(config.env) + path, {
    ...init,
    headers: {
      access_token: config.apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "absoluto-glamur-checkout/1.0",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  const body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) {
    const errors = (body as { errors?: { description?: string }[] }).errors;
    const msg =
      errors?.[0]?.description ??
      (body as { message?: string }).message ??
      `Asaas ${res.status}`;
    throw new Error(`Asaas: ${msg}`);
  }
  return body as T;
}

export type AsaasCustomer = { id: string; name: string; email: string };
export type AsaasCharge = {
  id: string;
  status: string;
  value: number;
  invoiceUrl?: string;
  dueDate?: string;
};
export type AsaasPix = {
  encodedImage: string;
  payload: string;
  expirationDate?: string;
};
