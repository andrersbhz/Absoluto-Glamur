import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

type BrowserReviewBridgePayload = {
  v: 1;
  pid: string;
  sid: string;
  uid: string;
  ori: string;
  iat: number;
  exp: number;
  nonce: string;
};

function readEnv(name: string): string | undefined {
  const value = typeof process !== "undefined" ? process.env?.[name] : undefined;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readNamedSupabaseSecret(): string | undefined {
  const raw = readEnv("SUPABASE_SECRET_KEYS");
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const preferred = parsed.default;
    if (typeof preferred === "string" && preferred.trim()) return preferred.trim();
    const first = Object.values(parsed).find((value) => typeof value === "string" && value.trim());
    return typeof first === "string" ? first.trim() : undefined;
  } catch {
    return undefined;
  }
}

function bridgeSecret(): string {
  const secret =
    readEnv("AG_BROWSER_REVIEW_SECRET") ||
    readEnv("SUPABASE_SECRET_KEY") ||
    readNamedSupabaseSecret() ||
    readEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret) {
    throw new Error(
      "Segredo do importador pelo navegador não está configurado no servidor. Configure AG_BROWSER_REVIEW_SECRET ou a chave secreta do Supabase.",
    );
  }
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", bridgeSecret()).update(payload).digest("base64url");
}

export function createAliExpressBrowserReviewBridge(input: {
  productId: string;
  sourceProductId: string;
  userId: string;
  origin: string;
  ttlSeconds?: number;
}) {
  const now = Math.floor(Date.now() / 1000);
  const ttl = Math.max(120, Math.min(30 * 60, input.ttlSeconds ?? 10 * 60));
  const payload: BrowserReviewBridgePayload = {
    v: 1,
    pid: input.productId,
    sid: input.sourceProductId,
    uid: input.userId,
    ori: new URL(input.origin).origin,
    iat: now,
    exp: now + ttl,
    nonce: randomBytes(16).toString("base64url"),
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return {
    code: `AG1.${encoded}.${sign(encoded)}`,
    payload,
  };
}

export function verifyAliExpressBrowserReviewBridge(code: string): BrowserReviewBridgePayload {
  const [prefix, encoded, receivedSignature] = String(code ?? "").trim().split(".");
  if (prefix !== "AG1" || !encoded || !receivedSignature) {
    throw new Error("Código de importação inválido.");
  }

  const expectedSignature = sign(encoded);
  const expected = Buffer.from(expectedSignature, "utf8");
  const received = Buffer.from(receivedSignature, "utf8");
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    throw new Error("Assinatura do código de importação inválida.");
  }

  let payload: BrowserReviewBridgePayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as BrowserReviewBridgePayload;
  } catch {
    throw new Error("Código de importação corrompido.");
  }

  if (payload.v !== 1) throw new Error("Versão do código de importação não suportada.");
  if (!/^[0-9a-f-]{36}$/i.test(payload.pid)) throw new Error("Produto de destino inválido no código.");
  if (!/^\d{5,}$/.test(payload.sid)) throw new Error("Produto AliExpress inválido no código.");
  if (!payload.uid) throw new Error("Administrador ausente no código de importação.");
  const origin = new URL(payload.ori);
  if (!/^https?:$/.test(origin.protocol)) throw new Error("Origem inválida no código de importação.");
  if (!Number.isFinite(payload.exp) || Math.floor(Date.now() / 1000) > payload.exp) {
    throw new Error("O código de importação expirou. Gere um novo código no painel.");
  }

  return { ...payload, ori: origin.origin };
}
