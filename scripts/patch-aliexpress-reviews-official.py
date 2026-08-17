from pathlib import Path
import re


def sub_once(path: str, pattern: str, replacement: str) -> None:
    p = Path(path)
    text = p.read_text()
    new, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"{path}: expected 1 replacement for {pattern[:80]!r}, got {count}")
    p.write_text(new)


live = "src/lib/product-reviews-live.functions.ts"
p = Path(live)
text = p.read_text()
needle = 'import { syncReviewsForProductInternal } from "./product-reviews.functions";\n'
if needle not in text:
    raise SystemExit("live reviews: legacy fallback import not found")
p.write_text(text.replace(needle, "", 1))

fetch_impl = r'''function extractOfficialPage(payload: any): { rows: any[]; total: number } {
  const root = payload?.aliexpress_social_product_evaluation_query_response ?? payload;
  const result = root?.result?.result ?? root?.result ?? root;
  const evaluations = result?.evaluations;
  const buyerEvaluations = evaluations?.buyer_evaluation ?? evaluations?.buyerEvaluation ?? evaluations;
  const rows = Array.isArray(buyerEvaluations)
    ? buyerEvaluations
    : buyerEvaluations && typeof buyerEvaluations === "object"
      ? [buyerEvaluations]
      : findEvaluationRows(payload);
  const totalRaw = result?.total_number ?? result?.totalNumber ?? rows.length;
  const total = Number.isFinite(Number(totalRaw)) ? Math.max(0, Number(totalRaw)) : rows.length;
  return { rows, total };
}

async function fetchOfficialReviews(
  sourceId: string,
): Promise<{ reviews: NormalizedOfficialReview[]; productId: string; total: number }> {
  const productId = normalizeAliProductId(sourceId);
  if (!productId) {
    throw new Error(`ID do produto AliExpress inválido na importação: ${sourceId.slice(0, 120)}`);
  }

  const collected = new Map<string, NormalizedOfficialReview>();
  let remoteTotal = 0;

  for (let page = 1; page <= OFFICIAL_SYNC_PAGES; page += 1) {
    const payload = await callAliTopPublic<any>("aliexpress.social.product.evaluation.query", {
      product_id: productId,
      page,
      page_size: OFFICIAL_SYNC_PAGE_SIZE,
    });
    const { rows, total } = extractOfficialPage(payload);
    remoteTotal = Math.max(remoteTotal, total);
    if (!rows.length) break;

    for (const raw of rows) {
      const review = normalizeOfficialReview(raw, productId);
      if (review) collected.set(review.source_review_id, review);
    }
    if (rows.length < OFFICIAL_SYNC_PAGE_SIZE) break;
    if (remoteTotal > 0 && page * OFFICIAL_SYNC_PAGE_SIZE >= remoteTotal) break;
  }

  return { reviews: [...collected.values()], productId, total: remoteTotal };
}

async function persistOfficialReviews'''
sub_once(
    live,
    r'async function fetchOfficialReviews\(sourceId: string\): Promise<\{ reviews: NormalizedOfficialReview\[\]; productId: string \}> \{.*?\n\}\n\nasync function persistOfficialReviews',
    fetch_impl,
)

persist_impl = r'''async function persistOfficialReviews(admin: any, productId: string, reviews: NormalizedOfficialReview[]) {
  if (!reviews.length) return { upserted: 0 };

  const ids = reviews.map((review) => review.source_review_id);
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

  // Persistimos primeiro. A tradução é uma etapa posterior e nunca pode impedir
  // que uma avaliação real baixada da API oficial seja gravada no catálogo.
  const now = new Date().toISOString();
  const rows = reviews.map((review) => {
    const current = existing.get(review.source_review_id);
    const keepTranslated = current?.body_translated === true;
    return {
      product_id: productId,
      source: "aliexpress",
      source_review_id: review.source_review_id,
      author_name: review.author_name,
      author_country: review.author_country,
      rating: review.rating,
      title: keepTranslated ? current.title : review.title,
      body: keepTranslated ? current.body : review.body,
      images: review.images,
      reviewed_at: review.reviewed_at,
      is_visible: true,
      body_translated: keepTranslated,
      last_synced_at: now,
    };
  });

  const { error } = await admin
    .from("product_external_reviews")
    .upsert(rows, { onConflict: "product_id,source,source_review_id" });
  if (error) throw new Error(`Falha ao salvar avaliações oficiais do AliExpress: ${error.message}`);
  return { upserted: rows.length };
}

async function translatePendingReviews'''
sub_once(
    live,
    r'async function persistOfficialReviews\(admin: any, productId: string, reviews: NormalizedOfficialReview\[\]\) \{.*?\n\}\n\nasync function translatePendingReviews',
    persist_impl,
)

sync_impl = r'''export async function syncLiveReviewsInternal(admin: any, productId: string, force = false) {
  const translatedBacklog = await translatePendingReviews(admin, productId, 24);
  const now = new Date().toISOString();

  const { data: state } = await admin
    .from("product_review_sync_state")
    .select("status,last_attempt_at")
    .eq("product_id", productId)
    .maybeSingle();

  if (!force && state?.last_attempt_at && ["ok", "empty"].includes(String(state.status))) {
    const last = new Date(state.last_attempt_at).getTime();
    if (last && Date.now() - last < AUTO_SYNC_TTL_HOURS * 60 * 60 * 1000) {
      return {
        fetched: 0,
        upserted: 0,
        translated: translatedBacklog,
        skipped: true,
        source: "cache" as const,
        error: null,
      };
    }
  }

  const sourceId = await findAliSourceId(admin, productId);
  if (!sourceId) {
    const error = "Este produto não possui um ID de origem do AliExpress vinculado à importação.";
    await admin.from("product_review_sync_state").upsert({
      product_id: productId,
      source: "aliexpress",
      status: "error",
      last_attempt_at: now,
      last_error: error,
      updated_at: now,
    }, { onConflict: "product_id" });
    return { fetched: 0, upserted: 0, translated: translatedBacklog, skipped: true, source: "none" as const, error };
  }

  await admin.from("product_review_sync_state").upsert({
    product_id: productId,
    source: "aliexpress",
    source_id: normalizeAliProductId(sourceId) ?? sourceId,
    status: "running",
    last_attempt_at: now,
    last_error: null,
    updated_at: now,
  }, { onConflict: "product_id" });

  try {
    const official = await fetchOfficialReviews(sourceId);
    const saved = await persistOfficialReviews(admin, productId, official.reviews);
    // Traduz em lotes pequenos depois da persistência. O restante fica na fila
    // e é traduzido nas próximas sincronizações/acessos sem perder o original.
    const translatedNew = await translatePendingReviews(admin, productId, 24);
    const finishedAt = new Date().toISOString();
    const status = official.reviews.length > 0 ? "ok" : "empty";

    await admin.from("product_review_sync_state").upsert({
      product_id: productId,
      source: "aliexpress",
      source_id: official.productId,
      status,
      fetched_count: official.reviews.length,
      remote_total: official.total,
      last_attempt_at: now,
      last_success_at: finishedAt,
      last_error: null,
      updated_at: finishedAt,
    }, { onConflict: "product_id" });

    return {
      fetched: official.reviews.length,
      upserted: saved.upserted,
      translated: translatedBacklog + translatedNew,
      skipped: false,
      source: "official_api" as const,
      error: official.reviews.length === 0
        ? `A API oficial do AliExpress retornou 0 avaliações para o produto ${official.productId}.`
        : null,
    };
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 1200);
    const failedAt = new Date().toISOString();
    await admin.from("product_review_sync_state").upsert({
      product_id: productId,
      source: "aliexpress",
      source_id: normalizeAliProductId(sourceId) ?? sourceId,
      status: "error",
      last_attempt_at: now,
      last_error: message,
      updated_at: failedAt,
    }, { onConflict: "product_id" });
    return {
      fetched: 0,
      upserted: 0,
      translated: translatedBacklog,
      skipped: false,
      source: "official_api" as const,
      error: message,
    };
  }
}

export const autoSyncLiveProductReviews'''
sub_once(
    live,
    r'async function syncLiveReviewsInternal\(admin: any, productId: string, force = false\) \{.*?\n\}\n\nexport const autoSyncLiveProductReviews',
    sync_impl,
)

legacy = "src/lib/product-reviews.functions.ts"
legacy_replacement = r'''export async function syncReviewsForProductInternal(
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

async function findAliSourceId'''
sub_once(
    legacy,
    r'function toNum\(v: unknown\): number \{.*?\n\}\n\nasync function findAliSourceId',
    legacy_replacement,
)

imports = "src/lib/aliexpress-import.functions.ts"
p = Path(imports)
text = p.read_text()
marker = 'const CommitSchema = z.object({'
helper = r'''async function syncImportedProductReviews(admin: any, productId: string) {
  try {
    const { syncLiveReviewsInternal } = await import("./product-reviews-live.functions");
    const result = await syncLiveReviewsInternal(admin, productId, true);
    if (result.error && result.fetched === 0) {
      console.warn(`[reviews] produto ${productId}: ${result.error}`);
    }
  } catch (error) {
    // Avaliações não podem desfazer uma importação de produto que já foi concluída.
    // A falha fica disponível em product_review_sync_state para nova tentativa.
    console.warn("[reviews] sincronização inicial do AliExpress falhou", error);
  }
}

const CommitSchema = z.object({'''
if text.count(marker) != 1:
    raise SystemExit("commit schema marker not found")
text = text.replace(marker, helper, 1)
# Há dois blocos de syncVariantsAndRecord: atualização de produto e criação nova.
pattern = re.compile(r'(await syncVariantsAndRecord\(\n\s*supabaseAdmin,\n\s*data\.id,\n\s*(?:imp\.product_id|productId),\n\s*String\(norm\.source_id\),\n\s*settings,\n\s*\);)')
text, count = pattern.subn(lambda m: m.group(1) + '\n        await syncImportedProductReviews(supabaseAdmin, ' + ('imp.product_id' if 'imp.product_id' in m.group(1) else 'productId') + ');', text)
if count != 2:
    raise SystemExit(f"expected 2 import sync insertion points, got {count}")
p.write_text(text)

print("AliExpress official reviews patch applied")
