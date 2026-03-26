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

drop policy if exists "profiles read by self admin linked users" on public.profiles;

create policy "profiles read by self admin linked users"
on public.profiles for select
using (
  auth.uid() = id
  or public.is_admin()
  or (role = 'athlete' and public.is_coach_of(id))
  or (role in ('coach', 'admin') and public.is_athlete_of(id))
);
