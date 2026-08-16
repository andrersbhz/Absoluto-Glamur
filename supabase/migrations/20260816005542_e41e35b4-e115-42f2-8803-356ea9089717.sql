CREATE TABLE IF NOT EXISTS public.operator_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  session_id uuid REFERENCES public.visitor_sessions(id) ON DELETE CASCADE,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.operator_notifications TO authenticated;
GRANT ALL ON public.operator_notifications TO service_role;

ALTER TABLE public.operator_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view notifications"
ON public.operator_notifications FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'));

CREATE POLICY "Admins can update notifications"
ON public.operator_notifications FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'));

CREATE INDEX IF NOT EXISTS idx_operator_notifications_unread
  ON public.operator_notifications (created_at DESC) WHERE is_read = false;

CREATE OR REPLACE FUNCTION public.on_cart_active_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.funnel_stage = 'cart' AND COALESCE(OLD.funnel_stage, '') <> 'cart' THEN
    INSERT INTO public.operator_notifications (type, title, content, session_id)
    VALUES ('cart_active', 'Carrinho Ativo', 'Um visitante adicionou produtos ao carrinho.', NEW.id);
  ELSIF NEW.funnel_stage = 'checkout' AND COALESCE(OLD.funnel_stage, '') <> 'checkout' THEN
    INSERT INTO public.operator_notifications (type, title, content, session_id)
    VALUES ('checkout_active', 'Iniciou Checkout', 'Um visitante iniciou o processo de pagamento.', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.on_cart_active_notify() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.on_cart_active_notify() FROM anon;
REVOKE EXECUTE ON FUNCTION public.on_cart_active_notify() FROM authenticated;

DROP TRIGGER IF EXISTS trg_cart_active_notify ON public.visitor_sessions;
CREATE TRIGGER trg_cart_active_notify
AFTER UPDATE OF funnel_stage ON public.visitor_sessions
FOR EACH ROW EXECUTE FUNCTION public.on_cart_active_notify();

ALTER PUBLICATION supabase_realtime ADD TABLE public.operator_notifications;