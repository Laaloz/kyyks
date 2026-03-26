alter table if exists public.scheduled_workouts
  drop column if exists template_id;

drop table if exists public.workout_template_sets;
drop table if exists public.workout_template_exercises;
drop table if exists public.workout_template_blocks;
drop table if exists public.workout_templates;
