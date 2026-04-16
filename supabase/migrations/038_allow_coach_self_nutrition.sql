drop policy if exists "nutrition profiles insert by coach or admin" on public.nutrition_profiles;
drop policy if exists "nutrition profiles update by coach or admin" on public.nutrition_profiles;
drop policy if exists "assigned meal plans write by coach or admin" on public.assigned_meal_plans;
drop policy if exists "assigned meal plan items write by coach or admin" on public.assigned_meal_plan_items;

create policy "nutrition profiles insert by coach or admin"
on public.nutrition_profiles for insert
with check (
  public.is_admin()
  or auth.uid() = user_id
  or public.is_coach_of(user_id)
);

create policy "nutrition profiles update by coach or admin"
on public.nutrition_profiles for update
using (
  public.is_admin()
  or auth.uid() = user_id
  or public.is_coach_of(user_id)
)
with check (
  public.is_admin()
  or auth.uid() = user_id
  or public.is_coach_of(user_id)
);

create policy "assigned meal plans write by coach or admin"
on public.assigned_meal_plans for all
using (
  public.is_admin()
  or (assigned_by = auth.uid() and (athlete_id = auth.uid() or public.is_coach_of(athlete_id)))
)
with check (
  public.is_admin()
  or (assigned_by = auth.uid() and (athlete_id = auth.uid() or public.is_coach_of(athlete_id)))
);

create policy "assigned meal plan items write by coach or admin"
on public.assigned_meal_plan_items for all
using (
  exists (
    select 1
    from public.assigned_meal_plans plan
    where plan.id = assigned_plan_id
      and (
        public.is_admin()
        or (
          plan.assigned_by = auth.uid()
          and (plan.athlete_id = auth.uid() or public.is_coach_of(plan.athlete_id))
        )
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
        or (
          plan.assigned_by = auth.uid()
          and (plan.athlete_id = auth.uid() or public.is_coach_of(plan.athlete_id))
        )
      )
  )
);
