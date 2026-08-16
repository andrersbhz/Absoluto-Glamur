import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
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

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: integration } = await supabaseAdmin
      .from("integrations")
      .select("api_key, webhook_token, config")
      .eq("provider", "aliexpress")
      .maybeSingle();

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
      force_auth: "true",
      state,
    });

    return {
      authUrl: `https://api-sg.aliexpress.com/oauth/authorize?${params.toString()}`,
    };
  });
