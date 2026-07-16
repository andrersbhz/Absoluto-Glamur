
# Fase 1 — Fundação

O Lovable Cloud (banco/auth/storage/functions gerenciados no plano gratuito) já foi ativado neste projeto. Nesta fase entrego apenas a fundação — sem catálogo, checkout, integrações externas nem IA (essas são as Fases 2–8 do seu briefing).

## O que será implementado

### 1. Banco de dados (migration SQL versionada)
- `app_role` enum: `superadmin, admin, catalog, marketing, finance, support, logistics, analyst, compliance, customer`.
- `profiles` — 1:1 com `auth.users` (nome, telefone, avatar, criado em, atualizado em). Trigger `handle_new_user` cria perfil no signup.
- `user_roles` — vínculo user→role (tabela separada, nunca role em profiles).
- `permissions` + `role_permissions` — permissões nomeadas por role (editáveis).
- `audit_logs` — auditoria de ações administrativas.
- `user_sessions` — metadados de sessão (device, ip_hash, revogada).
- Função `has_role(_user_id, _role)` `SECURITY DEFINER` para uso em policies (evita recursão).
- RLS habilitado + GRANTs corretos em todas as tabelas públicas.
- Policies: cliente lê/edita apenas o próprio profile; admin lê tudo via `has_role`; roles só editáveis por superadmin/admin.

### 2. Autenticação
- Login com e-mail/senha + Google (via `lovable.auth.signInWithOAuth`) — padrão do Lovable Cloud.
- Cadastro com verificação de e-mail.
- Recuperação de senha (`/auth/forgot`) + página `/auth/reset-password`.
- Sessão persistente, `onAuthStateChange` no root, logout com limpeza de cache.
- Rota `/auth` pública; subtree `_authenticated/` protegido pelo gate gerenciado.

### 3. Design system (paleta feminina premium do briefing)
- Tokens semânticos em `src/styles.css` (oklch): fundo `#FFF8F7`, rosa berry `#C64B76`, ameixa `#6D405F`, lavanda `#A890AE`, champagne `#D7B47A`, etc.
- Fontes: serif elegante para display (Fraunces) + sans neutro (Inter) via `<link>` no root.
- Tokens de sombra suave, borda 8–10px, gradientes sutis.
- Variantes shadcn (`button`, `card`, `input`, `badge`, `toast`) alinhadas aos tokens.
- Skeletons, estados vazios, toasts globais (sonner).

### 4. Layouts
- `StoreLayout` — header (logo, busca placeholder, favoritos, conta, carrinho), footer (categorias, políticas, newsletter placeholder).
- `AdminLayout` (rota `/_authenticated/admin`) — sidebar com seções da Fase 2–8 (marcadas como "em breve"), topbar com usuário/role.
- Placeholders de rotas para as fases seguintes já criados (Catálogo, Pedidos, Marketing, IA, Dashboard, Uso do plano gratuito) mostrando "Fase X — não implementado".

### 5. Rotas iniciais
- `/` — home da loja (hero + seções placeholder governadas pelo `homepage_blocks` que virá na Fase 2; hoje mostra hero + CTA).
- `/auth`, `/auth/forgot`, `/auth/reset-password`.
- `/_authenticated/account` — minha conta (edita profile).
- `/_authenticated/admin` — dashboard admin básico com card de boas-vindas + navegação para as próximas fases.
- `/404`.

### 6. Documentação
- `docs/ENV.md` — variáveis (públicas VITE_* já presentes; segredos futuros das Fases 4/6/7/13/14).
- `docs/ARCHITECTURE.md` — decisões (fila em Postgres, sem Redis/NestJS, R2 futuro, mídias por URL até publicação).
- `docs/PHASES.md` — checklist das Fases 2–8 mapeando o briefing.

## O que NÃO será implementado agora (Fases 2–8)
Catálogo, importador AliExpress, inteligência de produtos, precificação, carrinho, PIX/Asaas, Google/Meta, OpenAI/Gemini, dashboard de métricas, monitor do plano gratuito, fila de jobs, realtime, compliance, backup. Cada uma dessas será uma entrega própria após a Fase 1 estar validada — o schema já é preparado para receber cada uma sem recriar nada.

## Detalhes técnicos

- Stack: TanStack Start + React 19 + Tailwind v4 + shadcn/ui + Supabase gerenciado (Lovable Cloud).
- Server functions só onde precisar de service role (nada na Fase 1 além do trigger `handle_new_user`).
- `_authenticated/route.tsx` é gerenciado pela integração — não editado.
- Google OAuth ativado via `supabase--configure_social_auth` na mesma migration.
- Nenhuma chave secreta no front. `SUPABASE_SERVICE_ROLE_KEY` só server-side (não usada nesta fase).

Após aprovação, entrego a Fase 1 completa em um único passo e paramos para você validar antes de eu abrir a Fase 2 (Catálogo).
