import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { generateWithOwnKeys } from "./ai-translate.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertCatalog(context: any) {
  const { data: adm } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
  if (adm) return;
  const { data: hasCat } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "catalog",
  });
  if (!hasCat) throw new Error("Acesso restrito a administradores ou equipe de catálogo");
}

function slugify(v: string): string {
  return v
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 80);
}

export type NormalizedProduct = {
  title: string;
  description: string | null;
  images: string[];
  price_original: number | null;
  currency: string | null;
  sku: string | null;
  weight_grams: number | null;
  source_url: string | null;
  source_id: string | null;
};

export type ImportRow = {
  id: string;
  source: string;
  source_url: string | null;
  source_id: string | null;
  status: "draft" | "imported" | "failed" | "archived";
  error: string | null;
  product_id: string | null;
  normalized_data: NormalizedProduct;
  created_at: string;
  updated_at: string;
};

const SettingsSchema = z.object({
  markup_percent: z.number().min(0).max(1000).default(150),
  markup_fixed_cents: z.number().int().min(0).default(0),
  round_to_99: z.boolean().default(true),
  default_status: z.enum(["draft", "active"]).default("draft"),
  default_category_id: z.string().uuid().nullable().optional(),
  default_brand_id: z.string().uuid().nullable().optional(),
  fx_rate: z.number().positive().default(5.5),
});
export type ImportSettings = z.infer<typeof SettingsSchema>;

const DEFAULT_SETTINGS: ImportSettings = {
  markup_percent: 150,
  markup_fixed_cents: 0,
  round_to_99: true,
  default_status: "draft",
  default_category_id: null,
  default_brand_id: null,
  fx_rate: 5.5,
};

export const getImportSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ImportSettings> => {
    await assertCatalog(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("integrations")
      .select("config")
      .eq("provider", "aliexpress")
      .maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = (data?.config as any)?.import_settings ?? data?.config ?? null;
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = SettingsSchema.safeParse(raw);
    return parsed.success ? parsed.data : DEFAULT_SETTINGS;
  });

export const saveImportSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => SettingsSchema.parse(v))
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("integrations")
      .select("config")
      .eq("provider", "aliexpress")
      .maybeSingle();
    const prev = (existing?.config as Record<string, unknown> | null) ?? {};
    const merged = { ...prev, import_settings: data };
    const { error } = await supabaseAdmin
      .from("integrations")
      .update({ config: merged })
      .eq("provider", "aliexpress");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export function computeSalePriceCents(
  originalPrice: number | null,
  currency: string | null,
  settings: ImportSettings,
): number {
  if (!originalPrice || originalPrice <= 0) return 0;
  const inBrl = currency && currency.toUpperCase() === "BRL" ? originalPrice : originalPrice * settings.fx_rate;
  const baseCents = Math.round(inBrl * 100);
  const withMarkup = Math.round(baseCents * (1 + settings.markup_percent / 100)) + settings.markup_fixed_cents;
  if (settings.round_to_99) {
    const reais = Math.floor(withMarkup / 100);
    return reais * 100 + 99;
  }
  return withMarkup;
}

function extractAliexpressId(input: string): string | null {
  const value = input.trim();
  if (/^\d{8,20}$/.test(value)) return value;

  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // Keep the original value when it is not percent-encoded.
  }

  const pathMatch =
    decoded.match(/\/(?:item|i)\/(\d{8,20})(?:\.html)?(?:[/?#]|$)/i) ??
    decoded.match(/\/(\d{10,20})\.html(?:[/?#]|$)/i);
  if (pathMatch?.[1]) return pathMatch[1];

  try {
    const url = new URL(value);
    for (const key of ["productId", "product_id", "itemId", "item_id"]) {
      const candidate = url.searchParams.get(key)?.trim() ?? "";
      if (/^\d{8,20}$/.test(candidate)) return candidate;
    }
  } catch {
    // URL validation is handled by resolveAliExpressInput.
  }

  return null;
}

function isAliExpressHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  return host === "aliexpress.com" || host.endsWith(".aliexpress.com") || host === "aliexpress.us" || host.endsWith(".aliexpress.us");
}

async function resolveAliExpressInput(input: string): Promise<{ productId: string; sourceUrl: string }> {
  const value = input.trim();
  const directId = extractAliexpressId(value);
  if (directId) {
    return {
      productId: directId,
      sourceUrl: `https://www.aliexpress.com/item/${directId}.html`,
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Informe uma URL de produto AliExpress válida ou o ID numérico do produto.");
  }

  if (!isAliExpressHost(parsed.hostname)) {
    throw new Error("A importação por URL aceita apenas links de produtos do AliExpress ou o ID numérico do produto.");
  }

  // Short/share links do AliExpress não carregam o ID no endereço inicial.
  // We only follow the official redirect and inspect the final URL; no page scraping is performed.
  let finalUrl = parsed.toString();
  try {
    let response = await fetch(finalUrl, {
      method: "HEAD",
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AbsolutoGlamurImporter/1.0)" },
    });
    if (!response.ok || !response.url) {
      response = await fetch(finalUrl, {
        method: "GET",
        redirect: "follow",
        headers: { "User-Agent": "Mozilla/5.0 (compatible; AbsolutoGlamurImporter/1.0)" },
      });
    }
    finalUrl = response.url || finalUrl;
  } catch {
    throw new Error("Não foi possível resolver esse link curto do AliExpress. Cole a URL completa do produto ou o ID numérico.");
  }

  const resolvedId = extractAliexpressId(finalUrl);
  if (!resolvedId) {
    throw new Error("Não encontrei o ID do produto nesse link. Cole a URL completa do AliExpress ou o ID numérico.");
  }

  return {
    productId: resolvedId,
    sourceUrl: `https://www.aliexpress.com/item/${resolvedId}.html`,
  };
}

function firstOfficialNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const normalized = value.replace(/[^\d.,-]/g, "").replace(",", ".");
      const parsed = Number.parseFloat(normalized);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function stripOfficialHtml(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function loadAliExpressUrlPreview(
  input: string,
  credentialClient: any,
): Promise<NormalizedProduct> {
  const { productId, sourceUrl } = await resolveAliExpressInput(input);
  const { callAli } = await import("./aliexpress-discovery.functions");

  const json = await callAli<any>(
    "aliexpress.ds.product.get",
    {
      product_id: productId,
      target_currency: "BRL",
      target_language: "PT",
      ship_to_country: "BR",
    },
    credentialClient,
  );

  const root =
    json?.aliexpress_ds_product_get_response ??
    json?.aliexpress_ds_productdetail_get_response ??
    json;
  const result = root?.result ?? root;
  const base = result?.ae_item_base_info_dto ?? result?.base_info ?? result ?? {};
  const props = result?.ae_item_properties ?? {};
  const media = result?.ae_multimedia_info_dto ?? result?.multimedia ?? {};
  const skuBlock = result?.ae_item_sku_info_dtos ?? result?.skus ?? {};

  const rawTitle = String(base?.subject ?? base?.product_title ?? "").trim();
  if (!rawTitle) {
    throw new Error(`A API oficial do AliExpress não retornou os dados do produto ${productId}.`);
  }

  const images: string[] = [];
  const pushImage = (value: unknown) => {
    if (typeof value !== "string") return;
    const url = value.trim();
    if (/^https?:\/\//i.test(url) && !images.includes(url)) images.push(url);
  };

  pushImage(base?.product_main_image_url);
  pushImage(base?.main_image_url);
  const rawImages = media?.image_urls ?? media?.image_url_list ?? base?.product_small_image_urls;
  if (typeof rawImages === "string") {
    const matches = rawImages.match(/https?:\/\/[^\s,;]+/gi) ?? [];
    matches.forEach(pushImage);
  } else if (Array.isArray(rawImages)) {
    rawImages.forEach(pushImage);
  } else if (Array.isArray(rawImages?.string)) {
    rawImages.string.forEach(pushImage);
  }

  const skuRows: any[] = Array.isArray(skuBlock?.ae_item_sku_info_d_t_o)
    ? skuBlock.ae_item_sku_info_d_t_o
    : Array.isArray(skuBlock)
      ? skuBlock
      : [];
  const firstSku = skuRows[0] ?? {};
  const price = firstOfficialNumber(
    firstSku?.offer_sale_price,
    firstSku?.sku_price,
    firstSku?.offer_bulk_sale_price,
    result?.app_sale_price,
    base?.sale_price,
  );
  const currency = String(firstSku?.currency_code ?? base?.currency_code ?? "BRL").toUpperCase();
  const sku = String(firstSku?.sku_code ?? firstSku?.sku_id ?? `AE-${productId}`);
  const weightKg = firstOfficialNumber(props?.package_weight, firstSku?.package_weight);
  const descriptionHtml = String(base?.detail ?? result?.package_info_dto?.package_detail ?? "");

  return {
    title: rawTitle,
    description: descriptionHtml ? stripOfficialHtml(descriptionHtml).slice(0, 6000) : null,
    images: images.slice(0, 12),
    price_original: price,
    currency,
    sku,
    weight_grams: weightKg != null && weightKg > 0 ? Math.round(weightKg * 1000) : null,
    source_url: sourceUrl,
    source_id: productId,
  };
}

export function stripBrandMentions(input: string | null | undefined): string | null {
  if (!input) return input ?? null;
  let out = String(input);
  out = out.replace(/ali[\s\-_]?express/gi, "");
  out = out.replace(/[ \t]{2,}/g, " ").replace(/\s+([.,;:!?])/g, "$1");
  out = out.replace(/^[\s\-–—·•|,.:;]+|[\s\-–—·•|,.:;]+$/g, "");
  return out.trim() || null;
}

const TAG_STOPWORDS = new Set([
  "a","o","as","os","de","da","do","das","dos","e","em","para","com","sem","por",
  "um","uma","uns","umas","no","na","nos","nas","ao","aos","the","and","for","of",
  "com","kit","novo","nova","pcs","pc","ml","g","kg","cm","mm","un","und","pack",
]);
export function buildProductTags(input: {
  name?: string | null;
  categoryName?: string | null;
  brandName?: string | null;
  extras?: Array<string | null | undefined>;
}): string[] {
  const out = new Set<string>();
  const push = (raw: string | null | undefined) => {
    if (!raw) return;
    const norm = String(raw)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!norm) return;
    if (norm.length >= 3 && norm.length <= 32 && !TAG_STOPWORDS.has(norm)) out.add(norm);
  };
  if (input.categoryName) push(input.categoryName);
  if (input.brandName) push(input.brandName);
  for (const e of input.extras ?? []) push(e ?? undefined);
  if (input.name) {
    for (const tok of input.name.split(/[\s,/|·•\-–—()\\[\]]+/)) {
      const clean = tok.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
      if (clean.length >= 4 && !TAG_STOPWORDS.has(clean) && !/^\d+$/.test(clean)) out.add(clean);
      if (out.size >= 10) break;
    }
  }
  return Array.from(out).slice(0, 10);
}

export function toParagraphHtml(text: string | null | undefined): string | null {
  if (!text) return null;
  const raw = String(text).trim();
  if (!raw) return null;
  if (/<\/?(p|br|ul|ol|li|h[1-6]|div)\b/i.test(raw)) {
    return raw
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .trim();
  }
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const blocks = raw.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return blocks
    .map((b) => `<p>${esc(b).replace(/\n/g, "<br />")}</p>`)
    .join("\n");
}

async function translateToPtBr(input: { title: string; description: string | null }): Promise<{
  title: string;
  description: string | null;
}> {
  try {
    const payload = JSON.stringify({
      title: input.title,
      description: input.description ?? "",
    });
    const text = await generateWithOwnKeys(
      "Você traduz descrições de produtos de cosméticos para português do Brasil, mantendo tom elegante, claro e comercial. Preserve unidades, especificações e nomes próprios de ingredientes. Não invente informações. Responda APENAS com JSON válido no formato {\"title\":\"...\",\"description\":\"...\"} sem comentários nem markdown.",
      `Traduza para pt-BR o conteúdo abaixo. Reescreva de forma natural, sem estrangeirismos desnecessários.\n\n${payload}`,
    );
    if (!text) {
      return {
        title: stripBrandMentions(input.title) ?? input.title,
        description: stripBrandMentions(input.description),
      };
    }
    const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    const parsed = JSON.parse(cleaned);
    const rawTitle = typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : input.title;
    const rawDesc =
      typeof parsed.description === "string" && parsed.description.trim()
        ? parsed.description.trim()
        : input.description;
    return {
      title: stripBrandMentions(rawTitle) ?? rawTitle,
      description: stripBrandMentions(rawDesc),
    };
  } catch {
    return {
      title: stripBrandMentions(input.title) ?? input.title,
      description: stripBrandMentions(input.description),
    };
  }
}

const FX_FALLBACK: Record<string, number> = { USD: 5.5, EUR: 6.0, BRL: 1, CNY: 0.76, GBP: 7.0 };

async function fetchFxToBrl(from: string): Promise<number | null> {
  const code = from.toUpperCase();
  if (code === "BRL") return 1;
  try {
    const r = await fetch(`https://economia.awesomeapi.com.br/json/last/${code}-BRL`);
    if (!r.ok) throw new Error("fx http");
    const j = (await r.json()) as Record<string, { bid?: string }>;
    const rec = j[`${code}BRL`];
    const bid = rec?.bid ? parseFloat(rec.bid) : NaN;
    if (Number.isFinite(bid) && bid > 0) return bid;
  } catch {
    // fallthrough
  }
  return FX_FALLBACK[code] ?? null;
}

export const scrapeUrlPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ url: z.string().trim().min(3).max(2048) }).parse(v),
  )
  .handler(async ({ data, context }): Promise<NormalizedProduct> => {
    await assertCatalog(context);
    const raw = await loadAliExpressUrlPreview(data.url, context.supabase);
    const settings = await loadSettings(context.supabase);
    const translated = await translateToPtBr({ title: raw.title, description: raw.description });

    let priceBrl: number | null = raw.price_original;
    const srcCurrency = (raw.currency ?? "BRL").toUpperCase();
    if (raw.price_original != null && srcCurrency !== "BRL") {
      const live = await fetchFxToBrl(srcCurrency);
      const rate = live ?? settings.fx_rate;
      priceBrl = Math.round(raw.price_original * rate * 100) / 100;
    }

    return {
      ...raw,
      title: translated.title,
      description: toParagraphHtml(translated.description),
      price_original: priceBrl,
      currency: "BRL",
    };
  });

const DraftSchema = z.object({
  source: z.enum(["aliexpress_url", "aliexpress_api", "csv", "json", "manual"]),
  source_url: z.string().url().nullable().optional(),
  source_id: z.string().nullable().optional(),
  normalized: z.object({
    title: z.string().min(1),
    description: z.string().nullable().optional(),
    images: z.array(z.string().url()).default([]),
    price_original: z.number().nullable().optional(),
    currency: z.string().nullable().optional(),
    sku: z.string().nullable().optional(),
    weight_grams: z.number().int().nullable().optional(),
  }),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadSettings(admin: any): Promise<ImportSettings> {
  const { data } = await admin
    .from("integrations")
    .select("config")
    .eq("provider", "aliexpress")
    .maybeSingle();
  const raw = (data?.config as Record<string, unknown> | null)?.import_settings ?? data?.config ?? null;
  const parsed = SettingsSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}

function assertPublishablePrice(status: "draft" | "active", priceCents: number) {
  if (status === "active" && (!Number.isInteger(priceCents) || priceCents < 100)) {
    throw new Error("Defina um preço válido de pelo menos R$ 1,00 antes de publicar o produto.");
  }
}

async function syncVariantsAndRecord(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  importId: string,
  productId: string,
  sourceId: string,
  settings: ImportSettings,
): Promise<void> {
  let warning: string | null = null;
  try {
    const { syncVariantsForProduct } = await import("./aliexpress-variants.server");
    const result = await syncVariantsForProduct(admin, productId, sourceId, settings);
    if (result.errors.length > 0) {
      warning = `Sincronização de variações parcial: ${result.errors.slice(0, 5).join(" | ")}`;
    } else if (result.total_skus === 0) {
      warning = result.note ?? "Nenhuma variação (SKU) retornada pelo AliExpress.";
    }
  } catch (e) {
    warning = `Falha ao sincronizar variações: ${e instanceof Error ? e.message : String(e)}`;
  }
  if (warning) {
    await admin
      .from("product_imports")
      .update({ error: warning })
      .eq("id", importId);
  }
}

async function commitImportRow(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  importId: string,
  norm: NormalizedProduct,
  settings: ImportSettings,
  opts: {
    status: "draft" | "active";
    category_id: string | null;
    brand_id: string | null;
    stock: number;
    markup_override_percent?: number | null;
    sale_price_cents_override?: number | null;
  },
): Promise<{ productId: string; priceCents: number }> {
  const effective: ImportSettings =
    opts.markup_override_percent != null
      ? { ...settings, markup_percent: opts.markup_override_percent }
      : settings;
  const priceCents =
    opts.sale_price_cents_override ??
    computeSalePriceCents(norm.price_original, norm.currency, effective);
  assertPublishablePrice(opts.status, priceCents);

  const slug = slugify(norm.title) + "-" + (norm.source_id ?? Math.random().toString(36).slice(2, 8));
  const sku = norm.sku || (norm.source_id ? `AE-${norm.source_id}` : `IMP-${Date.now()}`);

  const { data: created, error: pe } = await admin
    .from("products")
    .insert({
      slug,
      name: norm.title,
      short_description: norm.description?.slice(0, 200) ?? null,
      description: norm.description ?? null,
      status: opts.status,
      is_featured: false,
      brand_id: opts.brand_id,
      category_id: opts.category_id,
      tags: buildProductTags({ name: norm.title }),
    })
    .select("id")
    .single();
  if (pe) throw new Error(pe.message);
  const productId = created.id;

  const { data: nv, error: ve } = await admin
    .from("product_variants")
    .insert({ product_id: productId, sku, is_default: true, weight_grams: norm.weight_grams ?? null })
    .select("id")
    .single();
  if (ve) throw new Error(ve.message);
  const variantId = nv.id;

  const { error: prErr } = await admin.from("product_prices").insert({
    variant_id: variantId,
    list_price_cents: priceCents,
    sale_price_cents: null,
    is_active: true,
  });
  if (prErr) throw new Error(prErr.message);

  const { error: invErr } = await admin
    .from("product_inventory")
    .upsert({ variant_id: variantId, stock: opts.stock }, { onConflict: "variant_id" });
  if (invErr) throw new Error(invErr.message);

  if (norm.images.length > 0) {
    const { error: me } = await admin.from("product_media").insert(
      norm.images.map((url, i) => ({
        product_id: productId,
        url,
        alt: norm.title,
        position: i,
        kind: "image" as const,
      })),
    );
    if (me) throw new Error(me.message);
  }

  await admin
    .from("product_imports")
    .update({ status: "imported", product_id: productId, error: null })
    .eq("id", importId);

  if (norm.source_id) {
    try {
      const { syncReviewsForProductInternal } = await import("./product-reviews.functions");
      void syncReviewsForProductInternal(admin, productId, String(norm.source_id), 4.5);
    } catch {
      // reviews are non-critical
    }
    await syncVariantsAndRecord(admin, importId, productId, String(norm.source_id), settings);
  }

  return { productId, priceCents };
}

export const saveImportDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => DraftSchema.parse(v))
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const db = context.supabase;
    const translated = await translateToPtBr({
      title: data.normalized.title,
      description: data.normalized.description ?? null,
    });
    let priceBrl: number | null = data.normalized.price_original ?? null;
    const srcCurrency = (data.normalized.currency ?? "BRL").toUpperCase();
    if (priceBrl != null && srcCurrency !== "BRL") {
      const live = await fetchFxToBrl(srcCurrency);
      const cfgForFx = await loadSettings(db);
      const rate = live ?? cfgForFx.fx_rate;
      priceBrl = Math.round(priceBrl * rate * 100) / 100;
    }
    const norm: NormalizedProduct = {
      title: translated.title,
      description: toParagraphHtml(translated.description),
      images: data.normalized.images ?? [],
      price_original: priceBrl,
      currency: "BRL",
      sku: data.normalized.sku ?? null,
      weight_grams: data.normalized.weight_grams ?? null,
      source_url: data.source_url ?? null,
      source_id: data.source_id ?? null,
    };
    const { data: created, error } = await db
      .from("product_imports")
      .insert({
        source: data.source,
        source_url: data.source_url ?? null,
        source_id: data.source_id ?? null,
        status: "draft",
        raw_data: {},
        normalized_data: norm,
        imported_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const settings = await loadSettings(db);
    try {
      const { productId } = await commitImportRow(db, created.id, norm, settings, {
        status: "draft",
        category_id: settings.default_category_id ?? null,
        brand_id: settings.default_brand_id ?? null,
        stock: 10,
      });
      return { id: created.id, product_id: productId };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await db.from("product_imports").update({ error: msg }).eq("id", created.id);
      return { id: created.id, product_id: null };
    }
  });

export const bulkImportJson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ items: z.array(DraftSchema.shape.normalized).min(1).max(100) }).parse(v))
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const settings = await loadSettings(supabaseAdmin);
    let count = 0;
    for (const n of data.items) {
      const translated = await translateToPtBr({
        title: n.title,
        description: n.description ?? null,
      });
      let priceBrl: number | null = n.price_original ?? null;
      const srcCurrency = (n.currency ?? "BRL").toUpperCase();
      if (priceBrl != null && srcCurrency !== "BRL") {
        const live = await fetchFxToBrl(srcCurrency);
        const rate = live ?? settings.fx_rate;
        priceBrl = Math.round(priceBrl * rate * 100) / 100;
      }
      const norm: NormalizedProduct = {
        title: translated.title,
        description: toParagraphHtml(translated.description),
        images: n.images ?? [],
        price_original: priceBrl,
        currency: "BRL",
        sku: n.sku ?? null,
        weight_grams: n.weight_grams ?? null,
        source_url: null,
        source_id: null,
      };
      const { data: row, error } = await supabaseAdmin
        .from("product_imports")
        .insert({
          source: "json",
          normalized_data: norm,
          raw_data: {},
          status: "draft",
          imported_by: context.userId,
        })
        .select("id")
        .single();
      if (error) continue;
      try {
        await commitImportRow(supabaseAdmin, row.id, norm, settings, {
          status: "draft",
          category_id: settings.default_category_id ?? null,
          brand_id: settings.default_brand_id ?? null,
          stock: 10,
        });
        count++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await supabaseAdmin.from("product_imports").update({ error: msg }).eq("id", row.id);
      }
    }
    return { count };
  });

export const listImports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ status: z.enum(["all", "draft", "imported", "failed", "archived"]).optional() }).parse(v ?? {}),
  )
  .handler(async ({ data, context }): Promise<ImportRow[]> => {
    await assertCatalog(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("product_imports")
      .select("id, source, source_url, source_id, status, error, product_id, normalized_data, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({
      id: r.id,
      source: r.source,
      source_url: r.source_url,
      source_id: r.source_id,
      status: r.status as ImportRow["status"],
      error: r.error,
      product_id: r.product_id,
      normalized_data: r.normalized_data as NormalizedProduct,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));
  });

export const getImport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }): Promise<ImportRow> => {
    await assertCatalog(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: r, error } = await supabaseAdmin
      .from("product_imports")
      .select("id, source, source_url, source_id, status, error, product_id, normalized_data, created_at, updated_at")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!r) throw new Error("Importação não encontrada");
    return {
      id: r.id,
      source: r.source,
      source_url: r.source_url,
      source_id: r.source_id,
      status: r.status as ImportRow["status"],
      error: r.error,
      product_id: r.product_id,
      normalized_data: r.normalized_data as NormalizedProduct,
      created_at: r.created_at,
      updated_at: r.updated_at,
    };
  });

export const updateImportDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ id: z.string().uuid(), normalized: DraftSchema.shape.normalized }).parse(v),
  )
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("product_imports")
      .update({
        normalized_data: {
          title: data.normalized.title,
          description: data.normalized.description ?? null,
          images: data.normalized.images ?? [],
          price_original: data.normalized.price_original ?? null,
          currency: data.normalized.currency ?? null,
          sku: data.normalized.sku ?? null,
          weight_grams: data.normalized.weight_grams ?? null,
        },
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("product_imports").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

async function syncImportedProductReviews(admin: any, productId: string) {
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

const CommitSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["draft", "active"]).default("draft"),
  category_id: z.string().uuid().nullable().optional(),
  brand_id: z.string().uuid().nullable().optional(),
  markup_override_percent: z.number().min(0).max(1000).nullable().optional(),
  sale_price_cents_override: z.number().int().min(0).nullable().optional(),
  stock: z.number().int().min(0).default(10),
});

export const commitImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => CommitSchema.parse(v))
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: imp, error: ie } = await supabaseAdmin
      .from("product_imports")
      .select("id, normalized_data, status, product_id")
      .eq("id", data.id)
      .maybeSingle();
    if (ie) throw new Error(ie.message);
    if (!imp) throw new Error("Importação não encontrada");
    const norm = imp.normalized_data as NormalizedProduct;

    const { data: cfg } = await supabaseAdmin
      .from("integrations")
      .select("config")
      .eq("provider", "aliexpress")
      .maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const settingsRaw = (cfg?.config as any)?.import_settings ?? cfg?.config ?? null;
    const settingsParsed = SettingsSchema.safeParse(settingsRaw);
    const settings: ImportSettings = settingsParsed.success ? settingsParsed.data : DEFAULT_SETTINGS;

    const effective: ImportSettings =
      data.markup_override_percent != null
        ? { ...settings, markup_percent: data.markup_override_percent }
        : settings;

    const priceCents =
      data.sale_price_cents_override ??
      computeSalePriceCents(norm.price_original, norm.currency, effective);
    assertPublishablePrice(data.status, priceCents);

    if (imp.product_id) {
      const { error: upErr } = await supabaseAdmin
        .from("products")
        .update({
          name: norm.title,
          short_description: norm.description?.slice(0, 200) ?? null,
          description: norm.description ?? null,
          status: data.status,
          brand_id: data.brand_id ?? settings.default_brand_id ?? null,
          category_id: data.category_id ?? settings.default_category_id ?? null,
        })
        .eq("id", imp.product_id);
      if (upErr) throw new Error(upErr.message);

      const { data: vrow, error: vrowError } = await supabaseAdmin
        .from("product_variants")
        .select("id")
        .eq("product_id", imp.product_id)
        .eq("is_default", true)
        .maybeSingle();
      if (vrowError) throw new Error(vrowError.message);
      if (!vrow?.id) {
        throw new Error("Produto importado sem variação padrão. Corrija o catálogo antes de publicar.");
      }

      const { error: disablePriceError } = await supabaseAdmin
        .from("product_prices")
        .update({ is_active: false })
        .eq("variant_id", vrow.id);
      if (disablePriceError) throw new Error(disablePriceError.message);

      const { error: newPriceError } = await supabaseAdmin.from("product_prices").insert({
        variant_id: vrow.id,
        list_price_cents: priceCents,
        sale_price_cents: null,
        is_active: true,
      });
      if (newPriceError) throw new Error(newPriceError.message);

      const { error: stockError } = await supabaseAdmin
        .from("product_inventory")
        .upsert({ variant_id: vrow.id, stock: data.stock }, { onConflict: "variant_id" });
      if (stockError) throw new Error(stockError.message);

      const { error: importUpdateError } = await supabaseAdmin
        .from("product_imports")
        .update({ status: "imported", error: null })
        .eq("id", data.id);
      if (importUpdateError) throw new Error(importUpdateError.message);

      if (norm.source_id) {
        await syncVariantsAndRecord(
          supabaseAdmin,
          data.id,
          imp.product_id,
          String(norm.source_id),
          settings,
        );
        await syncImportedProductReviews(supabaseAdmin, imp.product_id);
      }
      const { data: p, error: productError } = await supabaseAdmin
        .from("products")
        .select("slug")
        .eq("id", imp.product_id)
        .maybeSingle();
      if (productError) throw new Error(productError.message);
      return { id: imp.product_id, slug: p?.slug ?? "", price_cents: priceCents };
    }

    const slug =
      slugify(norm.title) + "-" + (norm.source_id ?? Math.random().toString(36).slice(2, 8));
    const sku = norm.sku || (norm.source_id ? `AE-${norm.source_id}` : `IMP-${Date.now()}`);

    const { data: created, error: pe } = await supabaseAdmin
      .from("products")
      .insert({
        slug,
        name: norm.title,
        short_description: norm.description?.slice(0, 200) ?? null,
        description: norm.description ?? null,
        status: data.status,
        is_featured: false,
        brand_id: data.brand_id ?? settings.default_brand_id ?? null,
        category_id: data.category_id ?? settings.default_category_id ?? null,
        tags: buildProductTags({ name: norm.title }),
      })
      .select("id")
      .single();
    if (pe) throw new Error(pe.message);
    const productId = created.id;

    const { data: nv, error: ve } = await supabaseAdmin
      .from("product_variants")
      .insert({
        product_id: productId,
        sku,
        is_default: true,
        weight_grams: norm.weight_grams ?? null,
      })
      .select("id")
      .single();
    if (ve) throw new Error(ve.message);
    const variantId = nv.id;

    const { error: prErr } = await supabaseAdmin.from("product_prices").insert({
      variant_id: variantId,
      list_price_cents: priceCents,
      sale_price_cents: null,
      is_active: true,
    });
    if (prErr) throw new Error(prErr.message);

    const { error: invErr } = await supabaseAdmin
      .from("product_inventory")
      .upsert({ variant_id: variantId, stock: data.stock }, { onConflict: "variant_id" });
    if (invErr) throw new Error(invErr.message);

    if (norm.images.length > 0) {
      const { error: me } = await supabaseAdmin.from("product_media").insert(
        norm.images.map((url, i) => ({
          product_id: productId,
          url,
          alt: norm.title,
          position: i,
          kind: "image" as const,
        })),
      );
      if (me) throw new Error(me.message);
    }

    const { error: importUpdateError } = await supabaseAdmin
      .from("product_imports")
      .update({ status: "imported", product_id: productId, error: null })
      .eq("id", data.id);
    if (importUpdateError) throw new Error(importUpdateError.message);

    if (norm.source_id) {
      await syncVariantsAndRecord(
        supabaseAdmin,
        data.id,
        productId,
        String(norm.source_id),
        settings,
      );
        await syncImportedProductReviews(supabaseAdmin, productId);
    }

    return { id: productId, slug, price_cents: priceCents };
  });
