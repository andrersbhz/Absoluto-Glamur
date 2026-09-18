CREATE OR REPLACE FUNCTION public.on_cart_active_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.funnel_stage = 'cart' AND OLD.funnel_stage IS DISTINCT FROM 'cart'::visitor_funnel_stage THEN
    INSERT INTO public.operator_notifications (type, title, content, session_id)
    VALUES ('cart_active', 'Carrinho Ativo', 'Um visitante adicionou produtos ao carrinho.', NEW.id);
  ELSIF NEW.funnel_stage = 'checkout' AND OLD.funnel_stage IS DISTINCT FROM 'checkout'::visitor_funnel_stage THEN
    INSERT INTO public.operator_notifications (type, title, content, session_id)
    VALUES ('checkout_active', 'Iniciou Checkout', 'Um visitante iniciou o processo de pagamento.', NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;