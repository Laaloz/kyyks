alter table public.profiles
  add column if not exists age integer check (age is null or age between 13 and 100),
  add column if not exists sex text check (sex is null or sex in ('female', 'male', 'other'));
