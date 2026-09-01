/**
 * Helper server-only para a API do PayPal (Orders v2).
 * Credenciais ficam em Admin → Integrações (api_key = Client ID, api_secret = Secret).
 */

export type PayPalEnv = "sandbox" | "production";

export type PayPalConfig = {
  clientId: string;
  clientSecret: string;
  env: PayPalEnv;
};

export function paypalBaseUrl(env: PayPalEnv) {
  return env === "production"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

async function accessToken(cfg: PayPalConfig): Promise<string> {
  const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64");
  const res = await fetch(`${paypalBaseUrl(cfg.env)}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    error_description?: string;
  };
  if (!res.ok || !body.access_token) {
    throw new Error(`PayPal auth ${res.status}: ${body.error_description ?? "falha ao autenticar"}`);
  }
  return body.access_token;
}

export async function paypalFetch<T = unknown>(
  cfg: PayPalConfig,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const token = await accessToken(cfg);
  const res = await fetch(paypalBaseUrl(cfg.env) + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const msg =
      (body as { message?: string }).message ??
      (body as { details?: { description?: string }[] }).details?.[0]?.description ??
      `PayPal ${res.status}`;
    throw new Error(msg);
  }
  return body as T;
}

export type PayPalOrder = {
  id: string;
  status?: string;
  links?: { rel: string; href: string; method?: string }[];
};

/** Cria uma ordem PayPal e devolve o link de aprovação. */
export async function createPayPalOrder(
  cfg: PayPalConfig,
  input: {
    referenceId: string;
    description: string;
    amountCents: number;
    currency: string;
    returnUrl: string;
    cancelUrl: string;
  },
): Promise<{ order: PayPalOrder; approveUrl: string }> {
  const order = await paypalFetch<PayPalOrder>(cfg, "/v2/checkout/orders", {
    method: "POST",
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: input.referenceId,
          custom_id: input.referenceId,
          description: input.description.slice(0, 127),
          amount: {
            currency_code: input.currency,
            value: (input.amountCents / 100).toFixed(2),
          },
        },
      ],
      application_context: {
        brand_name: "Absoluto Glamur",
        user_action: "PAY_NOW",
        shipping_preference: "NO_SHIPPING",
        return_url: input.returnUrl,
        cancel_url: input.cancelUrl,
      },
    }),
  });
  const approveUrl = order.links?.find((l) => l.rel === "approve" || l.rel === "payer-action")?.href;
  if (!approveUrl) throw new Error("PayPal não retornou link de aprovação.");
  return { order, approveUrl };
}

/** Captura o pagamento aprovado pelo cliente. */
export async function capturePayPalOrder(cfg: PayPalConfig, orderId: string) {
  return paypalFetch<PayPalOrder>(cfg, `/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    body: "{}",
  });
}

/** Verifica a assinatura do webhook usando a API oficial de verificação. */
export async function verifyPayPalWebhook(
  cfg: PayPalConfig,
  webhookId: string,
  headers: Headers,
  rawBody: string,
): Promise<boolean> {
  try {
    const result = await paypalFetch<{ verification_status?: string }>(
      cfg,
      "/v1/notifications/verify-webhook-signature",
      {
        method: "POST",
        body: JSON.stringify({
          auth_algo: headers.get("paypal-auth-algo"),
          cert_url: headers.get("paypal-cert-url"),
          transmission_id: headers.get("paypal-transmission-id"),
          transmission_sig: headers.get("paypal-transmission-sig"),
          transmission_time: headers.get("paypal-transmission-time"),
          webhook_id: webhookId,
          webhook_event: JSON.parse(rawBody),
        }),
      },
    );
    return result.verification_status === "SUCCESS";
  } catch {
    return false;
  }
}
