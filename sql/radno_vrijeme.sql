-- LAX — termini samo u radnom vremenu (pokreni u SQL Editoru)
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
