import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callAli } from "./aliexpress-discovery.functions";
import { callAliTopPublic } from "./aliexpress-top-public.server";
import { generateWithOwnKeys } from "./ai-translate.server";

/* eslint-disable @typescript-eslint/no-explicit-any */

const MAX_PAGES = 8;
const PAGE_SIZE = 20;
const MAX_IMAGES = 8;

type NormalizedReview = {
  source_review_id: string;
  author_name: string | null;
  author_country: string | null;
  rating: number;
  title: string | null;
  body: string | null;
  images: string[];
  reviewed_at: string | null;
  body_translated?: boolean;
};

type AliProductReviewMeta = {
  requestedProductId: string;
  mainProductId: string | null;
  total: number | null;
  average: number | null;
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

function normalizeAliProductId(source: string): string | null {
  const raw = source.trim();
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

function safeText(value: unknown, max = 8000): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, max) : null;
}

function ratingOf(value: unknown): number {
  const parsed = Number.parseFloat(String(value ?? "0").replace(",", "."));
  return Number.isFinite(parsed) ? Math.min(5, Math.max(0, parsed)) : 0;
}

function optionalRating(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number.parseFloat(String(value).replace("%", "").replace(",", ".").trim());
  if (!Number.isFinite(parsed)) return null;
  const normalized = parsed > 5 && parsed <= 100 ? parsed / 20 : parsed;
  return Math.round(Math.min(5, Math.max(0, normalized)) * 100) / 100;
}

function optionalCount(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
}

function isoDate(value: unknown): string | null {
  if (value == null || value === "") return null;
  const numeric = typeof value === "number" ? value : Number(value);
  const raw =
    Number.isFinite(numeric) && numeric > 0
      ? numeric < 10_000_000_000
        ? numeric * 1000
        : numeric
      : value;
  const date = new Date(raw as string | number);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function imageUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.startsWith("//") ? `https:${value}` : value);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    const host = url.hostname.toLowerCase();
    if (!(host.includes("alicdn") || host.includes("aliexpress") || host.includes("aliimg")))
      return null;
    return url.toString();
  } catch {
    return null;
  }
}

function collectImages(value: unknown): string[] {
  const result: string[] = [];
  const add = (candidate: unknown) => {
    const url = imageUrl(candidate);
    if (url && !result.includes(url)) result.push(url);
  };

  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string") add(item);
      else if (item && typeof item === "object") {
        add(
          (item as any).url ??
            (item as any).image_url ??
            (item as any).imageUrl ??
            (item as any).src,
        );
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
  return result.slice(0, MAX_IMAGES);
}

function hashText(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function findRows(payload: unknown, depth = 0): any[] {
  if (depth > 9 || payload == null) return [];
  if (Array.isArray(payload)) {
    if (
      payload.some(
        (row) =>
          row &&
          typeof row === "object" &&
          ("feedback" in row ||
            "evaluation" in row ||
            "buyer_blured_name" in row ||
            "buyer_country_code" in row),
      )
    )
      return payload;
    for (const value of payload) {
      const found = findRows(value, depth + 1);
      if (found.length) return found;
    }
    return [];
  }
  if (typeof payload === "object") {
    for (const value of Object.values(payload as Record<string, unknown>)) {
      const found = findRows(value, depth + 1);
      if (found.length) return found;
    }
  }
  return [];
}

function extractPage(payload: any): { rows: any[]; total: number } {
  const root = payload?.aliexpress_social_product_evaluation_query_response ?? payload;
  const result = root?.result?.result ?? root?.result ?? root;
  const evaluations = result?.evaluations;
  const buyerEvaluations =
    evaluations?.buyer_evaluation ?? evaluations?.buyerEvaluation ?? evaluations;
  const rows = Array.isArray(buyerEvaluations)
    ? buyerEvaluations
    : buyerEvaluations && typeof buyerEvaluations === "object"
      ? [buyerEvaluations]
      : findRows(payload);
  const totalRaw = result?.total_number ?? result?.totalNumber ?? rows.length;
  const total = Number.isFinite(Number(totalRaw)) ? Math.max(0, Number(totalRaw)) : rows.length;
  return { rows, total };
}

function normalizeReview(raw: any, sourceProductId: string): NormalizedReview | null {
  const rating = ratingOf(raw.evaluation ?? raw.rating ?? raw.star ?? raw.stars);
  if (rating <= 0) return null;

  const feedback = safeText(raw.feedback ?? raw.content ?? raw.evaluation_content);
  const additional = safeText(raw.additional_feedback ?? raw.additionalFeedback);
  const body =
    [feedback, additional ? `Avaliação adicional: ${additional}` : null]
      .filter(Boolean)
      .join("\n\n") || null;
  const author = safeText(
    raw.buyer_blured_name ?? raw.buyer_name ?? raw.buyerName ?? raw.author,
    180,
  );
  const country = safeText(
    raw.buyer_country_code ?? raw.buyer_country ?? raw.country_code ?? raw.country,
    12,
  );
  const reviewedAt = isoDate(
    raw.feedback_epoch_date ?? raw.feedback_date ?? raw.date ?? raw.create_time,
  );
  const images = collectImages(raw.image_urls ?? raw.images ?? raw.image_list ?? raw.pictures);
  const orderId = safeText(raw.order_id ?? raw.orderId, 160);
  const directId = safeText(raw.feedback_id ?? raw.review_id ?? raw.id ?? raw.evaluation_id, 160);
  const sku = safeText(raw.product_sku ?? raw.sku, 240);
  const material = [
    sourceProductId,
    orderId,
    author,
    reviewedAt,
    rating,
    sku,
    feedback,
    additional,
    images.join("|"),
  ].join("\u241f");

  return {
    source_review_id: directId ?? (orderId ? `order-${orderId}` : `direct-${hashText(material)}`),
    author_name: author,
    author_country: country,
    rating,
    title: sku ? `Variação: ${sku}` : null,
    body,
    images,
    reviewed_at: reviewedAt,
    body_translated: false,
  };
}

async function translateReviews(reviews: NormalizedReview[], credentialClient: any) {
  if (!reviews.length) return { reviews, translated: 0 };
  let translatedCount = 0;
  const output = reviews.map((review) => ({ ...review, body_translated: false }));

  for (let start = 0; start < reviews.length; start += 12) {
    const batch = reviews.slice(start, start + 12);
    if (!batch.some((row) => row.title || row.body)) continue;
    const payload = batch.map((row, i) => ({ i, title: row.title ?? "", body: row.body ?? "" }));
    const system =
      "Traduza SOMENTE title e body para português do Brasil. Não invente, resuma, complete nem altere o sentido. Preserve nomes, marcas, números, medidas, emojis e pontuação. Responda exclusivamente com JSON válido.";
    const prompt = `Retorne exatamente um array JSON [{"i":0,"title":"...","body":"..."}] para estes dados: ${JSON.stringify(payload)}`;
    try {
      const text = await generateWithOwnKeys(system, prompt, credentialClient);
      const json = text?.match(/\[[\s\S]*\]/)?.[0];
      if (!json) continue;
      const parsed = JSON.parse(json) as Array<{ i?: number; title?: unknown; body?: unknown }>;
      const byIndex = new Map(
        parsed.filter((item) => typeof item.i === "number").map((item) => [item.i as number, item]),
      );
      batch.forEach((row, i) => {
        const item = byIndex.get(i);
        if (!item) return;
        output[start + i] = {
          ...row,
          title: item.title == null ? row.title : (safeText(item.title, 500) ?? row.title),
          body: item.body == null ? row.body : (safeText(item.body, 8000) ?? row.body),
          body_translated: true,
        };
        translatedCount += 1;
      });
    } catch {
      // Tradução é best-effort. Avaliações reais continuam sendo importadas no idioma original.
    }
  }

  return { reviews: output, translated: translatedCount };
}

async function fetchReviews(productId: string, credentialClient: any) {
  const collected = new Map<string, NormalizedReview>();
  let remoteTotal = 0;

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const payload = await callAliTopPublic<any>(
      "aliexpress.social.product.evaluation.query",
      { product_id: productId, page, page_size: PAGE_SIZE },
      credentialClient,
    );
    const { rows, total } = extractPage(payload);
    remoteTotal = Math.max(remoteTotal, total);
    if (!rows.length) break;
    for (const raw of rows) {
      const review = normalizeReview(raw, productId);
      if (review) collected.set(review.source_review_id, review);
    }
    if (rows.length < PAGE_SIZE) break;
    if (remoteTotal > 0 && page * PAGE_SIZE >= remoteTotal) break;
  }

  return { reviews: [...collected.values()], remoteTotal, productId };
}

async function fetchProductReviewMeta(
  productId: string,
  credentialClient: any,
): Promise<AliProductReviewMeta> {
  const payload = await callAli<any>(
    "aliexpress.ds.product.get",
    {
      product_id: productId,
      ship_to_country: "BR",
      target_currency: "BRL",
      target_language: "PT",
    },
    credentialClient,
  );
  const root = payload?.aliexpress_ds_product_get_response ?? payload;
  const result = root?.result?.result ?? root?.resp_result?.result ?? root?.result ?? root;
  const base = result?.ae_item_base_info_dto ?? result?.base_info ?? {};
  const converter = result?.product_id_converter_result ?? result?.productIdConverterResult ?? {};
  return {
    requestedProductId: productId,
    mainProductId: normalizeAliProductId(
      String(converter?.main_product_id ?? converter?.mainProductId ?? ""),
    ),
    total: optionalCount(
      base?.evaluation_count ??
        result?.evaluation_count ??
        base?.evaluate_count ??
        result?.evaluate_count,
    ),
    average: optionalRating(
      base?.avg_evaluation_rating ?? result?.avg_evaluation_rating ?? result?.evaluate_rate,
    ),
  };
}

async function updateProductAggregate(
  client: any,
  productId: string,
  total: number | null,
  average: number | null,
) {
  const patch: Record<string, number> = {};
  if (total != null && total > 0) patch.rating_count = total;
  if (average != null && average > 0) patch.rating_avg = average;
  if (!Object.keys(patch).length) return false;
  const { error } = await client.from("products").update(patch).eq("id", productId);
  if (error) throw new Error(`Falha ao atualizar a nota do produto: ${error.message}`);
  return true;
}

const InputSchema = z.object({
  product_id: z.string().uuid(),
  source: z.string().trim().min(1).max(2000),
});

export const importAliExpressReviewsByUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => InputSchema.parse(value))
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const aliProductId = normalizeAliProductId(data.source);
    if (!aliProductId) {
      throw new Error(
        "Cole uma URL válida do produto AliExpress ou informe o ID numérico do produto.",
      );
    }

    const { data: product, error: productError } = await context.supabase
      .from("products")
      .select("id,name,slug")
      .eq("id", data.product_id)
      .maybeSingle();
    if (productError) throw new Error(productError.message);
    if (!product) throw new Error("Produto de destino não encontrado no catálogo.");

    const startedAt = new Date().toISOString();
    await context.supabase.from("product_review_sync_state").upsert(
      {
        product_id: data.product_id,
        source: "aliexpress",
        source_id: aliProductId,
        status: "running",
        fetched_count: 0,
        remote_total: null,
        last_attempt_at: startedAt,
        last_error: null,
        updated_at: startedAt,
      },
      { onConflict: "product_id" },
    );

    try {
      let meta: AliProductReviewMeta | null = null;
      let metaError: string | null = null;
      try {
        meta = await fetchProductReviewMeta(aliProductId, context.supabase);
      } catch (error) {
        metaError = error instanceof Error ? error.message : String(error);
      }

      const candidateIds = [aliProductId];
      if (meta?.mainProductId && meta.mainProductId !== aliProductId)
        candidateIds.push(meta.mainProductId);

      let fetched: Awaited<ReturnType<typeof fetchReviews>> | null = null;
      const reviewErrors: string[] = [];
      for (const candidateId of candidateIds) {
        try {
          const candidate = await fetchReviews(candidateId, context.supabase);
          if (candidate.reviews.length > 0 || candidate.remoteTotal > 0) {
            fetched = candidate;
            break;
          }
        } catch (error) {
          reviewErrors.push(
            `${candidateId}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      // Se o ID regional não trouxe agregado, tenta o produto principal também.
      if (
        meta?.mainProductId &&
        meta.mainProductId !== aliProductId &&
        (meta.total ?? 0) <= 0 &&
        (meta.average ?? 0) <= 0
      ) {
        try {
          const mainMeta = await fetchProductReviewMeta(meta.mainProductId, context.supabase);
          if ((mainMeta.total ?? 0) > 0 || (mainMeta.average ?? 0) > 0) meta = mainMeta;
        } catch {
          // Meta do produto principal é complementar; não transforma reviews válidos em erro.
        }
      }

      const resolvedProductId = fetched?.productId ?? meta?.mainProductId ?? aliProductId;
      const fetchedReviews = fetched?.reviews ?? [];
      const remoteTotal = (meta?.total ?? 0) > 0 ? meta!.total : (fetched?.remoteTotal ?? 0);
      const remoteAverage = (meta?.average ?? 0) > 0 ? meta!.average : null;

      // Mesmo quando comentários individuais não são expostos, a Open Platform
      // ainda pode fornecer a nota média e quantidade real. Isso é sucesso parcial,
      // não deve aparecer como uma falha vermelha para o administrador.
      if (!fetchedReviews.length) {
        const aggregateUpdated = await updateProductAggregate(
          context.supabase,
          data.product_id,
          remoteTotal,
          remoteAverage,
        );
        if (aggregateUpdated) {
          const now = new Date().toISOString();
          const diagnostic = reviewErrors[0] ?? metaError;
          await context.supabase.from("product_review_sync_state").upsert(
            {
              product_id: data.product_id,
              source: "aliexpress",
              source_id: resolvedProductId,
              status: "ok",
              fetched_count: 0,
              remote_total: remoteTotal,
              last_attempt_at: startedAt,
              last_success_at: now,
              last_error: diagnostic ? diagnostic.slice(0, 1200) : null,
              updated_at: now,
            },
            { onConflict: "product_id" },
          );

          return {
            ok: true,
            productId: data.product_id,
            productTitle: product.name,
            productSlug: product.slug,
            aliExpressProductId: aliProductId,
            resolvedAliExpressProductId: resolvedProductId,
            imported: 0,
            translated: 0,
            withPhotos: 0,
            remoteTotal: remoteTotal ?? 0,
            remoteAverage,
            aggregateOnly: true,
            status: "aggregate_only",
            diagnostic,
          };
        }

        const details = [...reviewErrors, metaError].filter(Boolean).slice(0, 2).join(" | ");
        throw new Error(
          `O AliExpress não disponibilizou comentários individuais nem dados agregados de avaliações para este anúncio.${details ? ` Detalhe: ${details}` : ""}`.slice(
            0,
            1200,
          ),
        );
      }

      const translated = await translateReviews(fetchedReviews, context.supabase);
      const now = new Date().toISOString();

      const rows = translated.reviews.map((review) => ({
        product_id: data.product_id,
        source: "aliexpress",
        source_review_id: review.source_review_id,
        author_name: review.author_name,
        author_country: review.author_country,
        rating: review.rating,
        title: review.title,
        body: review.body,
        images: review.images,
        reviewed_at: review.reviewed_at,
        is_visible: true,
        body_translated: review.body_translated === true,
        last_synced_at: now,
      }));

      const { error: upsertError } = await context.supabase
        .from("product_external_reviews")
        .upsert(rows, { onConflict: "product_id,source,source_review_id" });
      if (upsertError) throw new Error(`Falha ao salvar avaliações: ${upsertError.message}`);

      const localAverage =
        Math.round((rows.reduce((sum, row) => sum + row.rating, 0) / rows.length) * 100) / 100;
      const aggregateTotal = (remoteTotal ?? 0) > 0 ? remoteTotal : rows.length;
      const aggregateAverage = (remoteAverage ?? 0) > 0 ? remoteAverage : localAverage;
      await updateProductAggregate(
        context.supabase,
        data.product_id,
        aggregateTotal,
        aggregateAverage,
      );

      await context.supabase.from("product_review_sync_state").upsert(
        {
          product_id: data.product_id,
          source: "aliexpress",
          source_id: resolvedProductId,
          status: "ok",
          fetched_count: rows.length,
          remote_total: aggregateTotal,
          last_attempt_at: startedAt,
          last_success_at: now,
          last_error: null,
          updated_at: now,
        },
        { onConflict: "product_id" },
      );

      return {
        ok: true,
        productId: data.product_id,
        productTitle: product.name,
        productSlug: product.slug,
        aliExpressProductId: aliProductId,
        resolvedAliExpressProductId: resolvedProductId,
        imported: rows.length,
        translated: translated.translated,
        withPhotos: rows.filter((row) => row.images.length > 0).length,
        remoteTotal: aggregateTotal,
        remoteAverage: aggregateAverage,
        aggregateOnly: false,
        status: "ok",
        diagnostic: null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failedAt = new Date().toISOString();
      await context.supabase.from("product_review_sync_state").upsert(
        {
          product_id: data.product_id,
          source: "aliexpress",
          source_id: aliProductId,
          status: "error",
          fetched_count: 0,
          last_attempt_at: startedAt,
          last_error: message.slice(0, 1200),
          updated_at: failedAt,
        },
        { onConflict: "product_id" },
      );
      throw new Error(message);
    }
  });
