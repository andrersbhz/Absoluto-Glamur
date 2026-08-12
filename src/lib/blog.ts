import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type BlogCategory = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  seo_title: string | null;
  meta_description: string | null;
  position: number;
};

export type BlogPostCard = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  featured_image_url: string | null;
  featured_image_alt: string | null;
  published_at: string | null;
  read_time_minutes: number;
  focus_keyword: string | null;
  category: BlogCategory | null;
};

export type BlogRelatedProduct = {
  id: string;
  slug: string;
  name: string;
  short_description: string | null;
  category_slug: string;
  image_url: string | null;
};

export type BlogPostDetail = BlogPostCard & {
  content_html: string;
  seo_title: string | null;
  meta_description: string | null;
  canonical_url: string | null;
  secondary_keywords: string[];
  tags: string[];
  faq: Array<{ question: string; answer: string }>;
  updated_at: string;
  related_products: BlogRelatedProduct[];
};

const db = supabase as any;

function mapCategory(row: any): BlogCategory | null {
  if (!row) return null;
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    slug: String(row.slug ?? ""),
    description: row.description ?? null,
    seo_title: row.seo_title ?? null,
    meta_description: row.meta_description ?? null,
    position: Number(row.position ?? 0),
  };
}

function mapCard(row: any): BlogPostCard {
  return {
    id: String(row.id),
    slug: String(row.slug ?? ""),
    title: String(row.title ?? ""),
    excerpt: row.excerpt ?? null,
    featured_image_url: row.featured_image_url ?? null,
    featured_image_alt: row.featured_image_alt ?? null,
    published_at: row.published_at ?? null,
    read_time_minutes: Math.max(1, Number(row.read_time_minutes ?? 1)),
    focus_keyword: row.focus_keyword ?? null,
    category: mapCategory(row.category),
  };
}

export function blogCategoriesQuery() {
  return queryOptions({
    queryKey: ["blog-categories-public"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<BlogCategory[]> => {
      const { data, error } = await db
        .from("blog_categories")
        .select("id,name,slug,description,seo_title,meta_description,position")
        .eq("is_active", true)
        .order("position")
        .order("name");
      if (error) throw error;
      return (data ?? []).map(mapCategory);
    },
  });
}

export function blogPostsQuery(options?: { category?: string; search?: string; limit?: number }) {
  const category = options?.category?.trim() ?? "";
  const search = options?.search?.trim() ?? "";
  const limit = Math.min(60, Math.max(1, options?.limit ?? 24));

  return queryOptions({
    queryKey: ["blog-posts-public", category, search, limit],
    staleTime: 60_000,
    queryFn: async (): Promise<BlogPostCard[]> => {
      let categoryId: string | null = null;
      if (category) {
        const { data: cat } = await db
          .from("blog_categories")
          .select("id")
          .eq("slug", category)
          .eq("is_active", true)
          .maybeSingle();
        if (!cat?.id) return [];
        categoryId = String(cat.id);
      }

      let query = db
        .from("blog_posts")
        .select("id,slug,title,excerpt,featured_image_url,featured_image_alt,published_at,read_time_minutes,focus_keyword,category:blog_categories(id,name,slug,description,seo_title,meta_description,position)")
        .eq("status", "published")
        .lte("published_at", new Date().toISOString())
        .order("published_at", { ascending: false })
        .limit(limit);

      if (categoryId) query = query.eq("category_id", categoryId);
      if (search) {
        const escaped = search.replace(/[,%()]/g, " ").trim();
        if (escaped) query = query.or(`title.ilike.%${escaped}%,excerpt.ilike.%${escaped}%,focus_keyword.ilike.%${escaped}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map(mapCard);
    },
  });
}

export function latestBlogPostsQuery(limit = 6) {
  return queryOptions({
    ...blogPostsQuery({ limit: Math.min(6, Math.max(1, limit)) }),
    queryKey: ["blog-posts-latest", Math.min(6, Math.max(1, limit))],
  });
}

export function blogPostQuery(slug: string | undefined) {
  return queryOptions({
    queryKey: ["blog-post-public", slug],
    enabled: !!slug,
    staleTime: 60_000,
    queryFn: async (): Promise<BlogPostDetail | null> => {
      if (!slug) return null;
      const { data: row, error } = await db
        .from("blog_posts")
        .select("*,category:blog_categories(id,name,slug,description,seo_title,meta_description,position)")
        .eq("slug", slug)
        .eq("status", "published")
        .lte("published_at", new Date().toISOString())
        .maybeSingle();
      if (error) throw error;
      if (!row) return null;

      const { data: links, error: linksError } = await db
        .from("blog_post_products")
        .select("position,product:products(id,slug,name,short_description,category:categories(slug),media:product_media(url,alt,position,kind))")
        .eq("post_id", row.id)
        .order("position");
      if (linksError) throw linksError;

      const relatedProducts: BlogRelatedProduct[] = (links ?? [])
        .map((link: any) => {
          const product = link.product;
          if (!product) return null;
          const media = Array.isArray(product.media)
            ? [...product.media].sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0))
            : [];
          const image = media.find((m: any) => m.kind !== "video") ?? media[0];
          return {
            id: String(product.id),
            slug: String(product.slug),
            name: String(product.name),
            short_description: product.short_description ?? null,
            category_slug: String(product.category?.slug ?? "produto"),
            image_url: image?.url ?? null,
          } satisfies BlogRelatedProduct;
        })
        .filter(Boolean) as BlogRelatedProduct[];

      const base = mapCard(row);
      return {
        ...base,
        content_html: String(row.content_html ?? ""),
        seo_title: row.seo_title ?? null,
        meta_description: row.meta_description ?? null,
        canonical_url: row.canonical_url ?? null,
        secondary_keywords: Array.isArray(row.secondary_keywords) ? row.secondary_keywords : [],
        tags: Array.isArray(row.tags) ? row.tags : [],
        faq: Array.isArray(row.faq)
          ? row.faq.filter((item: any) => item?.question && item?.answer).map((item: any) => ({
              question: String(item.question),
              answer: String(item.answer),
            }))
          : [],
        updated_at: String(row.updated_at ?? row.published_at ?? new Date().toISOString()),
        related_products: relatedProducts,
      };
    },
  });
}
