import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

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

// -------------------- Types --------------------

export type NormalizedProduct = {
  title: string;
  description: string | null;
  images: string[];
  price_original: number | null; // in currency units (not cents), source currency
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

// -------------------- Settings (persisted via integrations table) --------------------

const SettingsSchema = z.object({
  markup_percent: z.number().min(0).max(1000).default(150), // e.g. 150 = +150%
  markup_fixed_cents: z.number().int().min(0).default(0),
  round_to_99: z.boolean().default(true),
  default_status: z.enum(["draft", "active"]).default("draft"),
  default_category_id: z.string().uuid().nullable().optional(),
  default_brand_id: z.string().uuid().nullable().optional(),
  fx_rate: z.number().positive().default(5.5), // 1 USD -> BRL (fallback if source currency not BRL)
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
      .eq("provider", "aliexpress_import")
      .maybeSingle();
    if (!data?.config) return DEFAULT_SETTINGS;
    const parsed = SettingsSchema.safeParse(data.config);
    return parsed.success ? parsed.data : DEFAULT_SETTINGS;
  });

export const saveImportSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => SettingsSchema.parse(v))
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("integrations")
      .upsert(
        {
          provider: "aliexpress_import",
          category: "catalog",
          display_name: "Importador AliExpress",
          description: "Configurações de importação (markup, defaults)",
          enabled: true,
          mode: "production" as const,
          config: data,
        },
        { onConflict: "provider" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -------------------- Pricing helpers --------------------

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

// -------------------- Scraping (URL) --------------------

function extractAliexpressId(url: string): string | null {
  const m = url.match(/\/item\/(\d+)\.html/) || url.match(/\/(\d{10,})\.html/);
  return m?.[1] ?? null;
}

async function scrapeViaFirecrawl(url: string): Promise<NormalizedProduct> {
  const key = process.env.FIRECRAWL_API_KEY;
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!key) {
    throw new Error(
      "Firecrawl não conectado. Conecte o conector Firecrawl no workspace (Connectors) para importar via URL.",
    );
  }
  const isGateway = key.startsWith("lovc_");
  const endpoint = isGateway
    ? "https://connector-gateway.lovable.dev/firecrawl/v2/scrape"
    : "https://api.firecrawl.dev/v2/scrape";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (isGateway) {
    if (!lovableKey) throw new Error("LOVABLE_API_KEY ausente para o gateway do Firecrawl");
    headers.Authorization = `Bearer ${lovableKey}`;
    headers["X-Connection-Api-Key"] = key;
  } else {
    headers.Authorization = `Bearer ${key}`;
  }

  const jsonSchema = {
    type: "object",
    properties: {
      title: { type: "string" },
      description: { type: "string" },
      images: { type: "array", items: { type: "string" } },
      price: { type: "number" },
      currency: { type: "string" },
      sku: { type: "string" },
      weight_grams: { type: "number" },
    },
    required: ["title"],
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      url,
      onlyMainContent: true,
      formats: [
        "markdown",
        { type: "json", schema: jsonSchema, prompt: "Extract product title, full description, image URLs, current price (as a number in source currency), 3-letter currency code (default BRL), SKU/product code, and shipping weight in grams if available." },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Firecrawl falhou [${res.status}]: ${body.slice(0, 300)}`);
  }
  const payload = await res.json();
  const root = payload.data ?? payload;
  const j = root.json ?? {};
  const md = root.markdown ?? "";
  const meta = root.metadata ?? {};

  return {
    title: j.title || meta.title || "Produto importado",
    description: j.description || md.slice(0, 4000) || null,
    images: Array.isArray(j.images) ? j.images.filter((s: unknown) => typeof s === "string").slice(0, 10) : [],
    price_original: typeof j.price === "number" ? j.price : null,
    currency: typeof j.currency === "string" ? j.currency : "BRL",
    sku: typeof j.sku === "string" ? j.sku : null,
    weight_grams: typeof j.weight_grams === "number" ? Math.round(j.weight_grams) : null,
    source_url: url,
    source_id: extractAliexpressId(url),
  };
}

// -------------------- Translation + FX --------------------

// Remove menções à marca AliExpress (e variações) do conteúdo importado, para
// que descrições, títulos e tags não exponham a origem do produto na loja.
export function stripBrandMentions(input: string | null | undefined): string | null {
  if (!input) return input ?? null;
  let out = String(input);
  // remove "aliexpress", "ali express", "ali-express", "ali_express" (case-insensitive)
  out = out.replace(/ali[\s\-_]?express/gi, "");
  // colapsa espaços/pontuação órfã deixados pela remoção
  out = out.replace(/[ \t]{2,}/g, " ").replace(/\s+([.,;:!?])/g, "$1");
  out = out.replace(/^[\s\-–—·•|,.:;]+|[\s\-–—·•|,.:;]+$/g, "");
  return out.trim() || null;
}

// Converte texto/HTML em HTML com parágrafos <p>. Se o conteúdo já tiver tags
// de bloco (<p>, <br>, <ul>, <h*>, <div>), sanitiza e devolve. Caso contrário,
// quebra por linhas em branco e envolve cada bloco em <p>.
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
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return input; // silently skip if not configured
  try {
    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("google/gemini-2.5-flash");
    const payload = JSON.stringify({
      title: input.title,
      description: input.description ?? "",
    });
    const { text } = await generateText({
      model,
      system:
        "Você traduz descrições de produtos de cosméticos para português do Brasil, mantendo tom elegante, claro e comercial. Preserve unidades, especificações e nomes próprios de ingredientes. Não invente informações. Responda APENAS com JSON válido no formato {\"title\":\"...\",\"description\":\"...\"} sem comentários nem markdown.",
      prompt: `Traduza para pt-BR o conteúdo abaixo. Reescreva de forma natural, sem estrangeirismos desnecessários.\n\n${payload}`,
    });
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
  .inputValidator((v: unknown) => z.object({ url: z.string().url() }).parse(v))
  .handler(async ({ data, context }): Promise<NormalizedProduct> => {
    await assertCatalog(context);
    const raw = await scrapeViaFirecrawl(data.url);

    // Load user-configured fx_rate as override
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: cfg } = await supabaseAdmin
      .from("integrations")
      .select("config")
      .eq("provider", "aliexpress_import")
      .maybeSingle();
    const settingsParsed = SettingsSchema.safeParse(cfg?.config);
    const settings: ImportSettings = settingsParsed.success ? settingsParsed.data : DEFAULT_SETTINGS;

    // Translate to pt-BR
    const translated = await translateToPtBr({ title: raw.title, description: raw.description });

    // Convert price to BRL
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
      description: translated.description,
      price_original: priceBrl,
      currency: "BRL",
    };
  });

// -------------------- Draft CRUD --------------------

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

// Shared helper: load settings from integrations table
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadSettings(admin: any): Promise<ImportSettings> {
  const { data } = await admin
    .from("integrations")
    .select("config")
    .eq("provider", "aliexpress_import")
    .maybeSingle();
  const parsed = SettingsSchema.safeParse(data?.config);
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}

// Shared helper: create real product from an import row
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
      tags: ["importado"],
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

  return { productId, priceCents };
}

export const saveImportDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => DraftSchema.parse(v))
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const translated = await translateToPtBr({
      title: data.normalized.title,
      description: data.normalized.description ?? null,
    });
    let priceBrl: number | null = data.normalized.price_original ?? null;
    const srcCurrency = (data.normalized.currency ?? "BRL").toUpperCase();
    if (priceBrl != null && srcCurrency !== "BRL") {
      const live = await fetchFxToBrl(srcCurrency);
      const cfgForFx = await loadSettings(
        (await import("@/integrations/supabase/client.server")).supabaseAdmin,
      );
      const rate = live ?? cfgForFx.fx_rate;
      priceBrl = Math.round(priceBrl * rate * 100) / 100;
    }
    const norm: NormalizedProduct = {
      title: translated.title,
      description: translated.description,
      images: data.normalized.images ?? [],
      price_original: priceBrl,
      currency: "BRL",
      sku: data.normalized.sku ?? null,
      weight_grams: data.normalized.weight_grams ?? null,
      source_url: data.source_url ?? null,
      source_id: data.source_id ?? null,
    };
    const { data: created, error } = await supabaseAdmin
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

    // Auto-create draft product in catalog so it appears immediately
    const settings = await loadSettings(supabaseAdmin);
    try {
      const { productId } = await commitImportRow(supabaseAdmin, created.id, norm, settings, {
        status: "draft",
        category_id: settings.default_category_id ?? null,
        brand_id: settings.default_brand_id ?? null,
        stock: 10,
      });
      return { id: created.id, product_id: productId };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabaseAdmin.from("product_imports").update({ error: msg }).eq("id", created.id);
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
        description: translated.description,
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

// -------------------- Commit: create real product --------------------

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
      .eq("provider", "aliexpress_import")
      .maybeSingle();
    const settingsParsed = SettingsSchema.safeParse(cfg?.config);
    const settings: ImportSettings = settingsParsed.success ? settingsParsed.data : DEFAULT_SETTINGS;
    const effective: ImportSettings =
      data.markup_override_percent != null
        ? { ...settings, markup_percent: data.markup_override_percent }
        : settings;

    const priceCents =
      data.sale_price_cents_override ??
      computeSalePriceCents(norm.price_original, norm.currency, effective);

    // If a product was already auto-created for this import, update it instead of creating a duplicate
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

      const { data: vrow } = await supabaseAdmin
        .from("product_variants")
        .select("id")
        .eq("product_id", imp.product_id)
        .eq("is_default", true)
        .maybeSingle();
      if (vrow?.id) {
        await supabaseAdmin
          .from("product_prices")
          .update({ is_active: false })
          .eq("variant_id", vrow.id);
        await supabaseAdmin.from("product_prices").insert({
          variant_id: vrow.id,
          list_price_cents: priceCents,
          sale_price_cents: null,
          is_active: true,
        });
        await supabaseAdmin
          .from("product_inventory")
          .upsert({ variant_id: vrow.id, stock: data.stock }, { onConflict: "variant_id" });
      }
      await supabaseAdmin
        .from("product_imports")
        .update({ status: "imported", error: null })
        .eq("id", data.id);
      const { data: p } = await supabaseAdmin
        .from("products")
        .select("slug")
        .eq("id", imp.product_id)
        .maybeSingle();
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
        tags: ["importado"],
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

    await supabaseAdmin
      .from("product_imports")
      .update({ status: "imported", product_id: productId, error: null })
      .eq("id", data.id);

    return { id: productId, slug, price_cents: priceCents };
  });
