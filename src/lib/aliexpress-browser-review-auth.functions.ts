import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* eslint-disable @typescript-eslint/no-explicit-any */

const ALI_SOURCES = ["aliexpress", "aliexpress_api", "aliexpress_url"];
const MAX_REVIEWS = 160;
const MAX_IMAGES = 8;

const ReviewSchema = z.object({
  id: z.string().trim().min(1).max(200).nullable().optional(),
  author: z.string().trim().max(180).nullable().optional(),
  country: z.string().trim().max(24).nullable().optional(),
  rating: z.number().min(1).max(5),
  title: z.string().trim().max(500).nullable().optional(),
  body: z.string().trim().min(1).max(8000),
  images: z.array(z.string().max(2000)).max(MAX_IMAGES).default([]),
  reviewed_at: z.string().max(120).nullable().optional(),
});

async function assertCatalog(context: any) {
  const { data: adm } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
  if (adm) return;
  const { data: hasCat } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "catalog",
  });
  if (!hasCat) throw new Error("Acesso restrito a administradores ou equipe de catálogo");
}

function normalizeAliProductId(source: string): string | null {
  const raw = source.trim();
  if (/^\d{5,}$/.test(raw)) return raw;
  for (const pattern of [
    /\/item\/(\d{5,})(?:\.html)?/i,
    /[?&](?:productId|product_id)=(\d{5,})/i,
    /\b(\d{8,})\b/,
  ]) {
    const match = raw.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

async function resolveSourceProductId(db: any, productId: string): Promise<string | null> {
  const { data: state } = await db
    .from("product_review_sync_state")
    .select("source_id")
    .eq("product_id", productId)
    .maybeSingle();
  const fromState = state?.source_id ? normalizeAliProductId(String(state.source_id)) : null;
  if (fromState) return fromState;

  const { data: imported } = await db
    .from("product_imports")
    .select("source_id")
    .eq("product_id", productId)
    .in("source", ALI_SOURCES)
    .not("source_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return imported?.source_id ? normalizeAliProductId(String(imported.source_id)) : null;
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
    if (!(host.includes("alicdn") || host.includes("aliexpress") || host.includes("aliimg") || host.includes("ae01"))) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function safeReviewId(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value.trim().replace(/[^a-zA-Z0-9_.:-]/g, "").slice(0, 180);
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

const TargetSchema = z.object({ product_id: z.string().uuid() });

export const getAliExpressBrowserReviewTargetForProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => TargetSchema.parse(value))
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const sourceProductId = await resolveSourceProductId(context.supabase, data.product_id);
    if (!sourceProductId) {
      throw new Error("Este produto ainda não possui um ID AliExpress vinculado. Vincule ou importe o produto antes de sincronizar avaliações.");
    }
    return {
      productId: data.product_id,
      sourceProductId,
      sourceUrl: `https://pt.aliexpress.com/item/${sourceProductId}.html`,
    };
  });

const ImportSchema = z.object({
  product_id: z.string().uuid(),
  source_product_id: z.string().regex(/^\d{5,}$/),
  remote_total: z.number().int().min(0).max(2_000_000).nullable().optional(),
  reviews: z.array(ReviewSchema).min(1).max(MAX_REVIEWS),
});

export const importAliExpressBrowserReviewsAuthenticated = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => ImportSchema.parse(value))
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const db = context.supabase;

    const expectedSourceId = await resolveSourceProductId(db, data.product_id);
    if (!expectedSourceId) throw new Error("Produto sem vínculo AliExpress para receber avaliações.");
    if (expectedSourceId !== data.source_product_id) {
      throw new Error("O produto AliExpress coletado não corresponde ao produto vinculado na Absoluto Glamur.");
    }

    const { data: product, error: productError } = await db
      .from("products")
      .select("id,name,slug")
      .eq("id", data.product_id)
      .maybeSingle();
    if (productError) throw new Error(productError.message);
    if (!product) throw new Error("Produto de destino não encontrado.");

    const startedAt = new Date().toISOString();
    await db.from("product_review_sync_state").upsert({
      product_id: data.product_id,
      source: "aliexpress",
      source_id: data.source_product_id,
      status: "running",
      fetched_count: 0,
      remote_total: data.remote_total ?? null,
      last_attempt_at: startedAt,
      last_error: null,
      updated_at: startedAt,
    }, { onConflict: "product_id" });

    const now = new Date().toISOString();
    const rows = data.reviews.map((review) => {
      const images = [...new Set(review.images.map(safeImage).filter((value): value is string => Boolean(value)))].slice(0, MAX_IMAGES);
      const reviewedAt = safeDate(review.reviewed_at);
      const directId = safeReviewId(review.id);
      const fingerprint = [
        data.source_product_id,
        review.author ?? "",
        review.country ?? "",
        review.rating,
        reviewedAt ?? "",
        review.body,
        images.join("|"),
      ].join("\u241f");
      return {
        product_id: data.product_id,
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
    if (upsertError) throw new Error(`Falha ao salvar avaliações coletadas pelo Chrome: ${upsertError.message}`);

    const average = Math.round((rows.reduce((sum, row) => sum + row.rating, 0) / rows.length) * 100) / 100;
    const remoteTotal = Math.max(Number(data.remote_total ?? 0), rows.length);
    const { error: productUpdateError } = await db
      .from("products")
      .update({ rating_avg: average, rating_count: remoteTotal })
      .eq("id", data.product_id);
    if (productUpdateError) throw new Error(`Avaliações foram salvas, mas a nota do produto não foi atualizada: ${productUpdateError.message}`);

    const withPhotos = rows.filter((row) => row.images.length > 0).length;
    await db.from("product_review_sync_state").upsert({
      product_id: data.product_id,
      source: "aliexpress",
      source_id: data.source_product_id,
      status: "ok",
      fetched_count: rows.length,
      remote_total: remoteTotal,
      last_attempt_at: startedAt,
      last_success_at: now,
      last_error: null,
      updated_at: now,
    }, { onConflict: "product_id" });

    return {
      ok: true,
      productId: product.id,
      productTitle: product.name,
      productSlug: product.slug,
      imported: rows.length,
      withPhotos,
      remoteTotal,
      average,
    };
  });
