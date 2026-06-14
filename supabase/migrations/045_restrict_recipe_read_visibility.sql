-- Rajaa reseptikirjaston lukua:
-- - admin nakee kaiken
-- - adminin reseptit ovat yleisia kaikille kirjautuneille
-- - coach nakee omat reseptinsa ja aktiiviset urheilijat nakevat coachinsa reseptit
-- - treenaajan oma resepti nakyy tekijalle
-- - paivan ateriaan tai aktiiviseen ateriapohjaan viitattu resepti nakyy kyseiselle
--   treenaajalle ja hanen coachilleen, jotta toteuma/esikatselu ei hajoa

drop policy if exists "recipes read by authenticated users" on public.recipes;

create policy "recipes read by owner audience assignment or admin"
on public.recipes for select
using (
  auth.uid() is not null
  and (
    public.is_admin()
    or owner_role = 'admin'
    or created_by = auth.uid()
    or (
      owner_role = 'coach'
      and exists (
        select 1
        from public.coach_athlete_assignments assignment
        where assignment.coach_id = recipes.created_by
          and assignment.athlete_id = auth.uid()
          and assignment.active
      )
    )
    or exists (
      select 1
      from public.day_meal_plans day_meal
      where day_meal.recipe_id = recipes.id
        and (
          day_meal.athlete_id = auth.uid()
          or public.is_coach_of(day_meal.athlete_id)
        )
    )
    or exists (
      select 1
      from public.assigned_meal_plan_items item
      join public.assigned_meal_plans plan on plan.id = item.assigned_plan_id
      where item.recipe_id = recipes.id
        and plan.active
        and (
          plan.athlete_id = auth.uid()
          or public.is_coach_of(plan.athlete_id)
        )
    )
  )
);

drop policy if exists "recipe ingredients read by authenticated users" on public.recipe_ingredients;

create policy "recipe ingredients read with visible recipe"
on public.recipe_ingredients for select
using (
  auth.uid() is not null
  and exists (
    select 1
    from public.recipes recipe
    where recipe.id = recipe_ingredients.recipe_id
  )
);
