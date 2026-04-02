alter table public.training_plans
  drop constraint if exists training_plans_status_check;

alter table public.training_plans
  add constraint training_plans_status_check
  check (status in ('active', 'archived', 'removed'));
