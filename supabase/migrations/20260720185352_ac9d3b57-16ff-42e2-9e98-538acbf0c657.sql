
CREATE TABLE public.product_external_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'aliexpress',
  source_review_id TEXT,
  author_name TEXT,
  author_country TEXT,
  rating NUMERIC(3,2) NOT NULL DEFAULT 5,
  title TEXT,
  body TEXT,
  images JSONB NOT NULL DEFAULT '[]'::jsonb,
  reviewed_at TIMESTAMPTZ,
  is_visible BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, source, source_review_id)
);

CREATE INDEX idx_pext_reviews_product ON public.product_external_reviews(product_id, is_visible, rating DESC);

GRANT SELECT ON public.product_external_reviews TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_external_reviews TO authenticated;
GRANT ALL ON public.product_external_reviews TO service_role;

ALTER TABLE public.product_external_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read visible external reviews"
  ON public.product_external_reviews FOR SELECT
  USING (is_visible = true);

CREATE POLICY "Admins and catalog manage external reviews"
  ON public.product_external_reviews FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'catalog'))
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'catalog'));

CREATE TRIGGER trg_pext_reviews_updated_at
  BEFORE UPDATE ON public.product_external_reviews
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
