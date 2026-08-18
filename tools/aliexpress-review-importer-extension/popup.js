const productEl = document.getElementById("productId");
const codeEl = document.getElementById("bridgeCode");
const importButton = document.getElementById("importButton");
const clearButton = document.getElementById("clearButton");
const resultEl = document.getElementById("result");

function productIdFromUrl(url) {
  const match = String(url || "").match(/\/item\/(\d{5,})(?:\.html)?/i) || String(url || "").match(/\b(\d{8,})\b/);
  return match?.[1] || null;
}

function decodeBase64Url(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function parseBridgeCode(code) {
  const parts = String(code || "").trim().split(".");
  if (parts.length !== 3 || parts[0] !== "AG1") throw new Error("Código inválido. Gere um novo código no painel da Absoluto Glamur.");
  const payload = JSON.parse(decodeBase64Url(parts[1]));
  if (!payload?.ori || !payload?.sid || !payload?.exp) throw new Error("Código incompleto.");
  if (Math.floor(Date.now() / 1000) > Number(payload.exp)) throw new Error("Este código expirou. Gere outro no painel.");
  return payload;
}

function show(message, kind = "info") {
  resultEl.hidden = false;
  resultEl.className = `result ${kind}`;
  resultEl.textContent = message;
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function load() {
  const tab = await activeTab();
  const productId = productIdFromUrl(tab?.url);
  productEl.textContent = productId || "Abra uma página de produto";
  const saved = await chrome.storage.local.get(["agBridgeCode"]);
  if (saved.agBridgeCode) codeEl.value = saved.agBridgeCode;
}

importButton.addEventListener("click", async () => {
  importButton.disabled = true;
  try {
    const tab = await activeTab();
    const productId = productIdFromUrl(tab?.url);
    if (!tab?.id || !productId) throw new Error("Abra o anúncio do produto no AliExpress antes de importar.");

    const code = codeEl.value.trim();
    const payload = parseBridgeCode(code);
    if (String(payload.sid) !== productId) {
      throw new Error(`O código foi gerado para o AliExpress ID ${payload.sid}, mas a aba aberta é ${productId}.`);
    }

    const destinationOrigin = new URL(payload.ori).origin;
    const granted = await chrome.permissions.request({ origins: [`${destinationOrigin}/*`] });
    if (!granted) throw new Error("Autorize o acesso ao domínio da Absoluto Glamur para enviar as avaliações.");

    await chrome.storage.local.set({ agBridgeCode: code });
    show("Buscando avaliações com a sessão do seu navegador…", "info");

    const response = await chrome.runtime.sendMessage({
      type: "AG_IMPORT_ALIEXPRESS_REVIEWS",
      bridgeCode: code,
      tabId: tab.id,
      productId,
    });
    if (!response?.ok) throw new Error(response?.error || "Não foi possível concluir a importação.");

    show(
      `${response.imported} avaliação(ões) importada(s).\n` +
      `${response.withPhotos || 0} com foto(s). Total detectado: ${response.remoteTotal || response.imported}.`,
      "success",
    );
  } catch (error) {
    show(error instanceof Error ? error.message : String(error), "error");
  } finally {
    importButton.disabled = false;
  }
});

clearButton.addEventListener("click", async () => {
  codeEl.value = "";
  await chrome.storage.local.remove(["agBridgeCode"]);
  show("Código removido.", "info");
});

load().catch((error) => show(error instanceof Error ? error.message : String(error), "error"));
