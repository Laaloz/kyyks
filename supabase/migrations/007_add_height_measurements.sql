alter table if exists public.profiles
  add column if not exists height_cm numeric(5,2);

alter table if exists public.body_measurements
  add column if not exists height_cm numeric(5,2);

alter table if exists public.body_measurements
  drop constraint if exists body_measurements_value_check;

alter table if exists public.body_measurements
  add constraint body_measurements_value_check
    check (height_cm is not null or weight_kg is not null or waist_cm is not null);
