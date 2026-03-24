create index if not exists scheduled_workouts_athlete_program_status_idx
on public.scheduled_workouts (athlete_id, program_workout_id, status);

create index if not exists scheduled_workouts_athlete_status_program_idx
on public.scheduled_workouts (athlete_id, status, program_workout_id);

create index if not exists workout_set_logs_session_exercise_label_done_idx
on public.workout_set_logs (session_id, exercise_id, set_label, done);
