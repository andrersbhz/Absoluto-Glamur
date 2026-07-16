# Arquitetura — Bloom Cosméticos

## Stack

- Frontend: TanStack Start + React 19 + Vite 7 + Tailwind v4 + shadcn/ui.
- Backend gerenciado: Lovable Cloud (Supabase Postgres + Auth + Storage + Edge Functions + Realtime).
- Server logic interna: `createServerFn` (TanStack). Nenhuma Edge Function para lógica app-interna; Edge Functions apenas para webhooks/integrações externas (Fases 3, 4, 6).

## Decisões estruturais

### Fila de jobs sem Redis
- Tabela `background_jobs` no Postgres (Fase 4 em diante) processada por Edge Function worker + `pg_cron`.
- Preparada para migração futura para BullMQ + Redis sem recriar o schema.

### Mídias
- Descoberta AliExpress: apenas URLs originais em `product_media` (Fase 4).
- Cópia para Supabase Storage só quando: produto adicionado à loja, campanha, ou solicitação manual.
- Vídeos grandes: URL externa até habilitar Cloudflare R2 (Fase futura).
- Compressão + WebP + miniatura via Edge Function ao espelhar.

### Realtime
- Ativado apenas em: `orders`, `payments`, `background_jobs`, `product_inventory` (durante checkout).
- Não usado em catálogo, logs, dashboards.

### Segurança
- RLS obrigatório em toda tabela pública.
- Roles em tabela separada (`user_roles`) — nunca em `profiles` (evita escalada de privilégio).
- Função `has_role()` e `is_admin()` como `SECURITY DEFINER` com `search_path` fixo, EXECUTE só para `authenticated`.
- Nenhum service role no browser. Uso apenas dentro de handlers server-side.

### Escalabilidade / futuro
- NestJS/Redis/BullMQ podem ser adicionados como camada opcional — o banco permanece a fonte de verdade.
- Schema versionado por migrations SQL do Lovable Cloud.

## Módulos por fase

| Fase | Módulo | Status |
| --- | --- | --- |
| 1 | Fundação (Auth, roles, design) | Concluída |
| 2 | Catálogo, busca, carrinho | Pendente |
| 3 | Checkout, endereços, PIX (Asaas) | Pendente |
| 4 | Importador AliExpress + fila | Pendente |
| 5 | Inteligência de produtos + precificação | Pendente |
| 6 | Google Merchant + Meta Catalog + campanhas | Pendente |
| 7 | OpenAI + Gemini (via Edge Functions) | Pendente |
| 8 | Dashboard executivo + compliance + monitor free-tier | Pendente |
