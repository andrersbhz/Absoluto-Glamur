UPDATE public.integrations
SET config = (config - 'access_token' - 'refresh_token' - 'expires_in' - 'refresh_expires_in' - 'refreshed_at')
           || jsonb_build_object('reauth_required', true, 'reauth_required_at', now()::text),
    enabled = false,
    last_status = 'error',
    last_error = 'Refresh token AliExpress expirado — clique em Autorizar AliExpress para reconectar.',
    last_verified_at = now()
WHERE provider = 'aliexpress';