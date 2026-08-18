import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* eslint-disable @typescript-eslint/no-explicit-any */

const MAX_CSV_CHARS = 2_000_000;
const MAX_ROWS = 5_000;
const UPSERT_BATCH_SIZE = 250;
const MAX_IMAGES = 8;

const HEADER_ALIASES = {
  productHandle: ["product_handle", "product_slug", "handle", "product"],
  reviewId: ["review_id", "id", "external_id", "source_review_id"],
  rating: ["rating", "stars", "star", "score"],
  author: ["author", "author_name", "reviewer", "reviewer_name", "name"],
  country: ["country", "author_country", "country_code", "buyer_country_code"],
  title: ["title", "review_title", "headline"],
  body: ["body_text", "body", "comment", "content", "review", "review_body", "message"],
  photos: ["photo_urls", "photos", "images", "image_urls", "photo", "image"],
  createdAt: ["created_at", "reviewed_at", "review_date", "date", "created"],
  status: ["status", "published", "is_visible", "visible"],
} as const;

type CsvRow = Record<string, string>;

type NormalizedReview = {
  product_id: string;
  source: string;
  source_review_id: string;
  author_name: string | null;
  author_country: string | null;
  rating: number;
  title: string | null;
  body: string | null;
  images: string[];
  reviewed_at: string | null;
  is_visible: boolean;
  body_translated: boolean;
  last_synced_at: string;
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

function normalizeHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function countDelimiterOutsideQuotes(line: string, delimiter: string): number {
  let inQuotes = false;
  let count = 0;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') i += 1;
      else inQuotes = !inQuotes;
    } else if (!inQuotes && char === delimiter) {
      count += 1;
    }
  }
  return count;
}

function detectDelimiter(text: string): string {
  const firstLine = text.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] ?? "";
  const candidates = [",", ";", "\t"];
  return candidates
    .map((delimiter) => ({ delimiter, count: countDelimiterOutsideQuotes(firstLine, delimiter) }))
    .sort((a, b) => b.count - a.count)[0]?.delimiter ?? ",";
}

function parseCsv(text: string): string[][] {
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      row.push(field);
      field = "";
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      continue;
    }

    field += char;
  }

  row.push(field);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  return rows;
}

function toObjects(rows: string[][]): { headers: string[]; rows: CsvRow[] } {
  if (rows.length < 2) throw new Error("O CSV não possui linhas de avaliações.");
  const headers = rows[0].map(normalizeHeader);
  if (!headers.some(Boolean)) throw new Error("Não foi possível identificar o cabeçalho do CSV.");

  const objects = rows.slice(1).map((values) => {
    const result: CsvRow = {};
    headers.forEach((header, index) => {
      if (header) result[header] = (values[index] ?? "").trim();
    });
    return result;
  });

  return { headers, rows: objects };
}

function hasHeader(headers: string[], aliases: readonly string[]): boolean {
  return headers.some((header) => aliases.some((alias) => alias === header));
}

function findHeader(headers: string[], aliases: readonly string[]): string | undefined {
  return headers.find((header) => aliases.some((alias) => alias === header));
}

function valueFrom(row: CsvRow, aliases: readonly string[]): string {
  for (const alias of aliases) {
    const value = row[alias];
    if (value?.trim()) return value.trim();
  }
  return "";
}

function cleanText(value: string, max: number): string | null {
  const text = value.trim();
  return text ? text.slice(0, max) : null;
}

function parseRating(value: string): number | null {
  const number = Number.parseFloat(value.replace(",", "."));
  if (!Number.isFinite(number) || number < 1 || number > 5) return null;
  return Math.round(number * 10) / 10;
}

function parseDate(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?$/.test(raw)
    ? `${raw.replace(" ", "T")}${raw.length === 16 ? ":00" : ""}Z`
    : raw;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isVisible(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return true;
  if (["disable", "disabled", "draft", "hidden", "unpublish", "unpublished", "false", "0", "no"].includes(normalized)) {
    return false;
  }
  return true;
}

function collectImages(value: string): string[] {
  if (!value.trim()) return [];
  const candidates = value
    .split(/[\n,;|]+/)
    .map((part) => part.trim().replace(/^[\[('"\s]+|[\])'"\s]+$/g, ""))
    .filter(Boolean);

  const images: string[] = [];
  for (const candidate of candidates) {
    try {
      const url = new URL(candidate.startsWith("//") ? `https:${candidate}` : candidate);
      if (!["http:", "https:"].includes(url.protocol)) continue;
      if (!images.includes(url.toString())) images.push(url.toString());
      if (images.length >= MAX_IMAGES) break;
    } catch {
      // URLs inválidas são simplesmente ignoradas; a avaliação continua importável.
    }
  }
  return images;
}

function hashText(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function normalizeReview(row: CsvRow, productId: string, now: string): NormalizedReview | null {
  const rating = parseRating(valueFrom(row, HEADER_ALIASES.rating));
  if (rating == null) return null;

  const author = cleanText(valueFrom(row, HEADER_ALIASES.author), 180);
  const country = cleanText(valueFrom(row, HEADER_ALIASES.country), 24);
  const title = cleanText(valueFrom(row, HEADER_ALIASES.title), 500);
  const body = cleanText(valueFrom(row, HEADER_ALIASES.body), 8_000);
  const images = collectImages(valueFrom(row, HEADER_ALIASES.photos));
  const reviewedAt = parseDate(valueFrom(row, HEADER_ALIASES.createdAt));
  const rawId = cleanText(valueFrom(row, HEADER_ALIASES.reviewId), 180);
  const material = [productId, rawId, author, country, rating, title, body, reviewedAt, images.join("|")].join("\u241f");
  const sourceReviewId = rawId
    ? `ryviu-${rawId.replace(/[^a-zA-Z0-9._:-]+/g, "-").slice(0, 180)}`
    : `ryviu-${hashText(material)}`;

  return {
    product_id: productId,
    // Mantemos a origem de exibição como AliExpress para integrar com o componente
    // atual da loja. O prefixo ryviu- no source_review_id registra o caminho de importação.
    source: "aliexpress",
    source_review_id: sourceReviewId,
    author_name: author,
    author_country: country,
    rating,
    title,
    body,
    images,
    reviewed_at: reviewedAt,
    is_visible: isVisible(valueFrom(row, HEADER_ALIASES.status)),
    body_translated: false,
    last_synced_at: now,
  };
}

export const importRyviuReviewsCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) =>
    z.object({
      product_id: z.string().uuid(),
      csv: z.string().min(1).max(MAX_CSV_CHARS),
    }).parse(value),
  )
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const db = context.supabase;

    const { data: product, error: productError } = await db
      .from("products")
      .select("id,title,slug")
      .eq("id", data.product_id)
      .maybeSingle();
    if (productError) throw productError;
    if (!product) throw new Error("Produto não encontrado.");

    const parsed = toObjects(parseCsv(data.csv));
    if (!hasHeader(parsed.headers, HEADER_ALIASES.rating)) {
      throw new Error("CSV inválido: a coluna rating (nota) não foi encontrada.");
    }

    const productHandleColumn = findHeader(parsed.headers, HEADER_ALIASES.productHandle);
    let candidateRows = parsed.rows;
    let ignoredOtherProducts = 0;

    if (productHandleColumn) {
      const handles = new Set(
        parsed.rows
          .map((row) => row[productHandleColumn]?.trim())
          .filter((handle): handle is string => Boolean(handle)),
      );

      // Um CSV de produto único pode vir de outra loja/handle. Como o admin
      // escolheu explicitamente o destino, permitimos esse mapeamento. Em arquivos
      // com vários produtos, exigimos o slug correspondente para evitar mistura.
      if (handles.size > 1) {
        const matching = parsed.rows.filter((row) => row[productHandleColumn]?.trim() === product.slug);
        if (!matching.length) {
          const sample = [...handles].slice(0, 5).join(", ");
          throw new Error(
            `O CSV contém vários produtos e nenhum usa o slug selecionado (${product.slug}). Handles encontrados: ${sample}`,
          );
        }
        ignoredOtherProducts = parsed.rows.length - matching.length;
        candidateRows = matching;
      }
    }

    if (candidateRows.length > MAX_ROWS) {
      throw new Error(`O arquivo possui ${candidateRows.length} avaliações para este produto. O limite por importação é ${MAX_ROWS}.`);
    }

    const now = new Date().toISOString();
    const normalized: NormalizedReview[] = [];
    let invalidRows = 0;
    for (const row of candidateRows) {
      const review = normalizeReview(row, data.product_id, now);
      if (review) normalized.push(review);
      else invalidRows += 1;
    }

    if (!normalized.length) {
      throw new Error("Nenhuma avaliação válida foi encontrada. Verifique se rating está entre 1 e 5.");
    }

    let imported = 0;
    for (let index = 0; index < normalized.length; index += UPSERT_BATCH_SIZE) {
      const batch = normalized.slice(index, index + UPSERT_BATCH_SIZE);
      const { error } = await db
        .from("product_external_reviews")
        .upsert(batch, { onConflict: "product_id,source,source_review_id" });
      if (error) throw new Error(`Falha ao salvar avaliações do Ryviu: ${error.message}`);
      imported += batch.length;
    }

    return {
      productId: product.id,
      productTitle: product.title,
      productSlug: product.slug,
      imported,
      invalidRows,
      ignoredOtherProducts,
      withPhotos: normalized.filter((review) => review.images.length > 0).length,
      hidden: normalized.filter((review) => !review.is_visible).length,
    };
  });
