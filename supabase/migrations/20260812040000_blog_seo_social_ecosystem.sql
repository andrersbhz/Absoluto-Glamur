-- Absoluto Glamur · Blog SEO + distribuição social
-- Estrutura editorial, SEO, relacionamentos com produtos e log de publicação Meta.

create extension if not exists pgcrypto;

create table if not exists public.blog_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  seo_title text,
  meta_description text,
  is_active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.blog_categories(id) on delete set null,
  author_id uuid references auth.users(id) on delete set null,
  slug text not null unique,
  title text not null,
  excerpt text,
  content_html text not null default '',
  featured_image_url text,
  featured_image_alt text,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  published_at timestamptz,
  seo_title text,
  meta_description text,
  focus_keyword text,
  secondary_keywords text[] not null default '{}',
  tags text[] not null default '{}',
  canonical_url text,
  faq jsonb not null default '[]'::jsonb,
  seo_score integer not null default 0 check (seo_score between 0 and 100),
  seo_checks jsonb not null default '{}'::jsonb,
  word_count integer not null default 0,
  read_time_minutes integer not null default 1,
  social_caption_facebook text,
  social_caption_instagram text,
  social_hashtags text[] not null default '{}',
  ai_provider text,
  ai_model text,
  ai_prompt_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists blog_posts_public_idx
  on public.blog_posts(status, published_at desc);
create index if not exists blog_posts_category_idx
  on public.blog_posts(category_id, published_at desc);
create index if not exists blog_posts_focus_keyword_idx
  on public.blog_posts(lower(focus_keyword));

create table if not exists public.blog_post_products (
  post_id uuid not null references public.blog_posts(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  position integer not null default 0,
  primary key (post_id, product_id)
);
create index if not exists blog_post_products_product_idx
  on public.blog_post_products(product_id, post_id);

create table if not exists public.blog_post_revisions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.blog_posts(id) on delete cascade,
  title text not null,
  excerpt text,
  content_html text not null,
  seo_snapshot jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists blog_post_revisions_post_idx
  on public.blog_post_revisions(post_id, created_at desc);

create table if not exists public.blog_social_publications (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.blog_posts(id) on delete cascade,
  platform text not null check (platform in ('facebook','instagram')),
  status text not null default 'pending' check (status in ('pending','published','failed','skipped')),
  external_id text,
  external_url text,
  error text,
  payload jsonb not null default '{}'::jsonb,
  attempts integer not null default 0,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(post_id, platform)
);
create index if not exists blog_social_publications_status_idx
  on public.blog_social_publications(status, created_at desc);

create or replace function public.blog_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_blog_categories_updated_at on public.blog_categories;
create trigger trg_blog_categories_updated_at
before update on public.blog_categories
for each row execute function public.blog_touch_updated_at();

drop trigger if exists trg_blog_posts_updated_at on public.blog_posts;
create trigger trg_blog_posts_updated_at
before update on public.blog_posts
for each row execute function public.blog_touch_updated_at();

drop trigger if exists trg_blog_social_publications_updated_at on public.blog_social_publications;
create trigger trg_blog_social_publications_updated_at
before update on public.blog_social_publications
for each row execute function public.blog_touch_updated_at();

alter table public.blog_categories enable row level security;
alter table public.blog_posts enable row level security;
alter table public.blog_post_products enable row level security;
alter table public.blog_post_revisions enable row level security;
alter table public.blog_social_publications enable row level security;

-- O storefront lê somente conteúdo publicado/ativo. Escritas administrativas usam server functions/service role.
drop policy if exists "public read active blog categories" on public.blog_categories;
create policy "public read active blog categories"
on public.blog_categories for select
to anon, authenticated
using (is_active = true);

drop policy if exists "public read published blog posts" on public.blog_posts;
create policy "public read published blog posts"
on public.blog_posts for select
to anon, authenticated
using (status = 'published' and published_at is not null and published_at <= now());

drop policy if exists "public read published blog product links" on public.blog_post_products;
create policy "public read published blog product links"
on public.blog_post_products for select
to anon, authenticated
using (
  exists (
    select 1 from public.blog_posts p
    where p.id = blog_post_products.post_id
      and p.status = 'published'
      and p.published_at is not null
      and p.published_at <= now()
  )
);

-- Revisões e logs sociais nunca são públicos.
revoke all on public.blog_post_revisions from anon, authenticated;
revoke all on public.blog_social_publications from anon, authenticated;

grant select on public.blog_categories to anon, authenticated;
grant select on public.blog_posts to anon, authenticated;
grant select on public.blog_post_products to anon, authenticated;

-- Categorias editoriais iniciais alinhadas ao nicho da loja.
insert into public.blog_categories (name, slug, description, seo_title, meta_description, position)
values
  ('Skincare', 'skincare', 'Rotinas, ingredientes, cuidados e guias para uma pele bem cuidada.', 'Skincare: rotinas, cuidados e guias | Absoluto Glamur', 'Guias de skincare, rotinas e cuidados para escolher produtos de beleza com mais segurança e confiança.', 10),
  ('Cabelos', 'cabelos', 'Cuidados capilares, finalização, tratamentos e guias de produtos.', 'Cabelos: cuidados, tratamentos e produtos | Absoluto Glamur', 'Conteúdo sobre cuidados com os cabelos, tratamentos, finalização e produtos para diferentes necessidades.', 20),
  ('Maquiagem', 'maquiagem', 'Técnicas, tendências evergreen, escolhas de produtos e acabamento.', 'Maquiagem: dicas, técnicas e produtos | Absoluto Glamur', 'Dicas de maquiagem, técnicas, acabamentos e guias para escolher produtos que combinam com sua rotina.', 30),
  ('Guias de compra', 'guias-de-compra', 'Comparativos, checklists e critérios para escolher melhor.', 'Guias de compra de beleza | Absoluto Glamur', 'Guias de compra de cosméticos e beleza com critérios práticos para comparar e escolher produtos.', 40),
  ('Rotinas de beleza', 'rotinas-de-beleza', 'Conteúdos práticos para organizar cuidados e autocuidado.', 'Rotinas de beleza e autocuidado | Absoluto Glamur', 'Rotinas de beleza e autocuidado com passos práticos para pele, cabelos e maquiagem.', 50)
on conflict (slug) do nothing;

-- Integrações oficiais Meta. Credenciais permanecem vazias e devem ser informadas pelo administrador.
insert into public.integrations (provider, category, display_name, description, enabled, mode, config)
values
  ('facebook', 'marketing', 'Facebook Page', 'Publicação automática dos artigos do blog na Página da loja via Meta Graph API.', false, 'production', '{"page_id":"","graph_version":"v23.0","auto_publish_blog":true}'::jsonb),
  ('instagram', 'marketing', 'Instagram Business', 'Publicação automática dos artigos do blog no Instagram profissional via Meta Graph API.', false, 'production', '{"ig_user_id":"","graph_version":"v23.0","auto_publish_blog":true}'::jsonb)
on conflict (provider) do update set
  category = excluded.category,
  display_name = excluded.display_name,
  description = excluded.description;
