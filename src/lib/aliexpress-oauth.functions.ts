import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BeginAliExpressOAuthSchema = z.object({
  origin: z.string().url(),
});

export const createAliExpressAuthorizationUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => BeginAliExpressOAuthSchema.parse(value))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_admin", {
      _user_id: context.userId,
    });
    if (!isAdmin) throw new Error("Acesso restrito a administradores");

    const db = context.supabase;
    const { data: integration, error: integrationError } = await db
      .from("integrations")
      .select("api_key, webhook_token, config")
      .eq("provider", "aliexpress")
      .maybeSingle();

    if (integrationError) throw new Error(integrationError.message);

    const config = (integration?.config as Record<string, unknown> | null) ?? {};
    const appKey = String(integration?.api_key ?? config.app_key ?? "").trim();
    const appSecret = String(integration?.webhook_token ?? config.app_secret ?? "").trim();
    if (!appKey || !appSecret) {
      throw new Error("Salve App Key e App Secret do AliExpress antes de autorizar.");
    }

    const origin = new URL(data.origin).origin;
    const redirectUri =
      (typeof config.redirect_uri === "string" && config.redirect_uri.trim()) ||
      `${origin}/api/public/webhooks/aliexpress`;

    const { createHmac, randomBytes } = await import("node:crypto");
    const payload = Buffer.from(
      JSON.stringify({
        uid: context.userId,
        ts: Date.now(),
        nonce: randomBytes(16).toString("hex"),
        generation: config.oauth_generation ?? null,
      }),
      "utf8",
    ).toString("base64url");
    const signature = createHmac("sha256", appSecret).update(payload).digest("base64url");
    const state = `${payload}.${signature}`;

    const params = new URLSearchParams({
      response_type: "code",
      client_id: appKey,
      redirect_uri: redirectUri,
      sp: "ae",
      state,
    });

    return {
      authUrl: `https://api-sg.aliexpress.com/oauth/authorize?${params.toString()}`,
    };
  });

// Clears the store's authorization, without collecting the buyer's password.
export const resetAliExpressAuthorization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
    if (!isAdmin) throw new Error("Acesso restrito a administradores");
    const { data: row, error } = await context.supabase
      .from("integrations")
      .select("config")
      .eq("provider", "aliexpress")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Configure a integração AliExpress antes de redefinir.");
    const config: Record<string, Json | undefined> = {
      ...((row.config as Record<string, Json | undefined> | null) ?? {}),
    };
    for (const key of [
      "access_token",
      "refresh_token",
      "expires_in",
      "refresh_expires_in",
      "authorized_at",
      "refreshed_at",
      "aliexpress_user_id",
      "pending_code",
      "password",
      "login",
      "username",
      "email",
      "cookies",
      "cookie",
      "session",
    ])
      delete config[key];
    const { randomUUID } = await import("node:crypto");
    config.oauth_generation = randomUUID();
    config.reauth_required = true;
    config.reauth_required_at = new Date().toISOString();
    const { error: updateError, data: updated } = await context.supabase
      .from("integrations")
      .update({
        config,
        enabled: false,
        last_status: "disconnected",
        last_error: null,
        last_verified_at: null,
        updated_by: context.userId,
      })
      .eq("provider", "aliexpress")
      .select("provider")
      .single();
    if (updateError || !updated)
      throw new Error(updateError?.message ?? "Não foi possível redefinir a autorização.");
    return { ok: true };
  });
