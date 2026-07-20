import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { queryOptions } from "@tanstack/react-query";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabase } from "@/integrations/supabase/client";
import { callAli } from "./aliexpress-discovery.functions";

/* eslint-disable @typescript-eslint/no-explicit-any */

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

async function assertCatalog(context: any) {
  const { data: adm } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
  if (adm) return;
  const { data: hasCat } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "catalog",
  });
  if (!hasCat) throw new Error("Acesso restrito a administradores ou equipe de catálogo");
}

// -------- Public query (browser Supabase, RLS: is_visible=true) --------

export function productReviewsQuery(productId: string | undefined) {
  return queryOptions({
    queryKey: ["product-external-reviews", productId],
    enabled: !!productId,
    queryFn: async (): Promise<ExternalReview[]> => {
      if (!productId) return [];
      const { data, error } = await supabase
        .from("product_external_reviews")
        .select("*")
        .eq("product_id", productId)
        .gte("rating", 4.5)
        .order("reviewed_at", { ascending: false, nullsFirst: false })
        .limit(60);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        ...r,
        images: Array.isArray(r.images) ? r.images : [],
      })) as ExternalReview[];
    },
  });
}

// Admin fetch (includes hidden)
export const listAllReviews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ product_id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("product_external_reviews")
      .select("*")
      .eq("product_id", data.product_id)
      .order("reviewed_at", { ascending: false, nullsFirst: false });
    return (rows ?? []) as ExternalReview[];
  });

// -------- AliExpress fetch --------

function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function pickArray(obj: any, keys: string[]): any[] {
  for (const k of keys) {
    const v = obj?.[k];
    if (Array.isArray(v)) return v;
    if (v && typeof v === "object") {
      // TOP wraps arrays as { key: [ ... ] }
      const inner = Object.values(v).find((x) => Array.isArray(x));
      if (Array.isArray(inner)) return inner;
    }
  }
  return [];
}

function normalizeAliReview(raw: any): {
  source_review_id: string | null;
  author_name: string | null;
  author_country: string | null;
  rating: number;
  title: string | null;
  body: string | null;
  images: string[];
  reviewed_at: string | null;
} {
  const rating = toNum(
    raw.buyer_feedback_rating ?? raw.rating ?? raw.star ?? raw.buyer_rating ?? raw.evaluation_star,
  );
  const body =
    raw.buyer_feedback ??
    raw.feedback ??
    raw.content ??
    raw.review_content ??
    raw.evaluation_content ??
    null;
  const imgsRaw =
    raw.buyer_feedback_image ??
    raw.buyer_feedback_images ??
    raw.images ??
    raw.image_list ??
    raw.evaluation_image_list ??
    [];
  let images: string[] = [];
  if (Array.isArray(imgsRaw)) images = imgsRaw.filter(Boolean).map(String);
  else if (typeof imgsRaw === "string")
    images = imgsRaw.split(/[,;\s]+/).filter((s) => s.startsWith("http"));
  else if (imgsRaw && typeof imgsRaw === "object") {
    const inner = Object.values(imgsRaw).find((x) => Array.isArray(x));
    if (Array.isArray(inner)) images = inner.filter(Boolean).map(String);
  }
  const dateRaw =
    raw.buyer_feedback_date ?? raw.feedback_date ?? raw.date ?? raw.create_time ?? raw.gmt_create ?? null;
  const reviewedAt = dateRaw ? new Date(dateRaw).toISOString() : null;
  return {
    source_review_id: String(
      raw.feedback_id ?? raw.id ?? raw.review_id ?? raw.evaluation_id ?? "",
    ) || null,
    author_name: raw.buyer_name ?? raw.author ?? raw.buyer_nick ?? raw.user_name ?? null,
    author_country: raw.buyer_country ?? raw.country ?? raw.country_code ?? null,
    rating: Math.min(5, Math.max(0, rating)),
    title: raw.feedback_title ?? raw.title ?? null,
    body,
    images,
    reviewed_at: Number.isNaN(new Date(reviewedAt ?? "").getTime()) ? null : reviewedAt,
  };
}

async function fetchAliexpressReviews(productId: string, minRating = 4.5): Promise<any[]> {
  // Best-effort: try DS feedback endpoint(s) — different partner accounts expose
  // different methods; catch failures and return empty so the UI still works.
  const methods = [
    "aliexpress.ds.feedback.query",
    "aliexpress.ds.product.feedback.query",
    "aliexpress.solution.feedback.info.get",
  ];
  const params = {
    product_id: productId,
    page_no: "1",
    page_size: "40",
    filter: "5", // only 5-star when supported
    language: "en_US",
    country: "BR",
  } as Record<string, string>;

  for (const method of methods) {
    try {
      const json = await callAli(method, params);
      const root = (json as any)[Object.keys(json as any).find((k) => k.endsWith("_response")) ?? ""] ?? json;
      const result = (root as any).result ?? root;
      const list = pickArray(result, [
        "feedbacks",
        "feedback_list",
        "reviews",
        "evaluation_list",
        "products",
      ]);
      if (list.length > 0) {
        return list
          .map(normalizeAliReview)
          .filter((r) => r.rating >= minRating);
      }
    } catch {
      // try next
    }
  }
  return [];
}

export const syncAliexpressReviews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        product_id: z.string().uuid(),
        min_rating: z.number().min(0).max(5).default(4.5),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: imp } = await supabaseAdmin
      .from("product_imports")
      .select("source_id")
      .eq("product_id", data.product_id)
      .in("source", ["aliexpress", "aliexpress_api"])
      .not("source_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!imp?.source_id) {
      throw new Error(
        "Este produto não está conectado ao AliExpress (sem source_id no importador).",
      );
    }

    const reviews = await fetchAliexpressReviews(imp.source_id, data.min_rating);
    if (reviews.length === 0) {
      return { fetched: 0, upserted: 0, message: "Nenhuma avaliação retornada pela API do AliExpress." };
    }

    const rows = reviews.map((r) => ({
      product_id: data.product_id,
      source: "aliexpress",
      source_review_id: r.source_review_id,
      author_name: r.author_name,
      author_country: r.author_country,
      rating: r.rating,
      title: r.title,
      body: r.body,
      images: r.images,
      reviewed_at: r.reviewed_at,
      is_visible: true,
    }));

    const { error } = await supabaseAdmin
      .from("product_external_reviews")
      .upsert(rows, { onConflict: "product_id,source,source_review_id" });
    if (error) throw error;

    return { fetched: reviews.length, upserted: rows.length };
  });

// -------- CRUD (admin) --------

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
    const { error } = await supabaseAdmin
      .from("product_external_reviews")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
