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

-- Intelligence and professional pricing are operated by admin/catalog staff.
DO $$
DECLARE
  table_name text;
  policy_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'product_scores',
    'product_score_components',
    'product_score_versions',
    'pricing_cost_components',
    'pricing_rules',
    'pricing_calculations'
  ] LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', table_name);
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
      policy_name := 'admin catalog manage ' || table_name;
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_name, table_name);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), ''catalog'')) WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), ''catalog''))',
        policy_name,
        table_name
      );
    END IF;
  END LOOP;
END $$;

-- Blog: storefront public policies stay unchanged; administrative editing/logs are admin-only.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blog_categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blog_posts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blog_post_products TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blog_post_revisions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blog_social_publications TO authenticated;

DROP POLICY IF EXISTS "admin manage blog categories" ON public.blog_categories;
CREATE POLICY "admin manage blog categories"
  ON public.blog_categories FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "admin manage blog posts" ON public.blog_posts;
CREATE POLICY "admin manage blog posts"
  ON public.blog_posts FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "admin manage blog product links" ON public.blog_post_products;
CREATE POLICY "admin manage blog product links"
  ON public.blog_post_products FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "admin manage blog revisions" ON public.blog_post_revisions;
CREATE POLICY "admin manage blog revisions"
  ON public.blog_post_revisions FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "admin manage blog social publications" ON public.blog_social_publications;
CREATE POLICY "admin manage blog social publications"
  ON public.blog_social_publications FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Admin web-push subscription registration no longer needs service-role.
-- The DO block keeps this migration compatible with installations created before push support.
DO $$
BEGIN
  IF to_regclass('public.admin_push_subscriptions') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_push_subscriptions TO authenticated';
    EXECUTE 'ALTER TABLE public.admin_push_subscriptions ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "admins manage own push subscription" ON public.admin_push_subscriptions';
    EXECUTE 'CREATE POLICY "admins manage own push subscription" ON public.admin_push_subscriptions FOR ALL TO authenticated USING (public.is_admin(auth.uid()) AND user_id = auth.uid()) WITH CHECK (public.is_admin(auth.uid()) AND user_id = auth.uid())';
  END IF;
END $$;
