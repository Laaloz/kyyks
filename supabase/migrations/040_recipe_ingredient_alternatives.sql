alter table public.recipe_ingredients
  add column if not exists alternatives text[] not null default '{}'::text[];
