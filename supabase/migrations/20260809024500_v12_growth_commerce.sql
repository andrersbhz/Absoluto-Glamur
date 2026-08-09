-- Absoluto Glamur v1.2 — Growth Intelligence, pricing and recovery foundation

CREATE TABLE IF NOT EXISTS public.product_market_metrics (
  product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  external_sales bigint NOT NULL DEFAULT 0,
  sales_7d bigint NOT NULL DEFAULT 0,
  sales_30d bigint NOT NULL DEFAULT 0,
  sales_90d bigint NOT NULL DEFAULT 0,
  growth_7d_pct numeric(10,2),
  growth_30d_pct numeric(10,2),
  growth_90d_pct numeric(10,2),
  supplier_score numeric(6,2),
  shipping_score numeric(6,2),
  competition_score numeric(6,2),
  trend_score numeric(6,2),
  data_points integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'internal',
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  captured_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.product_market_metrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "market metrics admin read" ON public.product_market_metrics;
CREATE POLICY "market metrics admin read" ON public.product_market_metrics FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'catalog'));

ALTER TABLE public.product_scores ADD COLUMN IF NOT EXISTS opportunity integer NOT NULL DEFAULT 0;
ALTER TABLE public.product_scores ADD COLUMN IF NOT EXISTS commercial integer NOT NULL DEFAULT 0;
ALTER TABLE public.product_scores ADD COLUMN IF NOT EXISTS trend integer NOT NULL DEFAULT 0;
ALTER TABLE public.product_scores ADD COLUMN IF NOT EXISTS confidence integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.pricing_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  gateway_pct numeric(8,4) NOT NULL DEFAULT 4.99,
  gateway_fixed_cents integer NOT NULL DEFAULT 0,
  tax_pct numeric(8,4) NOT NULL DEFAULT 0,
  fx_spread_pct numeric(8,4) NOT NULL DEFAULT 4,
  returns_pct numeric(8,4) NOT NULL DEFAULT 2,
  chargeback_pct numeric(8,4) NOT NULL DEFAULT 1,
  operational_pct numeric(8,4) NOT NULL DEFAULT 5,
  desired_margin_pct numeric(8,4) NOT NULL DEFAULT 35,
  target_ad_cost_pct numeric(8,4) NOT NULL DEFAULT 20,
  shipping_subsidy_cents integer NOT NULL DEFAULT 0,
  packaging_cents integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pricing_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pricing profiles admin" ON public.pricing_profiles;
CREATE POLICY "pricing profiles admin" ON public.pricing_profiles FOR ALL TO authenticated
USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'catalog'))
WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'catalog'));

INSERT INTO public.pricing_profiles (name, is_default)
SELECT 'Padrão v1.2', true
WHERE NOT EXISTS (SELECT 1 FROM public.pricing_profiles WHERE is_default = true);

CREATE TABLE IF NOT EXISTS public.abandoned_checkouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text,
  phone text,
  cart_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  subtotal_cents integer NOT NULL DEFAULT 0,
  total_cents integer NOT NULL DEFAULT 0,
  source text,
  utm jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  recovered_at timestamptz,
  recovery_channel text,
  UNIQUE(session_id)
);
ALTER TABLE public.abandoned_checkouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "abandoned admin read" ON public.abandoned_checkouts;
CREATE POLICY "abandoned admin read" ON public.abandoned_checkouts FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'marketing'));

CREATE TABLE IF NOT EXISTS public.commerce_events (
  id bigserial PRIMARY KEY,
  event_name text NOT NULL,
  session_id text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  order_id uuid,
  value_cents integer,
  channel text,
  campaign text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS commerce_events_event_time_idx ON public.commerce_events(event_name, occurred_at DESC);
CREATE INDEX IF NOT EXISTS commerce_events_product_time_idx ON public.commerce_events(product_id, occurred_at DESC);
ALTER TABLE public.commerce_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "commerce events admin read" ON public.commerce_events;
CREATE POLICY "commerce events admin read" ON public.commerce_events FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'marketing'));

DO $$
BEGIN
  IF to_regclass('public.integrations') IS NOT NULL THEN
    INSERT INTO public.integrations (provider, category, display_name, description, enabled, mode, config)
    SELECT 'google_merchant', 'marketing', 'Google Merchant Center', 'Feed de produtos e preparação para sincronização com Merchant Center.', false, 'production', '{}'::jsonb
    WHERE NOT EXISTS (SELECT 1 FROM public.integrations WHERE provider = 'google_merchant');

    INSERT INTO public.integrations (provider, category, display_name, description, enabled, mode, config)
    SELECT 'google_ads', 'marketing', 'Google Ads', 'Configuração para campanhas, conversões e acompanhamento de ROAS.', false, 'production', '{}'::jsonb
    WHERE NOT EXISTS (SELECT 1 FROM public.integrations WHERE provider = 'google_ads');

    INSERT INTO public.integrations (provider, category, display_name, description, enabled, mode, config)
    SELECT 'meta', 'marketing', 'Meta Ads / Catalog / Pixel', 'Meta Catalog, Pixel e preparação para Conversions API.', false, 'production', '{}'::jsonb
    WHERE NOT EXISTS (SELECT 1 FROM public.integrations WHERE provider = 'meta');
  END IF;
END $$;
