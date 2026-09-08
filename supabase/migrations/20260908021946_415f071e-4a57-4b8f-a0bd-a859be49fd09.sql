DROP POLICY IF EXISTS product_translations_public_read ON public.product_translations;
CREATE POLICY product_translations_public_read ON public.product_translations
FOR SELECT TO public
USING (
  EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_translations.product_id
      AND p.status = 'active'::product_status
  )
  OR public.is_admin(auth.uid())
);

DROP POLICY IF EXISTS review_translations_public_read ON public.product_review_translations;
CREATE POLICY review_translations_public_read ON public.product_review_translations
FOR SELECT TO public
USING (
  EXISTS (
    SELECT 1 FROM public.product_external_reviews r
    WHERE r.id = product_review_translations.review_id
      AND r.is_visible = true
  )
  OR public.is_admin(auth.uid())
);