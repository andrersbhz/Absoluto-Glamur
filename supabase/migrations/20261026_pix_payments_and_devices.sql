-- Pix payments and registered Android devices. Execute only after checking the existing orders schema.
create extension if not exists pgcrypto;
create table if not exists public.pix_payments (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null,
 txid text unique not null,
 provider text not null,
 amount_cents bigint not null check (amount_cents > 0),
 status text not null default 'pending' check (status in ('pending','paid','expired','refunded')),
 provider_end_to_end_id text unique,
 created_at timestamptz not null default now(),
 paid_at timestamptz
);
create index if not exists pix_payments_order_id_idx on public.pix_payments(order_id);
create table if not exists public.admin_push_devices (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 fcm_token text not null unique,
 platform text not null default 'android' check (platform = 'android'),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.pix_payments enable row level security;
alter table public.admin_push_devices enable row level security;
-- No client-side payment writes or reads. Only trusted server processes may access pix_payments.
revoke all on public.pix_payments from anon, authenticated;
create policy "Owner reads own devices" on public.admin_push_devices for select to authenticated using (auth.uid() = user_id);
create policy "Owner registers own devices" on public.admin_push_devices for insert to authenticated with check (auth.uid() = user_id);
create policy "Owner unregisters own devices" on public.admin_push_devices for delete to authenticated using (auth.uid() = user_id);
-- Restrict device registration to verified store administrators in the server route before issuing Firebase pushes.
