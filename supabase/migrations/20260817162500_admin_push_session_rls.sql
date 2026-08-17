-- Admin push actions initiated from the authenticated panel must not require service-role.
-- The VAPID private key remains server-side: only an authenticated admin server function
-- reads it through context.supabase. No anon access is granted.

DO $$
BEGIN
  IF to_regclass('public.push_config') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON public.push_config TO authenticated';
    EXECUTE 'ALTER TABLE public.push_config ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "admins manage push config" ON public.push_config';
    EXECUTE 'CREATE POLICY "admins manage push config" ON public.push_config FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()))';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.admin_push_subscriptions') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_push_subscriptions TO authenticated';
    EXECUTE 'ALTER TABLE public.admin_push_subscriptions ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "admins manage own push subscription" ON public.admin_push_subscriptions';
    EXECUTE 'CREATE POLICY "admins manage own push subscription" ON public.admin_push_subscriptions FOR ALL TO authenticated USING (public.is_admin(auth.uid()) AND user_id = auth.uid()) WITH CHECK (public.is_admin(auth.uid()) AND user_id = auth.uid())';
    EXECUTE 'DROP POLICY IF EXISTS "admins test push subscriptions" ON public.admin_push_subscriptions';
    EXECUTE 'CREATE POLICY "admins test push subscriptions" ON public.admin_push_subscriptions FOR SELECT TO authenticated USING (public.is_admin(auth.uid()))';
  END IF;
END $$;
