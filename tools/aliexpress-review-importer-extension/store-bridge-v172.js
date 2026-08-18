const ALLOWED_STORE_ORIGINS = new Set([
  "https://absolutoglamur.com.br",
  "https://www.absolutoglamur.com.br",
]);
const AG_JOB_PREFIX = "agReviewJob:";
const pendingRequests = new Set();

async function isEnabled() {
  const saved = await chrome.storage.local.get(["agExtensionEnabled"]);
  if (typeof saved.agExtensionEnabled !== "boolean") {
    await chrome.storage.local.set({ agExtensionEnabled: true });
    return true;
  }
  return saved.agExtensionEnabled;
}

function postReady(requestId = null, enabled = true) {
  window.postMessage({
    source: "absoluto-glamur-extension",
    type: "AG_EXTENSION_READY",
    requestId,
    version: chrome.runtime.getManifest().version,
    enabled,
  }, window.location.origin);
}

function postResult(requestId, payload) {
  window.postMessage({
    source: "absoluto-glamur-extension",
    type: "AG_REVIEW_SYNC_RESULT",
    requestId,
    ...payload,
  }, window.location.origin);
}

function postProgress(requestId, stage) {
  window.postMessage({
    source: "absoluto-glamur-extension",
    type: "AG_REVIEW_SYNC_PROGRESS",
    requestId,
    stage: String(stage || "Coletando avaliações..."),
  }, window.location.origin);
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  for (const [key, change] of Object.entries(changes)) {
    if (!key.startsWith(AG_JOB_PREFIX)) continue;
    const requestId = key.slice(AG_JOB_PREFIX.length);
    if (!pendingRequests.has(requestId)) continue;
    const job = change.newValue;
    if (!job) continue;

    if (job.stage) postProgress(requestId, job.stage);
    if (job.status === "success") {
      pendingRequests.delete(requestId);
      postResult(requestId, job.result || { ok: false, error: "A coleta terminou sem resultado." });
      setTimeout(() => chrome.storage.local.remove(key).catch(() => undefined), 10000);
    } else if (job.status === "error") {
      pendingRequests.delete(requestId);
      postResult(requestId, { ok: false, error: job.error || "A extensão não conseguiu coletar as avaliações." });
      setTimeout(() => chrome.storage.local.remove(key).catch(() => undefined), 10000);
    }
  }
});

window.addEventListener("message", async (event) => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  if (!ALLOWED_STORE_ORIGINS.has(event.origin)) return;
  const data = event.data;
  if (!data || data.source !== "absoluto-glamur-store") return;
  const enabled = await isEnabled();

  if (data.type === "AG_EXTENSION_PING") {
    postReady(String(data.requestId || ""), enabled);
    return;
  }

  if (data.type !== "AG_REVIEW_SYNC_REQUEST") return;
  const requestId = String(data.requestId || "");
  if (!enabled) {
    postResult(requestId, {
      ok: false,
      error: "A extensão Absoluto Glamur está DESLIGADA. Clique no ícone da extensão e pressione Ligar.",
    });
    return;
  }

  const productId = String(data.productId || "");
  const sourceUrl = String(data.sourceUrl || "");
  if (!requestId || !/^\d{5,}$/.test(productId) || !/^https:\/\/[^/]*aliexpress\./i.test(sourceUrl)) {
    postResult(requestId, { ok: false, error: "Solicitação de sincronização inválida." });
    return;
  }

  pendingRequests.add(requestId);
  postProgress(requestId, "Abrindo o produto no AliExpress na mesma janela do Chrome...");
  chrome.runtime.sendMessage({
    type: "AG_START_REVIEW_JOB_V172",
    requestId,
    productId,
    sourceUrl,
  }, (response) => {
    if (chrome.runtime.lastError) {
      pendingRequests.delete(requestId);
      postResult(requestId, {
        ok: false,
        error: chrome.runtime.lastError.message || "A extensão não conseguiu iniciar a coleta.",
      });
      return;
    }
    if (!response?.ok) {
      pendingRequests.delete(requestId);
      postResult(requestId, response || { ok: false, error: "A extensão não conseguiu iniciar a coleta." });
      return;
    }
    postProgress(
      requestId,
      response.reused
        ? "Produto localizado no AliExpress. Coletando avaliações..."
        : "Aba do produto aberta no AliExpress. Coletando avaliações...",
    );
  });
});

isEnabled().then((enabled) => postReady(null, enabled)).catch(() => postReady(null, true));
