-- Enforce one unresolved manual Pix per order to prevent concurrent duplicate payment generation.
create unique index if not exists one_pending_manual_pix_per_order
on public.payments(order_id)
where provider='pix_manual' and status='pending';
