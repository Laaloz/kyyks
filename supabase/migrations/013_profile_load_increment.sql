alter table if exists public.profiles
  add column if not exists load_increment_kg numeric(4,2) not null default 2.5;
