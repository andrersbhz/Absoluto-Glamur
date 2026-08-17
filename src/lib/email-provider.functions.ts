import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendSmtpEmail, type SmtpSecurity } from "./smtp-email.server";

const PROVIDER_ID = "smtp_email";
const DEFAULT_EMAIL = "contato@absolutoglamur.com.br";

const EmailConfigSchema = z.object({
  preset: z.enum(["hostinger", "custom"]).default("hostinger"),
  host: z.string().trim().min(1).max(255),
  port: z.coerce.number().int().min(1).max(65535),
  security: z.enum(["ssl_tls", "starttls", "none"]),
  username: z.string().trim().min(3).max(320),
  from_email: z.string().trim().email().max(320),
  from_name: z.string().trim().min(1).max(120),
  reply_to: z.string().trim().email().max(320).nullable().optional(),
});

const SaveSchema = EmailConfigSchema.extend({
  enabled: z.boolean(),
  password: z.string().max(500).optional(),
});

const TestSchema = z.object({
  recipient: z.string().trim().email().max(320),
});

export type EmailProviderConfig = {
  provider: typeof PROVIDER_ID;
  enabled: boolean;
  preset: "hostinger" | "custom";
  host: string;
  port: number;
  security: SmtpSecurity;
  username: string;
  from_email: string;
  from_name: string;
  reply_to: string | null;
  password_configured: boolean;
  password_masked: string | null;
  last_status: string | null;
  last_error: string | null;
  last_verified_at: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(context: any) {
  const { data } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
  if (!data) throw new Error("Acesso restrito a administradores");
}

function maskPassword(value: string | null | undefined) {
  if (!value) return null;
  if (value.length <= 6) return "••••••";
  return `${value.slice(0, 2)}••••••${value.slice(-2)}`;
}

function defaultConfig(): EmailProviderConfig {
  return {
    provider: PROVIDER_ID,
    enabled: false,
    preset: "hostinger",
    host: "smtp.hostinger.com",
    port: 465,
    security: "ssl_tls",
    username: DEFAULT_EMAIL,
    from_email: DEFAULT_EMAIL,
    from_name: "Absoluto Glamur",
    reply_to: DEFAULT_EMAIL,
    password_configured: false,
    password_masked: null,
    last_status: null,
    last_error: null,
    last_verified_at: null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToConfig(row: any): EmailProviderConfig {
  if (!row) return defaultConfig();
  const raw = row.config && typeof row.config === "object" ? row.config as Record<string, unknown> : {};
  const parsed = EmailConfigSchema.safeParse({
    preset: raw.preset ?? "hostinger",
    host: raw.host ?? "smtp.hostinger.com",
    port: raw.port ?? 465,
    security: raw.security ?? "ssl_tls",
    username: raw.username ?? DEFAULT_EMAIL,
    from_email: raw.from_email ?? DEFAULT_EMAIL,
    from_name: raw.from_name ?? "Absoluto Glamur",
    reply_to: raw.reply_to ?? DEFAULT_EMAIL,
  });
  const cfg = parsed.success ? parsed.data : EmailConfigSchema.parse({
    preset: "hostinger",
    host: "smtp.hostinger.com",
    port: 465,
    security: "ssl_tls",
    username: DEFAULT_EMAIL,
    from_email: DEFAULT_EMAIL,
    from_name: "Absoluto Glamur",
    reply_to: DEFAULT_EMAIL,
  });

  return {
    provider: PROVIDER_ID,
    enabled: !!row.enabled,
    ...cfg,
    reply_to: cfg.reply_to ?? null,
    password_configured: !!row.api_key,
    password_masked: maskPassword(row.api_key),
    last_status: row.last_status ?? null,
    last_error: row.last_error ?? null,
    last_verified_at: row.last_verified_at ?? null,
  };
}

export const getEmailProviderConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EmailProviderConfig> => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("integrations")
      .select("provider,enabled,config,api_key,last_status,last_error,last_verified_at")
      .eq("provider", PROVIDER_ID)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return rowToConfig(data);
  });

export const saveEmailProviderConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => SaveSchema.parse(value))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const db = context.supabase;
    const { data: existing, error: existingError } = await db
      .from("integrations")
      .select("api_key")
      .eq("provider", PROVIDER_ID)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);

    const password = data.password?.trim();
    if (data.enabled && !password && !existing?.api_key) {
      throw new Error("Informe a senha SMTP antes de ativar o envio de e-mails.");
    }
    if (data.security === "none" && data.enabled) {
      throw new Error("Por segurança, o envio sem criptografia não pode ser ativado. Use SSL/TLS ou STARTTLS.");
    }

    const payload: Record<string, unknown> = {
      provider: PROVIDER_ID,
      category: "communication",
      display_name: "E-mail do sistema (SMTP)",
      description: "Provedor SMTP usado para e-mails transacionais e notificações da Absoluto Glamur.",
      enabled: data.enabled,
      mode: "production",
      updated_by: context.userId,
      config: {
        preset: data.preset,
        host: data.host,
        port: data.port,
        security: data.security,
        username: data.username,
        from_email: data.from_email,
        from_name: data.from_name,
        reply_to: data.reply_to || null,
      },
    };
    if (password) payload.api_key = password;

    const { error } = await db.from("integrations").upsert(payload, { onConflict: "provider" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const disconnectEmailProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("integrations")
      .update({
        enabled: false,
        api_key: null,
        last_status: null,
        last_error: null,
        last_verified_at: null,
        updated_by: context.userId,
      })
      .eq("provider", PROVIDER_ID);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadSmtpConfig(db: any) {
  const { data: row, error } = await db
    .from("integrations")
    .select("enabled,config,api_key")
    .eq("provider", PROVIDER_ID)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("Configure o provedor de e-mail antes de enviar mensagens.");
  if (!row.api_key) throw new Error("A senha SMTP ainda não foi configurada.");

  const raw = row.config && typeof row.config === "object" ? row.config as Record<string, unknown> : {};
  const cfg = EmailConfigSchema.parse(raw);
  return {
    enabled: !!row.enabled,
    smtp: {
      host: cfg.host,
      port: cfg.port,
      security: cfg.security,
      username: cfg.username,
      password: row.api_key as string,
      fromEmail: cfg.from_email,
      fromName: cfg.from_name,
      replyTo: cfg.reply_to ?? undefined,
    },
  };
}

export async function sendConfiguredSystemEmail(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  message: { to: string | string[]; subject: string; text?: string; html?: string },
  options?: { requireEnabled?: boolean },
) {
  const config = await loadSmtpConfig(db);
  if ((options?.requireEnabled ?? true) && !config.enabled) {
    throw new Error("O provedor de e-mail do sistema está desativado.");
  }
  return sendSmtpEmail(config.smtp, message);
}

export const testEmailProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => TestSchema.parse(value))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const db = context.supabase;
    try {
      const config = await loadSmtpConfig(db);
      await sendSmtpEmail(config.smtp, {
        to: data.recipient,
        subject: "Teste de e-mail · Absoluto Glamur",
        text: "O provedor SMTP da Absoluto Glamur foi configurado corretamente. Este é um envio de teste.",
        html: `
          <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:32px;color:#251e23">
            <h1 style="font-size:24px;margin:0 0 12px">Absoluto Glamur</h1>
            <p style="font-size:16px;line-height:1.6">O provedor SMTP foi configurado corretamente.</p>
            <p style="font-size:14px;line-height:1.6;color:#70636b">Este e-mail confirma que autenticação, conexão segura e envio estão funcionando.</p>
          </div>
        `,
      });
      await db
        .from("integrations")
        .update({
          last_status: "ok",
          last_error: null,
          last_verified_at: new Date().toISOString(),
          updated_by: context.userId,
        })
        .eq("provider", PROVIDER_ID);
      return { ok: true, recipient: data.recipient };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db
        .from("integrations")
        .update({
          last_status: "error",
          last_error: message.slice(0, 1000),
          last_verified_at: new Date().toISOString(),
          updated_by: context.userId,
        })
        .eq("provider", PROVIDER_ID);
      throw new Error(message);
    }
  });
