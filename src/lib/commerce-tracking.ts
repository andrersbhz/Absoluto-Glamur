export type CommerceEventName =
  | "view_item"
  | "add_to_cart"
  | "remove_from_cart"
  | "cart_change"
  | "begin_checkout"
  | "purchase"
  | "checkout_abandoned";

function sessionId() {
  if (typeof window === "undefined") return null;
  const key = "absoluto-glamur-session-v12";
  let value = window.localStorage.getItem(key);
  if (!value) {
    value = crypto.randomUUID();
    window.localStorage.setItem(key, value);
  }
  return value;
}

export function trackCommerce(event_name: CommerceEventName, payload: {
  product_id?: string | null;
  order_id?: string | null;
  value_cents?: number | null;
  channel?: string | null;
  campaign?: string | null;
  metadata?: Record<string, unknown>;
} = {}) {
  if (typeof window === "undefined") return;
  const body = JSON.stringify({ event_name, session_id: sessionId(), ...payload, metadata: payload.metadata ?? {} });
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/public/commerce-event", new Blob([body], { type: "application/json" }));
      return;
    }
    void fetch("/api/public/commerce-event", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true });
  } catch {
    // Analytics must never interrupt shopping.
  }
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
