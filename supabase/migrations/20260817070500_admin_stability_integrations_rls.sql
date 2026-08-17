-- Admin stability: remove unnecessary service-role dependency from authenticated UI flows.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.integrations TO authenticated;
DROP POLICY IF EXISTS "admins manage integrations" ON public.integrations;
CREATE POLICY "admins manage integrations"
  ON public.integrations FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Payment routing is non-secret checkout configuration.
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
