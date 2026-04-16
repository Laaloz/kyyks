alter table public.recipe_ingredients
  add column if not exists group_label text;
