# Variáveis de ambiente

## Já configuradas (Lovable Cloud)

Estas são injetadas automaticamente pelo Lovable Cloud e usadas pelo cliente Supabase gerado. Não precisam ser adicionadas manualmente.

| Variável | Escopo | Uso |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Cliente | URL do projeto (browser) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Cliente | Chave pública (browser) |
| `VITE_SUPABASE_PROJECT_ID` | Cliente | ID do projeto |
| `SUPABASE_URL` | Server | URL para server functions |
| `SUPABASE_PUBLISHABLE_KEY` | Server | Chave pública server-side |
| `SUPABASE_SERVICE_ROLE_KEY` | Server | Service role — só uso privilegiado, nunca no browser |
| `LOVABLE_API_KEY` | Server | Acesso ao Lovable AI Gateway (Fase 7) |

## A serem adicionadas nas próximas fases

### Fase 3 — Pagamentos
- `ASAAS_API_KEY` — cadastrada via `add_secret` no momento da Fase 3.
- (opcional) `MERCADOPAGO_ACCESS_TOKEN`.

### Fase 4 — AliExpress
- `ALIEXPRESS_APP_KEY`
- `ALIEXPRESS_APP_SECRET`
- `ALIEXPRESS_REFRESH_TOKEN` (renovado periodicamente por Edge Function).

### Fase 6 — Google / Meta
- `GOOGLE_ADS_DEVELOPER_TOKEN`
- `GOOGLE_MERCHANT_ID`
- `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET`
- `META_APP_ID` / `META_APP_SECRET` / `META_SYSTEM_USER_TOKEN`
- `META_CATALOG_ID` / `META_PIXEL_ID` / `META_CAPI_TOKEN`

### Fase 7 — IA
- `OPENAI_API_KEY` (opcional; por padrão usaremos Lovable AI Gateway com `LOVABLE_API_KEY`)
- `GEMINI_API_KEY` (opcional)

### Futuro (armazenamento pesado)
- `CLOUDFLARE_R2_ACCESS_KEY_ID`
- `CLOUDFLARE_R2_SECRET_ACCESS_KEY`
- `CLOUDFLARE_R2_BUCKET`

## Boas práticas

- Nunca coloque uma chave secreta em código do browser.
- Chaves com prefixo `VITE_` são públicas por definição.
- Segredos server-side só são lidos dentro de `createServerFn().handler(...)` ou de rotas server (`/api/*`), nunca no escopo de módulo de arquivos compartilhados.
