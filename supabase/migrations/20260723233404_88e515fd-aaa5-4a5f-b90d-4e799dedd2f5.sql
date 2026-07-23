
CREATE POLICY "Admins upload product media" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'product-media' AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'catalog')));

CREATE POLICY "Admins update product media" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'product-media' AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'catalog')));

CREATE POLICY "Admins delete product media" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'product-media' AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'catalog')));

CREATE POLICY "Admins read product media" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'product-media' AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'catalog')));
