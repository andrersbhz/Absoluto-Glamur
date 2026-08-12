-- Ordem editorial da vitrine pública.
-- Mantém Skincare como primeira categoria e Fitness como última,
-- preservando a ordem relativa das demais categorias atuais.
update public.categories
set position = case slug
  when 'skincare' then 0
  when 'maquiagem' then 10
  when 'cabelos' then 20
  when 'perfumaria' then 30
  when 'corpo-banho' then 40
  when 'fitness' then 9990
  else position
end
where slug in ('skincare', 'maquiagem', 'cabelos', 'perfumaria', 'corpo-banho', 'fitness');
