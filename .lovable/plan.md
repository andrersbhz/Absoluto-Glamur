
# Home estilo Nuvemshop — blocos editáveis com drag-and-drop

Vou reestruturar a home e o painel de Marketing para replicar a experiência das lojas Nuvemshop de referência, mantendo tudo editável e reorganizável pelo admin.

## Nova estrutura da home (todos os blocos administráveis)

1. **Barra de anúncio** (topo) — texto + link editáveis, ativa/desativa.
2. **Hero banner full-width 100%** — imagem grande de fundo (upload), título, subtítulo, badge, CTA principal (link para produto ou coleção) e CTA secundário. Suporta versão desktop e mobile.
3. **Barra de vantagens (ícones)** — Frete grátis para todo Brasil · Até 12x no cartão · Compra segura · 5% de desconto no PIX. Ícones e textos configuráveis; ícones da lucide-react selecionáveis.
4. **Categorias em destaque** — grid de círculos/cards com imagem + nome + link.
5. **Best Sellers** — grade horizontal de produtos mais vendidos (auto-populada com override manual).
6. **Banner duplo (2 colunas)** — dois banners lado a lado (ex.: "Skincare" / "Maquiagem") com imagem + título + link.
7. **Nossos Queridinhos** — carrossel de produtos favoritos escolhidos manualmente por SKU/slug.
8. **Vantagens de comprar** — 3-4 blocos com ícone + título + texto (garantia, envio, atendimento, autenticidade).
9. **Banner promocional full-width** — imagem 100% com CTA (segunda oportunidade de destaque).
10. **Lançamentos / Novidades** — grade dos produtos mais recentes.
11. **Manifesto / Sobre a marca** — bloco editorial já existente, mantido.
12. **Newsletter** — captura de e-mail (opcional, ativa/desativa).
13. **Instagram / Selos de confiança** — grid de imagens com link (opcional).

## Painel administrativo (`/admin/marketing`)

- **Editor de blocos com drag-and-drop** (biblioteca `@dnd-kit/sortable`) — arrastar cards para reordenar; toggle "ativo"; botão "duplicar" e "remover".
- **Botão "Adicionar bloco"** com catálogo dos tipos acima; cada tipo abre um formulário específico (upload de imagem, campos de texto, seletor de produtos/coleções, seletor de ícone).
- **Preview lateral** ao vivo mostrando como fica na home.
- **Upload de imagens** via Supabase Storage (bucket público `homepage-media`) com conversão automática para WebP (já temos `image-webp.ts`).

## Backend / dados

- Reaproveitar a tabela `homepage_blocks` (já existe). Cada bloco tem `kind`, `position`, `data (jsonb)`, `is_active`.
- Novos `kind`: `announcement_bar`, `hero_fullwidth`, `benefits_bar`, `category_circles`, `best_sellers`, `banner_duo`, `product_carousel_favorites`, `advantages_grid`, `promo_fullwidth`, `latest_products`, `manifesto`, `newsletter`, `instagram_grid`.
- Criar bucket de storage `homepage-media` (público leitura, admin escrita).
- Migração para seed dos blocos padrão da nova home.

## Frontend

- Refatorar `src/routes/index.tsx` para renderizar dinamicamente a lista de blocos ordenados por `position`, cada `kind` mapeado para um componente React em `src/components/home/blocks/*`.
- Manter as escolhas de tipografia (Fraunces + Inter) e paleta atual da Absoluto Glamur — mesma sofisticação, layout no ritmo da Nuvemshop.
- Responsivo mobile-first, banners com aspect ratio adequado desktop/mobile.

## Detalhes técnicos

- Bibliotecas novas: `@dnd-kit/core`, `@dnd-kit/sortable`.
- Server functions em `src/lib/homepage-blocks.functions.ts` para create/update/delete/reorder.
- Upload usa o cliente Supabase autenticado (RLS já protege via role admin).
- SEO da home permanece com metadata do próprio `index.tsx`; banners passam `og:image` quando o primeiro hero tiver imagem absoluta.

## Fora do escopo desta entrega

- Editor visual "point-and-click" na própria home (só o painel).
- Versões A/B de blocos.
- Agendamento por data (blocos ligam/desligam manualmente).

Ao aprovar, começo pela migração dos novos `kind`, depois os componentes de bloco, e por fim o editor drag-and-drop.
