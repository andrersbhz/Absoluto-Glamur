import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { canTransitionOrder } from "./order-lifecycle";
export const updateOrderStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) =>
    z
      .object({
        orderId: z.string().uuid(),
        status: z.enum(["processing", "shipped", "delivered"]),
        trackingNumber: z
          .string()
          .trim()
          .regex(/^[A-Za-z0-9-]{5,80}$/, "Código de rastreio inválido")
          .optional(),
        carrier: z.string().trim().max(120).optional(),
      })
      .parse(value),
  )
  .handler(async ({ data, context }) => {
    const { data: admin } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
    if (!admin) throw new Error("Acesso restrito a administradores");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: order, error } = await db
      .from("orders")
      .select("status,tracking_number")
      .eq("id", data.orderId)
      .single();
    if (error) throw new Error(error.message);
    if (
      !canTransitionOrder(order.status, data.status, data.trackingNumber || order.tracking_number)
    )
      throw new Error(
        "Etapa inválida. Confirme o pagamento, faça a separação e informe o rastreio antes de despachar.",
      );
    const { data: updated, error: writeError } = await db
      .from("orders")
      .update({
        status: data.status,
        ...(data.status === "shipped"
          ? {
              tracking_number: data.trackingNumber,
              tracking_carrier: data.carrier || null,
              tracking_status: "InfoReceived",
            }
          : {}),
      })
      .eq("id", data.orderId)
      .eq("status", order.status)
      .select("id")
      .single();
    if (writeError || !updated)
      throw new Error(writeError?.message || "O pedido mudou de etapa. Atualize a página.");
    let warning: string | null = null;
    if (data.status === "shipped" && data.trackingNumber) {
      try {
        const { registerOrderTracking } = await import("./order-tracking.server");
        warning = (await registerOrderTracking(db, data.trackingNumber)).warning;
      } catch (error) {
        warning = error instanceof Error ? error.message : String(error);
      }
    }
    return { ok: true, warning };
  });
export const reportManualPixPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => z.object({ orderId: z.string().uuid() }).parse(value))
  .handler(async ({ data, context }) => {
    const { data: order, error } = await context.supabase
      .from("orders")
      .select("id,status,payment_review_at,payments(provider,status)")
      .eq("id", data.orderId)
      .eq("user_id", context.userId)
      .single();
    if (error) throw new Error(error.message);
    if (
      order.status !== "awaiting_payment" ||
      !order.payments.some((p) => p.provider === "pix_manual" && p.status === "pending")
    )
      throw new Error("Este pedido não está aguardando um Pix manual.");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { error: writeError } = await db
      .from("orders")
      .update({ payment_review_at: new Date().toISOString() })
      .eq("id", order.id)
      .eq("status", "awaiting_payment")
      .is("payment_review_at", null);
    if (writeError) throw new Error(writeError.message);
    return { ok: true };
  });
export const retryOrderEmails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: admin } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
    if (!admin) throw new Error("Acesso restrito a administradores");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { processOrderEmails } = await import("./order-notifications.server");
    const { error: resetError } = await supabaseAdmin
      .from("order_email_outbox")
      .update({
        status: "pending",
        attempts: 0,
        available_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("status", "failed");
    if (resetError) throw new Error(resetError.message);
    return processOrderEmails(supabaseAdmin);
  });
