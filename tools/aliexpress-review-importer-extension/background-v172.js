importScripts("background-v17.js");

const AG_V172_JOB_PREFIX = "agReviewJob:";

async function agV172Enabled() {
  const saved = await chrome.storage.local.get(["agExtensionEnabled"]);
  if (typeof saved.agExtensionEnabled !== "boolean") {
    await chrome.storage.local.set({ agExtensionEnabled: true });
    return true;
  }
  return saved.agExtensionEnabled;
}

async function agV172FocusTab(tabId, windowId) {
  if (Number.isInteger(windowId)) {
    await chrome.windows.update(windowId, { focused: true }).catch(() => undefined);
  }
  await chrome.tabs.update(tabId, { active: true }).catch(() => undefined);
}

async function agV172WaitForAliExpressTab(tabId, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab) throw new Error("A aba do AliExpress foi fechada antes de carregar.");
    const currentUrl = String(tab.url || tab.pendingUrl || "");
    if (/^https:\/\/[^/]*aliexpress\./i.test(currentUrl) && (tab.status === "complete" || Date.now() - started > 3500)) {
      return tab;
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab) throw new Error("Não foi possível confirmar a aba do AliExpress.");
  return tab;
}

async function agV172FindOrOpenProductTab(productId, sourceUrl, storeTab) {
  const tabs = await chrome.tabs.query({});
  const exact = tabs.find((tab) => {
    if (!tab.id || !(tab.url || tab.pendingUrl)) return false;
    try {
      const url = new URL(tab.url || tab.pendingUrl);
      return /(^|\.)aliexpress\./i.test(url.hostname) && (
        url.pathname.includes(`/item/${productId}`) ||
        url.searchParams.get("productId") === productId ||
        url.searchParams.get("product_id") === productId
      );
    } catch {
      return false;
    }
  });

  if (exact?.id) {
    await agV172FocusTab(exact.id, exact.windowId);
    const confirmed = await agV172WaitForAliExpressTab(exact.id, 8000);
    return { tabId: exact.id, windowId: confirmed.windowId ?? exact.windowId ?? null, reused: true };
  }

  const options = { url: sourceUrl, active: true };
  if (Number.isInteger(storeTab?.windowId)) options.windowId = storeTab.windowId;

  const tab = await chrome.tabs.create(options);
  if (!tab.id) throw new Error("Não foi possível abrir o produto no AliExpress.");
  await agV172FocusTab(tab.id, tab.windowId ?? storeTab?.windowId);
  const confirmed = await agV172WaitForAliExpressTab(tab.id, 15000);
  return {
    tabId: tab.id,
    windowId: confirmed.windowId ?? tab.windowId ?? storeTab?.windowId ?? null,
    reused: false,
  };
}

async function agV172StartJob(message, sender) {
  if (!(await agV172Enabled())) {
    throw new Error("A extensão Absoluto Glamur está DESLIGADA. Clique no ícone da extensão e pressione Ligar.");
  }

  const requestId = String(message.requestId || "");
  const productId = String(message.productId || "");
  const sourceUrl = String(message.sourceUrl || "");
  if (!requestId || !/^\d{5,}$/.test(productId)) throw new Error("Solicitação de sincronização inválida.");

  let parsed;
  try { parsed = new URL(sourceUrl); } catch { throw new Error("URL AliExpress inválida."); }
  if (!/(^|\.)aliexpress\./i.test(parsed.hostname)) throw new Error("URL AliExpress inválida.");

  const key = `${AG_V172_JOB_PREFIX}${requestId}`;
  const now = Date.now();
  const job = {
    requestId,
    productId,
    sourceUrl,
    storeTabId: sender.tab?.id || null,
    status: "opening",
    stage: "Abrindo o produto no AliExpress...",
    createdAt: now,
    updatedAt: now,
  };
  await chrome.storage.local.set({ [key]: job });

  const opened = await agV172FindOrOpenProductTab(productId, sourceUrl, sender.tab);
  await chrome.storage.local.set({
    [key]: {
      ...job,
      aliTabId: opened.tabId,
      aliWindowId: opened.windowId,
      status: "ready",
      stage: opened.reused
        ? "Produto localizado no AliExpress. Procurando avaliações..."
        : "Aba do produto aberta no AliExpress. Procurando avaliações...",
      updatedAt: Date.now(),
    },
  });

  return { accepted: true, tabId: opened.tabId, windowId: opened.windowId, reused: opened.reused };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "AG_START_REVIEW_JOB_V172") return false;
  agV172StartJob(message, sender)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  return true;
});
