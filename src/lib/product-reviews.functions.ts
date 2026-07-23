import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { queryOptions } from "@tanstack/react-query";
import { generateText } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabase } from "@/integrations/supabase/client";
import { callAli } from "./aliexpress-discovery.functions";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ---------- Tradução em lote para PT-BR (Lovable AI) ----------
async function translateReviewsToPtBr(
  items: { title: string | null; body: string | null }[],
): Promise<{ title: string | null; body: string | null }[]> {
  if (items.length === 0) return [];
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return items;
  // Só envia para IA aqueles que têm algum texto.
  const indexed = items.map((it, i) => ({ i, ...it }));
  const needing = indexed.filter((it) => (it.title && it.title.trim()) || (it.body && it.body.trim()));
  if (needing.length === 0) return items;

  const payload = needing.map((it) => ({
    i: it.i,
    title: it.title ?? "",
    body: it.body ?? "",
  }));

  const gateway = createLovableAiGatewayProvider(key);
  const model = gateway("google/gemini-2.5-flash");

  const prompt = `Traduza para português do Brasil (PT-BR) as avaliações abaixo, mantendo o tom natural e coloquial de cliente. Preserve emojis, quebras de linha e pontuação. NÃO invente conteúdo. Se já estiver em PT-BR, apenas corrija erros óbvios de ortografia. Retorne SOMENTE um JSON válido no formato:
[{"i": <indice>, "title": "...", "body": "..."}]

Entrada:
${JSON.stringify(payload)}`;

  try {
    const { text } = await generateText({
      model,
      prompt,
      temperature: 0.2,
    });
    const match = text.match(/\[[\s\S]*\]/);
    const parsed = match ? JSON.parse(match[0]) : [];
    const map = new Map<number, { title?: string; body?: string }>();
    for (const row of parsed) {
      if (typeof row?.i === "number") {
        map.set(row.i, { title: row.title, body: row.body });
      }
    }
    return items.map((orig, i) => {
      const t = map.get(i);
      if (!t) return orig;
      return {
        title: t.title !== undefined && t.title !== null ? String(t.title) || orig.title : orig.title,
        body: t.body !== undefined && t.body !== null ? String(t.body) || orig.body : orig.body,
      };
    });
  } catch {
    return items;
  }
}


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

async function fetchViaFirecrawl(productId: string, minRating: number): Promise<any[]> {
  const key = process.env.FIRECRAWL_API_KEY;
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!key) return [];
  const isGateway = key.startsWith("lovc_");
  const endpoint = isGateway
    ? "https://connector-gateway.lovable.dev/firecrawl/v2/scrape"
    : "https://api.firecrawl.dev/v2/scrape";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (isGateway) {
    if (!lovableKey) return [];
    headers.Authorization = `Bearer ${lovableKey}`;
    headers["X-Connection-Api-Key"] = key;
  } else {
    headers.Authorization = `Bearer ${key}`;
  }
  const schema = {
    type: "object",
    properties: {
      reviews: {
        type: "array",
        items: {
          type: "object",
          properties: {
            author_name: { type: "string" },
            author_country: { type: "string" },
            rating: { type: "number" },
            body: { type: "string" },
            reviewed_at: { type: "string" },
            images: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
    required: ["reviews"],
  };
  const urls = [
    `https://www.aliexpress.com/item/${productId}.html`,
    `https://feedback.aliexpress.com/display/productEvaluation.htm?productId=${productId}&filter=all&page=1`,
  ];
  const out: any[] = [];
  for (const url of urls) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          url,
          onlyMainContent: true,
          formats: [
            {
              type: "json",
              schema,
              prompt:
                "Extract customer product reviews from this page. For each review, capture the author's display name, country, star rating (0-5), comment body in the original language, review date (YYYY-MM-DD if possible), and up to 4 image URLs uploaded by the buyer. Only include reviews visible on the page.",
            },
          ],
        }),
      });
      if (!res.ok) continue;
      const payload = await res.json();
      const root = payload.data ?? payload;
      const list = root?.json?.reviews;
      if (!Array.isArray(list)) continue;
      for (const r of list) {
        const rating = toNum(r.rating);
        if (rating < minRating) continue;
        const reviewedAt = r.reviewed_at ? new Date(r.reviewed_at).toISOString() : null;
        out.push({
          source_review_id: null,
          author_name: r.author_name ?? null,
          author_country: r.author_country ?? null,
          rating: Math.min(5, Math.max(0, rating)),
          title: null,
          body: r.body ?? null,
          images: Array.isArray(r.images) ? r.images.filter(Boolean).map(String) : [],
          reviewed_at: Number.isNaN(new Date(reviewedAt ?? "").getTime()) ? null : reviewedAt,
        });
      }
      if (out.length > 0) break;
    } catch {
      // try next
    }
  }
  return out;
}

async function fetchAliexpressReviews(productId: string, minRating = 4.5): Promise<any[]> {
  // 1) Official DS/solution feedback endpoints (varies by partner account)
  const methods = [
    "aliexpress.ds.feedback.query",
    "aliexpress.ds.product.feedback.query",
    "aliexpress.solution.feedback.info.get",
  ];
  const params = {
    product_id: productId,
    page_no: "1",
    page_size: "40",
    filter: "5",
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
        const norm = list.map(normalizeAliReview).filter((r) => r.rating >= minRating);
        if (norm.length > 0) return norm;
      }
    } catch {
      // try next
    }
  }
  // 2) Firecrawl fallback (scrape product page)
  return await fetchViaFirecrawl(productId, minRating);
}

// Internal helper: fetch + upsert reviews for one product. Safe to call from
// other server functions (e.g. right after importing a product). Best-effort;
// returns counts without throwing on transient upstream failures.
export async function syncReviewsForProductInternal(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  productId: string,
  sourceId: string,
  minRating = 4.5,
): Promise<{ fetched: number; upserted: number }> {
  try {
    const reviews = await fetchAliexpressReviews(sourceId, minRating);
    if (reviews.length === 0) return { fetched: 0, upserted: 0 };
    const rows = reviews.map((r) => ({
      product_id: productId,
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
    const { error } = await admin
      .from("product_external_reviews")
      .upsert(rows, { onConflict: "product_id,source,source_review_id" });
    if (error) return { fetched: reviews.length, upserted: 0 };
    return { fetched: reviews.length, upserted: rows.length };
  } catch {
    return { fetched: 0, upserted: 0 };
  }
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

// -------- Bulk sync (all linked products) --------

export const bulkSyncAliexpressReviews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        min_rating: z.number().min(0).max(5).default(4.5),
        limit: z.number().int().min(1).max(200).default(50),
      })
      .parse(v ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: linked } = await supabaseAdmin
      .from("product_imports")
      .select("product_id, source_id, created_at")
      .in("source", ["aliexpress", "aliexpress_api"])
      .not("product_id", "is", null)
      .not("source_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(data.limit);

    const seen = new Set<string>();
    const unique = (linked ?? []).filter((r) => {
      const k = `${r.product_id}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    let processed = 0;
    let upserted = 0;
    const failures: { product_id: string; error: string }[] = [];

    for (const row of unique) {
      try {
        const reviews = await fetchAliexpressReviews(String(row.source_id), data.min_rating);
        if (reviews.length > 0) {
          const rows = reviews.map((r) => ({
            product_id: row.product_id!,
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
          upserted += rows.length;
        }
        processed++;
      } catch (e) {
        failures.push({
          product_id: row.product_id!,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return { total: unique.length, processed, upserted, failures };
  });

