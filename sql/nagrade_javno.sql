-- Početna stranica smije pročitati AKTIVNE nagrade programa vjernosti (samo naziv i bodove)
drop policy if exists lax_rewards_public on public.lax_rewards;
create policy lax_rewards_public on public.lax_rewards for select to anon, authenticated using (active);
grant select (name, points, active, sort) on public.lax_rewards to anon;
