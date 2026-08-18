import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const RecoverySchema = z.object({
  email: z.string().trim().email().max(320),
});

const RECOVERY_URL = "https://absolutoglamur.com.br/auth/reset-password";
const RATE_WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 3;

const recoveryAttempts = new Map<string, number[]>();

function allowRecoveryAttempt(email: string): boolean {
  const now = Date.now();
  for (const [key, attempts] of recoveryAttempts) {
    const current = attempts.filter((timestamp) => now - timestamp < RATE_WINDOW_MS);
    if (current.length === 0) recoveryAttempts.delete(key);
    else if (current.length !== attempts.length) recoveryAttempts.set(key, current);
  }

  const attempts = recoveryAttempts.get(email) ?? [];
  if (attempts.length >= MAX_REQUESTS_PER_WINDOW) return false;
  recoveryAttempts.set(email, [...attempts, now]);
  return true;
}

function recoveryEmailHtml(resetUrl: string) {
  const safeUrl = resetUrl
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
  return `
    <div style="margin:0;background:#f7f4f6;padding:32px 16px;font-family:Arial,sans-serif;color:#251e23">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #eadfe5;border-radius:18px;padding:32px">
        <div style="font-size:24px;font-weight:700;margin-bottom:20px">Absoluto Glamur</div>
        <h1 style="font-size:22px;margin:0 0 12px">Redefinição de senha</h1>
        <p style="font-size:15px;line-height:1.6;margin:0 0 22px;color:#665861">
          Recebemos uma solicitação para criar uma nova senha para sua conta.
        </p>
        <a href="${safeUrl}" style="display:inline-block;background:#251e23;color:#ffffff;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:700">
          Criar nova senha
        </a>
        <p style="font-size:13px;line-height:1.6;margin:24px 0 0;color:#7d7078">
          Se você não solicitou esta alteração, ignore este e-mail. O link é de uso único e expira conforme a política de segurança da autenticação.
        </p>
        <p style="font-size:12px;line-height:1.5;margin:22px 0 0;color:#978a92;word-break:break-all">
          Se o botão não abrir, copie e cole no navegador:<br>${safeUrl}
        </p>
      </div>
    </div>
  `;
}

async function requestSupabaseManagedRecovery(email: string) {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: RECOVERY_URL,
    });
    if (error) {
      console.warn(`[Auth] Supabase managed recovery was not sent: ${error.message}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[Auth] Supabase managed recovery fallback failed: ${message}`);
  }
}

/**
 * Public password-recovery entrypoint.
 *
 * Preferred path: generate a one-time link server-side and deliver it with the
 * email provider configured in Admin. If the privileged Supabase server client
 * is unavailable, fall back to Supabase Auth's managed recovery email. Both
 * paths keep responses generic to avoid account enumeration.
 */
export const requestPasswordRecovery = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => RecoverySchema.parse(value))
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase();

    if (!allowRecoveryAttempt(email)) {
      return { ok: true };
    }

    let customDeliverySucceeded = false;
    try {
      const [{ supabaseAdmin }, { sendConfiguredSystemEmail }] = await Promise.all([
        import("@/integrations/supabase/client.server"),
        import("./email-provider.functions"),
      ]);

      const { data: linkData, error } = await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email,
      });

      if (!error && linkData?.properties?.hashed_token) {
        const resetUrl = `${RECOVERY_URL}?token_hash=${encodeURIComponent(linkData.properties.hashed_token)}&type=recovery`;

        await sendConfiguredSystemEmail(supabaseAdmin, {
          to: email,
          subject: "Redefina sua senha · Absoluto Glamur",
          text: [
            "Absoluto Glamur",
            "",
            "Recebemos uma solicitação para redefinir a senha da sua conta.",
            "Abra o link abaixo para criar uma nova senha:",
            resetUrl,
            "",
            "Se você não solicitou esta alteração, ignore este e-mail.",
          ].join("\n"),
          html: recoveryEmailHtml(resetUrl),
        });
        customDeliverySucceeded = true;
      } else if (error) {
        console.warn(`[Auth] Recovery link was not generated: ${error.message}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[Auth] Custom password recovery unavailable: ${message}`);
    }

    if (!customDeliverySucceeded) {
      await requestSupabaseManagedRecovery(email);
    }

    return { ok: true };
  });
