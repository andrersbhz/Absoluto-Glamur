
-- Scope public SELECT policies to active products only

DROP POLICY IF EXISTS pv_read_all ON public.product_variants;
CREATE POLICY pv_read_all ON public.product_variants FOR SELECT
USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_variants.product_id AND p.status = 'active'));

DROP POLICY IF EXISTS pm_read_all ON public.product_media;
CREATE POLICY pm_read_all ON public.product_media FOR SELECT
USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_media.product_id AND p.status = 'active'));

DROP POLICY IF EXISTS pseo_read_all ON public.product_seo;
CREATE POLICY pseo_read_all ON public.product_seo FOR SELECT
USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_seo.product_id AND p.status = 'active'));

DROP POLICY IF EXISTS pc_read_all ON public.product_collections;
CREATE POLICY pc_read_all ON public.product_collections FOR SELECT
USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_collections.product_id AND p.status = 'active'));

DROP POLICY IF EXISTS pp_read_all ON public.product_prices;
CREATE POLICY pp_read_all ON public.product_prices FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.product_variants v
  JOIN public.products p ON p.id = v.product_id
  WHERE v.id = product_prices.variant_id AND p.status = 'active'
));

DROP POLICY IF EXISTS pi_read_all ON public.product_inventory;
CREATE POLICY pi_read_all ON public.product_inventory FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.product_variants v
  JOIN public.products p ON p.id = v.product_id
  WHERE v.id = product_inventory.variant_id AND p.status = 'active'
));
