/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  parseAliExpressPublicReviewHtml,
  parseAliExpressPublicReviewJson,
  type AliExpressPublicReview,
} from "./aliexpress-public-reviews.server";

const MAX_REVIEWS = 160;
const PAGE_SIZE = 20;
const MAX_PAGES = 3;
const FETCH_TIMEOUT_MS = 15_000;
const FIRECRAWL_TIMEOUT_MS = 50_000;

type ExtendedReviewResult = {
  reviews: AliExpressPublicReview[];
  diagnostics: string[];
};

type ProductIdentity = {
  ownerMemberId: string | null;
  mainProductId: string | null;
};

function numericId(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  return /^\d{5,}$/.test(raw) ? raw : null;
}

async function getDbClient(credentialClient?: any) {
  if (credentialClient) return credentialClient;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function resolveProductIdentity(productId: string, credentialClient?: any): Promise<ProductIdentity> {
  try {
    const { callAli } = await import("./aliexpress-discovery.functions");
    const payload = await callAli<any>(
      "aliexpress.ds.product.get",
      {
        product_id: productId,
        ship_to_country: "BR",
        target_currency: "BRL",
        target_language: "PT",
      },
      credentialClient,
    );
    const root = payload?.aliexpress_ds_product_get_response ?? payload;
    const result = root?.result?.result ?? root?.resp_result?.result ?? root?.result ?? root;
    const base = result?.ae_item_base_info_dto ?? result?.base_info ?? {};
    const converter = result?.product_id_converter_result ?? result?.productIdConverterResult ?? {};
    return {
      ownerMemberId: numericId(base?.owner_member_seq_long ?? result?.owner_member_seq_long),
      mainProductId: numericId(converter?.main_product_id ?? converter?.mainProductId),
    };
  } catch {
    return { ownerMemberId: null, mainProductId: null };
  }
}

function browserHeaders(referer: string): Record<string, string> {
  return {
    Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,pt-BR;q=0.8,pt;q=0.7",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    Referer: referer,
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    Cookie: "aep_usuc_f=site=glo&c_tp=USD&region=US&b_locale=en_US",
  };
}

async function fetchText(
  url: string,
  init: RequestInit,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, redirect: "follow" });
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (/captcha|verify you are human|security verification|punish-page|anti-bot|robot check/i.test(text.slice(0, 200_000))) {
      throw new Error("bloqueio anti-bot/CAPTCHA");
    }
    return text.slice(0, 8_000_000);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("timeout");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function collectParsed(text: string, productId: string, output: Map<string, AliExpressPublicReview>) {
  for (const review of parseAliExpressPublicReviewJson(text, productId)) {
    output.set(review.source_review_id, review);
    if (output.size >= MAX_REVIEWS) return;
  }
  for (const review of parseAliExpressPublicReviewHtml(text, productId)) {
    output.set(review.source_review_id, review);
    if (output.size >= MAX_REVIEWS) return;
  }
}

async function fetchOwnerMemberReviews(
  productId: string,
  ownerMemberId: string,
  diagnostics: string[],
): Promise<AliExpressPublicReview[]> {
  const output = new Map<string, AliExpressPublicReview>();
  const productUrl = `https://www.aliexpress.com/item/${productId}.html`;

  // O endpoint HTML legado do próprio AliExpress usa ownerMemberId em vários
  // anúncios. A coleta pública simples não tinha esse identificador e podia
  // retornar lista vazia mesmo quando a página de avaliações possuía conteúdo.
  for (let page = 1; page <= MAX_PAGES && output.size < MAX_REVIEWS; page += 1) {
    const body = new URLSearchParams({
      v: "2",
      productId,
      ownerMemberId,
      memberType: "seller",
      page: String(page),
      currentPage: String(page),
      withPictures: "true",
      withAdditionalFeedback: "true",
      withPersonalInfo: "false",
      onlyFromMyCountry: "false",
      evaSortValue: "sortdefault@feedback",
      evaStarFilterValue: "all Stars",
      translate: "Y",
      i18n: "true",
    }).toString();

    try {
      const text = await fetchText("https://feedback.aliexpress.com/display/productEvaluation.htm", {
        method: "POST",
        headers: {
          ...browserHeaders(productUrl),
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body,
      });
      const before = output.size;
      collectParsed(text, productId, output);
      const added = output.size - before;
      diagnostics.push(`feedback_owner página ${page}: ${added} comentário(s)`);
      if (added < PAGE_SIZE) break;
    } catch (error) {
      diagnostics.push(`feedback_owner página ${page}: ${error instanceof Error ? error.message : String(error)}`);
      break;
    }
  }

  // Tenta também o JSON moderno com ownerMemberId. Alguns anúncios aceitam o
  // parâmetro mesmo quando a variante sem owner retorna evaViewList vazio.
  if (!output.size) {
    for (let page = 1; page <= MAX_PAGES && output.size < MAX_REVIEWS; page += 1) {
      const url = new URL("https://feedback.aliexpress.com/pc/searchEvaluation.do");
      url.searchParams.set("productId", productId);
      url.searchParams.set("ownerMemberId", ownerMemberId);
      url.searchParams.set("lang", "en_US");
      url.searchParams.set("country", "US");
      url.searchParams.set("page", String(page));
      url.searchParams.set("pageSize", String(PAGE_SIZE));
      url.searchParams.set("filter", "all");
      url.searchParams.set("sort", "complex_default");
      try {
        const text = await fetchText(url.toString(), {
          method: "GET",
          headers: browserHeaders(productUrl),
        });
        const before = output.size;
        collectParsed(text, productId, output);
        const added = output.size - before;
        diagnostics.push(`feedback_owner_json página ${page}: ${added} comentário(s)`);
        if (added < PAGE_SIZE) break;
      } catch (error) {
        diagnostics.push(`feedback_owner_json página ${page}: ${error instanceof Error ? error.message : String(error)}`);
        break;
      }
    }
  }

  return [...output.values()].slice(0, MAX_REVIEWS);
}

async function loadDirectFirecrawlKey(credentialClient?: any): Promise<string | null> {
  const envKey = String(process.env.FIRECRAWL_API_KEY ?? "").trim();
  if (envKey && !envKey.startsWith("lovc_")) return envKey;

  try {
    const db = await getDbClient(credentialClient);
    const { data, error } = await db
      .from("integrations")
      .select("api_key, enabled")
      .eq("provider", "firecrawl")
      .maybeSingle();
    if (error || data?.enabled === false) return null;
    const key = String(data?.api_key ?? "").trim();
    // Nunca usa a chave do connector-gateway/Lovable neste fallback. O objetivo
    // é não consumir créditos Lovable; apenas uma chave Firecrawl direta é aceita.
    if (!key || key.startsWith("lovc_")) return null;
    return key;
  } catch {
    return null;
  }
}

async function scrapeWithDirectFirecrawl(
  url: string,
  apiKey: string,
): Promise<{ html: string; rawHtml: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FIRECRAWL_TIMEOUT_MS);
  try {
    const response = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["html", "rawHtml"],
        onlyMainContent: false,
        waitFor: 6_000,
        timeout: 45_000,
        location: { country: "US", languages: ["en-US"] },
        proxy: "auto",
        blockAds: false,
        storeInCache: false,
      }),
    });
    const payload = await response.json().catch(() => null) as any;
    if (!response.ok || payload?.success === false) {
      throw new Error(String(payload?.error ?? payload?.message ?? `HTTP ${response.status}`).slice(0, 240));
    }
    const data = payload?.data ?? payload ?? {};
    return {
      html: typeof data.html === "string" ? data.html : "",
      rawHtml: typeof data.rawHtml === "string" ? data.rawHtml : "",
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchRenderedReviews(
  productId: string,
  ownerMemberId: string | null,
  credentialClient: any,
  diagnostics: string[],
): Promise<AliExpressPublicReview[]> {
  const key = await loadDirectFirecrawlKey(credentialClient);
  if (!key) {
    diagnostics.push("renderizado: Firecrawl direto não configurado; gateway Lovable não é utilizado");
    return [];
  }

  const output = new Map<string, AliExpressPublicReview>();
  const urls = [
    `https://feedback.aliexpress.com/pc/searchEvaluation.do?productId=${encodeURIComponent(productId)}&lang=en_US&country=US&page=1&pageSize=20&filter=all&sort=complex_default${ownerMemberId ? `&ownerMemberId=${encodeURIComponent(ownerMemberId)}` : ""}`,
    ownerMemberId
      ? `https://feedback.aliexpress.com/display/productEvaluation.htm?v=2&productId=${encodeURIComponent(productId)}&ownerMemberId=${encodeURIComponent(ownerMemberId)}&page=1&withPictures=true&withAdditionalFeedback=true&i18n=true`
      : `https://www.aliexpress.com/item/${encodeURIComponent(productId)}.html`,
  ];

  for (let index = 0; index < urls.length && output.size < MAX_REVIEWS; index += 1) {
    try {
      const rendered = await scrapeWithDirectFirecrawl(urls[index], key);
      const before = output.size;
      if (rendered.rawHtml) collectParsed(rendered.rawHtml, productId, output);
      if (rendered.html) collectParsed(rendered.html, productId, output);
      diagnostics.push(`renderizado ${index + 1}: ${output.size - before} comentário(s)`);
      if (output.size > 0) break;
    } catch (error) {
      diagnostics.push(`renderizado ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return [...output.values()].slice(0, MAX_REVIEWS);
}

export async function fetchAliExpressExtendedReviews(
  sourceProductId: string,
  credentialClient?: any,
): Promise<ExtendedReviewResult> {
  const productId = numericId(sourceProductId);
  if (!productId) return { reviews: [], diagnostics: ["fallback estendido: ID inválido"] };

  const diagnostics: string[] = [];
  const identity = await resolveProductIdentity(productId, credentialClient);
  let reviews: AliExpressPublicReview[] = [];

  if (identity.ownerMemberId) {
    reviews = await fetchOwnerMemberReviews(productId, identity.ownerMemberId, diagnostics);
  } else {
    diagnostics.push("feedback_owner: ownerMemberId indisponível na Open Platform");
  }

  if (!reviews.length) {
    reviews = await fetchRenderedReviews(productId, identity.ownerMemberId, credentialClient, diagnostics);
  }

  return { reviews, diagnostics };
}
