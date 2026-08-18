/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Cliente para a API pública TOP de avaliações do AliExpress.
 *
 * A consulta TOP continua sendo a primeira fonte quando existe uma App Key aceita
 * pelo gateway. Quando ela não está disponível, o fluxo degrada para fontes públicas
 * e, por último, para coleta renderizada SOMENTE com Firecrawl direto configurado.
 * Chaves `lovc_`/gateway Lovable são deliberadamente ignoradas para este fallback.
 */

const TOP_HTTPS_ENDPOINTS = [
  "https://api.taobao.com/router/rest",
  "https://gw.api.taobao.com/router/rest",
  "https://eco.taobao.com/router/rest",
] as const;
const TOP_REVIEWS_PROVIDER = "aliexpress_top_reviews";
const PUBLIC_REVIEW_METHOD = "aliexpress.social.product.evaluation.query";
const PUBLIC_REVIEW_CACHE_TTL_MS = 5 * 60 * 1000;

type PublicReviewCacheEntry = {
  expiresAt: number;
  productId: string;
  reviews: Array<{
    source_review_id: string;
    author_name: string | null;
    author_country: string | null;
    rating: number;
    body: string | null;
    images: string[];
    reviewed_at: string | null;
  }>;
  diagnostics: string[];
};

type TopCredentialCandidate = {
  appKey: string;
  secrets: string[];
  source: "dedicated" | "primary";
};

const publicReviewCache = new Map<string, PublicReviewCacheEntry>();

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

async function loadAliTopCredentialCandidates(credentialClient?: any): Promise<TopCredentialCandidate[]> {
  let client = credentialClient;
  if (!client) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    client = supabaseAdmin;
  }

  const candidates: TopCredentialCandidate[] = [];

  // Credencial dedicada legada. Ela pode funcionar, mas nunca bloqueia as fontes
  // seguintes se o gateway informar que a App Key não existe.
  const dedicated = await readCredentialRow(client, TOP_REVIEWS_PROVIDER);
  const dedicatedKey = String(dedicated?.api_key ?? "").trim();
  const dedicatedSecret = String(dedicated?.webhook_token ?? "").trim();
  if (dedicated?.enabled !== false && dedicatedKey && dedicatedSecret) {
    candidates.push({ appKey: dedicatedKey, secrets: [dedicatedSecret], source: "dedicated" });
  }

  // Mantém compatibilidade com instalações em que a mesma aplicação principal é
  // também reconhecida pelo gateway TOP clássico.
  const primary = await readCredentialRow(client, "aliexpress");
  const cfg = (primary?.config ?? {}) as Record<string, unknown>;
  const appKey = String(primary?.api_key ?? cfg.app_key ?? "").trim();
  const primarySecret = String(primary?.webhook_token ?? "").trim();
  const configSecret = String(cfg.app_secret ?? "").trim();
  const secrets = [...new Set([primarySecret, configSecret].filter(Boolean))];
  if (appKey && secrets.length > 0) {
    candidates.push({ appKey, secrets, source: "primary" });
  }

  const deduped: TopCredentialCandidate[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const usableSecrets = candidate.secrets.filter((secret) => {
      const key = `${candidate.appKey}\u241f${secret}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (usableSecrets.length) deduped.push({ ...candidate, secrets: usableSecrets });
  }

  if (!deduped.length) {
    throw new Error("nenhuma credencial TOP utilizável; seguindo para fallbacks");
  }
  return deduped;
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

function publicFallbackProductId(method: string, bizParams: Record<string, unknown>): string | null {
  if (method !== PUBLIC_REVIEW_METHOD) return null;
  const raw = String(bizParams.product_id ?? "").trim();
  return /^\d{5,}$/.test(raw) ? raw : null;
}

function syntheticTopReviewResponse(entry: PublicReviewCacheEntry, bizParams: Record<string, unknown>) {
  const page = Math.max(1, Number(bizParams.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(bizParams.page_size) || 20));
  const from = (page - 1) * pageSize;
  const rows = entry.reviews.slice(from, from + pageSize).map((review) => ({
    feedback_id: review.source_review_id,
    buyer_blured_name: review.author_name,
    buyer_country_code: review.author_country,
    evaluation: review.rating,
    feedback: review.body,
    feedback_epoch_date: review.reviewed_at
      ? Math.floor(new Date(review.reviewed_at).getTime() / 1000)
      : null,
    image_urls: review.images,
  }));

  return {
    aliexpress_social_product_evaluation_query_response: {
      result: {
        success: true,
        result: {
          evaluations: { buyer_evaluation: rows },
          total_number: entry.reviews.length,
        },
      },
    },
  };
}

function cachedPublicFallback(method: string, bizParams: Record<string, unknown>) {
  const productId = publicFallbackProductId(method, bizParams);
  if (!productId) return null;
  const cached = publicReviewCache.get(productId);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    publicReviewCache.delete(productId);
    return null;
  }
  if (!cached.reviews.length) return null;
  return syntheticTopReviewResponse(cached, bizParams);
}

async function tryPublicReviewFallback(
  method: string,
  bizParams: Record<string, unknown>,
  credentialClient?: any,
) {
  const productId = publicFallbackProductId(method, bizParams);
  if (!productId) return { json: null as any, diagnostic: null as string | null };

  const cached = publicReviewCache.get(productId);
  if (cached && cached.expiresAt > Date.now()) {
    return {
      json: cached.reviews.length ? syntheticTopReviewResponse(cached, bizParams) : null,
      diagnostic: cached.diagnostics.join(" | ") || null,
    };
  }

  try {
    const { fetchAliExpressPublicReviews } = await import("./aliexpress-public-reviews.server");
    const basic = await fetchAliExpressPublicReviews(productId);
    let reviews = basic.reviews;
    const diagnostics = [...basic.diagnostics];

    // Segunda camada: resolve ownerMemberId pela Open Platform e usa as formas de
    // feedback que dependem dele. Se ainda vier vazio, pode usar Firecrawl DIRETO,
    // nunca o connector-gateway/Lovable.
    if (!reviews.length) {
      try {
        const { fetchAliExpressExtendedReviews } = await import("./aliexpress-review-fallbacks.server");
        const extended = await fetchAliExpressExtendedReviews(productId, credentialClient);
        reviews = extended.reviews;
        diagnostics.push(...extended.diagnostics);
      } catch (error) {
        diagnostics.push(`fallback estendido: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const entry: PublicReviewCacheEntry = {
      expiresAt: Date.now() + PUBLIC_REVIEW_CACHE_TTL_MS,
      productId: basic.productId,
      reviews,
      diagnostics,
    };
    publicReviewCache.set(productId, entry);
    return {
      json: entry.reviews.length ? syntheticTopReviewResponse(entry, bizParams) : null,
      diagnostic: entry.diagnostics.join(" | ") || "nenhuma fonte pública expôs comentários",
    };
  } catch (error) {
    return {
      json: null,
      diagnostic: `fallback público: ${error instanceof Error ? error.message : String(error)}`.slice(0, 900),
    };
  }
}

export async function callAliTopPublic<T = any>(
  method: string,
  bizParams: Record<string, string | number | boolean | undefined | null>,
  credentialClient?: any,
): Promise<T> {
  const cached = cachedPublicFallback(method, bizParams as Record<string, unknown>);
  if (cached) return cached as T;

  const failures: string[] = [];
  let candidates: TopCredentialCandidate[] = [];

  try {
    candidates = await loadAliTopCredentialCandidates(credentialClient);
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }

  for (const candidate of candidates) {
    let invalidForCandidate = 0;
    let candidateAttempts = 0;

    for (const endpoint of TOP_HTTPS_ENDPOINTS) {
      for (const secret of candidate.secrets) {
        candidateAttempts += 1;
        try {
          const json = await requestTop(endpoint, method, candidate.appKey, secret, bizParams);
          const platformError = getPlatformError(json);
          if (platformError) {
            if (isInvalidTopAppKey(platformError)) {
              invalidForCandidate += 1;
              failures.push(`${candidate.source}: ${formatPlatformError(platformError)}`);
              continue;
            }
            failures.push(`${candidate.source}: ${formatPlatformError(platformError)}`);
            continue;
          }
          const businessError = readBusinessError(method, json);
          if (businessError) {
            failures.push(`${candidate.source}: ${businessError}`);
            continue;
          }
          return json as T;
        } catch (error) {
          failures.push(`${candidate.source}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    if (candidateAttempts > 0 && invalidForCandidate === candidateAttempts) {
      failures.push(
        candidate.source === "dedicated"
          ? "credencial TOP legada rejeitada pelo gateway"
          : "App Key principal não reconhecida pelo gateway TOP clássico",
      );
    }
  }

  const publicFallback = await tryPublicReviewFallback(
    method,
    bizParams as Record<string, unknown>,
    credentialClient,
  );
  if (publicFallback.json) return publicFallback.json as T;
  if (publicFallback.diagnostic) failures.push(`fallback: ${publicFallback.diagnostic}`);

  // Mantém request_ids e detalhes de gateway no log do servidor, sem despejar a
  // telemetria técnica inteira no toast vermelho do administrador.
  const unique = [...new Set(failures)].filter(Boolean);
  if (unique.length) console.warn(`[AliExpress reviews] ${unique.join(" | ")}`);

  throw new Error(
    "Nenhuma das fontes disponíveis retornou comentários individuais para este anúncio. Foram tentadas a API TOP quando configurada, a coleta pública, a consulta por ownerMemberId e a coleta renderizada direta quando disponível. As avaliações já salvas permanecem intactas.",
  );
}
