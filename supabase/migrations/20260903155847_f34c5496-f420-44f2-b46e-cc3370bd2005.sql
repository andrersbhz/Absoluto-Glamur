CREATE TABLE public.discount_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('global','category','product')),
  target_id uuid,
  percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (percent >= 0 AND percent <= 100),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT discount_settings_scope_target CHECK (
    (scope = 'global' AND target_id IS NULL) OR (scope <> 'global' AND target_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX discount_settings_global_uniq ON public.discount_settings (scope) WHERE scope = 'global';
CREATE UNIQUE INDEX discount_settings_target_uniq ON public.discount_settings (scope, target_id) WHERE target_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.discount_settings TO authenticated;
GRANT ALL ON public.discount_settings TO service_role;

ALTER TABLE public.discount_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "discount_settings_admin_all" ON public.discount_settings
  FOR ALL TO authenticated
  USING (private.is_admin(auth.uid()) OR private.has_role(auth.uid(), 'catalog'::app_role) OR private.has_role(auth.uid(), 'finance'::app_role))
  WITH CHECK (private.is_admin(auth.uid()) OR private.has_role(auth.uid(), 'catalog'::app_role) OR private.has_role(auth.uid(), 'finance'::app_role));

CREATE TRIGGER discount_settings_set_updated_at BEFORE UPDATE ON public.discount_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();