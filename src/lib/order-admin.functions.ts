import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Admin: confirma pagamento manualmente (ex.: PIX personalizado). */
export const confirmOrdersPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ orderIds: z.array(z.string().uuid()).min(1).max(200) }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const { data: adm } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
    if (!adm) throw new Error("Acesso restrito a administradores");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    const { data: updated, error } = await supabaseAdmin
      .from("orders")
      .update({ status: "paid", paid_at: now })
      .in("id", data.orderIds)
      .in("status", ["pending", "awaiting_payment", "failed"])
      .select("id");
    if (error) throw new Error(error.message);
    const ids = (updated ?? []).map((o) => o.id);
    if (ids.length) {
      await supabaseAdmin
        .from("payments")
        .update({ status: "confirmed" })
        .in("order_id", ids)
        .in("status", ["pending", "overdue"]);
    }
    return { confirmed: ids.length };
  });
