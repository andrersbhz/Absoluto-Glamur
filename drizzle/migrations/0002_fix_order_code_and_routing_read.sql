CREATE OR REPLACE FUNCTION public.generate_order_code()
 RETURNS text LANGUAGE plpgsql SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN 'BL-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''), 1, 6));
END;
$function$;

GRANT SELECT ON public.payment_method_routing TO anon, authenticated;
CREATE POLICY "public read enabled routing" ON public.payment_method_routing
  FOR SELECT TO anon, authenticated USING (enabled = true);