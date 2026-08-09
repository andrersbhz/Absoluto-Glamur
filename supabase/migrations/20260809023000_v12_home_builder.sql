-- v1.2 Home Builder
-- Preserva os blocos atuais e garante que todas as categorias possam aparecer automaticamente.

DO $$
BEGIN
  IF to_regclass('public.homepage_blocks') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.homepage_blocks WHERE kind = 'category_grid') THEN
      INSERT INTO public.homepage_blocks (kind, title, subtitle, data, position, is_active)
      VALUES (
        'category_grid',
        'Explore por categoria',
        'Encontre sua rotina ideal',
        '{"mode":"all","columns":4}'::jsonb,
        COALESCE((SELECT max(position) + 10 FROM public.homepage_blocks), 10),
        true
      );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.homepage_blocks WHERE kind = 'category_products') THEN
      INSERT INTO public.homepage_blocks (kind, title, subtitle, data, position, is_active)
      VALUES (
        'category_products',
        'Todas as categorias',
        'Novidades e mais vendidos',
        '{"mode":"all","limit":4}'::jsonb,
        COALESCE((SELECT max(position) + 10 FROM public.homepage_blocks), 20),
        true
      );
    END IF;
  END IF;
END $$;
