import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  INTEGRATION_CATALOG,
  INTEGRATION_CATALOG_BY_PROVIDER,
} from "./integration-catalog";

/* eslint-disable @typescript-eslint/no-explicit-any */

async function assertAdmin(context: any) {
  const { data } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
  if (!data) throw new Error("Acesso restrito a administradores");
}

function mask(v: string | null | undefined): string | null {
  if (!v) return null;
  if (v.length <= 8) return "••••";
  return v.slice(0, 4) + "••••" + v.slice(-4);
}

function sanitizeIntegrationConfig(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const config = { ...(value as Record<string, unknown>) };
  for (const key of Object.keys(config)) {
    if (
      /(^|_)(access_?token|refresh_?token|token|secret|password|private_?key|merchant_?key|api_?key|client_?secret|app_?secret)($|_)/i.test(
        key,
      )
    ) {
      delete config[key];
    }
  }
  return config;
}

export type IntegrationDTO = {
  provider: string;
  category: string;
  display_name: string;
  description: string | null;
  enabled: boolean;
  mode: "sandbox" | "production";
  config: Record<string, unknown>;
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

function toDto(row: any, fallback?: (typeof INTEGRATION_CATALOG)[number]): IntegrationDTO {
  const rawConfig =
    row?.config && typeof row.config === "object" && !Array.isArray(row.config)
      ? (row.config as Record<string, unknown>)
      : {};
  const merchantKey =
    typeof rawConfig.merchant_key === "string" ? rawConfig.merchant_key : null;
  return {
    provider: String(row?.provider ?? fallback?.provider ?? ""),
    category: String(row?.category ?? fallback?.category ?? "other"),
    display_name: String(
      row?.display_name ?? fallback?.display_name ?? row?.provider ?? fallback?.provider ?? "Integração",
    ),
    description: String(row?.description ?? fallback?.description ?? "") || null,
    enabled: Boolean(row?.enabled ?? false),
    mode: (row?.mode ?? fallback?.default_mode ?? "sandbox") as "sandbox" | "production",
    config: sanitizeIntegrationConfig(rawConfig),
    last_verified_at: row?.last_verified_at ?? null,
    last_status: row?.last_status ?? null,
    last_error: row?.last_error ?? null,
    updated_at: row?.updated_at ?? "",
    api_key_masked: mask(row?.api_key),
    webhook_token_masked: mask(row?.webhook_token),
    merchant_key_masked: mask(merchantKey),
    has_api_key: Boolean(row?.api_key),
    has_webhook_token: Boolean(row?.webhook_token),
    has_merchant_key: Boolean(merchantKey),
    reauth_required: Boolean(rawConfig.reauth_required),
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

    // The provider catalog is the source of truth for visibility. A transient DB read
    // problem must never make every connector disappear from the admin interface.
    if (error) console.warn("[integrations] failed to load persisted state", error.message);
    const rows = (data ?? []) as any[];
    const byProvider = new Map(rows.map((row) => [String(row.provider), row]));

    const canonical = INTEGRATION_CATALOG.map((item) =>
      toDto(byProvider.get(item.provider), item),
    );
    const known = new Set(INTEGRATION_CATALOG.map((item) => item.provider));
    const custom = rows
      .filter((row) => !known.has(String(row.provider)))
      .map((row) => toDto(row))
      .sort((a, b) =>
        `${a.category}/${a.display_name}`.localeCompare(`${b.category}/${b.display_name}`, "pt-BR"),
      );
    return [...canonical, ...custom];
  });

const SaveSchema = z.object({
  provider: z.string().trim().min(1),
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
    const { data: existing, error: readError } = await db
      .from("integrations")
      .select("*")
      .eq("provider", data.provider)
      .maybeSingle();
    if (readError) throw new Error(readError.message);

    const catalog = INTEGRATION_CATALOG_BY_PROVIDER.get(data.provider);
    if (!existing && !catalog) throw new Error("Integração desconhecida");

    const prevConfig =
      existing?.config && typeof existing.config === "object" && !Array.isArray(existing.config)
        ? ({ ...existing.config } as Record<string, unknown>)
        : {};
    let nextConfig = prevConfig;
    if (data.config !== undefined) {
      if (Object.keys(data.config).length === 0) {
        nextConfig = {};
      } else {
        nextConfig = { ...prevConfig, ...data.config };
        for (const [key, value] of Object.entries(data.config)) {
          if (value === null) delete nextConfig[key];
        }
      }
    }

    const payload = {
      provider: data.provider,
      category: existing?.category ?? catalog?.category ?? "other",
      display_name: existing?.display_name ?? catalog?.display_name ?? data.provider,
      description: existing?.description ?? catalog?.description ?? null,
      enabled: data.enabled ?? existing?.enabled ?? false,
      mode: data.mode ?? existing?.mode ?? catalog?.default_mode ?? "sandbox",
      api_key:
        data.api_key !== undefined ? data.api_key || null : (existing?.api_key ?? null),
      webhook_token:
        data.webhook_token !== undefined
          ? data.webhook_token || null
          : (existing?.webhook_token ?? null),
      config: nextConfig,
      updated_by: context.userId,
    };

    const { error } = await db
      .from("integrations")
      .upsert(payload, { onConflict: "provider" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const RevealSchema = z.object({
  provider: z.string().trim().min(1),
  field: z.enum(["api_key", "webhook_token", "merchant_key"]),
});
export type IntegrationCredentialField = z.infer<typeof RevealSchema>["field"];

/**
 * Reveals exactly one credential after an explicit admin action (eye button).
 * Normal connector listing never returns plaintext secrets.
 */
export const revealIntegrationCredential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => RevealSchema.parse(v))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: row, error } = await context.supabase
      .from("integrations")
      .select("api_key, webhook_token, config")
      .eq("provider", data.provider)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return { value: null as string | null };

    if (data.field === "merchant_key") {
      const config =
        row.config && typeof row.config === "object" && !Array.isArray(row.config)
          ? (row.config as Record<string, unknown>)
          : {};
      const value = config.merchant_key;
      return { value: typeof value === "string" && value ? value : null };
    }
    const value = row[data.field];
    return { value: typeof value === "string" && value ? value : null };
  });

async function updateTestStatus(
  db: any,
  provider: string,
  error: string | null,
  extra: Record<string, unknown> = {},
) {
  await db
    .from("integrations")
    .update({
      last_verified_at: new Date().toISOString(),
      last_status: error ? "error" : "ok",
      last_error: error ? error.slice(0, 800) : null,
      ...extra,
    })
    .eq("provider", provider);
}

export const testIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ provider: z.string() }).parse(v))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const db = context.supabase;
    const { data: row, error: readError } = await db
      .from("integrations")
      .select("*")
      .eq("provider", data.provider)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!row) throw new Error("Integração ainda não configurada. Clique em Configurar e salve as credenciais.");

    if (data.provider === "asaas") {
      if (!row.api_key) throw new Error("Preencha a chave da API do Asaas");
      const { asaasFetch } = await import("./asaas.server");
      try {
        const info = await asaasFetch<{ walletId?: string; name?: string; email?: string }>(
          { apiKey: row.api_key, env: (row.mode as "sandbox" | "production") ?? "sandbox" },
          "/myAccount",
        );
        await updateTestStatus(db, "asaas", null);
        return {
          ok: true,
          info: { name: info.name ?? "Conta Asaas", email: info.email ?? null },
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await updateTestStatus(db, "asaas", msg);
        throw new Error(msg);
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
        await updateTestStatus(db, "pagbank", null);
        return { ok: true, info: { name: "PagBank", email: null } };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await updateTestStatus(db, "pagbank", msg);
        throw new Error(msg);
      }
    }

    if (data.provider === "openai" || data.provider === "gemini") {
      const provider = data.provider as "openai" | "gemini";
      const { loadAiCredential, callAiProvider } = await import("./ai-translate.server");
      const cred = await loadAiCredential(provider, db);
      if (!cred) {
        const msg = "Preencha a chave da API e ative a integração antes de testar.";
        await updateTestStatus(db, provider, msg);
        throw new Error(msg);
      }
      try {
        const text = await callAiProvider(cred, "Responda apenas com: OK", "ping");
        if (!text) throw new Error("O modelo respondeu vazio.");
        await updateTestStatus(db, provider, null);
        return {
          ok: true,
          info: {
            name: `${provider === "openai" ? "OpenAI" : "Gemini"} · ${cred.model}`,
            email: null,
          },
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await updateTestStatus(db, provider, msg);
        throw new Error(msg);
      }
    }

    if (data.provider === "aliexpress") {
      const cfg = (row.config as Record<string, unknown> | null) ?? {};
      const appKey = String(row.api_key ?? cfg.app_key ?? "").trim();
      const appSecret = String(row.webhook_token ?? cfg.app_secret ?? "").trim();
      const accessToken = String(cfg.access_token ?? "").trim();
      if (!appKey || !appSecret) {
        throw new Error("Preencha App Key e App Secret antes de testar.");
      }
      if (!accessToken) {
        throw new Error(
          "AliExpress ainda não autorizado. Clique em 'Autorizar AliExpress' para completar o OAuth.",
        );
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
        await updateTestStatus(db, "aliexpress", null, { enabled: true });
        return {
          ok: true,
          info: { name: "AliExpress Open Platform", email: cfg.aliexpress_user_id ?? null },
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await updateTestStatus(db, "aliexpress", msg);
        throw new Error(msg);
      }
    }

    return {
      ok: true,
      info: {
        name: row.display_name ?? data.provider,
        message: `As credenciais de ${row.display_name ?? data.provider} estão salvas. Este provedor ainda não possui teste remoto automático; valide no fluxo correspondente.`,
      },
    };
  });
