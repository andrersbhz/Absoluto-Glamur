-- Adicionar colunas necessárias para Analytics Avançado em visitor_sessions
ALTER TABLE public.visitor_sessions 
ADD COLUMN IF NOT EXISTS latitude float8,
ADD COLUMN IF NOT EXISTS longitude float8,
ADD COLUMN IF NOT EXISTS referrer text,
ADD COLUMN IF NOT EXISTS entry_path text;

-- Grants para analytics_events
GRANT ALL ON public.analytics_events TO authenticated;
GRANT ALL ON public.analytics_events TO service_role;
GRANT INSERT ON public.analytics_events TO anon;

-- Grants para visitor_sessions (permitir anon inserir/atualizar sua própria sessão)
GRANT INSERT, UPDATE, SELECT ON public.visitor_sessions TO anon;
GRANT ALL ON public.visitor_sessions TO authenticated;
GRANT ALL ON public.visitor_sessions TO service_role;
