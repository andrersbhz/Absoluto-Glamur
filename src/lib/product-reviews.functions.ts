import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { queryOptions } from "@tanstack/react-query";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabase } from "@/integrations/supabase/client";
import { generateWithOwnKeys } from "./ai-translate.server";

/* eslint-disable @typescript-eslint/no-explicit-any */

const ALI_SOURCES = ["aliexpress", "aliexpress_api", "aliexpress_url"];
const MAX_REVIEW_IMAGES = 8;
const AUTO_SYNC_TTL_HOURS = 12;

export type ExternalReview = {
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
  created_at: string;
  updated_at: string;
};

type NormalizedAliReview = {
  source_review_id: string | null;
  author_name: string | null;
  author_country: string | null;
  rating: number;
  title: string | null;
  body: string | null;
  images: string[];
  reviewed_at: string | null;
};

type ReviewTranslation = {
  title: string | null;
  body: string | null;
  translated: boolean;
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

async function translateReviewsToPtBr(
  items: { title: string | null; body: string | null }[],
): Promise<ReviewTranslation[]> {
  if (items.length === 0) return [];
  const payload = items.map((it, i) => ({ i, title: it.title ?? "", body: it.body ?? "" }));
  if (!payload.some((it) => it.title.trim() || it.body.trim())) {
    return items.map((it) => ({ ...it, translated: true }));
  }

  const system =
    "Traduza SOMENTE o conteúdo recebido para português do Brasil. Nunca invente, complete, resuma ou acrescente conteúdo. Preserve emojis, números, unidades e pontuação. Não traduza IDs, URLs, SKUs, hashes, códigos, tokens, usernames/nicknames ou outros identificadores. Responda somente com JSON válido.";
  const prompt = `Traduza somente title/body para PT-BR e retorne exatamente [{"i":0,"title":"...","body":"..."}].\n${JSON.stringify(payload)}`;

  try {
    const text = await generateWithOwnKeys(system, prompt);
    if (!text) return items.map((it) => ({ ...it, translated: false }));
    const match = text.match(/\[[\s\S]*\]/);
    const parsed = match ? JSON.parse(match[0]) : [];
    const map = new Map<number, { title?: unknown; body?: unknown }>();
    for (const row of parsed) if (typeof row?.i === "number") map.set(row.i, row);
    return items.map((orig, i) => {
      const row = map.get(i);
      if (!row) return { ...orig, translated: false };
      return {
        title: row.title == null ? orig.title : String(row.title) || orig.title,
        body: row.body == null ? orig.body : String(row.body) || orig.body,
        translated: true,
      };
    });
  } catch {
    return items.map((it) => ({ ...it, translated: false }));
  }
}

export function productReviewsQuery(productId: string | undefined) {
  return queryOptions({
    queryKey: ["product-external-reviews", productId],
    enabled: !!productId,
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async (): Promise<ExternalReview[]> => {
      if (!productId) return [];
      const { data, error } = await supabase
        .from("product_external_reviews")
        .select("*")
        .eq("product_id", productId)
        .eq("is_visible", true)
        .order("reviewed_at", { ascending: false, nullsFirst: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        ...r,
        images: Array.isArray(r.images) ? r.images : [],
      })) as ExternalReview[];
    },
  });
}

export const listAllReviews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ product_id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("product_external_reviews")
      .select("*")
      .eq("product_id", data.product_id)
      .order("reviewed_at", { ascending: false, nullsFirst: false });
    if (error) throw error;
    return (rows ?? []).map((r: any) => ({ ...r, images: Array.isArray(r.images) ? r.images : [] })) as ExternalReview[];
  });

function toNum(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number.parseFloat(v.replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function safeDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  const raw = typeof v === "number" && v < 10_000_000_000 ? v * 1000 : v;
  const d = new Date(raw as any);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function safeText(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, 8000) : null;
}

function safeImageUrl(v: unknown): string | null {
  if (typeof v !== "string") return null;
  try {
    const u = new URL(v.startsWith("//") ? `https:${v}` : v);
    if (!["http:", "https:"].includes(u.protocol)) return null;
    const h = u.hostname.toLowerCase();
    if (h === "example.com" || h.endsWith(".example.com")) return null;
    const allowed = h.includes("aliexpress") || h.includes("alicdn") || h.includes("aliimg") || h.includes("aliexpress-media");
    return allowed ? u.toString() : null;
  } catch {
    return null;
  }
}

function collectImages(v: unknown): string[] {
  const out: string[] = [];
  const add = (x: unknown) => {
    const url = safeImageUrl(x);
    if (url && !out.includes(url)) out.push(url);
  };
  if (Array.isArray(v)) {
    for (const x of v) {
      if (typeof x === "string") add(x);
      else if (x && typeof x === "object") {
        add((x as any).url ?? (x as any).image_url ?? (x as any).imageUrl ?? (x as any).src);
      }
    }
  } else if (typeof v === "string") {
    for (const x of v.split(/[,;\s]+/)) add(x);
  } else if (v && typeof v === "object") {
    for (const x of Object.values(v as Record<string, unknown>)) {
      if (Array.isArray(x)) {
        for (const y of x) add(typeof y === "string" ? y : (y as any)?.url ?? (y as any)?.imageUrl);
      } else add(typeof x === "string" ? x : null);
    }
  }
  return out.slice(0, MAX_REVIEW_IMAGES);
}

function normalizeAliReview(raw: any): NormalizedAliReview {
  return {
    source_review_id: safeText(raw.feedback_id ?? raw.feedbackId ?? raw.id ?? raw.review_id ?? raw.reviewId ?? raw.evaluation_id ?? raw.evaId),
    author_name: safeText(raw.buyer_name ?? raw.buyerName ?? raw.author ?? raw.buyer_nick ?? raw.buyerNick ?? raw.user_name ?? raw.userName ?? raw.anonymousName),
    author_country: safeText(raw.buyer_country ?? raw.buyerCountry ?? raw.country ?? raw.country_code ?? raw.countryCode ?? raw.buyerCountryCode),
    rating: Math.min(5, Math.max(0, toNum(raw.buyer_feedback_rating ?? raw.rating ?? raw.star ?? raw.stars ?? raw.buyer_rating ?? raw.evaluation_star ?? raw.starView))),
    title: safeText(raw.feedback_title ?? raw.feedbackTitle ?? raw.title),
    body: safeText(raw.buyer_feedback ?? raw.feedback ?? raw.content ?? raw.review_content ?? raw.evaluation_content ?? raw.buyerFeedback ?? raw.evaContent),
    images: collectImages(
      raw.buyer_feedback_image ??
        raw.buyer_feedback_images ??
        raw.images ??
        raw.image_list ??
        raw.evaluation_image_list ??
        raw.imageList ??
        raw.pictures ??
        raw.buyerFeedbackPicList ??
        raw.evaImageList,
    ),
    reviewed_at: safeDate(
      raw.buyer_feedback_date ??
        raw.buyerFeedbackDate ??
        raw.feedback_date ??
        raw.date ??
        raw.create_time ??
        raw.createTime ??
        raw.gmt_create ??
        raw.evalDate ??
        raw.evaDate,
    ),
  };
}

function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function ensureStableReviewId(productSourceId: string, r: NormalizedAliReview): NormalizedAliReview | null {
  if (r.source_review_id) return r;
  const hasRealContent = !!(r.body || r.title || (r.author_name && r.reviewed_at) || r.images.length);
  if (!hasRealContent) return null;
  const material = [r.author_name, r.reviewed_at, r.rating, r.title, r.body, r.images.join("|")]
    .map((x) => String(x ?? ""))
    .join("\u241f");
  return { ...r, source_review_id: `det-${fnv1a(`${productSourceId}\u241e${material}`)}` };
}

function dedupeReviews(productSourceId: string, reviews: NormalizedAliReview[], minRating: number) {
  const seen = new Set<string>();
  const out: NormalizedAliReview[] = [];
  for (const raw of reviews) {
    if (raw.rating <= 0 || raw.rating < minRating) continue;
    const r = ensureStableReviewId(productSourceId, raw);
    if (!r?.source_review_id || seen.has(r.source_review_id)) continue;
    seen.add(r.source_review_id);
    out.push(r);
  }
  return out;
}

function extractEvaList(payload: any): any[] {
  const direct = payload?.data?.evaViewList;
  if (Array.isArray(direct)) return direct;
  const candidates = [
    payload?.evaViewList,
    payload?.data?.reviews,
    payload?.reviews,
    payload?.data?.feedbacks,
    payload?.feedbacks,
  ];
  for (const c of candidates) if (Array.isArray(c)) return c;
  return [];
}

async function fetchAliexpressReviews(
  productId: string,
  minRating = 0,
): Promise<{ reviews: NormalizedAliReview[]; errors: string[] }> {
  const errors: string[] = [];
  const pages = [1, 2, 3];
  const collected: NormalizedAliReview[] = [];

  for (const page of pages) {
    const url = new URL("https://feedback.aliexpress.com/pc/searchEvaluation.do");
    url.searchParams.set("productId", productId);
    url.searchParams.set("lang", "en_US");
    url.searchParams.set("country", "US");
    url.searchParams.set("page", String(page));
    url.searchParams.set("pageSize", "20");
    url.searchParams.set("filter", "all");
    url.searchParams.set("sort", "complex_default");

    try {
      const res = await fetch(url.toString(), {
        method: "GET",
        redirect: "follow",
        headers: {
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "en-US,en;q=0.9",
          Referer: `https://www.aliexpress.com/item/${productId}.html`,
          Origin: "https://www.aliexpress.com",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
        },
      });
      if (!res.ok) {
        errors.push(`AliExpress avaliações HTTP ${res.status} (página ${page})`);
        continue;
      }
      const text = await res.text();
      let payload: any;
      try {
        payload = JSON.parse(text);
      } catch {
        errors.push(`Resposta de avaliações não veio em JSON (página ${page}).`);
        continue;
      }
      const list = extractEvaList(payload);
      if (!list.length) {
        if (page === 1) errors.push("AliExpress respondeu sem data.evaViewList.");
        break;
      }
      collected.push(...list.map(normalizeAliReview));
      if (list.length < 20) break;
    } catch (e) {
      errors.push(`Falha ao consultar avaliações: ${(e instanceof Error ? e.message : String(e)).slice(0, 220)}`);
      break;
    }
  }

  const reviews = dedupeReviews(productId, collected, minRating);
  return { reviews, errors: errors.slice(0, 6) };
}

async function persistRealReviews(admin: any, productId: string, reviews: NormalizedAliReview[]) {
  if (!reviews.length) return { upserted: 0, translated: 0 };
  const translated = await translateReviewsToPtBr(
    reviews.map((r) => ({ title: r.title, body: r.body })),
  );
  const now = new Date().toISOString();
  const rows = reviews.map((r, i) => ({
    product_id: productId,
    source: "aliexpress",
    source_review_id: r.source_review_id!,
    author_name: r.author_name,
    author_country: r.author_country,
    rating: r.rating,
    title: translated[i]?.title ?? r.title,
    body: translated[i]?.body ?? r.body,
    images: r.images,
    reviewed_at: r.reviewed_at,
    is_visible: true,
    body_translated: translated[i]?.translated ?? false,
    last_synced_at: now,
  }));

  const { error } = await admin
    .from("product_external_reviews")
    .upsert(rows, { onConflict: "product_id,source,source_review_id" });
  if (error) throw new Error(`Falha ao salvar avaliações: ${error.message}`);

  const { count, error: countError } = await admin
    .from("product_external_reviews")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId)
    .eq("source", "aliexpress")
    .eq("is_visible", true);
  if (countError) throw new Error(`Avaliações foram gravadas, mas não foi possível validar: ${countError.message}`);
  if (!count || count <= 0) throw new Error("O AliExpress retornou avaliações, mas nenhuma ficou visível no banco.");

  return {
    upserted: rows.length,
    translated: translated.filter((x) => x.translated).length,
  };
}

export async function syncReviewsForProductInternal(
  admin: any,
  productId: string,
  sourceId: string,
  minRating = 0,
): Promise<{ fetched: number; upserted: number; translated: number; error: string | null }> {
  try {
    const result = await fetchAliexpressReviews(sourceId, minRating);
    if (!result.reviews.length) {
      return {
        fetched: 0,
        upserted: 0,
        translated: 0,
        error: result.errors.length ? result.errors.join(" | ").slice(0, 900) : "Nenhuma avaliação real retornada pelo AliExpress.",
      };
    }
    const saved = await persistRealReviews(admin, productId, result.reviews);
    return { fetched: result.reviews.length, ...saved, error: null };
  } catch (e) {
    return {
      fetched: 0,
      upserted: 0,
      translated: 0,
      error: (e instanceof Error ? e.message : String(e)).slice(0, 900),
    };
  }
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

export const syncAliexpressReviews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ product_id: z.string().uuid(), min_rating: z.number().min(0).max(5).default(0) }).parse(v),
  )
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sourceId = await findAliSourceId(supabaseAdmin, data.product_id);
    if (!sourceId) throw new Error("Este produto não está conectado ao AliExpress.");

    const result = await syncReviewsForProductInternal(
      supabaseAdmin,
      data.product_id,
      sourceId,
      data.min_rating,
    );
    if (result.error) throw new Error(result.error);

    return {
      ...result,
      message: `${result.upserted} avaliações reais sincronizadas e liberadas para exibição.`,
    };
  });

const REVIEW_INPUT = z.object({
  id: z.string().uuid().optional(),
  product_id: z.string().uuid(),
  author_name: z.string().nullable().optional(),
  author_country: z.string().nullable().optional(),
  rating: z.number().min(0).max(5),
  title: z.string().nullable().optional(),
  body: z.string().nullable().optional(),
  images: z.array(z.string().url()).default([]),
  is_visible: z.boolean().default(true),
  reviewed_at: z.string().nullable().optional(),
});

export const upsertReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => REVIEW_INPUT.parse(v))
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload = {
      product_id: data.product_id,
      author_name: data.author_name ?? null,
      author_country: data.author_country ?? null,
      rating: data.rating,
      title: data.title ?? null,
      body: data.body ?? null,
      images: data.images ?? [],
      is_visible: data.is_visible,
      reviewed_at: data.reviewed_at ?? null,
      source: "manual",
    };
    if (data.id) {
      const { data: row, error } = await supabaseAdmin
        .from("product_external_reviews")
        .update(payload)
        .eq("id", data.id)
        .select("*")
        .single();
      if (error) throw error;
      return row;
    }
    const { data: row, error } = await supabaseAdmin
      .from("product_external_reviews")
      .insert(payload)
      .select("*")
      .single();
    if (error) throw error;
    return row;
  });

export const deleteReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("product_external_reviews").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const bulkSyncAliexpressReviews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ min_rating: z.number().min(0).max(5).default(0), limit: z.number().int().min(1).max(200).default(50) }).parse(v ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: linked, error } = await supabaseAdmin
      .from("product_imports")
      .select("product_id, source_id, created_at")
      .in("source", ALI_SOURCES)
      .not("product_id", "is", null)
      .not("source_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(data.limit * 3);
    if (error) throw error;

    const seen = new Set<string>();
    const unique = (linked ?? []).filter((r) => {
      if (!r.product_id || seen.has(r.product_id)) return false;
      seen.add(r.product_id);
      return true;
    }).slice(0, data.limit);

    let processed = 0;
    let fetched = 0;
    let upserted = 0;
    let translated = 0;
    const failures: { product_id: string; error: string }[] = [];

    for (const row of unique) {
      const r = await syncReviewsForProductInternal(
        supabaseAdmin,
        row.product_id!,
        String(row.source_id),
        data.min_rating,
      );
      processed++;
      fetched += r.fetched;
      upserted += r.upserted;
      translated += r.translated;
      if (r.error) failures.push({ product_id: row.product_id!, error: r.error });
    }

    return { total: unique.length, processed, fetched, upserted, translated, failures };
  });

export const autoSyncProductReviews = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => z.object({ product_id: z.string().uuid() }).parse(v))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: untranslated } = await supabaseAdmin
      .from("product_external_reviews")
      .select("id, title, body")
      .eq("product_id", data.product_id)
      .eq("source", "aliexpress")
      .eq("is_visible", true)
      .eq("body_translated", false)
      .not("source_review_id", "is", null)
      .limit(30);

    let translatedCount = 0;
    if (untranslated?.length) {
      const tr = await translateReviewsToPtBr(
        untranslated.map((r: any) => ({ title: r.title, body: r.body })),
      );
      for (let i = 0; i < untranslated.length; i++) {
        if (!tr[i]?.translated) continue;
        const { error } = await supabaseAdmin
          .from("product_external_reviews")
          .update({ title: tr[i].title, body: tr[i].body, body_translated: true })
          .eq("id", untranslated[i].id);
        if (!error) translatedCount++;
      }
    }

    const { data: latest } = await supabaseAdmin
      .from("product_external_reviews")
      .select("last_synced_at")
      .eq("product_id", data.product_id)
      .eq("source", "aliexpress")
      .not("source_review_id", "is", null)
      .order("last_synced_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    const lastSync = latest?.last_synced_at ? new Date(latest.last_synced_at).getTime() : 0;
    if (lastSync && Date.now() - lastSync < AUTO_SYNC_TTL_HOURS * 3600 * 1000) {
      return { translated: translatedCount, fetched: 0, upserted: 0, skipped: true, error: null };
    }

    const sourceId = await findAliSourceId(supabaseAdmin, data.product_id);
    if (!sourceId) {
      return { translated: translatedCount, fetched: 0, upserted: 0, skipped: true, error: null };
    }

    const r = await syncReviewsForProductInternal(supabaseAdmin, data.product_id, sourceId, 0);
    return {
      translated: translatedCount + r.translated,
      fetched: r.fetched,
      upserted: r.upserted,
      skipped: false,
      error: r.error,
    };
  });
