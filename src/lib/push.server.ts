import webpush from "web-push";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

let cachedKeys: { publicKey: string; privateKey: string; subject: string } | null = null;

export async function ensureVapidKeys() {
  if (cachedKeys) return cachedKeys;
  const { data } = await supabaseAdmin.from("push_config").select("*").eq("id", true).maybeSingle();
  if (data) {
    cachedKeys = {
      publicKey: data.vapid_public_key,
      privateKey: data.vapid_private_key,
      subject: data.vapid_subject,
    };
  } else {
    const kp = webpush.generateVAPIDKeys();
    const subject = "mailto:admin@absolutoglamur.com.br";
    await supabaseAdmin.from("push_config").insert({
      id: true,
      vapid_public_key: kp.publicKey,
      vapid_private_key: kp.privateKey,
      vapid_subject: subject,
    });
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

export async function sendPushToAllAdmins(payload: SalePushPayload) {
  await ensureVapidKeys();
  const { data: subs } = await supabaseAdmin
    .from("admin_push_subscriptions")
    .select("id, endpoint, p256dh, auth");
  if (!subs || subs.length === 0) return { sent: 0, failed: 0, removed: 0 };

  let sent = 0;
  let failed = 0;
  let removed = 0;
  const body = JSON.stringify(payload);

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        );
        sent++;
        await supabaseAdmin
          .from("admin_push_subscriptions")
          .update({ last_success_at: new Date().toISOString() })
          .eq("id", s.id);
      } catch (e: unknown) {
        const status = (e as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          await supabaseAdmin.from("admin_push_subscriptions").delete().eq("id", s.id);
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

export async function notifyAdminsOfPaidOrder(orderId: string) {
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("code, total_cents, customer_name")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return;
  const total = (order.total_cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
  await sendPushToAllAdmins({
    title: "💰 Nova venda confirmada",
    body: `${order.code} · ${order.customer_name ?? "Cliente"} · ${total}`,
    url: "/admin/orders",
    tag: `order-${orderId}`,
  });
}
