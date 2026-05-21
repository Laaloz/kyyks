create extension if not exists "pgcrypto";

create type public.app_role as enum ('admin', 'coach', 'athlete', 'independent_athlete');
create type public.user_status as enum ('active', 'invited');
create type public.template_status as enum ('draft', 'published');
create type public.scheduled_workout_status as enum ('in_progress', 'completed', 'cancelled');
create type public.invite_status as enum ('pending', 'accepted');
create type public.exercise_scope as enum ('global', 'coach_custom');
create type public.theme_mode as enum ('light', 'dark', 'mallu', 'camel');
create type public.nutrition_goal as enum ('maintain', 'gain', 'lose');
create type public.nutrition_activity_level as enum ('low', 'moderate', 'high');
create type public.nutrition_owner_role as enum ('admin', 'coach');
create type public.ingredient_source as enum ('fineli', 'open_food_facts', 'manual');
create type public.ingredient_unit as enum ('g', 'ml', 'pcs');
create type public.ingredient_role as enum ('main', 'spice', 'garnish');
create type public.ingredient_scaling_mode as enum ('linear', 'fixed', 'text_only');
create type public.meal_tag as enum ('breakfast', 'lunch', 'snack', 'dinner', 'evening_snack');
create type public.purchase_unit as enum ('g', 'kg', 'ml', 'l', 'pcs', 'pack');
create type public.conversation_entry_type as enum (
  'comment',
  'admin_message'
);
create type public.conversation_context_type as enum ('general', 'workout', 'program');

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null,
  status public.user_status not null default 'invited',
  full_name text not null,
  profile_image_url text,
  email text not null,
  default_dashboard_view text,
  email_notifications boolean not null default false,
  weekly_measurement_reminders boolean not null default true,
  theme_mode public.theme_mode not null default 'light',
  load_increment_kg numeric(4,2) not null default 2.5,
  age integer check (age is null or age between 13 and 100),
  sex text check (sex is null or sex in ('female', 'male', 'other')),
  height_cm numeric(5,2),
  weight_kg numeric(5,2),
  waist_cm numeric(5,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists profiles_email_lower_unique
on public.profiles (lower(email));

create table if not exists public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  height_cm numeric(5,2),
  weight_kg numeric(5,2),
  waist_cm numeric(5,2),
  measured_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint body_measurements_value_check
    check (height_cm is not null or weight_kg is not null or waist_cm is not null)
);

create index if not exists body_measurements_user_idx
on public.body_measurements (user_id, measured_at desc);

create table if not exists public.nutrition_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  goal public.nutrition_goal not null default 'maintain',
  activity_level public.nutrition_activity_level not null default 'moderate',
  meals_per_day int not null default 5 check (meals_per_day between 3 and 6),
  target_kcal int not null default 2000 check (target_kcal >= 1200),
  protein_g numeric(6,2) not null default 140,
  carbs_g numeric(6,2) not null default 220,
  fat_g numeric(6,2) not null default 70,
  calculation_mode text not null default 'auto'
    check (calculation_mode in ('auto', 'manual_override')),
  coach_notes text,
  dietary_flags text[] not null default '{}'::text[],
  allergies text[] not null default '{}'::text[],
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ingredient_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  display_name text,
  source public.ingredient_source not null default 'manual',
  source_external_id text,
  owner_role public.nutrition_owner_role not null default 'admin',
  created_by uuid not null references public.profiles(id),
  default_purchase_unit public.purchase_unit,
  grams_per_unit numeric(8,2),
  kcal_per_100 numeric(8,2) not null default 0,
  protein_per_100 numeric(8,2) not null default 0,
  carbs_per_100 numeric(8,2) not null default 0,
  fat_per_100 numeric(8,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ingredient_catalog_name_idx
on public.ingredient_catalog (name);

create unique index if not exists ingredient_catalog_source_external_unique
on public.ingredient_catalog (source, source_external_id)
where source_external_id is not null;

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  instructions text not null default '',
  meal_tag public.meal_tag not null,
  owner_role public.nutrition_owner_role not null default 'admin',
  created_by uuid not null references public.profiles(id),
  default_servings int not null default 1 check (default_servings > 0),
  min_servings int not null default 1 check (min_servings > 0),
  max_servings int not null default 1 check (max_servings > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recipes_serving_bounds_check
    check (min_servings <= default_servings and default_servings <= max_servings)
);

create table if not exists public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  ingredient_id uuid references public.ingredient_catalog(id) on delete set null,
  ingredient_name text not null,
  quantity numeric(8,2),
  unit public.ingredient_unit not null default 'g',
  display_quantity text,
  display_unit text,
  normalized_quantity numeric(8,2),
  ingredient_role public.ingredient_role not null default 'main',
  scaling_mode public.ingredient_scaling_mode not null default 'linear',
  sort_order int not null default 0
);

create index if not exists recipe_ingredients_recipe_idx
on public.recipe_ingredients (recipe_id, sort_order);

create table if not exists public.meal_plan_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  owner_role public.nutrition_owner_role not null default 'admin',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.meal_plan_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.meal_plan_templates(id) on delete cascade,
  meal_tag public.meal_tag not null,
  recipe_id uuid not null references public.recipes(id) on delete restrict,
  sort_order int not null default 0
);

create index if not exists meal_plan_template_items_template_idx
on public.meal_plan_template_items (template_id, sort_order);

create table if not exists public.assigned_meal_plans (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  template_id uuid not null references public.meal_plan_templates(id) on delete restrict,
  assigned_by uuid not null references public.profiles(id),
  name text not null,
  active boolean not null default true,
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists assigned_meal_plans_athlete_idx
on public.assigned_meal_plans (athlete_id, assigned_at desc);

create table if not exists public.assigned_meal_plan_items (
  id uuid primary key default gen_random_uuid(),
  assigned_plan_id uuid not null references public.assigned_meal_plans(id) on delete cascade,
  meal_tag public.meal_tag not null,
  recipe_id uuid not null references public.recipes(id) on delete restrict,
  sort_order int not null default 0
);

create index if not exists assigned_meal_plan_items_plan_idx
on public.assigned_meal_plan_items (assigned_plan_id, sort_order);

create table if not exists public.coach_athlete_assignments (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists coach_athlete_active_pair_unique
on public.coach_athlete_assignments (coach_id, athlete_id)
where active = true;

create index if not exists coach_athlete_assignments_coach_idx
on public.coach_athlete_assignments (coach_id);

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  external_key text,
  name text not null,
  category text not null,
  equipment text not null,
  cue text not null,
  scope public.exercise_scope not null default 'global',
  coach_id uuid references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint exercises_scope_owner_check
    check (
      (scope = 'global' and coach_id is null)
      or (scope = 'coach_custom' and coach_id is not null)
    )
);

create index if not exists exercises_scope_idx on public.exercises (scope);
create index if not exists exercises_coach_idx on public.exercises (coach_id);
create unique index if not exists exercises_external_key_unique
on public.exercises (external_key)
where external_key is not null;

create table if not exists public.workout_templates (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text not null default '',
  goal text not null default '',
  split_type text not null default 'custom',
  status public.template_status not null default 'draft',
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workout_templates_coach_idx
on public.workout_templates (coach_id);

create table if not exists public.workout_template_blocks (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.workout_templates(id) on delete cascade,
  title text not null,
  note text,
  sort_order int not null default 0
);

create index if not exists workout_template_blocks_template_idx
on public.workout_template_blocks (template_id, sort_order);

create table if not exists public.workout_template_exercises (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references public.workout_template_blocks(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  muscle_group text,
  instruction text not null default '',
  sort_order int not null default 0
);

create index if not exists workout_template_exercises_block_idx
on public.workout_template_exercises (block_id, sort_order);

create table if not exists public.workout_template_sets (
  id uuid primary key default gen_random_uuid(),
  template_exercise_id uuid not null references public.workout_template_exercises(id) on delete cascade,
  label text not null,
  target_reps int not null,
  target_load numeric(6,2),
  rest_seconds int not null default 90,
  notes text,
  sort_order int not null default 0
);

create index if not exists workout_template_sets_exercise_idx
on public.workout_template_sets (template_exercise_id, sort_order);

create table if not exists public.training_plans (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'active'
    check (status in ('active', 'archived', 'removed')),
  start_date date not null,
  week_count int not null default 4 check (week_count > 0),
  workouts jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists training_plans_coach_idx
on public.training_plans (coach_id);

create index if not exists training_plans_athlete_idx
on public.training_plans (athlete_id);

create table if not exists public.scheduled_workouts (
  id uuid primary key default gen_random_uuid(),
  training_plan_id uuid references public.training_plans(id) on delete set null,
  template_id uuid references public.workout_templates(id) on delete set null,
  program_workout_id text,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  scheduled_date timestamptz not null,
  status public.scheduled_workout_status not null default 'cancelled',
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scheduled_workouts_source_check
    check (template_id is not null or program_workout_id is not null)
);

create index if not exists scheduled_workouts_athlete_idx
on public.scheduled_workouts (athlete_id, scheduled_date desc);

create index if not exists scheduled_workouts_coach_idx
on public.scheduled_workouts (coach_id, scheduled_date desc);

create index if not exists scheduled_workouts_plan_idx
on public.scheduled_workouts (training_plan_id);

create index if not exists scheduled_workouts_athlete_program_status_idx
on public.scheduled_workouts (athlete_id, program_workout_id, status);

create index if not exists scheduled_workouts_athlete_status_program_idx
on public.scheduled_workouts (athlete_id, status, program_workout_id);

create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  scheduled_workout_id uuid not null unique references public.scheduled_workouts(id) on delete cascade,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  energy_level int,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  paused_at timestamptz,
  paused_duration_seconds int not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists workout_sessions_athlete_idx
on public.workout_sessions (athlete_id, started_at desc);

create table if not exists public.workout_set_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  scheduled_workout_id uuid not null references public.scheduled_workouts(id) on delete cascade,
  template_exercise_id text not null,
  set_id text not null,
  exercise_id text not null,
  exercise_name text not null,
  muscle_group text,
  superset_group text,
  set_label text not null,
  target_reps int not null,
  target_reps_min int,
  target_reps_max int,
  target_load numeric(6,2),
  target_rest_seconds int,
  program_workout_id text,
  actual_reps int,
  actual_load numeric(6,2),
  rpe numeric(4,1),
  done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, template_exercise_id, set_id)
);

create index if not exists workout_set_logs_session_idx
on public.workout_set_logs (session_id);

create index if not exists workout_set_logs_scheduled_idx
on public.workout_set_logs (scheduled_workout_id);

create index if not exists workout_set_logs_session_exercise_label_done_idx
on public.workout_set_logs (session_id, exercise_id, set_label, done);

create or replace function public.start_workout_atomic(
  p_requester_id uuid,
  p_requester_role public.app_role,
  p_set_logs jsonb,
  p_scheduled_workout_id uuid default null,
  p_training_plan_id uuid default null,
  p_program_workout_id text default null
)
returns table (
  ok boolean,
  code text,
  message text,
  scheduled_workout_id uuid,
  session_id uuid,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.training_plans%rowtype;
  v_workout public.scheduled_workouts%rowtype;
  v_existing_workout public.scheduled_workouts%rowtype;
  v_blocking_workout public.scheduled_workouts%rowtype;
  v_session public.workout_sessions%rowtype;
  v_timestamp timestamptz := now();
  v_set_log_count integer := coalesce(jsonb_array_length(coalesce(p_set_logs, '[]'::jsonb)), 0);
  v_inserted_session boolean := false;
begin
  if p_scheduled_workout_id is null then
    if p_training_plan_id is null or p_program_workout_id is null then
      return query select false, 'invalid_state', 'Harjoituksen käynnistys epäonnistui.', null::uuid, null::uuid, null::timestamptz;
      return;
    end if;

    select *
    into v_plan
    from public.training_plans plan
    where plan.id = p_training_plan_id
    for update;

    if not found or (p_requester_role <> 'admin' and v_plan.athlete_id <> p_requester_id) then
      return query select false, 'forbidden', 'Ohjelmaa ei löytynyt tai se ei kuulu sinulle.', null::uuid, null::uuid, null::timestamptz;
      return;
    end if;

    if coalesce(v_plan.status, 'active') <> 'active' then
      return query select false, 'invalid_state', 'Ohjelma on arkistoitu eikä siitä voi käynnistää uutta treeniä.', null::uuid, null::uuid, null::timestamptz;
      return;
    end if;

    select *
    into v_existing_workout
    from public.scheduled_workouts workout
    where workout.athlete_id = v_plan.athlete_id
      and workout.program_workout_id = p_program_workout_id
      and workout.status in ('in_progress', 'cancelled')
    order by workout.updated_at desc, workout.id desc
    limit 1
    for update;

    if found then
      select *
      into v_session
      from public.workout_sessions
      where public.workout_sessions.scheduled_workout_id = v_existing_workout.id
      for update;

      if found and v_session.completed_at is null then
        return query select true, null::text, null::text, v_existing_workout.id, v_session.id, v_session.updated_at;
        return;
      end if;
    end if;

    select *
    into v_blocking_workout
    from public.scheduled_workouts workout
    where workout.athlete_id = v_plan.athlete_id
      and workout.status = 'in_progress'
      and (workout.program_workout_id is distinct from p_program_workout_id)
    order by workout.updated_at desc, workout.id desc
    limit 1;

    if found then
      select *
      into v_session
      from public.workout_sessions
      where public.workout_sessions.scheduled_workout_id = v_blocking_workout.id;

      if not found or v_session.completed_at is null then
        return query select false, 'invalid_state', format('Sinulla on kesken oleva treeni "%s". Jatka se ensin.', coalesce(nullif(trim(v_blocking_workout.title), ''), 'Treeni')), null::uuid, null::uuid, null::timestamptz;
        return;
      end if;
    end if;

    insert into public.scheduled_workouts (
      training_plan_id,
      program_workout_id,
      athlete_id,
      coach_id,
      title,
      scheduled_date,
      status,
      created_by,
      updated_by,
      created_at,
      updated_at
    )
    values (
      v_plan.id,
      p_program_workout_id,
      v_plan.athlete_id,
      v_plan.coach_id,
      coalesce(
        nullif(
          (
            select program_workout ->> 'name'
            from jsonb_array_elements(v_plan.workouts) program_workout
            where program_workout ->> 'id' = p_program_workout_id
            limit 1
          ),
          ''
        ),
        'Treeni'
      ),
      v_timestamp,
      'in_progress',
      p_requester_id,
      p_requester_id,
      v_timestamp,
      v_timestamp
    )
    returning * into v_workout;
  else
    select *
    into v_workout
    from public.scheduled_workouts workout
    where workout.id = p_scheduled_workout_id
    for update;

    if not found or (p_requester_role <> 'admin' and v_workout.athlete_id <> p_requester_id) then
      return query select false, 'forbidden', 'Treeniä ei löytynyt.', null::uuid, null::uuid, null::timestamptz;
      return;
    end if;
  end if;

  select *
  into v_session
  from public.workout_sessions
  where public.workout_sessions.scheduled_workout_id = v_workout.id
  for update;

  if found then
    if v_workout.status in ('completed', 'in_progress') then
      return query select true, null::text, null::text, v_workout.id, v_session.id, v_session.updated_at;
      return;
    end if;

    update public.workout_sessions
    set
      paused_at = null,
      paused_duration_seconds = coalesce(paused_duration_seconds, 0) +
        case
          when paused_at is not null and v_timestamp >= paused_at
            then extract(epoch from (v_timestamp - paused_at))::integer
          else 0
        end,
      updated_at = v_timestamp
    where public.workout_sessions.id = v_session.id
    returning * into v_session;

    update public.scheduled_workouts
    set status = 'in_progress', updated_at = v_timestamp, updated_by = p_requester_id
    where public.scheduled_workouts.id = v_workout.id;

    return query select true, null::text, null::text, v_workout.id, v_session.id, v_session.updated_at;
    return;
  end if;

  update public.scheduled_workouts
  set status = 'in_progress', updated_at = v_timestamp, updated_by = p_requester_id
  where public.scheduled_workouts.id = v_workout.id
  returning * into v_workout;

  insert into public.workout_sessions (
    scheduled_workout_id,
    athlete_id,
    started_at,
    updated_at,
    paused_duration_seconds
  )
  values (
    v_workout.id,
    v_workout.athlete_id,
    v_timestamp,
    v_timestamp,
    0
  )
  on conflict do nothing
  returning * into v_session;

  if found then
    v_inserted_session := true;
  else
    select *
    into v_session
    from public.workout_sessions
    where public.workout_sessions.scheduled_workout_id = v_workout.id
    for update;
  end if;

  if v_inserted_session and v_set_log_count > 0 then
    insert into public.workout_set_logs (
      session_id,
      scheduled_workout_id,
      template_exercise_id,
      set_id,
      exercise_id,
      exercise_name,
      muscle_group,
      superset_group,
      set_label,
      target_reps,
      target_reps_min,
      target_reps_max,
      target_load,
      target_rest_seconds,
      program_workout_id,
      actual_reps,
      actual_load,
      done
    )
    select
      v_session.id,
      v_workout.id,
      logs.template_exercise_id,
      logs.set_id,
      logs.exercise_id,
      logs.exercise_name,
      logs.muscle_group,
      logs.superset_group,
      logs.set_label,
      logs.target_reps,
      logs.target_reps_min,
      logs.target_reps_max,
      logs.target_load,
      logs.target_rest_seconds,
      logs.program_workout_id,
      logs.actual_reps,
      logs.actual_load,
      coalesce(logs.done, false)
    from jsonb_to_recordset(coalesce(p_set_logs, '[]'::jsonb)) as logs(
      template_exercise_id text,
      set_id text,
      exercise_id text,
      exercise_name text,
      muscle_group text,
      superset_group text,
      set_label text,
      target_reps int,
      target_reps_min int,
      target_reps_max int,
      target_load numeric,
      target_rest_seconds int,
      program_workout_id text,
      actual_reps int,
      actual_load numeric,
      done boolean
    )
    on conflict (session_id, template_exercise_id, set_id) do nothing;
  end if;

  return query select true, null::text, null::text, v_workout.id, v_session.id, v_session.updated_at;
end;
$$;

create table if not exists public.workout_notes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.workout_sessions(id) on delete cascade,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.update_workout_set_log(
  p_scheduled_workout_id uuid,
  p_log_id uuid,
  p_requester_id uuid,
  p_requester_role public.app_role,
  p_expected_session_updated_at timestamptz,
  p_has_done boolean default false,
  p_done boolean default false,
  p_has_actual_reps boolean default false,
  p_actual_reps integer default null,
  p_has_actual_load boolean default false,
  p_actual_load numeric default null
)
returns table (
  ok boolean,
  code text,
  message text,
  session_updated_at timestamptz,
  log_id uuid,
  actual_reps integer,
  actual_load numeric,
  done boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workout public.scheduled_workouts%rowtype;
  v_session public.workout_sessions%rowtype;
  v_target_log public.workout_set_logs%rowtype;
  v_timestamp timestamptz := now();
  v_next_done boolean;
  v_next_actual_reps integer;
  v_next_actual_load numeric;
begin
  select *
  into v_workout
  from public.scheduled_workouts
  where id = p_scheduled_workout_id;

  if not found or (p_requester_role <> 'admin' and v_workout.athlete_id <> p_requester_id) then
    return query select false, 'forbidden', 'Treeniä ei löytynyt.', null::timestamptz, null::uuid, null::integer, null::numeric, null::boolean;
    return;
  end if;

  if v_workout.status not in ('in_progress', 'completed') then
    return query select false, 'invalid_state', 'Sarjoja voi muokata vain aktiivisesta tai valmiista treenistä.', null::timestamptz, null::uuid, null::integer, null::numeric, null::boolean;
    return;
  end if;

  select *
  into v_session
  from public.workout_sessions
  where scheduled_workout_id = p_scheduled_workout_id
  for update;

  if not found then
    return query select false, 'stale_session', 'Treeni ehti muuttua ennen tallennusta.', null::timestamptz, null::uuid, null::integer, null::numeric, null::boolean;
    return;
  end if;

  if v_session.updated_at <> p_expected_session_updated_at then
    return query select false, 'stale_session', 'Treeni ehti muuttua ennen tallennusta.', null::timestamptz, null::uuid, null::integer, null::numeric, null::boolean;
    return;
  end if;

  select *
  into v_target_log
  from public.workout_set_logs
  where id = p_log_id
    and scheduled_workout_id = p_scheduled_workout_id
    and session_id = v_session.id
  for update;

  if not found then
    return query select false, 'not_found', 'Sarjaa ei löytynyt.', null::timestamptz, null::uuid, null::integer, null::numeric, null::boolean;
    return;
  end if;

  v_next_done := case when p_has_done then p_done else v_target_log.done end;
  v_next_actual_reps := case when p_has_actual_reps then p_actual_reps else v_target_log.actual_reps end;
  v_next_actual_load := case when p_has_actual_load then p_actual_load else v_target_log.actual_load end;

  if v_next_done and not p_has_actual_reps and v_next_actual_reps is null then
    v_next_actual_reps := coalesce(v_target_log.target_reps_min, v_target_log.target_reps);
  end if;

  if v_next_done and not p_has_actual_load and v_next_actual_load is null and coalesce(v_target_log.target_load, 0) > 0 then
    v_next_actual_load := v_target_log.target_load;
  end if;

  update public.workout_sessions
  set updated_at = v_timestamp
  where id = v_session.id;

  update public.workout_set_logs
  set
    actual_reps = v_next_actual_reps,
    actual_load = v_next_actual_load,
    done = v_next_done,
    updated_at = v_timestamp
  where id = p_log_id;

  if p_has_done and v_target_log.superset_group is not null then
    update public.workout_set_logs
    set
      done = p_done,
      updated_at = v_timestamp,
      actual_reps = case when p_done then v_next_actual_reps else actual_reps end,
      actual_load = case when p_done then v_next_actual_load else actual_load end
    where scheduled_workout_id = p_scheduled_workout_id
      and superset_group = v_target_log.superset_group
      and set_label = v_target_log.set_label
      and id <> p_log_id;
  end if;

  update public.scheduled_workouts
  set updated_at = v_timestamp
  where id = p_scheduled_workout_id;

  return query
  select
    true,
    null::text,
    null::text,
    v_timestamp,
    p_log_id,
    v_next_actual_reps,
    v_next_actual_load,
    v_next_done;
end;
$$;

create or replace function public.complete_workout_atomic(
  p_scheduled_workout_id uuid,
  p_requester_id uuid,
  p_requester_role public.app_role,
  p_expected_session_updated_at timestamptz
)
returns table (
  ok boolean,
  code text,
  message text,
  updated_at timestamptz,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workout public.scheduled_workouts%rowtype;
  v_session public.workout_sessions%rowtype;
  v_count bigint;
  v_timestamp timestamptz := now();
begin
  select * into v_workout from public.scheduled_workouts where id = p_scheduled_workout_id;
  if not found or (p_requester_role <> 'admin' and v_workout.athlete_id <> p_requester_id) then
    return query select false, 'forbidden', 'Treeniä ei löytynyt.', null::timestamptz, null::timestamptz;
    return;
  end if;

  update public.workout_sessions
  set completed_at = v_timestamp, paused_at = null, updated_at = v_timestamp
  where scheduled_workout_id = p_scheduled_workout_id
    and updated_at = p_expected_session_updated_at
  returning * into v_session;

  if not found then
    return query select false, 'stale_session', 'Treeni ehti muuttua ennen viimeistelyä.', null::timestamptz, null::timestamptz;
    return;
  end if;

  select count(*) into v_count from public.workout_set_logs where scheduled_workout_id = p_scheduled_workout_id;
  if coalesce(v_count, 0) = 0 then
    return query select false, 'invalid_state', 'Treeniä ei voitu merkitä valmiiksi.', null::timestamptz, null::timestamptz;
    return;
  end if;

  update public.scheduled_workouts
  set status = 'completed', completed_at = v_timestamp, updated_at = v_timestamp
  where id = p_scheduled_workout_id;

  return query select true, null::text, null::text, v_timestamp, v_timestamp;
end;
$$;

create or replace function public.update_workout_duration_atomic(
  p_scheduled_workout_id uuid,
  p_requester_id uuid,
  p_requester_role public.app_role,
  p_expected_session_updated_at timestamptz,
  p_duration_seconds integer
)
returns table (
  ok boolean,
  code text,
  message text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workout public.scheduled_workouts%rowtype;
  v_session public.workout_sessions%rowtype;
  v_completed_at_ms bigint;
  v_started_at timestamptz;
  v_timestamp timestamptz := now();
begin
  select * into v_workout from public.scheduled_workouts where id = p_scheduled_workout_id;
  if not found or (p_requester_role <> 'admin' and v_workout.athlete_id <> p_requester_id) then
    return query select false, 'forbidden', 'Treeniä ei löytynyt.', null::timestamptz;
    return;
  end if;

  if v_workout.status <> 'completed' then
    return query select false, 'invalid_state', 'Treeniaikaa voi muokata vain valmiilta treeniltä.', null::timestamptz;
    return;
  end if;

  select * into v_session
  from public.workout_sessions
  where scheduled_workout_id = p_scheduled_workout_id
  for update;

  if not found or v_session.completed_at is null then
    return query select false, 'invalid_state', 'Valmiin treenin aikaa ei löytynyt muokattavaksi.', null::timestamptz;
    return;
  end if;

  if v_session.updated_at <> p_expected_session_updated_at then
    return query select false, 'stale_session', 'Treeni ehti muuttua ennen keston tallennusta.', null::timestamptz;
    return;
  end if;

  v_completed_at_ms := floor(extract(epoch from v_session.completed_at) * 1000);
  v_started_at := to_timestamp((v_completed_at_ms - ((p_duration_seconds + coalesce(v_session.paused_duration_seconds, 0)) * 1000)) / 1000.0);

  update public.workout_sessions
  set started_at = v_started_at, updated_at = v_timestamp
  where id = v_session.id;

  update public.scheduled_workouts
  set updated_at = v_timestamp
  where id = p_scheduled_workout_id;

  return query select true, null::text, null::text, v_timestamp;
end;
$$;

create or replace function public.update_workout_date_atomic(
  p_scheduled_workout_id uuid,
  p_requester_id uuid,
  p_requester_role public.app_role,
  p_expected_session_updated_at timestamptz,
  p_scheduled_date text
)
returns table (
  ok boolean,
  code text,
  message text,
  updated_at timestamptz,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workout public.scheduled_workouts%rowtype;
  v_session public.workout_sessions%rowtype;
  v_reference timestamptz;
  v_shifted_reference timestamptz;
  v_delta interval;
  v_timestamp timestamptz := now();
begin
  select * into v_workout from public.scheduled_workouts where id = p_scheduled_workout_id;
  if not found or (p_requester_role <> 'admin' and v_workout.athlete_id <> p_requester_id) then
    return query select false, 'forbidden', 'Treeniä ei löytynyt.', null::timestamptz, null::timestamptz;
    return;
  end if;

  select * into v_session
  from public.workout_sessions
  where scheduled_workout_id = p_scheduled_workout_id
  for update;

  if found and v_session.updated_at <> p_expected_session_updated_at then
    return query select false, 'stale_session', 'Treeni ehti muuttua ennen treenipäivän tallennusta.', null::timestamptz, null::timestamptz;
    return;
  end if;

  v_reference := coalesce(v_workout.completed_at, v_session.completed_at, v_workout.scheduled_date);
  v_shifted_reference := (p_scheduled_date::date + v_reference::time);
  v_delta := v_shifted_reference - v_reference;

  update public.scheduled_workouts
  set
    scheduled_date = scheduled_date + v_delta,
    completed_at = case when completed_at is null then null else completed_at + v_delta end,
    updated_at = v_timestamp
  where id = p_scheduled_workout_id;

  if found then
    update public.workout_sessions
    set
      started_at = started_at + v_delta,
      completed_at = case when completed_at is null then null else completed_at + v_delta end,
      paused_at = case when paused_at is null then null else paused_at + v_delta end,
      updated_at = v_timestamp
    where id = v_session.id;
  end if;

  return query select true, null::text, null::text, v_timestamp, case when v_workout.completed_at is null then null else v_workout.completed_at + v_delta end;
end;
$$;

create or replace function public.save_workout_note_entry(
  p_scheduled_workout_id uuid,
  p_requester_id uuid,
  p_requester_role public.app_role,
  p_body text,
  p_expected_note_updated_at timestamptz default null
)
returns table (
  ok boolean,
  code text,
  message text,
  note_updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workout public.scheduled_workouts%rowtype;
  v_session public.workout_sessions%rowtype;
  v_note public.workout_notes%rowtype;
  v_timestamp timestamptz := now();
begin
  select * into v_workout from public.scheduled_workouts where id = p_scheduled_workout_id;
  if not found or (p_requester_role <> 'admin' and v_workout.athlete_id <> p_requester_id) then
    return query select false, 'forbidden', 'Treeniä ei löytynyt.', null::timestamptz;
    return;
  end if;

  select * into v_session from public.workout_sessions where scheduled_workout_id = p_scheduled_workout_id;
  if not found then
    return query select false, 'invalid_state', 'Aloita treeni ennen muistiinpanon tallennusta.', null::timestamptz;
    return;
  end if;

  select * into v_note from public.workout_notes where session_id = v_session.id for update;

  if found then
    if v_note.updated_at is distinct from p_expected_note_updated_at then
      return query select false, 'stale_note', 'Muistiinpano ehti muuttua ennen tallennusta.', null::timestamptz;
      return;
    end if;

    update public.workout_notes
    set body = p_body, updated_at = v_timestamp
    where id = v_note.id;
  else
    if p_expected_note_updated_at is not null then
      return query select false, 'stale_note', 'Muistiinpano ehti muuttua ennen tallennusta.', null::timestamptz;
      return;
    end if;

    insert into public.workout_notes (session_id, athlete_id, coach_id, body, updated_at)
    values (v_session.id, v_workout.athlete_id, v_workout.coach_id, p_body, v_timestamp);
  end if;

  return query select true, null::text, null::text, v_timestamp;
end;
$$;

create table if not exists public.conversation_entries (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  author_user_id uuid not null references public.profiles(id) on delete cascade,
  author_role public.app_role not null,
  type public.conversation_entry_type not null,
  body text not null,
  context_type public.conversation_context_type not null default 'general',
  context_id text,
  context_label text,
  read_by_user_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists conversation_entries_athlete_idx
on public.conversation_entries (athlete_id, created_at desc);

create index if not exists conversation_entries_coach_idx
on public.conversation_entries (coach_id, created_at desc);

create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  email text not null,
  role public.app_role not null check (role <> 'admin'),
  invited_by uuid not null references public.profiles(id) on delete cascade,
  coach_id uuid references public.profiles(id) on delete set null,
  status public.invite_status not null default 'pending',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists invites_invited_by_idx
on public.invites (invited_by, created_at desc);

create table if not exists public.password_reset_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  email text not null,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  requested_by_user_id uuid references public.profiles(id) on delete set null,
  requested_by_role text not null
    check (requested_by_role in ('admin', 'coach', 'athlete', 'self_service')),
  consumed_at timestamptz
);

create index if not exists password_reset_requests_user_idx
on public.password_reset_requests (user_id, created_at desc);

create or replace function public.sync_profile_from_auth_user(
  auth_user_id uuid,
  auth_email text,
  auth_user_meta_data jsonb,
  auth_created_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite_record record;
  normalized_email text;
  resolved_full_name text;
  resolved_created_at timestamptz;
begin
  if auth_email is null or btrim(auth_email) = '' then
    return;
  end if;

  normalized_email := lower(btrim(auth_email));
  resolved_created_at := coalesce(auth_created_at, now());

  select
    invites.id,
    invites.role,
    invites.coach_id,
    invites.status
  into invite_record
  from public.invites
  where lower(invites.email) = normalized_email
  order by invites.created_at desc
  limit 1;

  if invite_record.id is null then
    return;
  end if;

  resolved_full_name := nullif(
    btrim(
      coalesce(
        auth_user_meta_data ->> 'full_name',
        auth_user_meta_data ->> 'name',
        split_part(normalized_email, '@', 1)
      )
    ),
    ''
  );

  insert into public.profiles (
    id,
    role,
    status,
    full_name,
    email,
    default_dashboard_view,
    email_notifications,
    weekly_measurement_reminders,
    theme_mode,
    created_at,
    updated_at
  )
  values (
    auth_user_id,
    invite_record.role,
    'active',
    resolved_full_name,
    normalized_email,
    case when invite_record.role = 'athlete' then 'athlete-log' else 'overview' end,
    false,
    true,
    'light',
    resolved_created_at,
    now()
  )
  on conflict (id) do update
  set
    role = excluded.role,
    status = 'active',
    full_name = excluded.full_name,
    email = excluded.email,
    default_dashboard_view = coalesce(public.profiles.default_dashboard_view, excluded.default_dashboard_view),
    updated_at = now();

  if invite_record.role in ('athlete', 'independent_athlete') and invite_record.coach_id is not null then
    insert into public.coach_athlete_assignments (
      coach_id,
      athlete_id,
      active,
      created_at
    )
    select
      invite_record.coach_id,
      auth_user_id,
      true,
      resolved_created_at
    where not exists (
      select 1
      from public.coach_athlete_assignments assignments
      where assignments.coach_id = invite_record.coach_id
        and assignments.athlete_id = auth_user_id
        and assignments.active = true
    );
  end if;

  update public.invites
  set status = 'accepted'
  where id = invite_record.id
    and status <> 'accepted';
end;
$$;

create or replace function public.handle_auth_user_profile_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.sync_profile_from_auth_user(
    new.id,
    new.email,
    new.raw_user_meta_data,
    new.created_at
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_sync_profile on auth.users;

create trigger on_auth_user_created_sync_profile
after insert on auth.users
for each row
execute function public.handle_auth_user_profile_sync();

create or replace function public.current_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.profiles
  where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_role() = 'admin', false)
$$;

create or replace function public.is_coach_of(target_athlete uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.coach_athlete_assignments
    where coach_id = auth.uid()
      and athlete_id = target_athlete
      and active = true
  )
$$;

create or replace function public.is_athlete_of(target_coach uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.coach_athlete_assignments
    where athlete_id = auth.uid()
      and coach_id = target_coach
      and active = true
  ) or exists (
    select 1
    from public.profiles profile
    where profile.id = target_coach
      and profile.role = 'admin'
      and (
        exists (
          select 1
          from public.training_plans plan
          where plan.athlete_id = auth.uid()
            and plan.coach_id = target_coach
        )
        or exists (
          select 1
          from public.scheduled_workouts workout
          where workout.athlete_id = auth.uid()
            and workout.coach_id = target_coach
        )
      )
  )
$$;

grant execute on function public.current_role() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_coach_of(uuid) to authenticated;
grant execute on function public.is_athlete_of(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.body_measurements enable row level security;
alter table public.nutrition_profiles enable row level security;
alter table public.ingredient_catalog enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.meal_plan_templates enable row level security;
alter table public.meal_plan_template_items enable row level security;
alter table public.assigned_meal_plans enable row level security;
alter table public.assigned_meal_plan_items enable row level security;
alter table public.coach_athlete_assignments enable row level security;
alter table public.exercises enable row level security;
alter table public.workout_templates enable row level security;
alter table public.workout_template_blocks enable row level security;
alter table public.workout_template_exercises enable row level security;
alter table public.workout_template_sets enable row level security;
alter table public.training_plans enable row level security;
alter table public.scheduled_workouts enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.workout_set_logs enable row level security;
alter table public.workout_notes enable row level security;
alter table public.conversation_entries enable row level security;
alter table public.invites enable row level security;
alter table public.password_reset_requests enable row level security;

create policy "profiles read by self admin linked users"
on public.profiles for select
using (
  auth.uid() = id
  or public.is_admin()
  or (role = 'athlete' and public.is_coach_of(id))
  or (role in ('coach', 'admin') and public.is_athlete_of(id))
);

create policy "profiles insert by admin"
on public.profiles for insert
with check (public.is_admin());

create policy "profiles update by self or admin"
on public.profiles for update
using (auth.uid() = id or public.is_admin())
with check (
  public.is_admin()
  or (
    auth.uid() = id
    and role = (select current_profile.role from public.profiles current_profile where current_profile.id = auth.uid())
    and status = (select current_profile.status from public.profiles current_profile where current_profile.id = auth.uid())
    and email = (select current_profile.email from public.profiles current_profile where current_profile.id = auth.uid())
  )
);

create policy "profiles delete by admin"
on public.profiles for delete
using (public.is_admin());

create policy "body measurements read by self coach or admin"
on public.body_measurements for select
using (auth.uid() = user_id or public.is_admin() or public.is_coach_of(user_id));

create policy "body measurements insert by self or admin"
on public.body_measurements for insert
with check (auth.uid() = user_id or public.is_admin());

create policy "body measurements update by self or admin"
on public.body_measurements for update
using (auth.uid() = user_id or public.is_admin())
with check (auth.uid() = user_id or public.is_admin());

create policy "body measurements delete by self or admin"
on public.body_measurements for delete
using (auth.uid() = user_id or public.is_admin());

create policy "nutrition profiles read by participant or admin"
on public.nutrition_profiles for select
using (public.is_admin() or auth.uid() = user_id or public.is_coach_of(user_id));

create policy "nutrition profiles insert by admin"
on public.nutrition_profiles for insert
with check (public.is_admin());

create policy "nutrition profiles update by admin"
on public.nutrition_profiles for update
using (public.is_admin())
with check (public.is_admin());

create policy "nutrition profiles delete by admin"
on public.nutrition_profiles for delete
using (public.is_admin());

create policy "ingredient catalog read by authenticated users"
on public.ingredient_catalog for select
using (auth.uid() is not null);

create policy "ingredient catalog write by admin"
on public.ingredient_catalog for all
using (public.is_admin())
with check (public.is_admin());

create policy "recipes read by authenticated users"
on public.recipes for select
using (auth.uid() is not null);

create policy "recipes write by admin"
on public.recipes for all
using (public.is_admin())
with check (public.is_admin());

create policy "recipe ingredients read by authenticated users"
on public.recipe_ingredients for select
using (auth.uid() is not null);

create policy "recipe ingredients write by admin"
on public.recipe_ingredients for all
using (
  public.is_admin()
)
with check (
  public.is_admin()
);

create policy "meal plan templates read by authenticated users"
on public.meal_plan_templates for select
using (auth.uid() is not null);

create policy "meal plan templates write by admin"
on public.meal_plan_templates for all
using (public.is_admin())
with check (public.is_admin());

create policy "meal plan template items read by authenticated users"
on public.meal_plan_template_items for select
using (auth.uid() is not null);

create policy "meal plan template items write by admin"
on public.meal_plan_template_items for all
using (public.is_admin())
with check (public.is_admin());

create policy "assigned meal plans read by participant or admin"
on public.assigned_meal_plans for select
using (public.is_admin() or auth.uid() = athlete_id or public.is_coach_of(athlete_id));

create policy "assigned meal plans write by admin"
on public.assigned_meal_plans for all
using (public.is_admin())
with check (public.is_admin());

create policy "assigned meal plan items read via assigned plan"
on public.assigned_meal_plan_items for select
using (
  exists (
    select 1
    from public.assigned_meal_plans plan
    where plan.id = assigned_plan_id
      and (public.is_admin() or auth.uid() = plan.athlete_id or public.is_coach_of(plan.athlete_id))
  )
);

create policy "assigned meal plan items write by admin"
on public.assigned_meal_plan_items for all
using (public.is_admin())
with check (public.is_admin());

create policy "assignments read by participant or admin"
on public.coach_athlete_assignments for select
using (public.is_admin() or coach_id = auth.uid() or athlete_id = auth.uid());

create policy "assignments insert by owning coach or admin"
on public.coach_athlete_assignments for insert
with check (public.is_admin() or coach_id = auth.uid());

create policy "assignments update by owning coach or admin"
on public.coach_athlete_assignments for update
using (public.is_admin() or coach_id = auth.uid())
with check (public.is_admin() or coach_id = auth.uid());

create policy "assignments delete by owning coach or admin"
on public.coach_athlete_assignments for delete
using (public.is_admin() or coach_id = auth.uid());

create policy "exercises read by authenticated users"
on public.exercises for select
using (auth.uid() is not null);

create policy "exercises insert by admin or owning coach"
on public.exercises for insert
with check (
  public.is_admin()
  or (
    public.current_role() = 'coach'
    and scope = 'coach_custom'
    and coach_id = auth.uid()
  )
);

create policy "exercises update by admin or owning coach"
on public.exercises for update
using (public.is_admin() or coach_id = auth.uid())
with check (
  public.is_admin()
  or (
    scope = 'coach_custom'
    and coach_id = auth.uid()
  )
);

create policy "exercises delete by admin or owning coach"
on public.exercises for delete
using (public.is_admin() or coach_id = auth.uid());

create policy "templates read by admin or owning coach"
on public.workout_templates for select
using (public.is_admin() or coach_id = auth.uid());

create policy "templates insert by admin or owning coach"
on public.workout_templates for insert
with check (public.is_admin() or coach_id = auth.uid());

create policy "templates update by admin or owning coach"
on public.workout_templates for update
using (public.is_admin() or coach_id = auth.uid())
with check (public.is_admin() or coach_id = auth.uid());

create policy "templates delete by admin or owning coach"
on public.workout_templates for delete
using (public.is_admin() or coach_id = auth.uid());

create policy "template blocks read via parent template"
on public.workout_template_blocks for select
using (
  exists (
    select 1
    from public.workout_templates template
    where template.id = template_id
      and (public.is_admin() or template.coach_id = auth.uid())
  )
);

create policy "template blocks insert via parent template"
on public.workout_template_blocks for insert
with check (
  exists (
    select 1
    from public.workout_templates template
    where template.id = template_id
      and (public.is_admin() or template.coach_id = auth.uid())
  )
);

create policy "template blocks update via parent template"
on public.workout_template_blocks for update
using (
  exists (
    select 1
    from public.workout_templates template
    where template.id = template_id
      and (public.is_admin() or template.coach_id = auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.workout_templates template
    where template.id = template_id
      and (public.is_admin() or template.coach_id = auth.uid())
  )
);

create policy "template blocks delete via parent template"
on public.workout_template_blocks for delete
using (
  exists (
    select 1
    from public.workout_templates template
    where template.id = template_id
      and (public.is_admin() or template.coach_id = auth.uid())
  )
);

create policy "template exercises read via parent block"
on public.workout_template_exercises for select
using (
  exists (
    select 1
    from public.workout_template_blocks block
    join public.workout_templates template on template.id = block.template_id
    where block.id = block_id
      and (public.is_admin() or template.coach_id = auth.uid())
  )
);

create policy "template exercises insert via parent block"
on public.workout_template_exercises for insert
with check (
  exists (
    select 1
    from public.workout_template_blocks block
    join public.workout_templates template on template.id = block.template_id
    where block.id = block_id
      and (public.is_admin() or template.coach_id = auth.uid())
  )
);

create policy "template exercises update via parent block"
on public.workout_template_exercises for update
using (
  exists (
    select 1
    from public.workout_template_blocks block
    join public.workout_templates template on template.id = block.template_id
    where block.id = block_id
      and (public.is_admin() or template.coach_id = auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.workout_template_blocks block
    join public.workout_templates template on template.id = block.template_id
    where block.id = block_id
      and (public.is_admin() or template.coach_id = auth.uid())
  )
);

create policy "template exercises delete via parent block"
on public.workout_template_exercises for delete
using (
  exists (
    select 1
    from public.workout_template_blocks block
    join public.workout_templates template on template.id = block.template_id
    where block.id = block_id
      and (public.is_admin() or template.coach_id = auth.uid())
  )
);

create policy "template sets read via parent exercise"
on public.workout_template_sets for select
using (
  exists (
    select 1
    from public.workout_template_exercises exercise
    join public.workout_template_blocks block on block.id = exercise.block_id
    join public.workout_templates template on template.id = block.template_id
    where exercise.id = template_exercise_id
      and (public.is_admin() or template.coach_id = auth.uid())
  )
);

create policy "template sets insert via parent exercise"
on public.workout_template_sets for insert
with check (
  exists (
    select 1
    from public.workout_template_exercises exercise
    join public.workout_template_blocks block on block.id = exercise.block_id
    join public.workout_templates template on template.id = block.template_id
    where exercise.id = template_exercise_id
      and (public.is_admin() or template.coach_id = auth.uid())
  )
);

create policy "template sets update via parent exercise"
on public.workout_template_sets for update
using (
  exists (
    select 1
    from public.workout_template_exercises exercise
    join public.workout_template_blocks block on block.id = exercise.block_id
    join public.workout_templates template on template.id = block.template_id
    where exercise.id = template_exercise_id
      and (public.is_admin() or template.coach_id = auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.workout_template_exercises exercise
    join public.workout_template_blocks block on block.id = exercise.block_id
    join public.workout_templates template on template.id = block.template_id
    where exercise.id = template_exercise_id
      and (public.is_admin() or template.coach_id = auth.uid())
  )
);

create policy "template sets delete via parent exercise"
on public.workout_template_sets for delete
using (
  exists (
    select 1
    from public.workout_template_exercises exercise
    join public.workout_template_blocks block on block.id = exercise.block_id
    join public.workout_templates template on template.id = block.template_id
    where exercise.id = template_exercise_id
      and (public.is_admin() or template.coach_id = auth.uid())
  )
);

create policy "training plans read by participant or admin"
on public.training_plans for select
using (public.is_admin() or coach_id = auth.uid() or athlete_id = auth.uid());

create policy "training plans insert by coach or admin"
on public.training_plans for insert
with check (
  public.is_admin()
  or (coach_id = auth.uid() and public.is_coach_of(athlete_id))
);

create policy "training plans update by coach or admin"
on public.training_plans for update
using (public.is_admin() or (coach_id = auth.uid() and public.is_coach_of(athlete_id)))
with check (public.is_admin() or (coach_id = auth.uid() and public.is_coach_of(athlete_id)));

create policy "training plans delete by coach or admin"
on public.training_plans for delete
using (public.is_admin() or (coach_id = auth.uid() and public.is_coach_of(athlete_id)));

create policy "scheduled workouts read by participant or admin"
on public.scheduled_workouts for select
using (public.is_admin() or coach_id = auth.uid() or athlete_id = auth.uid());

create policy "scheduled workouts insert by coach or admin"
on public.scheduled_workouts for insert
with check (
  public.is_admin()
  or (coach_id = auth.uid() and public.is_coach_of(athlete_id))
);

create policy "scheduled workouts update by coach or admin"
on public.scheduled_workouts for update
using (public.is_admin() or (coach_id = auth.uid() and public.is_coach_of(athlete_id)))
with check (public.is_admin() or (coach_id = auth.uid() and public.is_coach_of(athlete_id)));

create policy "scheduled workouts delete by coach or admin"
on public.scheduled_workouts for delete
using (public.is_admin() or (coach_id = auth.uid() and public.is_coach_of(athlete_id)));

create policy "sessions read by participant or admin"
on public.workout_sessions for select
using (
  public.is_admin()
  or athlete_id = auth.uid()
  or exists (
    select 1
    from public.scheduled_workouts workout
    where workout.id = scheduled_workout_id
      and workout.coach_id = auth.uid()
  )
);

create policy "sessions insert by participant or admin"
on public.workout_sessions for insert
with check (
  public.is_admin()
  or athlete_id = auth.uid()
  or exists (
    select 1
    from public.scheduled_workouts workout
    where workout.id = scheduled_workout_id
      and workout.coach_id = auth.uid()
  )
);

create policy "sessions update by participant or admin"
on public.workout_sessions for update
using (
  public.is_admin()
  or athlete_id = auth.uid()
  or exists (
    select 1
    from public.scheduled_workouts workout
    where workout.id = scheduled_workout_id
      and workout.coach_id = auth.uid()
  )
)
with check (
  public.is_admin()
  or athlete_id = auth.uid()
  or exists (
    select 1
    from public.scheduled_workouts workout
    where workout.id = scheduled_workout_id
      and workout.coach_id = auth.uid()
  )
);

create policy "sessions delete by participant or admin"
on public.workout_sessions for delete
using (
  public.is_admin()
  or athlete_id = auth.uid()
  or exists (
    select 1
    from public.scheduled_workouts workout
    where workout.id = scheduled_workout_id
      and workout.coach_id = auth.uid()
  )
);

create policy "set logs read by participant or admin"
on public.workout_set_logs for select
using (
  public.is_admin()
  or exists (
    select 1
    from public.workout_sessions session
    join public.scheduled_workouts workout on workout.id = session.scheduled_workout_id
    where session.id = session_id
      and (session.athlete_id = auth.uid() or workout.coach_id = auth.uid())
  )
);

create policy "set logs insert by participant or admin"
on public.workout_set_logs for insert
with check (
  public.is_admin()
  or exists (
    select 1
    from public.workout_sessions session
    join public.scheduled_workouts workout on workout.id = session.scheduled_workout_id
    where session.id = session_id
      and (session.athlete_id = auth.uid() or workout.coach_id = auth.uid())
  )
);

create policy "set logs update by participant or admin"
on public.workout_set_logs for update
using (
  public.is_admin()
  or exists (
    select 1
    from public.workout_sessions session
    join public.scheduled_workouts workout on workout.id = session.scheduled_workout_id
    where session.id = session_id
      and (session.athlete_id = auth.uid() or workout.coach_id = auth.uid())
  )
)
with check (
  public.is_admin()
  or exists (
    select 1
    from public.workout_sessions session
    join public.scheduled_workouts workout on workout.id = session.scheduled_workout_id
    where session.id = session_id
      and (session.athlete_id = auth.uid() or workout.coach_id = auth.uid())
  )
);

create policy "set logs delete by participant or admin"
on public.workout_set_logs for delete
using (
  public.is_admin()
  or exists (
    select 1
    from public.workout_sessions session
    join public.scheduled_workouts workout on workout.id = session.scheduled_workout_id
    where session.id = session_id
      and (session.athlete_id = auth.uid() or workout.coach_id = auth.uid())
  )
);

create policy "notes read by participant or admin"
on public.workout_notes for select
using (
  public.is_admin()
  or (athlete_id = auth.uid() and public.is_athlete_of(coach_id))
  or (coach_id = auth.uid() and public.is_coach_of(athlete_id))
);

create policy "notes insert by participant or admin"
on public.workout_notes for insert
with check (
  public.is_admin()
  or (athlete_id = auth.uid() and public.is_athlete_of(coach_id))
  or (coach_id = auth.uid() and public.is_coach_of(athlete_id))
);

create policy "notes update by participant or admin"
on public.workout_notes for update
using (
  public.is_admin()
  or (athlete_id = auth.uid() and public.is_athlete_of(coach_id))
  or (coach_id = auth.uid() and public.is_coach_of(athlete_id))
)
with check (
  public.is_admin()
  or (athlete_id = auth.uid() and public.is_athlete_of(coach_id))
  or (coach_id = auth.uid() and public.is_coach_of(athlete_id))
);

create policy "notes delete by participant or admin"
on public.workout_notes for delete
using (
  public.is_admin()
  or (athlete_id = auth.uid() and public.is_athlete_of(coach_id))
  or (coach_id = auth.uid() and public.is_coach_of(athlete_id))
);

create policy "conversation entries read by participant or admin"
on public.conversation_entries for select
using (
  public.is_admin()
  or athlete_id = auth.uid()
  or (coach_id = auth.uid() and public.is_coach_of(athlete_id))
);

create policy "conversation entries insert by author participant or admin"
on public.conversation_entries for insert
with check (
  public.is_admin()
  or (
    author_user_id = auth.uid()
    and author_role = public.current_role()
    and (
      (athlete_id = auth.uid() and public.is_athlete_of(coach_id))
      or (coach_id = auth.uid() and public.is_coach_of(athlete_id))
    )
  )
);

create policy "conversation entries update by participant or admin"
on public.conversation_entries for update
using (
  public.is_admin()
  or athlete_id = auth.uid()
  or (coach_id = auth.uid() and public.is_coach_of(athlete_id))
)
with check (
  public.is_admin()
  or athlete_id = auth.uid()
  or (coach_id = auth.uid() and public.is_coach_of(athlete_id))
);

create policy "conversation entries delete by author or admin"
on public.conversation_entries for delete
using (public.is_admin() or author_user_id = auth.uid());

create policy "invites read by inviter or admin"
on public.invites for select
using (public.is_admin() or invited_by = auth.uid());

create policy "invites insert by inviter or admin"
on public.invites for insert
with check (public.is_admin() or invited_by = auth.uid());

create policy "invites update by inviter or admin"
on public.invites for update
using (public.is_admin() or invited_by = auth.uid())
with check (public.is_admin() or invited_by = auth.uid());

create policy "invites delete by inviter or admin"
on public.invites for delete
using (public.is_admin() or invited_by = auth.uid());

create policy "password reset requests read by owner or admin"
on public.password_reset_requests for select
using (public.is_admin() or user_id = auth.uid());

create policy "password reset requests insert by owner or admin"
on public.password_reset_requests for insert
with check (public.is_admin() or user_id = auth.uid());

create policy "password reset requests update by owner or admin"
on public.password_reset_requests for update
using (public.is_admin() or user_id = auth.uid())
with check (public.is_admin() or user_id = auth.uid());

create policy "password reset requests delete by admin"
on public.password_reset_requests for delete
using (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-images',
  'profile-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "profile images public read" on storage.objects;
drop policy if exists "profile images insert by owner or admin" on storage.objects;
drop policy if exists "profile images update by owner or admin" on storage.objects;
drop policy if exists "profile images delete by owner or admin" on storage.objects;

create policy "profile images public read"
on storage.objects for select
to public
using (bucket_id = 'profile-images');

create policy "profile images insert by owner or admin"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'profile-images'
  and (
    public.is_admin()
    or (storage.foldername(name))[1] = auth.uid()::text
  )
);

create policy "profile images update by owner or admin"
on storage.objects for update
to authenticated
using (
  bucket_id = 'profile-images'
  and (
    public.is_admin()
    or (storage.foldername(name))[1] = auth.uid()::text
  )
)
with check (
  bucket_id = 'profile-images'
  and (
    public.is_admin()
    or (storage.foldername(name))[1] = auth.uid()::text
  )
);

create policy "profile images delete by owner or admin"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'profile-images'
  and (
    public.is_admin()
    or (storage.foldername(name))[1] = auth.uid()::text
  )
);
