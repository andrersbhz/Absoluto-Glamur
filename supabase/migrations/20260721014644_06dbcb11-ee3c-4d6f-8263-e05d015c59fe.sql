
-- 1) PagBank integration row
INSERT INTO public.integrations (provider, category, display_name, description, enabled, mode)
VALUES (
  'pagbank',
  'payments',
  'PagBank (PagSeguro)',
  'Checkout hospedado PagBank: PIX, cartão e boleto via redirecionamento seguro.',
  false,
  'sandbox'
)
ON CONFLICT (provider) DO NOTHING;

-- 2) Storage policies para bucket homepage-media (bucket já criado)
DROP POLICY IF EXISTS "homepage-media public read" ON storage.objects;
CREATE POLICY "homepage-media public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'homepage-media');

DROP POLICY IF EXISTS "homepage-media admin insert" ON storage.objects;
CREATE POLICY "homepage-media admin insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'homepage-media' AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "homepage-media admin update" ON storage.objects;
CREATE POLICY "homepage-media admin update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'homepage-media' AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "homepage-media admin delete" ON storage.objects;
CREATE POLICY "homepage-media admin delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'homepage-media' AND public.is_admin(auth.uid()));
