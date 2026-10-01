ALTER TABLE public.products ADD COLUMN IF NOT EXISTS shipping_fee_cents integer;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_details jsonb;