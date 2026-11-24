-- Radnici vide narudžbe i mogu mijenjati status (brisanje ostaje samo adminu)
drop policy if exists lax_orders_staff_read on public.lax_orders;
create policy lax_orders_staff_read on public.lax_orders for select to authenticated
  using (public.lax_is_staff());
drop policy if exists lax_orders_staff_update on public.lax_orders;
create policy lax_orders_staff_update on public.lax_orders for update to authenticated
  using (public.lax_is_staff()) with check (public.lax_is_staff());
