create or replace function public.get_latest_autofill_logs(
  p_athlete_id uuid,
  p_exercise_ids text[],
  p_session_limit integer default 12
)
returns table (
  session_id uuid,
  exercise_id text,
  set_label text,
  actual_reps integer,
  actual_load numeric,
  done boolean,
  completed_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  with latest_sessions as (
    select ws.id, ws.completed_at
    from public.workout_sessions ws
    where ws.athlete_id = p_athlete_id
      and ws.completed_at is not null
    order by ws.completed_at desc, ws.id desc
    limit greatest(coalesce(p_session_limit, 12), 1)
  )
  select
    logs.session_id,
    logs.exercise_id,
    logs.set_label,
    logs.actual_reps,
    logs.actual_load,
    logs.done,
    latest_sessions.completed_at
  from latest_sessions
  join public.workout_set_logs logs on logs.session_id = latest_sessions.id
  where logs.exercise_id = any(p_exercise_ids)
  order by latest_sessions.completed_at desc, logs.session_id desc, logs.exercise_id, logs.set_label;
$$;
