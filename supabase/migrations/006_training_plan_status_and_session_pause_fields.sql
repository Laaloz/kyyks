alter table public.training_plans
  add column if not exists description text;

alter table public.training_plans
  add column if not exists status text not null default 'active';

alter table public.training_plans
  drop constraint if exists training_plans_status_check;

alter table public.training_plans
  add constraint training_plans_status_check
  check (status in ('active', 'archived'));

alter table public.workout_sessions
  add column if not exists paused_at timestamptz;

alter table public.workout_sessions
  add column if not exists paused_duration_seconds int not null default 0;
