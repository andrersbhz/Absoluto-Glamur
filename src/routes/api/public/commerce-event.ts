import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

const EventSchema = z.object({
  event_name: z.enum(["view_item", "add_to_cart", "remove_from_cart", "cart_change", "begin_checkout", "purchase", "checkout_abandoned"]).optional(),
  session_id: z.string().min(6).max(200),
  visitor_id: z.string().max(200).optional(),
  product_id: z.string().uuid().nullable().optional(),
  order_id: z.string().uuid().nullable().optional(),
  value_cents: z.number().int().min(0).nullable().optional(),
  channel: z.string().max(100).nullable().optional(),
  campaign: z.string().max(200).nullable().optional(),
  current_page: z.string().max(500).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const Route = createFileRoute("/api/public/commerce-event")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const contentLength = Number(request.headers.get("content-length") ?? 0);
          if (contentLength > 64 * 1024) {
            return Response.json({ ok: false, error: "payload_too_large" }, { status: 413 });
          }

          const parsed = EventSchema.parse(await request.json());
          const url = process.env.SUPABASE_URL;
          const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
          if (!url || !key) {
            return Response.json({ ok: false, error: "server_not_configured" }, { status: 503 });
          }

          const db = createClient(url, key, { auth: { persistSession: false } });
          const now = new Date().toISOString();

          let verifiedPurchaseValue: number | null = null;
          if (parsed.event_name === "purchase") {
            if (!parsed.order_id) {
              return Response.json({ ok: false, error: "purchase_requires_order" }, { status: 400 });
            }
            const { data: order, error: orderError } = await db
              .from("orders")
              .select("id,status,total_cents")
              .eq("id", parsed.order_id)
              .maybeSingle();
            if (orderError) {
              return Response.json({ ok: false, error: orderError.message }, { status: 500 });
            }
            if (!order || order.status !== "paid") {
              return Response.json({ ok: false, error: "purchase_not_confirmed" }, { status: 409 });
            }
            verifiedPurchaseValue = order.total_cents;

            const { data: existingPurchase } = await db
              .from("commerce_events")
              .select("id")
              .eq("event_name", "purchase")
              .eq("order_id", parsed.order_id)
              .limit(1)
              .maybeSingle();
            if (existingPurchase) return Response.json({ ok: true, duplicate: true });
          }

          const eventValue = verifiedPurchaseValue ?? parsed.value_cents ?? null;

          const { data: session } = await db
            .from("visitor_sessions")
            .select("id")
            .eq("session_id", parsed.session_id)
            .maybeSingle();

          let sessionId = session?.id;
          if (!sessionId) {
            const country = request.headers.get("cf-ipcountry");
            const city = request.headers.get("cf-ipcity");
            const region = request.headers.get("cf-region");
            const lat = request.headers.get("cf-iplatitude");
            const lon = request.headers.get("cf-iplongitude");

            const parsedLat = lat ? Number.parseFloat(lat) : NaN;
            const parsedLon = lon ? Number.parseFloat(lon) : NaN;
            const { data: newSession } = await db
              .from("visitor_sessions")
              .insert({
                visitor_id: parsed.visitor_id || parsed.session_id,
                session_id: parsed.session_id,
                current_page: parsed.current_page || (parsed.metadata?.path as string),
                country,
                city,
                state: region,
                latitude_approx: Number.isFinite(parsedLat) ? parsedLat : null,
                longitude_approx: Number.isFinite(parsedLon) ? parsedLon : null,
                referrer: parsed.metadata?.referrer as string,
                entry_path: parsed.current_page || (parsed.metadata?.path as string),
                is_online: true,
                last_seen_at: now,
                device_type: parsed.metadata?.device_type as string,
                browser: parsed.metadata?.browser as string,
                os: parsed.metadata?.os as string,
                utm_source: (parsed.metadata?.utm_source || parsed.campaign) as string,
                utm_medium: parsed.metadata?.utm_medium as string,
                utm_campaign: parsed.metadata?.utm_campaign as string,
              })
              .select("id")
              .single();
            sessionId = newSession?.id;
          } else {
            await db
              .from("visitor_sessions")
              .update({
                last_seen_at: now,
                is_online: true,
                current_page: parsed.current_page || (parsed.metadata?.path as string),
                funnel_stage: (parsed.metadata?.funnel_stage || "browsing") as never,
              })
              .eq("id", sessionId);
          }

          if (parsed.event_name) {
            const { error: legacyError } = await db.from("commerce_events").insert({
              event_name: parsed.event_name,
              session_id: parsed.session_id,
              product_id: parsed.product_id,
              order_id: parsed.order_id,
              value_cents: eventValue,
              channel: parsed.channel,
              campaign: parsed.campaign,
              metadata: parsed.metadata,
            });
            if (legacyError) {
              return Response.json({ ok: false, error: legacyError.message }, { status: 500 });
            }

            if (sessionId) {
              await db.from("analytics_events").insert({
                session_id: sessionId,
                visitor_id: parsed.visitor_id || parsed.session_id,
                event_name: parsed.event_name,
                page_path: parsed.current_page || (parsed.metadata?.path as string),
                product_id: parsed.product_id,
                product_name: parsed.metadata?.product_name as string,
                value_cents: eventValue,
                metadata: parsed.metadata,
              });

              let stage: string | null = null;
              if (parsed.event_name === "view_item") stage = "product_view";
              if (parsed.event_name === "add_to_cart") stage = "cart";
              if (parsed.event_name === "begin_checkout") stage = "checkout";
              if (parsed.event_name === "purchase") stage = "purchased";

              if (stage) {
                await db
                  .from("visitor_sessions")
                  .update({
                    funnel_stage: stage as never,
                    last_seen_at: now,
                    converted: parsed.event_name === "purchase",
                  })
                  .eq("id", sessionId);
              }
            }
          }

          return Response.json({ ok: true });
        } catch (e) {
          console.error("[commerce-event]", e);
          return Response.json(
            { ok: false, error: e instanceof Error ? e.message : "invalid_request" },
            { status: 400 },
          );
        }
      },
    },
  },
});
