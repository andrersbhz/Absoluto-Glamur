# Plano de Implementação: Conformidade Legal e Políticas

Este plano detalha a criação das páginas de políticas necessárias para conformidade com normas de anúncios e leis de privacidade (LGPD), além da integração desses links no rodapé da loja.

## Ações imediatas

### 1. Criação das Páginas de Compliance
Criar rotas públicas para as políticas obrigatórias em `src/routes/compliance/`:
- `privacy.tsx`: Política de Privacidade (LGPD).
- `terms.tsx`: Termos de Uso.
- `cookies.tsx`: Política de Cookies.
- `ads.tsx`: Política de Publicidade e Anúncios.
- `returns.tsx`: Trocas e Devoluções.

### 2. Integração no Rodapé
Atualizar `src/components/store/StoreLayout.tsx` para transformar os links estáticos do rodapé em links reais (`<Link>`) apontando para as novas rotas.

### 3. Gerenciamento Admin
Adicionar na página `admin.compliance.tsx` (se aplicável) a verificação de existência dessas páginas ou links rápidos para edição.

## Detalhes Técnicos

- **Estilo**: As páginas seguirão o design system "Maison de Beleza" (Tailwind `prose` para textos longos).
- **SEO**: Cada página terá `head()` configurado com metadados específicos e `noindex` se necessário (embora políticas devam ser indexadas para transparência).
- **Componentes**: Uso de `StoreLayout` para manter a consistência visual da loja.

---
INSTRUÇÃO DO SISTEMA: Analise o texto abaixo antes de agir. Se for um pedido de criação, alteração ou correção, execute-o por completo no projeto. Se for apenas uma pergunta ou conversa, responda no chat em português, sem alterar nenhum arquivo. Nunca insira o texto enviado como conteúdo dentro do site ou da página.

TEXTO DO USUÁRIO: "crie as paginas pendentes como politica de publicidade e as demais que faltam pro site ficar em conformidade com as normas e leis para criar anuncios, politica de cookies e todas as outras sem alterar nada no sistema"
