const AG_JOB_PREFIX = "agReviewJob:";
const AG_MAX_REVIEWS = 160;
const runningJobs = new Set();

function agJobKey(requestId) {
  return `${AG_JOB_PREFIX}${requestId}`;
}

function agExtractProductIdFromUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value, location.href);
    const pathMatch = url.pathname.match(/\/item\/(\d{5,})/i);
    if (pathMatch?.[1]) return pathMatch[1];
    return url.searchParams.get("productId") || url.searchParams.get("product_id") || "";
  } catch {
    return "";
  }
}

function agPageProductId() {
  const direct = agExtractProductIdFromUrl(location.href);
  if (direct) return direct;
  const ref = agExtractProductIdFromUrl(document.referrer);
  if (ref) return ref;
  try {
    if (window.parent !== window) {
      const parentId = agExtractProductIdFromUrl(window.parent.location.href);
      if (parentId) return parentId;
    }
  } catch {}
  return "";
}

function agClean(value, max = 8000) {
  if (value == null) return null;
  const out = String(value).replace(/\s+/g, " ").trim();
  return out ? out.slice(0, max) : null;
}

function agRating(value) {
  if (value == null || value === "") return 0;
  const raw = String(value).replace("%", "").replace(",", ".");
  const match = raw.match(/\d+(?:\.\d+)?/);
  const parsed = Number.parseFloat(match?.[0] || raw);
  if (!Number.isFinite(parsed)) return 0;
  const normalized = parsed > 5 && parsed <= 100 ? parsed / 20 : parsed;
  return Math.min(5, Math.max(0, Math.round(normalized * 10) / 10));
}

function agSafeImage(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.startsWith("//") ? `https:${value}` : value, location.href);
    if (!/^https?:$/.test(url.protocol)) return null;
    const host = url.hostname.toLowerCase();
    if (!(host.includes("alicdn") || host.includes("aliexpress") || host.includes("aliimg") || host.includes("ae01"))) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function agAllRoots() {
  const roots = [document];
  const queue = [document.documentElement];
  const seen = new Set();
  while (queue.length) {
    const node = queue.shift();
    if (!node || seen.has(node)) continue;
    seen.add(node);
    if (node.shadowRoot) roots.push(node.shadowRoot);
    for (const child of node.children || []) queue.push(child);
  }
  return roots;
}

function agQueryAll(selector) {
  const out = [];
  for (const root of agAllRoots()) {
    try { out.push(...root.querySelectorAll(selector)); } catch {}
  }
  return out;
}

function agFindReviewTrigger() {
  const selectors = ["button", "a", "[role='tab']", "[role='button']", "[data-pl='product-reviewer']", "[class*='review']", "[class*='feedback']"];
  for (const selector of selectors) {
    const nodes = agQueryAll(selector);
    const candidate = nodes.find((node) => {
      const text = agClean(node.textContent, 180)?.toLowerCase() || "";
      return text.length > 0 && /(avaliações|avaliacoes|reviews?|feedback|comentários|comentarios)/.test(text);
    });
    if (candidate) return candidate;
  }
  return null;
}

function agInferRating(block) {
  const attrs = ["data-rating", "data-score", "data-star", "aria-label", "title"];
  for (const node of [block, ...block.querySelectorAll("[data-rating],[data-score],[data-star],[aria-label],[title]")]) {
    for (const attr of attrs) {
      const value = node.getAttribute?.(attr);
      if (!value) continue;
      const direct = value.match(/([1-5](?:[.,]\d+)?)\s*(?:\/\s*5|de\s*5|out\s*of\s*5|stars?|estrelas?)/i);
      if (direct) return agRating(direct[1]);
      if (/^(?:[1-5](?:[.,]\d+)?)$/.test(value.trim())) return agRating(value);
    }
  }

  const stars = [...block.querySelectorAll("svg,span,i")].filter((node) => {
    const label = `${node.getAttribute?.("aria-label") || ""} ${node.className?.baseVal || node.className || ""}`.toLowerCase();
    return /star|estrela/.test(label);
  });
  if (stars.length >= 1 && stars.length <= 5) return stars.length;

  for (const node of block.querySelectorAll("[style*='width']")) {
    const width = node.getAttribute("style")?.match(/width\s*:\s*(\d+(?:\.\d+)?)%/i)?.[1];
    if (width) {
      const n = Number(width) / 20;
      if (n > 0 && n <= 5) return Math.round(n * 10) / 10;
    }
  }
  return 0;
}

function agCandidateBlocks() {
  const selectors = [
    "[data-review-id]",
    "[data-feedback-id]",
    "[class*='review-item']",
    "[class*='reviewItem']",
    "[class*='feedback-item']",
    "[class*='feedbackItem']",
    "[class*='review-card']",
    "[class*='reviewCard']",
    "[data-pl*='review']",
  ];
  const seen = new Set();
  const out = [];
  for (const selector of selectors) {
    for (const node of agQueryAll(selector)) {
      if (seen.has(node)) continue;
      seen.add(node);
      out.push(node);
    }
  }

  if (out.length < 3) {
    const textNodes = agQueryAll("article,li,section,div").filter((node) => {
      const text = agClean(node.innerText || node.textContent, 9000) || "";
      if (text.length < 20 || text.length > 4500) return false;
      const lower = text.toLowerCase();
      if (/adicionar ao carrinho|compre agora|frete grátis|frete gratis/.test(lower) && text.length > 600) return false;
      return agInferRating(node) > 0;
    });
    for (const node of textNodes) {
      if (seen.has(node)) continue;
      seen.add(node);
      out.push(node);
      if (out.length >= 200) break;
    }
  }
  return out.slice(0, 220);
}

function agExtractReviews() {
  const reviews = new Map();
  for (const block of agCandidateBlocks()) {
    const rawText = agClean(block.innerText || block.textContent, 8000);
    if (!rawText || rawText.length < 8 || rawText.length > 4500) continue;
    const rating = agInferRating(block);
    if (!(rating > 0 && rating <= 5)) continue;

    const bodySelectors = [
      "[class*='review-content']",
      "[class*='reviewContent']",
      "[class*='feedback-content']",
      "[class*='feedbackContent']",
      "[class*='review-text']",
      "[class*='feedback-text']",
      "p",
    ];
    let body = null;
    for (const selector of bodySelectors) {
      const candidates = [...block.querySelectorAll(selector)]
        .map((node) => agClean(node.textContent, 8000))
        .filter((text) => text && text.length >= 8 && text.length <= 3000);
      body = candidates.sort((a, b) => b.length - a.length)[0] || body;
      if (body) break;
    }
    body ||= rawText;
    if (!body || body.length < 8) continue;

    const authorNode = block.querySelector("[class*='user-name'],[class*='userName'],[class*='buyer-name'],[class*='buyerName'],[class*='author']");
    const countryNode = block.querySelector("[class*='country'],[data-country]");
    const images = [...block.querySelectorAll("img")]
      .map((img) => agSafeImage(img.currentSrc || img.src || img.getAttribute("data-src")))
      .filter(Boolean)
      .slice(0, 8);

    const id = agClean(block.getAttribute("data-review-id") || block.getAttribute("data-feedback-id") || block.id, 180);
    const review = {
      id,
      author: agClean(authorNode?.textContent, 180),
      country: agClean(countryNode?.getAttribute?.("data-country") || countryNode?.textContent, 24),
      rating,
      title: null,
      body,
      images,
      reviewed_at: null,
    };
    const key = id || `${review.author || ""}|${rating}|${body.slice(0, 500)}`;
    reviews.set(key, review);
    if (reviews.size >= AG_MAX_REVIEWS) break;
  }
  return [...reviews.values()];
}

function agRemoteTotal() {
  const html = document.documentElement?.innerHTML || "";
  let best = 0;
  for (const match of html.matchAll(/["'](?:reviewCount|evaluationCount|totalEvaluation|totalNum|totalCount)["']\s*[:=]\s*["']?(\d{1,7})/gi)) {
    best = Math.max(best, Number(match[1]) || 0);
  }
  const text = document.body?.innerText || "";
  for (const match of text.matchAll(/(?:avaliações|avaliacoes|reviews?)\s*\(?\s*(\d{1,7})\s*\)?/gi)) {
    best = Math.max(best, Number(match[1]) || 0);
  }
  return best;
}

function agOverlay(job, stage) {
  if (window.top !== window) return;
  let root = document.getElementById("ag-review-import-status");
  if (!root) {
    root = document.createElement("div");
    root.id = "ag-review-import-status";
    root.style.cssText = "position:fixed;right:18px;bottom:18px;z-index:2147483647;width:320px;padding:14px 16px;border-radius:14px;background:#1b0a12;color:#fff;font:13px/1.45 Arial,sans-serif;box-shadow:0 12px 35px rgba(0,0,0,.28);border:1px solid #ff3b84;";
    document.documentElement.appendChild(root);
  }
  root.innerHTML = `<div style="font-weight:700;margin-bottom:5px">Absoluto Glamur · Avaliações</div><div>${stage}</div><div style="margin-top:7px;font-size:11px;opacity:.7">Produto ${job.productId}</div>`;
}

async function agWriteJob(requestId, patch) {
  const key = agJobKey(requestId);
  const current = (await chrome.storage.local.get(key))[key];
  if (!current) return null;
  const next = { ...current, ...patch, updatedAt: Date.now() };
  await chrome.storage.local.set({ [key]: next });
  return next;
}

async function agRunJob(requestId, job) {
  if (runningJobs.has(requestId)) return;
  runningJobs.add(requestId);
  try {
    await agWriteJob(requestId, { status: "collecting", stage: "Abrindo a área de avaliações no AliExpress..." });
    agOverlay(job, "Procurando a área de avaliações...");

    if (window.top === window) {
      const trigger = agFindReviewTrigger();
      if (trigger) {
        try {
          trigger.scrollIntoView({ block: "center", behavior: "smooth" });
          await new Promise((resolve) => setTimeout(resolve, 700));
          trigger.click();
        } catch {}
      }

      const positions = [0.45, 0.62, 0.76, 0.9, 1];
      for (const ratio of positions) {
        const height = Math.max(document.body?.scrollHeight || 0, document.documentElement?.scrollHeight || 0);
        window.scrollTo({ top: Math.floor(height * ratio), behavior: "smooth" });
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
    }

    const started = Date.now();
    while (Date.now() - started < 48_000) {
      const latest = (await chrome.storage.local.get(agJobKey(requestId)))[agJobKey(requestId)];
      if (!latest || latest.status === "success" || latest.status === "error") return;

      const reviews = agExtractReviews();
      if (reviews.length > 0) {
        const total = Math.max(agRemoteTotal(), reviews.length);
        await agWriteJob(requestId, {
          status: "success",
          stage: `${reviews.length} avaliações encontradas`,
          result: {
            ok: true,
            reviews,
            imported: reviews.length,
            withPhotos: reviews.filter((review) => review.images?.length).length,
            remoteTotal: total,
          },
        });
        agOverlay(job, `${reviews.length} avaliações encontradas. Voltando para a Absoluto Glamur...`);
        return;
      }

      if (window.top === window) {
        agOverlay(job, "Carregando avaliações... aguarde");
        const trigger = agFindReviewTrigger();
        if (trigger) {
          try { trigger.click(); } catch {}
        }
        window.scrollBy({ top: Math.max(500, window.innerHeight * 0.8), behavior: "smooth" });
      }
      await agWriteJob(requestId, { status: "collecting", stage: "Aguardando o AliExpress renderizar os comentários..." });
      await new Promise((resolve) => setTimeout(resolve, 1800));
    }

    const latest = (await chrome.storage.local.get(agJobKey(requestId)))[agJobKey(requestId)];
    if (latest && latest.status !== "success") {
      await agWriteJob(requestId, {
        status: "error",
        error: "A extensão abriu o produto e tentou carregar a área de avaliações, mas o AliExpress não renderizou comentários legíveis nesta página. Deixe a aba aberta na seção Avaliações e tente novamente.",
      });
      agOverlay(job, "Não encontrei comentários renderizados. Abra a seção Avaliações e tente novamente.");
    }
  } catch (error) {
    await agWriteJob(requestId, {
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    }).catch(() => undefined);
  } finally {
    runningJobs.delete(requestId);
  }
}

async function agScanJobs() {
  const productId = agPageProductId();
  if (!productId) return;
  const all = await chrome.storage.local.get(null);
  for (const [key, job] of Object.entries(all)) {
    if (!key.startsWith(AG_JOB_PREFIX) || !job || job.productId !== productId) continue;
    if (!["opening", "ready", "collecting"].includes(job.status)) continue;
    const requestId = key.slice(AG_JOB_PREFIX.length);
    void agRunJob(requestId, job);
  }
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  const productId = agPageProductId();
  if (!productId) return;
  for (const [key, change] of Object.entries(changes)) {
    if (!key.startsWith(AG_JOB_PREFIX)) continue;
    const job = change.newValue;
    if (!job || job.productId !== productId || !["opening", "ready", "collecting"].includes(job.status)) continue;
    void agRunJob(key.slice(AG_JOB_PREFIX.length), job);
  }
});

void agScanJobs();
setTimeout(() => void agScanJobs(), 1500);
setTimeout(() => void agScanJobs(), 4500);
