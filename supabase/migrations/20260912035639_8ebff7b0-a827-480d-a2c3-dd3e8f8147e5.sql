do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='whatsapp_conversations') then
    execute 'alter publication supabase_realtime add table public.whatsapp_conversations';
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='whatsapp_messages') then
    execute 'alter publication supabase_realtime add table public.whatsapp_messages';
  end if;
end $$;