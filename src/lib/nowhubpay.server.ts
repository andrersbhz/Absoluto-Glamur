/**
 * Cliente server-only da NowHubPay (somente PIX).
 * Auth: POST /v1/auth/login { client_id, client_secret } -> Bearer JWT (expira em ~1h).
 */
export type NowHubConfig = { clientId: string; clientSecret: string };

export const NOWHUB_BASE_URL = "https://api.nowhubpay.com";

const tokenCache = new Map<string, { token: string; exp: number }>();

async function parse(res: Response) {
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    body = { raw: text.slice(0, 300) };
  }
  if (!res.ok) {
    const msg = (body.detail ?? body.title ?? body.message ?? `HTTP ${res.status}`) as string;
    throw new Error(`NowHubPay: ${msg}`);
  }
  return body;
}

export async function nowhubToken(cfg: NowHubConfig, force = false): Promise<string> {
  const key = cfg.clientId;
  const cached = tokenCache.get(key);
  if (!force && cached && cached.exp > Date.now() + 60_000) return cached.token;
  const res = await fetch(`${NOWHUB_BASE_URL}/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_id: cfg.clientId.trim(), client_secret: cfg.clientSecret.trim() }),
  });
  const body = await parse(res);
  const token = String(body.access_token ?? "");
  if (!token) throw new Error("NowHubPay: token não retornado");
  const ttl = Number(body.expires_in ?? 3600) * 1000;
  tokenCache.set(key, { token, exp: Date.now() + ttl });
  return token;
}

export async function nowhubFetch<T = Record<string, unknown>>(
  cfg: NowHubConfig,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const call = async (token: string) =>
    fetch(NOWHUB_BASE_URL + path, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
    });
  let res = await call(await nowhubToken(cfg));
  if (res.status === 401) res = await call(await nowhubToken(cfg, true));
  return (await parse(res)) as T;
}

export function isNowHubPaid(status: string | null | undefined) {
  return ["COMPLETED", "PAID", "APPROVED"].includes(String(status ?? "").toUpperCase());
}
