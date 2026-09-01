-- Global commerce baseline: reproducible international schema, exchange rates and Mercado Pago.
create table if not exists public.regions (
  id uuid primary key default gen_random_uuid(), code text not null unique, name text not null,
  countries text[] not null default '{}', locale text not null default 'pt-BR', currency text not null default 'BRL',
  markup_pct numeric(8,2) not null default 0, rounding text not null default 'none', position integer not null default 0,
  is_active boolean not null default true, is_default boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.regions enable row level security;
grant select on public.regions to anon, authenticated;
drop policy if exists "Public reads active regions" on public.regions;
create policy "Public reads active regions" on public.regions for select to anon, authenticated using (is_active = true);

create table if not exists public.product_translations (
  id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id) on delete cascade,
  locale text not null, name text, short_description text, description text, variants jsonb not null default '{}', seo jsonb not null default '{}',
  provider text, model text, is_stale boolean not null default false, translated_at timestamptz not null default now(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(product_id, locale)
);
alter table public.product_translations enable row level security;
grant select on public.product_translations to anon, authenticated;
drop policy if exists "Public reads product translations" on public.product_translations;
create policy "Public reads product translations" on public.product_translations for select to anon, authenticated using (true);

create table if not exists public.exchange_rates (
  id uuid primary key default gen_random_uuid(), base_currency text not null default 'BRL', target_currency text not null,
  rate numeric(18,8) not null check (rate > 0), margin_pct numeric(8,2) not null default 2,
  source text not null default 'seed', fetched_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(base_currency, target_currency)
);
alter table public.exchange_rates enable row level security;
grant select on public.exchange_rates to anon, authenticated;
drop policy if exists "Public reads exchange rates" on public.exchange_rates;
create policy "Public reads exchange rates" on public.exchange_rates for select to anon, authenticated using (true);

insert into public.regions (code, name, countries, locale, currency, markup_pct, position, is_default) values
  ('BR','Brasil',array['BR'],'pt-BR','BRL',0,1,true),
  ('US_CA','Estados Unidos e Canadá',array['US','CA'],'en-US','USD',5,2,false),
  ('LATAM_MX','México',array['MX'],'es-MX','MXN',5,3,false),
  ('LATAM','América Latina',array['CO','CL','AR','PE','UY'],'es','USD',7,4,false),
  ('EU','União Europeia',array['FR','DE','IT','ES','PT'],'en-US','EUR',8,5,false),
  ('UK','Reino Unido',array['GB'],'en-US','GBP',8,6,false)
on conflict (code) do update set name=excluded.name,countries=excluded.countries,locale=excluded.locale,currency=excluded.currency,markup_pct=excluded.markup_pct,position=excluded.position,is_default=excluded.is_default,is_active=true;

insert into public.exchange_rates (base_currency,target_currency,rate,margin_pct,source) values
 ('BRL','USD',0.185,2,'seed'),('BRL','EUR',0.170,2,'seed'),('BRL','GBP',0.145,2,'seed'),
 ('BRL','CAD',0.255,2,'seed'),('BRL','MXN',3.400,2,'seed'),('BRL','COP',735,2,'seed'),
 ('BRL','CLP',170,2,'seed'),('BRL','ARS',250,2,'seed'),('BRL','PEN',0.640,2,'seed')
on conflict (base_currency,target_currency) do nothing;

insert into public.integrations (provider,category,display_name,description,enabled,mode,config)
values ('mercadopago','payments','Mercado Pago','PIX, cartão e boleto via Checkout Pro.',false,'sandbox','{"checkout_origin":"https://www.absolutoglamur.com.br"}'::jsonb)
on conflict (provider) do update set category='payments',display_name='Mercado Pago',description='PIX, cartão e boleto via Checkout Pro.';

insert into public.payment_method_routing (method,provider,enabled,display_label,sort_order) values
 ('pix','mercadopago',false,'PIX com Mercado Pago',10),
 ('credit_card','mercadopago',false,'Cartão com Mercado Pago',20),
 ('boleto','mercadopago',false,'Boleto com Mercado Pago',30)
on conflict (method) do nothing;

-- Existing orders remain BRL; country and localized postal data live in shipping_address JSONB.
alter table public.orders alter column currency set default 'BRL';
