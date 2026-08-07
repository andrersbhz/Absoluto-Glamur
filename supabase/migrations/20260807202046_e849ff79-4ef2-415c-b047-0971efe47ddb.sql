CREATE UNIQUE INDEX IF NOT EXISTS product_variants_product_external_sku_uidx
  ON public.product_variants (product_id, external_sku_id)
  WHERE external_sku_id IS NOT NULL;