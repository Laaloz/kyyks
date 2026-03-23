-- Aligns profile, exercise and template metadata with the current app model.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_status') then
    create type public.user_status as enum ('active', 'invited');
  end if;

  if not exists (select 1 from pg_type where typname = 'exercise_scope') then
    create type public.exercise_scope as enum ('global', 'coach_custom');
  end if;

  if not exists (select 1 from pg_type where typname = 'theme_mode') then
    create type public.theme_mode as enum ('light', 'dark');
  end if;
end $$;

alter table if exists public.profiles
  add column if not exists status public.user_status,
  add column if not exists default_dashboard_view text,
  add column if not exists email_notifications boolean,
  add column if not exists theme_mode public.theme_mode,
  add column if not exists weight_kg numeric(5,2),
  add column if not exists waist_cm numeric(5,2);

update public.profiles
set
  status = coalesce(status, 'active'::public.user_status),
  email_notifications = coalesce(email_notifications, false),
  theme_mode = coalesce(theme_mode, 'light'::public.theme_mode)
where status is null
   or email_notifications is null
   or theme_mode is null;

alter table if exists public.profiles
  alter column status set default 'invited',
  alter column status set not null,
  alter column email_notifications set default false,
  alter column email_notifications set not null,
  alter column theme_mode set default 'light',
  alter column theme_mode set not null;

create unique index if not exists profiles_email_lower_unique
on public.profiles (lower(email));

create table if not exists public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  weight_kg numeric(5,2),
  waist_cm numeric(5,2),
  measured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'body_measurements_value_check'
      and conrelid = 'public.body_measurements'::regclass
  ) then
    alter table public.body_measurements
      add constraint body_measurements_value_check
      check (weight_kg is not null or waist_cm is not null);
  end if;
end $$;

create index if not exists body_measurements_user_idx
on public.body_measurements (user_id, measured_at desc);

alter table if exists public.exercises
  add column if not exists scope public.exercise_scope,
  add column if not exists coach_id uuid references public.profiles(id) on delete cascade;

update public.exercises
set scope = 'global'::public.exercise_scope
where scope is null;

alter table if exists public.exercises
  alter column scope set default 'global',
  alter column scope set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'exercises_scope_owner_check'
      and conrelid = 'public.exercises'::regclass
  ) then
    alter table public.exercises
      add constraint exercises_scope_owner_check
      check (
        (scope = 'global' and coach_id is null)
        or (scope = 'coach_custom' and coach_id is not null)
      );
  end if;
end $$;

create index if not exists exercises_scope_idx on public.exercises (scope);
create index if not exists exercises_coach_idx on public.exercises (coach_id);

alter table if exists public.workout_templates
  add column if not exists split_type text;

update public.workout_templates
set split_type = case
  when lower(title) like '%ylä%' then 'upper'
  when lower(title) like '%ala%' or lower(title) like '%voimapäivä%' then 'lower'
  when lower(title) like '%koko%' then 'full_body'
  else 'custom'
end
where split_type is null;

alter table if exists public.workout_templates
  alter column split_type set default 'custom',
  alter column split_type set not null;
