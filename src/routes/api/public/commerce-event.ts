import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

const HeartbeatSchema = z.object({
  visitor_id: z.string(),
  session_id: z.string(),
  current_page: z.string(),
  funnel_stage: z.enum(["browsing", "product_view", "cart", "checkout", "purchased"]).optional(),
  cart_value_cents: z.number().optional(),
  items_count: z.number().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  // Geolocation usually comes from the request headers in edge runtimes (Cloudflare)
});

export const Route = createFileRoute("/api/public/commerce-event")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          
          // Reutilizando ou estendendo o schema anterior
          const url = process.env.SUPABASE_URL;
          const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
          if (!url || !key) return Response.json({ ok: false, error: "server_not_configured" }, { status: 503 });
          
          const db = createClient(url, key, { auth: { persistSession: false } });
          
          // Se for um evento de analytics estruturado
          if (body.event_name) {
             const { error } = await db.from("commerce_events").insert(body);
             
             // Também registrar no novo sistema de analytics para o Mapa Ao Vivo
             // Primeiro garantimos a sessão
             const { data: session } = await db
                .from("visitor_sessions")
                .select("id")
                .eq("session_id", body.session_id)
                .maybeSingle();
                
             if (session) {
                await db.from("analytics_events").insert({
                   session_id: session.id,
                   visitor_id: body.visitor_id,
                   event_name: body.event_name,
                   page_path: body.metadata?.path || body.current_page,
                   product_id: body.product_id,
                   value_cents: body.value_cents,
                   metadata: body.metadata || {}
                });
                
                // Atualizar estágio do funil se necessário
                let stage: any = undefined;
                if (body.event_name === 'view_item') stage = 'product_view';
                if (body.event_name === 'add_to_cart') stage = 'cart';
                if (body.event_name === 'begin_checkout') stage = 'checkout';
                if (body.event_name === 'purchase') stage = 'purchased';
                
                if (stage) {
                   await db.from("visitor_sessions")
                    .update({ funnel_stage: stage, last_seen_at: new Error().toISOString() }) // use current time
                    .eq("id", session.id);
                }
             }
             
             if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
             return Response.json({ ok: true });
          }
          
          // Se for apenas um Heartbeat para manter online
          if (body.session_id) {
             // Tentar detectar localização via headers (Cloudflare standard)
             const country = request.headers.get("cf-ipcountry");
             const city = request.headers.get("cf-ipcity");
             const region = request.headers.get("cf-region");
             
             const { data: existing } = await db
              .from("visitor_sessions")
              .select("id")
              .eq("session_id", body.session_id)
              .maybeSingle();
              
             if (existing) {
                await db.from("visitor_sessions")
                  .update({
                    last_seen_at: new Date().toISOString(),
                    is_online: true,
                    current_page: body.current_page,
                    funnel_stage: body.funnel_stage || 'browsing',
                    cart_value_cents: body.cart_value_cents || 0,
                    items_count: body.items_count || 0
                  })
                  .eq("id", existing.id);
             } else {
                // Criar nova sessão
                await db.from("visitor_sessions").insert({
                   visitor_id: body.visitor_id,
                   session_id: body.session_id,
                   current_page: body.current_page,
                   country,
                   city,
                   state: region,
                   is_online: true,
                   device_type: body.metadata?.device_type,
                   browser: body.metadata?.browser,
                   os: body.metadata?.os,
                   utm_source: body.metadata?.utm_source,
                   utm_medium: body.metadata?.utm_medium,
                   utm_campaign: body.metadata?.utm_campaign
                });
             }
             return Response.json({ ok: true });
          }

          return Response.json({ ok: false, error: "invalid_payload" }, { status: 400 });
        } catch (e) {
          return Response.json({ ok: false, error: e instanceof Error ? e.message : "invalid_request" }, { status: 400 });
        }
      },
    },
  },
});
