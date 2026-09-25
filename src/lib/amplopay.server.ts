/**
 * Cliente server-only da AmploPay (PIX).
 * Autenticação: Client ID em `x-public-key` e Client Secret em `x-secret-key`.
 */

export type AmploPayConfig = { clientId: string; clientSecret: string };

export const AMPLOPAY_BASE_URL = "https://app.amplopay.com/api/v1";

export async function amplopayFetch<T = Record<string, unknown>>(
  cfg: AmploPayConfig,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(AMPLOPAY_BASE_URL + path, {
    ...init,
    headers: {
      "x-public-key": cfg.clientId,
      "x-secret-key": cfg.clientSecret,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    body = { raw: text.slice(0, 300) };
  }
  if (!res.ok) {
    const details = body.details as { message?: string } | undefined;
    const msg =
      (body.message as string | undefined) ??
      details?.message ??
      (body.error as string | undefined) ??
      `HTTP ${res.status}`;
    throw new Error(`AmploPay: ${msg}`);
  }
  return body as T;
}

/**
 * Extrai dados PIX da resposta de POST /gateway/pix/receive.
 * Formato documentado: { transactionId, status: OK|FAILED|PENDING,
 * transactionStatus: PENDING|COMPLETED|FAILED, webhookToken, fee,
 * order, pix: { code, image, base64, expiresAt } }.
 * Mantém fallbacks para formatos ligeiramente diferentes.
 */
export function parseAmploPayPix(r: Record<string, unknown>) {
  const pix = (r.pix ?? (r.data as Record<string, unknown> | undefined)?.pix ?? r) as Record<
    string,
    unknown
  >;
  const tx = (r.transaction ?? r.data ?? r) as Record<string, unknown>;
  const id = String(r.transactionId ?? tx.id ?? tx.transactionId ?? "");
  const code = (pix.code ?? pix.copyPaste ?? pix.qrcode ?? pix.payload ?? null) as string | null;
  let image = (pix.base64 ?? pix.image ?? pix.qrCodeBase64 ?? null) as string | null;
  if (image && image.startsWith("data:")) image = image.split(",")[1] ?? image;
  const status = String(r.transactionStatus ?? r.status ?? tx.status ?? "PENDING");
  const webhookToken = (r.webhookToken ?? r.token ?? null) as string | null;
  const expiresAt = (pix.expiresAt ?? null) as string | null;
  return { id, code, image, status, webhookToken, expiresAt };
}

export function isAmploPayPaid(status: string | undefined | null) {
  return ["COMPLETED", "PAID", "APPROVED", "CONFIRMED"].includes(String(status ?? "").toUpperCase());
}
