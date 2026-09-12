import "dotenv/config";
import express from "express";
import cors from "cors";
import QRCode from "qrcode";
import pino from "pino";
import { createClient } from "@supabase/supabase-js";
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  type WASocket,
} from "@whiskeysockets/baileys";

const port = Number(process.env.PORT || 8787);
const serviceToken = process.env.WHATSAPP_SERVICE_TOKEN || "";
const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const authDir = process.env.WHATSAPP_AUTH_DIR || ".wa-auth";
const outboxInterval = Math.max(750, Number(process.env.WHATSAPP_OUTBOX_INTERVAL_MS || 1500));
const aiEnabled = /^true$/i.test(process.env.WHATSAPP_AI_ENABLED || "false");
const openAiKey = process.env.OPENAI_API_KEY || "";
const openAiModel = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const storefrontUrl = (process.env.STOREFRONT_URL || "https://absolutoglamur.com.br").replace(/\/$/, "");

if (!serviceToken) throw new Error("WHATSAPP_SERVICE_TOKEN não configurado");
if (!supabaseUrl || !supabaseKey) throw new Error("SUPABASE_URL/SUPABASE_SECRET_KEY não configurados");

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const logger = pino({ level: process.env.LOG_LEVEL || "info" });

let sock: WASocket | null = null;
let connectionState: "starting" | "qr" | "connected" | "disconnected" | "error" = "starting";
let qrDataUrl: string | null = null;
let connectedNumber: string | null = null;
let lastError: string | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let outboxBusy = false;

function normalizePhone(jid: string) {
  return jid.replace(/@s\.whatsapp\.net$/, "").replace(/\D/g, "");
}

const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function describeProduct(product: any) {
  const variants: any[] = Array.isArray(product.product_variants) ? product.product_variants : [];
  let priceCents: number | null = null;
  let stock = 0;
  for (const variant of variants) {
    const prices: any[] = Array.isArray(variant.product_prices) ? variant.product_prices : [];
    for (const price of prices) {
      if (price?.is_active === false) continue;
      if (price?.currency && price.currency !== "BRL") continue;
      const value = Number(price?.sale_price_cents ?? price?.list_price_cents ?? 0);
      if (value > 0 && (priceCents === null || value < priceCents)) priceCents = value;
    }
    const inventory = variant.product_inventory;
    const inventoryRows: any[] = Array.isArray(inventory) ? inventory : inventory ? [inventory] : [];
    for (const row of inventoryRows) stock += Math.max(0, Number(row?.stock || 0));
  }
  const parts = [
    `- ${product.name}`,
    product.short_description ? `descrição: ${String(product.short_description).slice(0, 220)}` : null,
    priceCents !== null ? `preço: ${brl(priceCents)}` : "preço: não disponível",
    `estoque: ${stock > 0 ? `${stock} unidade(s)` : "esgotado"}`,
    `link: ${storefrontUrl}/products/${product.slug}`,
  ].filter(Boolean);
  return parts.join(" | ");
}

async function generateAiReply(conversationId: string, customerMessage: string) {
  if (!aiEnabled || !openAiKey) return;

  const { data: conversation } = await supabase
    .from("whatsapp_conversations")
    .select("status,assigned_user_id")
    .eq("id", conversationId)
    .maybeSingle();
  // Assim que um atendente humano assume (status != waiting ou conversa atribuída),
  // a IA para imediatamente nesta conversa.
  if (!conversation || conversation.status !== "waiting" || conversation.assigned_user_id) return;

  const [{ data: recent }, { data: products }] = await Promise.all([
    supabase
      .from("whatsapp_messages")
      .select("direction,content,created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("products")
      .select(
        "name,slug,short_description,product_variants(product_prices(list_price_cents,sale_price_cents,currency,is_active),product_inventory(stock))",
      )
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(60),
  ]);

  const productContext = (products || [])
    .map((p) => describeProduct(p))
    .join("\n")
    .slice(0, 12000);
  const history = (recent || [])
    .slice()
    .reverse()
    .map((m) => `${m.direction === "inbound" ? "Cliente" : "Atendimento"}: ${m.content}`)
    .join("\n")
    .slice(-8000);

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: openAiModel,
      temperature: 0.4,
      max_tokens: 500,
      messages: [
        {
          role: "system",
          content:
            "Você é a assistente virtual da Absoluto Glamur, uma loja de beleza. Responda em português brasileiro, de forma elegante, curta e útil (até 4 frases). Use exclusivamente as informações do catálogo enviado no contexto: preço, estoque e descrição vêm do banco de dados. NUNCA invente preço, estoque, prazo de entrega, composição, promessa de resultado ou diagnóstico médico. Se a informação não estiver no contexto (por exemplo prazo de entrega ou pedido específico), diga que vai encaminhar para um atendente humano confirmar. Ao recomendar, sugira no máximo 3 produtos com nome, preço e o link informado. Produtos com estoque esgotado só devem ser citados como indisponíveis. Se o cliente pedir para falar com uma pessoa, reclamar, tratar de pagamento, troca, devolução ou pedido já feito, responda que um atendente humano assumirá a conversa em instantes.",
        },
        {
          role: "user",
          content: `Catálogo disponível (fonte oficial, não invente nada além disto):\n${productContext || "Catálogo não disponível no momento."}\n\nHistórico:\n${history}\n\nMensagem atual do cliente: ${customerMessage}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`OpenAI ${response.status}: ${detail.slice(0, 250)}`);
  }
  const payload = (await response.json()) as any;
  const reply = String(payload?.choices?.[0]?.message?.content || "").trim();
  if (!reply) return;

  // Revalida: um atendente pode ter assumido enquanto a IA gerava a resposta.
  const { data: fresh } = await supabase
    .from("whatsapp_conversations")
    .select("status,assigned_user_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!fresh || fresh.status !== "waiting" || fresh.assigned_user_id) return;

  const inserted = await supabase.from("whatsapp_messages").insert({
    conversation_id: conversationId,
    direction: "outbound",
    content: reply,
    type: "text",
    status: "pending",
  });
  if (inserted.error) throw inserted.error;
}

async function upsertInboundMessage(remoteJid: string, content: string, whatsappMessageId?: string | null) {
  const phone = normalizePhone(remoteJid);
  if (!phone || !content.trim()) return;

  const { data: contact, error: contactError } = await supabase
    .from("whatsapp_contacts")
    .upsert({ phone }, { onConflict: "phone" })
    .select("id")
    .single();
  if (contactError) throw contactError;

  let { data: conversation, error: conversationReadError } = await supabase
    .from("whatsapp_conversations")
    .select("id,status")
    .eq("contact_id", contact.id)
    .in("status", ["waiting", "in_service"])
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (conversationReadError) throw conversationReadError;

  if (!conversation) {
    const created = await supabase
      .from("whatsapp_conversations")
      .insert({ contact_id: contact.id, status: "waiting", last_message_at: new Date().toISOString() })
      .select("id,status")
      .single();
    if (created.error) throw created.error;
    conversation = created.data;
  }

  const inserted = await supabase.from("whatsapp_messages").insert({
    conversation_id: conversation.id,
    direction: "inbound",
    content,
    type: "text",
    status: "received",
    provider_message_id: whatsappMessageId || null,
  });
  if (inserted.error) throw inserted.error;

  await supabase
    .from("whatsapp_conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversation.id);

  if (conversation.status === "waiting") {
    void generateAiReply(conversation.id, content).catch((err) => logger.error({ err }, "Falha na resposta automática por IA"));
  }
}

async function processOutbox() {
  if (outboxBusy || connectionState !== "connected" || !sock) return;
  outboxBusy = true;
  try {
    const { data: pending, error } = await supabase
      .from("whatsapp_messages")
      .select("id,conversation_id,content,type,media_url,whatsapp_conversations!inner(contact_id,whatsapp_contacts!inner(phone))")
      .eq("direction", "outbound")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(10);
    if (error) throw error;

    for (const message of pending || []) {
      try {
        const relation = message.whatsapp_conversations as any;
        const contact = relation?.whatsapp_contacts;
        const phone = Array.isArray(contact) ? contact[0]?.phone : contact?.phone;
        if (!phone) throw new Error("Contato sem telefone");

        const jid = `${String(phone).replace(/\D/g, "")}@s.whatsapp.net`;
        const sent = await sock.sendMessage(jid, { text: message.content || "" });
        await supabase
          .from("whatsapp_messages")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
            provider_message_id: sent?.key?.id || null,
          })
          .eq("id", message.id);
      } catch (err) {
        logger.error({ err, messageId: message.id }, "Falha no envio WhatsApp");
        await supabase.from("whatsapp_messages").update({ status: "failed" }).eq("id", message.id);
      }
    }
  } catch (err) {
    logger.error({ err }, "Falha ao processar outbox");
  } finally {
    outboxBusy = false;
  }
}

async function startWhatsApp() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  connectionState = "starting";
  lastError = null;

  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();
  sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    browser: ["Absoluto Glamur", "Chrome", "1.0.0"],
    syncFullHistory: false,
    markOnlineOnConnect: false,
  });

  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      connectionState = "qr";
      qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
    }
    if (connection === "open") {
      connectionState = "connected";
      qrDataUrl = null;
      connectedNumber = sock?.user?.id ? normalizePhone(sock.user.id) : null;
      logger.info({ connectedNumber, aiEnabled }, "WhatsApp conectado");
    }
    if (connection === "close") {
      connectionState = "disconnected";
      connectedNumber = null;
      const error = lastDisconnect?.error as any;
      const statusCode = error?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      lastError = loggedOut ? "Sessão desconectada pelo WhatsApp" : error?.message || "Conexão encerrada";
      if (!loggedOut) reconnectTimer = setTimeout(() => void startWhatsApp(), 3000);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const message of messages) {
      if (message.key.fromMe || !message.key.remoteJid || message.key.remoteJid === "status@broadcast") continue;
      const content =
        message.message?.conversation ||
        message.message?.extendedTextMessage?.text ||
        message.message?.imageMessage?.caption ||
        message.message?.videoMessage?.caption ||
        "";
      if (!content) continue;
      try {
        await upsertInboundMessage(message.key.remoteJid, content, message.key.id);
      } catch (err) {
        logger.error({ err }, "Falha ao persistir mensagem recebida");
      }
    }
  });
}

const app = express();
app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  if (req.path === "/health") return next();
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (token !== serviceToken) return res.status(401).json({ error: "unauthorized" });
  next();
});

app.get("/health", (_req, res) => res.json({ ok: true, state: connectionState, aiEnabled }));
app.get("/status", (_req, res) => {
  res.json({ state: connectionState, qr: qrDataUrl, number: connectedNumber, error: lastError, aiEnabled });
});
app.post("/restart", async (_req, res) => {
  try {
    sock?.end(undefined);
  } catch {}
  sock = null;
  qrDataUrl = null;
  connectedNumber = null;
  await startWhatsApp();
  res.json({ ok: true });
});
app.post("/logout", async (_req, res) => {
  try {
    await sock?.logout();
  } catch (err) {
    logger.warn({ err }, "Falha ao executar logout remoto");
  }
  sock = null;
  qrDataUrl = null;
  connectedNumber = null;
  connectionState = "disconnected";
  res.json({ ok: true });
});

setInterval(() => void processOutbox(), outboxInterval);
app.listen(port, () => logger.info({ port, aiEnabled }, "Absoluto Glamur WhatsApp worker iniciado"));
void startWhatsApp().catch((err) => {
  connectionState = "error";
  lastError = err instanceof Error ? err.message : String(err);
  logger.error({ err }, "Falha ao iniciar WhatsApp worker");
});
