import webpush from "web-push";

/* eslint-disable @typescript-eslint/no-explicit-any */
type DbClient = any;

let cachedKeys: { publicKey: string; privateKey: string; subject: string } | null = null;

async function resolveDb(client?: DbClient): Promise<DbClient> {
  if (client) return client;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/**
 * Carrega/gera VAPID no servidor. Quando uma ação é iniciada pelo administrador,
 * recebe context.supabase e obedece RLS. Notificações automáticas sem sessão usam
 * o fallback privilegiado de servidor.
 */
export async function ensureVapidKeys(client?: DbClient) {
  if (cachedKeys) return cachedKeys;
  const db = await resolveDb(client);
  const { data, error } = await db.from("push_config").select("*").eq("id", true).maybeSingle();
  if (error) throw new Error(`Falha ao carregar configuração push: ${error.message}`);

  if (data) {
    cachedKeys = {
      publicKey: data.vapid_public_key,
      privateKey: data.vapid_private_key,
      subject: data.vapid_subject,
    };
  } else {
    const kp = webpush.generateVAPIDKeys();
    const subject = "mailto:admin@absolutoglamur.com.br";
    const { error: insertError } = await db.from("push_config").insert({
      id: true,
      vapid_public_key: kp.publicKey,
      vapid_private_key: kp.privateKey,
      vapid_subject: subject,
    });
    if (insertError) throw new Error(`Falha ao salvar configuração push: ${insertError.message}`);
    cachedKeys = { publicKey: kp.publicKey, privateKey: kp.privateKey, subject };
  }

  webpush.setVapidDetails(cachedKeys.subject, cachedKeys.publicKey, cachedKeys.privateKey);
  return cachedKeys;
}

export type SalePushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

export async function sendPushToAllAdmins(payload: SalePushPayload, client?: DbClient) {
  const db = await resolveDb(client);
  await ensureVapidKeys(db);
  const { data: subs, error } = await db
    .from("admin_push_subscriptions")
    .select("id, endpoint, p256dh, auth");
  if (error) throw new Error(`Falha ao carregar dispositivos push: ${error.message}`);
  if (!subs || subs.length === 0) return { sent: 0, failed: 0, removed: 0 };

  let sent = 0;
  let failed = 0;
  let removed = 0;
  const body = JSON.stringify(payload);

  await Promise.all(
    subs.map(async (s: any) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        );
        sent++;
        await db
          .from("admin_push_subscriptions")
          .update({ last_success_at: new Date().toISOString() })
          .eq("id", s.id);
      } catch (e: unknown) {
        const status = (e as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          await db.from("admin_push_subscriptions").delete().eq("id", s.id);
          removed++;
        } else {
          failed++;
          console.error("[push] send failed", status, e);
        }
      }
    }),
  );
  return { sent, failed, removed };
}

/** Backend automático: continua privilegiado e nunca recebe cliente do browser. */
export async function notifyAdminsOfPaidOrder(orderId: string) {
  const db = await resolveDb();
  const { data: order } = await db
    .from("orders")
    .select("code, total_cents, customer_name")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return;
  const total = (order.total_cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
  await sendPushToAllAdmins(
    {
      title: "💰 Nova venda confirmada",
      body: `${order.code} · ${order.customer_name ?? "Cliente"} · ${total}`,
      url: "/admin/orders",
      tag: `order-${orderId}`,
    },
    db,
  );
}
