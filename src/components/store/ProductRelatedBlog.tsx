import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BookOpen, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/* eslint-disable @typescript-eslint/no-explicit-any */

async function fetchProductIdBySlug(productSlug: string): Promise<string | null> {
  const { data, error } = await (supabase as any)
    .from("products")
    .select("id")
    .eq("slug", productSlug)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  return data?.id ? String(data.id) : null;
}

async function fetchRelatedPosts(productSlug: string) {
  const db = supabase as any;
  const productId = await fetchProductIdBySlug(productSlug);
  if (!productId) return [];

  const { data, error } = await db
    .from("blog_post_products")
    .select("position,post:blog_posts(id,slug,title,excerpt,featured_image_url,featured_image_alt,published_at,read_time_minutes,category:blog_categories(name,slug))")
    .eq("product_id", productId)
    .order("position")
    .limit(6);
  if (error) throw error;
  return (data ?? [])
    .map((row: any) => row.post)
    .filter((post: any) => post?.id && post?.slug && post?.title)
    .slice(0, 3);
}

function dateLabel(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

export function ProductRelatedBlog({ productSlug }: { productSlug: string }) {
  const { data: posts = [], isLoading } = useQuery({
    queryKey: ["product-related-blog", productSlug],
    queryFn: () => fetchRelatedPosts(productSlug),
    enabled: !!productSlug,
    staleTime: 5 * 60_000,
  });

  if (isLoading) {
    return (
      <section className="mx-auto mt-14 max-w-7xl border-t border-border px-4 pt-9 sm:px-6 lg:px-8" aria-label="Conteúdos relacionados">
        <div className="h-6 w-56 animate-pulse rounded bg-secondary" />
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((item) => <div key={item} className="h-64 animate-pulse rounded-2xl bg-secondary" />)}
        </div>
      </section>
    );
  }

  if (!posts.length) return null;

  return (
    <section className="mx-auto mt-14 max-w-7xl border-t border-border px-4 pt-9 sm:px-6 lg:px-8" aria-labelledby="related-content-title">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            <BookOpen className="h-3.5 w-3.5" /> Conteúdo relacionado
          </p>
          <h2 id="related-content-title" className="mt-2 text-2xl font-semibold text-foreground sm:text-3xl">
            Aprenda mais antes de escolher
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Guias e dicas do blog relacionados a este produto e à sua rotina de beleza.
          </p>
        </div>
        <Link to="/blog" search={{} as never} className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-plum hover:text-primary">
          Ver blog <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {posts.map((post: any) => (
          <article key={post.id} className="group overflow-hidden rounded-2xl border border-border bg-card shadow-soft transition hover:-translate-y-1 hover:border-primary/30 hover:shadow-elegant">
            <Link to="/blog/$slug" params={{ slug: post.slug }} className="block h-full">
              <div className="aspect-[16/9] overflow-hidden bg-secondary">
                {post.featured_image_url ? (
                  <img
                    src={post.featured_image_url}
                    alt={post.featured_image_alt ?? post.title}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center bg-gradient-to-br from-secondary to-champagne/20">
                    <BookOpen className="h-7 w-7 text-primary/50" />
                  </div>
                )}
              </div>
              <div className="p-4">
                <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  {post.category?.name && <span className="font-semibold text-primary">{post.category.name}</span>}
                  {post.published_at && <span>{dateLabel(post.published_at)}</span>}
                  <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{Math.max(1, Number(post.read_time_minutes ?? 1))} min</span>
                </div>
                <h3 className="mt-2 line-clamp-2 text-base font-semibold leading-6 text-foreground group-hover:text-primary">{post.title}</h3>
                {post.excerpt && <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{post.excerpt}</p>}
                <span className="mt-4 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-plum">
                  Ler artigo <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-1" />
                </span>
              </div>
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
