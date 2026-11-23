-- LAX — dodaci (artikli iz shopa i ostalo) uz termin
alter table public.lax_appointments add column if not exists extras jsonb not null default '[]'::jsonb;
