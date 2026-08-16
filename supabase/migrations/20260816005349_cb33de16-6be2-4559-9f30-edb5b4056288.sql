REVOKE EXECUTE ON FUNCTION public.cleanup_offline_sessions() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_offline_sessions() FROM anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_offline_sessions() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_offline_sessions() TO service_role;

DROP POLICY IF EXISTS "Public can update own session" ON public.visitor_sessions;
DROP POLICY IF EXISTS "visitor_sessions_update_own_session" ON public.visitor_sessions;
DROP POLICY IF EXISTS "Public can insert sessions" ON public.visitor_sessions;

REVOKE INSERT, UPDATE, DELETE ON public.visitor_sessions FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.visitor_sessions FROM authenticated;
REVOKE SELECT ON public.visitor_sessions FROM anon;
GRANT SELECT ON public.visitor_sessions TO authenticated;
GRANT ALL ON public.visitor_sessions TO service_role;