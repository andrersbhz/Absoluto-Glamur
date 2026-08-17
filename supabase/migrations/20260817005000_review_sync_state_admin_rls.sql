grant select, insert, update on table public.product_review_sync_state to authenticated;

drop policy if exists "Admins and catalog manage review sync state" on public.product_review_sync_state;
create policy "Admins and catalog manage review sync state"
on public.product_review_sync_state
for all
to authenticated
using (
  public.is_admin(auth.uid())
  or public.has_role(auth.uid(), 'catalog'::public.app_role)
)
with check (
  public.is_admin(auth.uid())
  or public.has_role(auth.uid(), 'catalog'::public.app_role)
);
