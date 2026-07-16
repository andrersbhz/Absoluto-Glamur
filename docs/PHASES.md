# Roteiro de fases

Baseado no briefing mestre. Cada fase é uma entrega isolada, testável e validada antes da próxima.

- [x] **Fase 1 — Fundação:** Cloud, migrations, RLS, perfis, funções, permissões, auth (email + Google), design system, layouts store/admin.
- [x] **Fase 2 — Catálogo:** `products`, `product_variants`, `categories`, `brands`, `collections`, `product_media`, `product_prices`, `product_inventory`, `product_reviews`, `product_seo`, `homepage_blocks`, `favorites`, busca com debounce, filtros por categoria/coleção, página de produto com galeria e variantes, favoritos por cliente, carrinho local (zustand + localStorage).
- [ ] **Fase 3 — Checkout & PIX:** `carts`, `orders`, `payments`, `shipments`, cupons, integração Asaas + webhooks, Realtime de pagamento, tela de PIX com QR + copia e cola, timer, confirmação server-side.
- [ ] **Fase 4 — AliExpress:** Edge Functions autenticadas, importador (URL/ID/palavra-chave), rascunhos, fila `background_jobs`, sincronização de preço/estoque/rastreamento.
- [ ] **Fase 5 — Inteligência de produtos:** scores 0–100 com memória de cálculo (`product_scores`, `product_score_components`, `product_score_versions`), precificação (`pricing_rules`, `pricing_cost_components`, `pricing_calculations`), fluxo Editar + Adicionar à loja.
- [ ] **Fase 6 — Marketing:** feed Google Merchant, feed Meta Catalog, conjuntos dinâmicos, gerador de campanhas + carrosséis, UTM.
- [x] **Fase 7 — IA:** Lovable AI Gateway (Gemini + GPT), gerador de descrições/SEO/marketing/revisão, log de uso (`ai_generations`), guardrails contra invenção de dados regulatórios.
- [x] **Fase 8 — Dashboard & Monitor:** métricas agregadas (vendas, conversão, clientes, produtos, IA), receita diária, top produtos, alertas 70/85/95% de uso do plano gratuito e exportação CSV de pedidos.

## Critérios de conclusão (do briefing) — status

| Critério | Estado |
| --- | --- |
| Lovable Cloud conectado | ✅ |
| Migrations versionadas | ✅ |
| Login funcional (email + Google) | ✅ |
| RLS ativa em todas as tabelas | ✅ |
| Perfis e roles funcionando | ✅ |
| Nenhuma chave no front-end | ✅ |
| Catálogo, carrinho, checkout, PIX | ✅ Catálogo/carrinho local · ⏳ Checkout+PIX (Fase 3) |
| Importador AliExpress real | ⏳ Fase 4 |
| Scores com memória de cálculo | ⏳ Fase 5 |
| Google/Meta preparados | ⏳ Fase 6 |
| OpenAI/Gemini via Edge Functions | ⏳ Fase 7 |
| Dashboard + monitor do plano free | ⏳ Fase 8 |
