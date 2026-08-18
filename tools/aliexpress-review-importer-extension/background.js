const MAX_REVIEWS = 160;
const MAX_IMAGES = 8;

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

function cleanText(value, max = 8000) {
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

function safeImage(value) {
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

function normalizeJsonReview(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const pick = (...keys) => {
    for (const key of keys) if (raw[key] != null && raw[key] !== "") return raw[key];
    return null;
  };
  const rating = ratingOf(pick("buyerEval", "evaluteRate", "evaluateRate", "evaluation", "rating", "star", "stars", "score"));
  const original = cleanText(pick("buyerFeedback", "feedback", "content", "reviewContent", "review_content", "comment", "evaContent"));
  const translated = cleanText(pick("buyerTranslationFeedback", "translationFeedback", "translatedFeedback", "translated_content"));
  const body = translated || original;
  if (!body || rating <= 0) return null;

  const rawImages = pick("images", "buyerFeedbackPicList", "imageUrls", "image_urls", "photos", "pictures");
  const images = [];
  const collectImages = (value, depth = 0) => {
    if (value == null || depth > 5 || images.length >= MAX_IMAGES) return;
    if (typeof value === "string") {
      const image = safeImage(value);
      if (image && !images.includes(image)) images.push(image);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => collectImages(item, depth + 1));
      return;
    }
    if (typeof value === "object") Object.values(value).forEach((item) => collectImages(item, depth + 1));
  };
  collectImages(rawImages);

  return {
    id: cleanText(pick("evaluationIdStr", "evaluationId", "feedbackId", "feedback_id", "reviewId", "review_id", "id"), 180),
    author: cleanText(pick("buyerName", "buyer_name", "buyer_blured_name", "userName", "author", "displayName"), 180),
    country: cleanText(pick("buyerCountry", "buyer_country", "buyer_country_code", "country", "countryCode"), 24),
    rating,
    title: cleanText(pick("skuInfo", "sku_info", "productSku", "product_sku", "title"), 500),
    body,
    images,
    reviewed_at: dateOf(pick("evalDate", "buyerFeedbackDate", "feedbackDate", "feedback_date", "date", "create_time", "createdAt")),
  };
}

function collectJsonReviews(value, output = new Map(), depth = 0) {
  if (value == null || depth > 15 || output.size >= MAX_REVIEWS) return output;
  if (Array.isArray(value)) {
    value.forEach((item) => collectJsonReviews(item, output, depth + 1));
    return output;
  }
  if (typeof value !== "object") return output;
  const review = normalizeJsonReview(value);
  if (review) output.set(review.id || `${review.author || ""}|${review.rating}|${review.reviewed_at || ""}|${review.body}`, review);
  Object.values(value).forEach((child) => {
    if (output.size < MAX_REVIEWS && child && typeof child === "object") collectJsonReviews(child, output, depth + 1);
  });
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

      if (shouldClick) {
        const labels = /^(reviews?|avaliações|avaliacoes)(\s*\(.*\))?$/i;
        const candidate = [...document.querySelectorAll("button,a,[role='tab'],div")].find((el) => {
          const label = (el.textContent || "").replace(/\s+/g, " ").trim();
          return label.length > 0 && label.length < 90 && labels.test(label);
        });
        candidate?.click();
      }

      const totals = [];
      for (const match of html.matchAll(/["'](?:reviewCount|evaluationCount|totalEvaluation|totalNum)["']\s*:\s*["']?(\d{1,7})/gi)) totals.push(Number(match[1]));

      const blocks = [...document.querySelectorAll("[data-review-id], .feedback-item, .review-item, [class*='reviewItem'], [class*='review-item'], [class*='feedback-item']")].slice(0, 160);
      const reviews = [];
      for (const block of blocks) {
        const rawText = (block.innerText || "").replace(/\s+/g, " ").trim();
        if (rawText.length < 5 || rawText.length > 8000) continue;
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
        const bodyNode = block.querySelector(".buyer-feedback,[class*='review-content'],[class*='feedback-content'],[class*='reviewContent'],[class*='feedback-text']");
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

async function fetchFeedback(productId, ownerMemberId) {
  const output = new Map();
  let remoteTotal = 0;
  for (let page = 1; page <= 5 && output.size < MAX_REVIEWS; page += 1) {
    const url = new URL("https://feedback.aliexpress.com/pc/searchEvaluation.do");
    url.searchParams.set("productId", productId);
    if (ownerMemberId) url.searchParams.set("ownerMemberId", ownerMemberId);
    url.searchParams.set("lang", "pt_BR");
    url.searchParams.set("country", "BR");
    url.searchParams.set("page", String(page));
    url.searchParams.set("pageSize", "20");
    url.searchParams.set("filter", "all");
    url.searchParams.set("sort", "complex_default");
    try {
      const response = await fetch(url.toString(), { credentials: "include", redirect: "follow" });
      if (!response.ok) break;
      const raw = await response.text();
      if (/captcha|verify you are human|security verification|punish-page|robot check/i.test(raw.slice(0, 120000))) {
        throw new Error("O AliExpress pediu uma verificação. Conclua a verificação na aba aberta e clique em Sincronizar AliExpress novamente.");
      }
      const payload = JSON.parse(raw);
      remoteTotal = Math.max(remoteTotal, findRemoteTotal(payload));
      const before = output.size;
      collectJsonReviews(payload, output);
      if (output.size - before < 20) break;
    } catch (error) {
      if (error instanceof SyntaxError) break;
      throw error;
    }
  }
  return { reviews: [...output.values()].slice(0, MAX_REVIEWS), remoteTotal };
}

async function submitToStore(bridgeCode, bridgePayload, productId, reviews, remoteTotal) {
  const endpoint = `${new URL(bridgePayload.ori).origin}/api/public/aliexpress-review-browser`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${bridgeCode}`, "Content-Type": "application/json" },
    body: JSON.stringify({ source_product_id: productId, remote_total: remoteTotal || reviews.length, reviews }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) throw new Error(payload?.error || `A loja recusou a importação (HTTP ${response.status}).`);
  return payload;
}

async function runImport({ bridgeCode, tabId, productId }) {
  const bridge = parseBridgeCode(bridgeCode);
  if (String(bridge.sid) !== String(productId)) throw new Error("O produto aberto não corresponde ao produto vinculado na Absoluto Glamur.");

  let page = await inspectPage(tabId, false);
  let fetched = { reviews: [], remoteTotal: 0 };
  try {
    fetched = await fetchFeedback(productId, page.ownerMemberId);
  } catch (error) {
    if (!page.reviews?.length) throw error;
  }

  if (!fetched.reviews.length && !page.reviews?.length) {
    await inspectPage(tabId, true);
    await new Promise((resolve) => setTimeout(resolve, 2500));
    page = await inspectPage(tabId, false);
  }

  const merged = new Map();
  for (const review of [...fetched.reviews, ...(page.reviews || [])]) {
    const images = (review.images || []).map(safeImage).filter(Boolean).slice(0, MAX_IMAGES);
    if (!review.body || !(review.rating > 0)) continue;
    const normalized = { ...review, images };
    const key = normalized.id || `${normalized.author || ""}|${normalized.rating}|${normalized.reviewed_at || ""}|${normalized.body}`;
    merged.set(key, normalized);
    if (merged.size >= MAX_REVIEWS) break;
  }

  const reviews = [...merged.values()];
  if (!reviews.length) {
    throw new Error("A extensão abriu o produto, mas nenhum comentário ficou disponível. Se o AliExpress pedir login ou verificação, conclua na aba aberta e clique em Sincronizar AliExpress novamente.");
  }
  const remoteTotal = Math.max(fetched.remoteTotal || 0, page.remoteTotal || 0, reviews.length);
  return submitToStore(bridgeCode, bridge, productId, reviews, remoteTotal);
}

function waitForTabComplete(tabId, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("O AliExpress demorou demais para abrir."));
    }, timeoutMs);
    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId !== tabId || changeInfo.status !== "complete") return;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) return;
      if (tab?.status === "complete") {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    });
  });
}

async function runFromStore(message, sender) {
  const bridge = parseBridgeCode(message.bridgeCode);
  if (String(bridge.sid) !== String(message.productId)) throw new Error("O ID AliExpress do produto não corresponde ao código de sincronização.");
  const sourceUrl = new URL(message.sourceUrl);
  if (!/aliexpress\./i.test(sourceUrl.hostname)) throw new Error("URL AliExpress inválida.");

  const storeTabId = sender.tab?.id;
  const tab = await chrome.tabs.create({ url: sourceUrl.toString(), active: true });
  if (!tab.id) throw new Error("Não foi possível abrir o produto no AliExpress.");
  try {
    await waitForTabComplete(tab.id);
    await new Promise((resolve) => setTimeout(resolve, 1800));
    const result = await runImport({ bridgeCode: message.bridgeCode, tabId: tab.id, productId: message.productId });
    await chrome.tabs.remove(tab.id).catch(() => undefined);
    if (storeTabId) await chrome.tabs.update(storeTabId, { active: true }).catch(() => undefined);
    return result;
  } catch (error) {
    if (storeTabId) await chrome.tabs.update(storeTabId, { active: true }).catch(() => undefined);
    throw error;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "AG_IMPORT_ALIEXPRESS_REVIEWS") {
    const tabId = message.tabId || sender.tab?.id;
    if (!tabId) {
      sendResponse({ ok: false, error: "Não foi possível identificar a aba do AliExpress." });
      return false;
    }
    runImport({ ...message, tabId })
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    return true;
  }

  if (message?.type === "AG_IMPORT_FROM_STORE") {
    runFromStore(message, sender)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    return true;
  }

  return false;
});
