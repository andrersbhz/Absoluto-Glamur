import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(context: any) {
  const { data } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
  if (!data) throw new Error("Acesso restrito a administradores");
}

function mask(v: string | null): string | null {
  if (!v) return null;
  if (v.length <= 8) return "••••";
  return v.slice(0, 4) + "••••" + v.slice(-4);
}

function sanitizeIntegrationConfig(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const config = { ...(value as Record<string, unknown>) };
  const sensitiveKeys = [
    "access_token",
    "refresh_token",
    "app_secret",
    "client_secret",
    "merchant_key",
    "merchant_token",
    "secret",
    "token",
  ];
  for (const key of sensitiveKeys) delete config[key];
  return config;
}

type IntegrationCatalogItem = {
  provider: string;
  category: string;
  display_name: string;
  description: string;
  default_mode?: "sandbox" | "production";
};

/**
 * Catálogo funcional do painel. Ele é deliberadamente independente das linhas existentes
 * no banco para que integrações desconectadas/nunca configuradas continuem disponíveis.
 */
export const INTEGRATION_CATALOG: IntegrationCatalogItem[] = [
  { provider: "asaas", category: "payments", display_name: "Asaas", description: "Pagamentos PIX, boleto e cartão no Brasil." },
  { provider: "pagbank", category: "payments", display_name: "PagBank", description: "PIX, boleto e cartão via PagBank." },
  { provider: "nupay", category: "payments", display_name: "NuPay (Nubank)", description: "Checkout e pagamentos via Nubank/NuPay Business." },
  { provider: "stripe", category: "payments", display_name: "Stripe", description: "Pagamentos e cartões via Stripe." },
  { provider: "mercadopago", category: "payments", display_name: "Mercado Pago", description: "PIX e cartão via Mercado Pago." },

  { provider: "melhorenvio", category: "shipping", display_name: "Melhor Envio", description: "Cotação e emissão de etiquetas de envio." },
  { provider: "correios", category: "shipping", display_name: "Correios", description: "Cálculo e serviços de frete dos Correios." },
  { provider: "17track", category: "shipping", display_name: "17TRACK", description: "Rastreamento internacional de pedidos e encomendas." },

  { provider: "google_ads", category: "marketing", display_name: "Google Ads", description: "Campanhas e conversões no Google Ads." },
  { provider: "google_merchant", category: "marketing", display_name: "Google Merchant Center", description: "Feed de produtos para Google Shopping." },
  { provider: "google_tag_manager", category: "marketing", display_name: "Google Tag Manager", description: "Tags, pixels e eventos através do GTM." },
  { provider: "meta", category: "marketing", display_name: "Meta Ads / Catalog / Pixel", description: "Campanhas, Pixel, catálogo e Conversions API da Meta." },
  { provider: "facebook", category: "marketing", display_name: "Facebook Page", description: "Publicação do blog na Página via Meta Graph API." },
  { provider: "instagram", category: "marketing", display_name: "Instagram Business", description: "Publicação do blog no Instagram profissional via Meta Graph API." },

  { provider: "openai", category: "ai", display_name: "OpenAI", description: "IA para textos, classificação e automações do catálogo." },
  { provider: "gemini", category: "ai", display_name: "Google Gemini", description: "IA multimodal e tradução de conteúdo." },

  { provider: "r2", category: "storage", display_name: "Cloudflare R2", description: "Armazenamento de mídias em escala." },

  { provider: "aliexpress", category: "other", display_name: "AliExpress Open Platform", description: "Importação, variações, estoque, avaliações e fulfillment via API oficial." },
  { provider: "firecrawl", category: "other", display_name: "Firecrawl", description: "Extração de conteúdo web para fluxos que optem por usar o serviço." },
];

export type IntegrationDTO = {
  provider: string;
  category: string;
  display_name: string;
  description: string | null;
  enabled: boolean;
  mode: "sandbox" | "production";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: any;
  last_verified_at: string | null;
  last_status: string | null;
  last_error: string | null;
  updated_at: string;
  api_key_masked: string | null;
  webhook_token_masked: string | null;
  merchant_key_masked: string | null;
  has_api_key: boolean;
  has_webhook_token: boolean;
  has_merchant_key: boolean;
  reauth_required: boolean;
};

function toIntegrationDto(
  item: IntegrationCatalogItem,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  row?: any,
): IntegrationDTO {
  const rawConfig = row?.config && typeof row.config === "object" ? row.config : {};
  const merchantKey = typeof rawConfig.merchant_key === "string" ? rawConfig.merchant_key : null;
  return {
    provider: item.provider,
    category: row?.category ?? item.category,
    display_name: row?.display_name ?? item.display_name,
    description: row?.description ?? item.description,
    enabled: !!row?.enabled,
    mode: (row?.mode as "sandbox" | "production") ?? item.default_mode ?? "sandbox",
    config: sanitizeIntegrationConfig(rawConfig),
    last_verified_at: row?.last_verified_at ?? null,
    last_status: row?.last_status ?? null,
    last_error: row?.last_error ?? null,
    updated_at: row?.updated_at ?? new Date(0).toISOString(),
    api_key_masked: mask(row?.api_key ?? null),
    webhook_token_masked: mask(row?.webhook_token ?? null),
    merchant_key_masked: mask(merchantKey),
    has_api_key: !!row?.api_key,
    has_webhook_token: !!row?.webhook_token,
    has_merchant_key: !!merchantKey,
    reauth_required: !!rawConfig.reauth_required,
  };
}

export const listIntegrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<IntegrationDTO[]> => {
    await assertAdmin(context);
    const db = context.supabase;
    const { data, error } = await db
      .from("integrations")
      .select(
        "provider, category, display_name, description, enabled, mode, config, last_verified_at, last_status, last_error, api_key, webhook_token, updated_at",
      )
      .order("category")
      .order("display_name");
    if (error) throw new Error(error.message);

    const rows = data ?? [];
    const byProvider = new Map(rows.map((row) => [row.provider, row]));
    const known = INTEGRATION_CATALOG.map((item) => toIntegrationDto(item, byProvider.get(item.provider)));

    // Preserva integrações adicionais já existentes no banco, mesmo que não façam parte
    // do catálogo padrão desta versão.
    const knownIds = new Set(INTEGRATION_CATALOG.map((item) => item.provider));
    const extras = rows
      .filter((row) => !knownIds.has(row.provider))
      .map((row) =>
        toIntegrationDto(
          {
            provider: row.provider,
            category: row.category ?? "other",
            display_name: row.display_name ?? row.provider,
            description: row.description ?? "Integração personalizada.",
          },
          row,
        ),
      );

    return [...known, ...extras].sort((a, b) =>
      `${a.category}:${a.display_name}`.localeCompare(`${b.category}:${b.display_name}`, "pt-BR"),
    );
  });

const SaveSchema = z.object({
  provider: z.string(),
  enabled: z.boolean().optional(),
  mode: z.enum(["sandbox", "production"]).optional(),
  api_key: z.string().nullable().optional(),
  webhook_token: z.string().nullable().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});
export type SaveIntegrationInput = z.infer<typeof SaveSchema>;

export const saveIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => SaveSchema.parse(v))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const db = context.supabase;
    const catalog = INTEGRATION_CATALOG.find((item) => item.provider === data.provider);

    const { data: existing, error: existingError } = await db
      .from("integrations")
      .select("config, category, display_name, description")
      .eq("provider", data.provider)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload: any = {
      provider: data.provider,
      category: existing?.category ?? catalog?.category ?? "other",
      display_name: existing?.display_name ?? catalog?.display_name ?? data.provider,
      description: existing?.description ?? catalog?.description ?? "Integração externa.",
      updated_by: context.userId,
    };
    if (data.enabled !== undefined) payload.enabled = data.enabled;
    if (data.mode) payload.mode = data.mode;
    if (data.api_key !== undefined) payload.api_key = data.api_key || null;
    if (data.webhook_token !== undefined) payload.webhook_token = data.webhook_token || null;

    if (data.config !== undefined) {
      const prev = (existing?.config as Record<string, unknown> | null) ?? {};
      const merged: Record<string, unknown> = { ...prev, ...data.config };
      for (const [key, value] of Object.entries(data.config)) {
        if (value === null) delete merged[key];
      }
      payload.config = Object.keys(data.config).length === 0 ? {} : merged;
    }

    const { error } = await db.from("integrations").upsert(payload, { onConflict: "provider" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getIntegrationSecrets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ provider: z.string().min(1) }).parse(v))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const db = context.supabase;
    const { data: row, error } = await db
      .from("integrations")
      .select("api_key, webhook_token, config")
      .eq("provider", data.provider)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const config = row?.config && typeof row.config === "object" ? (row.config as Record<string, unknown>) : {};
    return {
      api_key: row?.api_key ?? "",
      webhook_token: row?.webhook_token ?? "",
      merchant_key: typeof config.merchant_key === "string" ? config.merchant_key : "",
    };
  });

async function writeVerification(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  provider: string,
  error: string | null,
  enable = false,
) {
  const patch: Record<string, unknown> = {
    last_verified_at: new Date().toISOString(),
    last_status: error ? "error" : "ok",
    last_error: error ? error.slice(0, 1000) : null,
  };
  if (enable && !error) patch.enabled = true;
  await db.from("integrations").update(patch).eq("provider", provider);
}

export const testIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ provider: z.string() }).parse(v))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const db = context.supabase;
    const { data: row, error: rowError } = await db
      .from("integrations")
      .select("*")
      .eq("provider", data.provider)
      .maybeSingle();
    if (rowError) throw new Error(rowError.message);
    if (!row) throw new Error("Configure e salve esta integração antes de testar.");

    if (data.provider === "asaas") {
      if (!row.api_key) throw new Error("Preencha a chave da API do Asaas");
      const { asaasFetch } = await import("./asaas.server");
      try {
        const info = await asaasFetch<{ walletId?: string; name?: string; email?: string }>(
          { apiKey: row.api_key, env: (row.mode as "sandbox" | "production") ?? "sandbox" },
          "/myAccount",
        );
        await writeVerification(db, "asaas", null);
        return { ok: true, info: { name: info.name ?? "Conta Asaas", email: info.email ?? null } };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await writeVerification(db, "asaas", message);
        throw new Error(message);
      }
    }

    if (data.provider === "pagbank") {
      if (!row.api_key) throw new Error("Preencha o token do PagBank");
      const { pagbankFetch } = await import("./pagbank.server");
      try {
        await pagbankFetch<Record<string, unknown>>(
          { token: row.api_key, env: (row.mode as "sandbox" | "production") ?? "sandbox" },
          "/public-keys",
          { method: "POST", body: JSON.stringify({ type: "card" }) },
        );
        await writeVerification(db, "pagbank", null);
        return { ok: true, info: { name: "PagBank", email: null } };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await writeVerification(db, "pagbank", message);
        throw new Error(message);
      }
    }

    if (data.provider === "stripe") {
      const secret = String(row.api_key ?? "").trim();
      if (!secret) throw new Error("Preencha a Secret Key da Stripe antes de testar.");
      try {
        const basic = Buffer.from(`${secret}:`, "utf8").toString("base64");
        const response = await fetch("https://api.stripe.com/v1/balance", {
          method: "GET",
          headers: { Authorization: `Basic ${basic}`, Accept: "application/json" },
        });
        const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        if (!response.ok) {
          const error = json.error as { message?: string } | undefined;
          throw new Error(error?.message ?? `Stripe respondeu HTTP ${response.status}.`);
        }
        await writeVerification(db, "stripe", null);
        return {
          ok: true,
          info: {
            name: `Stripe · ${json.livemode === true ? "produção" : "teste"}`,
            email: null,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await writeVerification(db, "stripe", message);
        throw new Error(message);
      }
    }

    if (data.provider === "mercadopago") {
      const accessToken = String(row.api_key ?? "").trim();
      if (!accessToken) throw new Error("Preencha o Access Token do Mercado Pago antes de testar.");
      try {
        const response = await fetch("https://api.mercadolibre.com/users/me", {
          method: "GET",
          headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
        });
        const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        if (!response.ok) {
          throw new Error(String(json.message ?? json.error ?? `Mercado Pago respondeu HTTP ${response.status}.`));
        }
        await writeVerification(db, "mercadopago", null);
        return {
          ok: true,
          info: {
            name: `Mercado Pago · ${String(json.nickname ?? json.id ?? "conta validada")}`,
            email: typeof json.email === "string" ? json.email : null,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await writeVerification(db, "mercadopago", message);
        throw new Error(message);
      }
    }

    if (data.provider === "17track") {
      const token = String(row.api_key ?? "").trim();
      if (!token) throw new Error("Preencha a API Key da 17TRACK antes de testar.");
      try {
        const response = await fetch("https://api.17track.net/track/v2.4/getquota", {
          method: "POST",
          headers: { "17token": token, "Content-Type": "application/json", Accept: "application/json" },
          body: "[]",
        });
        const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        const apiCode = typeof json.code === "number" ? json.code : null;
        if (!response.ok || (apiCode !== null && apiCode !== 0)) {
          throw new Error(String(json.message ?? json.msg ?? `17TRACK respondeu HTTP ${response.status}.`));
        }
        await writeVerification(db, "17track", null);
        return { ok: true, info: { name: "17TRACK · credencial válida", email: null } };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await writeVerification(db, "17track", message);
        throw new Error(message);
      }
    }

    if (data.provider === "facebook" || data.provider === "instagram") {
      try {
        const { testMetaIntegration } = await import("./meta-social.server");
        const info = await testMetaIntegration(data.provider, db);
        await writeVerification(db, data.provider, null);
        return { ok: true, info: { name: info.name, email: null } };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await writeVerification(db, data.provider, message);
        throw new Error(message);
      }
    }

    if (data.provider === "google_tag_manager") {
      const containerId = String(row.api_key ?? "").trim().toUpperCase();
      if (!/^GTM-[A-Z0-9]+$/.test(containerId)) {
        const message = "ID do Google Tag Manager inválido. Use o formato GTM-XXXXXX.";
        await writeVerification(db, "google_tag_manager", message);
        throw new Error(message);
      }
      await writeVerification(db, "google_tag_manager", null);
      return { ok: true, info: { name: `Google Tag Manager · ${containerId}`, email: null } };
    }

    if (data.provider === "openai" || data.provider === "gemini") {
      const provider = data.provider as "openai" | "gemini";
      const config = row.config && typeof row.config === "object" ? (row.config as Record<string, unknown>) : {};
      const apiKey = typeof row.api_key === "string" ? row.api_key.trim() : "";
      if (!apiKey) {
        const message = "Preencha a chave da API antes de testar.";
        await writeVerification(db, provider, message);
        throw new Error(message);
      }
      const { DEFAULT_AI_MODEL, callAiProvider } = await import("./ai-translate.server");
      const model = typeof config.model === "string" && config.model.trim() ? config.model.trim() : DEFAULT_AI_MODEL[provider];
      try {
        const text = await callAiProvider({ provider, apiKey, model }, "Responda apenas com: OK", "ping");
        if (!text) throw new Error("O modelo respondeu vazio.");
        await writeVerification(db, provider, null);
        return { ok: true, info: { name: `${provider === "openai" ? "OpenAI" : "Gemini"} · ${model}`, email: null } };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await writeVerification(db, provider, message);
        throw new Error(message);
      }
    }

    if (data.provider === "aliexpress") {
      const config = row.config && typeof row.config === "object" ? (row.config as Record<string, unknown>) : {};
      const appKey = String(row.api_key ?? config.app_key ?? "").trim();
      const appSecret = String(row.webhook_token ?? config.app_secret ?? "").trim();
      const accessToken = String(config.access_token ?? "").trim();
      if (!appKey || !appSecret) throw new Error("Preencha App Key e App Secret antes de testar.");
      if (!accessToken) {
        throw new Error("AliExpress ainda não autorizado. Clique em 'Autorizar AliExpress' para completar o OAuth.");
      }
      try {
        const { callAli } = await import("./aliexpress-discovery.functions");
        await callAli(
          "aliexpress.ds.recommend.feed.get",
          {
            feed_name: "DS_bestseller",
            page_no: 1,
            page_size: 1,
            target_currency: "BRL",
            target_language: "PT",
          },
          db,
        );
        await writeVerification(db, "aliexpress", null, true);
        return { ok: true, info: { name: "AliExpress Open Platform", email: typeof config.aliexpress_user_id === "string" ? config.aliexpress_user_id : null } };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await writeVerification(db, "aliexpress", message);
        throw new Error(message);
      }
    }

    const name = INTEGRATION_CATALOG.find((item) => item.provider === data.provider)?.display_name ?? data.provider;
    const message = `Teste automático para "${name}" ainda não está implementado. A integração foi mantida disponível e as credenciais continuam salvas; valide pelo fluxo oficial do provedor.`;
    await db
      .from("integrations")
      .update({
        last_verified_at: new Date().toISOString(),
        last_status: "manual",
        last_error: null,
      })
      .eq("provider", data.provider);
    return {
      ok: false,
      unsupported: true as const,
      info: { name, message },
    };
  });
