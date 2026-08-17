import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* eslint-disable @typescript-eslint/no-explicit-any */

async function assertAdmin(context: any) {
  const { data } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
  if (!data) throw new Error("Acesso restrito a administradores.");
}

function maskToken(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.length < 12) return "••••••••";
  return `${value.slice(0, 5)}••••••${value.slice(-5)}`;
}

export const getBlogMetaIntegrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const db = context.supabase as any;
    const { data, error } = await db
      .from("integrations")
      .select("provider,display_name,enabled,config,api_key,last_status,last_error,last_verified_at")
      .in("provider", ["facebook", "instagram"]);
    if (error) throw new Error(error.message);
    const byProvider = new Map((data ?? []).map((row: any) => [row.provider, row]));
    return (["facebook", "instagram"] as const).map((provider) => {
      const row: any = byProvider.get(provider) ?? {};
      return {
        provider,
        display_name: row.display_name ?? (provider === "facebook" ? "Facebook Page" : "Instagram Business"),
        enabled: row.enabled === true,
        config: row.config ?? {},
        has_token: !!row.api_key,
        token_masked: maskToken(row.api_key),
        last_status: row.last_status ?? null,
        last_error: row.last_error ?? null,
        last_verified_at: row.last_verified_at ?? null,
      };
    });
  });

const MetaSaveSchema = z.object({
  provider: z.enum(["facebook", "instagram"]),
  enabled: z.boolean(),
  access_token: z.string().trim().nullable().optional(),
  page_id: z.string().trim().max(120).optional(),
  ig_user_id: z.string().trim().max(120).optional(),
  graph_version: z.string().trim().regex(/^v\d+\.\d+$/).default("v23.0"),
  api_host: z.enum(["https://graph.facebook.com", "https://graph.instagram.com"]).default("https://graph.facebook.com"),
  auto_publish_blog: z.boolean().default(true),
});

export const saveBlogMetaIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => MetaSaveSchema.parse(value))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const db = context.supabase as any;
    const { data: existing } = await db
      .from("integrations")
      .select("config,api_key")
      .eq("provider", data.provider)
      .maybeSingle();
    const previous = (existing?.config ?? {}) as Record<string, unknown>;
    const config = {
      ...previous,
      graph_version: data.graph_version,
      api_host: data.api_host,
      auto_publish_blog: data.auto_publish_blog,
      ...(data.provider === "facebook" ? { page_id: data.page_id ?? "" } : { ig_user_id: data.ig_user_id ?? "" }),
    };
    const payload: Record<string, unknown> = {
      provider: data.provider,
      category: "marketing",
      display_name: data.provider === "facebook" ? "Facebook Page" : "Instagram Business",
      description:
        data.provider === "facebook"
          ? "Publicação automática do blog na Página via Meta Graph API."
          : "Publicação automática do blog no Instagram profissional via Meta Graph API.",
      enabled: data.enabled,
      mode: "production",
      config,
      updated_by: context.userId,
    };
    if (data.access_token !== undefined && data.access_token !== null && data.access_token.trim()) {
      payload.api_key = data.access_token.trim();
    } else if (!existing?.api_key) {
      payload.api_key = null;
    }
    const { error } = await db.from("integrations").upsert(payload, { onConflict: "provider" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testBlogMetaIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => z.object({ provider: z.enum(["facebook", "instagram"]) }).parse(value))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const db = context.supabase as any;
    try {
      const { testMetaIntegration } = await import("./meta-social.server");
      const info = await testMetaIntegration(data.provider, db);
      await db
        .from("integrations")
        .update({ last_status: "ok", last_error: null, last_verified_at: new Date().toISOString() })
        .eq("provider", data.provider);
      return { ok: true, info };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db
        .from("integrations")
        .update({ last_status: "error", last_error: message.slice(0, 800), last_verified_at: new Date().toISOString() })
        .eq("provider", data.provider);
      throw new Error(message);
    }
  });
