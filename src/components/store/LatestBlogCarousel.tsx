import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BookOpen, Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { latestBlogPostsQuery } from "@/lib/blog";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";

function formatDate(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

export function LatestBlogCarousel() {
  const { data: posts = [] } = useQuery(latestBlogPostsQuery(6));
  const [api, setApi] = useState<CarouselApi>();
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (!api || paused || posts.length < 2) return;
    const timer = window.setInterval(() => api.scrollNext(), 5200);
    return () => window.clearInterval(timer);
  }, [api, paused, posts.length]);

  if (!posts.length) return null;

  return (
    <section
      className="mx-auto max-w-7xl px-4 pb-20 pt-12 sm:px-6 lg:px-8"
      aria-labelledby="home-blog-title"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-champagne/30 pb-4">
        <div>
          <p className="flex items-center gap-2 text-[11px] uppercase tracking-[0.32em] text-champagne">
            <BookOpen className="h-3.5 w-3.5" /> Conteúdo & beleza
          </p>
          <h2 id="home-blog-title" className="mt-2 text-3xl font-semibold text-foreground sm:text-4xl">
            Últimas do blog
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Guias, rotinas e escolhas de beleza para ajudar você a comprar e cuidar melhor.
          </p>
        </div>
        <Link
          to="/blog"
          search={{} as never}
          className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-plum transition hover:text-primary"
        >
          Ver todos <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <Carousel setApi={setApi} opts={{ loop: true, align: "start" }} className="px-0 sm:px-10">
        <CarouselContent>
          {posts.map((post) => (
            <CarouselItem key={post.id} className="md:basis-1/2 lg:basis-1/3">
              <article className="group h-full overflow-hidden rounded-2xl border border-border bg-card shadow-soft transition hover:-translate-y-1 hover:border-primary/30 hover:shadow-elegant">
                <Link to="/blog/$slug" params={{ slug: post.slug }} className="block">
                  <div className="aspect-[16/10] overflow-hidden bg-secondary">
                    {post.featured_image_url ? (
                      <img
                        src={post.featured_image_url}
                        alt={post.featured_image_alt ?? post.title}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.035]"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-gradient-to-br from-secondary via-background to-champagne/20">
                        <BookOpen className="h-9 w-9 text-primary/60" />
                      </div>
                    )}
                  </div>
                  <div className="p-5">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                      {post.category?.name && <span className="font-semibold text-primary">{post.category.name}</span>}
                      {post.published_at && <span>{formatDate(post.published_at)}</span>}
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {post.read_time_minutes} min
                      </span>
                    </div>
                    <h3 className="mt-3 line-clamp-2 text-xl font-semibold leading-tight text-foreground group-hover:text-primary">
                      {post.title}
                    </h3>
                    {post.excerpt && (
                      <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">{post.excerpt}</p>
                    )}
                    <span className="mt-5 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-plum">
                      Ler artigo <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                    </span>
                  </div>
                </Link>
              </article>
            </CarouselItem>
          ))}
        </CarouselContent>
        {posts.length > 1 && (
          <>
            <CarouselPrevious className="left-0 hidden border-primary/20 bg-background text-plum hover:bg-secondary sm:inline-flex" />
            <CarouselNext className="right-0 hidden border-primary/20 bg-background text-plum hover:bg-secondary sm:inline-flex" />
          </>
        )}
      </Carousel>
    </section>
  );
}
