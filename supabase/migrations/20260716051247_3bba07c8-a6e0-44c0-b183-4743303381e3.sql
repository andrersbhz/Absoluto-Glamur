CREATE TABLE public.site_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

GRANT SELECT ON public.site_settings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_settings TO authenticated;
GRANT ALL ON public.site_settings TO service_role;

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "site_settings public read" ON public.site_settings
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "site_settings admin write" ON public.site_settings
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER site_settings_updated_at BEFORE UPDATE ON public.site_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.site_settings (key, value, description) VALUES
  ('site_identity', '{"name":"Bloom","tagline":"Cosméticos que florescem sua rotina","default_title":"Bloom — Cosméticos","default_description":"Sua loja de cosméticos com curadoria inteligente e preços justos.","default_keywords":"cosméticos, skincare, maquiagem, beleza","og_image":""}'::jsonb, 'Identidade e SEO padrão do site'),
  ('social_links', '{"instagram":"","facebook":"","tiktok":"","youtube":"","whatsapp":""}'::jsonb, 'Links de redes sociais'),
  ('organization_jsonld', '{"legal_name":"","cnpj":"","email":"","phone":"","address":""}'::jsonb, 'Dados estruturados da organização (JSON-LD)'),
  ('import_defaults', '{"markup_pct":100,"fixed_fee_cents":0,"rounding":"psychological_99"}'::jsonb, 'Regras padrão do importador AliExpress')
ON CONFLICT (key) DO NOTHING;