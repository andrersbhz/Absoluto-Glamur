CREATE TABLE IF NOT EXISTS public.marketing_spend_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day date NOT NULL,
  channel text NOT NULL,
  campaign text NOT NULL DEFAULT '',
  spend_cents integer NOT NULL DEFAULT 0,
  impressions integer NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,
  conversions integer NOT NULL DEFAULT 0,
  attributed_revenue_cents integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'manual',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(day, channel, campaign)
);
ALTER TABLE public.marketing_spend_daily ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "marketing spend team" ON public.marketing_spend_daily;
CREATE POLICY "marketing spend team" ON public.marketing_spend_daily FOR ALL TO authenticated
USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'marketing'))
WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'marketing'));

CREATE INDEX IF NOT EXISTS marketing_spend_day_idx ON public.marketing_spend_daily(day DESC, channel);
