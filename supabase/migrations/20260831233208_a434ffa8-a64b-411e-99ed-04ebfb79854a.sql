-- 1. Traduções de produto
CREATE TABLE IF NOT EXISTS public.product_translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  locale text NOT NULL,
  name text,
  short_description text,
  description text,
  variants jsonb NOT NULL DEFAULT '{}'::jsonb,
  seo jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider text,
  model text,
  is_stale boolean NOT NULL DEFAULT false,
  translated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, locale)
);
GRANT SELECT ON public.product_translations TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_translations TO authenticated;
GRANT ALL ON public.product_translations TO service_role;
ALTER TABLE public.product_translations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "product_translations_public_read" ON public.product_translations FOR SELECT USING (true);
CREATE POLICY "product_translations_admin_write" ON public.product_translations FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE TRIGGER product_translations_touch BEFORE UPDATE ON public.product_translations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Traduções de avaliações (texto original nunca é sobrescrito)
CREATE TABLE IF NOT EXISTS public.product_review_translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.product_external_reviews(id) ON DELETE CASCADE,
  locale text NOT NULL,
  title text,
  body text,
  provider text,
  translated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (review_id, locale)
);
GRANT SELECT ON public.product_review_translations TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_review_translations TO authenticated;
GRANT ALL ON public.product_review_translations TO service_role;
ALTER TABLE public.product_review_translations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "review_translations_public_read" ON public.product_review_translations FOR SELECT USING (true);
CREATE POLICY "review_translations_admin_write" ON public.product_review_translations FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- 3. Regiões
CREATE TABLE IF NOT EXISTS public.regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  countries text[] NOT NULL DEFAULT '{}',
  currency text NOT NULL DEFAULT 'BRL',
  locale text NOT NULL DEFAULT 'pt-BR',
  markup_pct numeric NOT NULL DEFAULT 0,
  rounding text NOT NULL DEFAULT 'none',
  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.regions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.regions TO authenticated;
GRANT ALL ON public.regions TO service_role;
ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "regions_public_read" ON public.regions FOR SELECT USING (is_active);
CREATE POLICY "regions_admin_all" ON public.regions FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE TRIGGER regions_touch BEFORE UPDATE ON public.regions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Regras de preço por região
CREATE TABLE IF NOT EXISTS public.region_pricing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id uuid NOT NULL REFERENCES public.regions(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Regra',
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  markup_pct numeric NOT NULL DEFAULT 0,
  fixed_fee_cents integer NOT NULL DEFAULT 0,
  rounding text NOT NULL DEFAULT 'none',
  min_margin_pct numeric,
  priority integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.region_pricing_rules TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.region_pricing_rules TO authenticated;
GRANT ALL ON public.region_pricing_rules TO service_role;
ALTER TABLE public.region_pricing_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "region_pricing_rules_public_read" ON public.region_pricing_rules FOR SELECT USING (is_active);
CREATE POLICY "region_pricing_rules_admin_all" ON public.region_pricing_rules FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE TRIGGER region_pricing_rules_touch BEFORE UPDATE ON public.region_pricing_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_product_translations_locale ON public.product_translations(locale);
CREATE INDEX IF NOT EXISTS idx_review_translations_locale ON public.product_review_translations(locale);
CREATE INDEX IF NOT EXISTS idx_region_pricing_rules_region ON public.region_pricing_rules(region_id);

-- Regiões iniciais
INSERT INTO public.regions (code, name, countries, currency, locale, markup_pct, is_active, is_default, position)
VALUES
  ('BR', 'Brasil', ARRAY['BR'], 'BRL', 'pt-BR', 0, true, true, 0),
  ('US', 'Estados Unidos', ARRAY['US','CA'], 'USD', 'en-US', 15, true, false, 1),
  ('EU', 'Europa', ARRAY['PT','ES','FR','IT','DE','IE','NL','BE'], 'EUR', 'es', 18, true, false, 2),
  ('MX', 'México', ARRAY['MX'], 'MXN', 'es-MX', 12, true, false, 3)
ON CONFLICT (code) DO NOTHING;