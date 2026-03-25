alter table if exists public.workout_template_exercises
  add column if not exists muscle_group text;
