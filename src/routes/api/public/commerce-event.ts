import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const EventSchema = z.object({
  event_name: z.enum(["view_item", "add_to_cart", "remove_from_cart", "cart_change", "begin_checkout", "purchase", "checkout_abandoned"]),
  session_id: z.string().min(6).max(200).nullable().optional(),
  product_id: z.string().uuid().nullable().optional(),
  order_id: z.string().uuid().nullable().optional(),
  value_cents: z.number().int().min(0).nullable().optional(),
  channel: z.string().max(100).nullable().optional(),
  campaign: z.string().max(200).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const Route = createFileRoute("/api/public/commerce-event")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = EventSchema.parse(await request.json());
          const url = process.env.SUPABASE_URL;
          const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
          if (!url || !key) return Response.json({ ok: false, error: "server_not_configured" }, { status: 503 });
          const db = createClient(url, key, { auth: { persistSession: false } });
          const { error } = await db.from("commerce_events").insert(body);
          if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
          return Response.json({ ok: true });
        } catch (e) {
          return Response.json({ ok: false, error: e instanceof Error ? e.message : "invalid_request" }, { status: 400 });
        }
      },
    },
  },
});
