
-- Fase 4: Importação de produtos (AliExpress + genérico)

CREATE TABLE public.product_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL, -- 'aliexpress_url' | 'aliexpress_api' | 'csv' | 'json' | 'manual'
  source_url text,
  source_id text,
  status text NOT NULL DEFAULT 'draft', -- draft | imported | failed | archived
  raw_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  normalized_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  markup_percent numeric,
  markup_fixed numeric,
  imported_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX product_imports_status_idx ON public.product_imports(status);
CREATE INDEX product_imports_source_idx ON public.product_imports(source);
CREATE INDEX product_imports_product_idx ON public.product_imports(product_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_imports TO authenticated;
GRANT ALL ON public.product_imports TO service_role;

ALTER TABLE public.product_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Catalog team can read imports"
  ON public.product_imports FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'superadmin')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'catalog')
  );

CREATE POLICY "Catalog team can insert imports"
  ON public.product_imports FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'superadmin')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'catalog')
  );

CREATE POLICY "Catalog team can update imports"
  ON public.product_imports FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'superadmin')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'catalog')
  );

CREATE POLICY "Catalog team can delete imports"
  ON public.product_imports FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'superadmin')
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE TRIGGER product_imports_set_updated_at
  BEFORE UPDATE ON public.product_imports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
