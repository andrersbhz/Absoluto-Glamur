-- v1.2 explicit privileges for new tables.
GRANT SELECT ON public.product_market_metrics TO authenticated;
GRANT ALL ON public.product_market_metrics TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pricing_profiles TO authenticated;
GRANT ALL ON public.pricing_profiles TO service_role;

GRANT SELECT, UPDATE ON public.abandoned_checkouts TO authenticated;
GRANT ALL ON public.abandoned_checkouts TO service_role;

GRANT SELECT ON public.commerce_events TO authenticated;
GRANT ALL ON public.commerce_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.commerce_events_id_seq TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_spend_daily TO authenticated;
GRANT ALL ON public.marketing_spend_daily TO service_role;
