DROP POLICY IF EXISTS "Public can insert events" ON public.analytics_events;
DROP POLICY IF EXISTS "homepage-media public read" ON storage.objects;
CREATE POLICY "homepage-media admin read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'homepage-media' AND public.is_admin(auth.uid()));