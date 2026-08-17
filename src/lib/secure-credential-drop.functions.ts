import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PROVIDER_ID = "smtp_email";
const DEFAULT_EMAIL = "contato@absolutoglamur.com.br";

const SecretSchema = z.object({
  secret: z.string().min(6, "A senha deve ter pelo menos 6 caracteres").max(500),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(context: any) {
  const { data } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
  if (!data) throw new Error("Acesso restrito a administradores");
}

export const getSecureCredentialStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("integrations")
      .select("api_key,updated_at,config")
      .eq("provider", PROVIDER_ID)
      .maybeSingle();
    if (error) throw new Error(error.message);

    const cfg = data?.config && typeof data.config === "object"
      ? (data.config as Record<string, unknown>)
      : {};

    return {
      configured: !!data?.api_key,
      updated_at: data?.updated_at ?? null,
      username: typeof cfg.username === "string" ? cfg.username : DEFAULT_EMAIL,
      from_email: typeof cfg.from_email === "string" ? cfg.from_email : DEFAULT_EMAIL,
    };
  });

export const storeSmtpPasswordSecurely = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => SecretSchema.parse(value))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const db = context.supabase;

    const { data: existing, error: existingError } = await db
      .from("integrations")
      .select("config,enabled")
      .eq("provider", PROVIDER_ID)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);

    const existingConfig = existing?.config && typeof existing.config === "object"
      ? (existing.config as Record<string, unknown>)
      : {};

    const config = {
      preset: existingConfig.preset ?? "hostinger",
      host: existingConfig.host ?? "smtp.hostinger.com",
      port: existingConfig.port ?? 465,
      security: existingConfig.security ?? "ssl_tls",
      username: existingConfig.username ?? DEFAULT_EMAIL,
      from_email: existingConfig.from_email ?? DEFAULT_EMAIL,
      from_name: existingConfig.from_name ?? "Absoluto Glamur",
      reply_to: existingConfig.reply_to ?? DEFAULT_EMAIL,
    };

    const { error } = await db.from("integrations").upsert({
      provider: PROVIDER_ID,
      category: "communication",
      display_name: "E-mail do sistema (SMTP)",
      description: "Provedor SMTP usado para e-mails transacionais e notificações da Absoluto Glamur.",
      enabled: existing?.enabled ?? false,
      mode: "production",
      config,
      api_key: data.secret,
      last_status: null,
      last_error: null,
      last_verified_at: null,
      updated_by: context.userId,
    }, { onConflict: "provider" });

    if (error) throw new Error(error.message);

    return { ok: true };
  });
