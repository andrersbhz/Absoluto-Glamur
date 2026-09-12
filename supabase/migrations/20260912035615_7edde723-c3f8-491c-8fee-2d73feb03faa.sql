alter type public.whatsapp_message_status add value if not exists 'pending';
alter type public.whatsapp_message_status add value if not exists 'received';

alter table if exists public.whatsapp_messages
  add column if not exists provider_message_id text;

create index if not exists whatsapp_messages_provider_message_id_idx
  on public.whatsapp_messages(provider_message_id)
  where provider_message_id is not null;

create index if not exists whatsapp_messages_pending_outbox_idx
  on public.whatsapp_messages(status, created_at)
  where direction = 'outbound';

create index if not exists whatsapp_messages_conversation_idx
  on public.whatsapp_messages(conversation_id, created_at);

create index if not exists whatsapp_conversations_active_contact_idx
  on public.whatsapp_conversations(contact_id, status, last_message_at desc);

create unique index if not exists whatsapp_contacts_phone_unique_idx
  on public.whatsapp_contacts(phone);

grant select, insert, update, delete on public.whatsapp_contacts to authenticated;
grant select, insert, update, delete on public.whatsapp_conversations to authenticated;
grant select, insert, update, delete on public.whatsapp_messages to authenticated;
grant select, insert, update, delete on public.whatsapp_internal_notes to authenticated;
grant select, insert, update, delete on public.whatsapp_tags to authenticated;
grant select, insert, update, delete on public.whatsapp_conversation_tags to authenticated;

grant all on public.whatsapp_contacts to service_role;
grant all on public.whatsapp_conversations to service_role;
grant all on public.whatsapp_messages to service_role;
grant all on public.whatsapp_internal_notes to service_role;
grant all on public.whatsapp_tags to service_role;
grant all on public.whatsapp_conversation_tags to service_role;

alter table public.whatsapp_conversations replica identity full;
alter table public.whatsapp_messages replica identity full;
