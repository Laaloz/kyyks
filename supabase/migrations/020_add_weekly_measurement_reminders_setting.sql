alter table if exists public.profiles
  add column if not exists weekly_measurement_reminders boolean not null default true;
