-- =====================================================================
-- LAX — OBJAVA IZMJENA (nacrt -> sajt)
-- Izmjene u adminu su nacrt; sajt prikazuje zadnju objavljenu verziju.
-- Pokreni cijelo u Supabase SQL Editoru.
-- =====================================================================

-- 1) Objavljena verzija sajta (jedan red)
create table if not exists public.lax_published (
  id boolean primary key default true check (id),
  data jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  draft_changed_at timestamptz
);
insert into public.lax_published (id) values (true) on conflict (id) do nothing;

alter table public.lax_published enable row level security;
drop policy if exists lax_published_read on public.lax_published;
create policy lax_published_read on public.lax_published for select to anon, authenticated using (true);
grant select on public.lax_published to anon, authenticated;

-- 2) Sastavi trenutno stanje (samo aktivne stavke)
create or replace function public.lax_build_snapshot()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'categories', coalesce((select jsonb_agg(to_jsonb(c) order by c.sort, c.created_at)
                            from lax_categories c where c.active), '[]'::jsonb),
    'products', coalesce((select jsonb_agg(to_jsonb(p) || jsonb_build_object('lax_variants',
                   coalesce((select jsonb_agg(to_jsonb(v) order by v.sort)
                             from lax_variants v where v.product_id = p.id and v.active), '[]'::jsonb))
                   order by p.sort, p.created_at)
                 from lax_products p where p.active), '[]'::jsonb),
    'delivery', coalesce((select jsonb_agg(to_jsonb(d) order by d.sort)
                          from lax_delivery d where d.active), '[]'::jsonb),
    'services', coalesce((select jsonb_agg(to_jsonb(s) order by s.sort, s.created_at)
                          from lax_services s where s.active), '[]'::jsonb),
    'settings', coalesce((select jsonb_object_agg(key, value) from lax_settings), '{}'::jsonb),
    'team', coalesce((select jsonb_agg(to_jsonb(t) order by t.sort, t.created_at)
                      from lax_team t where t.active), '[]'::jsonb)
  );
$$;

-- 3) Dugme "Objavi izmjene" (samo admin)
create or replace function public.lax_publish()
returns timestamptz language plpgsql security definer set search_path = public as $$
declare t timestamptz := now();
begin
  if not public.lax_is_admin() then raise exception 'Nemate pravo objave'; end if;
  update lax_published set data = lax_build_snapshot(), published_at = t, draft_changed_at = null where id;
  return t;
end $$;
revoke all on function public.lax_publish() from public, anon;
grant execute on function public.lax_publish() to authenticated;
revoke all on function public.lax_build_snapshot() from public, anon, authenticated;

-- 4) Oznaka "ima neobjavljenih izmjena"
create or replace function public.lax_mark_draft()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update lax_published set draft_changed_at = now() where id;
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['lax_products','lax_categories','lax_delivery','lax_services','lax_settings','lax_team'] loop
    execute format('drop trigger if exists lax_draft_mark on public.%I', t);
    execute format('create trigger lax_draft_mark after insert or update or delete on public.%I
                    for each statement execute function public.lax_mark_draft()', t);
  end loop;
end $$;
-- varijante: promjena samo zalihe (narudžba) nije izmjena sadržaja
drop trigger if exists lax_draft_mark on public.lax_variants;
drop trigger if exists lax_draft_mark_iud on public.lax_variants;
drop trigger if exists lax_draft_mark_upd on public.lax_variants;
create trigger lax_draft_mark_iud after insert or delete on public.lax_variants
  for each row execute function public.lax_mark_draft();
create trigger lax_draft_mark_upd after update on public.lax_variants
  for each row when ((to_jsonb(old) - 'stock') is distinct from (to_jsonb(new) - 'stock'))
  execute function public.lax_mark_draft();

-- 5) Narudžba koristi OBJAVLJENE cijene i dostave; zaliha ostaje stvarna
create or replace function public.lax_place_order(
  p_name text, p_phone text, p_email text, p_address text, p_city text,
  p_note text, p_delivery uuid, p_items jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  snap jsonb; d jsonb; pr jsonb; vr jsonb; it jsonb; q int; st int; vid uuid; price numeric;
  lines jsonb := '[]'::jsonb; sub numeric := 0; o record;
begin
  if coalesce(trim(p_name),'') = '' or coalesce(trim(p_phone),'') = '' then
    raise exception 'Ime i telefon su obavezni';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then
    raise exception 'Korpa je prazna';
  end if;

  select data into snap from lax_published where id;
  if snap is null or snap = '{}'::jsonb then snap := lax_build_snapshot(); end if;

  select x into d from jsonb_array_elements(snap->'delivery') x where x->>'id' = p_delivery::text;
  if d is null then raise exception 'Nepoznat način dostave'; end if;
  if (d->>'needs_address')::boolean and (coalesce(trim(p_address),'') = '' or coalesce(trim(p_city),'') = '') then
    raise exception 'Adresa i grad su obavezni za ovu dostavu';
  end if;

  for it in select * from jsonb_array_elements(p_items) loop
    q := greatest(1, least(99, coalesce((it->>'qty')::int, 1)));
    vid := (it->>'variant_id')::uuid;
    pr := null; vr := null;
    select p, v into pr, vr
      from jsonb_array_elements(snap->'products') p, jsonb_array_elements(p->'lax_variants') v
      where v->>'id' = vid::text limit 1;
    if vr is null then raise exception 'Proizvod više nije dostupan'; end if;
    price := (vr->>'price')::numeric;

    select stock into st from lax_variants where id = vid for update;
    if not found then raise exception 'Proizvod više nije dostupan'; end if;
    if st is not null and st < q then
      raise exception 'Nema dovoljno na stanju: %', pr->>'name';
    end if;

    lines := lines || jsonb_build_object(
      'variant_id', vid, 'product', pr->>'name',
      'variant', concat_ws(' · ', case when vr->>'length_cm' is not null then (vr->>'length_cm') || ' cm' end, vr->>'color', vr->>'label'),
      'price', price, 'qty', q, 'line_total', price * q);
    sub := sub + price * q;
    if st is not null then
      update lax_variants set stock = stock - q where id = vid;
    end if;
  end loop;

  insert into lax_orders (customer_name, phone, email, address, city, note,
                          delivery_id, delivery_name, delivery_price, items, subtotal, total)
  values (trim(p_name), trim(p_phone), nullif(trim(p_email),''), nullif(trim(p_address),''),
          nullif(trim(p_city),''), nullif(trim(p_note),''),
          p_delivery, d->>'name', (d->>'price')::numeric, lines, sub, sub + (d->>'price')::numeric)
  returning order_no, total into o;

  return jsonb_build_object('order_no', o.order_no, 'total', o.total);
end $$;
grant execute on function public.lax_place_order(text,text,text,text,text,text,uuid,jsonb) to anon, authenticated;

-- 6) Prva objava: sajt ostaje tačno kakav je sada
update public.lax_published set data = public.lax_build_snapshot(), published_at = now(), draft_changed_at = null where id;
