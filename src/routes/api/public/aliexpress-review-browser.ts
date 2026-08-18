import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/* eslint-disable @typescript-eslint/no-explicit-any */

const MAX_PAYLOAD_BYTES = 2 * 1024 * 1024;
const MAX_REVIEWS = 160;
const MAX_IMAGES = 8;

const ReviewSchema = z.object({
  id: z.string().trim().min(1).max(200).nullable().optional(),
  author: z.string().trim().max(180).nullable().optional(),
  country: z.string().trim().max(24).nullable().optional(),
  rating: z.coerce.number().min(0).max(5).default(0),
  title: z.string().trim().max(500).nullable().optional(),
  body: z.string().trim().max(8000).default(""),
  images: z.array(z.string().max(2000)).max(MAX_IMAGES).default([]),
  reviewed_at: z.string().max(120).nullable().optional(),
});

const PayloadSchema = z.object({
  source_product_id: z.string().regex(/^\d{5,}$/),
  remote_total: z.number().int().min(0).max(2_000_000).nullable().optional(),
  reviews: z.array(ReviewSchema).min(1).max(MAX_REVIEWS),
});

type BridgePayload = {
  pid: string;
  sid: string;
  uid: string;
  ori: string;
  iat: number;
  exp: number;
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
  };
}

function safeDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function safeImage(value: string): string | null {
  try {
    const url = new URL(value.startsWith("//") ? `https:${value}` : value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const host = url.hostname.toLowerCase();
    if (
      !(
        host.includes("alicdn") ||
        host.includes("aliexpress") ||
        host.includes("aliimg") ||
        host.includes("ae01")
      )
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function safeReviewId(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value
    .trim()
    .replace(/[^a-zA-Z0-9_.:-]/g, "")
    .slice(0, 180);
  return cleaned || null;
}

function hashText(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export const Route = createFileRoute("/api/public/aliexpress-review-browser")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders() }),
      POST: async ({ request }) => {
        let bridge: BridgePayload | null = null;
        try {
          const contentLength = Number(request.headers.get("content-length") ?? 0);
          if (contentLength > MAX_PAYLOAD_BYTES) {
            return Response.json(
              { ok: false, error: "payload_too_large" },
              { status: 413, headers: corsHeaders() },
            );
          }

          const authorization = request.headers.get("authorization") ?? "";
          const code = authorization.replace(/^Bearer\s+/i, "").trim();
          if (!code) {
            return Response.json(
              { ok: false, error: "missing_bridge_code" },
              { status: 401, headers: corsHeaders() },
            );
          }

          const verifier = await import("@/lib/aliexpress-browser-review-bridge.server");
          bridge = verifier.verifyAliExpressBrowserReviewBridge(code);
          const body = PayloadSchema.parse(await request.json());
          if (body.source_product_id !== bridge.sid) {
            return Response.json(
              { ok: false, error: "source_product_mismatch" },
              { status: 409, headers: corsHeaders() },
            );
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const db = supabaseAdmin as any;
          const { data: product, error: productError } = await db
            .from("products")
            .select("id,name,slug")
            .eq("id", bridge.pid)
            .maybeSingle();
          if (productError) throw new Error(productError.message);
          if (!product) {
            return Response.json(
              { ok: false, error: "product_not_found" },
              { status: 404, headers: corsHeaders() },
            );
          }

          const startedAt = new Date().toISOString();
          await db.from("product_review_sync_state").upsert(
            {
              product_id: bridge.pid,
              source: "aliexpress",
              source_id: bridge.sid,
              status: "running",
              fetched_count: 0,
              remote_total: body.remote_total ?? null,
              last_attempt_at: startedAt,
              last_error: null,
              updated_at: startedAt,
            },
            { onConflict: "product_id" },
          );

          const validReviews = body.reviews.filter(
            (review) => Number.isFinite(review.rating) && review.rating >= 1 && review.rating <= 5,
          );
          const skippedInvalid = body.reviews.length - validReviews.length;
          if (!validReviews.length) {
            return Response.json(
              { ok: false, error: "no_valid_rated_reviews" },
              { status: 422, headers: corsHeaders() },
            );
          }

          const now = new Date().toISOString();
          const rows = validReviews.map((review) => {
            const images = [
              ...new Set(
                review.images.map(safeImage).filter((value): value is string => Boolean(value)),
              ),
            ].slice(0, MAX_IMAGES);
            const reviewedAt = safeDate(review.reviewed_at);
            const directId = safeReviewId(review.id);
            const fingerprint = [
              bridge!.sid,
              review.author ?? "",
              review.country ?? "",
              review.rating,
              reviewedAt ?? "",
              review.body,
              images.join("|"),
            ].join("\u241f");
            return {
              product_id: bridge!.pid,
              source: "aliexpress",
              source_review_id: directId ?? `browser-${hashText(fingerprint)}`,
              author_name: review.author || null,
              author_country: review.country || null,
              rating: Math.round(review.rating * 10) / 10,
              title: review.title || null,
              body: review.body,
              images,
              reviewed_at: reviewedAt,
              is_visible: true,
              body_translated: false,
              last_synced_at: now,
            };
          });

          const { error: upsertError } = await db
            .from("product_external_reviews")
            .upsert(rows, { onConflict: "product_id,source,source_review_id" });
          if (upsertError) throw new Error(`Falha ao salvar avaliações: ${upsertError.message}`);

          const average =
            Math.round((rows.reduce((sum, row) => sum + row.rating, 0) / rows.length) * 100) / 100;
          const remoteTotal = Math.max(Number(body.remote_total ?? 0), rows.length);
          const { error: productUpdateError } = await db
            .from("products")
            .update({ rating_avg: average, rating_count: remoteTotal })
            .eq("id", bridge.pid);
          if (productUpdateError)
            throw new Error(`Falha ao atualizar a nota do produto: ${productUpdateError.message}`);

          const withPhotos = rows.filter((row) => row.images.length > 0).length;
          await db.from("product_review_sync_state").upsert(
            {
              product_id: bridge.pid,
              source: "aliexpress",
              source_id: bridge.sid,
              status: "ok",
              fetched_count: rows.length,
              remote_total: remoteTotal,
              last_attempt_at: startedAt,
              last_success_at: now,
              last_error: null,
              updated_at: now,
            },
            { onConflict: "product_id" },
          );

          return Response.json(
            {
              ok: true,
              productTitle: product.name,
              productSlug: product.slug,
              imported: rows.length,
              withPhotos,
              remoteTotal,
              average,
              skippedInvalid,
            },
            { headers: corsHeaders() },
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (bridge?.pid) {
            try {
              const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
              const db = supabaseAdmin as any;
              const now = new Date().toISOString();
              await db.from("product_review_sync_state").upsert(
                {
                  product_id: bridge.pid,
                  source: "aliexpress",
                  source_id: bridge.sid,
                  status: "error",
                  fetched_count: 0,
                  last_attempt_at: now,
                  last_error: message.slice(0, 1000),
                  updated_at: now,
                },
                { onConflict: "product_id" },
              );
            } catch {
              // Não mascara o erro original se o registro de diagnóstico falhar.
            }
          }
          return Response.json(
            { ok: false, error: message.slice(0, 500) },
            {
              status: /código|assinatura|expirou/i.test(message) ? 401 : 400,
              headers: corsHeaders(),
            },
          );
        }
      },
    },
  },
});
