import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

export type AdminProductRow = {
  id: string;
  slug: string;
  name: string;
  status: "draft" | "active" | "archived";
  is_featured: boolean;
  category: { name: string } | null;
  brand: { name: string } | null;
  media_count: number;
  variant_count: number;
  price_cents: number | null;
  cost_cents: number | null;
  stock: number | null;
  thumbnail_url: string | null;
  updated_at: string;
  ali_source_id: string | null;
  supplier_source: string | null;
  supplier_url: string | null;
  supplier_cost_cents: number | null;
  supplier_shipping_cents: number | null;
  supplier_total_cents: number | null;
  total_stock: number | null;
};


export const listAdminProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({ q: z.string().optional(), status: z.enum(["all", "draft", "active", "archived"]).optional() })
      .parse(v ?? {}),
  )
  .handler(async ({ data, context }): Promise<AdminProductRow[]> => {
    await assertCatalog(context);
    const db = context.supabase;
    let q = db
      .from("products")
      .select("id, slug, name, status, is_featured, updated_at, brand:brands(name), category:categories(name)")
      .order("updated_at", { ascending: false })
      .limit(200);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    if (data.q) q = q.ilike("name", `%${data.q}%`);
    const { data: baseRows, error } = await q;
    if (error) throw new Error(error.message);

    type Base = {
      id: string; slug: string; name: string; status: string; is_featured: boolean; updated_at: string;
      brand: { name: string } | null; category: { name: string } | null;
    };
    const bases = (baseRows ?? []) as unknown as Base[];
    const productIds = bases.map((r) => r.id);
    const idsOrNone = productIds.length > 0 ? productIds : ["00000000-0000-0000-0000-000000000000"];

    // Consultas menores e paralelas: o join aninhado único ficava grande demais
    // e estourava o tempo/limite de resposta em produção.
    const [
      { data: mediaRows },
      { data: pricingRows },
      { data: variantRows },
      { data: imports },
      { data: shippingRows },
    ] = await Promise.all([
      db.from("product_media").select("product_id, url, position, kind").in("product_id", idsOrNone),
      db.from("pricing_calculations").select("product_id, cost_cents, computed_at").in("product_id", idsOrNone),
      db
        .from("product_variants")
        .select(
          "id, product_id, is_default, supplier_cost_cents:options->supplier_cost_cents, prices:product_prices(list_price_cents, sale_price_cents, is_active), inventory:product_inventory(stock)",
        )
        .in("product_id", idsOrNone),
      db
        .from("product_imports")
        .select("product_id, source, source_id, source_url, created_at")
        .in("product_id", idsOrNone)
        .not("source_id", "is", null)
        .order("created_at", { ascending: false }),
      db
        .from("pricing_cost_components")
        .select("product_id, key, amount_cents")
        .in("product_id", idsOrNone)
        .in("key", ["shipping", "frete", "freight"]),
    ]);

    type MediaRow = { product_id: string; url: string; position: number | null; kind: string | null };
    type PricingRow = { product_id: string; cost_cents: number | null; computed_at: string | null };
    type VariantRow = {
      id: string; product_id: string; is_default: boolean;
      supplier_cost_cents: number | string | null;
      prices: { list_price_cents: number; sale_price_cents: number | null; is_active: boolean }[] | null;
      inventory: { stock: number } | { stock: number }[] | null;
    };

    const mediaBy: Record<string, MediaRow[]> = {};
    for (const m of (mediaRows ?? []) as unknown as MediaRow[]) {
      (mediaBy[m.product_id] ??= []).push(m);
    }
    const pricingBy: Record<string, PricingRow[]> = {};
    for (const p of (pricingRows ?? []) as unknown as PricingRow[]) {
      (pricingBy[p.product_id] ??= []).push(p);
    }
    const variantsBy: Record<string, VariantRow[]> = {};
    for (const v of (variantRows ?? []) as unknown as VariantRow[]) {
      (variantsBy[v.product_id] ??= []).push(v);
    }

    const aliBy: Record<string, string> = {};
    const supplierBy: Record<string, { source: string; url: string | null }> = {};
    for (const imp of imports ?? []) {
      if (!imp.product_id || !imp.source_id) continue;
      if (!supplierBy[imp.product_id]) {
        supplierBy[imp.product_id] = { source: imp.source as string, url: (imp.source_url as string) ?? null };
      }
      const isAli = ["aliexpress", "aliexpress_api", "aliexpress_url"].includes(imp.source as string);
      if (isAli && !aliBy[imp.product_id]) aliBy[imp.product_id] = imp.source_id;
    }
    const shippingBy: Record<string, number> = {};
    for (const row of shippingRows ?? []) {
      if (!row.product_id) continue;
      shippingBy[row.product_id] = (shippingBy[row.product_id] ?? 0) + Math.max(0, Number(row.amount_cents ?? 0));
    }

    return bases.map((r) => {
      const variants = variantsBy[r.id] ?? [];
      const def = variants.find((v) => v.is_default) ?? variants[0];

      const price = def?.prices?.find((p) => p.is_active) ?? def?.prices?.[0];
      const unit = price
        ? price.sale_price_cents && price.sale_price_cents > 0 && price.sale_price_cents < price.list_price_cents
          ? price.sale_price_cents
          : price.list_price_cents
        : null;
      const invRaw = def?.inventory;
      const stock = invRaw
        ? Array.isArray(invRaw)
          ? (invRaw[0]?.stock ?? null)
          : (invRaw.stock ?? null)
        : null;
      const mediaSorted = (mediaBy[r.id] ?? []).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      const cover = mediaSorted.find((m) => m.kind !== "video") ?? mediaSorted[0];
      const latestPricing = (pricingBy[r.id] ?? [])
        .slice()
        .sort((a, b) => new Date(b.computed_at ?? 0).getTime() - new Date(a.computed_at ?? 0).getTime())[0];
      // Custo real do fornecedor: menor custo entre as variações sincronizadas.
      const supplierCosts = variants
        .map((v) => Number(v.supplier_cost_cents ?? 0))
        .filter((n) => Number.isFinite(n) && n > 0);
      const supplierCost =
        supplierCosts.length > 0 ? Math.min(...supplierCosts) : (latestPricing?.cost_cents ?? null);
      const shipping = shippingBy[r.id] ?? null;
      const totalStock = variants.reduce((sum, v) => {
        const inv = v.inventory;
        const st = inv ? (Array.isArray(inv) ? (inv[0]?.stock ?? 0) : (inv.stock ?? 0)) : 0;
        return sum + Number(st ?? 0);
      }, 0);
      return {
        id: r.id,
        slug: r.slug,
        name: r.name,
        status: r.status as AdminProductRow["status"],
        is_featured: r.is_featured,
        category: r.category,
        brand: r.brand,
        media_count: mediaSorted.length,
        variant_count: variants.length,

        price_cents: unit,
        cost_cents: latestPricing?.cost_cents ?? null,
        stock,
        thumbnail_url: cover?.url ?? null,
        updated_at: r.updated_at,
        ali_source_id: aliBy[r.id] ?? null,
        supplier_source: supplierBy[r.id]?.source ?? null,
        supplier_url: supplierBy[r.id]?.url ?? null,
        supplier_cost_cents: supplierCost,
        supplier_shipping_cents: shipping,
        supplier_total_cents:
          supplierCost != null ? supplierCost + (shipping ?? 0) : shipping != null ? shipping : null,
        total_stock: totalStock,
      };

    });
  });

export const listBrandsAndCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertCatalog(context);
    const db = context.supabase;
    const [b, c] = await Promise.all([
      db.from("brands").select("id, name, slug").order("name"),
      db.from("categories").select("id, name, slug, parent_id").order("name"),
    ]);
    if (b.error) throw new Error(b.error.message);
    if (c.error) throw new Error(c.error.message);
    return { brands: b.data ?? [], categories: c.data ?? [] };
  });

const TRANSLATION_LOCALES = ["en-US", "es", "es-MX", "fr-FR", "it-IT", "de-DE"];

/* eslint-disable @typescript-eslint/no-explicit-any */
async function translateOneProduct(
  db: any,
  product: { id: string; name: string; short_description: string | null; description: string | null },
): Promise<number> {
  const { generateWithOwnKeys } = await import("./ai-translate.server");
  const raw = await generateWithOwnKeys(
    "Você é um tradutor profissional de e-commerce de beleza. Preserve nomes de marca, ingredientes, medidas e informações legais. Responda somente JSON válido.",
    `Traduza o produto para ${TRANSLATION_LOCALES.join(", ")}. Formato: {"en-US":{"name":"","short_description":"","description":""},...}. Produto: ${JSON.stringify(product)}`,
    db,
  );
  if (!raw) throw new Error("Nenhum provedor de IA configurado conseguiu traduzir o produto.");
  let parsed: Record<string, { name?: string; short_description?: string; description?: string }>;
  try { parsed = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, "")); } catch { throw new Error("A IA retornou uma tradução em formato inválido."); }
  const rows = TRANSLATION_LOCALES.filter((locale) => parsed[locale]?.name).map((locale) => ({ product_id: product.id, locale, name: parsed[locale].name ?? null, short_description: parsed[locale].short_description ?? null, description: parsed[locale].description ?? null, translated_at: new Date().toISOString(), is_stale: false }));
  if (!rows.length) throw new Error("Nenhuma tradução válida foi gerada.");
  const { error: upsertError } = await db.from("product_translations").upsert(rows, { onConflict: "product_id,locale" });
  if (upsertError) throw new Error(upsertError.message);
  return rows.length;
}

export const translateProductGlobal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ productId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const { data: product, error } = await context.supabase.from("products").select("id,name,short_description,description").eq("id", data.productId).single();
    if (error || !product) throw new Error(error?.message ?? "Produto não encontrado");
    const translated = await translateOneProduct(context.supabase, product as any);
    return { translated };
  });

/**
 * Traduz a loja inteira em lotes. A tela chama repetidamente até `remaining === 0`,
 * evitando estourar o tempo limite de uma única chamada.
 */
export const translateStoreGlobal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ batch: z.number().int().min(1).max(10).optional(), force: z.boolean().optional() }).parse(v ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const db = context.supabase;
    const batch = data.batch ?? 3;

    const [{ data: products, error }, { data: done }] = await Promise.all([
      db.from("products").select("id,name,short_description,description").neq("status", "archived").order("updated_at", { ascending: false }),
      db.from("product_translations").select("product_id,locale"),
    ]);
    if (error) throw new Error(error.message);

    const counts = new Map<string, number>();
    for (const row of done ?? []) counts.set(row.product_id, (counts.get(row.product_id) ?? 0) + 1);
    const pending = (products ?? []).filter((p: any) => data.force || (counts.get(p.id) ?? 0) < TRANSLATION_LOCALES.length);

    let translated = 0;
    let failed = 0;
    const errors: string[] = [];
    for (const product of pending.slice(0, batch)) {
      try {
        await translateOneProduct(db, product as any);
        translated += 1;
      } catch (e) {
        failed += 1;
        errors.push(`${(product as any).name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return {
      total: products?.length ?? 0,
      pending: pending.length,
      translated,
      failed,
      remaining: Math.max(0, pending.length - translated - failed),
      errors: errors.slice(0, 3),
    };
  });

/** Define (ou remove) o preço manual de uma variação sem quebrar a sincronia com o fornecedor. */
export const setVariantPriceOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({
      variantId: z.string().uuid(),
      listPriceCents: z.number().int().min(0).max(100_000_000).nullable(),
    }).parse(v),
  )
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const db = context.supabase;
    const { data: variant, error } = await db
      .from("product_variants")
      .select("id, product_id, options")
      .eq("id", data.variantId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!variant) throw new Error("Variação não encontrada");

    const options = { ...((variant.options as Record<string, unknown>) ?? {}) };
    if (data.listPriceCents && data.listPriceCents > 0) options.price_override_cents = data.listPriceCents;
    else delete options.price_override_cents;

    const { error: upErr } = await db.from("product_variants").update({ options: options as any }).eq("id", variant.id);
    if (upErr) throw new Error(upErr.message);

    const { applyProductPricing } = await import("./pricing-engine.server");
    const result = await applyProductPricing(db, variant.product_id as string, {
      fallbackSettings: { markup_percent: 150, markup_fixed_cents: 0, round_to_99: true },
    });
    return { ok: true as const, manual: Boolean(options.price_override_cents), ...result };
  });
/* eslint-enable @typescript-eslint/no-explicit-any */

export type AdminProductDetail = {
  id: string;
  slug: string;
  name: string;
  short_description: string | null;
  description: string | null;
  status: "draft" | "active" | "archived";
  is_featured: boolean;
  brand_id: string | null;
  category_id: string | null;
  tags: string[];
  variant: {
    id: string | null;
    sku: string;
    list_price_cents: number;
    sale_price_cents: number | null;
    stock: number;
    weight_grams: number | null;
  };
  variants: {
    id: string;
    sku: string;
    name: string | null;
    attributes: Record<string, string>;
    image_url: string | null;
    is_default: boolean;
    is_available: boolean;
    stock: number;
    price_cents: number;
    list_price_cents: number;
    price_override_cents: number | null;
  }[];
  media: { id: string; url: string; alt: string | null; position: number }[];
  seo: { title: string | null; description: string | null };
  supplier: {
    source: string | null;
    source_id: string | null;
    source_url: string | null;
    cost_cents: number | null;
    shipping_cents: number | null;
    total_cents: number | null;
  };

};

export const getAdminProduct = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }): Promise<AdminProductDetail> => {
    await assertCatalog(context);
    const db = context.supabase;
    const { data: p, error } = await db
      .from("products")
      .select(
        `id, slug, name, short_description, description, status, is_featured, brand_id, category_id, tags,
         variants:product_variants(id, sku, name, options, is_default, is_available, weight_grams,
           prices:product_prices(list_price_cents, sale_price_cents, is_active),
           inventory:product_inventory(stock)
         ),
         media:product_media(id, url, alt, position),
         seo:product_seo(meta_title, meta_description)`,
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!p) throw new Error("Produto não encontrado");
    const [{ data: imp }, { data: shippingRows }] = await Promise.all([
      db
        .from("product_imports")
        .select("source, source_id, source_url, created_at")
        .eq("product_id", data.id)
        .not("source_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from("pricing_cost_components")
        .select("key, amount_cents")
        .eq("product_id", data.id)
        .in("key", ["shipping", "frete", "freight"]),
    ]);
    const shippingCents = (shippingRows ?? []).reduce(
      (sum: number, row: { amount_cents: number | null }) => sum + Math.max(0, Number(row.amount_cents ?? 0)),
      0,
    );
    type V = {
      id: string; sku: string; is_default: boolean; weight_grams: number | null;
      name?: string | null;
      options?: {
        attributes?: Record<string, string>;
        image_url?: string | null;
        price_override_cents?: number | null;
        supplier_cost_cents?: number | null;
      } | null;
      is_available?: boolean | null;
      prices: { list_price_cents: number; sale_price_cents: number | null; is_active: boolean }[] | null;
      inventory: { stock: number } | { stock: number }[] | null;
    };

    const variants = (p.variants as unknown as V[]) ?? [];
    const def = variants.find((v) => v.is_default) ?? variants[0];
    const price = def?.prices?.find((x) => x.is_active) ?? def?.prices?.[0];
    const invRaw = def?.inventory;
    const stock = invRaw
      ? Array.isArray(invRaw)
        ? (invRaw[0]?.stock ?? 0)
        : (invRaw.stock ?? 0)
      : 0;
    const seoRow = (p.seo as unknown as { meta_title: string | null; meta_description: string | null } | { meta_title: string | null; meta_description: string | null }[] | null);
    const seoObj = Array.isArray(seoRow) ? seoRow[0] : seoRow;
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      short_description: p.short_description,
      description: p.description,
      status: p.status as AdminProductDetail["status"],
      is_featured: p.is_featured,
      brand_id: p.brand_id,
      category_id: p.category_id,
      tags: p.tags ?? [],
      variant: {
        id: def?.id ?? null,
        sku: def?.sku ?? "",
        list_price_cents: price?.list_price_cents ?? 0,
        sale_price_cents: price?.sale_price_cents ?? null,
        stock,
        weight_grams: def?.weight_grams ?? null,
      },
      variants: variants.map((v) => {
        const inv = v.inventory;
        const st = inv ? (Array.isArray(inv) ? (inv[0]?.stock ?? 0) : (inv.stock ?? 0)) : 0;
        const pr = v.prices?.find((x) => x.is_active) ?? v.prices?.[0];
        const unit =
          pr?.sale_price_cents && pr.sale_price_cents > 0 && pr.sale_price_cents < pr.list_price_cents
            ? pr.sale_price_cents
            : (pr?.list_price_cents ?? 0);
        return {
          id: v.id,
          sku: v.sku,
          name: v.name ?? null,
          attributes: v.options?.attributes ?? {},
          image_url: v.options?.image_url ?? null,
          is_default: v.is_default,
          is_available: v.is_available !== false,
          stock: st,
          price_cents: unit,
          list_price_cents: pr?.list_price_cents ?? 0,
          price_override_cents: v.options?.price_override_cents ?? null,
        };
      }),
      media: ((p.media as unknown as { id: string; url: string; alt: string | null; position: number }[]) ?? [])
        .sort((a, b) => a.position - b.position),
      seo: { title: seoObj?.meta_title ?? null, description: seoObj?.meta_description ?? null },
      supplier: (() => {
        const costs = variants
          .map((v) => Number(v.options?.supplier_cost_cents ?? 0))
          .filter((n) => Number.isFinite(n) && n > 0);
        const cost = costs.length > 0 ? Math.min(...costs) : null;
        return {
          source: (imp?.source as string) ?? null,
          source_id: (imp?.source_id as string) ?? null,
          source_url: (imp?.source_url as string) ?? null,
          cost_cents: cost,
          shipping_cents: shippingCents > 0 ? shippingCents : null,
          total_cents: cost != null ? cost + shippingCents : shippingCents > 0 ? shippingCents : null,
        };
      })(),
    };
  });

/** Troca/define o fornecedor de origem do produto (link ou ID) sem apagar histórico. */
export const setProductSupplier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        productId: z.string().uuid(),
        source: z.enum(["aliexpress_url", "aliexpress_api", "manual"]),
        reference: z.string().trim().min(1).max(400),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const db = context.supabase;

    let sourceId = data.reference.trim();
    let sourceUrl: string | null = null;
    if (data.source !== "manual") {
      const digits = sourceId.match(/(\d{6,})/);
      if (!digits) throw new Error("Informe o link completo do AliExpress ou o ID numérico do produto.");
      sourceId = digits[1];
      sourceUrl = /^https?:\/\//i.test(data.reference.trim())
        ? data.reference.trim()
        : `https://www.aliexpress.com/item/${sourceId}.html`;
    }

    const { error } = await db.from("product_imports").insert({
      product_id: data.productId,
      source: data.source,
      source_id: sourceId,
      source_url: sourceUrl,
      status: "done",
      raw_data: {},
      normalized_data: {},
      imported_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const, source: data.source, source_id: sourceId, source_url: sourceUrl };
  });


const UpsertSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  name: z.string().min(2),
  slug: z.string().min(2).optional(),
  short_description: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  status: z.enum(["draft", "active", "archived"]),
  is_featured: z.boolean(),
  brand_id: z.string().uuid().nullable().optional(),
  category_id: z.string().uuid().nullable().optional(),
  tags: z.array(z.string()).default([]),
  variant: z.object({
    sku: z.string().min(1),
    list_price_cents: z.number().int().min(0),
    sale_price_cents: z.number().int().min(0).nullable().optional(),
    stock: z.number().int().min(0),
    weight_grams: z.number().int().min(0).nullable().optional(),
  }),
  media: z
    .array(z.object({ url: z.string().url(), alt: z.string().nullable().optional() }))
    .default([]),
  seo: z
    .object({
      title: z.string().nullable().optional(),
      description: z.string().nullable().optional(),
    })
    .optional(),
});
export type AdminProductInput = z.infer<typeof UpsertSchema>;

export const upsertAdminProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => UpsertSchema.parse(v))
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const db = context.supabase;

    const slug = (data.slug && data.slug.trim()) || slugify(data.name);

    let productId = data.id ?? null;

    if (!productId) {
      const { data: created, error } = await db
        .from("products")
        .insert({
          slug,
          name: data.name,
          short_description: data.short_description ?? null,
          description: data.description ?? null,
          status: data.status,
          is_featured: data.is_featured,
          brand_id: data.brand_id ?? null,
          category_id: data.category_id ?? null,
          tags: data.tags,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      productId = created.id;
    } else {
      const { error } = await db
        .from("products")
        .update({
          slug,
          name: data.name,
          short_description: data.short_description ?? null,
          description: data.description ?? null,
          status: data.status,
          is_featured: data.is_featured,
          brand_id: data.brand_id ?? null,
          category_id: data.category_id ?? null,
          tags: data.tags,
        })
        .eq("id", productId);
      if (error) throw new Error(error.message);
    }

    // Variação principal. Produtos sincronizados têm várias variações:
    // nesses casos NÃO renomeamos o SKU nem trocamos a variação padrão —
    // apenas o preço da variação principal é atualizado, preservando o catálogo.
    const { data: existingVars } = await db
      .from("product_variants")
      .select("id, is_default")
      .eq("product_id", productId);
    const hasMultipleVariants = (existingVars?.length ?? 0) > 1;
    let variantId = existingVars?.find((v) => v.is_default)?.id ?? existingVars?.[0]?.id ?? null;

    if (hasMultipleVariants && variantId) {
      const { error } = await db
        .from("product_variants")
        .update({ weight_grams: data.variant.weight_grams ?? null })
        .eq("id", variantId);
      if (error) throw new Error(error.message);
    } else if (!variantId) {
      const { data: nv, error } = await db
        .from("product_variants")
        .insert({
          product_id: productId,
          sku: data.variant.sku,
          is_default: true,
          weight_grams: data.variant.weight_grams ?? null,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      variantId = nv.id;
    } else {
      const { error } = await db
        .from("product_variants")
        .update({
          sku: data.variant.sku,
          is_default: true,
          weight_grams: data.variant.weight_grams ?? null,
        })
        .eq("id", variantId);
      if (error) throw new Error(error.message);
    }

    // Price: keep only one active row (deactivate others)
    await db
      .from("product_prices")
      .update({ is_active: false })
      .eq("variant_id", variantId);
    const { data: existingPrice } = await db
      .from("product_prices")
      .select("id, list_price_cents")
      .eq("variant_id", variantId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const previousListCents = Number(existingPrice?.list_price_cents ?? 0);
    if (existingPrice?.id) {
      const { error } = await db
        .from("product_prices")
        .update({
          list_price_cents: data.variant.list_price_cents,
          sale_price_cents: data.variant.sale_price_cents ?? null,
          is_active: true,
        })
        .eq("id", existingPrice.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await db.from("product_prices").insert({
        variant_id: variantId,
        list_price_cents: data.variant.list_price_cents,
        sale_price_cents: data.variant.sale_price_cents ?? null,
        is_active: true,
      });
      if (error) throw new Error(error.message);
    }

    // Só marcamos preço manual quando o lojista realmente alterou o valor.
    // Salvar o formulário sem mexer no preço mantém a variação em modo automático.
    if (data.variant.list_price_cents > 0 && data.variant.list_price_cents !== previousListCents) {
      const { data: vRow } = await db
        .from("product_variants")
        .select("options")
        .eq("id", variantId)
        .maybeSingle();
      const opts = { ...(((vRow?.options as Record<string, unknown>) ?? {}) as Record<string, unknown>) };
      opts.price_override_cents = data.variant.list_price_cents;
      await db.from("product_variants").update({ options: opts as never }).eq("id", variantId);
    }


    // Inventory (upsert on variant_id PK)
    const { error: invErr } = await db
      .from("product_inventory")
      .upsert({ variant_id: variantId, stock: data.variant.stock }, { onConflict: "variant_id" });
    if (invErr) throw new Error(invErr.message);

    // Mídia: só substituímos quando o formulário envia imagens.
    // Salvar sem mídia (ex.: só ajuste de preço) preserva as fotos sincronizadas.
    if (data.media.length > 0) {
      await db.from("product_media").delete().eq("product_id", productId);
      const { isVideoUrl } = await import("@/lib/media-kind");
      const { error } = await db.from("product_media").insert(
        data.media.map((m, i) => ({
          product_id: productId,
          url: m.url,
          alt: m.alt ?? null,
          position: i,
          kind: (isVideoUrl(m.url) ? "video" : "image") as "video" | "image",
        })),
      );
      if (error) throw new Error(error.message);
    }

    // SEO upsert
    if (data.seo) {
      const { error } = await db.from("product_seo").upsert(
        {
          product_id: productId,
          meta_title: data.seo.title ?? null,
          meta_description: data.seo.description ?? null,
        },
        { onConflict: "product_id" },
      );
      if (error) throw new Error(error.message);
    }

    return { id: productId, slug };
  });

export const deleteAdminProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const db = context.supabase;
    const { error } = await db.from("products").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Exporta produtos em CSV com cabeçalhos em PT-BR (UTF-8 com BOM para abrir bem no Excel).
export const exportAdminProductsCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        q: z.string().optional(),
        status: z.enum(["all", "draft", "active", "archived"]).optional(),
      })
      .parse(v ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const db = context.supabase;
    let q = db
      .from("products")
      .select(
        `id, slug, name, description, short_description, status, is_featured, updated_at, created_at,
         brand:brands(name), category:categories(name),
         seo:product_seo(meta_title, meta_description, keywords),
         media:product_media(url, kind, is_cover, position),
         variants:product_variants(id, sku, is_default,
           prices:product_prices(list_price_cents, sale_price_cents, is_active, currency),
           inventory:product_inventory(stock)
         )`,
      )
      .order("updated_at", { ascending: false })
      .limit(2000);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    if (data.q) q = q.ilike("name", `%${data.q}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const STATUS_PT: Record<string, string> = {
      draft: "Rascunho",
      active: "Ativo",
      archived: "Arquivado",
    };

    const header = [
      "ID",
      "Slug",
      "Nome",
      "Marca",
      "Categoria",
      "Status",
      "Destaque",
      "Descrição curta",
      "Descrição completa",
      "SKU padrão",
      "Preço de tabela (R$)",
      "Preço promocional (R$)",
      "Moeda",
      "Estoque",
      "Qtd. variantes",
      "Qtd. mídias",
      "Capa (URL)",
      "SEO título",
      "SEO descrição",
      "SEO palavras-chave",
      "Criado em",
      "Atualizado em",
    ];

    const formatCents = (c: unknown) =>
      typeof c === "number" ? (c / 100).toFixed(2).replace(".", ",") : "";
    const fmtDate = (v: string | null) =>
      v ? new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "";

    const lines = ((rows ?? []) as unknown as Array<Record<string, unknown>>).map((r) => {
      const variants = (r.variants as Array<Record<string, unknown>> | null) ?? [];
      const def = variants.find((v) => v.is_default) ?? variants[0] ?? null;
      const prices = (def?.prices as Array<Record<string, unknown>> | null) ?? [];
      const price = prices.find((p) => p.is_active) ?? prices[0];
      const invRaw = def?.inventory as { stock: number } | { stock: number }[] | null | undefined;
      const stockVal = invRaw
        ? Array.isArray(invRaw)
          ? (invRaw[0]?.stock ?? "")
          : (invRaw.stock ?? "")
        : "";
      const media = ((r.media as Array<Record<string, unknown>> | null) ?? [])
        .slice()
        .sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0));
      const cover = media.find((m) => m.is_cover) ?? media[0];
      const seo = (r.seo as Array<Record<string, unknown>> | null)?.[0];
      const keywords = Array.isArray(seo?.keywords)
        ? (seo?.keywords as string[]).join("; ")
        : "";

      const values: (string | number | null | undefined)[] = [
        r.id as string,
        r.slug as string,
        r.name as string,
        (r.brand as { name?: string } | null)?.name ?? "",
        (r.category as { name?: string } | null)?.name ?? "",
        STATUS_PT[(r.status as string) ?? ""] ?? (r.status as string) ?? "",
        r.is_featured ? "Sim" : "Não",
        (r.short_description as string) ?? "",
        (r.description as string) ?? "",
        (def?.sku as string) ?? "",
        formatCents(price?.list_price_cents),
        formatCents(price?.sale_price_cents),
        (price?.currency as string) ?? "BRL",
        stockVal,
        variants.length,
        media.length,
        (cover?.url as string) ?? "",
        (seo?.meta_title as string) ?? "",
        (seo?.meta_description as string) ?? "",
        keywords,
        fmtDate((r.created_at as string) ?? null),
        fmtDate((r.updated_at as string) ?? null),
      ];

      return values
        .map((v) => {
          if (v == null) return "";
          const s = String(v).replace(/"/g, '""');
          return /[";\n\r]/.test(s) ? `"${s}"` : s;
        })
        .join(";");
    });

    // BOM UTF-8 + separador ";" para compatibilidade nativa com Excel PT-BR.
    const csv = "\uFEFF" + [header.join(";"), ...lines].join("\r\n");
    return { csv, count: lines.length };
  });

/** Cadastra uma nova marca no catálogo (usada quando o produto importado não tem marca). */
export const createBrand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ name: z.string().trim().min(2).max(80) }).parse(v))
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const slug = data.name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "")
      .slice(0, 80);
    if (!slug) throw new Error("Nome de marca inválido");

    const { data: existing } = await context.supabase
      .from("brands")
      .select("id, name")
      .eq("slug", slug)
      .maybeSingle();
    if (existing) return { id: existing.id as string, name: existing.name as string, created: false };

    const { data: row, error } = await context.supabase
      .from("brands")
      .insert({ name: data.name.trim(), slug })
      .select("id, name")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string, name: row.name as string, created: true };
  });
