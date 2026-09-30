import type { Database } from "@/integrations/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendConfiguredSystemEmail } from "./email-provider.functions";
import { buildOrderEmail, type OrderEmailInput } from "./order-email-templates";
import { safeWhatsApp } from "./order-lifecycle";
export async function processOrderEmails(db: SupabaseClient<Database>, limit = 10) {
  const { data: settings, error: settingsError } = await db
    .from("site_settings")
    .select("value")
    .eq("key", "social_links")
    .maybeSingle();
  if (settingsError) throw new Error(settingsError.message);
  const whatsappUrl = safeWhatsApp((settings?.value as { whatsapp?: string } | null)?.whatsapp);
  const base = (process.env.PUBLIC_SITE_URL || "https://absolutoglamur.com.br").replace(/\/$/, "");
  const { data: rows, error } = await db.rpc("claim_order_emails", { batch_size: limit });
  if (error) throw new Error(`Fila de e-mails indisponível: ${error.message}`);
  let sent = 0;
  let failed = 0;
  for (const row of rows ?? []) {
    if (!row.lock_token) throw new Error("A fila não retornou um bloqueio válido.");
    try {
      const snapshot = row.snapshot as OrderEmailInput & { email: string };
      if (["awaiting_payment", "validating"].includes(snapshot.status)) {
        const { data: current, error: orderError } = await db
          .from("orders")
          .select("status")
          .eq("id", row.order_id)
          .single();
        if (orderError) throw new Error(orderError.message);
        if (!["pending", "awaiting_payment"].includes(current.status)) {
          const { error: skipError } = await db
            .from("order_email_outbox")
            .update({
              status: "sent",
              sent_at: new Date().toISOString(),
              last_error: "Aviso de pagamento suprimido: pedido já avançou de etapa.",
              lock_token: null,
              locked_at: null,
            })
            .eq("id", row.id)
            .eq("lock_token", row.lock_token);
          if (skipError) throw new Error(skipError.message);
          continue;
        }
      }
      const message = buildOrderEmail({
        ...snapshot,
        whatsappUrl,
        orderUrl: `${base}/checkout/${row.order_id}`,
      });
      await sendConfiguredSystemEmail(db, { to: snapshot.email, ...message });
      const { error: finishError } = await db
        .from("order_email_outbox")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          last_error: null,
          locked_at: null,
          lock_token: null,
        })
        .eq("id", row.id)
        .eq("lock_token", row.lock_token);
      if (finishError) throw new Error(finishError.message);
      sent++;
    } catch (error) {
      failed++;
      const { error: retryError } = await db
        .from("order_email_outbox")
        .update({
          status: row.attempts >= 8 ? "failed" : "pending",
          available_at: new Date(
            Date.now() + Math.min(3600000, 60000 * 2 ** row.attempts),
          ).toISOString(),
          last_error: (error instanceof Error ? error.message : String(error)).slice(0, 1000),
          locked_at: null,
          lock_token: null,
        })
        .eq("id", row.id)
        .eq("lock_token", row.lock_token);
      if (retryError) throw new Error(retryError.message);
    }
  }
  return { sent, failed };
}
