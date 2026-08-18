# Absoluto Glamur · Importador de avaliações AliExpress

Extensão Chrome Manifest V3 usada como fallback quando o AliExpress não expõe comentários para requisições server-side.

## Por que existe

O AliExpress pode retornar a lista de avaliações apenas quando a consulta acontece dentro de uma sessão real do navegador. É o mesmo motivo pelo qual ferramentas como Ryviu exigem uma extensão Chrome para importar avaliações de URLs de dropshipping.

## Segurança

- A extensão não recebe a senha da Absoluto Glamur.
- A extensão não recebe a senha do AliExpress.
- O painel gera um código assinado e temporário, válido somente para um produto da loja e um ID do AliExpress.
- A assinatura é validada no servidor antes de qualquer gravação.
- As avaliações continuam sendo gravadas em `product_external_reviews` com `source = aliexpress` e deduplicação nativa.
- Não altera preço, estoque, variantes, fornecedor, pedidos, checkout, OAuth ou fulfillment.

## Instalação local no Chrome

1. Baixe e extraia a pasta da extensão.
2. Abra `chrome://extensions`.
3. Ative **Modo do desenvolvedor**.
4. Clique em **Carregar sem compactação**.
5. Escolha esta pasta (`tools/aliexpress-review-importer-extension`).
6. Fixe a extensão na barra do Chrome.

## Uso

1. Em Absoluto Glamur → Admin → AliExpress → Avaliações, selecione o produto e informe a URL do anúncio AliExpress.
2. Clique em **Gerar código para importar pelo Chrome**.
3. Copie o código temporário.
4. Abra o mesmo anúncio no AliExpress no Chrome. Se o AliExpress pedir login/verificação, conclua normalmente.
5. Abra a extensão, cole o código e clique em **Importar avaliações desta página**.
6. O navegador consulta os endpoints de avaliações usando a sessão atual e envia os comentários ao endpoint seguro da loja.

## Observação

O código expira em aproximadamente 10 minutos. Repetir a importação não duplica reviews que tenham o mesmo identificador AliExpress.
