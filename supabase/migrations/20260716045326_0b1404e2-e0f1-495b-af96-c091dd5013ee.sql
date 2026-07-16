
-- product_scores
CREATE TABLE public.product_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE UNIQUE,
  overall integer NOT NULL DEFAULT 0 CHECK (overall BETWEEN 0 AND 100),
  quality integer NOT NULL DEFAULT 0,
  demand integer NOT NULL DEFAULT 0,
  margin integer NOT NULL DEFAULT 0,
  competitiveness integer NOT NULL DEFAULT 0,
  risk integer NOT NULL DEFAULT 0,
  label text,
  recommendation text,
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_scores TO authenticated;
GRANT ALL ON public.product_scores TO service_role;
ALTER TABLE public.product_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scores read staff" ON public.product_scores FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'catalog'));
CREATE POLICY "scores write staff" ON public.product_scores FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'catalog'))
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'catalog'));
CREATE TRIGGER trg_product_scores_updated BEFORE UPDATE ON public.product_scores
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- product_score_components
CREATE TABLE public.product_score_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  score_id uuid NOT NULL REFERENCES public.product_scores(id) ON DELETE CASCADE,
  key text NOT NULL,
  label text NOT NULL,
  weight numeric(5,2) NOT NULL DEFAULT 0,
  raw_value numeric,
  normalized numeric(5,2) NOT NULL DEFAULT 0,
  source text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_score_components TO authenticated;
GRANT ALL ON public.product_score_components TO service_role;
ALTER TABLE public.product_score_components ENABLE ROW LEVEL SECURITY;
CREATE POLICY "score_components staff" ON public.product_score_components FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'catalog'))
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'catalog'));
CREATE INDEX idx_score_components_score ON public.product_score_components(score_id);

-- product_score_versions
CREATE TABLE public.product_score_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  overall integer NOT NULL,
  snapshot jsonb NOT NULL,
  computed_by uuid REFERENCES auth.users(id),
  computed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_score_versions TO authenticated;
GRANT ALL ON public.product_score_versions TO service_role;
ALTER TABLE public.product_score_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "score_versions staff" ON public.product_score_versions FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'catalog'))
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'catalog'));
CREATE INDEX idx_score_versions_product ON public.product_score_versions(product_id, computed_at DESC);

-- pricing_rules
CREATE TABLE public.pricing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  markup_pct numeric(6,2) NOT NULL DEFAULT 100,
  fixed_fee_cents integer NOT NULL DEFAULT 0,
  rounding text NOT NULL DEFAULT 'psychological_99' CHECK (rounding IN ('none','psychological_99','psychological_90','nearest_1','nearest_5')),
  min_margin_pct numeric(6,2),
  max_margin_pct numeric(6,2),
  applies_to_category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  applies_to_brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  priority integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pricing_rules TO authenticated;
GRANT ALL ON public.pricing_rules TO service_role;
ALTER TABLE public.pricing_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pricing_rules staff" ON public.pricing_rules FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'catalog'))
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'catalog'));
CREATE TRIGGER trg_pricing_rules_updated BEFORE UPDATE ON public.pricing_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- pricing_cost_components
CREATE TABLE public.pricing_cost_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  key text NOT NULL,
  label text NOT NULL,
  amount_cents integer NOT NULL DEFAULT 0,
  pct_of_price numeric(6,2),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pricing_cost_components TO authenticated;
GRANT ALL ON public.pricing_cost_components TO service_role;
ALTER TABLE public.pricing_cost_components ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cost_components staff" ON public.pricing_cost_components FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'catalog'))
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'catalog'));
CREATE TRIGGER trg_cost_components_updated BEFORE UPDATE ON public.pricing_cost_components
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- pricing_calculations
CREATE TABLE public.pricing_calculations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  rule_id uuid REFERENCES public.pricing_rules(id) ON DELETE SET NULL,
  cost_cents integer NOT NULL,
  suggested_price_cents integer NOT NULL,
  final_price_cents integer NOT NULL,
  margin_pct numeric(6,2) NOT NULL,
  breakdown jsonb NOT NULL,
  applied boolean NOT NULL DEFAULT false,
  computed_by uuid REFERENCES auth.users(id),
  computed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pricing_calculations TO authenticated;
GRANT ALL ON public.pricing_calculations TO service_role;
ALTER TABLE public.pricing_calculations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pricing_calc staff" ON public.pricing_calculations FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'catalog'))
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'catalog'));
CREATE INDEX idx_pricing_calc_product ON public.pricing_calculations(product_id, computed_at DESC);
