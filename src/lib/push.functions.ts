import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc("is_admin", {
    _user_id: context.userId,
  });
  if (!isAdmin) throw new Error("Forbidden");
}

export const getPushPublicKey = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { ensureVapidKeys } = await import("./push.server");
    const { publicKey } = await ensureVapidKeys(context.supabase);
    return { publicKey };
  });

type SubscribeInput = {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
};

export const registerAdminPushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: SubscribeInput) => data)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const db = context.supabase;
    const { error } = await db
      .from("admin_push_subscriptions")
      .upsert(
        {
          user_id: context.userId,
          endpoint: data.endpoint,
          p256dh: data.p256dh,
          auth: data.auth,
          user_agent: data.userAgent ?? null,
        },
        { onConflict: "endpoint" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const unregisterAdminPushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { endpoint: string }) => data)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const db = context.supabase;
    const { error } = await db
      .from("admin_push_subscriptions")
      .delete()
      .eq("endpoint", data.endpoint)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendTestPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { sendPushToAllAdmins } = await import("./push.server");
    return sendPushToAllAdmins(
      {
        title: "🔔 Teste de notificação",
        body: "Suas notificações de venda estão funcionando!",
        url: "/admin/orders",
        tag: "test",
      },
      context.supabase,
    );
  });
