alter table public.recipes
  add column if not exists dietary_flags text[] not null default '{}'::text[],
  add column if not exists allergies text[] not null default '{}'::text[];

drop policy if exists "nutrition profiles insert by admin" on public.nutrition_profiles;
drop policy if exists "nutrition profiles update by admin" on public.nutrition_profiles;
drop policy if exists "recipes write by admin" on public.recipes;
drop policy if exists "meal plan templates write by admin" on public.meal_plan_templates;
drop policy if exists "meal plan template items write by admin" on public.meal_plan_template_items;
drop policy if exists "assigned meal plans write by admin" on public.assigned_meal_plans;
drop policy if exists "assigned meal plan items write by admin" on public.assigned_meal_plan_items;

create policy "nutrition profiles insert by coach or admin"
on public.nutrition_profiles for insert
with check (public.is_admin() or public.is_coach_of(user_id));

create policy "nutrition profiles update by coach or admin"
on public.nutrition_profiles for update
using (public.is_admin() or public.is_coach_of(user_id))
with check (public.is_admin() or public.is_coach_of(user_id));

create policy "recipes write by coach or admin"
on public.recipes for all
using (public.is_admin() or auth.uid() = created_by)
with check (public.is_admin() or auth.uid() = created_by);

create policy "meal plan templates write by coach or admin"
on public.meal_plan_templates for all
using (public.is_admin() or auth.uid() = created_by)
with check (public.is_admin() or auth.uid() = created_by);

create policy "meal plan template items write by coach or admin"
on public.meal_plan_template_items for all
using (
  exists (
    select 1
    from public.meal_plan_templates template
    where template.id = template_id
      and (public.is_admin() or template.created_by = auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.meal_plan_templates template
    where template.id = template_id
      and (public.is_admin() or template.created_by = auth.uid())
  )
);

create policy "assigned meal plans write by coach or admin"
on public.assigned_meal_plans for all
using (public.is_admin() or (assigned_by = auth.uid() and public.is_coach_of(athlete_id)))
with check (public.is_admin() or (assigned_by = auth.uid() and public.is_coach_of(athlete_id)));

create policy "assigned meal plan items write by coach or admin"
on public.assigned_meal_plan_items for all
using (
  exists (
    select 1
    from public.assigned_meal_plans plan
    where plan.id = assigned_plan_id
      and (
        public.is_admin()
        or (plan.assigned_by = auth.uid() and public.is_coach_of(plan.athlete_id))
      )
  )
)
with check (
  exists (
    select 1
    from public.assigned_meal_plans plan
    where plan.id = assigned_plan_id
      and (
        public.is_admin()
        or (plan.assigned_by = auth.uid() and public.is_coach_of(plan.athlete_id))
      )
  )
);
