export type CommerceEventName =
  | "page_view"
  | "view_item"
  | "add_to_cart"
  | "remove_from_cart"
  | "cart_change"
  | "begin_checkout"
  | "purchase"
  | "checkout_abandoned";

const SESSION_KEY = "absoluto-glamur-session-v12";
const SESSION_ACTIVITY_KEY = "absoluto-glamur-session-last-activity-v12";
const VISITOR_KEY = "absoluto-glamur-visitor-v12";
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

function stableVisitorId() {
  if (typeof window === "undefined") return null;
  let value = window.localStorage.getItem(VISITOR_KEY);
  if (!value) {
    value = crypto.randomUUID();
    window.localStorage.setItem(VISITOR_KEY, value);
  }
  return value;
}

function sessionId() {
  if (typeof window === "undefined") return null;
  const now = Date.now();
  const lastActivity = Number(window.localStorage.getItem(SESSION_ACTIVITY_KEY) ?? 0);
  let value = window.localStorage.getItem(SESSION_KEY);

  // Uma visita volta a ser uma nova sessão depois de 30 minutos sem atividade.
  // O visitor_id permanece estável e permite reconhecer visitas recorrentes sem PII.
  if (!value || !Number.isFinite(lastActivity) || now - lastActivity > SESSION_TIMEOUT_MS) {
    value = crypto.randomUUID();
    window.localStorage.setItem(SESSION_KEY, value);
  }

  window.localStorage.setItem(SESSION_ACTIVITY_KEY, String(now));
  return value;
}

function sendJson(body: string) {
  if (typeof window === "undefined") return;
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/public/commerce-event", new Blob([body], { type: "application/json" }));
      return;
    }
    void fetch("/api/public/commerce-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    });
  } catch {
    // Analytics must never interrupt shopping.
  }
}

export function trackCommerce(event_name: CommerceEventName, payload: {
  product_id?: string | null;
  order_id?: string | null;
  value_cents?: number | null;
  channel?: string | null;
  campaign?: string | null;
  current_page?: string | null;
  metadata?: Record<string, unknown>;
} = {}) {
  if (typeof window === "undefined") return;
  const id = sessionId();
  if (!id) return;
  sendJson(JSON.stringify({
    event_name,
    session_id: id,
    visitor_id: stableVisitorId() ?? id,
    current_page: payload.current_page ?? window.location.pathname,
    ...payload,
    metadata: payload.metadata ?? {},
  }));
}

export function sendCommercePresence(
  presence: "active" | "offline",
  payload: { current_page?: string; metadata?: Record<string, unknown> } = {},
) {
  if (typeof window === "undefined") return;
  const id = sessionId();
  if (!id) return;
  sendJson(JSON.stringify({
    presence,
    session_id: id,
    visitor_id: stableVisitorId() ?? id,
    current_page: payload.current_page ?? window.location.pathname,
    metadata: payload.metadata ?? {},
  }));
}

export function syncRecoverableCart(items: Array<{ productId: string; variantId: string; name: string; unitCents: number; quantity: number; sku?: string | null }>) {
  if (typeof window === "undefined") return;
  const id = sessionId();
  if (!id) return;
  const subtotal = items.reduce((sum, item) => sum + item.unitCents * item.quantity, 0);
  const payload = JSON.stringify({
    session_id: id,
    cart_snapshot: items,
    subtotal_cents: subtotal,
    total_cents: subtotal,
    source: "store",
    utm: readUtm(),
    recovered: false,
  });
  try {
    void fetch("/api/public/abandoned-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    });
  } catch {
    // Recovery tracking must never interrupt shopping.
  }
}

function readUtm(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const keys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
  const out: Record<string, string> = {};
  for (const key of keys) {
    const value = params.get(key);
    if (value) out[key] = value;
  }
  return out;
}

export function getCommerceSessionId() {
  return sessionId();
}

export function getCommerceVisitorId() {
  return stableVisitorId();
}
