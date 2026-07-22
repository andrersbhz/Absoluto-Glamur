
-- 1) Make role helpers explicit false in the ELSE branch
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN _user_id = auth.uid() THEN private.has_role(_user_id, _role)
    WHEN private.is_admin(auth.uid()) THEN private.has_role(_user_id, _role)
    ELSE false
  END
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN _user_id = auth.uid() THEN private.is_admin(_user_id)
    WHEN private.is_admin(auth.uid()) THEN private.is_admin(_user_id)
    ELSE false
  END
$$;

-- 2) Remove anonymous read on payment_method_routing.
-- Server functions use the service role client to expose only what the storefront needs.
DROP POLICY IF EXISTS "public read routing enabled" ON public.payment_method_routing;
REVOKE SELECT ON public.payment_method_routing FROM anon;
