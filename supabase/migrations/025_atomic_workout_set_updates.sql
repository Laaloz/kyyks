create or replace function public.update_workout_set_log(
  p_scheduled_workout_id uuid,
  p_log_id uuid,
  p_requester_id uuid,
  p_requester_role public.app_role,
  p_expected_session_updated_at timestamptz,
  p_has_done boolean default false,
  p_done boolean default false,
  p_has_actual_reps boolean default false,
  p_actual_reps integer default null,
  p_has_actual_load boolean default false,
  p_actual_load numeric default null
)
returns table (
  ok boolean,
  code text,
  message text,
  session_updated_at timestamptz,
  log_id uuid,
  actual_reps integer,
  actual_load numeric,
  done boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workout public.scheduled_workouts%rowtype;
  v_session public.workout_sessions%rowtype;
  v_target_log public.workout_set_logs%rowtype;
  v_timestamp timestamptz := now();
  v_next_done boolean;
  v_next_actual_reps integer;
  v_next_actual_load numeric;
begin
  select *
  into v_workout
  from public.scheduled_workouts
  where id = p_scheduled_workout_id;

  if not found or (p_requester_role <> 'admin' and v_workout.athlete_id <> p_requester_id) then
    return query select false, 'forbidden', 'Treeniä ei löytynyt.', null::timestamptz, null::uuid, null::integer, null::numeric, null::boolean;
    return;
  end if;

  if v_workout.status not in ('in_progress', 'completed') then
    return query select false, 'invalid_state', 'Sarjoja voi muokata vain aktiivisesta tai valmiista treenistä.', null::timestamptz, null::uuid, null::integer, null::numeric, null::boolean;
    return;
  end if;

  select *
  into v_session
  from public.workout_sessions
  where scheduled_workout_id = p_scheduled_workout_id
  for update;

  if not found then
    return query select false, 'stale_session', 'Treeni ehti muuttua ennen tallennusta.', null::timestamptz, null::uuid, null::integer, null::numeric, null::boolean;
    return;
  end if;

  if v_session.updated_at <> p_expected_session_updated_at then
    return query select false, 'stale_session', 'Treeni ehti muuttua ennen tallennusta.', null::timestamptz, null::uuid, null::integer, null::numeric, null::boolean;
    return;
  end if;

  select *
  into v_target_log
  from public.workout_set_logs
  where id = p_log_id
    and scheduled_workout_id = p_scheduled_workout_id
    and session_id = v_session.id
  for update;

  if not found then
    return query select false, 'not_found', 'Sarjaa ei löytynyt.', null::timestamptz, null::uuid, null::integer, null::numeric, null::boolean;
    return;
  end if;

  v_next_done := case when p_has_done then p_done else v_target_log.done end;
  v_next_actual_reps := case when p_has_actual_reps then p_actual_reps else v_target_log.actual_reps end;
  v_next_actual_load := case when p_has_actual_load then p_actual_load else v_target_log.actual_load end;

  if v_next_done and not p_has_actual_reps and v_next_actual_reps is null then
    v_next_actual_reps := coalesce(v_target_log.target_reps_min, v_target_log.target_reps);
  end if;

  if v_next_done and not p_has_actual_load and v_next_actual_load is null and coalesce(v_target_log.target_load, 0) > 0 then
    v_next_actual_load := v_target_log.target_load;
  end if;

  update public.workout_sessions
  set updated_at = v_timestamp
  where id = v_session.id;

  update public.workout_set_logs
  set
    actual_reps = v_next_actual_reps,
    actual_load = v_next_actual_load,
    done = v_next_done,
    updated_at = v_timestamp
  where id = p_log_id;

  if p_has_done and v_target_log.superset_group is not null then
    update public.workout_set_logs
    set
      done = p_done,
      updated_at = v_timestamp,
      actual_reps = case when p_done then v_next_actual_reps else actual_reps end,
      actual_load = case when p_done then v_next_actual_load else actual_load end
    where scheduled_workout_id = p_scheduled_workout_id
      and superset_group = v_target_log.superset_group
      and set_label = v_target_log.set_label
      and id <> p_log_id;
  end if;

  update public.scheduled_workouts
  set updated_at = v_timestamp
  where id = p_scheduled_workout_id;

  return query
  select
    true,
    null::text,
    null::text,
    v_timestamp,
    p_log_id,
    v_next_actual_reps,
    v_next_actual_load,
    v_next_done;
end;
$$;

create or replace function public.complete_workout_atomic(
  p_scheduled_workout_id uuid,
  p_requester_id uuid,
  p_requester_role public.app_role,
  p_expected_session_updated_at timestamptz
)
returns table (
  ok boolean,
  code text,
  message text,
  updated_at timestamptz,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workout public.scheduled_workouts%rowtype;
  v_session public.workout_sessions%rowtype;
  v_count bigint;
  v_timestamp timestamptz := now();
begin
  select * into v_workout from public.scheduled_workouts where id = p_scheduled_workout_id;
  if not found or (p_requester_role <> 'admin' and v_workout.athlete_id <> p_requester_id) then
    return query select false, 'forbidden', 'Treeniä ei löytynyt.', null::timestamptz, null::timestamptz;
    return;
  end if;

  update public.workout_sessions
  set completed_at = v_timestamp, paused_at = null, updated_at = v_timestamp
  where scheduled_workout_id = p_scheduled_workout_id
    and updated_at = p_expected_session_updated_at
  returning * into v_session;

  if not found then
    return query select false, 'stale_session', 'Treeni ehti muuttua ennen viimeistelyä.', null::timestamptz, null::timestamptz;
    return;
  end if;

  select count(*) into v_count from public.workout_set_logs where scheduled_workout_id = p_scheduled_workout_id;
  if coalesce(v_count, 0) = 0 then
    return query select false, 'invalid_state', 'Treeniä ei voitu merkitä valmiiksi.', null::timestamptz, null::timestamptz;
    return;
  end if;

  update public.scheduled_workouts
  set status = 'completed', completed_at = v_timestamp, updated_at = v_timestamp
  where id = p_scheduled_workout_id;

  return query select true, null::text, null::text, v_timestamp, v_timestamp;
end;
$$;

create or replace function public.update_workout_duration_atomic(
  p_scheduled_workout_id uuid,
  p_requester_id uuid,
  p_requester_role public.app_role,
  p_expected_session_updated_at timestamptz,
  p_duration_seconds integer
)
returns table (
  ok boolean,
  code text,
  message text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workout public.scheduled_workouts%rowtype;
  v_session public.workout_sessions%rowtype;
  v_completed_at_ms bigint;
  v_started_at timestamptz;
  v_timestamp timestamptz := now();
begin
  select * into v_workout from public.scheduled_workouts where id = p_scheduled_workout_id;
  if not found or (p_requester_role <> 'admin' and v_workout.athlete_id <> p_requester_id) then
    return query select false, 'forbidden', 'Treeniä ei löytynyt.', null::timestamptz;
    return;
  end if;

  if v_workout.status <> 'completed' then
    return query select false, 'invalid_state', 'Treeniaikaa voi muokata vain valmiilta treeniltä.', null::timestamptz;
    return;
  end if;

  select * into v_session
  from public.workout_sessions
  where scheduled_workout_id = p_scheduled_workout_id
  for update;

  if not found or v_session.completed_at is null then
    return query select false, 'invalid_state', 'Valmiin treenin aikaa ei löytynyt muokattavaksi.', null::timestamptz;
    return;
  end if;

  if v_session.updated_at <> p_expected_session_updated_at then
    return query select false, 'stale_session', 'Treeni ehti muuttua ennen keston tallennusta.', null::timestamptz;
    return;
  end if;

  v_completed_at_ms := floor(extract(epoch from v_session.completed_at) * 1000);
  v_started_at := to_timestamp((v_completed_at_ms - ((p_duration_seconds + coalesce(v_session.paused_duration_seconds, 0)) * 1000)) / 1000.0);

  update public.workout_sessions
  set started_at = v_started_at, updated_at = v_timestamp
  where id = v_session.id;

  update public.scheduled_workouts
  set updated_at = v_timestamp
  where id = p_scheduled_workout_id;

  return query select true, null::text, null::text, v_timestamp;
end;
$$;

create or replace function public.update_workout_date_atomic(
  p_scheduled_workout_id uuid,
  p_requester_id uuid,
  p_requester_role public.app_role,
  p_expected_session_updated_at timestamptz,
  p_scheduled_date text
)
returns table (
  ok boolean,
  code text,
  message text,
  updated_at timestamptz,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workout public.scheduled_workouts%rowtype;
  v_session public.workout_sessions%rowtype;
  v_reference timestamptz;
  v_shifted_reference timestamptz;
  v_delta interval;
  v_timestamp timestamptz := now();
begin
  select * into v_workout from public.scheduled_workouts where id = p_scheduled_workout_id;
  if not found or (p_requester_role <> 'admin' and v_workout.athlete_id <> p_requester_id) then
    return query select false, 'forbidden', 'Treeniä ei löytynyt.', null::timestamptz, null::timestamptz;
    return;
  end if;

  select * into v_session
  from public.workout_sessions
  where scheduled_workout_id = p_scheduled_workout_id
  for update;

  if found and v_session.updated_at <> p_expected_session_updated_at then
    return query select false, 'stale_session', 'Treeni ehti muuttua ennen treenipäivän tallennusta.', null::timestamptz, null::timestamptz;
    return;
  end if;

  v_reference := coalesce(v_workout.completed_at, v_session.completed_at, v_workout.scheduled_date);
  v_shifted_reference := (p_scheduled_date::date + v_reference::time);
  v_delta := v_shifted_reference - v_reference;

  update public.scheduled_workouts
  set
    scheduled_date = scheduled_date + v_delta,
    completed_at = case when completed_at is null then null else completed_at + v_delta end,
    updated_at = v_timestamp
  where id = p_scheduled_workout_id;

  if found then
    update public.workout_sessions
    set
      started_at = started_at + v_delta,
      completed_at = case when completed_at is null then null else completed_at + v_delta end,
      paused_at = case when paused_at is null then null else paused_at + v_delta end,
      updated_at = v_timestamp
    where id = v_session.id;
  end if;

  return query select true, null::text, null::text, v_timestamp, case when v_workout.completed_at is null then null else v_workout.completed_at + v_delta end;
end;
$$;

create or replace function public.save_workout_note_entry(
  p_scheduled_workout_id uuid,
  p_requester_id uuid,
  p_requester_role public.app_role,
  p_body text,
  p_expected_note_updated_at timestamptz default null
)
returns table (
  ok boolean,
  code text,
  message text,
  note_updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workout public.scheduled_workouts%rowtype;
  v_session public.workout_sessions%rowtype;
  v_note public.workout_notes%rowtype;
  v_timestamp timestamptz := now();
begin
  select * into v_workout from public.scheduled_workouts where id = p_scheduled_workout_id;
  if not found or (p_requester_role <> 'admin' and v_workout.athlete_id <> p_requester_id) then
    return query select false, 'forbidden', 'Treeniä ei löytynyt.', null::timestamptz;
    return;
  end if;

  select * into v_session from public.workout_sessions where scheduled_workout_id = p_scheduled_workout_id;
  if not found then
    return query select false, 'invalid_state', 'Aloita treeni ennen muistiinpanon tallennusta.', null::timestamptz;
    return;
  end if;

  select * into v_note from public.workout_notes where session_id = v_session.id for update;

  if found then
    if v_note.updated_at is distinct from p_expected_note_updated_at then
      return query select false, 'stale_note', 'Muistiinpano ehti muuttua ennen tallennusta.', null::timestamptz;
      return;
    end if;

    update public.workout_notes
    set body = p_body, updated_at = v_timestamp
    where id = v_note.id;
  else
    if p_expected_note_updated_at is not null then
      return query select false, 'stale_note', 'Muistiinpano ehti muuttua ennen tallennusta.', null::timestamptz;
      return;
    end if;

    insert into public.workout_notes (session_id, athlete_id, coach_id, body, updated_at)
    values (v_session.id, v_workout.athlete_id, v_workout.coach_id, p_body, v_timestamp);
  end if;

  return query select true, null::text, null::text, v_timestamp;
end;
$$;
