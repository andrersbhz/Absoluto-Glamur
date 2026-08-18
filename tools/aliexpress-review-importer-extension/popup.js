const productEl = document.getElementById("productId");
const codeEl = document.getElementById("bridgeCode");
const importButton = document.getElementById("importButton");
const clearButton = document.getElementById("clearButton");
const resultEl = document.getElementById("result");
const powerCard = document.getElementById("powerCard");
const powerButton = document.getElementById("powerButton");
const powerTitle = document.getElementById("powerTitle");
const powerText = document.getElementById("powerText");
const manualArea = document.getElementById("manualArea");
let extensionEnabled = true;

function productIdFromUrl(url) {
  const match =
    String(url || "").match(/\/item\/(\d{5,})(?:\.html)?/i) ||
    String(url || "").match(/\b(\d{8,})\b/);
  return match?.[1] || null;
}
function decodeBase64Url(value) {
  const padded =
    value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
function parseBridgeCode(code) {
  const parts = String(code || "")
    .trim()
    .split(".");
  if (parts.length !== 3 || parts[0] !== "AG1")
    throw new Error("Código inválido. Gere um novo código no painel da Absoluto Glamur.");
  const payload = JSON.parse(decodeBase64Url(parts[1]));
  if (!payload?.ori || !payload?.sid || !payload?.exp) throw new Error("Código incompleto.");
  if (Math.floor(Date.now() / 1000) > Number(payload.exp))
    throw new Error("Este código expirou. Gere outro no painel.");
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
async function readEnabled() {
  const saved = await chrome.storage.local.get(["agExtensionEnabled"]);
  if (typeof saved.agExtensionEnabled !== "boolean") {
    await chrome.storage.local.set({ agExtensionEnabled: true });
    return true;
  }
  return saved.agExtensionEnabled;
}
async function updateBadge(enabled) {
  try {
    await chrome.action.setBadgeText({ text: enabled ? "ON" : "OFF" });
    await chrome.action.setBadgeBackgroundColor({ color: enabled ? "#83d400" : "#d8324a" });
    await chrome.action.setTitle({
      title: enabled ? "Absoluto Glamur · LIGADA" : "Absoluto Glamur · DESLIGADA",
    });
  } catch {}
}
function renderPower(enabled) {
  extensionEnabled = enabled;
  powerCard.classList.toggle("off", !enabled);
  powerCard.classList.toggle("on", enabled);
  powerTitle.textContent = enabled ? "Extensão LIGADA" : "Extensão DESLIGADA";
  powerText.textContent = enabled
    ? "Ativa automaticamente até você desligar."
    : "Não responderá à loja até ser ligada novamente.";
  powerButton.textContent = enabled ? "Desligar" : "Ligar";
  manualArea.classList.toggle("disabled", !enabled);
  importButton.disabled = !enabled;
  updateBadge(enabled);
}
async function load() {
  const [tab, enabled, saved] = await Promise.all([
    activeTab(),
    readEnabled(),
    chrome.storage.local.get(["agBridgeCode"]),
  ]);
  const productId = productIdFromUrl(tab?.url);
  productEl.textContent = productId || "Abra uma página de produto";
  if (saved.agBridgeCode) codeEl.value = saved.agBridgeCode;
  renderPower(enabled);
}
powerButton.addEventListener("click", async () => {
  const next = !extensionEnabled;
  await chrome.storage.local.set({ agExtensionEnabled: next });
  renderPower(next);
  show(
    next
      ? "Extensão ligada. A sincronização automática está ativa."
      : "Extensão desligada. Clique em Ligar quando quiser reativar.",
    next ? "success" : "info",
  );
});
importButton.addEventListener("click", async () => {
  if (!extensionEnabled) return show("Ligue a extensão antes de importar.", "error");
  importButton.disabled = true;
  try {
    const tab = await activeTab();
    const productId = productIdFromUrl(tab?.url);
    if (!tab?.id || !productId)
      throw new Error("Abra o anúncio do produto no AliExpress antes de importar.");
    const code = codeEl.value.trim();
    const payload = parseBridgeCode(code);
    if (String(payload.sid) !== productId)
      throw new Error(
        `O código foi gerado para o AliExpress ID ${payload.sid}, mas a aba aberta é ${productId}.`,
      );
    const destinationOrigin = new URL(payload.ori).origin;
    const granted = await chrome.permissions.request({ origins: [`${destinationOrigin}/*`] });
    if (!granted)
      throw new Error("Autorize o acesso ao domínio da Absoluto Glamur para enviar as avaliações.");
    await chrome.storage.local.set({ agBridgeCode: code });
    show("Buscando avaliações com a sessão do seu navegador…", "info");
    const response = await chrome.runtime.sendMessage({
      type: "AG_IMPORT_ALIEXPRESS_REVIEWS",
      bridgeCode: code,
      tabId: tab.id,
      productId,
    });
    if (!response?.ok)
      throw new Error(response?.error || "Não foi possível concluir a importação.");
    show(
      `${response.imported} avaliação(ões) importada(s).\n${response.withPhotos || 0} com foto(s). Total detectado: ${response.remoteTotal || response.imported}.`,
      "success",
    );
  } catch (error) {
    show(error instanceof Error ? error.message : String(error), "error");
  } finally {
    importButton.disabled = !extensionEnabled;
  }
});
clearButton.addEventListener("click", async () => {
  codeEl.value = "";
  await chrome.storage.local.remove(["agBridgeCode"]);
  show("Código removido.", "info");
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.agExtensionEnabled)
    renderPower(changes.agExtensionEnabled.newValue !== false);
});
load().catch((error) => show(error instanceof Error ? error.message : String(error), "error"));
