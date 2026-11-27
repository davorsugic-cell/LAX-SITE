-- =====================================================================
-- LAX — NOVOSTI na početnoj stranici (uređuju admini, ide kroz "Objavi izmjene")
-- =====================================================================
create table if not exists public.lax_news (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  image_url text,
  link_url text,
  link_label text,
  news_date date not null default current_date,
  show_until date,
  pinned boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.lax_news enable row level security;
drop policy if exists lax_news_read on public.lax_news;
create policy lax_news_read on public.lax_news for select to anon, authenticated
  using (active or public.lax_is_admin());
drop policy if exists lax_news_admin on public.lax_news;
create policy lax_news_admin on public.lax_news for all to authenticated
  using (public.lax_is_admin()) with check (public.lax_is_admin());
grant select on public.lax_news to anon;
grant select, insert, update, delete on public.lax_news to authenticated;

-- izmjena novosti = neobjavljena izmjena sajta
drop trigger if exists lax_draft_mark on public.lax_news;
create trigger lax_draft_mark after insert or update or delete on public.lax_news
  for each statement execute function public.lax_mark_draft();

-- objava sada uključuje i novosti
create or replace function public.lax_build_snapshot()
returns jsonb language sql stable security definer set search_path = public as $f$
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
                      from lax_team t where t.active), '[]'::jsonb),
    'news', coalesce((select jsonb_agg(to_jsonb(n) order by n.pinned desc, n.news_date desc, n.created_at desc)
                      from lax_news n where n.active), '[]'::jsonb)
  );
$f$;
revoke all on function public.lax_build_snapshot() from public, anon, authenticated;
