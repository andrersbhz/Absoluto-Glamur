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
  has_api_key: boolean;
  has_webhook_token: boolean;
};

export const listIntegrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<IntegrationDTO[]> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("integrations")
      .select(
        "provider, category, display_name, description, enabled, mode, config, last_verified_at, last_status, last_error, api_key, webhook_token, updated_at",
      )
      .order("category")
      .order("display_name");
    if (error) throw new Error(error.message);
    return (data ?? []).map((i) => ({
      provider: i.provider,
      category: i.category,
      display_name: i.display_name,
      description: i.description,
      enabled: i.enabled,
      mode: (i.mode as "sandbox" | "production") ?? "sandbox",
      config: i.config,
      last_verified_at: i.last_verified_at,
      last_status: i.last_status,
      last_error: i.last_error,
      updated_at: i.updated_at,
      api_key_masked: mask(i.api_key),
      webhook_token_masked: mask(i.webhook_token),
      has_api_key: !!i.api_key,
      has_webhook_token: !!i.webhook_token,
    }));
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: any = { updated_by: context.userId };
    if (data.enabled !== undefined) update.enabled = data.enabled;
    if (data.mode) update.mode = data.mode;
    if (data.api_key !== undefined) update.api_key = data.api_key || null;
    if (data.webhook_token !== undefined) update.webhook_token = data.webhook_token || null;
    if (data.config) {
      // Merge (não sobrescreve) — preserva access_token/refresh_token já gravados
      const { data: existing } = await supabaseAdmin
        .from("integrations")
        .select("config")
        .eq("provider", data.provider)
        .maybeSingle();
      const prev = (existing?.config as Record<string, unknown> | null) ?? {};
      const merged: Record<string, unknown> = { ...prev, ...data.config };
      // valores explícitos null removem a chave
      for (const [k, v] of Object.entries(data.config)) {
        if (v === null) delete merged[k];
      }
      // Se o usuário limpou tudo (Desconectar envia config:{}), preservar comportamento anterior de reset
      if (Object.keys(data.config).length === 0) {
        update.config = {};
      } else {
        update.config = merged;
      }
    }
    const { error } = await supabaseAdmin
      .from("integrations")
      .update(update)
      .eq("provider", data.provider);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ provider: z.string() }).parse(v))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("integrations")
      .select("*")
      .eq("provider", data.provider)
      .maybeSingle();
    if (!row) throw new Error("Integração não encontrada");

    if (data.provider === "asaas") {
      if (!row.api_key) throw new Error("Preencha a chave da API do Asaas");
      const { asaasFetch } = await import("./asaas.server");
      try {
        const info = await asaasFetch<{ walletId?: string; name?: string; email?: string }>(
          { apiKey: row.api_key, env: (row.mode as "sandbox" | "production") ?? "sandbox" },
          "/myAccount",
        );
        await supabaseAdmin
          .from("integrations")
          .update({
            last_verified_at: new Date().toISOString(),
            last_status: "ok",
            last_error: null,
          })
          .eq("provider", "asaas");
        return {
          ok: true,
          info: { name: info.name ?? "Conta Asaas", email: info.email ?? null },
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await supabaseAdmin
          .from("integrations")
          .update({
            last_verified_at: new Date().toISOString(),
            last_status: "error",
            last_error: msg,
          })
          .eq("provider", "asaas");
        throw new Error(msg);
      }
    }

    return {
      ok: true,
      info: {
        message: `Teste automático para "${data.provider}" ainda não está disponível. Salve as credenciais e valide manualmente no fluxo do provedor.`,
      },
    };
  });
