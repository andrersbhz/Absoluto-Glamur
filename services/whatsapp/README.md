# Absoluto Glamur — WhatsApp QR Worker

Serviço Node separado da loja para manter uma sessão do WhatsApp Web conectada 24/7 via QR Code usando Baileys.

## Requisitos

- Node.js 22+ ou Docker
- Acesso ao projeto Supabase da Absoluto Glamur
- Uma chave server-only do Supabase (`SUPABASE_SECRET_KEY` ou, temporariamente, `SUPABASE_SERVICE_ROLE_KEY`)
- Um token aleatório forte em `WHATSAPP_SERVICE_TOKEN`
- Opcional: `OPENAI_API_KEY` para respostas automáticas

## Banco de dados

Aplicar primeiro a migration:

`supabase/migrations/20260912004500_whatsapp_web_worker.sql`

Ela adiciona o ID da mensagem do provedor e os índices necessários para a fila/contatos.

## Configuração

Copie `.env.example` para `.env` e preencha apenas no servidor. Nunca envie o `.env` real ao Git.

Variáveis principais:

- `WHATSAPP_SERVICE_TOKEN`: segredo compartilhado entre a loja e este worker
- `SUPABASE_URL`: URL do projeto Supabase
- `SUPABASE_SECRET_KEY`: chave secreta do backend
- `WHATSAPP_AUTH_DIR`: pasta persistente da sessão (padrão `.wa-auth`)
- `WHATSAPP_AI_ENABLED=true`: habilita a resposta automática enquanto a conversa estiver em `waiting`
- `OPENAI_API_KEY`: chave da OpenAI server-only
- `OPENAI_MODEL`: modelo usado pelo bot
- `STOREFRONT_URL=https://absolutoglamur.com.br`

Na aplicação principal, configurar também:

- `WHATSAPP_SERVICE_URL=https://whatsapp.seudominio.com`
- `WHATSAPP_SERVICE_TOKEN=<o mesmo token do worker>`

## Docker/VPS

```bash
git clone https://github.com/andrersbhz/Absoluto-Glamur.git
cd Absoluto-Glamur/services/whatsapp
cp .env.example .env
# edite .env antes de iniciar
docker compose up -d --build
```

A sessão fica no volume Docker `whatsapp_auth`, então reiniciar o container não exige novo QR Code.

## Reverse proxy

Exponha o worker somente por HTTPS, por exemplo em `whatsapp.absolutoglamur.com.br`, encaminhando para `127.0.0.1:8787`. O endpoint `/health` é público e retorna apenas o estado operacional; `/status`, `/restart` e `/logout` exigem Bearer token.

## Primeiro pareamento

1. Abra Admin → Atendimento WhatsApp.
2. O painel consulta `/status` por uma server function, sem expor o token ao navegador.
3. Quando o worker estiver em `qr`, o QR aparece no painel.
4. No celular: WhatsApp → Aparelhos conectados → Conectar aparelho.
5. Escaneie o QR.
6. O painel deve mudar para `connected` e exibir o número conectado.

## Funcionamento

- Mensagens recebidas entram em `whatsapp_messages` como `inbound/received`.
- Se não existir conversa ativa, é criada uma em `waiting`.
- Com IA habilitada, o bot responde apenas enquanto a conversa estiver em `waiting`.
- Ao clicar em Atender, a conversa muda para `in_service` e a IA deixa de responder.
- Mensagens manuais e da IA entram como `outbound/pending`; o worker envia e altera para `sent` ou `failed`.

## Observação

Esta integração usa WhatsApp Web/Baileys e não a API oficial da Meta. Mudanças no WhatsApp podem exigir atualização do Baileys e a conta pode sofrer desconexões/restrições. Evite disparos em massa e automações agressivas.
