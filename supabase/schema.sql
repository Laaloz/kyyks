create extension if not exists "pgcrypto";

create type public.app_role as enum ('admin', 'coach', 'athlete');
create type public.template_status as enum ('draft', 'published');
create type public.scheduled_workout_status as enum ('scheduled', 'in_progress', 'completed');
create type public.invite_status as enum ('pending', 'accepted');

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null,
  full_name text not null,
  email text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.coach_athlete_assignments (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists coach_athlete_active_unique
on public.coach_athlete_assignments (athlete_id)
where active = true;

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  equipment text not null,
  cue text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.workout_templates (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text not null default '',
  goal text not null default '',
  status public.template_status not null default 'draft',
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workout_template_blocks (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.workout_templates(id) on delete cascade,
  title text not null,
  note text,
  sort_order int not null default 0
);

create table if not exists public.workout_template_exercises (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references public.workout_template_blocks(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id),
  instruction text not null default '',
  sort_order int not null default 0
);

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

create table if not exists public.training_plans (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  start_date date not null,
  week_count int not null default 4,
  created_at timestamptz not null default now()
);

create table if not exists public.training_plan_templates (
  id uuid primary key default gen_random_uuid(),
  training_plan_id uuid not null references public.training_plans(id) on delete cascade,
  template_id uuid not null references public.workout_templates(id) on delete cascade,
  sort_order int not null default 0
);

create table if not exists public.scheduled_workouts (
  id uuid primary key default gen_random_uuid(),
  training_plan_id uuid references public.training_plans(id) on delete set null,
  template_id uuid not null references public.workout_templates(id) on delete restrict,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  scheduled_date date not null,
  status public.scheduled_workout_status not null default 'scheduled',
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  scheduled_workout_id uuid not null unique references public.scheduled_workouts(id) on delete cascade,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  energy_level int,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.workout_set_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  scheduled_workout_id uuid not null references public.scheduled_workouts(id) on delete cascade,
  template_exercise_id uuid not null references public.workout_template_exercises(id) on delete restrict,
  template_set_id uuid not null references public.workout_template_sets(id) on delete restrict,
  actual_reps int,
  actual_load numeric(6,2),
  rpe numeric(4,1),
  done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workout_notes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.workout_sessions(id) on delete cascade,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

create or replace function public.current_role()
returns public.app_role
language sql
stable
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(public.current_role() = 'admin', false)
$$;

create or replace function public.is_coach_of(target_athlete uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.coach_athlete_assignments
    where coach_id = auth.uid()
      and athlete_id = target_athlete
      and active = true
  )
$$;

alter table public.profiles enable row level security;
alter table public.coach_athlete_assignments enable row level security;
alter table public.workout_templates enable row level security;
alter table public.workout_template_blocks enable row level security;
alter table public.workout_template_exercises enable row level security;
alter table public.workout_template_sets enable row level security;
alter table public.exercises enable row level security;
alter table public.training_plans enable row level security;
alter table public.training_plan_templates enable row level security;
alter table public.scheduled_workouts enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.workout_set_logs enable row level security;
alter table public.workout_notes enable row level security;
alter table public.invites enable row level security;

create policy "profiles self, admin, coach-roster read"
on public.profiles for select
using (
  auth.uid() = id
  or public.is_admin()
  or (
    role = 'athlete'
    and public.is_coach_of(id)
  )
);

create policy "profiles admin manage"
on public.profiles for all
using (public.is_admin())
with check (public.is_admin());

create policy "assignments admin or owning coach"
on public.coach_athlete_assignments for all
using (public.is_admin() or coach_id = auth.uid())
with check (public.is_admin() or coach_id = auth.uid());

create policy "templates admin or owning coach"
on public.workout_templates for all
using (public.is_admin() or coach_id = auth.uid())
with check (public.is_admin() or coach_id = auth.uid());

create policy "exercises authenticated read"
on public.exercises for select
using (auth.role() = 'authenticated');

create policy "exercises admin manage"
on public.exercises for all
using (public.is_admin())
with check (public.is_admin());

create policy "template blocks readable through parent template"
on public.workout_template_blocks for select
using (
  exists (
    select 1
    from public.workout_templates t
    where t.id = template_id
      and (public.is_admin() or t.coach_id = auth.uid())
  )
);

create policy "template blocks writable through parent template"
on public.workout_template_blocks for all
using (
  exists (
    select 1
    from public.workout_templates t
    where t.id = template_id
      and (public.is_admin() or t.coach_id = auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.workout_templates t
    where t.id = template_id
      and (public.is_admin() or t.coach_id = auth.uid())
  )
);

create policy "template exercises access via parent block"
on public.workout_template_exercises for all
using (
  exists (
    select 1
    from public.workout_template_blocks b
    join public.workout_templates t on t.id = b.template_id
    where b.id = block_id
      and (public.is_admin() or t.coach_id = auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.workout_template_blocks b
    join public.workout_templates t on t.id = b.template_id
    where b.id = block_id
      and (public.is_admin() or t.coach_id = auth.uid())
  )
);

create policy "template sets access via parent exercise"
on public.workout_template_sets for all
using (
  exists (
    select 1
    from public.workout_template_exercises te
    join public.workout_template_blocks b on b.id = te.block_id
    join public.workout_templates t on t.id = b.template_id
    where te.id = template_exercise_id
      and (public.is_admin() or t.coach_id = auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.workout_template_exercises te
    join public.workout_template_blocks b on b.id = te.block_id
    join public.workout_templates t on t.id = b.template_id
    where te.id = template_exercise_id
      and (public.is_admin() or t.coach_id = auth.uid())
  )
);

create policy "training plans admin or owning coach"
on public.training_plans for all
using (public.is_admin() or coach_id = auth.uid())
with check (public.is_admin() or coach_id = auth.uid());

create policy "plan templates access through plan"
on public.training_plan_templates for all
using (
  exists (
    select 1
    from public.training_plans p
    where p.id = training_plan_id
      and (public.is_admin() or p.coach_id = auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.training_plans p
    where p.id = training_plan_id
      and (public.is_admin() or p.coach_id = auth.uid())
  )
);

create policy "scheduled workouts admin coach athlete"
on public.scheduled_workouts for select
using (
  public.is_admin()
  or coach_id = auth.uid()
  or athlete_id = auth.uid()
);

create policy "scheduled workouts admin or coach manage"
on public.scheduled_workouts for all
using (public.is_admin() or coach_id = auth.uid() or athlete_id = auth.uid())
with check (public.is_admin() or coach_id = auth.uid() or athlete_id = auth.uid());

create policy "sessions admin coach athlete"
on public.workout_sessions for all
using (
  public.is_admin()
  or athlete_id = auth.uid()
  or exists (
    select 1
    from public.scheduled_workouts sw
    where sw.id = scheduled_workout_id
      and sw.coach_id = auth.uid()
  )
)
with check (
  public.is_admin()
  or athlete_id = auth.uid()
  or exists (
    select 1
    from public.scheduled_workouts sw
    where sw.id = scheduled_workout_id
      and sw.coach_id = auth.uid()
  )
);

create policy "set logs admin coach athlete"
on public.workout_set_logs for all
using (
  public.is_admin()
  or exists (
    select 1
    from public.workout_sessions ws
    join public.scheduled_workouts sw on sw.id = ws.scheduled_workout_id
    where ws.id = session_id
      and (ws.athlete_id = auth.uid() or sw.coach_id = auth.uid())
  )
)
with check (
  public.is_admin()
  or exists (
    select 1
    from public.workout_sessions ws
    join public.scheduled_workouts sw on sw.id = ws.scheduled_workout_id
    where ws.id = session_id
      and (ws.athlete_id = auth.uid() or sw.coach_id = auth.uid())
  )
);

create policy "notes admin coach athlete"
on public.workout_notes for all
using (
  public.is_admin()
  or athlete_id = auth.uid()
  or coach_id = auth.uid()
)
with check (
  public.is_admin()
  or athlete_id = auth.uid()
  or coach_id = auth.uid()
);

create policy "invites admin or owning coach"
on public.invites for all
using (public.is_admin() or invited_by = auth.uid())
with check (public.is_admin() or invited_by = auth.uid());
