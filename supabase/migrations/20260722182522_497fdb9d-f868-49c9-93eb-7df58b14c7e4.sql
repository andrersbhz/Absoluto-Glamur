DROP POLICY IF EXISTS audit_logs_insert_own ON public.audit_logs;
DROP POLICY IF EXISTS user_sessions_insert_own ON public.user_sessions;
DROP POLICY IF EXISTS user_sessions_update_own ON public.user_sessions;
REVOKE INSERT, UPDATE ON public.audit_logs FROM authenticated, anon;
REVOKE INSERT, UPDATE ON public.user_sessions FROM authenticated, anon;