-- Pikalisäys generoivalla kortilla: ad hoc -ruoka voidaan tallentaa heti
-- "arvioidaan"-tilassa ja täydentää AI-arviolla taustalla. ai_status erottaa
-- keskeneräisen (pending) ja epäonnistuneen (failed) valmiista (null).
alter table public.day_meal_plans
  add column if not exists ai_status text;

alter table public.day_meal_plans
  drop constraint if exists day_meal_plans_ai_status_check;
alter table public.day_meal_plans
  add constraint day_meal_plans_ai_status_check
    check (ai_status is null or ai_status in ('pending', 'failed'));
