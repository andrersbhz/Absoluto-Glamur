CREATE TABLE IF NOT EXISTS public.exchange_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base_currency text NOT NULL DEFAULT 'BRL',
  target_currency text NOT NULL,
  rate numeric NOT NULL CHECK (rate > 0),
  margin_pct numeric NOT NULL DEFAULT 2,
  source text NOT NULL DEFAULT 'manual',
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (base_currency, target_currency)
);

GRANT SELECT ON public.exchange_rates TO anon;
GRANT SELECT ON public.exchange_rates TO authenticated;
GRANT ALL ON public.exchange_rates TO service_role;

ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Exchange rates are publicly readable"
  ON public.exchange_rates FOR SELECT USING (true);

CREATE POLICY "Admins manage exchange rates"
  ON public.exchange_rates FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER exchange_rates_set_updated_at
  BEFORE UPDATE ON public.exchange_rates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.exchange_rates (base_currency, target_currency, rate, margin_pct, source)
VALUES
  ('BRL', 'USD', 0.185, 2, 'seed'),
  ('BRL', 'EUR', 0.170, 2, 'seed'),
  ('BRL', 'MXN', 3.400, 2, 'seed')
ON CONFLICT (base_currency, target_currency) DO NOTHING;