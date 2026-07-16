
-- Enums
CREATE TYPE public.order_status AS ENUM ('pending','awaiting_payment','paid','processing','shipped','delivered','cancelled','refunded','failed');
CREATE TYPE public.payment_status AS ENUM ('pending','confirmed','received','overdue','refunded','cancelled','failed');
CREATE TYPE public.payment_method AS ENUM ('pix','credit_card','boleto');

-- Addresses
CREATE TABLE public.addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text,
  recipient_name text NOT NULL,
  document text,
  phone text,
  zip_code text NOT NULL,
  street text NOT NULL,
  number text NOT NULL,
  complement text,
  district text NOT NULL,
  city text NOT NULL,
  state text NOT NULL,
  country text NOT NULL DEFAULT 'BR',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.addresses TO authenticated;
GRANT ALL ON public.addresses TO service_role;
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own addresses select" ON public.addresses FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "own addresses write" ON public.addresses FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER addresses_updated_at BEFORE UPDATE ON public.addresses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX addresses_user_idx ON public.addresses(user_id);

-- Orders
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  status order_status NOT NULL DEFAULT 'pending',
  subtotal_cents integer NOT NULL,
  shipping_cents integer NOT NULL DEFAULT 0,
  discount_cents integer NOT NULL DEFAULT 0,
  total_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'BRL',
  customer_name text NOT NULL,
  customer_email text NOT NULL,
  customer_document text NOT NULL,
  customer_phone text,
  shipping_address jsonb NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  cancelled_at timestamptz
);
GRANT SELECT ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own orders select" ON public.orders FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'finance')
    OR public.has_role(auth.uid(), 'support')
    OR public.has_role(auth.uid(), 'logistics')
  );
CREATE TRIGGER orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX orders_user_idx ON public.orders(user_id);
CREATE INDEX orders_status_idx ON public.orders(status);
CREATE INDEX orders_created_idx ON public.orders(created_at DESC);

-- Order items
CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  variant_name text,
  slug text,
  image_url text,
  unit_cents integer NOT NULL,
  quantity integer NOT NULL,
  total_cents integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.order_items TO authenticated;
GRANT ALL ON public.order_items TO service_role;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order items select via order" ON public.order_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND (o.user_id = auth.uid()
        OR public.is_admin(auth.uid())
        OR public.has_role(auth.uid(), 'finance')
        OR public.has_role(auth.uid(), 'support')
        OR public.has_role(auth.uid(), 'logistics'))
  ));
CREATE INDEX order_items_order_idx ON public.order_items(order_id);

-- Payments
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'asaas',
  method payment_method NOT NULL DEFAULT 'pix',
  status payment_status NOT NULL DEFAULT 'pending',
  amount_cents integer NOT NULL,
  external_id text,
  external_customer_id text,
  pix_qr_code text,
  pix_payload text,
  pix_expires_at timestamptz,
  invoice_url text,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);
GRANT SELECT ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments select via order" ON public.payments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = payments.order_id
      AND (o.user_id = auth.uid()
        OR public.is_admin(auth.uid())
        OR public.has_role(auth.uid(), 'finance')
        OR public.has_role(auth.uid(), 'support'))
  ));
CREATE TRIGGER payments_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX payments_order_idx ON public.payments(order_id);
CREATE UNIQUE INDEX payments_external_idx ON public.payments(provider, external_id) WHERE external_id IS NOT NULL;

-- Payment events (webhook audit)
CREATE TABLE public.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_type text NOT NULL,
  external_id text,
  payload jsonb NOT NULL,
  processed boolean NOT NULL DEFAULT false,
  processed_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payment_events TO authenticated;
GRANT ALL ON public.payment_events TO service_role;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payment events admin/finance select" ON public.payment_events FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'finance'));
CREATE INDEX payment_events_external_idx ON public.payment_events(provider, external_id);
CREATE INDEX payment_events_created_idx ON public.payment_events(created_at DESC);

-- Helper: gerar código único de pedido (ex: BL-20260716-ABCD)
CREATE OR REPLACE FUNCTION public.generate_order_code()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  suffix text;
BEGIN
  suffix := upper(substr(encode(gen_random_bytes(3), 'hex'), 1, 6));
  RETURN 'BL-' || to_char(now(), 'YYYYMMDD') || '-' || suffix;
END;
$$;
