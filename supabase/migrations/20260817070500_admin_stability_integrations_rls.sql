-- Admin stability: authenticated admin/catalog flows must use the user's session + RLS.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.integrations TO authenticated;
DROP POLICY IF EXISTS "admins manage integrations" ON public.integrations;
CREATE POLICY "admins manage integrations"
  ON public.integrations FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Payment routing contains no credentials and is required by the public checkout.
GRANT SELECT ON public.payment_method_routing TO anon, authenticated;
GRANT UPDATE ON public.payment_method_routing TO authenticated;
DROP POLICY IF EXISTS "payment routing public read" ON public.payment_method_routing;
CREATE POLICY "payment routing public read"
  ON public.payment_method_routing FOR SELECT
  USING (true);
DROP POLICY IF EXISTS "payment routing admin update" ON public.payment_method_routing;
CREATE POLICY "payment routing admin update"
  ON public.payment_method_routing FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Growth intelligence writes market metrics from authenticated catalog/admin screens.
GRANT SELECT, INSERT, UPDATE ON public.product_market_metrics TO authenticated;
DROP POLICY IF EXISTS "market metrics staff write" ON public.product_market_metrics;
CREATE POLICY "market metrics staff write"
  ON public.product_market_metrics FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'catalog'))
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'catalog'));

-- Opportunity scoring needs aggregate favorite counts, not only the current user's favorites.
GRANT SELECT ON public.favorites TO authenticated;
DROP POLICY IF EXISTS "favorites staff aggregate read" ON public.favorites;
CREATE POLICY "favorites staff aggregate read"
  ON public.favorites FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'catalog'));
