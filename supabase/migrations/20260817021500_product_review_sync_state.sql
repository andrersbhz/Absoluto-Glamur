create table if not exists public.product_review_sync_state (
  product_id uuid primary key references public.products(id) on delete cascade,
  source text not null default 'aliexpress',
  source_id text,
  status text not null default 'pending' check (status in ('pending','running','ok','empty','error')),
  fetched_count integer not null default 0,
  remote_total integer,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.product_review_sync_state enable row level security;
revoke all on public.product_review_sync_state from anon, authenticated;
