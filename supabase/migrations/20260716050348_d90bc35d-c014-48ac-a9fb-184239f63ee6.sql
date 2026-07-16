
CREATE TABLE public.ai_generations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  purpose TEXT NOT NULL,
  model TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'lovable-ai',
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  output TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER,
  latency_ms INTEGER,
  cost_usd NUMERIC(10,6),
  status TEXT NOT NULL DEFAULT 'success',
  error TEXT,
  related_kind TEXT,
  related_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ai_generations_user_idx ON public.ai_generations(user_id, created_at DESC);
CREATE INDEX ai_generations_purpose_idx ON public.ai_generations(purpose, created_at DESC);

GRANT SELECT, INSERT ON public.ai_generations TO authenticated;
GRANT ALL ON public.ai_generations TO service_role;

ALTER TABLE public.ai_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins e catálogo leem geração IA"
ON public.ai_generations FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'superadmin')
  OR public.has_role(auth.uid(), 'catalog')
);

CREATE POLICY "Admins e catálogo criam geração IA"
ON public.ai_generations FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'superadmin')
  OR public.has_role(auth.uid(), 'catalog')
);
