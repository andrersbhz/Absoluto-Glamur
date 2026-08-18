const AG_FETCH_TIMEOUT_MS = 12_000;
const AG_TOTAL_SYNC_TIMEOUT_MS = 85_000;

// AliExpress occasionally leaves feedback requests pending instead of returning
// an error. Bound every network request before loading the v1.3 collector so a
// single stalled request can no longer hold the extension until the storefront
// timeout expires.
const agNativeFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (input, init = {}) => {
  const controller = new AbortController();
  const externalSignal = init?.signal;
  const abortFromExternal = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", abortFromExternal, { once: true });
  }

  const timer = setTimeout(() => controller.abort(), AG_FETCH_TIMEOUT_MS);
  try {
    return await agNativeFetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted && !externalSignal?.aborted) {
      throw new Error(
        "O AliExpress demorou demais para responder à consulta de avaliações. A extensão cancelou a requisição travada automaticamente.",
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
    if (externalSignal) externalSignal.removeEventListener("abort", abortFromExternal);
  }
};

importScripts("background-v13.js");

function agResolveCollector() {
  if (typeof collectFromStore === "function") return collectFromStore;
  if (typeof agCollectFromStore === "function") return agCollectFromStore;
  throw new Error(
    "O coletor interno da extensão não foi carregado. Reinstale a extensão Absoluto Glamur 1.4.0.",
  );
}

// v1.4 uses its own message name, so the v1.3 listener ignores it. This lets us
// add an overall watchdog without duplicating the collector implementation.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "AG_COLLECT_FROM_STORE_V14") return false;

  let settled = false;
  const finish = (payload) => {
    if (settled) return;
    settled = true;
    clearTimeout(watchdog);
    sendResponse(payload);
  };

  const watchdog = setTimeout(() => {
    finish({
      ok: false,
      error:
        "A extensão interrompeu a coleta porque o AliExpress não respondeu dentro do limite. Verifique se a aba do produto abriu corretamente, conclua qualquer login/CAPTCHA e tente novamente.",
    });
  }, AG_TOTAL_SYNC_TIMEOUT_MS);

  Promise.resolve()
    .then(() => agResolveCollector())
    .then((collector) => collector(message, sender))
    .then((result) => finish({ ok: true, ...result }))
    .catch((error) =>
      finish({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
    );

  return true;
});
