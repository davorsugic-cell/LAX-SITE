-- LAX — oznaka poslanog podsjetnika za termin
alter table public.lax_appointments add column if not exists reminded_at timestamptz;
