import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Clock, Search } from "lucide-react";
import { z } from "zod";
import { StoreLayout } from "@/components/store/StoreLayout";
import { blogCategoriesQuery, blogPostsQuery } from "@/lib/blog";

const SearchSchema = z.object({
  categoria: z.string().optional().catch(undefined),
  q: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/blog")({
  validateSearch: (search) => SearchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Blog de beleza, skincare, cabelos e maquiagem · Absoluto Glamur" },
      {
        name: "description",
        content:
          "Guias de beleza, skincare, cabelos, maquiagem, rotinas e comparativos para escolher cosméticos e produtos com mais confiança.",
      },
      { property: "og:title", content: "Blog de beleza · Absoluto Glamur" },
      {
        property: "og:description",
        content: "Guias práticos de skincare, cabelos, maquiagem e compras de beleza.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://absolutoglamur.com.br/blog" },
    ],
    links: [{ rel: "canonical", href: "https://absolutoglamur.com.br/blog" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Blog",
          name: "Blog Absoluto Glamur",
          url: "https://absolutoglamur.com.br/blog",
          description: "Conteúdo de beleza, skincare, cabelos, maquiagem e guias de compra.",
          publisher: { "@type": "Organization", name: "Absoluto Glamur", url: "https://absolutoglamur.com.br" },
        }),
      },
    ],
  }),
  component: BlogIndexPage,
});

function formatDate(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(value));
}

function BlogIndexPage() {
  const search = Route.useSearch();
  const { data: categories = [] } = useQuery(blogCategoriesQuery());
  const { data: posts = [], isLoading } = useQuery(
    blogPostsQuery({ category: search.categoria, search: search.q, limit: 36 }),
  );

  return (
    <StoreLayout>
      <section className="border-b border-border bg-gradient-to-br from-secondary via-background to-champagne/10">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.28em] text-primary">
            <BookOpen className="h-4 w-4" /> Conteúdo Absoluto Glamur
          </p>
          <h1 className="mt-4 max-w-4xl text-4xl font-semibold leading-tight text-foreground sm:text-5xl lg:text-6xl">
            Beleza com informação para escolher melhor.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground">
            Rotinas, comparativos, dúvidas frequentes e guias de produtos conectados ao catálogo da loja.
          </p>

          <form method="get" action="/blog" className="mt-8 flex max-w-xl gap-2">
            <label className="relative flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                name="q"
                defaultValue={search.q ?? ""}
                placeholder="Buscar no blog"
                className="h-12 w-full rounded-full border border-border bg-card pl-11 pr-4 text-sm outline-none focus:border-primary"
              />
            </label>
            <button type="submit" className="rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground hover:bg-berry">
              Buscar
            </button>
          </form>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <nav className="flex flex-wrap gap-2" aria-label="Categorias do blog">
          <Link
            to="/blog"
            search={{ q: search.q } as never}
            className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition ${
              !search.categoria ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-plum hover:border-primary/40"
            }`}
          >
            Todos
          </Link>
          {categories.map((category) => (
            <Link
              key={category.id}
              to="/blog"
              search={{ categoria: category.slug, q: search.q } as never}
              className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition ${
                search.categoria === category.slug
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-plum hover:border-primary/40"
              }`}
            >
              {category.name}
            </Link>
          ))}
        </nav>

        {isLoading ? (
          <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((item) => (
              <div key={item} className="h-[360px] animate-pulse rounded-2xl bg-secondary" />
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="py-24 text-center">
            <BookOpen className="mx-auto h-8 w-8 text-primary/50" />
            <h2 className="mt-4 text-2xl font-semibold">Nenhum artigo encontrado</h2>
            <p className="mt-2 text-sm text-muted-foreground">Tente outra categoria ou termo de busca.</p>
          </div>
        ) : (
          <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <article key={post.id} className="group overflow-hidden rounded-2xl border border-border bg-card shadow-soft transition hover:-translate-y-1 hover:border-primary/30 hover:shadow-elegant">
                <Link to="/blog/$slug" params={{ slug: post.slug }} className="block h-full">
                  <div className="aspect-[16/10] overflow-hidden bg-secondary">
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
                        <BookOpen className="h-9 w-9 text-primary/50" />
                      </div>
                    )}
                  </div>
                  <div className="p-6">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                      {post.category?.name && <span className="font-semibold text-primary">{post.category.name}</span>}
                      <span>{formatDate(post.published_at)}</span>
                      <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{post.read_time_minutes} min</span>
                    </div>
                    <h2 className="mt-3 line-clamp-2 text-2xl font-semibold leading-tight group-hover:text-primary">{post.title}</h2>
                    {post.excerpt && <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">{post.excerpt}</p>}
                    <span className="mt-5 inline-block text-xs font-semibold uppercase tracking-[0.16em] text-plum">Ler artigo →</span>
                  </div>
                </Link>
              </article>
            ))}
          </div>
        )}
      </div>
    </StoreLayout>
  );
}
