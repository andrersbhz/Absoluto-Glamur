import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ProductListItem = {
  id: string;
  slug: string;
  name: string;
  short_description: string | null;
  rating_avg: number;
  rating_count: number;
  brand: { name: string; slug: string } | null;
  category: { name: string; slug: string } | null;
  media: { url: string; alt: string | null }[];
  variants: {
    id: string;
    is_default: boolean;
    prices: { list_price_cents: number; sale_price_cents: number | null; is_active: boolean }[];
  }[];
};

const PRODUCT_SELECT = `
  id, slug, name, short_description, rating_avg, rating_count,
  brand:brands(name, slug),
  category:categories(name, slug),
  media:product_media(url, alt, position),
  variants:product_variants(
    id, is_default,
    prices:product_prices(list_price_cents, sale_price_cents, is_active)
  )
`;

export type Filters = {
  q?: string;
  category?: string;
  collection?: string;
  sort?: "recent" | "price_asc" | "price_desc";
  limit?: number;
};

export function productListQuery(filters: Filters = {}) {
  return queryOptions({
    queryKey: ["products", filters],
    queryFn: async (): Promise<ProductListItem[]> => {
      let q = supabase
        .from("products")
        .select(PRODUCT_SELECT)
        .eq("status", "active")
        .limit(filters.limit ?? 60);

      if (filters.q && filters.q.trim().length > 0) {
        q = q.ilike("name", `%${filters.q.trim()}%`);
      }
      if (filters.category) {
        const { data: cat } = await supabase
          .from("categories")
          .select("id")
          .eq("slug", filters.category)
          .maybeSingle();
        if (cat?.id) q = q.eq("category_id", cat.id);
      }
      if (filters.collection) {
        const { data: col } = await supabase
          .from("collections")
          .select("id, product_collections(product_id)")
          .eq("slug", filters.collection)
          .maybeSingle();
        const ids = (col?.product_collections ?? []).map((p: { product_id: string }) => p.product_id);
        if (ids.length === 0) return [];
        q = q.in("id", ids);
      }

      if (filters.sort === "recent" || !filters.sort) {
        q = q.order("created_at", { ascending: false });
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as ProductListItem[];
    },
    staleTime: 30_000,
  });
}

export function featuredProductsQuery(collectionSlug: string) {
  return productListQuery({ collection: collectionSlug, limit: 8 });
}

export type ProductDetail = Omit<ProductListItem, "variants"> & {
  description: string | null;
  tags: string[];
  attributes: Record<string, unknown>;
  variants: {
    id: string;
    sku: string;
    name: string | null;
    options: Record<string, unknown>;
    is_default: boolean;
    prices: { list_price_cents: number; sale_price_cents: number | null; is_active: boolean }[];
    inventory: { stock: number; reserved: number } | null;
  }[];
  seo: { meta_title: string | null; meta_description: string | null; og_image_url: string | null } | null;
};


export function productDetailQuery(slug: string) {
  return queryOptions({
    queryKey: ["product", slug],
    queryFn: async (): Promise<ProductDetail | null> => {
      const { data, error } = await supabase
        .from("products")
        .select(`
          id, slug, name, short_description, description, rating_avg, rating_count, tags, attributes,
          brand:brands(name, slug),
          category:categories(name, slug),
          media:product_media(url, alt, position),
          variants:product_variants(
            id, sku, name, options, is_default,
            prices:product_prices(list_price_cents, sale_price_cents, is_active),
            inventory:product_inventory(stock, reserved)
          ),
          seo:product_seo(meta_title, meta_description, og_image_url)
        `)
        .eq("slug", slug)
        .eq("status", "active")
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as ProductDetail | null;
    },
    staleTime: 30_000,
  });
}

export function categoriesQuery() {
  return queryOptions({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, slug, name, position")
        .order("position");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });
}

export function collectionsQuery() {
  return queryOptions({
    queryKey: ["collections"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collections")
        .select("id, slug, name, description, is_featured, position")
        .order("position");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });
}

export function pickDefaultVariant(p: Pick<ProductListItem, "variants">) {
  const variants = p.variants ?? [];
  return variants.find((v) => v.is_default) ?? variants[0];
}

export function pickActivePrice(
  v: { prices: { list_price_cents: number; sale_price_cents: number | null; is_active: boolean }[] } | undefined,
) {
  if (!v) return null;
  const active = (v.prices ?? []).find((p) => p.is_active) ?? v.prices?.[0];
  return active ?? null;
}

