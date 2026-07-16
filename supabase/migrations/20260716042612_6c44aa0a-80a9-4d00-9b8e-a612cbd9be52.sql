
CREATE TABLE public.integrations (
  provider text PRIMARY KEY,
  category text NOT NULL DEFAULT 'other',
  display_name text NOT NULL,
  description text,
  enabled boolean NOT NULL DEFAULT false,
  mode text NOT NULL DEFAULT 'sandbox',
  api_key text,
  api_secret text,
  webhook_token text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_verified_at timestamptz,
  last_status text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);
GRANT SELECT ON public.integrations TO authenticated;
GRANT ALL ON public.integrations TO service_role;
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

-- Apenas superadmin lê pelo cliente (e mesmo assim, chaves são mascaradas via server fn).
CREATE POLICY "superadmin read integrations"
  ON public.integrations FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'superadmin') OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER integrations_updated_at BEFORE UPDATE ON public.integrations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.integrations (provider, category, display_name, description) VALUES
  ('asaas', 'payments', 'Asaas', 'Pagamentos PIX, boleto e cartão. Recomendado para o Brasil.'),
  ('mercadopago', 'payments', 'Mercado Pago', 'PIX e cartão via Mercado Pago (alternativa).'),
  ('melhorenvio', 'shipping', 'Melhor Envio', 'Cotação e emissão de etiquetas de envio.'),
  ('correios', 'shipping', 'Correios', 'Cálculo de frete direto pelos Correios.'),
  ('google_ads', 'marketing', 'Google Ads', 'Campanhas e conversões no Google Ads.'),
  ('google_merchant', 'marketing', 'Google Merchant Center', 'Feed de produtos para Shopping.'),
  ('meta_ads', 'marketing', 'Meta Ads (Facebook/Instagram)', 'Campanhas e Pixel/CAPI.'),
  ('openai', 'ai', 'OpenAI', 'Geração de textos e imagens (opcional, padrão é Lovable AI).'),
  ('gemini', 'ai', 'Google Gemini', 'Alternativa de IA multimodal.'),
  ('r2', 'storage', 'Cloudflare R2', 'Armazenamento de mídias em escala.')
ON CONFLICT (provider) DO NOTHING;
