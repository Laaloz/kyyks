-- DB perf: lisää kattavat indeksit indeksoimattomille vierasavaimille
-- (performance advisor: unindexed_foreign_keys 20→0). Nopeuttaa JOINeja sekä
-- vierasavaintarkistuksia (myös viitatun rivin DELETE/UPDATE-operaatioissa).

create index if not exists assigned_meal_plan_items_recipe_idx
  on public.assigned_meal_plan_items (recipe_id);
create index if not exists assigned_meal_plans_assigned_by_idx
  on public.assigned_meal_plans (assigned_by);
create index if not exists assigned_meal_plans_template_idx
  on public.assigned_meal_plans (template_id);
create index if not exists coach_athlete_assignments_athlete_idx
  on public.coach_athlete_assignments (athlete_id);
create index if not exists conversation_entries_author_idx
  on public.conversation_entries (author_user_id);
create index if not exists day_meal_plans_ingredient_idx
  on public.day_meal_plans (ingredient_id);
create index if not exists day_meal_plans_recipe_idx
  on public.day_meal_plans (recipe_id);
create index if not exists ingredient_catalog_created_by_idx
  on public.ingredient_catalog (created_by);
create index if not exists invites_coach_idx
  on public.invites (coach_id);
create index if not exists meal_plan_template_items_recipe_idx
  on public.meal_plan_template_items (recipe_id);
create index if not exists meal_plan_templates_created_by_idx
  on public.meal_plan_templates (created_by);
create index if not exists nutrition_profiles_created_by_idx
  on public.nutrition_profiles (created_by);
create index if not exists nutrition_profiles_updated_by_idx
  on public.nutrition_profiles (updated_by);
create index if not exists password_reset_requests_requested_by_idx
  on public.password_reset_requests (requested_by_user_id);
create index if not exists recipe_ingredients_ingredient_idx
  on public.recipe_ingredients (ingredient_id);
create index if not exists recipes_created_by_idx
  on public.recipes (created_by);
create index if not exists scheduled_workouts_created_by_idx
  on public.scheduled_workouts (created_by);
create index if not exists scheduled_workouts_updated_by_idx
  on public.scheduled_workouts (updated_by);
create index if not exists workout_notes_athlete_idx
  on public.workout_notes (athlete_id);
create index if not exists workout_notes_coach_idx
  on public.workout_notes (coach_id);
