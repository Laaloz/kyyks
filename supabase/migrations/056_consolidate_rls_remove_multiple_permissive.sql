-- DB perf: poista päällekkäiset permissive-politiikat (performance advisor:
-- multiple_permissive_policies 60→0). Syy: 7 taulussa on `FOR ALL` -kirjoitus-
-- politiikka joka osuu myös SELECTiin saman taulun lukupolitiikan kanssa, joten
-- Postgres joutuu evaluoimaan molemmat joka rivillä. Korjaus: jaetaan ALL-politiikat
-- erillisiksi INSERT/UPDATE/DELETE-politiikoiksi (sama valtuutuslogiikka säilyy
-- bittiä myöten) ja yhdistetään ingredient_catalogin admin-ALL per-komento­
-- politiikkoihin. Lukupolitiikat (SELECT) jätetään koskematta. Uudet write-
-- politiikat kohdistetaan `TO authenticated` (anon ei kirjoita näihin tauluihin).

-- 1) assigned_meal_plan_items -------------------------------------------------
drop policy if exists "assigned meal plan items write by coach or admin" on public.assigned_meal_plan_items;

create policy "assigned meal plan items insert by coach or admin" on public.assigned_meal_plan_items
  as permissive for insert to authenticated
  with check (exists (select 1 from public.assigned_meal_plans plan
    where plan.id = assigned_meal_plan_items.assigned_plan_id
      and (is_admin() or (plan.assigned_by = (select auth.uid())
        and (plan.athlete_id = (select auth.uid()) or is_coach_of(plan.athlete_id))))));

create policy "assigned meal plan items update by coach or admin" on public.assigned_meal_plan_items
  as permissive for update to authenticated
  using (exists (select 1 from public.assigned_meal_plans plan
    where plan.id = assigned_meal_plan_items.assigned_plan_id
      and (is_admin() or (plan.assigned_by = (select auth.uid())
        and (plan.athlete_id = (select auth.uid()) or is_coach_of(plan.athlete_id))))))
  with check (exists (select 1 from public.assigned_meal_plans plan
    where plan.id = assigned_meal_plan_items.assigned_plan_id
      and (is_admin() or (plan.assigned_by = (select auth.uid())
        and (plan.athlete_id = (select auth.uid()) or is_coach_of(plan.athlete_id))))));

create policy "assigned meal plan items delete by coach or admin" on public.assigned_meal_plan_items
  as permissive for delete to authenticated
  using (exists (select 1 from public.assigned_meal_plans plan
    where plan.id = assigned_meal_plan_items.assigned_plan_id
      and (is_admin() or (plan.assigned_by = (select auth.uid())
        and (plan.athlete_id = (select auth.uid()) or is_coach_of(plan.athlete_id))))));

-- 2) assigned_meal_plans ------------------------------------------------------
drop policy if exists "assigned meal plans write by coach or admin" on public.assigned_meal_plans;

create policy "assigned meal plans insert by coach or admin" on public.assigned_meal_plans
  as permissive for insert to authenticated
  with check (is_admin() or (assigned_by = (select auth.uid())
    and (athlete_id = (select auth.uid()) or is_coach_of(athlete_id))));

create policy "assigned meal plans update by coach or admin" on public.assigned_meal_plans
  as permissive for update to authenticated
  using (is_admin() or (assigned_by = (select auth.uid())
    and (athlete_id = (select auth.uid()) or is_coach_of(athlete_id))))
  with check (is_admin() or (assigned_by = (select auth.uid())
    and (athlete_id = (select auth.uid()) or is_coach_of(athlete_id))));

create policy "assigned meal plans delete by coach or admin" on public.assigned_meal_plans
  as permissive for delete to authenticated
  using (is_admin() or (assigned_by = (select auth.uid())
    and (athlete_id = (select auth.uid()) or is_coach_of(athlete_id))));

-- 3) meal_plan_template_items -------------------------------------------------
drop policy if exists "meal plan template items write by coach or admin" on public.meal_plan_template_items;

create policy "meal plan template items insert by coach or admin" on public.meal_plan_template_items
  as permissive for insert to authenticated
  with check (exists (select 1 from public.meal_plan_templates template
    where template.id = meal_plan_template_items.template_id
      and (is_admin() or template.created_by = (select auth.uid()))));

create policy "meal plan template items update by coach or admin" on public.meal_plan_template_items
  as permissive for update to authenticated
  using (exists (select 1 from public.meal_plan_templates template
    where template.id = meal_plan_template_items.template_id
      and (is_admin() or template.created_by = (select auth.uid()))))
  with check (exists (select 1 from public.meal_plan_templates template
    where template.id = meal_plan_template_items.template_id
      and (is_admin() or template.created_by = (select auth.uid()))));

create policy "meal plan template items delete by coach or admin" on public.meal_plan_template_items
  as permissive for delete to authenticated
  using (exists (select 1 from public.meal_plan_templates template
    where template.id = meal_plan_template_items.template_id
      and (is_admin() or template.created_by = (select auth.uid()))));

-- 4) meal_plan_templates ------------------------------------------------------
drop policy if exists "meal plan templates write by coach or admin" on public.meal_plan_templates;

create policy "meal plan templates insert by coach or admin" on public.meal_plan_templates
  as permissive for insert to authenticated
  with check (is_admin() or (select auth.uid()) = created_by);

create policy "meal plan templates update by coach or admin" on public.meal_plan_templates
  as permissive for update to authenticated
  using (is_admin() or (select auth.uid()) = created_by)
  with check (is_admin() or (select auth.uid()) = created_by);

create policy "meal plan templates delete by coach or admin" on public.meal_plan_templates
  as permissive for delete to authenticated
  using (is_admin() or (select auth.uid()) = created_by);

-- 5) recipe_ingredients -------------------------------------------------------
drop policy if exists "recipe ingredients write by owner or admin" on public.recipe_ingredients;

create policy "recipe ingredients insert by owner or admin" on public.recipe_ingredients
  as permissive for insert to authenticated
  with check (exists (select 1 from public.recipes recipe
    where recipe.id = recipe_ingredients.recipe_id
      and (is_admin() or recipe.created_by = (select auth.uid()))));

create policy "recipe ingredients update by owner or admin" on public.recipe_ingredients
  as permissive for update to authenticated
  using (exists (select 1 from public.recipes recipe
    where recipe.id = recipe_ingredients.recipe_id
      and (is_admin() or recipe.created_by = (select auth.uid()))))
  with check (exists (select 1 from public.recipes recipe
    where recipe.id = recipe_ingredients.recipe_id
      and (is_admin() or recipe.created_by = (select auth.uid()))));

create policy "recipe ingredients delete by owner or admin" on public.recipe_ingredients
  as permissive for delete to authenticated
  using (exists (select 1 from public.recipes recipe
    where recipe.id = recipe_ingredients.recipe_id
      and (is_admin() or recipe.created_by = (select auth.uid()))));

-- 6) recipes ------------------------------------------------------------------
drop policy if exists "recipes write by coach or admin" on public.recipes;

create policy "recipes insert by coach or admin" on public.recipes
  as permissive for insert to authenticated
  with check (is_admin() or (select auth.uid()) = created_by);

create policy "recipes update by coach or admin" on public.recipes
  as permissive for update to authenticated
  using (is_admin() or (select auth.uid()) = created_by)
  with check (is_admin() or (select auth.uid()) = created_by);

create policy "recipes delete by coach or admin" on public.recipes
  as permissive for delete to authenticated
  using (is_admin() or (select auth.uid()) = created_by);

-- 7) ingredient_catalog: poista admin-ALL ja sulauta is_admin() per-komento­
--    politiikkoihin (omat insert/update/delete). Lukupolitiikassa on jo is_admin().
drop policy if exists "ingredient catalog write by admin" on public.ingredient_catalog;
drop policy if exists "ingredient catalog insert own" on public.ingredient_catalog;
drop policy if exists "ingredient catalog update own" on public.ingredient_catalog;
drop policy if exists "ingredient catalog delete own" on public.ingredient_catalog;

create policy "ingredient catalog insert own or admin" on public.ingredient_catalog
  as permissive for insert to authenticated
  with check (is_admin() or (owner_user_id = (select auth.uid())
    and created_by = (select auth.uid())
    and source = any (array['manual'::ingredient_source, 'ai'::ingredient_source])));

create policy "ingredient catalog update own or admin" on public.ingredient_catalog
  as permissive for update to authenticated
  using (is_admin() or owner_user_id = (select auth.uid()))
  with check (is_admin() or (owner_user_id = (select auth.uid())
    and source = any (array['manual'::ingredient_source, 'ai'::ingredient_source])));

create policy "ingredient catalog delete own or admin" on public.ingredient_catalog
  as permissive for delete to authenticated
  using (is_admin() or owner_user_id = (select auth.uid()));
