# Absoluto Glamur · Importador de avaliações AliExpress

Extensão Chrome Manifest V3 usada como fallback quando o AliExpress não expõe comentários para requisições server-side.

## Versão atual

**1.6.0** — a coleta longa roda dentro da própria página do AliExpress e usa `chrome.storage` para persistir o estado do trabalho. O service worker apenas abre/reutiliza a aba e registra a sincronização.

## Por que existe

O AliExpress pode retornar a lista de avaliações apenas quando a consulta acontece dentro de uma sessão real do navegador. Por isso o fluxo usa uma extensão Chrome para trabalhar na própria página do produto.

## Segurança

- A extensão não recebe a senha da Absoluto Glamur.
- A extensão não recebe a senha do AliExpress.
- O fluxo automático parte da sessão autenticada do administrador na loja.
- As avaliações são gravadas em `product_external_reviews` com `source = aliexpress` e deduplicação nativa.
- Não altera preço, estoque, variantes, fornecedor, pedidos, checkout, OAuth ou fulfillment.

## Instalação local no Chrome

1. Baixe e extraia a pasta da extensão.
2. Abra `chrome://extensions`.
3. Ative **Modo do desenvolvedor**.
4. Clique em **Carregar sem compactação**.
5. Escolha a pasta da extensão.
6. Confirme que a versão exibida é **1.6.0**.
7. Fixe a extensão na barra do Chrome e deixe-a ligada.

## Uso

1. Abra um produto na Absoluto Glamur como administrador.
2. Clique em **Sincronizar AliExpress** na seção de avaliações.
3. A extensão abre ou reutiliza a aba do anúncio correspondente.
4. Na aba do AliExpress aparece o painel **Absoluto Glamur · Avaliações** com o progresso.
5. A coleta continua dentro da própria página e devolve o resultado para a loja por estado persistido no Chrome.
6. Repetir a importação não duplica avaliações já identificadas.
