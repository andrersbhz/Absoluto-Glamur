alter table if exists public.whatsapp_messages
  add column if not exists provider_message_id text;

create index if not exists whatsapp_messages_provider_message_id_idx
  on public.whatsapp_messages(provider_message_id)
  where provider_message_id is not null;

create index if not exists whatsapp_messages_pending_outbox_idx
  on public.whatsapp_messages(status, created_at)
  where direction = 'outbound';

create index if not exists whatsapp_conversations_active_contact_idx
  on public.whatsapp_conversations(contact_id, status, last_message_at desc);

-- Required by the QR worker upsert. If this index fails because duplicate phones
-- already exist, deduplicate whatsapp_contacts.phone before re-running the migration.
create unique index if not exists whatsapp_contacts_phone_unique_idx
  on public.whatsapp_contacts(phone);
