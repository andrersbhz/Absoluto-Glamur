
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS session_id text,
  ADD COLUMN IF NOT EXISTS approval_code text,
  ADD COLUMN IF NOT EXISTS redirect_url text,
  ADD COLUMN IF NOT EXISTS return_url text;

CREATE TABLE IF NOT EXISTS public.payment_method_routing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  method public.payment_method NOT NULL UNIQUE,
  provider text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  display_label text,
  sort_order integer NOT NULL DEFAULT 0,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.payment_method_routing TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.payment_method_routing TO authenticated;
GRANT ALL ON public.payment_method_routing TO service_role;

ALTER TABLE public.payment_method_routing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read routing enabled"
  ON public.payment_method_routing FOR SELECT
  USING (enabled = true);

CREATE POLICY "admins read all routing"
  ON public.payment_method_routing FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "admins write routing"
  ON public.payment_method_routing FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER trg_payment_method_routing_updated
  BEFORE UPDATE ON public.payment_method_routing
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.payment_method_routing (method, provider, enabled, display_label, sort_order) VALUES
  ('pix',             'asaas',  true,  'PIX',                  10),
  ('credit_card',     'stripe', false, 'Cartão de crédito',    20),
  ('nubank_redirect', 'nupay',  false, 'Pagar com Nubank',     30),
  ('boleto',          'asaas',  false, 'Boleto bancário',      40)
ON CONFLICT (method) DO NOTHING;

INSERT INTO public.integrations (provider, category, display_name, description, enabled, mode, config)
VALUES
  ('nupay',       'payments', 'NuPay (Nubank)',
   'Checkout Nubank com aprovação no app e confirmação em tempo real via webhook.',
   false, 'sandbox', '{}'::jsonb),
  ('stripe',      'payments', 'Stripe',
   'Cartão de crédito internacional, Apple Pay e Google Pay.',
   false, 'sandbox', '{}'::jsonb),
  ('mercadopago', 'payments', 'Mercado Pago',
   'Cartão, PIX e boleto pela conta Mercado Pago.',
   false, 'sandbox', '{}'::jsonb)
ON CONFLICT (provider) DO NOTHING;
