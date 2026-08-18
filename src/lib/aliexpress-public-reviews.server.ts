/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Fallback público e best-effort para avaliações do AliExpress.
 *
 * Regras de segurança/estabilidade:
 * - nunca recebe/faz fetch de host arbitrário; sempre normaliza para um productId numérico;
 * - não tenta contornar CAPTCHA, bloqueio anti-bot ou autenticação;
 * - só persiste comentários realmente encontrados em HTML/JSON público;
 * - não inventa reviews, autores, notas ou datas;
 * - falhas aqui nunca devem quebrar importação, estoque, checkout ou avaliações já salvas.
 */

const MAX_HTML_BYTES = 8_000_000;
const FETCH_TIMEOUT_MS = 12_000;
const MAX_REVIEWS = 160;
const FEEDBACK_PAGE_SIZE = 20;
const MAX_FEEDBACK_PAGES = 3;

export type AliExpressPublicReview = {
  source_review_id: string;
  author_name: string | null;
  author_country: string | null;
  rating: number;
  title: string | null;
  body: string | null;
  images: string[];
  reviewed_at: string | null;
};

export type AliExpressPublicReviewsResult = {
  productId: string;
  reviews: AliExpressPublicReview[];
  source: "product_page" | "feedback_page" | "none";
  diagnostics: string[];
};

function safeText(value: unknown, max = 8000): string | null {
  if (value == null) return null;
  const text = String(value).trim().replace(/\s+/g, " ");
  return text ? text.slice(0, max) : null;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Number.parseInt(n, 16)))
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripHtml(value: string): string {
  return decodeHtml(value.replace(/<br\s*\/?\s*>/gi, "\n").replace(/<[^>]+>/g, " "))
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

function normalizeRating(value: unknown): number {
  if (value == null || value === "") return 0;
  const raw = Number.parseFloat(String(value).replace("%", "").replace(",", "."));
  if (!Number.isFinite(raw)) return 0;
  const normalized = raw > 5 && raw <= 100 ? raw / 20 : raw;
  return Math.min(5, Math.max(0, Math.round(normalized * 10) / 10));
}

function toIsoDate(value: unknown): string | null {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  const raw = Number.isFinite(numeric) && numeric > 0
    ? numeric < 10_000_000_000 ? numeric * 1000 : numeric
    : value;
  const date = new Date(raw as string | number);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function hashText(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function normalizeImageUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const raw = decodeHtml(value.trim());
    const url = new URL(raw.startsWith("//") ? `https:${raw}` : raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const host = url.hostname.toLowerCase();
    if (!(host.includes("alicdn") || host.includes("aliexpress") || host.includes("aliimg") || host.includes("ae01"))) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function collectImages(value: unknown, output: string[] = [], depth = 0): string[] {
  if (depth > 5 || output.length >= 8 || value == null) return output;
  if (typeof value === "string") {
    const direct = normalizeImageUrl(value);
    if (direct && !output.includes(direct)) output.push(direct);
    else {
      for (const part of value.split(/[,;\s]+/)) {
        const url = normalizeImageUrl(part);
        if (url && !output.includes(url)) output.push(url);
        if (output.length >= 8) break;
      }
    }
    return output;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectImages(item, output, depth + 1);
    return output;
  }
  if (typeof value === "object") {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (/image|img|photo|picture|pic|url|src/i.test(key)) collectImages(item, output, depth + 1);
      if (output.length >= 8) break;
    }
  }
  return output;
}

export function normalizeAliExpressPublicProductId(sourceId: string): string | null {
  const raw = String(sourceId ?? "").trim();
  if (/^\d{5,}$/.test(raw)) return raw;
  const patterns = [
    /\/item\/(\d{5,})(?:\.html)?/i,
    /[?&](?:productId|product_id)=(\d{5,})/i,
    /\b(\d{8,})\b/,
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

function pick(raw: any, keys: string[]): unknown {
  for (const key of keys) {
    if (raw && Object.prototype.hasOwnProperty.call(raw, key) && raw[key] != null && raw[key] !== "") {
      return raw[key];
    }
  }
  return null;
}

function normalizeJsonReview(raw: any, productId: string): AliExpressPublicReview | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const rating = normalizeRating(pick(raw, [
    "evaluation", "rating", "star", "stars", "score", "starRating", "star_rating",
    "feedbackScore", "feedback_score", "rate", "starView", "buyer_feedback_rating",
  ]));
  if (rating <= 0) return null;

  const feedback = safeText(pick(raw, [
    "feedback", "content", "reviewContent", "review_content", "comment", "text",
    "buyerFeedback", "buyer_feedback", "evaluation_content", "reviewText", "review_text",
    "evaContent",
  ]));
  const additional = safeText(pick(raw, ["additional_feedback", "additionalFeedback", "appendContent", "append_content"]));
  const body = [feedback, additional ? `Avaliação adicional: ${additional}` : null].filter(Boolean).join("\n\n") || null;
  if (!body) return null;

  const author = safeText(pick(raw, [
    "buyer_blured_name", "buyer_blurred_name", "buyer_name", "buyerName", "userName",
    "user_name", "author", "nick", "nickname", "displayName", "display_name", "anonymousName",
  ]), 180);
  const country = safeText(pick(raw, [
    "buyer_country_code", "buyerCountryCode", "buyer_country", "country_code", "countryCode", "country",
  ]), 24);
  const reviewedAt = toIsoDate(pick(raw, [
    "feedback_epoch_date", "feedbackEpochDate", "feedback_date", "feedbackDate", "reviewed_at",
    "reviewDate", "date", "create_time", "createdAt", "gmtCreate", "evaDate", "evalDate",
  ]));
  const title = safeText(pick(raw, ["title", "sku", "product_sku", "skuInfo", "sku_info"]), 240);
  const directId = safeText(pick(raw, [
    "feedback_id", "feedbackId", "review_id", "reviewId", "evaluation_id", "evaluationId", "id", "evaId",
  ]), 180);
  const orderId = safeText(pick(raw, ["order_id", "orderId"]), 180);
  const images = collectImages(pick(raw, [
    "image_urls", "imageUrls", "images", "image_list", "imageList", "pictures", "photos",
    "reviewImages", "review_images", "photoList", "evaImageList", "buyerFeedbackPicList",
  ]));

  const fingerprint = [productId, directId, orderId, author, country, rating, reviewedAt, body, images.join("|")].join("\u241f");
  const sourceReviewId = directId
    ? `public-${directId}`
    : orderId
      ? `public-order-${orderId}`
      : `public-${hashText(fingerprint)}`;

  return {
    source_review_id: sourceReviewId,
    author_name: author,
    author_country: country,
    rating,
    title,
    body,
    images,
    reviewed_at: reviewedAt,
  };
}

function collectJsonReviews(value: unknown, productId: string, output: Map<string, AliExpressPublicReview>, depth = 0) {
  if (depth > 14 || value == null || output.size >= MAX_REVIEWS) return;
  if (Array.isArray(value)) {
    for (const item of value) collectJsonReviews(item, productId, output, depth + 1);
    return;
  }
  if (typeof value !== "object") return;

  const raw = value as Record<string, unknown>;
  const review = normalizeJsonReview(raw, productId);
  if (review) output.set(review.source_review_id, review);

  for (const child of Object.values(raw)) {
    if (output.size >= MAX_REVIEWS) break;
    if (child && (typeof child === "object" || Array.isArray(child))) {
      collectJsonReviews(child, productId, output, depth + 1);
    }
  }
}

function extractBalanced(text: string, start: number): string | null {
  const opener = text[start];
  if (opener !== "{" && opener !== "[") return null;
  const closer = opener === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === opener) depth += 1;
    else if (char === closer) {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function tryParseJsonish(text: string): unknown[] {
  const values: unknown[] = [];
  const trimmed = decodeHtml(text.trim());
  if (!trimmed) return values;

  const directCandidates = [trimmed];
  const assign = trimmed.indexOf("=");
  if (assign >= 0) directCandidates.push(trimmed.slice(assign + 1).trim().replace(/;\s*$/, ""));

  for (const candidate of directCandidates) {
    if (!(candidate.startsWith("{") || candidate.startsWith("["))) continue;
    try {
      values.push(JSON.parse(candidate));
    } catch {
      const balanced = extractBalanced(candidate, 0);
      if (balanced) {
        try { values.push(JSON.parse(balanced)); } catch { /* best effort */ }
      }
    }
  }

  const markers = ["window.runParams", "window.__INITIAL_STATE__", "window.__PRELOADED_STATE__", "__NEXT_DATA__"];
  for (const marker of markers) {
    const index = trimmed.indexOf(marker);
    if (index < 0) continue;
    const brace = trimmed.indexOf("{", index);
    const bracket = trimmed.indexOf("[", index);
    const start = brace < 0 ? bracket : bracket < 0 ? brace : Math.min(brace, bracket);
    if (start < 0) continue;
    const balanced = extractBalanced(trimmed, start);
    if (!balanced) continue;
    try { values.push(JSON.parse(balanced)); } catch { /* best effort */ }
  }

  // React/Next pode serializar dados em strings dentro de self.__next_f.push(...).
  const nextPush = /self\.__next_f\.push\(\[\d+,"((?:\\.|[^"\\])*)"\]\)/g;
  for (const match of trimmed.matchAll(nextPush)) {
    try {
      const decoded = JSON.parse(`"${match[1]}"`);
      if (typeof decoded === "string" && /feedback|review|evaluation|buyer_/i.test(decoded)) {
        values.push(...tryParseJsonish(decoded));
      }
    } catch { /* best effort */ }
  }

  return values;
}

export function parseAliExpressPublicReviewJson(text: string, productId: string): AliExpressPublicReview[] {
  const output = new Map<string, AliExpressPublicReview>();
  for (const value of tryParseJsonish(text)) collectJsonReviews(value, productId, output);
  return [...output.values()].slice(0, MAX_REVIEWS);
}

function extractJsonReviewsFromHtml(html: string, productId: string): AliExpressPublicReview[] {
  const output = new Map<string, AliExpressPublicReview>();
  const scriptPattern = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(scriptPattern)) {
    const script = match[1];
    if (!/feedback|review|evaluation|buyer_|rating|__NEXT_DATA__|runParams/i.test(script)) continue;
    for (const value of tryParseJsonish(script)) collectJsonReviews(value, productId, output);
    if (output.size >= MAX_REVIEWS) break;
  }
  return [...output.values()];
}

function firstClassText(block: string, names: string[]): string | null {
  for (const name of names) {
    const re = new RegExp(`<[^>]+class=["'][^"']*${name}[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, "i");
    const match = block.match(re);
    if (match?.[1]) {
      const text = safeText(stripHtml(match[1]));
      if (text) return text;
    }
  }
  return null;
}

function parseHtmlReviewBlocks(html: string, productId: string): AliExpressPublicReview[] {
  const markers = [...html.matchAll(/class=["'][^"']*(?:feedback-item|buyer-review|review-item|reviewItem|feedbackItem)[^"']*["']/gi)]
    .map((match) => match.index ?? -1)
    .filter((index) => index >= 0);
  if (!markers.length) return [];

  const output = new Map<string, AliExpressPublicReview>();
  for (let i = 0; i < markers.length && output.size < MAX_REVIEWS; i += 1) {
    const block = html.slice(markers[i], markers[i + 1] ?? Math.min(html.length, markers[i] + 20_000));
    const body = firstClassText(block, [
      "buyer-feedback", "feedback-text", "review-content", "reviewContent", "feedback-content",
      "buyer-evaluation", "f-content",
    ]);
    if (!body) continue;

    let rating = 0;
    const dataRating = block.match(/(?:data-rating|data-score)=["']([\d.,]+)["']/i)?.[1];
    if (dataRating) rating = normalizeRating(dataRating);
    if (!rating) {
      const width = block.match(/width\s*:\s*([\d.]+)%/i)?.[1];
      if (width) rating = normalizeRating(width);
    }
    if (!rating) {
      const starClass = block.match(/(?:star|stars?)[-_ ]?([1-5])\b/i)?.[1];
      if (starClass) rating = Number(starClass);
    }
    if (!rating) continue;

    const author = firstClassText(block, ["buyer-name", "user-name", "userName", "author", "buyer"]);
    const country = firstClassText(block, ["buyer-country", "user-country", "country"]);
    const dateText = firstClassText(block, ["feedback-date", "review-date", "date"]);
    const reviewedAt = toIsoDate(dateText);
    const images = [...block.matchAll(/<img\b[^>]*(?:src|data-src)=["']([^"']+)["']/gi)]
      .map((match) => normalizeImageUrl(match[1]))
      .filter((value): value is string => Boolean(value))
      .slice(0, 8);
    const id = block.match(/(?:data-review-id|data-feedback-id|feedback-id)=["']([^"']+)["']/i)?.[1] ?? null;
    const fingerprint = [productId, id, author, country, rating, reviewedAt, body, images.join("|")].join("\u241f");
    const sourceReviewId = id ? `public-${id}` : `public-${hashText(fingerprint)}`;

    output.set(sourceReviewId, {
      source_review_id: sourceReviewId,
      author_name: author,
      author_country: country,
      rating,
      title: null,
      body,
      images: [...new Set(images)],
      reviewed_at: reviewedAt,
    });
  }
  return [...output.values()];
}

export function parseAliExpressPublicReviewHtml(html: string, productId: string): AliExpressPublicReview[] {
  const output = new Map<string, AliExpressPublicReview>();
  for (const review of extractJsonReviewsFromHtml(html, productId)) output.set(review.source_review_id, review);
  for (const review of parseHtmlReviewBlocks(html, productId)) output.set(review.source_review_id, review);
  return [...output.values()].slice(0, MAX_REVIEWS);
}

function looksLikeBotChallenge(text: string): boolean {
  return /captcha|verify you are human|security verification|punish-page|anti-bot|robot check/i.test(text.slice(0, 200_000));
}

async function fetchPublicHtml(url: string, referer: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        Referer: referer,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Cookie: "aep_usuc_f=site=glo&c_tp=BRL&region=BR&b_locale=pt_BR",
      },
    });
    const text = (await response.text()).slice(0, MAX_HTML_BYTES);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (looksLikeBotChallenge(text)) throw new Error("bloqueio anti-bot/CAPTCHA do AliExpress");
    return text;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("timeout ao consultar página pública");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchFeedbackSearchReviews(
  productId: string,
  productUrl: string,
  diagnostics: string[],
): Promise<AliExpressPublicReview[]> {
  const output = new Map<string, AliExpressPublicReview>();

  for (let page = 1; page <= MAX_FEEDBACK_PAGES && output.size < MAX_REVIEWS; page += 1) {
    const url = new URL("https://feedback.aliexpress.com/pc/searchEvaluation.do");
    url.searchParams.set("productId", productId);
    url.searchParams.set("lang", "en_US");
    url.searchParams.set("country", "US");
    url.searchParams.set("page", String(page));
    url.searchParams.set("pageSize", String(FEEDBACK_PAGE_SIZE));
    url.searchParams.set("filter", "all");
    url.searchParams.set("sort", "complex_default");

    try {
      const text = await fetchPublicHtml(url.toString(), productUrl);
      const pageReviews = parseAliExpressPublicReviewJson(text, productId);
      diagnostics.push(`feedback_json página ${page}: ${pageReviews.length} comentário(s) encontrado(s)`);
      for (const review of pageReviews) output.set(review.source_review_id, review);
      if (pageReviews.length < FEEDBACK_PAGE_SIZE) break;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      diagnostics.push(`feedback_json página ${page}: ${message.slice(0, 240)}`);
      break;
    }
  }

  return [...output.values()].slice(0, MAX_REVIEWS);
}

export async function fetchAliExpressPublicReviews(sourceId: string): Promise<AliExpressPublicReviewsResult> {
  const productId = normalizeAliExpressPublicProductId(sourceId);
  if (!productId) throw new Error(`ID AliExpress inválido para coleta pública: ${String(sourceId).slice(0, 120)}`);

  const diagnostics: string[] = [];
  const productUrl = `https://www.aliexpress.com/item/${productId}.html`;

  // Este endpoint público já foi usado com sucesso pelo projeto e retorna JSON em
  // `data.evaViewList`. Ele é a primeira tentativa quando a TOP oficial não aceita
  // a App Key, pois não depende da credencial TOP e preserva comentários reais.
  const feedbackJsonReviews = await fetchFeedbackSearchReviews(productId, productUrl, diagnostics);
  if (feedbackJsonReviews.length > 0) {
    return { productId, reviews: feedbackJsonReviews, source: "feedback_page", diagnostics };
  }

  const attempts: Array<{ source: "product_page" | "feedback_page"; url: string }> = [
    { source: "product_page", url: productUrl },
    {
      source: "feedback_page",
      url: `https://feedback.aliexpress.com/display/productEvaluation.htm?productId=${encodeURIComponent(productId)}&i18n=true&withPictures=true`,
    },
  ];

  for (const attempt of attempts) {
    try {
      const html = await fetchPublicHtml(attempt.url, productUrl);
      const reviews = parseAliExpressPublicReviewHtml(html, productId);
      diagnostics.push(`${attempt.source}: ${reviews.length} comentário(s) encontrado(s)`);
      if (reviews.length > 0) return { productId, reviews, source: attempt.source, diagnostics };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      diagnostics.push(`${attempt.source}: ${message.slice(0, 240)}`);
    }
  }

  return { productId, reviews: [], source: "none", diagnostics };
}
