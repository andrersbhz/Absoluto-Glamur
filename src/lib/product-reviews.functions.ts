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

export async function syncReviewsForProductInternal(
  admin: any,
  productId: string,
  _sourceId: string,
  _minRating = 0,
): Promise<{ fetched: number; upserted: number; translated: number; error: string | null }> {
  // Compatibilidade para telas/rotinas antigas: todas passam pelo mesmo conector
  // oficial. Não existe mais fallback por scraping de feedback.aliexpress.com.
  const { syncLiveReviewsInternal } = await import("./product-reviews-live.functions");
  const result = await syncLiveReviewsInternal(admin, productId, true);
  return {
    fetched: result.fetched,
    upserted: result.upserted,
    translated: result.translated,
    error: result.error,
  };
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
