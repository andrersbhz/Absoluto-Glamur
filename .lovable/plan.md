
## Objetivo

Analisei a documentação da **NuPay for Business (Nubank)**: é uma API baseada em sessões — o comprador é redirecionado ao app do Nubank, aprova o pagamento, volta pra loja, e o status é atualizado em tempo real via **webhook** (`callbackUrl`) enviado pela NuPay a cada mudança da sessão/pagamento. Autenticação via headers `X-Merchant-Key` + `X-Merchant-Token`.

Vou adicionar NuPay ao painel de Integrações e refatorar o checkout para suportar **múltiplos gateways por método** (PIX, cartão, Nubank redirect), permitindo configuração híbrida — ex.: PIX pelo Asaas + cartão pela Stripe + botão "Pagar com Nubank" via NuPay.

## Escopo

### 1. Banco de dados (migration)
- Adicionar novas linhas em `integrations`: `nupay` (categoria `payments`), `stripe`, `mercadopago` (placeholders — ativados quando o admin colar as chaves).
- Nova tabela `payment_method_routing` — mapeia cada método (`pix`, `credit_card`, `boleto`, `nubank_redirect`) ao provedor ativo escolhido pelo admin. Uma linha por método, com `provider` e `enabled`. Isso é o coração da configuração híbrida.
- Estender `payments`: coluna `session_id` (para NuPay), `approval_code`, `redirect_url`. Estender enum de métodos com `nubank_redirect` e `credit_card`.
- GRANTs + RLS (leitura só admin, escrita só admin/superadmin).

### 2. Backend — server functions e rotas
- `src/lib/nupay.server.ts` — cliente HTTP para `sandbox-api.spinpay.com.br` / `api.spinpay.com.br` com os headers de auth.
- `src/lib/checkout.functions.ts` — refatorar `createPixCheckout` em `createCheckout({ method })` que:
  1. Lê `payment_method_routing` pra descobrir o provedor daquele método.
  2. Cria o pedido no banco (lógica atual).
  3. Delega ao adaptador do provedor (Asaas PIX, NuPay session, Stripe intent…).
  4. Retorna `{ orderId, code, redirectUrl?, pixQrCode? }` — a página de checkout já sabe renderizar QR ou redirecionar.
- `src/routes/api/public/webhooks/nupay.ts` — nova rota pública que valida o `webhook_token` da integração, mapeia `status` NuPay (`approved`/`completed`/`canceled`/`expired`) pro status interno do pedido em tempo real e grava evento em `payment_events`.
- `src/routes/_authenticated/checkout.return.tsx` — landing de retorno do app Nubank (`returnUrl`): lê `sessionId` da query, chama `GET /sessions/{id}`, cria o pagamento via `POST /payments` e redireciona pra `/checkout/{orderId}`.
- `listIntegrations`/`testIntegration` — adicionar caso `nupay` (chama `/v1/checkouts/sessions/by-reference/health-check` só pra validar auth).

### 3. Frontend
- **Admin › Integrações**: cards novos pra NuPay/Stripe/Mercado Pago aparecem automaticamente (já é dinâmico). NuPay ganha campo extra pra `X-Merchant-Token` (além da API key). URL de webhook exibida pra copiar.
- **Admin › Integrações › aba "Roteamento de métodos"**: nova seção com uma linha por método de pagamento e um `<select>` do provedor ativo pra aquele método. É onde se monta o setup híbrido.
- **Loja › Checkout** (`src/routes/_authenticated/checkout.tsx`): 
  - Novo passo "Forma de pagamento" que consulta os métodos habilitados no roteamento e mostra as opções (PIX, Cartão, Nubank).
  - Submit chama `createCheckout({ method })`; se voltar `redirectUrl`, faz `window.location = redirectUrl`; senão exibe QR (fluxo atual).
- **Loja › `/checkout/return`**: tela intermediária mostrando "Confirmando com Nubank…" enquanto o backend cria o payment.

### 4. Segurança
- Webhook NuPay valida `webhook_token` da integração no header customizado + timing-safe compare.
- Chaves nunca no cliente — todas as chamadas passam pelos server functions com service role, igual ao padrão atual.
- RLS: `payment_method_routing` só leitura/escrita por admin.

### 5. Documentação
- Atualizar `docs/PHASES.md` com a mudança de arquitetura multi-gateway.
- `docs/ENV.md` — anotar que as chaves de NuPay/Stripe/MP são persistidas na tabela `integrations`, não em env vars.

## Fora do escopo desta entrega
- Implementação real dos adaptadores Stripe e Mercado Pago — a estrutura fica pronta (cards no painel, roteamento, tabela), mas as chamadas efetivas ficam como placeholder ("Configuração aceita, integração ativada em breve") pra não misturar 3 gateways novos numa entrega só. Se quiser Stripe/MP funcionais agora, é só pedir na sequência.
- Split de pagamento (rachar 1 pedido entre 2 gateways) — o híbrido aqui é **por método**, não por transação.

## Ordem de execução
1. Migration (integrations + routing + payments extension).
2. `nupay.server.ts` + refactor de `checkout.functions.ts` com sistema de adaptadores.
3. Webhook `/api/public/webhooks/nupay` + rota de retorno.
4. UI de roteamento no painel de integrações.
5. Seletor de método no checkout da loja.
6. Teste ponta a ponta em sandbox.
