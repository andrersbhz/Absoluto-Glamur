const ALLOWED_STORE_ORIGINS = new Set([
  "https://absolutoglamur.com.br",
  "https://www.absolutoglamur.com.br",
]);

function postResult(requestId, payload) {
  window.postMessage(
    {
      source: "absoluto-glamur-extension",
      type: "AG_REVIEW_SYNC_RESULT",
      requestId,
      ...payload,
    },
    window.location.origin,
  );
}

window.addEventListener("message", (event) => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  if (!ALLOWED_STORE_ORIGINS.has(event.origin)) return;
  const data = event.data;
  if (!data || data.source !== "absoluto-glamur-store" || data.type !== "AG_REVIEW_SYNC_REQUEST") return;

  const requestId = String(data.requestId || "");
  const bridgeCode = String(data.bridgeCode || "");
  const productId = String(data.productId || "");
  const sourceUrl = String(data.sourceUrl || "");
  if (!requestId || !bridgeCode || !/^\d{5,}$/.test(productId) || !/^https:\/\/[^/]*aliexpress\./i.test(sourceUrl)) {
    postResult(requestId, { ok: false, error: "Solicitação de sincronização inválida." });
    return;
  }

  chrome.runtime.sendMessage(
    {
      type: "AG_IMPORT_FROM_STORE",
      bridgeCode,
      productId,
      sourceUrl,
    },
    (response) => {
      if (chrome.runtime.lastError) {
        postResult(requestId, { ok: false, error: chrome.runtime.lastError.message || "A extensão não respondeu." });
        return;
      }
      postResult(requestId, response || { ok: false, error: "A extensão não retornou resultado." });
    },
  );
});

window.postMessage(
  {
    source: "absoluto-glamur-extension",
    type: "AG_EXTENSION_READY",
    version: chrome.runtime.getManifest().version,
  },
  window.location.origin,
);
