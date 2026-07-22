CREATE TABLE public.push_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  vapid_public_key text NOT NULL,
  vapid_private_key text NOT NULL,
  vapid_subject text NOT NULL DEFAULT 'mailto:admin@absolutoglamur.com.br',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.push_config TO service_role;
ALTER TABLE public.push_config ENABLE ROW LEVEL SECURITY;
-- No policies: service role only.

CREATE TABLE public.admin_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz
);
GRANT SELECT, INSERT, DELETE ON public.admin_push_subscriptions TO authenticated;
GRANT ALL ON public.admin_push_subscriptions TO service_role;
ALTER TABLE public.admin_push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage own push subs (select)"
  ON public.admin_push_subscriptions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() AND public.is_admin(auth.uid()));

CREATE POLICY "Admins insert own push subs"
  ON public.admin_push_subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_admin(auth.uid()));

CREATE POLICY "Admins delete own push subs"
  ON public.admin_push_subscriptions FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());