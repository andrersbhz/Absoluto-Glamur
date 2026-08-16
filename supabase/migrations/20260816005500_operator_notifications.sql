-- Tabela para notificações de operadores
CREATE TABLE IF NOT EXISTS public.operator_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL, -- 'cart_active', 'cart_abandoned', 'new_visit'
  title text NOT NULL,
  content text NOT NULL,
  session_id uuid REFERENCES public.visitor_sessions(id) ON DELETE CASCADE,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Grants
GRANT ALL ON public.operator_notifications TO authenticated;
GRANT ALL ON public.operator_notifications TO service_role;
GRANT SELECT, INSERT ON public.operator_notifications TO anon;

-- RLS
ALTER TABLE public.operator_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operators can see all notifications"
ON public.operator_notifications FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'));

-- Trigger para criar notificação quando um carrinho se torna ativo
CREATE OR REPLACE FUNCTION public.on_cart_active_notify()
RETURNS trigger AS $$
BEGIN
  IF (NEW.funnel_stage = 'cart' AND (OLD.funnel_stage IS NULL OR OLD.funnel_stage = 'product_view' OR OLD.funnel_stage = 'browsing')) THEN
    INSERT INTO public.operator_notifications (type, title, content, session_id)
    VALUES ('cart_active', 'Carrinho Ativo', 'Um visitante adicionou produtos ao carrinho.', NEW.id);
  END IF;
  
  IF (NEW.funnel_stage = 'checkout' AND OLD.funnel_stage = 'cart') THEN
    INSERT INTO public.operator_notifications (type, title, content, session_id)
    VALUES ('checkout_active', 'Iniciou Checkout', 'Um visitante iniciou o processo de pagamento.', NEW.id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER tr_notify_operator_cart
AFTER UPDATE ON public.visitor_sessions
FOR EACH ROW
EXECUTE FUNCTION public.on_cart_active_notify();
