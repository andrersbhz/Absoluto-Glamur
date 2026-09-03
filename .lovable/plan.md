# Corrigir sincronização completa, precificação e provedores de IA

## Objetivo
Garantir que todo produto AliExpress importado por link ou API seja concluído com todas as variações e avaliações disponíveis, e que qualquer sincronização reaplique automaticamente as regras atuais de preço e desconto sem restaurar valores antigos. Remover o uso do Lovable AI para geração de conteúdo, mantendo somente as chaves próprias de Gemini/OpenAI.

## Implementação

### 1. Centralizar a aplicação de preços
- Criar um serviço interno único para calcular e persistir o preço de todas as variações de um produto.
- Registrar/atualizar o custo atual de cada variação recebido do fornecedor sem tratá-lo como preço de venda.
- Aplicar o perfil profissional padrão sobre o custo atualizado, incluindo spread, gateway, impostos, devoluções, chargeback, operação, mídia, margem, custos fixos e arredondamento.
- Quando não houver dados suficientes para o perfil profissional, manter compatibilidade usando a configuração de importação existente, sem zerar nem produzir preço inválido.
- Aplicar em seguida a prioridade de desconto já definida: produto > categoria > global; 0% explícito bloqueia herança; configurações inativas não participam.
- Atualizar preço normal e promocional de todas as variações em uma única rotina, impedindo que a sincronização grave novamente o preço bruto/antigo do fornecedor.

### 2. Aplicar a regra em toda sincronização e importação
- Fazer a sincronização individual e em massa de variações chamar a rotina central após atualizar custo, estoque e disponibilidade.
- Fazer a sincronização individual e agendada de estoque/custo reaplicar a precificação automaticamente.
- Fazer todos os fluxos de criação por URL, API oficial e publicação de rascunho terminarem com a mesma rotina de preço e desconto.
- Preservar preços-base, histórico, estoque, moedas, markup e demais funções existentes.

### 3. Produto completo por link/API
- Tornar obrigatória e aguardada a sincronização de variações antes de concluir a importação; não retornar sucesso silencioso quando a origem trouxer SKUs que não foram persistidos.
- Aguardar também a sincronização de avaliações/comentários; hoje um fluxo dispara essa etapa em segundo plano e pode terminar antes de salvar os dados.
- Consolidar avisos de variações e avaliações no registro da importação, sem desfazer o produto quando o AliExpress realmente não disponibilizar comentários.
- Incluir marca no envio do formulário por link, que hoje é lida na prévia mas omitida ao salvar.
- Fazer o fluxo “API oficial/Descobrir” também importar avaliações, além das variações.

### 4. Usar somente Gemini/OpenAI próprios
- Remover chamadas de geração/tradução pelo Lovable AI Gateway nos módulos de conteúdo e descoberta.
- Direcionar descrição, SEO, marketing, melhoria de texto, tradução e organização de importação para as integrações próprias Gemini/OpenAI já cadastradas.
- Manter fallback entre Gemini e OpenAI conforme prioridade configurada; se nenhuma chave própria estiver válida, exibir erro claro e preservar o conteúdo original.
- Não alterar o conector de busca externa; apenas geração de conteúdo fica proibida de usar créditos Lovable.

### 5. Testes e validação
- Adicionar testes determinísticos para fórmula profissional, arredondamento, limites de percentuais e hierarquia de descontos, incluindo 0% explícito.
- Testar múltiplas variações com custos diferentes e confirmar que todas recebem preço calculado e desconto correto.
- Testar regressão: sincronizar novamente não pode restaurar preço antigo nem remover preço promocional configurado.
- Testar o parser com formatos alternativos de SKU retornados pelo AliExpress.
- Validar no banco produtos importados recentes: quantidade de SKUs, estado da sincronização de avaliações e coerência dos preços.
- Executar testes seletivos, verificar build e fazer um teste autenticado do fluxo disponível no preview sem expor credenciais.

## Detalhes técnicos
- A rotina canônica ficará em módulo servidor reutilizável por importação, sincronização de estoque, sincronização de variações e descontos.
- O custo por SKU será persistido nos dados internos da variação para permitir recálculo consistente sem modificar o esquema do banco; o preço de venda continuará em `product_prices`.
- Avaliações continuam vindas das APIs oficiais e são persistidas antes de qualquer tradução opcional; tradução usa apenas Gemini/OpenAI próprios.
- Nenhuma migração de banco é prevista para esta correção.
