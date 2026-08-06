ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS is_available boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS external_sku_id text,
  ADD COLUMN IF NOT EXISTS external_sku_attr text;

CREATE INDEX IF NOT EXISTS pv_external_sku_idx
  ON public.product_variants (product_id, external_sku_id);