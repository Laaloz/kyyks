create type public.extra_activity_type as enum (
  'run',
  'walk',
  'cycle',
  'swim',
  'climb',
  'hike',
  'row',
  'ski',
  'yoga',
  'hiit',
  'combat',
  'dance',
  'mobility',
  'other'
);

create table if not exists public.extra_activities (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  activity_type public.extra_activity_type not null,
  duration_minutes int not null check (duration_minutes > 0 and duration_minutes <= 1440),
  estimated_kcal int not null check (estimated_kcal >= 0),
  occurred_at timestamptz not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists extra_activities_athlete_occurred_idx
on public.extra_activities (athlete_id, occurred_at desc);

alter table public.extra_activities enable row level security;

create policy "extra activities read by participant or admin"
on public.extra_activities for select
using (public.is_admin() or auth.uid() = athlete_id or public.is_coach_of(athlete_id));

create policy "extra activities insert by athlete or admin"
on public.extra_activities for insert
with check (public.is_admin() or auth.uid() = athlete_id);

create policy "extra activities update by athlete or admin"
on public.extra_activities for update
using (public.is_admin() or auth.uid() = athlete_id)
with check (public.is_admin() or auth.uid() = athlete_id);

create policy "extra activities delete by athlete or admin"
on public.extra_activities for delete
using (public.is_admin() or auth.uid() = athlete_id);
