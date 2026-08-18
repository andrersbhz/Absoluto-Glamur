-- GTM container IDs are public by design because they are embedded in storefront HTML.
-- Expose only the validated ID, never the integrations row or any secret field.
CREATE OR REPLACE FUNCTION public.get_public_gtm_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN enabled IS TRUE AND COALESCE(api_key, '') ~* '^GTM-[A-Z0-9]+$'
      THEN api_key
    ELSE NULL
  END
  FROM public.integrations
  WHERE provider = 'google_tag_manager'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_gtm_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_gtm_id() TO anon, authenticated;
