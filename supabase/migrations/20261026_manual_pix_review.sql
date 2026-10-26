-- Manual PIX approval uses the existing orders and payments tables.
-- Does NOT verify bank settlement. Operator must first check Nubank independently.
create table if not exists public.manual_pix_reviews (
  payment_id uuid primary key references public.payments(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  decision text not null check (decision in ('approved','rejected')),
  reviewer_id uuid not null references auth.users(id),
  reviewed_at timestamptz not null default now(),
  note text
);
create index if not exists manual_pix_reviews_order_idx on public.manual_pix_reviews(order_id);
alter table public.manual_pix_reviews enable row level security;
revoke all on public.manual_pix_reviews from anon, authenticated;
create or replace function public.list_pending_manual_pix()
returns table (payment_id uuid, order_id uuid, order_code text, customer_name text, amount_cents bigint, created_at timestamptz)
language sql security definer set search_path = ''
as $$
 select p.id, o.id, o.code, o.customer_name, p.amount_cents::bigint, p.created_at
 from public.payments p join public.orders o on o.id = p.order_id
 where exists (select 1 from public.user_roles ur where ur.user_id = (select auth.uid()) and ur.role in ('admin','superadmin','finance'))
   and p.provider = 'manual_nubank' and p.method = 'pix' and p.status = 'pending'
   and o.status in ('pending','awaiting_payment')
 order by p.created_at desc
 limit 100;
$$;
revoke all on function public.list_pending_manual_pix() from public;
grant execute on function public.list_pending_manual_pix() to authenticated;

create or replace function public.review_manual_pix(p_payment_id uuid, p_approve boolean, p_note text default null)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare v_order_id uuid; v_amount bigint; v_total bigint; v_state text;
begin
 if not exists (select 1 from public.user_roles where user_id=auth.uid() and role in ('admin','superadmin','finance')) then
   raise exception 'Forbidden';
 end if;
 select p.order_id,p.amount_cents,o.total_cents,o.status::text
 into v_order_id,v_amount,v_total,v_state
 from public.payments p join public.orders o on o.id=p.order_id
 where p.id=p_payment_id and p.provider='manual_nubank' and p.method='pix' and p.status='pending'
 for update of p,o;
 if not found then raise exception 'Payment already reviewed or not eligible'; end if;
 if v_state not in ('pending','awaiting_payment') or v_amount <> v_total or v_amount <= 0 then
    raise exception 'Order amount/status mismatch';
 end if;
 if p_approve and exists (select 1 from public.payments where order_id=v_order_id and id<>p_payment_id and status in ('confirmed','received')) then
    raise exception 'Other payment already settled';
 end if;
 insert into public.manual_pix_reviews(payment_id,order_id,decision,reviewer_id,note)
 values (p_payment_id,v_order_id,case when p_approve then 'approved' else 'rejected' end,auth.uid(),left(p_note,1000));
 if p_approve then
   update public.payments set status='confirmed',paid_at=now(),updated_at=now(),approval_code='MANUAL-NUBANK' where id=p_payment_id;
   update public.orders set status='paid',paid_at=now(),updated_at=now() where id=v_order_id;
 else
   update public.payments set status='cancelled',updated_at=now() where id=p_payment_id;
   -- Rejection does not cancel the order; merchant may offer another payment attempt.
 end if;
 return true;
end;
$$;
revoke all on function public.review_manual_pix(uuid,boolean,text) from public;
grant execute on function public.review_manual_pix(uuid,boolean,text) to authenticated;
