create type public.nutrition_goal as enum ('maintain', 'gain', 'lose');
create type public.nutrition_activity_level as enum ('low', 'moderate', 'high');
create type public.nutrition_owner_role as enum ('admin', 'coach');
create type public.ingredient_source as enum ('fineli', 'open_food_facts', 'manual');
create type public.ingredient_unit as enum ('g', 'ml', 'pcs');
create type public.ingredient_role as enum ('main', 'spice', 'garnish');
create type public.ingredient_scaling_mode as enum ('linear', 'fixed', 'text_only');
create type public.meal_tag as enum ('breakfast', 'lunch', 'snack', 'dinner', 'evening_snack');
create type public.purchase_unit as enum ('g', 'kg', 'ml', 'l', 'pcs', 'pack');

create table if not exists public.nutrition_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  goal public.nutrition_goal not null default 'maintain',
  activity_level public.nutrition_activity_level not null default 'moderate',
  meals_per_day int not null default 5 check (meals_per_day between 3 and 6),
  target_kcal int not null default 2000 check (target_kcal >= 1200),
  protein_g numeric(6,2) not null default 140,
  carbs_g numeric(6,2) not null default 220,
  fat_g numeric(6,2) not null default 70,
  calculation_mode text not null default 'auto'
    check (calculation_mode in ('auto', 'manual_override')),
  coach_notes text,
  dietary_flags text[] not null default '{}'::text[],
  allergies text[] not null default '{}'::text[],
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ingredient_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  display_name text,
  source public.ingredient_source not null default 'manual',
  source_external_id text,
  owner_role public.nutrition_owner_role not null default 'admin',
  created_by uuid not null references public.profiles(id),
  default_purchase_unit public.purchase_unit,
  grams_per_unit numeric(8,2),
  kcal_per_100 numeric(8,2) not null default 0,
  protein_per_100 numeric(8,2) not null default 0,
  carbs_per_100 numeric(8,2) not null default 0,
  fat_per_100 numeric(8,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ingredient_catalog_name_idx
on public.ingredient_catalog (name);

create unique index if not exists ingredient_catalog_source_external_unique
on public.ingredient_catalog (source, source_external_id)
where source_external_id is not null;

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  instructions text not null default '',
  meal_tag public.meal_tag not null,
  owner_role public.nutrition_owner_role not null default 'admin',
  created_by uuid not null references public.profiles(id),
  default_servings int not null default 1 check (default_servings > 0),
  min_servings int not null default 1 check (min_servings > 0),
  max_servings int not null default 1 check (max_servings > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recipes_serving_bounds_check
    check (min_servings <= default_servings and default_servings <= max_servings)
);

create table if not exists public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  ingredient_id uuid references public.ingredient_catalog(id) on delete set null,
  ingredient_name text not null,
  quantity numeric(8,2),
  unit public.ingredient_unit not null default 'g',
  display_quantity text,
  display_unit text,
  normalized_quantity numeric(8,2),
  ingredient_role public.ingredient_role not null default 'main',
  scaling_mode public.ingredient_scaling_mode not null default 'linear',
  sort_order int not null default 0
);

create index if not exists recipe_ingredients_recipe_idx
on public.recipe_ingredients (recipe_id, sort_order);

create table if not exists public.meal_plan_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  owner_role public.nutrition_owner_role not null default 'admin',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.meal_plan_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.meal_plan_templates(id) on delete cascade,
  meal_tag public.meal_tag not null,
  recipe_id uuid not null references public.recipes(id) on delete restrict,
  sort_order int not null default 0
);

create index if not exists meal_plan_template_items_template_idx
on public.meal_plan_template_items (template_id, sort_order);

create table if not exists public.assigned_meal_plans (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  template_id uuid not null references public.meal_plan_templates(id) on delete restrict,
  assigned_by uuid not null references public.profiles(id),
  name text not null,
  active boolean not null default true,
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists assigned_meal_plans_athlete_idx
on public.assigned_meal_plans (athlete_id, assigned_at desc);

create table if not exists public.assigned_meal_plan_items (
  id uuid primary key default gen_random_uuid(),
  assigned_plan_id uuid not null references public.assigned_meal_plans(id) on delete cascade,
  meal_tag public.meal_tag not null,
  recipe_id uuid not null references public.recipes(id) on delete restrict,
  sort_order int not null default 0
);

create index if not exists assigned_meal_plan_items_plan_idx
on public.assigned_meal_plan_items (assigned_plan_id, sort_order);

alter table public.nutrition_profiles enable row level security;
alter table public.ingredient_catalog enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.meal_plan_templates enable row level security;
alter table public.meal_plan_template_items enable row level security;
alter table public.assigned_meal_plans enable row level security;
alter table public.assigned_meal_plan_items enable row level security;

create policy "nutrition profiles read by participant or admin"
on public.nutrition_profiles for select
using (public.is_admin() or auth.uid() = user_id or public.is_coach_of(user_id));

create policy "nutrition profiles insert by admin"
on public.nutrition_profiles for insert
with check (public.is_admin());

create policy "nutrition profiles update by admin"
on public.nutrition_profiles for update
using (public.is_admin())
with check (public.is_admin());

create policy "nutrition profiles delete by admin"
on public.nutrition_profiles for delete
using (public.is_admin());

create policy "ingredient catalog read by authenticated users"
on public.ingredient_catalog for select
using (auth.uid() is not null);

create policy "ingredient catalog write by admin"
on public.ingredient_catalog for all
using (public.is_admin())
with check (public.is_admin());

create policy "recipes read by authenticated users"
on public.recipes for select
using (auth.uid() is not null);

create policy "recipes write by admin"
on public.recipes for all
using (public.is_admin())
with check (public.is_admin());

create policy "recipe ingredients read by authenticated users"
on public.recipe_ingredients for select
using (auth.uid() is not null);

create policy "recipe ingredients write by admin"
on public.recipe_ingredients for all
using (public.is_admin())
with check (public.is_admin());

create policy "meal plan templates read by authenticated users"
on public.meal_plan_templates for select
using (auth.uid() is not null);

create policy "meal plan templates write by admin"
on public.meal_plan_templates for all
using (public.is_admin())
with check (public.is_admin());

create policy "meal plan template items read by authenticated users"
on public.meal_plan_template_items for select
using (auth.uid() is not null);

create policy "meal plan template items write by admin"
on public.meal_plan_template_items for all
using (public.is_admin())
with check (public.is_admin());

create policy "assigned meal plans read by participant or admin"
on public.assigned_meal_plans for select
using (public.is_admin() or auth.uid() = athlete_id or public.is_coach_of(athlete_id));

create policy "assigned meal plans write by admin"
on public.assigned_meal_plans for all
using (public.is_admin())
with check (public.is_admin());

create policy "assigned meal plan items read via assigned plan"
on public.assigned_meal_plan_items for select
using (
  exists (
    select 1
    from public.assigned_meal_plans plan
    where plan.id = assigned_plan_id
      and (public.is_admin() or auth.uid() = plan.athlete_id or public.is_coach_of(plan.athlete_id))
  )
);

create policy "assigned meal plan items write by admin"
on public.assigned_meal_plan_items for all
using (public.is_admin())
with check (public.is_admin());
