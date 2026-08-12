import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabase } from "@/integrations/supabase/client";
import { callAliTopPublic } from "./aliexpress-top-public.server";
import { generateWithOwnKeys } from "./ai-translate.server";
import { syncReviewsForProductInternal } from "./product-reviews.functions";

/* eslint-disable @typescript-eslint/no-explicit-any */

const ALI_SOURCES = ["aliexpress", "aliexpress_api", "aliexpress_url"];
const REVIEW_PAGE_SIZE = 12;
const OFFICIAL_SYNC_PAGES = 8;
const OFFICIAL_SYNC_PAGE_SIZE = 20;
const AUTO_SYNC_TTL_HOURS = 6;
const MAX_REVIEW_IMAGES = 8;

export type ReviewFilter = "all" | "photos" | 1 | 2 | 3 | 4 | 5;

export type LiveExternalReview = {
  id: string;
  product_id: string;
  source: string;
  source_review_id: string | null;
  author_name: string | null;
  author_country: string | null;
  rating: number;
  title: string | null;
  body: string | null;
  images: string[];
  reviewed_at: string | null;
  is_visible: boolean;
  body_translated: boolean;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ReviewSummary = {
  total: number;
  average: number;
  withPhotos: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
};

type NormalizedOfficialReview = {
  source_review_id: string;
  author_name: string | null;
  author_country: string | null;
  rating: number;
  title: string | null;
  body: string | null;
  images: string[];
  reviewed_at: string | null;
};

async function assertCatalog(context: any) {
  const { data: adm } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
  if (adm) return;
  const { data: hasCat } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "catalog",
  });
  if (!hasCat) throw new Error("Acesso restrito a administradores ou equipe de catálogo");
}

function safeText(value: unknown, max = 8000): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, max) : null;
}

function toRating(value: unknown): number {
  const n = typeof value === "number" ? value : Number.parseFloat(String(value ?? "0").replace(",", "."));
  return Number.isFinite(n) ? Math.min(5, Math.max(0, n)) : 0;
}

function toIsoDate(value: unknown): string | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  const raw = Number.isFinite(n) && n > 0 ? (n < 10_000_000_000 ? n * 1000 : n) : value;
  const date = new Date(raw as string | number);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeImageUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.startsWith("//") ? `https:${value}` : value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const host = url.hostname.toLowerCase();
    if (!(host.includes("alicdn") || host.includes("aliexpress") || host.includes("aliimg"))) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function collectImages(value: unknown): string[] {
  const result: string[] = [];
  const add = (candidate: unknown) => {
    const url = normalizeImageUrl(candidate);
    if (url && !result.includes(url)) result.push(url);
  };

  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string") add(item);
      else if (item && typeof item === "object") {
        add((item as any).url ?? (item as any).image_url ?? (item as any).imageUrl ?? (item as any).src);
      }
    }
  } else if (typeof value === "string") {
    for (const item of value.split(/[,;\s]+/)) add(item);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) {
      if (Array.isArray(item)) item.forEach(add);
      else add(item);
    }
  }

  return result.slice(0, MAX_REVIEW_IMAGES);
}

function hashText(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function findEvaluationRows(payload: unknown, depth = 0): any[] {
  if (depth > 9 || payload == null) return [];
  if (Array.isArray(payload)) {
    if (
      payload.some(
        (row) =>
          row &&
          typeof row === "object" &&
          ("feedback" in row || "evaluation" in row || "buyer_blured_name" in row || "buyer_country_code" in row),
      )
    ) {
      return payload;
    }
    for (const value of payload) {
      const found = findEvaluationRows(value, depth + 1);
      if (found.length) return found;
    }
    return [];
  }
  if (typeof payload === "object") {
    for (const value of Object.values(payload as Record<string, unknown>)) {
      const found = findEvaluationRows(value, depth + 1);
      if (found.length) return found;
    }
  }
  return [];
}

function normalizeOfficialReview(raw: any, sourceProductId: string): NormalizedOfficialReview | null {
  const rating = toRating(raw.evaluation ?? raw.rating ?? raw.star ?? raw.stars);
  if (rating <= 0) return null;

  const feedback = safeText(raw.feedback ?? raw.content ?? raw.evaluation_content);
  const additional = safeText(raw.additional_feedback ?? raw.additionalFeedback);
  const body = [feedback, additional ? `Avaliação adicional: ${additional}` : null].filter(Boolean).join("\n\n") || null;
  const author = safeText(raw.buyer_blured_name ?? raw.buyer_name ?? raw.buyerName ?? raw.author, 180);
  const country = safeText(raw.buyer_country_code ?? raw.buyer_country ?? raw.country_code ?? raw.country, 12);
  const reviewedAt = toIsoDate(raw.feedback_epoch_date ?? raw.feedback_date ?? raw.date ?? raw.create_time);
  const images = collectImages(raw.image_urls ?? raw.images ?? raw.image_list ?? raw.pictures);
  const orderId = safeText(raw.order_id ?? raw.orderId, 160);
  const directId = safeText(raw.feedback_id ?? raw.review_id ?? raw.id ?? raw.evaluation_id, 160);
  const sku = safeText(raw.product_sku ?? raw.sku, 240);
  const material = [sourceProductId, orderId, author, reviewedAt, rating, sku, feedback, additional, images.join("|")].join("\u241f");
  const sourceReviewId = directId ?? (orderId ? `order-${orderId}` : `official-${hashText(material)}`);

  return {
    source_review_id: sourceReviewId,
    author_name: author,
    author_country: country,
    rating,
    title: sku ? `Variação: ${sku}` : null,
    body,
    images,
    reviewed_at: reviewedAt,
  };
}

function normalizeAliProductId(sourceId: string): string | null {
  const raw = sourceId.trim();
  if (/^\d{5,}$/.test(raw)) return raw;
  const patterns = [
    /\/item\/(\d{5,})(?:\.html)?/i,
    /[?&](?:productId|product_id)=(\d{5,})/i,
    /\b(\d{8,})\b/,
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

async function findAliSourceId(admin: any, productId: string): Promise<string | null> {
  const { data } = await admin
    .from("product_imports")
    .select("source_id")
    .eq("product_id", productId)
    .in("source", ALI_SOURCES)
    .not("source_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.source_id ? String(data.source_id) : null;
}

async function translateBatch(
  rows: Array<{ title: string | null; body: string | null }>,
): Promise<Array<{ title: string | null; body: string | null; translated: boolean }>> {
  if (!rows.length) return [];
  const payload = rows.map((row, i) => ({ i, title: row.title ?? "", body: row.body ?? "" }));
  if (!payload.some((row) => row.title.trim() || row.body.trim())) {
    return rows.map((row) => ({ ...row, translated: true }));
  }

  const system =
    "Traduza SOMENTE title e body para português do Brasil. Não invente, resuma, complete nem altere o sentido. Preserve nomes, marcas, números, medidas, emojis e pontuação. Traduza 'Variação:' somente se necessário. Responda exclusivamente com JSON válido.";
  const prompt = `Retorne exatamente um array JSON [{"i":0,"title":"...","body":"..."}] para estes dados: ${JSON.stringify(payload)}`;

  try {
    const text = await generateWithOwnKeys(system, prompt);
    if (!text) return rows.map((row) => ({ ...row, translated: false }));
    const json = text.match(/\[[\s\S]*\]/)?.[0];
    if (!json) return rows.map((row) => ({ ...row, translated: false }));
    const parsed = JSON.parse(json) as Array<{ i?: number; title?: unknown; body?: unknown }>;
    const byIndex = new Map(parsed.filter((x) => typeof x.i === "number").map((x) => [x.i as number, x]));
    return rows.map((row, i) => {
      const translated = byIndex.get(i);
      if (!translated) return { ...row, translated: false };
      return {
        title: translated.title == null ? row.title : safeText(translated.title) ?? row.title,
        body: translated.body == null ? row.body : safeText(translated.body) ?? row.body,
        translated: true,
      };
    });
  } catch {
    return rows.map((row) => ({ ...row, translated: false }));
  }
}

async function fetchOfficialReviews(sourceId: string): Promise<{ reviews: NormalizedOfficialReview[]; productId: string }> {
  const productId = normalizeAliProductId(sourceId);
  if (!productId) {
    throw new Error(`ID do produto AliExpress inválido na importação: ${sourceId.slice(0, 120)}`);
  }

  const collected = new Map<string, NormalizedOfficialReview>();

  for (let page = 1; page <= OFFICIAL_SYNC_PAGES; page += 1) {
    const payload = await callAliTopPublic<any>("aliexpress.social.product.evaluation.query", {
      product_id: productId,
      page,
      page_size: OFFICIAL_SYNC_PAGE_SIZE,
    });
    const rows = findEvaluationRows(payload);
    if (!rows.length) break;

    for (const raw of rows) {
      const review = normalizeOfficialReview(raw, productId);
      if (review) collected.set(review.source_review_id, review);
    }
    if (rows.length < OFFICIAL_SYNC_PAGE_SIZE) break;
  }

  return { reviews: [...collected.values()], productId };
}

async function persistOfficialReviews(admin: any, productId: string, reviews: NormalizedOfficialReview[]) {
  if (!reviews.length) return { upserted: 0, translated: 0 };

  const ids = reviews.map((r) => r.source_review_id);
  const { data: existingRows } = await admin
    .from("product_external_reviews")
    .select("source_review_id,title,body,body_translated")
    .eq("product_id", productId)
    .eq("source", "aliexpress")
    .in("source_review_id", ids);

  const existing = new Map<string, any>();
  for (const row of existingRows ?? []) {
    if (row.source_review_id) existing.set(String(row.source_review_id), row);
  }

  const needsTranslation = reviews.filter((review) => {
    const current = existing.get(review.source_review_id);
    return !current || current.body_translated !== true;
  });

  const translatedMap = new Map<string, { title: string | null; body: string | null; translated: boolean }>();
  for (let i = 0; i < needsTranslation.length; i += 12) {
    const batch = needsTranslation.slice(i, i + 12);
    const translated = await translateBatch(batch.map((r) => ({ title: r.title, body: r.body })));
    batch.forEach((review, index) => translatedMap.set(review.source_review_id, translated[index]));
  }

  const now = new Date().toISOString();
  const rows = reviews.map((review) => {
    const current = existing.get(review.source_review_id);
    const translated = translatedMap.get(review.source_review_id);
    return {
      product_id: productId,
      source: "aliexpress",
      source_review_id: review.source_review_id,
      author_name: review.author_name,
      author_country: review.author_country,
      rating: review.rating,
      title: current?.body_translated === true ? current.title : translated?.title ?? review.title,
      body: current?.body_translated === true ? current.body : translated?.body ?? review.body,
      images: review.images,
      reviewed_at: review.reviewed_at,
      is_visible: true,
      body_translated: current?.body_translated === true || translated?.translated === true,
      last_synced_at: now,
    };
  });

  const { error } = await admin
    .from("product_external_reviews")
    .upsert(rows, { onConflict: "product_id,source,source_review_id" });
  if (error) throw new Error(`Falha ao salvar avaliações oficiais do AliExpress: ${error.message}`);

  return {
    upserted: rows.length,
    translated: [...translatedMap.values()].filter((x) => x.translated).length,
  };
}

async function translatePendingReviews(admin: any, productId: string, limit = 36): Promise<number> {
  const { data } = await admin
    .from("product_external_reviews")
    .select("id,title,body")
    .eq("product_id", productId)
    .eq("source", "aliexpress")
    .eq("is_visible", true)
    .eq("body_translated", false)
    .limit(limit);

  if (!data?.length) return 0;
  let translatedCount = 0;
  for (let i = 0; i < data.length; i += 12) {
    const batch = data.slice(i, i + 12);
    const translated = await translateBatch(batch.map((row: any) => ({ title: row.title, body: row.body })));
    for (let j = 0; j < batch.length; j += 1) {
      if (!translated[j]?.translated) continue;
      const { error } = await admin
        .from("product_external_reviews")
        .update({
          title: translated[j].title,
          body: translated[j].body,
          body_translated: true,
        })
        .eq("id", batch[j].id);
      if (!error) translatedCount += 1;
    }
  }
  return translatedCount;
}

async function syncLiveReviewsInternal(admin: any, productId: string, force = false) {
  const translatedBacklog = await translatePendingReviews(admin, productId);

  if (!force) {
    const { data: latest } = await admin
      .from("product_external_reviews")
      .select("last_synced_at")
      .eq("product_id", productId)
      .eq("source", "aliexpress")
      .not("source_review_id", "is", null)
      .order("last_synced_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    const last = latest?.last_synced_at ? new Date(latest.last_synced_at).getTime() : 0;
    if (last && Date.now() - last < AUTO_SYNC_TTL_HOURS * 60 * 60 * 1000) {
      return { fetched: 0, upserted: 0, translated: translatedBacklog, skipped: true, source: "cache" as const, error: null };
    }
  }

  const sourceId = await findAliSourceId(admin, productId);
  if (!sourceId) {
    return {
      fetched: 0,
      upserted: 0,
      translated: translatedBacklog,
      skipped: true,
      source: "none" as const,
      error: "Este produto não possui um ID de origem do AliExpress vinculado à importação.",
    };
  }

  let officialIssue: string | null = null;
  const normalizedSourceId = normalizeAliProductId(sourceId) ?? sourceId;
  try {
    const official = await fetchOfficialReviews(sourceId);
    if (official.reviews.length) {
      const saved = await persistOfficialReviews(admin, productId, official.reviews);
      return {
        fetched: official.reviews.length,
        upserted: saved.upserted,
        translated: translatedBacklog + saved.translated,
        skipped: false,
        source: "official_api" as const,
        error: null,
      };
    }
    officialIssue = `A API oficial do AliExpress retornou 0 avaliações globais para o produto ${official.productId}.`;
  } catch (error) {
    officialIssue = error instanceof Error ? error.message : String(error);
    console.warn("[reviews] API TOP oficial indisponível; tentando fallback compatível", error);
  }

  const fallback = await syncReviewsForProductInternal(admin, productId, normalizedSourceId, 0);
  const fallbackWorked = fallback.fetched > 0 || fallback.upserted > 0;
  const combinedError = fallbackWorked
    ? null
    : [officialIssue, fallback.error && `Fallback: ${fallback.error}`].filter(Boolean).join(" | ").slice(0, 1200) || null;

  return {
    fetched: fallback.fetched,
    upserted: fallback.upserted,
    translated: translatedBacklog + fallback.translated,
    skipped: false,
    source: "feedback_fallback" as const,
    error: combinedError,
  };
}

export const autoSyncLiveProductReviews = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => z.object({ product_id: z.string().uuid() }).parse(value))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return syncLiveReviewsInternal(supabaseAdmin, data.product_id, false);
  });

export const forceSyncLiveProductReviews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => z.object({ product_id: z.string().uuid() }).parse(value))
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return syncLiveReviewsInternal(supabaseAdmin, data.product_id, true);
  });

function mapReview(row: any): LiveExternalReview {
  return {
    ...row,
    images: Array.isArray(row.images) ? row.images.filter((x: unknown) => typeof x === "string") : [],
    body_translated: row.body_translated === true,
  } as LiveExternalReview;
}

export async function fetchProductReviewsPage({
  productId,
  page,
  filter,
  pageSize = REVIEW_PAGE_SIZE,
}: {
  productId: string;
  page: number;
  filter: ReviewFilter;
  pageSize?: number;
}): Promise<{ rows: LiveExternalReview[]; count: number; hasMore: boolean }> {
  const from = Math.max(0, page) * pageSize;
  const to = from + pageSize - 1;
  let query = supabase
    .from("product_external_reviews")
    .select("*", { count: "exact" })
    .eq("product_id", productId)
    .eq("is_visible", true)
    .order("reviewed_at", { ascending: false, nullsFirst: false });

  if (typeof filter === "number") query = query.eq("rating", filter);
  if (filter === "photos") query = query.not("images", "eq", "[]");

  const { data, error, count } = await query.range(from, to);
  if (error) throw error;
  const total = count ?? 0;
  return {
    rows: (data ?? []).map(mapReview),
    count: total,
    hasMore: from + (data?.length ?? 0) < total,
  };
}

export async function fetchProductReviewSummary(productId: string): Promise<ReviewSummary> {
  const { data, error } = await supabase
    .from("product_external_reviews")
    .select("rating,images")
    .eq("product_id", productId)
    .eq("is_visible", true)
    .limit(1000);
  if (error) throw error;

  const distribution: ReviewSummary["distribution"] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;
  let withPhotos = 0;
  for (const row of data ?? []) {
    const rating = Math.min(5, Math.max(1, Math.round(Number(row.rating) || 0))) as 1 | 2 | 3 | 4 | 5;
    distribution[rating] += 1;
    sum += Number(row.rating) || 0;
    if (Array.isArray(row.images) && row.images.length > 0) withPhotos += 1;
  }
  const total = data?.length ?? 0;
  return { total, average: total ? sum / total : 0, withPhotos, distribution };
}

export { REVIEW_PAGE_SIZE };
