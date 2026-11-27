-- Admin mijenja PIN/lozinku radniku (i radniku s ulogom admin) bez Edge funkcije.
-- Vlasnički admin nalozi (koji nisu napravljeni kroz Radnike) i tvoj vlastiti nalog se ovdje ne mogu mijenjati.
create or replace function public.lax_staff_password(p_staff uuid, p_password text)
returns text language plpgsql security definer set search_path = public, extensions, auth as $f$
declare st record;
begin
  if not public.lax_is_admin() then raise exception 'Samo admin'; end if;
  if coalesce(length(p_password), 0) < 8 then raise exception 'Lozinka je prekratka'; end if;
  select * into st from public.lax_staff where id = p_staff;
  if st.id is null then raise exception 'Radnik ne postoji'; end if;
  if st.user_id is null then raise exception 'Radnik nema prijavu'; end if;
  if st.user_id = auth.uid() then raise exception 'Svoju lozinku mijenjaš sam'; end if;
  if st.role <> 'admin' and exists (select 1 from public.lax_admins where user_id = st.user_id) then
    raise exception 'Ovo je vlasnički admin nalog — lozinku mijenja sam vlasnik';
  end if;
  update auth.users set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')), updated_at = now()
    where id = st.user_id;
  return 'ok';
end $f$;
revoke all on function public.lax_staff_password(uuid, text) from public, anon;
grant execute on function public.lax_staff_password(uuid, text) to authenticated;
