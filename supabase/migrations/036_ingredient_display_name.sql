alter table public.ingredient_catalog
  add column if not exists display_name text;

update public.ingredient_catalog
set display_name = name
where display_name is null;
