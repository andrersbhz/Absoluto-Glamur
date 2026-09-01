DROP POLICY IF EXISTS "Admins delete own push subs" ON public.admin_push_subscriptions;
CREATE POLICY "Admins delete own push subs"
ON public.admin_push_subscriptions
FOR DELETE
TO authenticated
USING (user_id = auth.uid() AND public.is_admin(auth.uid()));