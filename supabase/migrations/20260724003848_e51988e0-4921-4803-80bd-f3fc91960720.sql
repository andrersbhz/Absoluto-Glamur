UPDATE public.integrations
SET config = (config - 'reauth_required' - 'reauth_required_at'),
    enabled = true,
    last_status = 'ok',
    last_error = NULL
WHERE provider = 'aliexpress'
  AND (config->>'access_token') IS NOT NULL;