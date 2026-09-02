DELETE FROM public.visitor_sessions a
USING public.visitor_sessions b
WHERE a.session_id = b.session_id
  AND (a.last_seen_at, a.id) < (b.last_seen_at, b.id);

CREATE UNIQUE INDEX IF NOT EXISTS visitor_sessions_session_id_key
  ON public.visitor_sessions (session_id);