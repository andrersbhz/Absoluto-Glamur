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
  stock: number | null;
  updated_at: string;
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("products")
      .select(
        `id, slug, name, status, is_featured, updated_at,
         brand:brands(name), category:categories(name),
         media:product_media(id),
         variants:product_variants(id, is_default,
           prices:product_prices(list_price_cents, sale_price_cents, is_active),
           inventory:product_inventory(stock)
         )`,
      )
      .order("updated_at", { ascending: false })
      .limit(200);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    if (data.q) q = q.ilike("name", `%${data.q}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    type Row = {
      id: string; slug: string; name: string; status: string; is_featured: boolean; updated_at: string;
      brand: { name: string } | null; category: { name: string } | null;
      media: { id: string }[] | null;
      variants: {
        id: string; is_default: boolean;
        prices: { list_price_cents: number; sale_price_cents: number | null; is_active: boolean }[] | null;
        inventory: { stock: number }[] | null;
      }[] | null;
    };
    return (rows as unknown as Row[]).map((r) => {
      const def = r.variants?.find((v) => v.is_default) ?? r.variants?.[0];
      const price = def?.prices?.find((p) => p.is_active) ?? def?.prices?.[0];
      const unit = price
        ? price.sale_price_cents && price.sale_price_cents > 0 && price.sale_price_cents < price.list_price_cents
          ? price.sale_price_cents
          : price.list_price_cents
        : null;
      const stock = def?.inventory?.[0]?.stock ?? null;
      return {
        id: r.id,
        slug: r.slug,
        name: r.name,
        status: r.status as AdminProductRow["status"],
        is_featured: r.is_featured,
        category: r.category,
        brand: r.brand,
        media_count: r.media?.length ?? 0,
        variant_count: r.variants?.length ?? 0,
        price_cents: unit,
        stock,
        updated_at: r.updated_at,
      };
    });
  });

export const listBrandsAndCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertCatalog(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [b, c] = await Promise.all([
      supabaseAdmin.from("brands").select("id, name, slug").order("name"),
      supabaseAdmin.from("categories").select("id, name, slug, parent_id").order("name"),
    ]);
    if (b.error) throw new Error(b.error.message);
    if (c.error) throw new Error(c.error.message);
    return { brands: b.data ?? [], categories: c.data ?? [] };
  });

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
  media: { id: string; url: string; alt: string | null; position: number }[];
  seo: { title: string | null; description: string | null };
};

export const getAdminProduct = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }): Promise<AdminProductDetail> => {
    await assertCatalog(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: p, error } = await supabaseAdmin
      .from("products")
      .select(
        `id, slug, name, short_description, description, status, is_featured, brand_id, category_id, tags,
         variants:product_variants(id, sku, is_default, weight_grams,
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
    type V = {
      id: string; sku: string; is_default: boolean; weight_grams: number | null;
      prices: { list_price_cents: number; sale_price_cents: number | null; is_active: boolean }[] | null;
      inventory: { stock: number }[] | null;
    };
    const variants = (p.variants as unknown as V[]) ?? [];
    const def = variants.find((v) => v.is_default) ?? variants[0];
    const price = def?.prices?.find((x) => x.is_active) ?? def?.prices?.[0];
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
        stock: def?.inventory?.[0]?.stock ?? 0,
        weight_grams: def?.weight_grams ?? null,
      },
      media: ((p.media as unknown as { id: string; url: string; alt: string | null; position: number }[]) ?? [])
        .sort((a, b) => a.position - b.position),
      seo: { title: seoObj?.meta_title ?? null, description: seoObj?.meta_description ?? null },
    };
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const slug = (data.slug && data.slug.trim()) || slugify(data.name);

    let productId = data.id ?? null;

    if (!productId) {
      const { data: created, error } = await supabaseAdmin
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
      const { error } = await supabaseAdmin
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

    // Default variant (upsert single default)
    const { data: existingVars } = await supabaseAdmin
      .from("product_variants")
      .select("id, is_default")
      .eq("product_id", productId);
    let variantId = existingVars?.find((v) => v.is_default)?.id ?? existingVars?.[0]?.id ?? null;

    if (!variantId) {
      const { data: nv, error } = await supabaseAdmin
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
      const { error } = await supabaseAdmin
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
    await supabaseAdmin
      .from("product_prices")
      .update({ is_active: false })
      .eq("variant_id", variantId);
    const { data: existingPrice } = await supabaseAdmin
      .from("product_prices")
      .select("id")
      .eq("variant_id", variantId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingPrice?.id) {
      const { error } = await supabaseAdmin
        .from("product_prices")
        .update({
          list_price_cents: data.variant.list_price_cents,
          sale_price_cents: data.variant.sale_price_cents ?? null,
          is_active: true,
        })
        .eq("id", existingPrice.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("product_prices").insert({
        variant_id: variantId,
        list_price_cents: data.variant.list_price_cents,
        sale_price_cents: data.variant.sale_price_cents ?? null,
        is_active: true,
      });
      if (error) throw new Error(error.message);
    }

    // Inventory (upsert on variant_id PK)
    const { error: invErr } = await supabaseAdmin
      .from("product_inventory")
      .upsert({ variant_id: variantId, stock: data.variant.stock }, { onConflict: "variant_id" });
    if (invErr) throw new Error(invErr.message);

    // Media: replace all
    await supabaseAdmin.from("product_media").delete().eq("product_id", productId);
    if (data.media.length > 0) {
      const { isVideoUrl } = await import("@/lib/media-kind");
      const { error } = await supabaseAdmin.from("product_media").insert(
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
      const { error } = await supabaseAdmin.from("product_seo").upsert(
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("products").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
