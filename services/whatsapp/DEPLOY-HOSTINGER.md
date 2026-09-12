# Deploy do serviço WhatsApp (Baileys) na Hostinger

Este serviço precisa rodar 24/7 em um servidor com Docker (VPS Hostinger). Ele faz a
conexão com o WhatsApp Web via QR Code e guarda a sessão em um volume, então o QR
só é pedido na primeira vez.

## 1. Pré-requisito

- Um **VPS Hostinger** (qualquer plano KVM) com Ubuntu 22.04/24.04.
  Hospedagem compartilhada "Web/Premium" NÃO funciona — precisa ser VPS com Docker.

## 2. Instalar Docker no VPS

```bash
ssh root@SEU_IP_DO_VPS
curl -fsSL https://get.docker.com | sh
```

## 3. Enviar o código do worker

Opção A (git, recomendado):

```bash
cd /opt
git clone <url-do-seu-repositorio-github> app
cd app/services/whatsapp
```

Opção B (upload): envie a pasta `services/whatsapp` para `/opt/whatsapp` com `scp`
ou pelo gerenciador de arquivos do painel.

## 4. Criar o arquivo .env

```bash
cd /opt/app/services/whatsapp   # ou /opt/whatsapp
cp .env.example .env
nano .env
```

Gere o token compartilhado:

```bash
openssl rand -hex 32
```

Preencha no `.env`:

| Variável | Valor |
|---|---|
| `SUPABASE_URL` | `https://bnbksevtmbmlirnwglqb.supabase.co` |
| `SUPABASE_SECRET_KEY` | a chave secreta do banco (já configurada no projeto Lovable) |
| `WHATSAPP_SERVICE_TOKEN` | o valor do `openssl rand -hex 32` |
| `WHATSAPP_AI_ENABLED` | `true` |
| `OPENAI_API_KEY` | sua chave da OpenAI |

> Guarde o valor de `WHATSAPP_SERVICE_TOKEN` — o mesmo valor precisa ser salvo
> na loja (o assistente abre um formulário seguro para isso).

## 5. Subir o serviço

```bash
docker compose up -d --build
docker compose logs -f   # acompanhe até aparecer "QR" ou "conectado"
```

A sessão fica no volume `whatsapp_auth` — reiniciar o container NÃO pede QR de novo.

## 6. Expor com HTTPS (recomendado)

Aponte um subdomínio, ex.: `whatsapp.absolutoglamur.com.br`, para o IP do VPS
(registro A no DNS). No VPS, instale o Caddy:

```bash
apt install -y caddy
cat > /etc/caddy/Caddyfile <<'EOF'
whatsapp.absolutoglamur.com.br {
    reverse_proxy 127.0.0.1:8787
}
EOF
systemctl reload caddy
```

O Caddy emite o certificado HTTPS automaticamente. A URL final do serviço será:

```
https://whatsapp.absolutoglamur.com.br
```

Alternativa rápida (menos segura): liberar a porta 8787 no firewall e usar
`http://IP_DO_VPS:8787` — nesse caso mude `ports:` no docker-compose para
`"8787:8787"`.

## 7. Conectar na loja

Com a URL em mãos, avise o assistente no chat do Lovable informando a URL do
serviço. Ele configura `WHATSAPP_SERVICE_URL` e abre o formulário seguro para
você salvar o `WHATSAPP_SERVICE_TOKEN` (o mesmo do passo 4).

Depois disso, acesse **Admin → Atendimento WhatsApp**, clique em conectar e
escaneie o QR Code com o celular (WhatsApp → Aparelhos conectados).
