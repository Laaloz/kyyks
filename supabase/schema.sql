create extension if not exists "pgcrypto";

create type public.app_role as enum ('admin', 'coach', 'athlete');
create type public.user_status as enum ('active', 'invited');
create type public.template_status as enum ('draft', 'published');
create type public.scheduled_workout_status as enum ('in_progress', 'completed', 'cancelled');
create type public.invite_status as enum ('pending', 'accepted');
create type public.exercise_scope as enum ('global', 'coach_custom');
create type public.theme_mode as enum ('light', 'dark');
create type public.conversation_entry_type as enum (
  'comment'
);
create type public.conversation_context_type as enum ('general', 'workout', 'program');

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null,
  status public.user_status not null default 'invited',
  full_name text not null,
  email text not null,
  default_dashboard_view text,
  email_notifications boolean not null default false,
  theme_mode public.theme_mode not null default 'light',
  load_increment_kg numeric(4,2) not null default 2.5,
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
    check (status in ('active', 'archived')),
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

create table if not exists public.workout_notes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.workout_sessions(id) on delete cascade,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

  if invite_record.role = 'athlete' and invite_record.coach_id is not null then
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
  or (athlete_id = auth.uid() and public.is_athlete_of(coach_id))
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
  or (athlete_id = auth.uid() and public.is_athlete_of(coach_id))
  or (coach_id = auth.uid() and public.is_coach_of(athlete_id))
)
with check (
  public.is_admin()
  or (athlete_id = auth.uid() and public.is_athlete_of(coach_id))
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
