-- Admin/session stability: normal authenticated admin screens must not require service-role.

DROP POLICY IF EXISTS "admin manage integrations" ON public.integrations;
CREATE POLICY "admin manage integrations"
ON public.integrations
FOR ALL
TO authenticated
USING (
  private.has_role(auth.uid(), 'superadmin'::app_role)
  OR private.has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  private.has_role(auth.uid(), 'superadmin'::app_role)
  OR private.has_role(auth.uid(), 'admin'::app_role)
);

DROP POLICY IF EXISTS "Catalog team can delete imports" ON public.product_imports;
CREATE POLICY "Catalog team can delete imports"
ON public.product_imports
FOR DELETE
TO authenticated
USING (
  private.has_role(auth.uid(), 'superadmin'::app_role)
  OR private.has_role(auth.uid(), 'admin'::app_role)
  OR private.has_role(auth.uid(), 'catalog'::app_role)
);

DROP POLICY IF EXISTS "blog categories admin manage" ON public.blog_categories;
CREATE POLICY "blog categories admin manage"
ON public.blog_categories
FOR ALL
TO authenticated
USING (private.is_admin(auth.uid()))
WITH CHECK (private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "blog posts admin manage" ON public.blog_posts;
CREATE POLICY "blog posts admin manage"
ON public.blog_posts
FOR ALL
TO authenticated
USING (private.is_admin(auth.uid()))
WITH CHECK (private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "blog post products admin manage" ON public.blog_post_products;
CREATE POLICY "blog post products admin manage"
ON public.blog_post_products
FOR ALL
TO authenticated
USING (private.is_admin(auth.uid()))
WITH CHECK (private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "blog revisions admin manage" ON public.blog_post_revisions;
CREATE POLICY "blog revisions admin manage"
ON public.blog_post_revisions
FOR ALL
TO authenticated
USING (private.is_admin(auth.uid()))
WITH CHECK (private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "blog social publications admin manage" ON public.blog_social_publications;
CREATE POLICY "blog social publications admin manage"
ON public.blog_social_publications
FOR ALL
TO authenticated
USING (private.is_admin(auth.uid()))
WITH CHECK (private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "audit_logs_admin_insert" ON public.audit_logs;
CREATE POLICY "audit_logs_admin_insert"
ON public.audit_logs
FOR INSERT
TO authenticated
WITH CHECK (private.is_admin(auth.uid()));
