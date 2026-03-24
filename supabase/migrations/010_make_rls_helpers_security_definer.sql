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
  )
$$;

grant execute on function public.current_role() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_coach_of(uuid) to authenticated;
grant execute on function public.is_athlete_of(uuid) to authenticated;
