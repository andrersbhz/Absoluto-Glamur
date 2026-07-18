INSERT INTO public.integrations (provider, category, display_name, description, enabled, mode)
VALUES ('aliexpress', 'import', 'AliExpress Open Platform', 'OAuth do AliExpress para importar produtos com App Key/App Secret/Refresh Token.', false, 'production')
ON CONFLICT (provider) DO NOTHING;