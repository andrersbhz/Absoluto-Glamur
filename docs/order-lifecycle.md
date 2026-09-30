# Pedidos, pagamentos e atendimento

Fluxo da loja: pedido recebido / aguardando pagamento → pagamento em validação (Pix manual) → pagamento concluído → em separação → despachado com rastreio → entregue.

- “Já fiz o Pix” comunica o pagamento à equipe. Não aprova o pedido. O administrador confere o extrato e confirma, ou o gateway confirma automaticamente.
- A separação exige pagamento confirmado. O despacho exige separação e rastreio. Criar um pedido no AliExpress não significa que a encomenda foi postada.
- A página do cliente continua reconhecendo o pagamento nas etapas de separação, despacho e entrega. Não exibe QR Code para pedidos cancelados, reembolsados ou com falha.
- Histórico mostra cada etapa e as ocorrências de transporte: trânsito, alfândega, retirada, saída para entrega, tentativa sem sucesso, devolução e entrega.
- A entrega automática depende de webhook 17TRACK assinado com status `Delivered`. Previsão de entrega ou etiqueta criada não confirma recebimento.
- E-mails: pedido aguardando pagamento, pagamento em conferência, pagamento concluído, separação, despacho, entrega, cancelamento, reembolso confirmado e falha. No despacho, código e link são enviados no corpo e em anexo TXT.
- WhatsApp vem de `site_settings.social_links.whatsapp`. Sem link válido, o e-mail orienta também a responder ao remetente; não se inventa um número.

## Ativação obrigatória antes de publicar esta versão

1. Aplique `supabase/migrations/20260929233407_order_lifecycle_notifications.sql` no projeto **bnbksevtmbmlirnwglqb**. Nenhuma coluna preexistente é removida; pedidos antigos recebem histórico do status atual, sem disparos retroativos.
2. Publique o código apenas depois da migration. Sem ela, o painel e o checkout não conseguem consultar os novos campos.
3. Em Admin → E-mail, configure e teste o SMTP. O envio existente da Hostinger é reutilizado.
4. Em Admin → Configurações, confirme o link do WhatsApp em Redes sociais.
5. Ative 17TRACK com sua API Key em Admin → Integrações. Na 17TRACK, cadastre `https://absolutoglamur.com.br/api/public/webhooks/17track` como URL de push. O código usa a API v2.4 e verifica a assinatura SHA256 do corpo original/API Key. Novos rastreios são registrados no despacho. Se o registro não for aceito, o painel mostra o motivo; registre o número manualmente na 17TRACK para restabelecer as atualizações.
6. Configure `CRON_SECRET` no servidor e a mesma chave nos secrets do GitHub Actions; configure `SITE_URL` no GitHub Actions com a URL HTTPS da loja. O workflow `order-emails.yml` chama a fila a cada 5 minutos. Agendamento do GitHub pode sofrer atrasos; um cron do provedor pode chamar o mesmo POST protegido a cada minuto quando houver exigência de menor latência.
7. Configure `PUBLIC_SITE_URL` no servidor se o domínio público for diferente de `https://absolutoglamur.com.br`.

## Recuperação e limites

A fila usa claim atômico com `FOR UPDATE SKIP LOCKED`, lock por tentativa, unicidade por pedido/etapa, ordem por pedido e backoff. Uma falha bloqueia avisos posteriores do mesmo pedido até a recuperação, para não enviar etapas fora de ordem. Falha SMTP não desfaz a confirmação do pagamento. Até oito tentativas automáticas; filas esgotadas são exibidas no painel e podem ser recolocadas em tentativa com “Processar e-mails pendentes”.

SMTP oferece entrega com tentativa repetida, não garantia matemática de envio único: queda entre a aceitação SMTP e a marcação no banco pode reenviar a mensagem. A unicidade evita duplicação por notificações repetidas do gateway.

O painel distingue despacho ao cliente de envio do pedido ao fornecedor. Um único código de rastreio é suportado por pedido nesta versão; pedidos com pacotes separados devem ter o despacho consolidado, ou receber expansão para múltiplas remessas antes de usarem entrega automática.

## Validação

`node scripts/test-order-lifecycle.mjs` verifica regras de transição, todos os modelos, escape de HTML, links, anexo MIME e assinatura do webhook.

`PGLITE_MODULE_URL=file:///caminho/node_modules/@electric-sql/pglite/dist/index.js node scripts/test-order-lifecycle-db.mjs` testa a migration em PostgreSQL isolado. PGlite é somente uma ferramenta de teste, não dependência de produção.

Checklist de homologação: Pix manual → aviso → conferência → confirmação → separação → despacho → webhook assinado Delivered; callback de pagamento repetido após despacho; ocorrência de tentativa de entrega; SMTP indisponível e recuperação; cliente A não acessa histórico de B; webhook com assinatura inválida retorna 401.
