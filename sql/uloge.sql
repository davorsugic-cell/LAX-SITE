-- Uloga radnika: 'radnik' (Termini, Narudžbe, Klijenti, Provjera) ili 'admin' (sve)
alter table public.lax_staff add column if not exists role text not null default 'radnik';
alter table public.lax_staff drop constraint if exists lax_staff_role_chk;
alter table public.lax_staff add constraint lax_staff_role_chk check (role in ('radnik','admin'));

-- postojeći admini koji su već povezani kao radnici
update public.lax_staff s set role = 'admin'
  where s.user_id is not null and exists (select 1 from public.lax_admins a where a.user_id = s.user_id);

create or replace function public.lax_set_staff_role(p_staff uuid, p_role text)
returns text language plpgsql security definer set search_path = public as $f$
declare u uuid;
begin
  if not public.lax_is_admin() then raise exception 'Samo admin'; end if;
  if p_role not in ('radnik','admin') then raise exception 'Nepoznata uloga'; end if;
  select user_id into u from lax_staff where id = p_staff;
  if p_role = 'radnik' and u = auth.uid() then raise exception 'Ne možeš sebi ukinuti admin prava'; end if;
  update lax_staff set role = p_role where id = p_staff;
  if u is not null then
    if p_role = 'admin' then
      insert into lax_admins (user_id) values (u) on conflict do nothing;
    else
      delete from lax_admins where user_id = u;
    end if;
  end if;
  return p_role;
end $f$;
grant execute on function public.lax_set_staff_role(uuid, text) to authenticated;

-- kad se prijava ukloni ili promijeni, admin prava idu za ulogom
create or replace function public.lax_staff_role_sync()
returns trigger language plpgsql security definer set search_path = public as $f$
begin
  if old.user_id is not null and old.user_id is distinct from new.user_id and old.role = 'admin' then
    delete from lax_admins where user_id = old.user_id;
  end if;
  if new.user_id is not null and new.role = 'admin' then
    insert into lax_admins (user_id) values (new.user_id) on conflict do nothing;
  end if;
  return new;
end $f$;
drop trigger if exists lax_staff_role_sync on public.lax_staff;
create trigger lax_staff_role_sync after update of user_id, role on public.lax_staff
  for each row execute function public.lax_staff_role_sync();
