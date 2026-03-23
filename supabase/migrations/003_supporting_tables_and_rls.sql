-- Adds current supporting tables and replaces broad legacy RLS policies.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'conversation_entry_type') then
    create type public.conversation_entry_type as enum (
      'comment',
      'workout_note_saved',
      'workout_started',
      'workout_completed',
      'workout_cancelled',
      'workout_deleted',
      'workout_updated',
      'program_created',
      'program_updated'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'conversation_context_type') then
    create type public.conversation_context_type as enum ('general', 'workout', 'program');
  end if;
end $$;

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

create or replace function public.current_role()
returns public.app_role
language sql
stable
as $$
  select role
  from public.profiles
  where id = auth.uid()
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

create or replace function public.is_athlete_of(target_coach uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.coach_athlete_assignments
    where athlete_id = auth.uid()
      and coach_id = target_coach
      and active = true
  )
$$;

alter table public.profiles enable row level security;
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
alter table public.invites enable row level security;
alter table public.conversation_entries enable row level security;
alter table public.password_reset_requests enable row level security;

drop policy if exists "profiles self, admin, coach-roster read" on public.profiles;
drop policy if exists "profiles admin manage" on public.profiles;
drop policy if exists "profiles read by self admin linked users" on public.profiles;
drop policy if exists "profiles insert by admin" on public.profiles;
drop policy if exists "profiles update by self or admin" on public.profiles;
drop policy if exists "profiles delete by admin" on public.profiles;

drop policy if exists "assignments admin or owning coach" on public.coach_athlete_assignments;
drop policy if exists "assignments read by participant or admin" on public.coach_athlete_assignments;
drop policy if exists "assignments insert by owning coach or admin" on public.coach_athlete_assignments;
drop policy if exists "assignments update by owning coach or admin" on public.coach_athlete_assignments;
drop policy if exists "assignments delete by owning coach or admin" on public.coach_athlete_assignments;

drop policy if exists "exercises authenticated read" on public.exercises;
drop policy if exists "exercises admin manage" on public.exercises;
drop policy if exists "exercises read by authenticated users" on public.exercises;
drop policy if exists "exercises insert by admin or owning coach" on public.exercises;
drop policy if exists "exercises update by admin or owning coach" on public.exercises;
drop policy if exists "exercises delete by admin or owning coach" on public.exercises;

drop policy if exists "templates admin or owning coach" on public.workout_templates;
drop policy if exists "templates read by admin or owning coach" on public.workout_templates;
drop policy if exists "templates insert by admin or owning coach" on public.workout_templates;
drop policy if exists "templates update by admin or owning coach" on public.workout_templates;
drop policy if exists "templates delete by admin or owning coach" on public.workout_templates;

drop policy if exists "template blocks readable through parent template" on public.workout_template_blocks;
drop policy if exists "template blocks writable through parent template" on public.workout_template_blocks;
drop policy if exists "template blocks read via parent template" on public.workout_template_blocks;
drop policy if exists "template blocks insert via parent template" on public.workout_template_blocks;
drop policy if exists "template blocks update via parent template" on public.workout_template_blocks;
drop policy if exists "template blocks delete via parent template" on public.workout_template_blocks;

drop policy if exists "template exercises access via parent block" on public.workout_template_exercises;
drop policy if exists "template exercises read via parent block" on public.workout_template_exercises;
drop policy if exists "template exercises insert via parent block" on public.workout_template_exercises;
drop policy if exists "template exercises update via parent block" on public.workout_template_exercises;
drop policy if exists "template exercises delete via parent block" on public.workout_template_exercises;

drop policy if exists "template sets access via parent exercise" on public.workout_template_sets;
drop policy if exists "template sets read via parent exercise" on public.workout_template_sets;
drop policy if exists "template sets insert via parent exercise" on public.workout_template_sets;
drop policy if exists "template sets update via parent exercise" on public.workout_template_sets;
drop policy if exists "template sets delete via parent exercise" on public.workout_template_sets;

drop policy if exists "training plans admin or owning coach" on public.training_plans;
drop policy if exists "training plans read by participant or admin" on public.training_plans;
drop policy if exists "training plans insert by coach or admin" on public.training_plans;
drop policy if exists "training plans update by coach or admin" on public.training_plans;
drop policy if exists "training plans delete by coach or admin" on public.training_plans;

drop policy if exists "scheduled workouts admin coach athlete" on public.scheduled_workouts;
drop policy if exists "scheduled workouts admin or coach manage" on public.scheduled_workouts;
drop policy if exists "scheduled workouts read by participant or admin" on public.scheduled_workouts;
drop policy if exists "scheduled workouts insert by coach or admin" on public.scheduled_workouts;
drop policy if exists "scheduled workouts update by coach or admin" on public.scheduled_workouts;
drop policy if exists "scheduled workouts delete by coach or admin" on public.scheduled_workouts;

drop policy if exists "sessions admin coach athlete" on public.workout_sessions;
drop policy if exists "sessions read by participant or admin" on public.workout_sessions;
drop policy if exists "sessions insert by participant or admin" on public.workout_sessions;
drop policy if exists "sessions update by participant or admin" on public.workout_sessions;
drop policy if exists "sessions delete by participant or admin" on public.workout_sessions;

drop policy if exists "set logs admin coach athlete" on public.workout_set_logs;
drop policy if exists "set logs read by participant or admin" on public.workout_set_logs;
drop policy if exists "set logs insert by participant or admin" on public.workout_set_logs;
drop policy if exists "set logs update by participant or admin" on public.workout_set_logs;
drop policy if exists "set logs delete by participant or admin" on public.workout_set_logs;

drop policy if exists "notes admin coach athlete" on public.workout_notes;
drop policy if exists "notes read by participant or admin" on public.workout_notes;
drop policy if exists "notes insert by participant or admin" on public.workout_notes;
drop policy if exists "notes update by participant or admin" on public.workout_notes;
drop policy if exists "notes delete by participant or admin" on public.workout_notes;

drop policy if exists "invites admin or owning coach" on public.invites;
drop policy if exists "invites read by inviter or admin" on public.invites;
drop policy if exists "invites insert by inviter or admin" on public.invites;
drop policy if exists "invites update by inviter or admin" on public.invites;
drop policy if exists "invites delete by inviter or admin" on public.invites;

drop policy if exists "conversation entries read by participant or admin" on public.conversation_entries;
drop policy if exists "conversation entries insert by author participant or admin" on public.conversation_entries;
drop policy if exists "conversation entries update by participant or admin" on public.conversation_entries;
drop policy if exists "conversation entries delete by author or admin" on public.conversation_entries;

drop policy if exists "password reset requests read by owner or admin" on public.password_reset_requests;
drop policy if exists "password reset requests insert by owner or admin" on public.password_reset_requests;
drop policy if exists "password reset requests update by owner or admin" on public.password_reset_requests;
drop policy if exists "password reset requests delete by admin" on public.password_reset_requests;

create policy "profiles read by self admin linked users"
on public.profiles for select
using (
  auth.uid() = id
  or public.is_admin()
  or (role = 'athlete' and public.is_coach_of(id))
  or (role = 'coach' and public.is_athlete_of(id))
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
