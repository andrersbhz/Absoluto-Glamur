const AG_JOB_PREFIX = "agReviewJob:";
const AG_JOB_TTL_MS = 10 * 60 * 1000;

async function agEnabled() {
  const saved = await chrome.storage.local.get(["agExtensionEnabled"]);
  if (typeof saved.agExtensionEnabled !== "boolean") {
    await chrome.storage.local.set({ agExtensionEnabled: true });
    return true;
  }
  return saved.agExtensionEnabled;
}

async function agFindOrOpenProductTab(productId, sourceUrl) {
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
    return exact.id;
  }
  const tab = await chrome.tabs.create({ url: sourceUrl, active: true });
  if (!tab.id) throw new Error("Não foi possível abrir o produto no AliExpress.");
  return tab.id;
}

async function agStartJob(message, sender) {
  if (!(await agEnabled())) {
    throw new Error(
      "A extensão Absoluto Glamur está DESLIGADA. Clique no ícone da extensão e pressione Ligar.",
    );
  }

  const requestId = String(message.requestId || "");
  const productId = String(message.productId || "");
  const sourceUrl = String(message.sourceUrl || "");
  if (!requestId || !/^\d{5,}$/.test(productId))
    throw new Error("Solicitação de sincronização inválida.");
  let parsed;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    throw new Error("URL AliExpress inválida.");
  }
  if (!/aliexpress\./i.test(parsed.hostname)) throw new Error("URL AliExpress inválida.");

  const key = `${AG_JOB_PREFIX}${requestId}`;
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

  const tabId = await agFindOrOpenProductTab(productId, sourceUrl);
  await chrome.storage.local.set({
    [key]: {
      ...job,
      aliTabId: tabId,
      status: "ready",
      stage: "Produto aberto. Aguardando a página de avaliações...",
      updatedAt: Date.now(),
    },
  });
  return { accepted: true, tabId };
}

async function agPruneJobs() {
  const all = await chrome.storage.local.get(null);
  const now = Date.now();
  const remove = [];
  for (const [key, value] of Object.entries(all)) {
    if (!key.startsWith(AG_JOB_PREFIX) || !value) continue;
    if (now - Number(value.updatedAt || value.createdAt || 0) > AG_JOB_TTL_MS) remove.push(key);
  }
  if (remove.length) await chrome.storage.local.remove(remove);
}

chrome.runtime.onInstalled.addListener(() => {
  void agEnabled();
  void agPruneJobs();
});
chrome.runtime.onStartup.addListener(() => void agPruneJobs());

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "AG_START_REVIEW_JOB_V16") return false;
  agStartJob(message, sender)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) =>
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }),
    );
  return true;
});
