
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS fulfillment_provider text,
  ADD COLUMN IF NOT EXISTS fulfillment_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS fulfillment_order_id text,
  ADD COLUMN IF NOT EXISTS fulfillment_error text,
  ADD COLUMN IF NOT EXISTS fulfillment_response jsonb,
  ADD COLUMN IF NOT EXISTS fulfillment_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS orders_fulfillment_status_idx ON public.orders (fulfillment_status);

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS aliexpress_product_id text,
  ADD COLUMN IF NOT EXISTS aliexpress_sku_attr text;
