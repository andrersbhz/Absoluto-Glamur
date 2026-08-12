import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, BookOpen, Clock } from "lucide-react";
import { StoreLayout } from "@/components/store/StoreLayout";
import { blogPostQuery } from "@/lib/blog";
import { sanitizeBlogHtml } from "@/lib/blog-utils";

const BASE_URL = "https://absolutoglamur.com.br";

export const Route = createFileRoute("/blog/$slug")({
  loader: async ({ params, context }) => {
    const post = await context.queryClient.ensureQueryData(blogPostQuery(params.slug));
    if (!post) throw notFound();
    return { post };
  },
  head: ({ loaderData }) => {
    if (!loaderData?.post) {
      return { meta: [{ title: "Artigo não encontrado · Absoluto Glamur" }, { name: "robots", content: "noindex" }] };
    }
    const post = loaderData.post;
    const url = post.canonical_url || `${BASE_URL}/blog/${post.slug}`;
    const description = post.meta_description ?? post.excerpt ?? post.title;
    const articleSchema = {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: post.title,
      description,
      image: post.featured_image_url ? [post.featured_image_url] : undefined,
      datePublished: post.published_at ?? undefined,
      dateModified: post.updated_at,
      mainEntityOfPage: { "@type": "WebPage", "@id": url },
      author: { "@type": "Organization", name: "Absoluto Glamur", url: BASE_URL },
      publisher: { "@type": "Organization", name: "Absoluto Glamur", url: BASE_URL },
      articleSection: post.category?.name ?? undefined,
      keywords: [post.focus_keyword, ...post.secondary_keywords, ...post.tags].filter(Boolean).join(", ") || undefined,
    };
    const breadcrumbSchema = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Início", item: BASE_URL },
        { "@type": "ListItem", position: 2, name: "Blog", item: `${BASE_URL}/blog` },
        ...(post.category
          ? [{ "@type": "ListItem", position: 3, name: post.category.name, item: `${BASE_URL}/blog?categoria=${post.category.slug}` }]
          : []),
        { "@type": "ListItem", position: post.category ? 4 : 3, name: post.title, item: url },
      ],
    };
    const faqSchema = post.faq.length >= 2
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: post.faq.map((item) => ({
            "@type": "Question",
            name: item.question,
            acceptedAnswer: { "@type": "Answer", text: item.answer },
          })),
        }
      : null;

    return {
      meta: [
        { title: post.seo_title ?? `${post.title} · Absoluto Glamur` },
        { name: "description", content: description },
        { property: "og:title", content: post.seo_title ?? post.title },
        { property: "og:description", content: description },
        { property: "og:type", content: "article" },
        { property: "og:url", content: url },
        ...(post.featured_image_url
          ? [
              { property: "og:image", content: post.featured_image_url },
              { name: "twitter:card", content: "summary_large_image" },
              { name: "twitter:image", content: post.featured_image_url },
            ]
          : []),
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        { type: "application/ld+json", children: JSON.stringify(articleSchema) },
        { type: "application/ld+json", children: JSON.stringify(breadcrumbSchema) },
        ...(faqSchema ? [{ type: "application/ld+json", children: JSON.stringify(faqSchema) }] : []),
      ],
    };
  },
  notFoundComponent: () => (
    <StoreLayout>
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <BookOpen className="mx-auto h-8 w-8 text-primary/50" />
        <h1 className="mt-4 text-3xl font-semibold">Artigo não encontrado</h1>
        <Link to="/blog" search={{} as never} className="mt-6 inline-flex rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">
          Ir para o blog
        </Link>
      </div>
    </StoreLayout>
  ),
  component: BlogPostPage,
});

function formatDate(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(value));
}

function BlogPostPage() {
  const { slug } = Route.useParams();
  const { data: post } = useQuery(blogPostQuery(slug));
  if (!post) return null;
  const safeHtml = sanitizeBlogHtml(post.content_html);

  return (
    <StoreLayout>
      <article>
        <header className="border-b border-border bg-gradient-to-br from-secondary via-background to-champagne/10">
          <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:py-16">
            <Link to="/blog" search={{} as never} className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-plum hover:text-primary">
              <ArrowLeft className="h-3.5 w-3.5" /> Blog
            </Link>
            <div className="mt-8 flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
              {post.category && (
                <Link to="/blog" search={{ categoria: post.category.slug } as never} className="font-semibold text-primary hover:text-berry">
                  {post.category.name}
                </Link>
              )}
              <span>{formatDate(post.published_at)}</span>
              <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {post.read_time_minutes} min de leitura</span>
            </div>
            <h1 className="mt-4 text-4xl font-semibold leading-[1.08] text-foreground sm:text-5xl lg:text-6xl">{post.title}</h1>
            {post.excerpt && <p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground">{post.excerpt}</p>}
          </div>
        </header>

        {post.featured_image_url && (
          <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6">
            <img
              src={post.featured_image_url}
              alt={post.featured_image_alt ?? post.title}
              fetchPriority="high"
              className="aspect-[16/8] w-full rounded-3xl object-cover shadow-soft"
            />
          </div>
        )}

        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:py-16">
          <div>
            <div className="blog-prose" dangerouslySetInnerHTML={{ __html: safeHtml }} />

            {post.faq.length > 0 && (
              <section className="mt-14 border-t border-border pt-10" aria-labelledby="faq-title">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Dúvidas frequentes</p>
                <h2 id="faq-title" className="mt-2 text-3xl font-semibold">Perguntas sobre o tema</h2>
                <div className="mt-6 space-y-3">
                  {post.faq.map((item, index) => (
                    <details key={`${item.question}-${index}`} className="group rounded-2xl border border-border bg-card p-5">
                      <summary className="cursor-pointer list-none pr-6 text-base font-semibold text-foreground marker:hidden">
                        {item.question}
                      </summary>
                      <p className="mt-3 text-sm leading-7 text-muted-foreground">{item.answer}</p>
                    </details>
                  ))}
                </div>
              </section>
            )}
          </div>

          <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
            {post.related_products.length > 0 && (
              <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Produtos relacionados</p>
                <div className="mt-4 space-y-4">
                  {post.related_products.slice(0, 5).map((product) => (
                    <Link
                      key={product.id}
                      to="/$categoria/$produto"
                      params={{ categoria: product.category_slug, produto: product.slug }}
                      className="group flex gap-3"
                    >
                      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-secondary">
                        {product.image_url ? (
                          <img src={product.image_url} alt={product.name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                        ) : null}
                      </div>
                      <div className="min-w-0 pt-1">
                        <p className="line-clamp-2 text-sm font-semibold leading-5 text-foreground group-hover:text-primary">{product.name}</p>
                        <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-plum">
                          Ver produto <ArrowRight className="h-3 w-3" />
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-2xl bg-gradient-to-br from-plum via-berry to-primary p-6 text-white shadow-elegant">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-champagne">Absoluto Glamur</p>
              <p className="mt-3 text-xl font-semibold">Continue explorando sua rotina de beleza.</p>
              <Link to="/products" search={{} as never} className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-plum">
                Ver produtos <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </aside>
        </div>
      </article>
    </StoreLayout>
  );
}
