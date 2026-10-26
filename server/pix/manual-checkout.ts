import { generateManualPixCode } from "../../src/lib/manual-pix-brcode";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Server-only. Never accept amount, recipient Pix key, or payment status from browser. */
export async function createPendingManualPix(args: {
  db: SupabaseClient;
  orderId: string;
  authenticatedCustomerId: string;
}): Promise<{ paymentId: string; payload: string; amountCents: number }> {
  const key = process.env.NUBANK_PIX_RANDOM_KEY;
  const merchantName = process.env.PIX_MERCHANT_NAME;
  const merchantCity = process.env.PIX_MERCHANT_CITY;
  if (!key || !merchantName || !merchantCity) throw new Error("Manual Pix is not configured");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key))
    throw new Error("Use a valid random EVP Pix key");
  const { data: order, error } = await args.db.from("orders").select("id,code,user_id,total_cents,currency,status")
    .eq("id",args.orderId).eq("user_id",args.authenticatedCustomerId).single();
  if (error || !order) throw new Error("Order not found");
  if (order.currency !== "BRL" || !["pending","awaiting_payment"].includes(order.status))
    throw new Error("Order cannot be paid via manual Pix");
  if (!Number.isSafeInteger(order.total_cents) || order.total_cents <= 0)
    throw new Error("Invalid order amount");
  const payload = generateManualPixCode({
    key, amountCents: order.total_cents, merchantName, merchantCity,
    reference: order.code,
  });
  const { data: existing } = await args.db.from("payments")
    .select("id,pix_payload,amount_cents").eq("order_id",order.id)
    .eq("provider","manual_nubank").eq("status","pending").maybeSingle();
  if (existing) {
    if (existing.amount_cents !== order.total_cents || existing.pix_payload !== payload)
      throw new Error("Existing Pix data differs from current order; manual review required");
    return {paymentId:existing.id,payload,amountCents:order.total_cents};
  }
  const { data: otherPaid } = await args.db.from("payments").select("id").eq("order_id",order.id)
    .in("status",["confirmed","received"]).limit(1);
  if (otherPaid?.length) throw new Error("Order already paid");
  const { data: payment, error: insertError } = await args.db.from("payments").insert({
    order_id:order.id, provider:"manual_nubank", method:"pix", amount_cents:order.total_cents,
    status:"pending",pix_payload:payload, raw:{confirmation:"manual_only"},
  }).select("id").single();
  if (insertError || !payment) throw new Error("Could not create manual Pix");
  return {paymentId:payment.id,payload,amountCents:order.total_cents};
}
/** IMPORTANT: call exclusively inside an authenticated server action with an admin-independent,
 * server-verified customer identity and least-privilege DB client. To prevent concurrent
 * duplicate payment attempts, enforce a DB partial unique index before enabling checkout.
 */
