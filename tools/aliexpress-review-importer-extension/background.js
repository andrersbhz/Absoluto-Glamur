const MAX_REVIEWS = 160;
const PAGE_SIZE = 20;
const MAX_PAGES = 5;

function decodeBase64Url(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

function parseBridgeCode(code) {
  const parts = String(code || "").trim().split(".");
  if (parts.length !== 3 || parts[0] !== "AG1") throw new Error("Código de importação inválido.");
  const payload = JSON.parse(decodeBase64Url(parts[1]));
  if (!payload?.ori || !payload?.sid || !payload?.exp) throw new Error("Código de importação incompleto.");
  if (Math.floor(Date.now() / 1000) > Number(payload.exp)) throw new Error("Código de importação expirado.");
  return payload;
}

function text(value, max = 8000) {
  if (value == null) return null;
  const out = String(value).replace(/\s+/g, " ").trim();
  return out ? out.slice(0, max) : null;
}

function ratingOf(value) {
  if (value == null || value === "") return 0;
  const parsed = Number.parseFloat(String(value).replace("%", "").replace(",", "."));
  if (!Number.isFinite(parsed)) return 0;
  const normalized = parsed > 5 && parsed <= 100 ? parsed / 20 : parsed;
  return Math.min(5, Math.max(0, Math.round(normalized * 10) / 10));
}

function dateOf(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function imageUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.startsWith("//") ? `https:${value}` : value);
    if (!/^https?:$/.test(url.protocol)) return null;
    const host = url.hostname.toLowerCase();
    if (!(host.includes("alicdn") || host.includes("aliexpress") || host.includes("aliimg") || host.includes("ae01"))) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function imagesOf(value, output = [], depth = 0) {
  if (value == null || depth > 5 || output.length >= 8) return output;
  if (typeof value === "string") {
    const direct = imageUrl(value);
    if (direct && !output.includes(direct)) output.push(direct);
    return output;
  }
  if (Array.isArray(value)) {
    for (const item of value) imagesOf(item, output, depth + 1);
    return output;
  }
  if (typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (/image|img|photo|pic|url|src/i.test(key)) imagesOf(item, output, depth + 1);
      if (output.length >= 8) break;
    }
  }
  return output;
}

function pick(raw, keys) {
  for (const key of keys) {
    if (raw && raw[key] != null && raw[key] !== "") return raw[key];
  }
  return null;
}

function normalizeJsonReview(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rating = ratingOf(pick(raw, ["buyerEval", "evaluteRate", "evaluateRate", "evaluation", "rating", "star", "stars", "score"]));
  const original = text(pick(raw, ["buyerFeedback", "feedback", "content", "reviewContent", "review_content", "comment", "evaContent"]));
  const translated = text(pick(raw, ["buyerTranslationFeedback", "translationFeedback", "translatedFeedback", "translated_content"]));
  const body = translated || original;
  if (!body || rating <= 0) return null;

  const id = text(pick(raw, ["evaluationIdStr", "evaluationId", "feedbackId", "feedback_id", "reviewId", "review_id", "id"]), 180);
  const author = text(pick(raw, ["buyerName", "buyer_name", "buyer_blured_name", "userName", "author", "displayName"]), 180);
  const country = text(pick(raw, ["buyerCountry", "buyer_country", "buyer_country_code", "country", "countryCode"]), 24);
  const title = text(pick(raw, ["skuInfo", "sku_info", "productSku", "product_sku", "title"]), 500);
  const reviewedAt = dateOf(pick(raw, ["evalDate", "buyerFeedbackDate", "feedbackDate", "feedback_date", "date", "create_time", "createdAt"]));
  const images = imagesOf(pick(raw, ["images", "buyerFeedbackPicList", "imageUrls", "image_urls", "photos", "pictures"]));

  return { id, author, country, rating, title, body, images, reviewed_at: reviewedAt };
}

function collectJsonReviews(value, output = new Map(), depth = 0) {
  if (value == null || depth > 15 || output.size >= MAX_REVIEWS) return output;
  if (Array.isArray(value)) {
    for (const item of value) collectJsonReviews(item, output, depth + 1);
    return output;
  }
  if (typeof value !== "object") return output;

  const review = normalizeJsonReview(value);
  if (review) {
    const key = review.id || `${review.author || ""}|${review.rating}|${review.reviewed_at || ""}|${review.body}`;
    output.set(key, review);
  }
  for (const child of Object.values(value)) {
    if (output.size >= MAX_REVIEWS) break;
    if (child && (typeof child === "object" || Array.isArray(child))) collectJsonReviews(child, output, depth + 1);
  }
  return output;
}

function findRemoteTotal(value, depth = 0) {
  if (value == null || depth > 12) return 0;
  if (Array.isArray(value)) return value.reduce((max, child) => Math.max(max, findRemoteTotal(child, depth + 1)), 0);
  if (typeof value !== "object") return 0;
  let best = 0;
  for (const [key, child] of Object.entries(value)) {
    if (/^(totalNum|total_number|totalCount|totalEvaluation|totalResults|total_results|reviewCount|evaluationCount)$/i.test(key)) {
      const n = Number(String(child).replace(/[^\d.-]/g, ""));
      if (Number.isFinite(n) && n >= 0 && n <= 2_000_000) best = Math.max(best, Math.round(n));
    }
    if (child && typeof child === "object") best = Math.max(best, findRemoteTotal(child, depth + 1));
  }
  return best;
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripHtml(value) {
  return decodeEntities(String(value || "").replace(/<br\s*\/?\s*>/gi, "\n").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function parseHtmlReviews(html) {
  const output = new Map();
  const markers = [...String(html || "").matchAll(/class=["'][^"']*(?:feedback-item|buyer-review|review-item)[^"']*["']/gi)]
    .map((match) => match.index)
    .filter((index) => Number.isFinite(index));
  for (let index = 0; index < markers.length && output.size < MAX_REVIEWS; index += 1) {
    const block = html.slice(markers[index], markers[index + 1] || Math.min(html.length, markers[index] + 24000));
    const bodyMatch = block.match(/class=["'][^"']*(?:buyer-feedback|feedback-text|review-content|f-content)[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i);
    const body = text(stripHtml(bodyMatch?.[1] || ""));
    if (!body) continue;
    let rating = ratingOf(block.match(/(?:data-rating|data-score)=["']([\d.,%]+)["']/i)?.[1]);
    if (!rating) rating = ratingOf(block.match(/width\s*:\s*([\d.]+)%/i)?.[1]);
    if (!rating) continue;
    const id = text(block.match(/(?:data-review-id|data-feedback-id|evaluationId)=["']([^"']+)["']/i)?.[1], 180);
    const author = text(stripHtml(block.match(/class=["'][^"']*(?:buyer-name|user-name|userName)[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i)?.[1] || ""), 180);
    const country = text(stripHtml(block.match(/class=["'][^"']*(?:buyer-country|user-country)[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i)?.[1] || ""), 24);
    const dateText = text(stripHtml(block.match(/class=["'][^"']*(?:feedback-date|review-date)[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i)?.[1] || ""), 120);
    const images = [...block.matchAll(/<img\b[^>]*(?:src|data-src)=["']([^"']+)["']/gi)]
      .map((match) => imageUrl(match[1]))
      .filter(Boolean)
      .slice(0, 8);
    const review = { id, author, country, rating, title: null, body, images, reviewed_at: dateOf(dateText) };
    output.set(id || `${author || ""}|${rating}|${body}`, review);
  }
  return [...output.values()];
}

async function inspectPage(tabId, clickReviews = false) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (shouldClick) => {
      const html = document.documentElement?.innerHTML || "";
      const ownerPatterns = [
        /["']ownerMemberId["']\s*[:=]\s*["']?(\d{5,})/i,
        /["']owner_member_seq_long["']\s*:\s*["']?(\d{5,})/i,
        /["']sellerAdminSeq["']\s*:\s*["']?(\d{5,})/i,
        /["']sellerSeq["']\s*:\s*["']?(\d{5,})/i,
      ];
      let ownerMemberId = null;
      for (const pattern of ownerPatterns) {
        const match = html.match(pattern);
        if (match?.[1]) { ownerMemberId = match[1]; break; }
      }

      const totals = [];
      for (const match of html.matchAll(/["'](?:reviewCount|evaluationCount|totalEvaluation|totalNum)["']\s*:\s*["']?(\d{1,7})/gi)) {
        totals.push(Number(match[1]));
      }

      if (shouldClick) {
        const candidates = [...document.querySelectorAll("button,a,[role='tab'],div")].filter((el) => {
          const label = (el.textContent || "").trim().toLowerCase();
          return label.length > 0 && label.length < 80 && /^(reviews?|avaliações|avaliacoes)(\s*\(.*\))?$/.test(label);
        });
        candidates[0]?.click();
      }

      const reviews = [];
      const blocks = [...document.querySelectorAll("[data-review-id], .feedback-item, .review-item, [class*='reviewItem'], [class*='review-item']")].slice(0, 160);
      for (const block of blocks) {
        const rawText = (block.innerText || "").replace(/\s+/g, " ").trim();
        if (rawText.length < 5 || rawText.length > 5000) continue;
        const ratingNode = block.querySelector("[data-rating],[data-score],[aria-label*='out of 5'],[aria-label*='stars'],[aria-label*='estrelas']");
        const ratingText = ratingNode?.getAttribute("data-rating") || ratingNode?.getAttribute("data-score") || ratingNode?.getAttribute("aria-label") || "";
        const ratingMatch = ratingText.match(/([1-5](?:[.,]\d)?)/);
        let rating = ratingMatch ? Number(ratingMatch[1].replace(",", ".")) : 0;
        if (!rating) {
          const widthNode = [...block.querySelectorAll("*")].find((el) => /width\s*:\s*\d+(?:\.\d+)?%/i.test(el.getAttribute("style") || ""));
          const width = widthNode?.getAttribute("style")?.match(/width\s*:\s*(\d+(?:\.\d+)?)%/i)?.[1];
          if (width) rating = Number(width) / 20;
        }
        if (!(rating > 0 && rating <= 5)) continue;
        const bodyNode = block.querySelector(".buyer-feedback,[class*='review-content'],[class*='feedback-content'],[class*='reviewContent']");
        const body = (bodyNode?.textContent || rawText).replace(/\s+/g, " ").trim().slice(0, 8000);
        if (!body) continue;
        const authorNode = block.querySelector(".buyer-name,.user-name,[class*='userName'],[class*='buyerName']");
        const countryNode = block.querySelector(".buyer-country,.user-country,[class*='country']");
        const images = [...block.querySelectorAll("img")].map((img) => img.currentSrc || img.src).filter(Boolean).slice(0, 8);
        reviews.push({
          id: block.getAttribute("data-review-id") || block.getAttribute("data-feedback-id") || null,
          author: (authorNode?.textContent || "").trim().slice(0, 180) || null,
          country: (countryNode?.textContent || "").trim().slice(0, 24) || null,
          rating,
          title: null,
          body,
          images,
          reviewed_at: null,
        });
      }
      return { ownerMemberId, remoteTotal: totals.length ? Math.max(...totals) : 0, reviews };
    },
    args: [clickReviews],
  });
  return result || { ownerMemberId: null, remoteTotal: 0, reviews: [] };
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, { credentials: "include", redirect: "follow", ...options });
  const textBody = await response.text();
  if (!response.ok) throw new Error(`AliExpress HTTP ${response.status}`);
  if (/captcha|verify you are human|security verification|punish-page|robot check/i.test(textBody.slice(0, 150000))) {
    throw new Error("O AliExpress solicitou verificação da sessão. Abra a página no navegador e conclua a verificação antes de tentar novamente.");
  }
  return textBody;
}

async function fetchFeedback(productId, ownerMemberId) {
  const output = new Map();
  let remoteTotal = 0;

  for (let page = 1; page <= MAX_PAGES && output.size < MAX_REVIEWS; page += 1) {
    const url = new URL("https://feedback.aliexpress.com/pc/searchEvaluation.do");
    url.searchParams.set("productId", productId);
    if (ownerMemberId) url.searchParams.set("ownerMemberId", ownerMemberId);
    url.searchParams.set("lang", "pt_BR");
    url.searchParams.set("country", "BR");
    url.searchParams.set("page", String(page));
    url.searchParams.set("pageSize", String(PAGE_SIZE));
    url.searchParams.set("filter", "all");
    url.searchParams.set("sort", "complex_default");
    try {
      const raw = await fetchText(url.toString());
      let payload;
      try { payload = JSON.parse(raw); } catch { payload = null; }
      if (!payload) break;
      remoteTotal = Math.max(remoteTotal, findRemoteTotal(payload));
      const before = output.size;
      collectJsonReviews(payload, output);
      const added = output.size - before;
      if (added < PAGE_SIZE) break;
    } catch (error) {
      if (page === 1 && !output.size) throw error;
      break;
    }
  }

  if (!output.size && ownerMemberId) {
    for (let page = 1; page <= MAX_PAGES && output.size < MAX_REVIEWS; page += 1) {
      const url = new URL("https://feedback.aliexpress.com/display/productEvaluation.htm");
      url.searchParams.set("v", "2");
      url.searchParams.set("productId", productId);
      url.searchParams.set("ownerMemberId", ownerMemberId);
      url.searchParams.set("page", String(page));
      url.searchParams.set("currentPage", String(page));
      url.searchParams.set("memberType", "seller");
      url.searchParams.set("withPictures", "true");
      url.searchParams.set("withAdditionalFeedback", "true");
      url.searchParams.set("i18n", "true");
      url.searchParams.set("translate", "Y");
      const raw = await fetchText(url.toString());
      const pageReviews = parseHtmlReviews(raw);
      for (const review of pageReviews) output.set(review.id || `${review.author || ""}|${review.rating}|${review.body}`, review);
      if (pageReviews.length < PAGE_SIZE) break;
    }
  }

  return { reviews: [...output.values()].slice(0, MAX_REVIEWS), remoteTotal };
}

async function submitToStore(bridgeCode, bridgePayload, productId, reviews, remoteTotal) {
  const endpoint = `${new URL(bridgePayload.ori).origin}/api/public/aliexpress-review-browser`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${bridgeCode}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      source_product_id: productId,
      remote_total: remoteTotal || reviews.length,
      reviews,
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) throw new Error(payload?.error || `A loja recusou a importação (HTTP ${response.status}).`);
  return payload;
}

async function runImport({ bridgeCode, tabId, productId }) {
  const bridge = parseBridgeCode(bridgeCode);
  if (String(bridge.sid) !== String(productId)) throw new Error("O produto aberto não corresponde ao código gerado no painel.");

  let page = await inspectPage(tabId, false);
  let fetched = { reviews: [], remoteTotal: 0 };
  try {
    fetched = await fetchFeedback(productId, page.ownerMemberId);
  } catch (error) {
    if (!page.reviews?.length) {
      await inspectPage(tabId, true);
      await new Promise((resolve) => setTimeout(resolve, 2200));
      page = await inspectPage(tabId, false);
      if (!page.reviews?.length) throw error;
    }
  }

  const merged = new Map();
  for (const review of [...fetched.reviews, ...(page.reviews || [])]) {
    const normalized = {
      ...review,
      images: (review.images || []).map(imageUrl).filter(Boolean).slice(0, 8),
    };
    if (!normalized.body || !(normalized.rating > 0)) continue;
    const key = normalized.id || `${normalized.author || ""}|${normalized.rating}|${normalized.reviewed_at || ""}|${normalized.body}`;
    merged.set(key, normalized);
    if (merged.size >= MAX_REVIEWS) break;
  }

  const reviews = [...merged.values()];
  if (!reviews.length) {
    throw new Error("Nenhum comentário ficou disponível na sessão atual. Abra a seção Avaliações do produto no AliExpress, conclua qualquer verificação solicitada e tente novamente.");
  }

  const remoteTotal = Math.max(fetched.remoteTotal || 0, page.remoteTotal || 0, reviews.length);
  return submitToStore(bridgeCode, bridge, productId, reviews, remoteTotal);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "AG_IMPORT_ALIEXPRESS_REVIEWS") return false;
  runImport(message)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  return true;
});
