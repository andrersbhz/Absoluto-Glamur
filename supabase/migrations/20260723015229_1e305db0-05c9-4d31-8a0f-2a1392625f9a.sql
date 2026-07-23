
CREATE TABLE public.customer_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz
);
GRANT SELECT, INSERT, DELETE ON public.customer_push_subscriptions TO authenticated;
GRANT ALL ON public.customer_push_subscriptions TO service_role;
ALTER TABLE public.customer_push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own customer push subs"
  ON public.customer_push_subscriptions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own customer push subs"
  ON public.customer_push_subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete own customer push subs"
  ON public.customer_push_subscriptions FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
