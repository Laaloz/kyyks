drop index if exists public.coach_athlete_active_unique;

create unique index if not exists coach_athlete_active_pair_unique
on public.coach_athlete_assignments (coach_id, athlete_id)
where active = true;

alter table public.exercises
  add column if not exists external_key text;

create unique index if not exists exercises_external_key_unique
on public.exercises (external_key)
where external_key is not null;
