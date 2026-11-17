-- =====================================================================
-- LAX — PLAN TERMINA, KLIJENTICE, BODOVI, RADNICE (probna verzija)
-- Pokreni cijelo u Supabase SQL Editoru. Smije se pokrenuti više puta.
-- =====================================================================

-- ---------- RADNICE ----------
create table if not exists public.lax_staff (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  user_id uuid unique references auth.users(id) on delete set null,
  email text,
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
insert into public.lax_staff (name, sort)
select v.name, v.sort from (values ('Marija',1),('Dragana',2),('Vesna',3)) v(name, sort)
where not exists (select 1 from public.lax_staff);

create or replace function public.lax_is_staff()
returns boolean language sql stable security definer set search_path = public as $f$
  select public.lax_is_admin() or exists (select 1 from lax_staff where user_id = auth.uid() and active);
$f$;

create or replace function public.lax_whoami()
returns jsonb language sql stable security definer set search_path = public as $f$
  select jsonb_build_object(
    'admin', public.lax_is_admin(),
    'staff', (select jsonb_build_object('id', id, 'name', name) from lax_staff where user_id = auth.uid() and active limit 1));
$f$;
grant execute on function public.lax_whoami() to authenticated;

-- admin povezuje radnicu s nalogom (nalog se pravi u Supabase → Authentication → Add user)
create or replace function public.lax_link_staff(p_staff uuid, p_email text)
returns text language plpgsql security definer set search_path = public, auth as $f$
declare u uuid;
begin
  if not public.lax_is_admin() then raise exception 'Samo admin'; end if;
  if coalesce(trim(p_email),'') = '' then
    update lax_staff set user_id = null, email = null where id = p_staff; return 'odvezano';
  end if;
  select id into u from auth.users where lower(email) = lower(trim(p_email));
  if u is null then raise exception 'Nalog s tim emailom ne postoji. Napravi ga u Supabase → Authentication → Add user.'; end if;
  update lax_staff set user_id = null where user_id = u and id <> p_staff;
  update lax_staff set user_id = u, email = lower(trim(p_email)) where id = p_staff;
  return 'povezano';
end $f$;
grant execute on function public.lax_link_staff(uuid, text) to authenticated;

-- ---------- USLUGE: kabina ----------
alter table public.lax_services add column if not exists needs_cabin boolean not null default false;

-- ---------- KLIJENTICE ----------
create table if not exists public.lax_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  birthday date,
  consent boolean not null default false,
  note text,
  token text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 16),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index if not exists lax_clients_name_idx on public.lax_clients (lower(name));

create table if not exists public.lax_points (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.lax_clients(id) on delete cascade,
  delta int not null,
  reason text not null,
  appointment_id uuid,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index if not exists lax_points_client_idx on public.lax_points (client_id, created_at);

create table if not exists public.lax_rewards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  points int not null check (points > 0),
  active boolean not null default true,
  sort int not null default 0
);
insert into public.lax_rewards (name, points, sort)
select v.n, v.p, v.s from (values ('French ili hidro jelly maska',150,1),('Oblikovanje + farbanje obrva',300,2),
  ('Lash lift ili masaža 30 min',500,3),('Tretman lica',800,4)) v(n,p,s)
where not exists (select 1 from public.lax_rewards);

-- bodovi dobrodošlice
create or replace function public.lax_client_welcome()
returns trigger language plpgsql security definer set search_path = public as $f$
begin
  insert into lax_points (client_id, delta, reason) values (new.id, 20, 'Dobrodošlica');
  return new;
end $f$;
drop trigger if exists lax_client_welcome on public.lax_clients;
create trigger lax_client_welcome after insert on public.lax_clients for each row execute function public.lax_client_welcome();

-- ---------- TERMINI ----------
create table if not exists public.lax_appointments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.lax_clients(id) on delete set null,
  client_name text,
  staff_id uuid not null references public.lax_staff(id),
  service_id uuid references public.lax_services(id) on delete set null,
  service_name text not null,
  category text,
  needs_cabin boolean not null default false,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  price numeric(10,2),
  status text not null default 'zakazan' check (status in ('zakazan','zavrsen','otkazan','nije_dosla')),
  note text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index if not exists lax_appt_time_idx on public.lax_appointments (starts_at);

-- klijentice sa stanjem bodova
create or replace view public.lax_client_balance with (security_invoker = true) as
  select c.*, coalesce((select sum(p.delta) from lax_points p where p.client_id = c.id), 0)::int as points,
         (select max(a.starts_at) from lax_appointments a where a.client_id = c.id and a.status = 'zavrsen') as last_visit
  from lax_clients c;

-- radno vrijeme salona (pon–sri 12–19, čet–pet 9–16, sub 9–15, nedjelja zatvoreno)
create or replace function public.lax_check_hours(p_starts timestamptz, p_ends timestamptz)
returns void language plpgsql stable set search_path = public as $f$
declare ls timestamp := p_starts at time zone 'Europe/Sarajevo'; le timestamp := p_ends at time zone 'Europe/Sarajevo';
        dw int := extract(isodow from ls); o time; c time;
begin
  case when dw between 1 and 3 then o := '12:00'; c := '19:00';
       when dw between 4 and 5 then o := '09:00'; c := '16:00';
       when dw = 6 then o := '09:00'; c := '15:00';
       else raise exception 'Nedjeljom salon ne radi'; end case;
  if ls::date <> le::date or ls::time < o or le::time > c then
    raise exception 'Termin mora biti u radnom vremenu (% – %)', to_char(o, 'HH24:MI'), to_char(c, 'HH24:MI');
  end if;
end $f$;

-- spremi termin (novi ili izmjena) uz provjeru preklapanja i kabina
create or replace function public.lax_save_appointment(
  p_id uuid, p_client uuid, p_staff uuid, p_service uuid, p_service_name text,
  p_starts timestamptz, p_minutes int, p_price numeric, p_note text, p_cabin boolean default null
) returns uuid language plpgsql security definer set search_path = public as $f$
declare s record; e timestamptz; cab boolean; cat text; nm text; n int; busy text; cname text; rid uuid;
begin
  if not public.lax_is_staff() then raise exception 'Nemate pristup'; end if;
  if p_minutes is null or p_minutes < 5 then raise exception 'Upiši trajanje termina'; end if;
  perform pg_advisory_xact_lock(hashtext('lax_appointments'));
  e := p_starts + make_interval(mins => p_minutes);
  perform public.lax_check_hours(p_starts, e);
  if p_service is not null then select * into s from lax_services where id = p_service; end if;
  nm := coalesce(nullif(trim(p_service_name),''), s.name);
  if nm is null then raise exception 'Izaberi uslugu'; end if;
  cab := coalesce(p_cabin, s.needs_cabin, false);
  cat := s.category;
  select name into cname from lax_clients where id = p_client;

  select string_agg(to_char(starts_at at time zone 'Europe/Sarajevo','HH24:MI') || ' ' || service_name, ', ') into busy
    from lax_appointments
    where staff_id = p_staff and status in ('zakazan','zavrsen') and id is distinct from p_id
      and starts_at < e and ends_at > p_starts;
  if busy is not null then raise exception 'Radnica već ima termin u to vrijeme: %', busy; end if;

  if cab then
    -- najveći broj istovremenih kabinskih termina u intervalu
    select max(c) into n from (
      select (select count(*) from lax_appointments b
              where b.needs_cabin and b.status in ('zakazan','zavrsen') and b.id is distinct from p_id
                and b.starts_at <= t and b.ends_at > t) c
      from (select p_starts as t union select starts_at from lax_appointments
            where needs_cabin and status in ('zakazan','zavrsen') and id is distinct from p_id
              and starts_at > p_starts and starts_at < e) pts) x;
    if coalesce(n,0) >= 2 then raise exception 'KABINE: Obje kabine su zauzete u tom terminu'; end if;
  end if;

  if p_id is null then
    insert into lax_appointments (client_id, client_name, staff_id, service_id, service_name, category, needs_cabin, starts_at, ends_at, price, note)
    values (p_client, cname, p_staff, p_service, nm, cat, cab, p_starts, e, coalesce(p_price, s.price), nullif(trim(p_note),''))
    returning id into rid;
  else
    update lax_appointments set client_id = p_client, client_name = cname, staff_id = p_staff, service_id = p_service,
      service_name = nm, category = coalesce(cat, category), needs_cabin = cab, starts_at = p_starts, ends_at = e,
      price = coalesce(p_price, price), note = nullif(trim(p_note),'')
    where id = p_id returning id into rid;
  end if;
  return rid;
end $f$;
grant execute on function public.lax_save_appointment(uuid,uuid,uuid,uuid,text,timestamptz,int,numeric,text,boolean) to authenticated;

-- status termina; "zavrsen" dodaje bodove (duplo za dopunu na vrijeme)
create or replace function public.lax_set_status(p_id uuid, p_status text, p_price numeric default null)
returns jsonb language plpgsql security definer set search_path = public as $f$
declare a record; pts int := 0; dbl boolean := false;
begin
  if not public.lax_is_staff() then raise exception 'Nemate pristup'; end if;
  select * into a from lax_appointments where id = p_id for update;
  if not found then raise exception 'Termin ne postoji'; end if;
  if p_status not in ('zakazan','zavrsen','otkazan','nije_dosla') then raise exception 'Nepoznat status'; end if;
  update lax_appointments set status = p_status, price = coalesce(p_price, price) where id = p_id;
  delete from lax_points where appointment_id = p_id;
  if p_status = 'zavrsen' and a.client_id is not null and coalesce(a.category,'') <> 'edukacije' then
    dbl := a.category in ('nokti','trepavice','kosa') and exists (
      select 1 from lax_appointments b where b.client_id = a.client_id and b.category = a.category
        and b.status = 'zavrsen' and b.id <> a.id
        and b.starts_at < a.starts_at and b.starts_at >= a.starts_at - interval '28 days');
    pts := floor(coalesce(p_price, a.price, 0))::int * (case when dbl then 2 else 1 end);
    if pts > 0 then
      insert into lax_points (client_id, delta, reason, appointment_id)
      values (a.client_id, pts, a.service_name || case when dbl then ' (dopuna na vrijeme ×2)' else '' end, a.id);
    end if;
  end if;
  if a.client_id is not null and (select coalesce(sum(delta),0) from lax_points where client_id = a.client_id) < 0 then
    raise exception 'Bodovi za ovaj termin su već iskorišteni za nagradu, pa se status ne može vratiti';
  end if;
  return jsonb_build_object('points', pts, 'double', dbl);
end $f$;
grant execute on function public.lax_set_status(uuid, text, numeric) to authenticated;

-- iskoristi nagradu
create or replace function public.lax_redeem(p_client uuid, p_reward uuid)
returns int language plpgsql security definer set search_path = public as $f$
declare r record; bal int;
begin
  if not public.lax_is_staff() then raise exception 'Nemate pristup'; end if;
  perform 1 from lax_clients where id = p_client for update;
  select * into r from lax_rewards where id = p_reward and active;
  if not found then raise exception 'Nagrada ne postoji'; end if;
  select coalesce(sum(delta),0) into bal from lax_points where client_id = p_client;
  if bal < r.points then raise exception 'Nema dovoljno bodova (ima %, treba %)', bal, r.points; end if;
  insert into lax_points (client_id, delta, reason) values (p_client, -r.points, 'Nagrada: ' || r.name);
  return bal - r.points;
end $f$;
grant execute on function public.lax_redeem(uuid, uuid) to authenticated;

-- javna kartica (lični link) — samo ime i bodovi
create or replace function public.lax_card(p_token text)
returns jsonb language sql stable security definer set search_path = public as $f$
  select case when c.id is null then null else jsonb_build_object(
    'name', split_part(c.name, ' ', 1),
    'points', coalesce((select sum(delta) from lax_points where client_id = c.id), 0),
    'valid_until', (coalesce((select max(starts_at) from lax_appointments where client_id = c.id and status = 'zavrsen'), c.created_at) + interval '12 months')::date,
    'rewards', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'points', points) order by points) from lax_rewards where active), '[]'::jsonb)
  ) end
  from (select 1) d left join lax_clients c on c.token = p_token and length(p_token) >= 10;
$f$;
grant execute on function public.lax_card(text) to anon, authenticated;

-- ---------- PRAVA (RLS) ----------
alter table public.lax_staff enable row level security;
alter table public.lax_clients enable row level security;
alter table public.lax_points enable row level security;
alter table public.lax_rewards enable row level security;
alter table public.lax_appointments enable row level security;

drop policy if exists lax_staff_read on public.lax_staff;
create policy lax_staff_read on public.lax_staff for select to authenticated using (public.lax_is_staff());
drop policy if exists lax_staff_admin on public.lax_staff;
create policy lax_staff_admin on public.lax_staff for all to authenticated using (public.lax_is_admin()) with check (public.lax_is_admin());

drop policy if exists lax_clients_staff on public.lax_clients;
create policy lax_clients_staff on public.lax_clients for all to authenticated using (public.lax_is_staff()) with check (public.lax_is_staff());
drop policy if exists lax_points_staff on public.lax_points;
create policy lax_points_staff on public.lax_points for all to authenticated using (public.lax_is_staff()) with check (public.lax_is_staff());
drop policy if exists lax_appt_staff on public.lax_appointments;
create policy lax_appt_staff on public.lax_appointments for all to authenticated using (public.lax_is_staff()) with check (public.lax_is_staff());

drop policy if exists lax_rewards_read on public.lax_rewards;
create policy lax_rewards_read on public.lax_rewards for select to authenticated using (public.lax_is_staff());
drop policy if exists lax_rewards_admin on public.lax_rewards;
create policy lax_rewards_admin on public.lax_rewards for all to authenticated using (public.lax_is_admin()) with check (public.lax_is_admin());

-- radnice čitaju cjenovnik (i neaktivne stavke) za plan termina
drop policy if exists lax_services_staff_read on public.lax_services;
create policy lax_services_staff_read on public.lax_services for select to authenticated using (public.lax_is_staff());

grant select, insert, update, delete on public.lax_staff, public.lax_clients, public.lax_points, public.lax_rewards, public.lax_appointments to authenticated;
grant select on public.lax_client_balance to authenticated;
revoke all on public.lax_clients, public.lax_points, public.lax_appointments, public.lax_staff, public.lax_rewards from anon;
