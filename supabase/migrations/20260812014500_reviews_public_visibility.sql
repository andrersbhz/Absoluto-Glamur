-- Avaliações externas: leitura pública segura somente para registros visíveis.
-- Escrita continua restrita ao backend/service role e aos fluxos administrativos existentes.

ALTER TABLE public.product_external_reviews
  ADD COLUMN IF NOT EXISTS body_translated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS product_external_reviews_source_uidx
  ON public.product_external_reviews (product_id, source, source_review_id)
  WHERE source_review_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS product_external_reviews_public_feed_idx
  ON public.product_external_reviews (product_id, is_visible, reviewed_at DESC);

ALTER TABLE public.product_external_reviews ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.product_external_reviews TO anon, authenticated;

DROP POLICY IF EXISTS "product_external_reviews public visible" ON public.product_external_reviews;
CREATE POLICY "product_external_reviews public visible"
  ON public.product_external_reviews
  FOR SELECT
  TO anon, authenticated
  USING (is_visible = true);
