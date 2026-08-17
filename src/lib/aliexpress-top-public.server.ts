/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Cliente para APIs públicas do protocolo TOP clássico.
 *
 * `aliexpress.social.product.evaluation.query` é uma API TOP pública (sem session)
 * e a documentação específica aceita `sign_method=md5` ou `sign_method=hmac`.
 * Usamos MD5 aqui por compatibilidade com o endpoint legado /router/rest.
 *
 * As credenciais TOP de avaliações ficam isoladas no provider
 * `aliexpress_top_reviews`. A integração principal `aliexpress` permanece como
 * fallback por compatibilidade com instalações anteriores.
 */

const TOP_HTTPS_ENDPOINT = "https://eco.taobao.com/router/rest";
const TOP_REVIEWS_PROVIDER = "aliexpress_top_reviews";

function topTimestampGmt8(): string {
  const shifted = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 19).replace("T", " ");
}

function leftRotate(value: number, amount: number): number {
  return ((value << amount) | (value >>> (32 - amount))) >>> 0;
}

/** MD5 UTF-8 sem dependência Node, compatível com runtimes edge. */
function md5Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const withMarker = bytes.length + 1;
  const padding = (56 - (withMarker % 64) + 64) % 64;
  const totalLength = withMarker + padding + 8;
  const buffer = new Uint8Array(totalLength);
  buffer.set(bytes);
  buffer[bytes.length] = 0x80;

  const view = new DataView(buffer.buffer);
  const bitLength = bytes.length * 8;
  view.setUint32(totalLength - 8, bitLength >>> 0, true);
  view.setUint32(totalLength - 4, Math.floor(bitLength / 0x100000000) >>> 0, true);

  const shifts = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];
  const constants = Array.from({ length: 64 }, (_, i) =>
    Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0,
  );

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  for (let offset = 0; offset < buffer.length; offset += 64) {
    const words = Array.from({ length: 16 }, (_, i) => view.getUint32(offset + i * 4, true));
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;

    for (let i = 0; i < 64; i += 1) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }

      const nextD = c;
      const nextC = b;
      const mixed = (a + (f >>> 0) + constants[i] + words[g]) >>> 0;
      const nextB = (b + leftRotate(mixed, shifts[i])) >>> 0;
      a = d;
      d = nextD;
      c = nextC;
      b = nextB;
    }

    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  return [a0, b0, c0, d0]
    .flatMap((word) => [0, 8, 16, 24].map((shift) => ((word >>> shift) & 0xff).toString(16).padStart(2, "0")))
    .join("")
    .toUpperCase();
}

function signTopMd5(params: Record<string, string>, secret: string): string {
  const base = Object.keys(params)
    .sort()
    .map((key) => `${key}${params[key]}`)
    .join("");
  return md5Hex(`${secret}${base}${secret}`);
}

async function readCredentialRow(client: any, provider: string) {
  const { data, error } = await client
    .from("integrations")
    .select("config, api_key, webhook_token, enabled")
    .eq("provider", provider)
    .maybeSingle();
  if (error) throw new Error(`Não foi possível ler a integração ${provider}: ${error.message}`);
  return data;
}

async function loadAliTopCredentials(credentialClient?: any) {
  let client = credentialClient;
  if (!client) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    client = supabaseAdmin;
  }

  const dedicated = await readCredentialRow(client, TOP_REVIEWS_PROVIDER);
  const dedicatedKey = String(dedicated?.api_key ?? "").trim();
  const dedicatedSecret = String(dedicated?.webhook_token ?? "").trim();

  if (dedicatedKey || dedicatedSecret) {
    if (!dedicatedKey || !dedicatedSecret) {
      throw new Error(
        "Complete App Key TOP e App Secret TOP em Admin → AliExpress TOP · Avaliações antes de sincronizar.",
      );
    }
    return { appKey: dedicatedKey, secrets: [dedicatedSecret], dedicated: true };
  }

  // Compatibilidade com instalações antigas: tenta o par principal. Se o gateway TOP
  // rejeitar a App Key, a mensagem orienta a configurar o par TOP dedicado sem alterar
  // importação, estoque, OAuth ou fulfillment.
  const primary = await readCredentialRow(client, "aliexpress");
  const cfg = (primary?.config ?? {}) as Record<string, unknown>;
  const appKey = String(primary?.api_key ?? cfg.app_key ?? "").trim();
  const primarySecret = String(primary?.webhook_token ?? "").trim();
  const configSecret = String(cfg.app_secret ?? "").trim();
  const secrets = [...new Set([primarySecret, configSecret].filter(Boolean))];

  if (!appKey || secrets.length === 0) {
    throw new Error(
      "Configure as credenciais do AliExpress ou o par TOP dedicado em Admin → AliExpress TOP · Avaliações antes de sincronizar.",
    );
  }

  return { appKey, secrets, dedicated: false };
}

function responseKey(method: string): string {
  return `${method.replace(/\./g, "_")}_response`;
}

function getPlatformError(json: any): { code: string; detail: string; requestId: string | null } | null {
  const error = json?.error_response;
  if (!error) return null;
  const code = [error.code, error.sub_code].filter(Boolean).join("/");
  const detail = String(error.sub_msg ?? error.msg ?? "erro desconhecido");
  return {
    code: code || "erro",
    detail,
    requestId: error.request_id ? String(error.request_id) : null,
  };
}

function formatPlatformError(error: { code: string; detail: string; requestId: string | null }): string {
  const requestId = error.requestId ? ` (request_id: ${error.requestId})` : "";
  return `AliExpress TOP ${error.code}: ${error.detail}${requestId}`;
}

function isInvalidTopAppKey(error: { code: string; detail: string }): boolean {
  return (
    error.code.startsWith("29") ||
    /appkey-not-exists|appkey does not exist|invalid app\s*key|invalid appkey/i.test(`${error.code} ${error.detail}`)
  );
}

function invalidTopAppKeyMessage(dedicated: boolean): string {
  return dedicated
    ? "A App Key TOP salva para avaliações não é reconhecida pelo gateway TOP. Confira App Key TOP, App Secret TOP e o ambiente da aplicação no console Alibaba/TOP."
    : "A App Key principal do AliExpress não é reconhecida pelo gateway TOP usado para avaliações. Configure a credencial específica em Admin → AliExpress TOP · Avaliações. A integração principal de importação e estoque permanece intacta.";
}

function readBusinessError(method: string, json: any): string | null {
  const root = json?.[responseKey(method)] ?? json;
  const envelope = root?.result;
  const success = envelope?.success;
  if (success === false || success === "false") {
    const code = envelope?.error_code ? ` ${envelope.error_code}` : "";
    const message = envelope?.error_message ?? "Falha retornada pela API.";
    return `AliExpress${code}: ${message}`;
  }
  if (!envelope?.result && envelope?.error_code) {
    return `AliExpress ${envelope.error_code}: ${envelope.error_message ?? "Falha retornada pela API."}`;
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
    sign_method: "md5",
    timestamp: topTimestampGmt8(),
  };

  for (const [key, value] of Object.entries(bizParams)) {
    if (value === undefined || value === null || value === "") continue;
    params[key] = String(value);
  }

  params.sign = signTopMd5(params, appSecret);
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

export async function callAliTopPublic<T = any>(
  method: string,
  bizParams: Record<string, string | number | boolean | undefined | null>,
  credentialClient?: any,
): Promise<T> {
  const { appKey, secrets, dedicated } = await loadAliTopCredentials(credentialClient);
  const failures: string[] = [];

  // A documentação deste método publica eco.taobao.com como endpoint HTTPS de
  // produção. Não repetimos a mesma requisição em hosts não documentados.
  for (const secret of secrets) {
    try {
      const json = await requestTop(TOP_HTTPS_ENDPOINT, method, appKey, secret, bizParams);
      const platformError = getPlatformError(json);
      if (platformError) {
        // App Key inválida é determinística: trocar secret ou repetir endpoint não resolve
        // e só poluía a tela com a mesma mensagem várias vezes.
        if (isInvalidTopAppKey(platformError)) throw new Error(invalidTopAppKeyMessage(dedicated));
        throw new Error(formatPlatformError(platformError));
      }
      const businessError = readBusinessError(method, json);
      if (businessError) throw new Error(businessError);
      return json as T;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/App Key TOP|App Key principal do AliExpress/i.test(message)) throw new Error(message);
      failures.push(message);
    }
  }

  const unique = [...new Set(failures)].filter(Boolean);
  throw new Error(unique.slice(0, 2).join(" | ") || "Não foi possível consultar a API TOP oficial do AliExpress.");
}
