-- Migrates the old template-scheduling schema to the current program-first workout model.

do $$
begin
  if exists (
    select 1
    from pg_type
    where typname = 'scheduled_workout_status'
  ) and not exists (
    select 1
    from pg_type
    where typname = 'scheduled_workout_status_v2'
  ) then
    create type public.scheduled_workout_status_v2 as enum ('in_progress', 'completed', 'cancelled');
  end if;
end $$;

alter table if exists public.training_plans
  add column if not exists workouts jsonb,
  add column if not exists updated_at timestamptz;

update public.training_plans
set
  workouts = coalesce(workouts, '[]'::jsonb),
  updated_at = coalesce(updated_at, created_at, now())
where workouts is null
   or updated_at is null;

alter table if exists public.training_plans
  alter column workouts set default '[]'::jsonb,
  alter column workouts set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

drop table if exists public.training_plan_templates cascade;

alter table if exists public.scheduled_workouts
  add column if not exists program_workout_id text;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'scheduled_workouts'
      and column_name = 'scheduled_date'
      and data_type = 'date'
  ) then
    alter table public.scheduled_workouts
      alter column scheduled_date type timestamptz
      using (scheduled_date::timestamp at time zone 'UTC');
  end if;
end $$;

alter table if exists public.scheduled_workouts
  alter column template_id drop not null;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'scheduled_workouts'
      and column_name = 'status'
  ) then
    alter table public.scheduled_workouts
      alter column status drop default;

    alter table public.scheduled_workouts
      alter column status type public.scheduled_workout_status_v2
      using (
        case
          when status::text in ('in_progress', 'completed') then status::text::public.scheduled_workout_status_v2
          else 'cancelled'::public.scheduled_workout_status_v2
        end
      );

    drop type if exists public.scheduled_workout_status;
    alter type public.scheduled_workout_status_v2 rename to scheduled_workout_status;

    alter table public.scheduled_workouts
      alter column status set default 'cancelled';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'scheduled_workouts_source_check'
      and conrelid = 'public.scheduled_workouts'::regclass
  ) then
    alter table public.scheduled_workouts
      add constraint scheduled_workouts_source_check
      check (template_id is not null or program_workout_id is not null);
  end if;
end $$;

create index if not exists scheduled_workouts_plan_idx
on public.scheduled_workouts (training_plan_id);

create index if not exists scheduled_workouts_athlete_idx
on public.scheduled_workouts (athlete_id, scheduled_date desc);

create index if not exists scheduled_workouts_coach_idx
on public.scheduled_workouts (coach_id, scheduled_date desc);

alter table if exists public.workout_set_logs
  drop constraint if exists workout_set_logs_template_exercise_id_fkey,
  drop constraint if exists workout_set_logs_template_set_id_fkey;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'workout_set_logs'
      and column_name = 'template_exercise_id'
      and data_type = 'uuid'
  ) then
    alter table public.workout_set_logs
      alter column template_exercise_id type text
      using template_exercise_id::text;
  end if;
end $$;

alter table if exists public.workout_set_logs
  add column if not exists set_id text,
  add column if not exists exercise_id text,
  add column if not exists exercise_name text,
  add column if not exists muscle_group text,
  add column if not exists superset_group text,
  add column if not exists set_label text,
  add column if not exists target_reps int,
  add column if not exists target_reps_min int,
  add column if not exists target_reps_max int,
  add column if not exists target_load numeric(6,2),
  add column if not exists target_rest_seconds int,
  add column if not exists program_workout_id text;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'workout_set_logs'
      and column_name = 'template_set_id'
  ) then
    update public.workout_set_logs log
    set
      set_id = coalesce(log.set_id, log.template_set_id::text),
      exercise_id = coalesce(log.exercise_id, template_exercise.exercise_id::text),
      exercise_name = coalesce(log.exercise_name, exercise.name, 'Liike'),
      set_label = coalesce(log.set_label, template_set.label, '1'),
      target_reps = coalesce(log.target_reps, template_set.target_reps, 0),
      target_load = coalesce(log.target_load, template_set.target_load),
      target_rest_seconds = coalesce(log.target_rest_seconds, template_set.rest_seconds)
    from public.workout_template_exercises template_exercise
    left join public.exercises exercise on exercise.id = template_exercise.exercise_id,
         public.workout_template_sets template_set
    where template_exercise.id::text = log.template_exercise_id
      and template_set.id = log.template_set_id
      and (
        log.set_id is null
        or log.exercise_id is null
        or log.exercise_name is null
        or log.set_label is null
        or log.target_reps is null
      );
  end if;
end $$;

update public.workout_set_logs
set
  set_id = coalesce(set_id, id::text),
  exercise_id = coalesce(exercise_id, template_exercise_id, 'legacy_exercise'),
  exercise_name = coalesce(exercise_name, 'Liike'),
  set_label = coalesce(set_label, '1'),
  target_reps = coalesce(target_reps, 0)
where set_id is null
   or exercise_id is null
   or exercise_name is null
   or set_label is null
   or target_reps is null;

alter table if exists public.workout_set_logs
  alter column set_id set not null,
  alter column exercise_id set not null,
  alter column exercise_name set not null,
  alter column set_label set not null,
  alter column target_reps set not null;

alter table if exists public.workout_set_logs
  drop column if exists template_set_id;

create index if not exists workout_set_logs_session_idx
on public.workout_set_logs (session_id);

create index if not exists workout_set_logs_scheduled_idx
on public.workout_set_logs (scheduled_workout_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workout_set_logs_session_template_set_unique'
      and conrelid = 'public.workout_set_logs'::regclass
  ) then
    alter table public.workout_set_logs
      add constraint workout_set_logs_session_template_set_unique
      unique (session_id, template_exercise_id, set_id);
  end if;
end $$;
