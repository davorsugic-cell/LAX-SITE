-- =====================================================================
-- LAX — PRAVILA BODOVANJA (mijenja admin u Admin → Radnici → Pravila bodovanja)
-- =====================================================================
create table if not exists public.lax_loyalty (
  id boolean primary key default true check (id),
  km_per_point numeric(10,2) not null default 1 check (km_per_point > 0),   -- koliko KM za 1 bod
  welcome_points int not null default 20 check (welcome_points >= 0),       -- bodovi dobrodošlice
  double_mult numeric(4,2) not null default 2 check (double_mult >= 1),     -- množilac za dopunu (1 = isključeno)
  double_days int not null default 28 check (double_days between 1 and 365),-- dopuna "na vrijeme" = u roku od X dana
  double_categories text[] not null default '{nokti,trepavice,kosa}',       -- usluge kod kojih važi dopuna
  excluded_categories text[] not null default '{edukacije}',                -- usluge bez bodova
  valid_months int not null default 12 check (valid_months between 1 and 120), -- bodovi važe X mjeseci od zadnje posjete
  updated_at timestamptz not null default now()
);
insert into public.lax_loyalty (id) values (true) on conflict (id) do nothing;

alter table public.lax_loyalty enable row level security;
drop policy if exists lax_loyalty_read on public.lax_loyalty;
create policy lax_loyalty_read on public.lax_loyalty for select to authenticated using (public.lax_is_staff());
drop policy if exists lax_loyalty_admin on public.lax_loyalty;
create policy lax_loyalty_admin on public.lax_loyalty for update to authenticated
  using (public.lax_is_admin()) with check (public.lax_is_admin());
grant select, update on public.lax_loyalty to authenticated;

-- bodovi dobrodošlice prema pravilima
create or replace function public.lax_client_welcome()
returns trigger language plpgsql security definer set search_path = public as $f$
declare w int;
begin
  select welcome_points into w from lax_loyalty where id;
  w := coalesce(w, 20);
  if w > 0 then
    insert into lax_points (client_id, delta, reason) values (new.id, w, 'Dobrodošlica');
  end if;
  return new;
end $f$;

-- bodovi za završen termin prema pravilima
create or replace function public.lax_set_status(p_id uuid, p_status text, p_price numeric default null)
returns jsonb language plpgsql security definer set search_path = public as $f$
declare a record; L record; pts int := 0; dbl boolean := false;
begin
  if not public.lax_is_staff() then raise exception 'Nemate pristup'; end if;
  select * into a from lax_appointments where id = p_id for update;
  if not found then raise exception 'Termin ne postoji'; end if;
  if p_status not in ('zakazan','zavrsen','otkazan','nije_dosla') then raise exception 'Nepoznat status'; end if;
  select * into L from lax_loyalty where id;
  update lax_appointments set status = p_status, price = coalesce(p_price, price) where id = p_id;
  delete from lax_points where appointment_id = p_id;
  if p_status = 'zavrsen' and a.client_id is not null
     and not (coalesce(a.category,'') = any(coalesce(L.excluded_categories, '{edukacije}'))) then
    dbl := coalesce(L.double_mult, 2) > 1
      and a.category = any(coalesce(L.double_categories, '{nokti,trepavice,kosa}'))
      and exists (select 1 from lax_appointments b where b.client_id = a.client_id and b.category = a.category
        and b.status = 'zavrsen' and b.id <> a.id
        and b.starts_at < a.starts_at and b.starts_at >= a.starts_at - make_interval(days => coalesce(L.double_days, 28)));
    pts := floor(coalesce(p_price, a.price, 0) / coalesce(L.km_per_point, 1)
                 * (case when dbl then coalesce(L.double_mult, 2) else 1 end))::int;
    if pts > 0 then
      insert into lax_points (client_id, delta, reason, appointment_id)
      values (a.client_id, pts, a.service_name || case when dbl then ' (dopuna na vrijeme ×' || trim(to_char(L.double_mult, 'FM990.##')) || ')' else '' end, a.id);
    end if;
  end if;
  if a.client_id is not null and (select coalesce(sum(delta),0) from lax_points where client_id = a.client_id) < 0 then
    raise exception 'Bodovi za ovaj termin su već iskorišteni za nagradu, pa se status ne može vratiti';
  end if;
  return jsonb_build_object('points', pts, 'double', dbl, 'mult', L.double_mult);
end $f$;
grant execute on function public.lax_set_status(uuid, text, numeric) to authenticated;

-- javna kartica: rok važenja i pravila prema podešavanjima
create or replace function public.lax_card(p_token text)
returns jsonb language sql stable security definer set search_path = public as $f$
  select case when c.id is null then null else jsonb_build_object(
    'name', split_part(c.name, ' ', 1),
    'points', coalesce((select sum(delta) from lax_points where client_id = c.id), 0),
    'valid_until', (coalesce((select max(starts_at) from lax_appointments where client_id = c.id and status = 'zavrsen'), c.created_at)
                    + make_interval(months => coalesce(L.valid_months, 12)))::date,
    'rewards', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'points', points) order by points) from lax_rewards where active), '[]'::jsonb),
    'rules', jsonb_build_object('km_per_point', L.km_per_point, 'double_mult', L.double_mult, 'double_days', L.double_days, 'welcome_points', L.welcome_points)
  ) end
  from (select 1) d left join lax_clients c on c.token = p_token and length(p_token) >= 10
  left join lax_loyalty L on L.id;
$f$;
grant execute on function public.lax_card(text) to anon, authenticated;
