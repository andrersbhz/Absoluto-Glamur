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
  { provider: "meta_ads", category: "marketing", display_name: "Meta Ads (Facebook/Instagram)", description: "Campanhas, Pixel e Conversions API da Meta." },

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

    if (data.provider === "openai" || data.provider === "gemini") {
      const provider = data.provider as "openai" | "gemini";
      const config = row.config && typeof row.config === "object" ? (row.config as Record<string, unknown>) : {};
      const apiKey = typeof row.api_key === "string" ? row.api_key.trim() : "";
      if (!apiKey || row.enabled === false) {
        const message = "Preencha a chave da API e ative a integração antes de testar.";
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

    return {
      ok: true,
      info: {
        name: INTEGRATION_CATALOG.find((item) => item.provider === data.provider)?.display_name ?? data.provider,
        message: `Teste automático para "${data.provider}" ainda não está disponível. As credenciais permanecem salvas e a integração pode ser validada pelo fluxo do próprio provedor.`,
      },
    };
  });
