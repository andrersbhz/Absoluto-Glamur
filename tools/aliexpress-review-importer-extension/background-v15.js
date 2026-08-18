importScripts("background-v13.js");

const AG_V15_TOTAL_TIMEOUT_MS = 90_000;
const AG_V15_PAGE_FETCH_TIMEOUT_MS = 15_000;
const activeSyncByProduct = new Map();

async function agV15EnsureProductTab(productId, sourceUrl) {
  const tabs = await chrome.tabs.query({});
  const exact = tabs.find((tab) => {
    if (!tab.id || !tab.url) return false;
    try {
      const url = new URL(tab.url);
      return /aliexpress\./i.test(url.hostname) && url.pathname.includes(`/item/${productId}`);
    } catch {
      return false;
    }
  });

  if (exact?.id) {
    await chrome.tabs.update(exact.id, { active: true }).catch(() => undefined);
    return { tabId: exact.id, created: false };
  }

  const tab = await chrome.tabs.create({ url: sourceUrl, active: true });
  if (!tab.id) throw new Error("Não foi possível abrir o produto no AliExpress.");
  return { tabId: tab.id, created: true };
}

async function agV15PrepareReviewArea(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: async () => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const normalize = (value) => (value || "").replace(/\s+/g, " ").trim().toLowerCase();

      const selectors = [
        "button",
        "a",
        "[role='tab']",
        "[role='button']",
        "[data-pl='product-reviewer']",
        "[class*='review']",
        "[class*='feedback']",
      ];

      for (const selector of selectors) {
        const nodes = [...document.querySelectorAll(selector)];
        const candidate = nodes.find((node) => {
          const text = normalize(node.textContent);
          return text.length > 0 && text.length < 140 && /(avaliações|avaliacoes|reviews?|feedback)/.test(text);
        });
        if (candidate) {
          candidate.scrollIntoView({ block: "center", behavior: "instant" });
          await sleep(600);
          try { candidate.click(); } catch {}
          await sleep(1800);
          break;
        }
      }

      const height = Math.max(document.body?.scrollHeight || 0, document.documentElement?.scrollHeight || 0);
      const positions = [0.35, 0.55, 0.72, 0.88, 1];
      for (const ratio of positions) {
        window.scrollTo({ top: Math.floor(height * ratio), behavior: "instant" });
        await sleep(550);
      }
    },
  }).catch(() => undefined);
}

async function agV15FetchFeedbackInsidePage(tabId, productId, ownerMemberId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: async (pid, owner, timeoutMs) => {
      const maxReviews = 160;
      const maxImages = 8;
      const pages = 5;
      const pageSize = 20;

      const clean = (value, max = 8000) => {
        if (value == null) return null;
        const out = String(value).replace(/\s+/g, " ").trim();
        return out ? out.slice(0, max) : null;
      };
      const ratingOfLocal = (value) => {
        if (value == null || value === "") return 0;
        const raw = String(value).replace("%", "").replace(",", ".");
        const match = raw.match(/\d+(?:\.\d+)?/);
        const parsed = Number.parseFloat(match?.[0] || raw);
        if (!Number.isFinite(parsed)) return 0;
        const normalized = parsed > 5 && parsed <= 100 ? parsed / 20 : parsed;
        return Math.min(5, Math.max(0, Math.round(normalized * 10) / 10));
      };
      const dateOfLocal = (value) => {
        if (!value) return null;
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date.toISOString();
      };
      const imageOf = (value) => {
        if (typeof value !== "string" || !value.trim()) return null;
        try {
          const url = new URL(value.startsWith("//") ? `https:${value}` : value);
          if (!/^https?:$/.test(url.protocol)) return null;
          const host = url.hostname.toLowerCase();
          if (!(host.includes("alicdn") || host.includes("aliexpress") || host.includes("aliimg") || host.includes("ae01"))) return null;
          return url.toString();
        } catch { return null; }
      };
      const collectImgs = (value, output = [], depth = 0) => {
        if (value == null || depth > 5 || output.length >= maxImages) return output;
        if (typeof value === "string") {
          const image = imageOf(value);
          if (image && !output.includes(image)) output.push(image);
          return output;
        }
        if (Array.isArray(value)) {
          for (const item of value) collectImgs(item, output, depth + 1);
          return output;
        }
        if (typeof value === "object") {
          for (const item of Object.values(value)) {
            collectImgs(item, output, depth + 1);
            if (output.length >= maxImages) break;
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
        const rating = ratingOfLocal(pick("buyerEval", "evaluteRate", "evaluateRate", "evaluation", "rating", "star", "stars", "score"));
        const original = clean(pick("buyerFeedback", "feedback", "content", "reviewContent", "review_content", "comment", "evaContent"));
        const translated = clean(pick("buyerTranslationFeedback", "translationFeedback", "translatedFeedback", "translated_content"));
        const body = translated || original;
        if (!body || !(rating > 0)) return null;
        return {
          id: clean(pick("evaluationIdStr", "evaluationId", "feedbackId", "feedback_id", "reviewId", "review_id", "id"), 180),
          author: clean(pick("buyerName", "buyer_name", "buyer_blured_name", "userName", "author", "displayName"), 180),
          country: clean(pick("buyerCountry", "buyer_country", "buyer_country_code", "country", "countryCode"), 24),
          rating,
          title: clean(pick("skuInfo", "sku_info", "productSku", "product_sku", "title"), 500),
          body,
          images: collectImgs(pick("images", "buyerFeedbackPicList", "imageUrls", "image_urls", "photos", "pictures")),
          reviewed_at: dateOfLocal(pick("evalDate", "buyerFeedbackDate", "feedbackDate", "feedback_date", "date", "create_time", "createdAt")),
        };
      };
      const reviews = new Map();
      let remoteTotal = 0;
      const walk = (value, depth = 0) => {
        if (value == null || depth > 15 || reviews.size >= maxReviews) return;
        if (Array.isArray(value)) {
          for (const item of value) walk(item, depth + 1);
          return;
        }
        if (typeof value !== "object") return;
        const review = normalizeReview(value);
        if (review) {
          const key = review.id || `${review.author || ""}|${review.rating}|${review.reviewed_at || ""}|${review.body}`;
          reviews.set(key, review);
        }
        for (const [key, child] of Object.entries(value)) {
          if (/^(totalNum|total_number|totalCount|totalEvaluation|totalResults|total_results|reviewCount|evaluationCount)$/i.test(key)) {
            const n = Number(String(child).replace(/[^\d.-]/g, ""));
            if (Number.isFinite(n) && n >= 0 && n <= 2000000) remoteTotal = Math.max(remoteTotal, Math.round(n));
          }
          if (child && typeof child === "object") walk(child, depth + 1);
          if (reviews.size >= maxReviews) break;
        }
      };

      for (let page = 1; page <= pages && reviews.size < maxReviews; page += 1) {
        const url = new URL("https://feedback.aliexpress.com/pc/searchEvaluation.do");
        url.searchParams.set("productId", pid);
        if (owner) url.searchParams.set("ownerMemberId", owner);
        url.searchParams.set("lang", "pt_BR");
        url.searchParams.set("country", "BR");
        url.searchParams.set("page", String(page));
        url.searchParams.set("pageSize", String(pageSize));
        url.searchParams.set("filter", "all");
        url.searchParams.set("sort", "complex_default");

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await fetch(url.toString(), {
            credentials: "include",
            redirect: "follow",
            signal: controller.signal,
            headers: { Accept: "application/json, text/plain, */*" },
          });
          const raw = await response.text();
          if (/captcha|verify you are human|security verification|punish-page|robot check/i.test(raw.slice(0, 160000))) {
            return { reviews: [...reviews.values()], remoteTotal, verification: true };
          }
          let payload = null;
          try { payload = JSON.parse(raw); } catch {}
          if (!payload) break;
          const before = reviews.size;
          walk(payload);
          if (reviews.size - before < pageSize) break;
        } catch (error) {
          if (error?.name === "AbortError") {
            return { reviews: [...reviews.values()], remoteTotal, timedOut: true };
          }
          break;
        } finally {
          clearTimeout(timer);
        }
      }

      return { reviews: [...reviews.values()], remoteTotal };
    },
    args: [productId, ownerMemberId || null, AG_V15_PAGE_FETCH_TIMEOUT_MS],
  });
  return result || { reviews: [], remoteTotal: 0 };
}

async function agV15CollectProductReviews(tabId, productId) {
  await agV15PrepareReviewArea(tabId);
  let page = await inspectPage(tabId, false);
  let pageFetch = { reviews: [], remoteTotal: 0 };
  try {
    pageFetch = await agV15FetchFeedbackInsidePage(tabId, productId, page.ownerMemberId);
  } catch {
    pageFetch = { reviews: [], remoteTotal: 0 };
  }

  if (!pageFetch.reviews?.length && !page.reviews?.length) {
    await agV15PrepareReviewArea(tabId);
    await new Promise((resolve) => setTimeout(resolve, 1800));
    page = await inspectPage(tabId, true);
  }

  const merged = new Map();
  for (const review of [...(pageFetch.reviews || []), ...(page.reviews || [])]) {
    if (!review?.body || !(review.rating > 0)) continue;
    const key = review.id || `${review.author || ""}|${review.rating}|${review.reviewed_at || ""}|${review.body}`;
    merged.set(key, review);
    if (merged.size >= 160) break;
  }

  const reviews = [...merged.values()];
  if (!reviews.length) {
    if (pageFetch.verification) {
      throw new Error("O AliExpress abriu o produto, mas pediu verificação/login para liberar as avaliações. Conclua a verificação na aba e clique em Sincronizar AliExpress novamente.");
    }
    if (pageFetch.timedOut) {
      throw new Error("A página do AliExpress abriu, mas a consulta de avaliações não respondeu dentro do limite. Deixe a aba aberta, confirme que está logado e tente novamente.");
    }
    throw new Error("A página do AliExpress abriu normalmente, mas os comentários não foram expostos à extensão. Abra manualmente a seção Avaliações nessa aba e clique em Sincronizar AliExpress novamente.");
  }

  return {
    reviews,
    imported: reviews.length,
    withPhotos: reviews.filter((review) => review.images?.length).length,
    remoteTotal: Math.max(pageFetch.remoteTotal || 0, page.remoteTotal || 0, reviews.length),
  };
}

async function agV15Run(message, sender) {
  const enabledState = await chrome.storage.local.get(["agExtensionEnabled"]);
  if (enabledState.agExtensionEnabled === false) {
    throw new Error("A extensão Absoluto Glamur está DESLIGADA. Clique no ícone da extensão e pressione Ligar.");
  }

  const productId = String(message.productId || "");
  if (!/^\d{5,}$/.test(productId)) throw new Error("ID AliExpress inválido na solicitação da loja.");
  const sourceUrl = new URL(String(message.sourceUrl || ""));
  if (!/aliexpress\./i.test(sourceUrl.hostname)) throw new Error("URL AliExpress inválida.");

  if (activeSyncByProduct.has(productId)) return activeSyncByProduct.get(productId);

  const task = (async () => {
    const storeTabId = sender.tab?.id;
    const productTab = await agV15EnsureProductTab(productId, sourceUrl.toString());
    try {
      await waitForTabComplete(productTab.tabId, 35_000).catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 2200));
      const result = await agV15CollectProductReviews(productTab.tabId, productId);
      if (storeTabId) await chrome.tabs.update(storeTabId, { active: true }).catch(() => undefined);
      return result;
    } catch (error) {
      if (storeTabId) await chrome.tabs.update(storeTabId, { active: true }).catch(() => undefined);
      throw error;
    }
  })();

  activeSyncByProduct.set(productId, task);
  try {
    return await Promise.race([
      task,
      new Promise((_, reject) => setTimeout(() => reject(new Error("A coleta no AliExpress atingiu o limite total de 90 segundos.")), AG_V15_TOTAL_TIMEOUT_MS)),
    ]);
  } finally {
    activeSyncByProduct.delete(productId);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "AG_COLLECT_FROM_STORE_V15") return false;
  agV15Run(message, sender)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  return true;
});
