# Absoluto Glamur · Importador de avaliações AliExpress

Extensão Chrome Manifest V3 usada como fallback quando o AliExpress não expõe comentários para requisições server-side.

## Versão atual

**1.7.2** — abre ou reutiliza o produto na mesma janela visível do Chrome, força foco na aba do AliExpress e só confirma a abertura depois que a navegação foi detectada. A coleta continua usando a sessão real do navegador, DOM/iframes e estado persistente em `chrome.storage`.

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
4. Remova ou desative versões antigas da extensão.
5. Clique em **Carregar sem compactação**.
6. Escolha a pasta da extensão.
7. Confirme que a versão exibida é **1.7.2**.
8. Fixe a extensão na barra do Chrome e deixe-a ligada.
9. Recarregue a página da Absoluto Glamur depois de atualizar a extensão.

## Uso

1. Abra um produto na Absoluto Glamur como administrador.
2. Clique em **Sincronizar AliExpress** na seção de avaliações.
3. A extensão abre ou reutiliza a aba do anúncio correspondente na janela do Chrome em uso.
4. A janela/aba do AliExpress recebe foco e o produto é confirmado antes de iniciar a coleta.
5. Na aba do AliExpress aparece o painel **Absoluto Glamur · Avaliações** com o progresso quando os scripts da página estiverem disponíveis.
6. A coleta devolve o resultado para a loja pela sessão autenticada do administrador.
7. Repetir a importação não duplica avaliações já identificadas.

Se o AliExpress pedir login, CAPTCHA ou outra verificação, conclua a verificação na aba aberta e clique em **Sincronizar AliExpress** novamente.
