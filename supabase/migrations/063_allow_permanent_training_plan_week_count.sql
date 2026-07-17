-- Permanent programs ("pysyvä ohjelma", no fixed duration) are stored with
-- week_count = 0. The original check constraint required week_count > 0, which
-- rejected those inserts with "training_plans_week_count_check". Relax it to
-- allow 0 while still forbidding negative values.
alter table public.training_plans
  drop constraint if exists training_plans_week_count_check;

alter table public.training_plans
  add constraint training_plans_week_count_check check (week_count >= 0);
