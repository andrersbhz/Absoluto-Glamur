import { createHash, timingSafeEqual } from "node:crypto";
import type { Database } from "@/integrations/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TRACKING_LABELS } from "./order-lifecycle";
export function verifyTrackingSignature(raw: string, key: string, signature: string) {
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHash("sha256").update(`${raw}/${key}`).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}
export type TrackingUpdate = {
  number?: string;
  track_info?: {
    latest_status?: { status?: string; sub_status?: string };
    latest_event?: { time_iso?: string };
  };
};
export function normalizeTrackingUpdate(data: TrackingUpdate) {
  const number = data.number?.trim();
  const status = data.track_info?.latest_status?.status;
  const time = data.track_info?.latest_event?.time_iso;
  if (!number || !status || !TRACKING_LABELS[status]) return null;
  // No estimated delivery date is ever interpreted as proof of delivery.
  return {
    number,
    status,
    subStatus: data.track_info?.latest_status?.sub_status || status,
    time: time && Number.isFinite(Date.parse(time)) ? new Date(time).toISOString() : null,
  };
}
export async function registerOrderTracking(db: SupabaseClient<Database>, number: string) {
  const { data: integration, error } = await db
    .from("integrations")
    .select("api_key,enabled")
    .eq("provider", "17track")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!integration?.enabled || !integration.api_key)
    return {
      registered: false,
      warning: "Ative a integração 17TRACK para atualizar a entrega automaticamente.",
    };
  const response = await fetch("https://api.17track.net/track/v2.4/register", {
    method: "POST",
    headers: { "Content-Type": "application/json", "17token": integration.api_key },
    body: JSON.stringify([{ number }]),
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  if (
    !response.ok ||
    result.code !== 0 ||
    !result.data?.accepted?.some((item: { number?: string }) => item.number === number)
  )
    throw new Error(
      "O rastreio foi salvo, mas a 17TRACK não confirmou o registro. Verifique o número e registre-o no painel 17TRACK.",
    );
  return { registered: true, warning: null };
}
export async function applyTrackingUpdate(db: SupabaseClient<Database>, data: TrackingUpdate) {
  const update = normalizeTrackingUpdate(data);
  if (!update) return { updated: false };
  const { data: order, error } = await db
    .from("orders")
    .select("id,status,tracking_updated_at")
    .eq("tracking_number", update.number)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!order || !["shipped", "delivered"].includes(order.status)) return { updated: false };
  if (order.status === "delivered" && update.status !== "Delivered") return { updated: false };
  if (update.time && order.tracking_updated_at && update.time < order.tracking_updated_at)
    return { updated: false };
  const { error: writeError, data: changed } = await db
    .from("orders")
    .update({
      tracking_status: update.status,
      tracking_sub_status: update.subStatus,
      tracking_updated_at: update.time || new Date().toISOString(),
      ...(update.status === "Delivered"
        ? { status: "delivered", delivered_at: update.time || new Date().toISOString() }
        : {}),
    })
    .eq("id", order.id)
    .eq("status", order.status)
    .or(
      order.tracking_updated_at
        ? `tracking_updated_at.is.null,tracking_updated_at.lte.${order.tracking_updated_at}`
        : "tracking_updated_at.is.null",
    )
    .select("id");
  if (writeError) throw new Error(writeError.message);
  return { updated: !!changed?.length };
}
