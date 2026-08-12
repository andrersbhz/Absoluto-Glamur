/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Cliente para APIs públicas do protocolo TOP clássico.
 *
 * Algumas APIs do AliExpress (como product.evaluation.query) continuam
 * documentadas no gateway /router/rest e NÃO usam OAuth/session. Não devem ser
 * chamadas pelo gateway moderno /sync usado pelas APIs DS.
 */

function topTimestampGmt8(): string {
  const shifted = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 19).replace("T", " ");
}

async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await globalThis.crypto.subtle.sign("HMAC", key, enc.encode(data));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

async function signTop(params: Record<string, string>, secret: string): Promise<string> {
  const base = Object.keys(params)
    .sort()
    .map((key) => `${key}${params[key]}`)
    .join("");
  return hmacSha256Hex(secret, base);
}

async function loadAliTopCredentials() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("integrations")
    .select("config, api_key, webhook_token")
    .eq("provider", "aliexpress")
    .maybeSingle();
  if (error) throw new Error(`Não foi possível ler a integração AliExpress: ${error.message}`);

  const cfg = (data?.config ?? {}) as Record<string, unknown>;
  const appKey = String(data?.api_key ?? cfg.app_key ?? "").trim();
  const appSecret = String(data?.webhook_token ?? cfg.app_secret ?? "").trim();
  const legacySecret = String(cfg.app_secret ?? "").trim();
  const fallbackSecret = legacySecret && legacySecret !== appSecret ? legacySecret : null;

  if (!appKey || !appSecret) {
    throw new Error("Configure App Key e App Secret do AliExpress em Integrações antes de sincronizar avaliações.");
  }

  return { appKey, appSecret, fallbackSecret };
}

function readPlatformError(json: any): string | null {
  const error = json?.error_response;
  if (!error) return null;
  const code = [error.code, error.sub_code].filter(Boolean).join("/");
  const detail = error.sub_msg ?? error.msg ?? "erro desconhecido";
  const requestId = error.request_id ? ` (request_id: ${error.request_id})` : "";
  return `AliExpress TOP ${code || "erro"}: ${detail}${requestId}`;
}

function responseKey(method: string): string {
  return `${method.replace(/\./g, "_")}_response`;
}

function readBusinessError(method: string, json: any): string | null {
  const root = json?.[responseKey(method)] ?? json;
  const result = root?.result;
  const success = result?.success;
  if (success === false || success === "false") {
    const code = result?.error_code ? ` ${result.error_code}` : "";
    const message = result?.error_message ?? "Falha retornada pela API.";
    return `AliExpress${code}: ${message}`;
  }
  return null;
}

async function requestTop(
  endpoint: string,
  method: string,
  appKey: string,
  appSecret: string,
  bizParams: Record<string, string | number | boolean | undefined | null>,
) {
  const params: Record<string, string> = {
    method,
    app_key: appKey,
    format: "json",
    v: "2.0",
    sign_method: "hmac-sha256",
    timestamp: topTimestampGmt8(),
  };

  for (const [key, value] of Object.entries(bizParams)) {
    if (value === undefined || value === null || value === "") continue;
    params[key] = String(value);
  }

  params.sign = await signTop(params, appSecret);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
      Accept: "application/json",
    },
    body: new URLSearchParams(params).toString(),
    redirect: "follow",
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`AliExpress TOP HTTP ${response.status}: ${text.slice(0, 240)}`);

  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`AliExpress TOP retornou resposta inválida: ${text.slice(0, 240)}`);
  }
  return json;
}

function looksLikeSignatureError(json: any): boolean {
  const error = json?.error_response;
  const material = `${error?.code ?? ""} ${error?.sub_code ?? ""} ${error?.msg ?? ""} ${error?.sub_msg ?? ""}`;
  return /sign|signature|InvalidSignature|IncompleteSignature/i.test(material);
}

export async function callAliTopPublic<T = any>(
  method: string,
  bizParams: Record<string, string | number | boolean | undefined | null>,
): Promise<T> {
  const { appKey, appSecret, fallbackSecret } = await loadAliTopCredentials();
  const endpoints = [
    "https://api.taobao.com/router/rest",
    "https://eco.taobao.com/router/rest",
  ];

  let lastError: Error | null = null;
  for (const endpoint of endpoints) {
    try {
      let json = await requestTop(endpoint, method, appKey, appSecret, bizParams);
      if (fallbackSecret && looksLikeSignatureError(json)) {
        json = await requestTop(endpoint, method, appKey, fallbackSecret, bizParams);
      }

      const platformError = readPlatformError(json);
      if (platformError) throw new Error(platformError);
      const businessError = readBusinessError(method, json);
      if (businessError) throw new Error(businessError);
      return json as T;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError ?? new Error("Não foi possível consultar a API pública TOP do AliExpress.");
}
