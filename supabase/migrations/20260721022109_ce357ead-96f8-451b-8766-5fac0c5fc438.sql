
DROP POLICY IF EXISTS "site_settings public read safe" ON public.site_settings;
CREATE POLICY "site_settings public read safe" ON public.site_settings
  FOR SELECT
  TO anon, authenticated
  USING (key = ANY (ARRAY['site_identity','social_links','home_content']));

INSERT INTO public.site_settings (key, value, description)
VALUES (
  'home_content',
  jsonb_build_object(
    'announcement', jsonb_build_object(
      'enabled', true,
      'text', 'Frete grátis acima de R$ 299 · Embalagem assinatura'
    ),
    'hero', jsonb_build_object(
      'badge', 'Maison de Beleza',
      'title_line1', 'Beleza rara,',
      'title_highlight', 'assinatura sua.',
      'subtitle', 'Uma curadoria autoral de skincare, maquiagem e cabelos — selecionada como joias, tratada como ritual. Cada frasco carrega uma promessa cumprida.',
      'cta_primary_label', 'Explorar coleção',
      'cta_primary_href', '/products',
      'cta_secondary_label', 'Edições limitadas',
      'cta_secondary_href', '/products?collection=promocoes',
      'monogram', 'A·G',
      'seal_left', 'Maison Absoluto',
      'seal_right', 'Est. 2025',
      'image_url', ''
    ),
    'trust_badges', jsonb_build_array(
      jsonb_build_object('label', 'Ingredientes verificados'),
      jsonb_build_object('label', 'Envio assinatura'),
      jsonb_build_object('label', 'Atendimento private')
    ),
    'manifesto', jsonb_build_object(
      'enabled', true,
      'eyebrow', 'Manifesto',
      'body', 'Beleza não é excesso — é escolha. Selecionamos cada produto como se escolhêssemos uma joia: pelo brilho verdadeiro, pela permanência e pelo toque que fica.',
      'signature', 'Absoluto Glamur'
    ),
    'pillars', jsonb_build_object(
      'enabled', true,
      'eyebrow', 'Uma experiência',
      'title', 'O padrão Absoluto',
      'items', jsonb_build_array(
        jsonb_build_object('icon','sparkles','title','Curadoria autoral','body','Seleção rigorosa de produtos com foco em resultado real e sensorial refinado.'),
        jsonb_build_object('icon','shield','title','Conformidade cosmética','body','Fabricantes e ingredientes verificados antes de qualquer publicação.'),
        jsonb_build_object('icon','truck','title','Envio assinatura','body','Embalagem cuidada e rastreio em tempo real em cada entrega.')
      )
    )
  ),
  'Conteúdo editorial da homepage (textos, CTAs e imagens).'
)
ON CONFLICT (key) DO NOTHING;
