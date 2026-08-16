-- Migração para Analytics em Tempo Real, Mapa e Inteligência Comercial

-- 1. Tipos de Evento e Status
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'visitor_funnel_stage') THEN
        CREATE TYPE public.visitor_funnel_stage AS ENUM ('browsing', 'product_view', 'cart', 'checkout', 'purchased');
    END IF;
END $$;

-- 2. Tabela de Sessões de Visitantes
CREATE TABLE IF NOT EXISTS public.visitor_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visitor_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    
    -- Geolocalização aproximada (LGPD compliant)
    country TEXT,
    state TEXT,
    city TEXT,
    latitude_approx DECIMAL(9,6),
    longitude_approx DECIMAL(9,6),
    
    -- Dispositivo e Origem
    device_type TEXT,
    browser TEXT,
    os TEXT,
    referrer TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_content TEXT,
    utm_term TEXT,
    
    -- Estado atual
    current_page TEXT,
    funnel_stage visitor_funnel_stage DEFAULT 'browsing',
    last_seen_at TIMESTAMPTZ DEFAULT now(),
    is_online BOOLEAN DEFAULT true,
    
    -- Métricas da sessão
    cart_value_cents INTEGER DEFAULT 0,
    items_count INTEGER DEFAULT 0,
    converted BOOLEAN DEFAULT false,
    
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Tabela de Eventos de Analytics
CREATE TABLE IF NOT EXISTS public.analytics_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES public.visitor_sessions(id) ON DELETE CASCADE,
    visitor_id TEXT,
    event_name TEXT NOT NULL,
    page_path TEXT,
    product_id UUID,
    product_name TEXT,
    value_cents INTEGER,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Permissões e Segurança
GRANT SELECT, INSERT, UPDATE ON public.visitor_sessions TO authenticated, anon;
GRANT ALL ON public.visitor_sessions TO service_role;

GRANT INSERT ON public.analytics_events TO authenticated, anon;
GRANT SELECT ON public.analytics_events TO authenticated;
GRANT ALL ON public.analytics_events TO service_role;

-- RLS
ALTER TABLE public.visitor_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- Políticas
CREATE POLICY "Public can insert sessions" ON public.visitor_sessions FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Public can update own session" ON public.visitor_sessions FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "Admins can view all sessions" ON public.visitor_sessions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'));

CREATE POLICY "Public can insert events" ON public.analytics_events FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Admins can view all events" ON public.analytics_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'));

-- 5. Realtime
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.visitor_sessions;
    END IF;
END $$;

-- 6. Função para marcar offline sessões inativas
CREATE OR REPLACE FUNCTION public.cleanup_offline_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.visitor_sessions
    SET is_online = false
    WHERE last_seen_at < now() - interval '2 minutes'
      AND is_online = true;
END;
$$;

-- 7. Índices para performance
CREATE INDEX IF NOT EXISTS idx_visitor_sessions_online ON public.visitor_sessions(is_online) WHERE is_online = true;
CREATE INDEX IF NOT EXISTS idx_visitor_sessions_last_seen ON public.visitor_sessions(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_session ON public.analytics_events(session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created ON public.analytics_events(created_at);
