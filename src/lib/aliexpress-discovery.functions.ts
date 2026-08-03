import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
// crypto is loaded lazily via Web Crypto (globalThis.crypto.subtle) so this
// module stays browser-safe — see sign()/signRestPath() below.
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildProductTags,
  computeSalePriceCents,
  stripBrandMentions,
  toParagraphHtml,
  type NormalizedProduct,
} from "./aliexpress-import.functions";

/* eslint-disable @typescript-eslint/no-explicit-any */
async function assertCatalog(context: any) {
  const { data: adm } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
  if (adm) return;
  const { data: hasCat } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "catalog",
  });
  if (!hasCat) throw new Error("Acesso restrito a administradores ou equipe de catálogo");
}

function slugify(v: string): string {
  return v
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 80);
}

// -------------------- AliExpress API signing (SHA256 via HMAC-SHA256) --------------------
// Docs: https://openservice.aliexpress.com/doc/doc.htm — TOP protocol.
// The current AliExpress TOP gateway expects the OAuth token in `session` and
// a Unix timestamp in milliseconds. For /sync, `sign_method` must be the
// protocol value `sha256`; the digest itself is HMAC-SHA256. Business params
// remain flat and are included in the signature with all public params.

async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await globalThis.crypto.subtle.sign("HMAC", key, enc.encode(data));
  const bytes = new Uint8Array(sigBuf);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex.toUpperCase();
}

async function sign(params: Record<string, string>, secret: string): Promise<string> {
  const keys = Object.keys(params).sort();
  // No gateway /sync, APIs nomeadas (ex.: aliexpress.ds.*) não prefixam a
  // base. O nome já participa como valor do parâmetro `method`. Apenas APIs
  // REST cujo identificador contém "/" recebem o caminho como prefixo.
  const base = keys.map((k) => `${k}${params[k]}`).join("");
  return hmacSha256Hex(secret, base);
}

async function loadAliCreds() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("integrations")
    .select("config, api_key, webhook_token, last_status")
    .eq("provider", "aliexpress")
    .maybeSingle();
  const cfg = (data?.config ?? {}) as any;
  // api_key/webhook_token são os campos canônicos editados pelo painel.
  // config.app_* existe apenas para instalações antigas e não pode sobrescrever
  // uma credencial mais nova salva na integração.
  const appKey = String(data?.api_key ?? cfg.app_key ?? "").trim();
  const appSecret = String(data?.webhook_token ?? cfg.app_secret ?? "").trim();
  const accessToken = String(cfg.access_token ?? "").trim();
  const refreshToken = String(cfg.refresh_token ?? "").trim();
  const refreshedAt: string | null = cfg.refreshed_at ?? cfg.authorized_at ?? null;
  const expiresIn: number = Number(cfg.expires_in ?? 0);
  if (!appKey || !appSecret) {
    throw new Error("Configure App Key (API Key) e App Secret (Webhook Token) do AliExpress em /admin/integrations.");
  }
  // Só bloqueia quando o access_token realmente não existe. Flag `reauth_required`
  // pode ficar velha após uma renovação/reautorização; se o token está presente,
  // seguimos e deixamos o refresh automático tratar caso o AliExpress rejeite.
  if (!accessToken) {
    throw new Error("AliExpress precisa ser reautorizado em /admin/integrations (clique em 'Autorizar AliExpress').");
  }
  return { appKey, appSecret, accessToken, refreshToken, refreshedAt, expiresIn };
}

async function signRestPath(apiPath: string, params: Record<string, string>, secret: string): Promise<string> {
  const keys = Object.keys(params).sort();
  const base = apiPath + keys.map((k) => `${k}${params[k]}`).join("");
  return hmacSha256Hex(secret, base);
}

async function refreshAliToken(appKey: string, appSecret: string, refreshToken: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const markInvalid = async (msg: string) => {
    const { data: existing } = await supabaseAdmin
      .from("integrations")
      .select("config")
      .eq("provider", "aliexpress")
      .maybeSingle();
    const prev = (existing?.config ?? {}) as any;
    const nextCfg: any = { ...prev };
    delete nextCfg.access_token;
    delete nextCfg.refresh_token;
    delete nextCfg.expires_in;
    delete nextCfg.refresh_expires_in;
    delete nextCfg.refreshed_at;
    nextCfg.reauth_required = true;
    nextCfg.reauth_required_at = new Date().toISOString();
    await supabaseAdmin
      .from("integrations")
      .update({
        config: nextCfg,
        enabled: false,
        last_status: "error",
        last_error: msg,
        last_verified_at: new Date().toISOString(),
      })
      .eq("provider", "aliexpress");
  };

  if (!refreshToken) {
    const msg = "AliExpress access_token expirado e refresh_token indisponível — reautorize em /admin/integrations.";
    await markInvalid(msg);
    throw new Error(msg);
  }
  const signParams: Record<string, string> = {
    app_key: appKey,
    refresh_token: refreshToken,
    sign_method: "hmac-sha256",
    timestamp: Date.now().toString(),
  };
  const signature = await signRestPath("/auth/token/refresh", signParams, appSecret);
  const body = new URLSearchParams({ ...signParams, sign: signature }).toString();
  const res = await fetch("https://api-sg.aliexpress.com/rest/auth/token/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await res.text();
  let json: any = {};
  try { json = JSON.parse(text); } catch { /* keep */ }
  if (!res.ok || json.error || !json.access_token) {
    const raw = json.error_description ?? json.msg ?? json.message ?? json.error ?? text.slice(0, 300);
    const msg = `Falha ao renovar token AliExpress: ${raw}. Reautorize em /admin/integrations.`;
    if (/invalid|expired|IllegalRefreshToken|InvalidRefreshToken/i.test(String(raw))) {
      await markInvalid(msg);
    } else {
      await supabaseAdmin
        .from("integrations")
        .update({
          last_status: "error",
          last_error: msg,
          last_verified_at: new Date().toISOString(),
        })
        .eq("provider", "aliexpress");
    }
    throw new Error(msg);
  }

  const { data: existing } = await supabaseAdmin
    .from("integrations")
    .select("config")
    .eq("provider", "aliexpress")
    .maybeSingle();
  const prev = (existing?.config ?? {}) as any;
  delete prev.reauth_required;
  delete prev.reauth_required_at;
  await supabaseAdmin
    .from("integrations")
    .update({
      config: {
        ...prev,
        access_token: json.access_token,
        refresh_token: json.refresh_token ?? prev.refresh_token,
        expires_in: json.expires_in,
        refresh_expires_in: json.refresh_expires_in ?? prev.refresh_expires_in,
        refreshed_at: new Date().toISOString(),
      },
      enabled: true,
      last_status: "ok",
      last_error: null,
      last_verified_at: new Date().toISOString(),
    })
    .eq("provider", "aliexpress");
  return json.access_token as string;
}

async function requestAli(
  method: string,
  appKey: string,
  appSecret: string,
  accessToken: string,
  bizParams: Record<string, string | number | boolean | undefined | null>,
) {
  const params: Record<string, string> = {
    method,
    app_key: appKey,
    session: accessToken,
    sign_method: "sha256",
    timestamp: Date.now().toString(),
    simplify: "true",
  };
  for (const [k, v] of Object.entries(bizParams)) {
    if (v === undefined || v === null || v === "") continue;
    params[k] = String(v);
  }
  params.sign = await sign(params, appSecret);
  // O SDK IOP envia chamadas POST comuns com todos os parâmetros assinados
  // na query string e corpo vazio. Enviar somente form-urlencoded no corpo
  // faz o gateway /sync não encontrar `sign`, resultando em IncompleteSignature.
  // O cliente DS oficial também transmite a query ordenada. Embora a ordem
  // não devesse importar em HTTP, o validador TOP compara a forma canônica.
  const query = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
  const res = await fetch(`https://api-sg.aliexpress.com/sync?${query}`, {
    method: "POST",
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Resposta inválida do AliExpress: ${text.slice(0, 300)}`);
  }
}

export async function callAli<T = any>(
  method: string,
  bizParams: Record<string, string | number | boolean | undefined | null>,
): Promise<T> {
  let { appKey, appSecret, accessToken, refreshToken, refreshedAt, expiresIn } = await loadAliCreds();

  // Refresh preventivo: se access_token expira em menos de 5 min, renova antes.
  if (refreshedAt && expiresIn > 0) {
    const ageMs = Date.now() - new Date(refreshedAt).getTime();
    const remainingSec = expiresIn - Math.floor(ageMs / 1000);
    if (remainingSec < 300 && refreshToken) {
      try {
        accessToken = await refreshAliToken(appKey, appSecret, refreshToken);
      } catch {
        // segue tentando com o token atual; erro real será tratado abaixo
      }
    }
  }

  let json = await requestAli(method, appKey, appSecret, accessToken, bizParams);

  const isTokenErr = (j: any) => {
    const er = j?.error_response;
    if (!er) return false;
    const code = String(er.code ?? er.sub_code ?? "");
    const msg = String(er.msg ?? er.sub_msg ?? "");
    return /IllegalAccessToken|InvalidAccessToken|AccessTokenExpired|access_token/i.test(`${code} ${msg}`);
  };

  if (isTokenErr(json)) {
    const newToken = await refreshAliToken(appKey, appSecret, refreshToken);
    json = await requestAli(method, appKey, appSecret, newToken, bizParams);
  }

  if (json.error_response) {
    const er = json.error_response;
    const detail = er.sub_msg ?? er.msg ?? "erro desconhecido";
    const codes = [er.code, er.sub_code].filter(Boolean).join("/");
    const requestId = er.request_id ? ` (request_id: ${er.request_id})` : "";
    throw new Error(`AliExpress ${codes}: ${detail}${requestId}`);
  }
  return json as T;
}

type FirecrawlSearchResult = {
  url?: string;
  title?: string;
  description?: string;
  imageUrl?: string;
};

async function searchAliExpressWeb(keyword: string, limit: number): Promise<DiscoveryProduct[]> {
  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!firecrawlKey) throw new Error("Firecrawl não conectado para a busca de produtos");

  const isGateway = firecrawlKey.startsWith("lovc_");
  const endpoint = isGateway
    ? "https://connector-gateway.lovable.dev/firecrawl/v2/search"
    : "https://api.firecrawl.dev/v2/search";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${isGateway ? lovableKey ?? "" : firecrawlKey}`,
  };
  if (isGateway) {
    if (!lovableKey) throw new Error("Conexão Firecrawl indisponível no servidor");
    headers["X-Connection-Api-Key"] = firecrawlKey;
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      query: `site:aliexpress.com/item ${keyword}`,
      limit: Math.min(limit, 50),
      lang: "pt",
      country: "br",
      sources: ["web", "images"],
    }),
  });
  const payload = (await res.json().catch(() => null)) as
    | { success?: boolean; data?: { web?: FirecrawlSearchResult[]; images?: FirecrawlSearchResult[] }; error?: string }
    | null;
  if (!res.ok || !payload?.success) {
    throw new Error(payload?.error ?? `Busca do catálogo falhou [${res.status}]`);
  }

  const web = payload.data?.web ?? [];
  const images = payload.data?.images ?? [];
  const imageByProduct = new Map<string, string>();
  for (const image of images) {
    const id = image.url?.match(/\/item\/(\d+)\.html/i)?.[1];
    if (id && image.imageUrl) imageByProduct.set(id, image.imageUrl);
  }

  const combined = [...images, ...web];
  const seen = new Set<string>();
  const products: DiscoveryProduct[] = [];
  for (const item of combined) {
      const productId = item.url?.match(/\/item\/(\d+)\.html/i)?.[1] ?? "";
      if (!productId || seen.has(productId)) continue;
      seen.add(productId);
      const description = item.description ?? "";
      const price = firstNumber(
        description.match(/(?:R\$|BRL)\s*([\d.,]+)/i)?.[1],
        description.match(/(?:US\s*\$|USD)\s*([\d.,]+)/i)?.[1],
      );
      const isBrl = /(?:R\$|BRL)/i.test(description);
      const image = item.imageUrl ?? imageByProduct.get(productId) ?? null;
      products.push({
        product_id: productId,
        title: item.title?.replace(/\s*-\s*AliExpress.*$/i, "").replace(/ali[\s\-_]?express/gi, "").replace(/\s{2,}/g, " ").trim() || "Produto importado",
        image,
        images: image ? [image] : [],
        price_original: price,
        currency: price == null ? null : isBrl ? "BRL" : "USD",
        price_brl_estimate_cents: null,
        evaluate_rate: parseRate(description.match(/\b([0-5](?:[.,]\d)?)\s*[౹|]\s*\d+\s*(?:sold|vendidos)/i)?.[1]),
        lastest_volume: firstNumber(description.match(/([\d.,]+)\s*(?:sold|vendidos)/i)?.[1]),
        shop_id: null,
        shop_title: null,
        shop_rating: null,
        product_url: item.url ?? `https://www.aliexpress.com/item/${productId}.html`,
      });
      if (products.length >= limit) break;
  }
  return products;
}

async function enrichWebResultsWithAliDetails(items: DiscoveryProduct[]): Promise<DiscoveryProduct[]> {
  const enriched = [...items];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(4, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      const item = items[index];
      try {
        const json = await callAli("aliexpress.ds.product.get", {
          product_id: item.product_id,
          ship_to_country: "BR",
          target_currency: "BRL",
          target_language: "PT",
        });
        const root = json.aliexpress_ds_product_get_response ?? json;
        const result = root.result ?? root;
        const base = result.ae_item_base_info_dto ?? result.base_info ?? {};
        const media = result.ae_multimedia_info_dto ?? result.multimedia ?? {};
        const store = result.ae_store_info ?? result.store_info ?? {};
        const skuBlock = result.ae_item_sku_info_dtos ?? result.skus ?? [];
        const skus: any[] = Array.isArray(skuBlock?.ae_item_sku_info_d_t_o)
          ? skuBlock.ae_item_sku_info_d_t_o
          : Array.isArray(skuBlock)
            ? skuBlock
            : [];
        const firstSku = skus[0] ?? {};
        const detailImages: string[] = [];
        const addImage = (url: unknown) => {
          if (typeof url === "string" && /^https?:\/\//.test(url) && !detailImages.includes(url)) {
            detailImages.push(url);
          }
        };
        const imageUrls = media.image_urls ?? media.image_url_list;
        if (typeof imageUrls === "string") imageUrls.split(/[,;\s]+/).forEach(addImage);
        else if (Array.isArray(imageUrls)) imageUrls.forEach(addImage);
        if (item.image) addImage(item.image);

        const price = firstNumber(
          firstSku.offer_sale_price,
          firstSku.sku_price,
          firstSku.offer_bulk_sale_price,
          result.app_sale_price,
          base.sale_price,
        );
        const storeRates = [
          firstNumber(store.item_as_described_rating),
          firstNumber(store.communication_rating),
          firstNumber(store.shipping_speed_rating),
        ].filter((rate): rate is number => rate !== null);
        enriched[index] = {
          ...item,
          title: String(base.subject ?? base.product_title ?? item.title),
          image: detailImages[0] ?? item.image,
          images: detailImages.length ? detailImages.slice(0, 12) : item.images,
          price_original: price ?? item.price_original,
          currency: String(firstSku.currency_code ?? base.currency_code ?? item.currency ?? "BRL"),
          evaluate_rate: parseRate(base.avg_evaluation_rating) ?? item.evaluate_rate,
          shop_id: store.store_id ? String(store.store_id) : item.shop_id,
          shop_title: store.store_name ?? item.shop_title,
          shop_rating: storeRates.length
            ? Math.round((storeRates.reduce((sum, rate) => sum + rate, 0) / storeRates.length) * 100) / 100
            : item.shop_rating,
        };
      } catch {
        // Keep the search result when a specific product is unavailable to this account.
      }
    }
  });
  await Promise.all(workers);
  return enriched;
}

// -------------------- Search --------------------

export type DiscoveryProduct = {
  product_id: string;
  title: string;
  image: string | null;
  images: string[];
  price_original: number | null;
  currency: string | null;
  price_brl_estimate_cents: number | null;
  evaluate_rate: number | null; // product rating 0..5
  lastest_volume: number | null;
  shop_id: string | null;
  shop_title: string | null;
  shop_rating: number | null;
  product_url: string | null;
};

function firstNumber(...vals: unknown[]): number | null {
  for (const v of vals) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const s = v.replace(/[^\d.,-]/g, "").replace(",", ".");
      const n = parseFloat(s);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function parseRate(v: unknown): number | null {
  if (v == null) return null;
  const s = String(v).replace("%", "").trim();
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return null;
  // If ~0-100, treat as percent → 0..5
  if (n > 5 && n <= 100) return Math.round((n / 20) * 100) / 100;
  return Math.round(n * 100) / 100;
}

function extractImages(p: any): string[] {
  const list: string[] = [];
  const push = (u: unknown) => {
    if (typeof u === "string" && /^https?:\/\//.test(u) && !list.includes(u)) list.push(u);
  };
  push(p.product_main_image_url);
  push(p.main_image_url);
  const small = p.product_small_image_urls ?? p.small_image_urls;
  if (small) {
    if (typeof small === "string") small.split(/[,;\s]+/).forEach(push);
    else if (Array.isArray(small?.string)) small.string.forEach(push);
    else if (Array.isArray(small)) small.forEach(push);
  }
  return list.slice(0, 12);
}

function normalizeSearchProduct(p: any): DiscoveryProduct {
  const images = extractImages(p);
  const price = firstNumber(p.target_sale_price, p.sale_price, p.app_sale_price, p.original_price);
  const currency: string =
    p.target_sale_price_currency ??
    p.sale_price_currency ??
    p.app_sale_price_currency ??
    "USD";
  return {
    product_id: String(p.product_id ?? p.item_id ?? ""),
    title: String(p.product_title ?? p.subject ?? p.title ?? "Produto importado").replace(/ali[\s\-_]?express/gi, "").replace(/\s{2,}/g, " ").trim(),
    image: images[0] ?? null,
    images,
    price_original: price,
    currency,
    price_brl_estimate_cents: null,
    evaluate_rate: parseRate(p.evaluate_rate ?? p.average_star ?? p.avg_evaluation_rating),
    lastest_volume: firstNumber(p.lastest_volume, p.sale_volume, p.orders) as number | null,
    shop_id: p.shop_id ? String(p.shop_id) : null,
    shop_title: p.shop_title ?? p.store_name ?? null,
    shop_rating: parseRate(p.shop_rating ?? p.store_rating ?? p.positive_rate),
    product_url: p.product_detail_url ?? p.promotion_link ?? (p.product_id ? `https://www.aliexpress.com/item/${p.product_id}.html` : null),
  };
}

const FX_FALLBACK: Record<string, number> = { USD: 5.5, EUR: 6.0, BRL: 1, CNY: 0.76, GBP: 7.0 };
async function fxToBrl(from: string): Promise<number> {
  const code = (from || "USD").toUpperCase();
  if (code === "BRL") return 1;
  try {
    const r = await fetch(`https://economia.awesomeapi.com.br/json/last/${code}-BRL`);
    if (r.ok) {
      const j = (await r.json()) as Record<string, { bid?: string }>;
      const bid = parseFloat(j[`${code}BRL`]?.bid ?? "");
      if (Number.isFinite(bid) && bid > 0) return bid;
    }
  } catch { /* ignore */ }
  return FX_FALLBACK[code] ?? 5.5;
}

export const discoverAliexpressProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        keyword: z.string().trim().max(120).optional(),
        page: z.number().int().min(1).max(20).default(1),
        page_size: z.number().int().min(1).max(50).default(24),
        min_rating: z.number().min(0).max(5).nullable().optional(),
        sort: z.string().max(40).optional(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }): Promise<{ items: DiscoveryProduct[]; total?: number }> => {
    await assertCatalog(context);

    const bizParams: Record<string, string | number> = {
      target_currency: "BRL",
      target_language: "PT",
      ship_to_country: "BR",
      page_no: data.page,
      page_size: data.page_size,
    };
    if (data.sort) bizParams.sort = data.sort;

    let json: any;
    let items: DiscoveryProduct[] = [];
    let total: number | undefined;
    if (data.keyword && data.keyword.trim()) {
      bizParams.keywords = data.keyword.trim();
      // There is no `aliexpress.ds.text.search` method in the Open Platform.
      // Keyword discovery is provided by the official Affiliate product query.
      try {
        json = await callAli("aliexpress.affiliate.product.query", bizParams);
      } catch (apiError) {
        // Affiliate access and OAuth tokens may be unavailable even while the
        // store can still discover public products. Keep discovery operational
        // through the connected web catalog instead of returning a false zero.
        try {
          items = await searchAliExpressWeb(data.keyword.trim(), data.page_size);
          items = await enrichWebResultsWithAliDetails(items);
          json = null;
        } catch (fallbackError) {
          const apiMessage = apiError instanceof Error ? apiError.message : String(apiError);
          const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
          throw new Error(`Busca indisponível. API AliExpress: ${apiMessage} Fallback: ${fallbackMessage}`);
        }
      }
    } else {
      delete bizParams.ship_to_country;
      bizParams.country = "BR";
      bizParams.feed_name = "DS bestseller";
      json = await callAli("aliexpress.ds.recommend.feed.get", bizParams);
    }

    if (json) {
      const root =
        json.aliexpress_affiliate_product_query_response ??
        json.aliexpress_ds_recommend_feed_get_response ??
        json;
      const container = root.resp_result?.result ?? root.data ?? root.result ?? root;
      const productsField =
        container.products ??
        container.recommend_products ??
        container.product ??
        container.result_list ??
        [];
      const rawList: any[] = Array.isArray(productsField)
        ? productsField
        : Array.isArray(productsField?.selection_search_product)
          ? productsField.selection_search_product
          : Array.isArray(productsField?.traffic_product_d_t_o)
            ? productsField.traffic_product_d_t_o
            : Array.isArray(productsField?.product)
              ? productsField.product
              : [];
      items = rawList.map(normalizeSearchProduct);
      total = firstNumber(container.total_record_count, container.total_count) ?? undefined;
    }

    // Enrich with BRL estimate using live FX for the first currency seen.
    const currencies = Array.from(new Set(items.map((i) => (i.currency ?? "USD").toUpperCase())));
    const rates: Record<string, number> = {};
    await Promise.all(currencies.map(async (c) => { rates[c] = await fxToBrl(c); }));
    for (const it of items) {
      if (it.price_original != null) {
        const rate = rates[(it.currency ?? "USD").toUpperCase()] ?? 5.5;
        it.price_brl_estimate_cents = Math.round(it.price_original * rate * 100);
      }
    }

    const filtered = data.min_rating
      ? items.filter((i) => i.evaluate_rate == null || i.evaluate_rate >= data.min_rating!)
      : items;

    return { items: filtered, total };
  });

// -------------------- Import selected product to store --------------------

const SettingsSchema = z.object({
  markup_percent: z.number().min(0).max(1000).default(150),
  markup_fixed_cents: z.number().int().min(0).default(0),
  round_to_99: z.boolean().default(true),
  default_status: z.enum(["draft", "active"]).default("draft"),
  default_category_id: z.string().uuid().nullable().optional(),
  default_brand_id: z.string().uuid().nullable().optional(),
  fx_rate: z.number().positive().default(5.5),
});

async function loadSettings(admin: any) {
  const { data } = await admin
    .from("integrations")
    .select("config")
    .eq("provider", "aliexpress")
    .maybeSingle();
  const raw = (data?.config as Record<string, unknown> | null)?.import_settings ?? data?.config ?? null;
  const parsed = SettingsSchema.safeParse(raw);

  return parsed.success
    ? parsed.data
    : {
        markup_percent: 150,
        markup_fixed_cents: 0,
        round_to_99: true,
        default_status: "draft" as const,
        default_category_id: null,
        default_brand_id: null,
        fx_rate: 5.5,
      };
}

async function translateToPtBr(input: { title: string; description: string | null }): Promise<{
  title: string;
  description: string | null;
}> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return input;
  try {
    const { generateText } = await import("ai");
    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("google/gemini-2.5-flash");
    const payload = JSON.stringify({ title: input.title, description: input.description ?? "" });
    const { text } = await generateText({
      model,
      system:
        "Você traduz descrições de produtos de cosméticos para português do Brasil, com tom elegante, claro e comercial. Preserve unidades, especificações e nomes próprios de ingredientes. Não invente informações. Responda APENAS com JSON válido no formato {\"title\":\"...\",\"description\":\"...\"}.",
      prompt: `Traduza para pt-BR:\n\n${payload}`,
    });
    const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    const parsed = JSON.parse(cleaned);
    return {
      title: typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : input.title,
      description:
        typeof parsed.description === "string" && parsed.description.trim()
          ? parsed.description.trim()
          : input.description,
    };
  } catch {
    return input;
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}


export const importAliexpressProductToStore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        product_id: z.string().min(3),
        status: z.enum(["draft", "active"]).default("draft"),
        stock: z.number().int().min(0).default(10),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Fetch full product details
    const json = await callAli("aliexpress.ds.product.get", {
      product_id: data.product_id,
      target_currency: "BRL",
      target_language: "PT",
      ship_to_country: "BR",
    });
    const root =
      (json as any).aliexpress_ds_product_get_response ??
      (json as any).aliexpress_ds_productdetail_get_response ??
      json;
    const result = (root as any).result ?? root;

    const base = result.ae_item_base_info_dto ?? result.base_info ?? result;
    const props = result.ae_item_properties ?? {};
    const mediaBlock = result.ae_multimedia_info_dto ?? result.multimedia ?? {};
    const skusBlock = result.ae_item_sku_info_dtos ?? result.skus ?? {};
    const shopBlock = result.ae_store_info ?? result.store_info ?? {};

    const title: string = base.subject ?? base.product_title ?? "Produto importado";
    const descHtml: string =
      base.detail ?? result.package_info_dto?.package_detail ?? "";
    const description = descHtml ? stripHtml(descHtml).slice(0, 6000) : null;

    // Images
    const images: string[] = [];
    const pushImg = (u: unknown) => {
      if (typeof u === "string" && /^https?:\/\//.test(u) && !images.includes(u)) images.push(u);
    };
    const imgUrls = mediaBlock.image_urls ?? mediaBlock.image_url_list;
    if (typeof imgUrls === "string") imgUrls.split(/[,;\s]+/).forEach(pushImg);
    else if (Array.isArray(imgUrls)) imgUrls.forEach(pushImg);
    const videos = mediaBlock.ae_video_dtos;
    if (Array.isArray(videos?.ae_video_d_t_o)) {
      for (const v of videos.ae_video_d_t_o) pushImg(v.media_url ?? v.poster_url);
    } else if (Array.isArray(videos)) {
      for (const v of videos) pushImg(v.media_url ?? v.poster_url);
    }

    // Price from first SKU
    const skus: any[] = Array.isArray(skusBlock?.ae_item_sku_info_d_t_o)
      ? skusBlock.ae_item_sku_info_d_t_o
      : Array.isArray(skusBlock)
        ? skusBlock
        : [];
    const firstSku = skus[0] ?? {};
    const priceRaw =
      firstNumber(firstSku.offer_sale_price, firstSku.sku_price, firstSku.offer_bulk_sale_price) ??
      firstNumber(result.app_sale_price, base.sale_price);
    const currency: string =
      firstSku.currency_code ?? base.currency_code ?? "USD";
    const sku = firstSku.sku_code ?? firstSku.sku_id ?? `AE-${data.product_id}`;
    const weight = firstNumber(props.package_weight, firstSku.package_weight);

    // Translate
    const translated = await translateToPtBr({ title, description });

    // Convert to BRL
    let priceBrl: number | null = priceRaw;
    const srcCurrency = currency.toUpperCase();
    if (priceRaw != null && srcCurrency !== "BRL") {
      const rate = await fxToBrl(srcCurrency);
      priceBrl = Math.round(priceRaw * rate * 100) / 100;
    }

    const norm: NormalizedProduct = {
      title: stripBrandMentions(translated.title) ?? translated.title,
      description: toParagraphHtml(stripBrandMentions(translated.description)),
      images,
      price_original: priceBrl,
      currency: "BRL",
      sku: String(sku),
      weight_grams: weight ? Math.round(weight * 1000) : null,
      source_url: `https://www.aliexpress.com/item/${data.product_id}.html`,
      source_id: String(data.product_id),
    };

    // Register import row
    const { data: imp, error: impErr } = await supabaseAdmin
      .from("product_imports")
      .insert({
        source: "aliexpress_api",
        source_url: norm.source_url,
        source_id: norm.source_id,
        status: "draft",
        raw_data: { shop: shopBlock },
        normalized_data: norm,
        imported_by: context.userId,
      })
      .select("id")
      .single();
    if (impErr) throw new Error(impErr.message);

    // Build product
    const settings = await loadSettings(supabaseAdmin);
    const priceCents = computeSalePriceCents(norm.price_original, norm.currency, settings);
    const slug = slugify(norm.title) + "-" + (norm.source_id ?? Math.random().toString(36).slice(2, 8));

    const { data: created, error: pe } = await supabaseAdmin
      .from("products")
      .insert({
        slug,
        name: norm.title,
        short_description: norm.description?.slice(0, 200) ?? null,
        description: norm.description ?? null,
        status: data.status,
        is_featured: false,
        brand_id: settings.default_brand_id ?? null,
        category_id: settings.default_category_id ?? null,
        tags: buildProductTags({ name: norm.title }),
      })
      .select("id")
      .single();
    if (pe) throw new Error(pe.message);
    const productId = created.id;

    const { data: nv, error: ve } = await supabaseAdmin
      .from("product_variants")
      .insert({
        product_id: productId,
        sku: norm.sku ?? `AE-${data.product_id}`,
        is_default: true,
        weight_grams: norm.weight_grams ?? null,
      })
      .select("id")
      .single();
    if (ve) throw new Error(ve.message);

    await supabaseAdmin.from("product_prices").insert({
      variant_id: nv.id,
      list_price_cents: priceCents,
      sale_price_cents: null,
      is_active: true,
    });
    await supabaseAdmin
      .from("product_inventory")
      .upsert({ variant_id: nv.id, stock: data.stock }, { onConflict: "variant_id" });

    if (norm.images.length > 0) {
      await supabaseAdmin.from("product_media").insert(
        norm.images.map((url, i) => ({
          product_id: productId,
          url,
          alt: norm.title,
          position: i,
          kind: /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url) ? ("video" as const) : ("image" as const),
        })),
      );
    }

    await supabaseAdmin
      .from("product_imports")
      .update({ status: "imported", product_id: productId, error: null })
      .eq("id", imp.id);

    return { product_id: productId, price_cents: priceCents };
  });
