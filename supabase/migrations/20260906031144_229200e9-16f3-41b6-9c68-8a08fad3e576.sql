CREATE TABLE public.content_translations (
  scope text NOT NULL,
  ref_id text NOT NULL,
  locale text NOT NULL,
  fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, ref_id, locale)
);

GRANT SELECT ON public.content_translations TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_translations TO authenticated;
GRANT ALL ON public.content_translations TO service_role;

ALTER TABLE public.content_translations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "content_translations_public_read"
ON public.content_translations FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "content_translations_admin_manage"
ON public.content_translations FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'catalog'))
WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'catalog'));

CREATE TRIGGER content_translations_updated_at
BEFORE UPDATE ON public.content_translations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();