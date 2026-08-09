import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const Schema = z.object({
  session_id: z.string().min(6).max(200),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  cart_snapshot: z.record(z.string(), z.unknown()).or(z.array(z.unknown())),
  subtotal_cents: z.number().int().min(0),
  total_cents: z.number().int().min(0),
  source: z.string().max(100).nullable().optional(),
  utm: z.record(z.string(), z.unknown()).default({}),
  recovered: z.boolean().default(false),
});

export const Route = createFileRoute("/api/public/abandoned-checkout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = Schema.parse(await request.json());
          const url = process.env.SUPABASE_URL;
          const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
          if (!url || !key) return Response.json({ ok: false, error: "server_not_configured" }, { status: 503 });
          const db = createClient(url, key, { auth: { persistSession: false } });
          if (body.total_cents <= 0) {
            await db.from("abandoned_checkouts").delete().eq("session_id", body.session_id);
            return Response.json({ ok: true, cleared: true });
          }
          const payload = {
            session_id: body.session_id,
            email: body.email ?? null,
            phone: body.phone ?? null,
            cart_snapshot: body.cart_snapshot,
            subtotal_cents: body.subtotal_cents,
            total_cents: body.total_cents,
            source: body.source ?? "store",
            utm: body.utm,
            last_seen_at: new Date().toISOString(),
            recovered_at: body.recovered ? new Date().toISOString() : null,
          };
          const { error } = await db.from("abandoned_checkouts").upsert(payload, { onConflict: "session_id" });
          if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
          return Response.json({ ok: true });
        } catch (e) {
          return Response.json({ ok: false, error: e instanceof Error ? e.message : "invalid_request" }, { status: 400 });
        }
      },
    },
  },
});
