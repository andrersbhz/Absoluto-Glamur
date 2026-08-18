importScripts("background-v16.js");

const AG_V17_FETCH_TIMEOUT_MS = 24_000;

async function agV17FetchReviewsFromPage(message, sender) {
  const requestId = String(message.requestId || "");
  const productId = String(message.productId || "");
  if (!requestId || !/^\d{5,}$/.test(productId)) {
    throw new Error("Solicitação de avaliações 1.7 inválida.");
  }
  if (!sender.tab?.id) throw new Error("A aba do AliExpress não foi identificada.");

  const key = `agReviewJob:${requestId}`;
  const stored = (await chrome.storage.local.get(key))[key];
  if (!stored || stored.productId !== productId) throw new Error("Trabalho de avaliações expirado ou inválido.");
  if (stored.aliTabId && stored.aliTabId !== sender.tab.id) throw new Error("Esta não é a aba vinculada à sincronização.");

  const target = { tabId: sender.tab.id, frameIds: [sender.frameId ?? 0] };
  const [{ result }] = await chrome.scripting.executeScript({
    target,
    world: "MAIN",
    func: async (pid, totalTimeoutMs) => {
      const MAX_REVIEWS = 160;
      const startedAt = Date.now();
      const reviews = new Map();
      let remoteTotal = 0;
      let verification = false;
      let timedOut = false;

      const clean = (value, max = 8000) => {
        if (value == null) return null;
        const out = String(value).replace(/\s+/g, " ").trim();
        return out ? out.slice(0, max) : null;
      };
      const ratingOf = (value) => {
        if (value == null || value === "") return 0;
        const raw = String(value).replace("%", "").replace(",", ".");
        const match = raw.match(/\d+(?:\.\d+)?/);
        const parsed = Number.parseFloat(match?.[0] || raw);
        if (!Number.isFinite(parsed)) return 0;
        const normalized = parsed > 5 && parsed <= 100 ? parsed / 20 : parsed;
        return Math.min(5, Math.max(0, Math.round(normalized * 10) / 10));
      };
      const dateOf = (value) => {
        if (!value) return null;
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date.toISOString();
      };
      const imageOf = (value) => {
        if (typeof value !== "string" || !value.trim()) return null;
        try {
          const url = new URL(value.startsWith("//") ? `https:${value}` : value, location.href);
          if (!/^https?:$/.test(url.protocol)) return null;
          const host = url.hostname.toLowerCase();
          if (!(host.includes("alicdn") || host.includes("aliexpress") || host.includes("aliimg") || host.includes("ae01"))) return null;
          return url.toString();
        } catch { return null; }
      };
      const collectImages = (value, output = [], depth = 0) => {
        if (value == null || depth > 5 || output.length >= 8) return output;
        if (typeof value === "string") {
          const image = imageOf(value);
          if (image && !output.includes(image)) output.push(image);
          return output;
        }
        if (Array.isArray(value)) {
          for (const item of value) collectImages(item, output, depth + 1);
          return output;
        }
        if (typeof value === "object") {
          for (const item of Object.values(value)) {
            collectImages(item, output, depth + 1);
            if (output.length >= 8) break;
          }
        }
        return output;
      };
      const normalizeReview = (raw) => {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
        const pick = (...keys) => {
          for (const key of keys) if (raw[key] != null && raw[key] !== "") return raw[key];
          return null;
        };
        const rating = ratingOf(pick("buyerEval", "evaluteRate", "evaluateRate", "evaluation", "rating", "star", "stars", "score", "starView"));
        const original = clean(pick("buyerFeedback", "feedback", "content", "reviewContent", "review_content", "comment", "evaContent", "text"));
        const translated = clean(pick("buyerTranslationFeedback", "translationFeedback", "translatedFeedback", "translated_content"));
        const body = translated || original;
        if (!body || !(rating > 0)) return null;
        return {
          id: clean(pick("evaluationIdStr", "evaluationId", "feedbackId", "feedback_id", "reviewId", "review_id", "evaId", "id"), 180),
          author: clean(pick("buyerName", "buyer_name", "buyer_blured_name", "anonymousName", "userName", "author", "displayName"), 180),
          country: clean(pick("buyerCountry", "buyer_country", "buyer_country_code", "buyerCountryCode", "country", "countryCode"), 24),
          rating,
          title: clean(pick("skuInfo", "sku_info", "productSku", "product_sku", "title"), 500),
          body,
          images: collectImages(pick("images", "buyerFeedbackPicList", "evaImageList", "imageUrls", "image_urls", "photos", "pictures")),
          reviewed_at: dateOf(pick("evalDate", "buyerFeedbackDate", "feedbackDate", "feedback_date", "evaDate", "date", "create_time", "createdAt")),
        };
      };
      const seenObjects = new WeakSet();
      const walk = (value, depth = 0) => {
        if (value == null || depth > 15 || reviews.size >= MAX_REVIEWS) return;
        if (Array.isArray(value)) {
          for (const item of value) walk(item, depth + 1);
          return;
        }
        if (typeof value !== "object") return;
        if (seenObjects.has(value)) return;
        seenObjects.add(value);
        const review = normalizeReview(value);
        if (review) {
          const key = review.id || `${review.author || ""}|${review.rating}|${review.reviewed_at || ""}|${review.body}`;
          reviews.set(key, review);
        }
        for (const [key, child] of Object.entries(value)) {
          if (/^(totalNum|total_number|totalCount|totalEvaluation|totalResults|total_results|reviewCount|evaluationCount)$/i.test(key)) {
            const n = Number(String(child).replace(/[^\d.-]/g, ""));
            if (Number.isFinite(n) && n >= 0 && n <= 2_000_000) remoteTotal = Math.max(remoteTotal, Math.round(n));
          }
          if (child && typeof child === "object") walk(child, depth + 1);
          if (reviews.size >= MAX_REVIEWS) break;
        }
      };
      const parseText = (raw) => {
        if (!raw) return;
        const head = raw.slice(0, 180_000);
        if (/captcha|verify you are human|security verification|punish-page|robot check|滑块|验证码/i.test(head)) verification = true;
        try { walk(JSON.parse(raw)); } catch {}
      };

      for (const script of [...document.scripts].slice(0, 180)) {
        if (reviews.size >= MAX_REVIEWS) break;
        const text = script.textContent?.trim();
        if (!text || text.length > 1_500_000) continue;
        if (script.type?.includes("json") || text.startsWith("{") || text.startsWith("[")) parseText(text);
      }

      const htmlHead = (document.documentElement?.innerHTML || "").slice(0, 2_500_000);
      const ownerMemberId = htmlHead.match(/["']ownerMemberId["']\s*[:=]\s*["']?(\d{5,})/i)?.[1]
        || htmlHead.match(/["']sellerAdminSeq["']\s*[:=]\s*["']?(\d{5,})/i)?.[1]
        || "";

      const candidates = [];
      const seenUrls = new Set();
      const addUrl = (value) => {
        if (!value || candidates.length >= 24) return;
        try {
          const url = new URL(value, location.href);
          if (!/^https?:$/.test(url.protocol) || !/aliexpress\./i.test(url.hostname)) return;
          if (!/(review|feedback|evaluation|evaluate|comment)/i.test(`${url.pathname}${url.search}`)) return;
          const normalized = url.toString();
          if (!seenUrls.has(normalized)) {
            seenUrls.add(normalized);
            candidates.push(normalized);
          }
        } catch {}
      };

      for (const entry of performance.getEntriesByType("resource")) addUrl(entry.name);

      for (let page = 1; page <= 5; page += 1) {
        const url = new URL("https://feedback.aliexpress.com/pc/searchEvaluation.do");
        url.searchParams.set("productId", pid);
        if (ownerMemberId) url.searchParams.set("ownerMemberId", ownerMemberId);
        url.searchParams.set("lang", "pt_BR");
        url.searchParams.set("country", "BR");
        url.searchParams.set("page", String(page));
        url.searchParams.set("pageSize", "20");
        url.searchParams.set("filter", "all");
        url.searchParams.set("sort", "complex_default");
        candidates.push(url.toString());
      }

      for (const url of candidates) {
        if (reviews.size >= MAX_REVIEWS || Date.now() - startedAt > totalTimeoutMs) break;
        const remaining = Math.max(1500, Math.min(8000, totalTimeoutMs - (Date.now() - startedAt)));
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), remaining);
        try {
          const response = await fetch(url, {
            credentials: "include",
            redirect: "follow",
            signal: controller.signal,
            headers: { Accept: "application/json, text/plain, */*" },
          });
          const raw = await response.text();
          parseText(raw);
        } catch (error) {
          if (error?.name === "AbortError") timedOut = true;
        } finally {
          clearTimeout(timer);
        }
      }

      return {
        reviews: [...reviews.values()].slice(0, MAX_REVIEWS),
        remoteTotal: Math.max(remoteTotal, reviews.size),
        verification,
        timedOut,
        frameUrl: location.href,
      };
    },
    args: [productId, AG_V17_FETCH_TIMEOUT_MS],
  });

  return result || { reviews: [], remoteTotal: 0 };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "AG_FETCH_REVIEWS_V17") return false;
  agV17FetchReviewsFromPage(message, sender)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  return true;
});
