
-- 1) Restrict permissions & role_permissions reads to admins
DROP POLICY IF EXISTS permissions_read_all_auth ON public.permissions;
DROP POLICY IF EXISTS role_permissions_read_all_auth ON public.role_permissions;

CREATE POLICY permissions_read_admin ON public.permissions
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY role_permissions_read_admin ON public.role_permissions
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

-- 2) Site settings: split public-safe vs sensitive keys
DROP POLICY IF EXISTS "site_settings public read" ON public.site_settings;

CREATE POLICY "site_settings public read safe" ON public.site_settings
  FOR SELECT TO anon, authenticated
  USING (key IN ('site_identity', 'social_links'));

CREATE POLICY "site_settings admin read all" ON public.site_settings
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

-- 3) Move SECURITY DEFINER helpers out of exposed public schema
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

ALTER FUNCTION public.is_admin(uuid) SET SCHEMA private;
ALTER FUNCTION public.has_role(uuid, public.app_role) SET SCHEMA private;

-- Keep authenticated EXECUTE so RLS policies (which reference these by OID) keep working
GRANT EXECUTE ON FUNCTION private.is_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;

-- Thin SECURITY INVOKER wrappers in public so existing client RPC calls keep working
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _user_id = auth.uid() THEN private.is_admin(_user_id)
    WHEN private.is_admin(auth.uid()) THEN private.is_admin(_user_id)
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _user_id = auth.uid() THEN private.has_role(_user_id, _role)
    WHEN private.is_admin(auth.uid()) THEN private.has_role(_user_id, _role)
    ELSE NULL
  END
$$;

REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
