-- Avaliações externas: permite leitura pública somente de avaliações visíveis.
-- Nenhuma escrita pública é concedida e nenhuma estrutura da tabela é alterada.

ALTER TABLE public.product_external_reviews ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.product_external_reviews TO anon, authenticated;

DROP POLICY IF EXISTS "product_external_reviews public visible" ON public.product_external_reviews;
CREATE POLICY "product_external_reviews public visible"
  ON public.product_external_reviews
  FOR SELECT
  TO anon, authenticated
  USING (is_visible = true);
