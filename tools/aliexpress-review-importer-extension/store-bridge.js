const ALLOWED_STORE_ORIGINS = new Set([
  "https://absolutoglamur.com.br",
  "https://www.absolutoglamur.com.br",
]);

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

  chrome.runtime.sendMessage({
    type: "AG_COLLECT_FROM_STORE_V15",
    requestId,
    productId,
    sourceUrl,
  }, (response) => {
    if (chrome.runtime.lastError) {
      postResult(requestId, {
        ok: false,
        error: chrome.runtime.lastError.message || "A extensão não respondeu.",
      });
      return;
    }
    postResult(requestId, response || { ok: false, error: "A extensão não retornou resultado." });
  });
});

isEnabled().then((enabled) => postReady(null, enabled)).catch(() => postReady(null, true));
