-- Admin user management without exposing auth.users or requiring service-role in the UI.
-- The functions execute with the migration owner's privileges but always validate
-- the caller from auth.uid() before returning or changing anything.

CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  phone text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  email_confirmed_at timestamptz,
  roles text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso restrito a administradores' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.email::text,
    p.full_name,
    p.phone,
    u.created_at,
    u.last_sign_in_at,
    u.email_confirmed_at,
    COALESCE(
      array_agg(DISTINCT ur.role::text) FILTER (WHERE ur.role IS NOT NULL),
      ARRAY[]::text[]
    ) AS roles
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  LEFT JOIN public.user_roles ur ON ur.user_id = u.id
  GROUP BY u.id, u.email, p.full_name, p.phone, u.created_at, u.last_sign_in_at, u.email_confirmed_at
  ORDER BY u.created_at DESC
  LIMIT 100;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_user_roles(
  target_user_id uuid,
  role_names text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  superadmin_count integer;
  target_is_superadmin boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'superadmin'::public.app_role) THEN
    RAISE EXCEPTION 'Apenas superadmins podem alterar permissões' USING ERRCODE = '42501';
  END IF;

  IF target_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = target_user_id) THEN
    RAISE EXCEPTION 'Usuário não encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF role_names IS NULL OR cardinality(role_names) = 0 THEN
    RAISE EXCEPTION 'Informe ao menos uma permissão';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(role_names) AS role_name
    WHERE role_name NOT IN (
      'superadmin','admin','catalog','marketing','finance','support',
      'logistics','analyst','compliance','customer'
    )
  ) THEN
    RAISE EXCEPTION 'Permissão inválida';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = target_user_id AND role = 'superadmin'::public.app_role
  ) INTO target_is_superadmin;

  IF target_is_superadmin AND NOT ('superadmin' = ANY(role_names)) THEN
    SELECT count(DISTINCT user_id)
    INTO superadmin_count
    FROM public.user_roles
    WHERE role = 'superadmin'::public.app_role;

    IF superadmin_count <= 1 THEN
      RAISE EXCEPTION 'Não é possível remover o último superadmin do sistema';
    END IF;
  END IF;

  DELETE FROM public.user_roles WHERE user_id = target_user_id;

  INSERT INTO public.user_roles (user_id, role)
  SELECT target_user_id, role_name::public.app_role
  FROM (SELECT DISTINCT unnest(role_names) AS role_name) AS normalized;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, metadata)
  VALUES (
    auth.uid(),
    'admin.user_roles.update',
    'user_roles',
    target_user_id,
    jsonb_build_object('roles', role_names)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_users() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_user_roles(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_roles(uuid, text[]) TO authenticated;
