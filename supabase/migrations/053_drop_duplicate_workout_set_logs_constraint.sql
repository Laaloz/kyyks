-- Two identical UNIQUE constraints existed on
-- workout_set_logs(session_id, template_exercise_id, set_id). Keep the auto-named *_key
-- and drop the redundant duplicate. ON CONFLICT in code and in the atomic RPCs targets the
-- columns (inference), not the constraint name, so upserts keep working on the remaining one.
alter table public.workout_set_logs
  drop constraint if exists workout_set_logs_session_template_set_unique;
