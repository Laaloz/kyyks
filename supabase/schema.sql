


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."app_role" AS ENUM (
    'admin',
    'coach',
    'athlete',
    'independent_athlete'
);


ALTER TYPE "public"."app_role" OWNER TO "postgres";


CREATE TYPE "public"."conversation_context_type" AS ENUM (
    'general',
    'workout',
    'program'
);


ALTER TYPE "public"."conversation_context_type" OWNER TO "postgres";


CREATE TYPE "public"."conversation_entry_type" AS ENUM (
    'comment',
    'admin_message'
);


ALTER TYPE "public"."conversation_entry_type" OWNER TO "postgres";


CREATE TYPE "public"."exercise_scope" AS ENUM (
    'global',
    'coach_custom'
);


ALTER TYPE "public"."exercise_scope" OWNER TO "postgres";


CREATE TYPE "public"."extra_activity_type" AS ENUM (
    'run',
    'walk',
    'cycle',
    'swim',
    'climb',
    'hike',
    'row',
    'ski',
    'yoga',
    'hiit',
    'combat',
    'dance',
    'mobility',
    'other',
    'indoor_cycle',
    'treadmill',
    'stair_climber',
    'elliptical',
    'mtb',
    'downhill_ski',
    'disc_golf',
    'skate',
    'paddle'
);


ALTER TYPE "public"."extra_activity_type" OWNER TO "postgres";


CREATE TYPE "public"."ingredient_role" AS ENUM (
    'main',
    'spice',
    'garnish'
);


ALTER TYPE "public"."ingredient_role" OWNER TO "postgres";


CREATE TYPE "public"."ingredient_scaling_mode" AS ENUM (
    'linear',
    'gentle',
    'fixed',
    'text_only'
);


ALTER TYPE "public"."ingredient_scaling_mode" OWNER TO "postgres";


CREATE TYPE "public"."ingredient_source" AS ENUM (
    'fineli',
    'open_food_facts',
    'manual',
    'ai'
);


ALTER TYPE "public"."ingredient_source" OWNER TO "postgres";


CREATE TYPE "public"."ingredient_unit" AS ENUM (
    'g',
    'ml',
    'pcs'
);


ALTER TYPE "public"."ingredient_unit" OWNER TO "postgres";


CREATE TYPE "public"."invite_status" AS ENUM (
    'pending',
    'accepted'
);


ALTER TYPE "public"."invite_status" OWNER TO "postgres";


CREATE TYPE "public"."meal_tag" AS ENUM (
    'breakfast',
    'lunch',
    'snack',
    'dinner',
    'evening_snack'
);


ALTER TYPE "public"."meal_tag" OWNER TO "postgres";


CREATE TYPE "public"."nutrition_activity_level" AS ENUM (
    'low',
    'moderate',
    'high'
);


ALTER TYPE "public"."nutrition_activity_level" OWNER TO "postgres";


CREATE TYPE "public"."nutrition_goal" AS ENUM (
    'maintain',
    'gain',
    'lose'
);


ALTER TYPE "public"."nutrition_goal" OWNER TO "postgres";


CREATE TYPE "public"."nutrition_owner_role" AS ENUM (
    'admin',
    'coach',
    'athlete'
);


ALTER TYPE "public"."nutrition_owner_role" OWNER TO "postgres";


CREATE TYPE "public"."purchase_unit" AS ENUM (
    'g',
    'kg',
    'ml',
    'l',
    'pcs',
    'pack'
);


ALTER TYPE "public"."purchase_unit" OWNER TO "postgres";


CREATE TYPE "public"."scheduled_workout_status" AS ENUM (
    'in_progress',
    'completed',
    'cancelled'
);


ALTER TYPE "public"."scheduled_workout_status" OWNER TO "postgres";


CREATE TYPE "public"."template_status" AS ENUM (
    'draft',
    'published'
);


ALTER TYPE "public"."template_status" OWNER TO "postgres";


CREATE TYPE "public"."theme_mode" AS ENUM (
    'light',
    'dark',
    'mallu',
    'camel'
);


ALTER TYPE "public"."theme_mode" OWNER TO "postgres";


CREATE TYPE "public"."user_status" AS ENUM (
    'active',
    'invited'
);


ALTER TYPE "public"."user_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_workout_atomic"("p_scheduled_workout_id" "uuid", "p_requester_id" "uuid", "p_requester_role" "public"."app_role", "p_expected_session_updated_at" timestamp with time zone) RETURNS TABLE("ok" boolean, "code" "text", "message" "text", "updated_at" timestamp with time zone, "completed_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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

  select * into v_session
  from public.workout_sessions
  where scheduled_workout_id = p_scheduled_workout_id
  order by updated_at desc, id desc
  limit 1
  for update;

  if not found or v_session.updated_at <> p_expected_session_updated_at then
    return query select false, 'stale_session', 'Treeni ehti muuttua ennen viimeistelyä.', null::timestamptz, null::timestamptz;
    return;
  end if;

  select count(*) into v_count
  from public.workout_set_logs
  where scheduled_workout_id = p_scheduled_workout_id
    and session_id = v_session.id;

  if coalesce(v_count, 0) = 0 then
    return query select false, 'invalid_state', 'Treeniä ei voitu merkitä valmiiksi.', null::timestamptz, null::timestamptz;
    return;
  end if;

  update public.workout_sessions
  set completed_at = v_timestamp, paused_at = null, updated_at = v_timestamp
  where id = v_session.id;

  update public.scheduled_workouts
  set status = 'completed', completed_at = v_timestamp, updated_at = v_timestamp
  where id = p_scheduled_workout_id;

  return query select true, null::text, null::text, v_timestamp, v_timestamp;
end;
$$;


ALTER FUNCTION "public"."complete_workout_atomic"("p_scheduled_workout_id" "uuid", "p_requester_id" "uuid", "p_requester_role" "public"."app_role", "p_expected_session_updated_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_email"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select email
  from public.profiles
  where id = auth.uid()
$$;


ALTER FUNCTION "public"."current_email"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_role"() RETURNS "public"."app_role"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select role
  from public.profiles
  where id = auth.uid()
$$;


ALTER FUNCTION "public"."current_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_status"() RETURNS "public"."user_status"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select status
  from public.profiles
  where id = auth.uid()
$$;


ALTER FUNCTION "public"."current_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_latest_autofill_logs"("p_athlete_id" "uuid", "p_exercise_ids" "text"[], "p_session_limit" integer DEFAULT 12) RETURNS TABLE("session_id" "uuid", "exercise_id" "text", "set_label" "text", "actual_reps" integer, "actual_load" numeric, "done" boolean, "completed_at" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."get_latest_autofill_logs"("p_athlete_id" "uuid", "p_exercise_ids" "text"[], "p_session_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_auth_user_profile_sync"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  perform public.sync_profile_from_auth_user(
    new.id,
    new.email,
    new.raw_user_meta_data,
    new.created_at
  );

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_auth_user_profile_sync"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select coalesce(public.current_role() = 'admin', false)
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_athlete_of"("target_coach" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.coach_athlete_assignments
    where athlete_id = auth.uid()
      and coach_id = target_coach
      and active = true
  ) or exists (
    select 1
    from public.profiles profile
    where profile.id = target_coach
      and profile.role = 'admin'
      and (
        exists (
          select 1
          from public.training_plans plan
          where plan.athlete_id = auth.uid()
            and plan.coach_id = target_coach
        )
        or exists (
          select 1
          from public.scheduled_workouts workout
          where workout.athlete_id = auth.uid()
            and workout.coach_id = target_coach
        )
      )
  )
$$;


ALTER FUNCTION "public"."is_athlete_of"("target_coach" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_coach_of"("target_athlete" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.coach_athlete_assignments
    where coach_id = auth.uid()
      and athlete_id = target_athlete
      and active = true
  )
$$;


ALTER FUNCTION "public"."is_coach_of"("target_athlete" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_workout_note_entry"("p_scheduled_workout_id" "uuid", "p_requester_id" "uuid", "p_requester_role" "public"."app_role", "p_body" "text", "p_expected_note_updated_at" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE("ok" boolean, "code" "text", "message" "text", "note_updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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

  select * into v_session
  from public.workout_sessions
  where scheduled_workout_id = p_scheduled_workout_id
  order by updated_at desc, id desc
  limit 1;

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


ALTER FUNCTION "public"."save_workout_note_entry"("p_scheduled_workout_id" "uuid", "p_requester_id" "uuid", "p_requester_role" "public"."app_role", "p_body" "text", "p_expected_note_updated_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."start_workout_atomic"("p_requester_id" "uuid", "p_requester_role" "public"."app_role", "p_set_logs" "jsonb", "p_scheduled_workout_id" "uuid" DEFAULT NULL::"uuid", "p_training_plan_id" "uuid" DEFAULT NULL::"uuid", "p_program_workout_id" "text" DEFAULT NULL::"text") RETURNS TABLE("ok" boolean, "code" "text", "message" "text", "scheduled_workout_id" "uuid", "session_id" "uuid", "updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_plan public.training_plans%rowtype;
  v_workout public.scheduled_workouts%rowtype;
  v_existing_workout public.scheduled_workouts%rowtype;
  v_blocking_workout public.scheduled_workouts%rowtype;
  v_session public.workout_sessions%rowtype;
  v_timestamp timestamptz := now();
  v_set_log_count integer := coalesce(jsonb_array_length(coalesce(p_set_logs, '[]'::jsonb)), 0);
  v_inserted_session boolean := false;
begin
  if p_scheduled_workout_id is null then
    if p_training_plan_id is null or p_program_workout_id is null then
      return query select false, 'invalid_state', 'Harjoituksen käynnistys epäonnistui.', null::uuid, null::uuid, null::timestamptz;
      return;
    end if;

    select *
    into v_plan
    from public.training_plans plan
    where plan.id = p_training_plan_id
    for update;

    if not found or (p_requester_role <> 'admin' and v_plan.athlete_id <> p_requester_id) then
      return query select false, 'forbidden', 'Ohjelmaa ei löytynyt tai se ei kuulu sinulle.', null::uuid, null::uuid, null::timestamptz;
      return;
    end if;

    if coalesce(v_plan.status, 'active') <> 'active' then
      return query select false, 'invalid_state', 'Ohjelma on arkistoitu eikä siitä voi käynnistää uutta treeniä.', null::uuid, null::uuid, null::timestamptz;
      return;
    end if;

    select *
    into v_existing_workout
    from public.scheduled_workouts workout
    where workout.athlete_id = v_plan.athlete_id
      and workout.program_workout_id = p_program_workout_id
      and workout.status in ('in_progress', 'cancelled')
    order by workout.updated_at desc, workout.id desc
    limit 1
    for update;

    if found then
      select *
      into v_session
      from public.workout_sessions
      where public.workout_sessions.scheduled_workout_id = v_existing_workout.id
      for update;

      if found and v_session.completed_at is null then
        return query select true, null::text, null::text, v_existing_workout.id, v_session.id, v_session.updated_at;
        return;
      end if;
    end if;

    select *
    into v_blocking_workout
    from public.scheduled_workouts workout
    where workout.athlete_id = v_plan.athlete_id
      and workout.status = 'in_progress'
      and (workout.program_workout_id is distinct from p_program_workout_id)
    order by workout.updated_at desc, workout.id desc
    limit 1;

    if found then
      select *
      into v_session
      from public.workout_sessions
      where public.workout_sessions.scheduled_workout_id = v_blocking_workout.id;

      if not found or v_session.completed_at is null then
        return query select false, 'invalid_state', format('Sinulla on kesken oleva treeni "%s". Jatka se ensin.', coalesce(nullif(trim(v_blocking_workout.title), ''), 'Treeni')), null::uuid, null::uuid, null::timestamptz;
        return;
      end if;
    end if;

    insert into public.scheduled_workouts (
      training_plan_id,
      program_workout_id,
      athlete_id,
      coach_id,
      title,
      scheduled_date,
      status,
      created_by,
      updated_by,
      created_at,
      updated_at
    )
    values (
      v_plan.id,
      p_program_workout_id,
      v_plan.athlete_id,
      v_plan.coach_id,
      coalesce(
        nullif(
          (
            select program_workout ->> 'name'
            from jsonb_array_elements(v_plan.workouts) program_workout
            where program_workout ->> 'id' = p_program_workout_id
            limit 1
          ),
          ''
        ),
        'Treeni'
      ),
      v_timestamp,
      'in_progress',
      p_requester_id,
      p_requester_id,
      v_timestamp,
      v_timestamp
    )
    returning * into v_workout;
  else
    select *
    into v_workout
    from public.scheduled_workouts workout
    where workout.id = p_scheduled_workout_id
    for update;

    if not found or (p_requester_role <> 'admin' and v_workout.athlete_id <> p_requester_id) then
      return query select false, 'forbidden', 'Treeniä ei löytynyt.', null::uuid, null::uuid, null::timestamptz;
      return;
    end if;
  end if;

  select *
  into v_session
  from public.workout_sessions
  where public.workout_sessions.scheduled_workout_id = v_workout.id
  for update;

  if found then
    if v_workout.status in ('completed', 'in_progress') then
      return query select true, null::text, null::text, v_workout.id, v_session.id, v_session.updated_at;
      return;
    end if;

    update public.workout_sessions
    set
      paused_at = null,
      paused_duration_seconds = coalesce(paused_duration_seconds, 0) +
        case
          when paused_at is not null and v_timestamp >= paused_at
            then extract(epoch from (v_timestamp - paused_at))::integer
          else 0
        end,
      updated_at = v_timestamp
    where public.workout_sessions.id = v_session.id
    returning * into v_session;

    update public.scheduled_workouts
    set status = 'in_progress', updated_at = v_timestamp, updated_by = p_requester_id
    where public.scheduled_workouts.id = v_workout.id;

    return query select true, null::text, null::text, v_workout.id, v_session.id, v_session.updated_at;
    return;
  end if;

  update public.scheduled_workouts
  set status = 'in_progress', updated_at = v_timestamp, updated_by = p_requester_id
  where public.scheduled_workouts.id = v_workout.id
  returning * into v_workout;

  insert into public.workout_sessions (
    scheduled_workout_id,
    athlete_id,
    started_at,
    updated_at,
    paused_duration_seconds
  )
  values (
    v_workout.id,
    v_workout.athlete_id,
    v_timestamp,
    v_timestamp,
    0
  )
  on conflict do nothing
  returning * into v_session;

  if found then
    v_inserted_session := true;
  else
    select *
    into v_session
    from public.workout_sessions
    where public.workout_sessions.scheduled_workout_id = v_workout.id
    for update;
  end if;

  if v_inserted_session and v_set_log_count > 0 then
    insert into public.workout_set_logs (
      session_id,
      scheduled_workout_id,
      template_exercise_id,
      set_id,
      exercise_id,
      exercise_name,
      muscle_group,
      superset_group,
      set_label,
      target_reps,
      target_reps_min,
      target_reps_max,
      target_load,
      target_rest_seconds,
      program_workout_id,
      actual_reps,
      actual_load,
      done
    )
    select
      v_session.id,
      v_workout.id,
      logs.template_exercise_id,
      logs.set_id,
      logs.exercise_id,
      logs.exercise_name,
      logs.muscle_group,
      logs.superset_group,
      logs.set_label,
      logs.target_reps,
      logs.target_reps_min,
      logs.target_reps_max,
      logs.target_load,
      logs.target_rest_seconds,
      logs.program_workout_id,
      logs.actual_reps,
      logs.actual_load,
      coalesce(logs.done, false)
    from jsonb_to_recordset(coalesce(p_set_logs, '[]'::jsonb)) as logs(
      template_exercise_id text,
      set_id text,
      exercise_id text,
      exercise_name text,
      muscle_group text,
      superset_group text,
      set_label text,
      target_reps int,
      target_reps_min int,
      target_reps_max int,
      target_load numeric,
      target_rest_seconds int,
      program_workout_id text,
      actual_reps int,
      actual_load numeric,
      done boolean
    )
    on conflict (session_id, template_exercise_id, set_id) do nothing;
  end if;

  return query select true, null::text, null::text, v_workout.id, v_session.id, v_session.updated_at;
end;
$$;


ALTER FUNCTION "public"."start_workout_atomic"("p_requester_id" "uuid", "p_requester_role" "public"."app_role", "p_set_logs" "jsonb", "p_scheduled_workout_id" "uuid", "p_training_plan_id" "uuid", "p_program_workout_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_profile_from_auth_user"("auth_user_id" "uuid", "auth_email" "text", "auth_user_meta_data" "jsonb", "auth_created_at" timestamp with time zone DEFAULT "now"()) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  invite_record record;
  normalized_email text;
  resolved_full_name text;
  resolved_created_at timestamptz;
begin
  if auth_email is null or btrim(auth_email) = '' then
    return;
  end if;

  normalized_email := lower(btrim(auth_email));
  resolved_created_at := coalesce(auth_created_at, now());

  select
    invites.id,
    invites.role,
    invites.coach_id,
    invites.status
  into invite_record
  from public.invites
  where lower(invites.email) = normalized_email
  order by invites.created_at desc
  limit 1;

  if invite_record.id is null then
    return;
  end if;

  resolved_full_name := nullif(
    btrim(
      coalesce(
        auth_user_meta_data ->> 'full_name',
        auth_user_meta_data ->> 'name',
        split_part(normalized_email, '@', 1)
      )
    ),
    ''
  );

  insert into public.profiles (
    id,
    role,
    status,
    full_name,
    email,
    default_dashboard_view,
    email_notifications,
    weekly_measurement_reminders,
    theme_mode,
    created_at,
    updated_at
  )
  values (
    auth_user_id,
    invite_record.role,
    'active',
    resolved_full_name,
    normalized_email,
    case when invite_record.role = 'athlete' then 'athlete-log' else 'overview' end,
    false,
    true,
    'light',
    resolved_created_at,
    now()
  )
  on conflict (id) do update
  set
    role = excluded.role,
    status = 'active',
    full_name = excluded.full_name,
    email = excluded.email,
    default_dashboard_view = coalesce(public.profiles.default_dashboard_view, excluded.default_dashboard_view),
    updated_at = now();

  if invite_record.role in ('athlete', 'independent_athlete') and invite_record.coach_id is not null then
    insert into public.coach_athlete_assignments (
      coach_id,
      athlete_id,
      active,
      created_at
    )
    select
      invite_record.coach_id,
      auth_user_id,
      true,
      resolved_created_at
    where not exists (
      select 1
      from public.coach_athlete_assignments assignments
      where assignments.coach_id = invite_record.coach_id
        and assignments.athlete_id = auth_user_id
        and assignments.active = true
    );
  end if;

  update public.invites
  set status = 'accepted'
  where id = invite_record.id
    and status <> 'accepted';
end;
$$;


ALTER FUNCTION "public"."sync_profile_from_auth_user"("auth_user_id" "uuid", "auth_email" "text", "auth_user_meta_data" "jsonb", "auth_created_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_workout_date_atomic"("p_scheduled_workout_id" "uuid", "p_requester_id" "uuid", "p_requester_role" "public"."app_role", "p_expected_session_updated_at" timestamp with time zone, "p_scheduled_date" "text") RETURNS TABLE("ok" boolean, "code" "text", "message" "text", "updated_at" timestamp with time zone, "completed_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
  order by updated_at desc, id desc
  limit 1
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


ALTER FUNCTION "public"."update_workout_date_atomic"("p_scheduled_workout_id" "uuid", "p_requester_id" "uuid", "p_requester_role" "public"."app_role", "p_expected_session_updated_at" timestamp with time zone, "p_scheduled_date" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_workout_duration_atomic"("p_scheduled_workout_id" "uuid", "p_requester_id" "uuid", "p_requester_role" "public"."app_role", "p_expected_session_updated_at" timestamp with time zone, "p_duration_seconds" integer) RETURNS TABLE("ok" boolean, "code" "text", "message" "text", "updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
  order by updated_at desc, id desc
  limit 1
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


ALTER FUNCTION "public"."update_workout_duration_atomic"("p_scheduled_workout_id" "uuid", "p_requester_id" "uuid", "p_requester_role" "public"."app_role", "p_expected_session_updated_at" timestamp with time zone, "p_duration_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_workout_set_log"("p_scheduled_workout_id" "uuid", "p_log_id" "uuid", "p_requester_id" "uuid", "p_requester_role" "public"."app_role", "p_expected_session_updated_at" timestamp with time zone, "p_has_done" boolean DEFAULT false, "p_done" boolean DEFAULT false, "p_has_actual_reps" boolean DEFAULT false, "p_actual_reps" integer DEFAULT NULL::integer, "p_has_actual_load" boolean DEFAULT false, "p_actual_load" numeric DEFAULT NULL::numeric) RETURNS TABLE("ok" boolean, "code" "text", "message" "text", "session_updated_at" timestamp with time zone, "log_id" "uuid", "actual_reps" integer, "actual_load" numeric, "done" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."update_workout_set_log"("p_scheduled_workout_id" "uuid", "p_log_id" "uuid", "p_requester_id" "uuid", "p_requester_role" "public"."app_role", "p_expected_session_updated_at" timestamp with time zone, "p_has_done" boolean, "p_done" boolean, "p_has_actual_reps" boolean, "p_actual_reps" integer, "p_has_actual_load" boolean, "p_actual_load" numeric) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."ai_usage_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "kind" "text" DEFAULT 'food_estimate'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ai_usage_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."assigned_meal_plan_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "assigned_plan_id" "uuid" NOT NULL,
    "meal_tag" "public"."meal_tag" NOT NULL,
    "recipe_id" "uuid" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."assigned_meal_plan_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."assigned_meal_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "template_id" "uuid" NOT NULL,
    "assigned_by" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "assigned_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."assigned_meal_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."body_measurements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "weight_kg" numeric(5,2),
    "waist_cm" numeric(5,2),
    "measured_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "height_cm" numeric(5,2),
    CONSTRAINT "body_measurements_value_check" CHECK ((("height_cm" IS NOT NULL) OR ("weight_kg" IS NOT NULL) OR ("waist_cm" IS NOT NULL)))
);


ALTER TABLE "public"."body_measurements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coach_athlete_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."coach_athlete_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversation_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "author_user_id" "uuid" NOT NULL,
    "author_role" "public"."app_role" NOT NULL,
    "type" "public"."conversation_entry_type" NOT NULL,
    "body" "text" NOT NULL,
    "context_type" "public"."conversation_context_type" DEFAULT 'general'::"public"."conversation_context_type" NOT NULL,
    "context_id" "text",
    "context_label" "text",
    "read_by_user_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."conversation_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."day_meal_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "plan_date" "date" NOT NULL,
    "meal_tag" "public"."meal_tag" NOT NULL,
    "recipe_id" "uuid",
    "source" "text" DEFAULT 'plan'::"text" NOT NULL,
    "servings" numeric(8,2) DEFAULT 1 NOT NULL,
    "eaten_at" timestamp with time zone,
    "position" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ingredient_id" "uuid",
    "grams" numeric(8,2),
    "food_name" "text",
    "kcal_per_100" numeric(8,2),
    "protein_per_100" numeric(8,2),
    "carbs_per_100" numeric(8,2),
    "fat_per_100" numeric(8,2),
    "food_source" "text",
    "ai_status" "text",
    CONSTRAINT "day_meal_plans_ai_status_check" CHECK ((("ai_status" IS NULL) OR ("ai_status" = ANY (ARRAY['pending'::"text", 'failed'::"text"])))),
    CONSTRAINT "day_meal_plans_entry_kind_check" CHECK (((("recipe_id" IS NOT NULL) AND ("food_name" IS NULL)) OR (("recipe_id" IS NULL) AND ("food_name" IS NOT NULL) AND ("grams" IS NOT NULL)))),
    CONSTRAINT "day_meal_plans_food_source_check" CHECK ((("food_source" IS NULL) OR ("food_source" = ANY (ARRAY['manual'::"text", 'ai'::"text", 'fineli'::"text"])))),
    CONSTRAINT "day_meal_plans_servings_check" CHECK (("servings" > (0)::numeric)),
    CONSTRAINT "day_meal_plans_source_check" CHECK (("source" = ANY (ARRAY['plan'::"text", 'swapped'::"text", 'added'::"text"])))
);


ALTER TABLE "public"."day_meal_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."exercises" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "category" "text" NOT NULL,
    "equipment" "text" NOT NULL,
    "cue" "text" NOT NULL,
    "scope" "public"."exercise_scope" DEFAULT 'global'::"public"."exercise_scope" NOT NULL,
    "coach_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "external_key" "text",
    CONSTRAINT "exercises_scope_owner_check" CHECK (((("scope" = 'global'::"public"."exercise_scope") AND ("coach_id" IS NULL)) OR (("scope" = 'coach_custom'::"public"."exercise_scope") AND ("coach_id" IS NOT NULL))))
);


ALTER TABLE "public"."exercises" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."extra_activities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "activity_type" "public"."extra_activity_type" NOT NULL,
    "duration_minutes" integer NOT NULL,
    "estimated_kcal" integer NOT NULL,
    "occurred_at" timestamp with time zone NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "extra_activities_duration_minutes_check" CHECK ((("duration_minutes" > 0) AND ("duration_minutes" <= 1440))),
    CONSTRAINT "extra_activities_estimated_kcal_check" CHECK (("estimated_kcal" >= 0))
);


ALTER TABLE "public"."extra_activities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ingredient_catalog" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "source" "public"."ingredient_source" DEFAULT 'manual'::"public"."ingredient_source" NOT NULL,
    "source_external_id" "text",
    "owner_role" "public"."nutrition_owner_role" DEFAULT 'admin'::"public"."nutrition_owner_role" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "default_purchase_unit" "public"."purchase_unit",
    "grams_per_unit" numeric(8,2),
    "kcal_per_100" numeric(8,2) DEFAULT 0 NOT NULL,
    "protein_per_100" numeric(8,2) DEFAULT 0 NOT NULL,
    "carbs_per_100" numeric(8,2) DEFAULT 0 NOT NULL,
    "fat_per_100" numeric(8,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "display_name" "text",
    "owner_user_id" "uuid"
);


ALTER TABLE "public"."ingredient_catalog" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "token" "text" NOT NULL,
    "email" "text" NOT NULL,
    "role" "public"."app_role" NOT NULL,
    "invited_by" "uuid" NOT NULL,
    "coach_id" "uuid",
    "status" "public"."invite_status" DEFAULT 'pending'::"public"."invite_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    CONSTRAINT "invites_role_check" CHECK (("role" <> 'admin'::"public"."app_role"))
);


ALTER TABLE "public"."invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."meal_plan_template_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "template_id" "uuid" NOT NULL,
    "meal_tag" "public"."meal_tag" NOT NULL,
    "recipe_id" "uuid" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."meal_plan_template_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."meal_plan_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "owner_role" "public"."nutrition_owner_role" DEFAULT 'admin'::"public"."nutrition_owner_role" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."meal_plan_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nutrition_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "goal" "public"."nutrition_goal" DEFAULT 'maintain'::"public"."nutrition_goal" NOT NULL,
    "activity_level" "public"."nutrition_activity_level" DEFAULT 'moderate'::"public"."nutrition_activity_level" NOT NULL,
    "meals_per_day" integer DEFAULT 5 NOT NULL,
    "target_kcal" integer DEFAULT 2000 NOT NULL,
    "protein_g" numeric(6,2) DEFAULT 140 NOT NULL,
    "carbs_g" numeric(6,2) DEFAULT 220 NOT NULL,
    "fat_g" numeric(6,2) DEFAULT 70 NOT NULL,
    "calculation_mode" "text" DEFAULT 'auto'::"text" NOT NULL,
    "coach_notes" "text",
    "dietary_flags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "allergies" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "created_by" "uuid" NOT NULL,
    "updated_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "nutrition_profiles_calculation_mode_check" CHECK (("calculation_mode" = ANY (ARRAY['auto'::"text", 'manual_override'::"text"]))),
    CONSTRAINT "nutrition_profiles_meals_per_day_check" CHECK ((("meals_per_day" >= 3) AND ("meals_per_day" <= 6))),
    CONSTRAINT "nutrition_profiles_target_kcal_check" CHECK (("target_kcal" >= 1200))
);


ALTER TABLE "public"."nutrition_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."password_reset_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "token_hash" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "requested_by_user_id" "uuid",
    "requested_by_role" "text" NOT NULL,
    "consumed_at" timestamp with time zone,
    CONSTRAINT "password_reset_requests_requested_by_role_check" CHECK (("requested_by_role" = ANY (ARRAY['admin'::"text", 'coach'::"text", 'athlete'::"text", 'self_service'::"text"])))
);


ALTER TABLE "public"."password_reset_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "role" "public"."app_role" NOT NULL,
    "status" "public"."user_status" DEFAULT 'invited'::"public"."user_status" NOT NULL,
    "full_name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "default_dashboard_view" "text",
    "email_notifications" boolean DEFAULT false NOT NULL,
    "theme_mode" "public"."theme_mode" DEFAULT 'light'::"public"."theme_mode" NOT NULL,
    "weight_kg" numeric(5,2),
    "waist_cm" numeric(5,2),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "height_cm" numeric(5,2),
    "load_increment_kg" numeric(4,2) DEFAULT 2.5 NOT NULL,
    "weekly_measurement_reminders" boolean DEFAULT true NOT NULL,
    "profile_image_url" "text",
    "age" integer,
    "sex" "text",
    CONSTRAINT "profiles_age_check" CHECK ((("age" IS NULL) OR (("age" >= 13) AND ("age" <= 100)))),
    CONSTRAINT "profiles_sex_check" CHECK ((("sex" IS NULL) OR ("sex" = ANY (ARRAY['female'::"text", 'male'::"text", 'other'::"text"]))))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recipe_ingredients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "recipe_id" "uuid" NOT NULL,
    "ingredient_id" "uuid",
    "ingredient_name" "text" NOT NULL,
    "quantity" numeric(8,2),
    "unit" "public"."ingredient_unit" DEFAULT 'g'::"public"."ingredient_unit" NOT NULL,
    "display_quantity" "text",
    "display_unit" "text",
    "normalized_quantity" numeric(8,2),
    "ingredient_role" "public"."ingredient_role" DEFAULT 'main'::"public"."ingredient_role" NOT NULL,
    "scaling_mode" "public"."ingredient_scaling_mode" DEFAULT 'linear'::"public"."ingredient_scaling_mode" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "group_label" "text",
    "alternatives" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "alternative_options" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL
);


ALTER TABLE "public"."recipe_ingredients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recipes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "instructions" "text" DEFAULT ''::"text" NOT NULL,
    "meal_tag" "public"."meal_tag" NOT NULL,
    "owner_role" "public"."nutrition_owner_role" DEFAULT 'admin'::"public"."nutrition_owner_role" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "default_servings" integer DEFAULT 1 NOT NULL,
    "min_servings" integer DEFAULT 1 NOT NULL,
    "max_servings" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "dietary_flags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "allergies" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    CONSTRAINT "recipes_default_servings_check" CHECK (("default_servings" > 0)),
    CONSTRAINT "recipes_max_servings_check" CHECK (("max_servings" > 0)),
    CONSTRAINT "recipes_min_servings_check" CHECK (("min_servings" > 0)),
    CONSTRAINT "recipes_serving_bounds_check" CHECK ((("min_servings" <= "default_servings") AND ("default_servings" <= "max_servings")))
);


ALTER TABLE "public"."recipes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."scheduled_workouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "training_plan_id" "uuid",
    "program_workout_id" "text",
    "athlete_id" "uuid" NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "scheduled_date" timestamp with time zone NOT NULL,
    "status" "public"."scheduled_workout_status" DEFAULT 'cancelled'::"public"."scheduled_workout_status" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "updated_by" "uuid" NOT NULL,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."scheduled_workouts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."training_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "start_date" "date" NOT NULL,
    "week_count" integer DEFAULT 4 NOT NULL,
    "workouts" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "program_group_id" "uuid",
    CONSTRAINT "training_plans_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'archived'::"text", 'removed'::"text"]))),
    CONSTRAINT "training_plans_week_count_check" CHECK (("week_count" > 0))
);


ALTER TABLE "public"."training_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workout_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."workout_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workout_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "scheduled_workout_id" "uuid" NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "energy_level" integer,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "paused_at" timestamp with time zone,
    "paused_duration_seconds" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."workout_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workout_set_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "scheduled_workout_id" "uuid" NOT NULL,
    "template_exercise_id" "text" NOT NULL,
    "set_id" "text" NOT NULL,
    "exercise_id" "text" NOT NULL,
    "exercise_name" "text" NOT NULL,
    "muscle_group" "text",
    "superset_group" "text",
    "set_label" "text" NOT NULL,
    "target_reps" integer NOT NULL,
    "target_reps_min" integer,
    "target_reps_max" integer,
    "target_load" numeric(6,2),
    "target_rest_seconds" integer,
    "program_workout_id" "text",
    "actual_reps" integer,
    "actual_load" numeric(6,2),
    "rpe" numeric(4,1),
    "done" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."workout_set_logs" OWNER TO "postgres";


ALTER TABLE ONLY "public"."ai_usage_events"
    ADD CONSTRAINT "ai_usage_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assigned_meal_plan_items"
    ADD CONSTRAINT "assigned_meal_plan_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assigned_meal_plans"
    ADD CONSTRAINT "assigned_meal_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."body_measurements"
    ADD CONSTRAINT "body_measurements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coach_athlete_assignments"
    ADD CONSTRAINT "coach_athlete_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversation_entries"
    ADD CONSTRAINT "conversation_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."day_meal_plans"
    ADD CONSTRAINT "day_meal_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exercises"
    ADD CONSTRAINT "exercises_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."extra_activities"
    ADD CONSTRAINT "extra_activities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ingredient_catalog"
    ADD CONSTRAINT "ingredient_catalog_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invites"
    ADD CONSTRAINT "invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invites"
    ADD CONSTRAINT "invites_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."meal_plan_template_items"
    ADD CONSTRAINT "meal_plan_template_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meal_plan_templates"
    ADD CONSTRAINT "meal_plan_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nutrition_profiles"
    ADD CONSTRAINT "nutrition_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nutrition_profiles"
    ADD CONSTRAINT "nutrition_profiles_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."password_reset_requests"
    ADD CONSTRAINT "password_reset_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."password_reset_requests"
    ADD CONSTRAINT "password_reset_requests_token_hash_key" UNIQUE ("token_hash");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recipe_ingredients"
    ADD CONSTRAINT "recipe_ingredients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scheduled_workouts"
    ADD CONSTRAINT "scheduled_workouts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."training_plans"
    ADD CONSTRAINT "training_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workout_notes"
    ADD CONSTRAINT "workout_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workout_notes"
    ADD CONSTRAINT "workout_notes_session_id_key" UNIQUE ("session_id");



ALTER TABLE ONLY "public"."workout_sessions"
    ADD CONSTRAINT "workout_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workout_sessions"
    ADD CONSTRAINT "workout_sessions_scheduled_workout_id_key" UNIQUE ("scheduled_workout_id");



ALTER TABLE ONLY "public"."workout_set_logs"
    ADD CONSTRAINT "workout_set_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workout_set_logs"
    ADD CONSTRAINT "workout_set_logs_session_id_template_exercise_id_set_id_key" UNIQUE ("session_id", "template_exercise_id", "set_id");



CREATE INDEX "ai_usage_events_user_created_idx" ON "public"."ai_usage_events" USING "btree" ("user_id", "created_at");



CREATE INDEX "assigned_meal_plan_items_plan_idx" ON "public"."assigned_meal_plan_items" USING "btree" ("assigned_plan_id", "sort_order");



CREATE INDEX "assigned_meal_plan_items_recipe_idx" ON "public"."assigned_meal_plan_items" USING "btree" ("recipe_id");



CREATE INDEX "assigned_meal_plans_assigned_by_idx" ON "public"."assigned_meal_plans" USING "btree" ("assigned_by");



CREATE INDEX "assigned_meal_plans_athlete_idx" ON "public"."assigned_meal_plans" USING "btree" ("athlete_id", "assigned_at" DESC);



CREATE INDEX "assigned_meal_plans_template_idx" ON "public"."assigned_meal_plans" USING "btree" ("template_id");



CREATE INDEX "body_measurements_user_idx" ON "public"."body_measurements" USING "btree" ("user_id", "measured_at" DESC);



CREATE UNIQUE INDEX "coach_athlete_active_pair_unique" ON "public"."coach_athlete_assignments" USING "btree" ("coach_id", "athlete_id") WHERE ("active" = true);



CREATE INDEX "coach_athlete_assignments_athlete_idx" ON "public"."coach_athlete_assignments" USING "btree" ("athlete_id");



CREATE INDEX "coach_athlete_assignments_coach_idx" ON "public"."coach_athlete_assignments" USING "btree" ("coach_id");



CREATE INDEX "conversation_entries_athlete_idx" ON "public"."conversation_entries" USING "btree" ("athlete_id", "created_at" DESC);



CREATE INDEX "conversation_entries_author_idx" ON "public"."conversation_entries" USING "btree" ("author_user_id");



CREATE INDEX "conversation_entries_coach_idx" ON "public"."conversation_entries" USING "btree" ("coach_id", "created_at" DESC);



CREATE INDEX "day_meal_plans_athlete_date_idx" ON "public"."day_meal_plans" USING "btree" ("athlete_id", "plan_date");



CREATE INDEX "day_meal_plans_ingredient_idx" ON "public"."day_meal_plans" USING "btree" ("ingredient_id");



CREATE INDEX "day_meal_plans_recipe_idx" ON "public"."day_meal_plans" USING "btree" ("recipe_id");



CREATE INDEX "exercises_coach_idx" ON "public"."exercises" USING "btree" ("coach_id");



CREATE UNIQUE INDEX "exercises_external_key_unique" ON "public"."exercises" USING "btree" ("external_key") WHERE ("external_key" IS NOT NULL);



CREATE INDEX "exercises_scope_idx" ON "public"."exercises" USING "btree" ("scope");



CREATE INDEX "extra_activities_athlete_occurred_idx" ON "public"."extra_activities" USING "btree" ("athlete_id", "occurred_at" DESC);



CREATE INDEX "ingredient_catalog_created_by_idx" ON "public"."ingredient_catalog" USING "btree" ("created_by");



CREATE INDEX "ingredient_catalog_display_name_trgm_idx" ON "public"."ingredient_catalog" USING "gin" ("display_name" "public"."gin_trgm_ops");



CREATE INDEX "ingredient_catalog_name_idx" ON "public"."ingredient_catalog" USING "btree" ("name");



CREATE INDEX "ingredient_catalog_name_trgm_idx" ON "public"."ingredient_catalog" USING "gin" ("name" "public"."gin_trgm_ops");



CREATE INDEX "ingredient_catalog_owner_idx" ON "public"."ingredient_catalog" USING "btree" ("owner_user_id");



CREATE UNIQUE INDEX "ingredient_catalog_source_external_unique" ON "public"."ingredient_catalog" USING "btree" ("source", "source_external_id") WHERE ("source_external_id" IS NOT NULL);



CREATE INDEX "invites_coach_idx" ON "public"."invites" USING "btree" ("coach_id");



CREATE INDEX "invites_invited_by_idx" ON "public"."invites" USING "btree" ("invited_by", "created_at" DESC);



CREATE INDEX "meal_plan_template_items_recipe_idx" ON "public"."meal_plan_template_items" USING "btree" ("recipe_id");



CREATE INDEX "meal_plan_template_items_template_idx" ON "public"."meal_plan_template_items" USING "btree" ("template_id", "sort_order");



CREATE INDEX "meal_plan_templates_created_by_idx" ON "public"."meal_plan_templates" USING "btree" ("created_by");



CREATE INDEX "nutrition_profiles_created_by_idx" ON "public"."nutrition_profiles" USING "btree" ("created_by");



CREATE INDEX "nutrition_profiles_updated_by_idx" ON "public"."nutrition_profiles" USING "btree" ("updated_by");



CREATE INDEX "password_reset_requests_requested_by_idx" ON "public"."password_reset_requests" USING "btree" ("requested_by_user_id");



CREATE INDEX "password_reset_requests_user_idx" ON "public"."password_reset_requests" USING "btree" ("user_id", "created_at" DESC);



CREATE UNIQUE INDEX "profiles_email_lower_unique" ON "public"."profiles" USING "btree" ("lower"("email"));



CREATE INDEX "recipe_ingredients_ingredient_idx" ON "public"."recipe_ingredients" USING "btree" ("ingredient_id");



CREATE INDEX "recipe_ingredients_recipe_idx" ON "public"."recipe_ingredients" USING "btree" ("recipe_id", "sort_order");



CREATE INDEX "recipes_created_by_idx" ON "public"."recipes" USING "btree" ("created_by");



CREATE INDEX "scheduled_workouts_athlete_idx" ON "public"."scheduled_workouts" USING "btree" ("athlete_id", "scheduled_date" DESC);



CREATE INDEX "scheduled_workouts_athlete_program_status_idx" ON "public"."scheduled_workouts" USING "btree" ("athlete_id", "program_workout_id", "status");



CREATE INDEX "scheduled_workouts_athlete_status_program_idx" ON "public"."scheduled_workouts" USING "btree" ("athlete_id", "status", "program_workout_id");



CREATE INDEX "scheduled_workouts_coach_idx" ON "public"."scheduled_workouts" USING "btree" ("coach_id", "scheduled_date" DESC);



CREATE INDEX "scheduled_workouts_created_by_idx" ON "public"."scheduled_workouts" USING "btree" ("created_by");



CREATE INDEX "scheduled_workouts_plan_idx" ON "public"."scheduled_workouts" USING "btree" ("training_plan_id");



CREATE INDEX "scheduled_workouts_updated_by_idx" ON "public"."scheduled_workouts" USING "btree" ("updated_by");



CREATE INDEX "training_plans_athlete_idx" ON "public"."training_plans" USING "btree" ("athlete_id");



CREATE INDEX "training_plans_coach_idx" ON "public"."training_plans" USING "btree" ("coach_id");



CREATE INDEX "training_plans_program_group_idx" ON "public"."training_plans" USING "btree" ("program_group_id");



CREATE INDEX "workout_notes_athlete_idx" ON "public"."workout_notes" USING "btree" ("athlete_id");



CREATE INDEX "workout_notes_coach_idx" ON "public"."workout_notes" USING "btree" ("coach_id");



CREATE INDEX "workout_sessions_athlete_idx" ON "public"."workout_sessions" USING "btree" ("athlete_id", "started_at" DESC);



CREATE INDEX "workout_set_logs_scheduled_idx" ON "public"."workout_set_logs" USING "btree" ("scheduled_workout_id");



CREATE INDEX "workout_set_logs_session_exercise_label_done_idx" ON "public"."workout_set_logs" USING "btree" ("session_id", "exercise_id", "set_label", "done");



CREATE INDEX "workout_set_logs_session_idx" ON "public"."workout_set_logs" USING "btree" ("session_id");



ALTER TABLE ONLY "public"."ai_usage_events"
    ADD CONSTRAINT "ai_usage_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assigned_meal_plan_items"
    ADD CONSTRAINT "assigned_meal_plan_items_assigned_plan_id_fkey" FOREIGN KEY ("assigned_plan_id") REFERENCES "public"."assigned_meal_plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assigned_meal_plan_items"
    ADD CONSTRAINT "assigned_meal_plan_items_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."assigned_meal_plans"
    ADD CONSTRAINT "assigned_meal_plans_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."assigned_meal_plans"
    ADD CONSTRAINT "assigned_meal_plans_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assigned_meal_plans"
    ADD CONSTRAINT "assigned_meal_plans_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."meal_plan_templates"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."body_measurements"
    ADD CONSTRAINT "body_measurements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_athlete_assignments"
    ADD CONSTRAINT "coach_athlete_assignments_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_athlete_assignments"
    ADD CONSTRAINT "coach_athlete_assignments_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_entries"
    ADD CONSTRAINT "conversation_entries_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_entries"
    ADD CONSTRAINT "conversation_entries_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_entries"
    ADD CONSTRAINT "conversation_entries_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."day_meal_plans"
    ADD CONSTRAINT "day_meal_plans_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."day_meal_plans"
    ADD CONSTRAINT "day_meal_plans_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredient_catalog"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."day_meal_plans"
    ADD CONSTRAINT "day_meal_plans_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercises"
    ADD CONSTRAINT "exercises_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."extra_activities"
    ADD CONSTRAINT "extra_activities_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ingredient_catalog"
    ADD CONSTRAINT "ingredient_catalog_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."ingredient_catalog"
    ADD CONSTRAINT "ingredient_catalog_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invites"
    ADD CONSTRAINT "invites_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invites"
    ADD CONSTRAINT "invites_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meal_plan_template_items"
    ADD CONSTRAINT "meal_plan_template_items_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."meal_plan_template_items"
    ADD CONSTRAINT "meal_plan_template_items_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."meal_plan_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meal_plan_templates"
    ADD CONSTRAINT "meal_plan_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."nutrition_profiles"
    ADD CONSTRAINT "nutrition_profiles_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."nutrition_profiles"
    ADD CONSTRAINT "nutrition_profiles_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."nutrition_profiles"
    ADD CONSTRAINT "nutrition_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."password_reset_requests"
    ADD CONSTRAINT "password_reset_requests_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."password_reset_requests"
    ADD CONSTRAINT "password_reset_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recipe_ingredients"
    ADD CONSTRAINT "recipe_ingredients_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredient_catalog"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."recipe_ingredients"
    ADD CONSTRAINT "recipe_ingredients_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."scheduled_workouts"
    ADD CONSTRAINT "scheduled_workouts_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."scheduled_workouts"
    ADD CONSTRAINT "scheduled_workouts_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."scheduled_workouts"
    ADD CONSTRAINT "scheduled_workouts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."scheduled_workouts"
    ADD CONSTRAINT "scheduled_workouts_training_plan_id_fkey" FOREIGN KEY ("training_plan_id") REFERENCES "public"."training_plans"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."scheduled_workouts"
    ADD CONSTRAINT "scheduled_workouts_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."training_plans"
    ADD CONSTRAINT "training_plans_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."training_plans"
    ADD CONSTRAINT "training_plans_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workout_notes"
    ADD CONSTRAINT "workout_notes_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workout_notes"
    ADD CONSTRAINT "workout_notes_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workout_notes"
    ADD CONSTRAINT "workout_notes_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."workout_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workout_sessions"
    ADD CONSTRAINT "workout_sessions_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workout_sessions"
    ADD CONSTRAINT "workout_sessions_scheduled_workout_id_fkey" FOREIGN KEY ("scheduled_workout_id") REFERENCES "public"."scheduled_workouts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workout_set_logs"
    ADD CONSTRAINT "workout_set_logs_scheduled_workout_id_fkey" FOREIGN KEY ("scheduled_workout_id") REFERENCES "public"."scheduled_workouts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workout_set_logs"
    ADD CONSTRAINT "workout_set_logs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."workout_sessions"("id") ON DELETE CASCADE;



ALTER TABLE "public"."ai_usage_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "assigned meal plan items delete by coach or admin" ON "public"."assigned_meal_plan_items" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."assigned_meal_plans" "plan"
  WHERE (("plan"."id" = "assigned_meal_plan_items"."assigned_plan_id") AND ("public"."is_admin"() OR (("plan"."assigned_by" = ( SELECT "auth"."uid"() AS "uid")) AND (("plan"."athlete_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_coach_of"("plan"."athlete_id"))))))));



CREATE POLICY "assigned meal plan items insert by coach or admin" ON "public"."assigned_meal_plan_items" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."assigned_meal_plans" "plan"
  WHERE (("plan"."id" = "assigned_meal_plan_items"."assigned_plan_id") AND ("public"."is_admin"() OR (("plan"."assigned_by" = ( SELECT "auth"."uid"() AS "uid")) AND (("plan"."athlete_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_coach_of"("plan"."athlete_id"))))))));



CREATE POLICY "assigned meal plan items read via assigned plan" ON "public"."assigned_meal_plan_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."assigned_meal_plans" "plan"
  WHERE (("plan"."id" = "assigned_meal_plan_items"."assigned_plan_id") AND ("public"."is_admin"() OR (( SELECT "auth"."uid"() AS "uid") = "plan"."athlete_id") OR "public"."is_coach_of"("plan"."athlete_id"))))));



CREATE POLICY "assigned meal plan items update by coach or admin" ON "public"."assigned_meal_plan_items" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."assigned_meal_plans" "plan"
  WHERE (("plan"."id" = "assigned_meal_plan_items"."assigned_plan_id") AND ("public"."is_admin"() OR (("plan"."assigned_by" = ( SELECT "auth"."uid"() AS "uid")) AND (("plan"."athlete_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_coach_of"("plan"."athlete_id")))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."assigned_meal_plans" "plan"
  WHERE (("plan"."id" = "assigned_meal_plan_items"."assigned_plan_id") AND ("public"."is_admin"() OR (("plan"."assigned_by" = ( SELECT "auth"."uid"() AS "uid")) AND (("plan"."athlete_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_coach_of"("plan"."athlete_id"))))))));



CREATE POLICY "assigned meal plans delete by coach or admin" ON "public"."assigned_meal_plans" FOR DELETE TO "authenticated" USING (("public"."is_admin"() OR (("assigned_by" = ( SELECT "auth"."uid"() AS "uid")) AND (("athlete_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_coach_of"("athlete_id")))));



CREATE POLICY "assigned meal plans insert by coach or admin" ON "public"."assigned_meal_plans" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_admin"() OR (("assigned_by" = ( SELECT "auth"."uid"() AS "uid")) AND (("athlete_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_coach_of"("athlete_id")))));



CREATE POLICY "assigned meal plans read by participant or admin" ON "public"."assigned_meal_plans" FOR SELECT USING (("public"."is_admin"() OR (( SELECT "auth"."uid"() AS "uid") = "athlete_id") OR "public"."is_coach_of"("athlete_id")));



CREATE POLICY "assigned meal plans update by coach or admin" ON "public"."assigned_meal_plans" FOR UPDATE TO "authenticated" USING (("public"."is_admin"() OR (("assigned_by" = ( SELECT "auth"."uid"() AS "uid")) AND (("athlete_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_coach_of"("athlete_id"))))) WITH CHECK (("public"."is_admin"() OR (("assigned_by" = ( SELECT "auth"."uid"() AS "uid")) AND (("athlete_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_coach_of"("athlete_id")))));



ALTER TABLE "public"."assigned_meal_plan_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."assigned_meal_plans" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "assignments delete by owning coach or admin" ON "public"."coach_athlete_assignments" FOR DELETE USING (("public"."is_admin"() OR ("coach_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "assignments insert by owning coach or admin" ON "public"."coach_athlete_assignments" FOR INSERT WITH CHECK (("public"."is_admin"() OR ("coach_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "assignments read by participant or admin" ON "public"."coach_athlete_assignments" FOR SELECT USING (("public"."is_admin"() OR ("coach_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("athlete_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "assignments update by owning coach or admin" ON "public"."coach_athlete_assignments" FOR UPDATE USING (("public"."is_admin"() OR ("coach_id" = ( SELECT "auth"."uid"() AS "uid")))) WITH CHECK (("public"."is_admin"() OR ("coach_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "body measurements delete by self or admin" ON "public"."body_measurements" FOR DELETE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") OR "public"."is_admin"()));



CREATE POLICY "body measurements insert by self or admin" ON "public"."body_measurements" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") OR "public"."is_admin"()));



CREATE POLICY "body measurements read by self coach or admin" ON "public"."body_measurements" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") OR "public"."is_admin"() OR "public"."is_coach_of"("user_id")));



CREATE POLICY "body measurements update by self or admin" ON "public"."body_measurements" FOR UPDATE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") OR "public"."is_admin"())) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") OR "public"."is_admin"()));



ALTER TABLE "public"."body_measurements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."coach_athlete_assignments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversation entries delete by author or admin" ON "public"."conversation_entries" FOR DELETE USING (("public"."is_admin"() OR ("author_user_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "conversation entries insert by author participant or admin" ON "public"."conversation_entries" FOR INSERT WITH CHECK (("public"."is_admin"() OR (("author_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("author_role" = "public"."current_role"()) AND ((("athlete_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_athlete_of"("coach_id")) OR (("coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_coach_of"("athlete_id"))))));



CREATE POLICY "conversation entries read by participant or admin" ON "public"."conversation_entries" FOR SELECT USING (("public"."is_admin"() OR ("athlete_id" = ( SELECT "auth"."uid"() AS "uid")) OR (("coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_coach_of"("athlete_id"))));



CREATE POLICY "conversation entries update by participant or admin" ON "public"."conversation_entries" FOR UPDATE USING (("public"."is_admin"() OR ("athlete_id" = ( SELECT "auth"."uid"() AS "uid")) OR (("coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_coach_of"("athlete_id")))) WITH CHECK (("public"."is_admin"() OR ("athlete_id" = ( SELECT "auth"."uid"() AS "uid")) OR (("coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_coach_of"("athlete_id"))));



ALTER TABLE "public"."conversation_entries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "day meal plans delete by athlete or admin" ON "public"."day_meal_plans" FOR DELETE USING (("public"."is_admin"() OR (( SELECT "auth"."uid"() AS "uid") = "athlete_id")));



CREATE POLICY "day meal plans insert by athlete or admin" ON "public"."day_meal_plans" FOR INSERT WITH CHECK (("public"."is_admin"() OR (( SELECT "auth"."uid"() AS "uid") = "athlete_id")));



CREATE POLICY "day meal plans read by participant, coach or admin" ON "public"."day_meal_plans" FOR SELECT USING (("public"."is_admin"() OR (( SELECT "auth"."uid"() AS "uid") = "athlete_id") OR "public"."is_coach_of"("athlete_id")));



CREATE POLICY "day meal plans update by athlete or admin" ON "public"."day_meal_plans" FOR UPDATE USING (("public"."is_admin"() OR (( SELECT "auth"."uid"() AS "uid") = "athlete_id"))) WITH CHECK (("public"."is_admin"() OR (( SELECT "auth"."uid"() AS "uid") = "athlete_id")));



ALTER TABLE "public"."day_meal_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."exercises" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "exercises delete by admin or owning coach" ON "public"."exercises" FOR DELETE USING (("public"."is_admin"() OR ("coach_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "exercises insert by admin or owning coach" ON "public"."exercises" FOR INSERT WITH CHECK (("public"."is_admin"() OR (("public"."current_role"() = 'coach'::"public"."app_role") AND ("scope" = 'coach_custom'::"public"."exercise_scope") AND ("coach_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "exercises read by authenticated users" ON "public"."exercises" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") IS NOT NULL));



CREATE POLICY "exercises update by admin or owning coach" ON "public"."exercises" FOR UPDATE USING (("public"."is_admin"() OR ("coach_id" = ( SELECT "auth"."uid"() AS "uid")))) WITH CHECK (("public"."is_admin"() OR (("scope" = 'coach_custom'::"public"."exercise_scope") AND ("coach_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "extra activities delete by athlete or admin" ON "public"."extra_activities" FOR DELETE USING (("public"."is_admin"() OR (( SELECT "auth"."uid"() AS "uid") = "athlete_id")));



CREATE POLICY "extra activities insert by athlete or admin" ON "public"."extra_activities" FOR INSERT WITH CHECK (("public"."is_admin"() OR (( SELECT "auth"."uid"() AS "uid") = "athlete_id")));



CREATE POLICY "extra activities read by participant or admin" ON "public"."extra_activities" FOR SELECT USING (("public"."is_admin"() OR (( SELECT "auth"."uid"() AS "uid") = "athlete_id") OR "public"."is_coach_of"("athlete_id")));



CREATE POLICY "extra activities update by athlete or admin" ON "public"."extra_activities" FOR UPDATE USING (("public"."is_admin"() OR (( SELECT "auth"."uid"() AS "uid") = "athlete_id"))) WITH CHECK (("public"."is_admin"() OR (( SELECT "auth"."uid"() AS "uid") = "athlete_id")));



ALTER TABLE "public"."extra_activities" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ingredient catalog delete own or admin" ON "public"."ingredient_catalog" FOR DELETE TO "authenticated" USING (("public"."is_admin"() OR ("owner_user_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "ingredient catalog insert own or admin" ON "public"."ingredient_catalog" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_admin"() OR (("owner_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("created_by" = ( SELECT "auth"."uid"() AS "uid")) AND ("source" = ANY (ARRAY['manual'::"public"."ingredient_source", 'ai'::"public"."ingredient_source"])))));



CREATE POLICY "ingredient catalog read by visibility" ON "public"."ingredient_catalog" FOR SELECT USING (("public"."is_admin"() OR ("owner_user_id" IS NULL) OR ("owner_user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_coach_of"("owner_user_id")));



CREATE POLICY "ingredient catalog update own or admin" ON "public"."ingredient_catalog" FOR UPDATE TO "authenticated" USING (("public"."is_admin"() OR ("owner_user_id" = ( SELECT "auth"."uid"() AS "uid")))) WITH CHECK (("public"."is_admin"() OR (("owner_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("source" = ANY (ARRAY['manual'::"public"."ingredient_source", 'ai'::"public"."ingredient_source"])))));



ALTER TABLE "public"."ingredient_catalog" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invites" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invites delete by inviter or admin" ON "public"."invites" FOR DELETE USING (("public"."is_admin"() OR ("invited_by" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "invites insert by inviter or admin" ON "public"."invites" FOR INSERT WITH CHECK (("public"."is_admin"() OR ("invited_by" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "invites read by inviter or admin" ON "public"."invites" FOR SELECT USING (("public"."is_admin"() OR ("invited_by" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "invites update by inviter or admin" ON "public"."invites" FOR UPDATE USING (("public"."is_admin"() OR ("invited_by" = ( SELECT "auth"."uid"() AS "uid")))) WITH CHECK (("public"."is_admin"() OR ("invited_by" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "meal plan template items delete by coach or admin" ON "public"."meal_plan_template_items" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."meal_plan_templates" "template"
  WHERE (("template"."id" = "meal_plan_template_items"."template_id") AND ("public"."is_admin"() OR ("template"."created_by" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "meal plan template items insert by coach or admin" ON "public"."meal_plan_template_items" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."meal_plan_templates" "template"
  WHERE (("template"."id" = "meal_plan_template_items"."template_id") AND ("public"."is_admin"() OR ("template"."created_by" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "meal plan template items read by authenticated users" ON "public"."meal_plan_template_items" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") IS NOT NULL));



CREATE POLICY "meal plan template items update by coach or admin" ON "public"."meal_plan_template_items" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."meal_plan_templates" "template"
  WHERE (("template"."id" = "meal_plan_template_items"."template_id") AND ("public"."is_admin"() OR ("template"."created_by" = ( SELECT "auth"."uid"() AS "uid"))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."meal_plan_templates" "template"
  WHERE (("template"."id" = "meal_plan_template_items"."template_id") AND ("public"."is_admin"() OR ("template"."created_by" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "meal plan templates delete by coach or admin" ON "public"."meal_plan_templates" FOR DELETE TO "authenticated" USING (("public"."is_admin"() OR (( SELECT "auth"."uid"() AS "uid") = "created_by")));



CREATE POLICY "meal plan templates insert by coach or admin" ON "public"."meal_plan_templates" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_admin"() OR (( SELECT "auth"."uid"() AS "uid") = "created_by")));



CREATE POLICY "meal plan templates read by authenticated users" ON "public"."meal_plan_templates" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") IS NOT NULL));



CREATE POLICY "meal plan templates update by coach or admin" ON "public"."meal_plan_templates" FOR UPDATE TO "authenticated" USING (("public"."is_admin"() OR (( SELECT "auth"."uid"() AS "uid") = "created_by"))) WITH CHECK (("public"."is_admin"() OR (( SELECT "auth"."uid"() AS "uid") = "created_by")));



ALTER TABLE "public"."meal_plan_template_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meal_plan_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notes delete by participant or admin" ON "public"."workout_notes" FOR DELETE USING (("public"."is_admin"() OR (("athlete_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_athlete_of"("coach_id")) OR (("coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_coach_of"("athlete_id"))));



CREATE POLICY "notes insert by participant or admin" ON "public"."workout_notes" FOR INSERT WITH CHECK (("public"."is_admin"() OR (("athlete_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_athlete_of"("coach_id")) OR (("coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_coach_of"("athlete_id"))));



CREATE POLICY "notes read by participant or admin" ON "public"."workout_notes" FOR SELECT USING (("public"."is_admin"() OR (("athlete_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_athlete_of"("coach_id")) OR (("coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_coach_of"("athlete_id"))));



CREATE POLICY "notes update by participant or admin" ON "public"."workout_notes" FOR UPDATE USING (("public"."is_admin"() OR (("athlete_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_athlete_of"("coach_id")) OR (("coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_coach_of"("athlete_id")))) WITH CHECK (("public"."is_admin"() OR (("athlete_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_athlete_of"("coach_id")) OR (("coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_coach_of"("athlete_id"))));



CREATE POLICY "nutrition profiles delete by admin" ON "public"."nutrition_profiles" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "nutrition profiles insert by coach or admin" ON "public"."nutrition_profiles" FOR INSERT WITH CHECK (("public"."is_admin"() OR (( SELECT "auth"."uid"() AS "uid") = "user_id") OR "public"."is_coach_of"("user_id")));



CREATE POLICY "nutrition profiles read by participant or admin" ON "public"."nutrition_profiles" FOR SELECT USING (("public"."is_admin"() OR (( SELECT "auth"."uid"() AS "uid") = "user_id") OR "public"."is_coach_of"("user_id")));



CREATE POLICY "nutrition profiles update by coach or admin" ON "public"."nutrition_profiles" FOR UPDATE USING (("public"."is_admin"() OR (( SELECT "auth"."uid"() AS "uid") = "user_id") OR "public"."is_coach_of"("user_id"))) WITH CHECK (("public"."is_admin"() OR (( SELECT "auth"."uid"() AS "uid") = "user_id") OR "public"."is_coach_of"("user_id")));



ALTER TABLE "public"."nutrition_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "password reset requests delete by admin" ON "public"."password_reset_requests" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "password reset requests insert by owner or admin" ON "public"."password_reset_requests" FOR INSERT WITH CHECK (("public"."is_admin"() OR ("user_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "password reset requests read by owner or admin" ON "public"."password_reset_requests" FOR SELECT USING (("public"."is_admin"() OR ("user_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "password reset requests update by owner or admin" ON "public"."password_reset_requests" FOR UPDATE USING (("public"."is_admin"() OR ("user_id" = ( SELECT "auth"."uid"() AS "uid")))) WITH CHECK (("public"."is_admin"() OR ("user_id" = ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."password_reset_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles delete by admin" ON "public"."profiles" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "profiles insert by admin" ON "public"."profiles" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "profiles read by self admin linked users" ON "public"."profiles" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "id") OR "public"."is_admin"() OR (("role" = 'athlete'::"public"."app_role") AND "public"."is_coach_of"("id")) OR (("role" = ANY (ARRAY['coach'::"public"."app_role", 'admin'::"public"."app_role"])) AND "public"."is_athlete_of"("id"))));



CREATE POLICY "profiles update by self or admin" ON "public"."profiles" FOR UPDATE USING (((( SELECT "auth"."uid"() AS "uid") = "id") OR "public"."is_admin"())) WITH CHECK (("public"."is_admin"() OR ((( SELECT "auth"."uid"() AS "uid") = "id") AND ("role" = "public"."current_role"()) AND ("status" = "public"."current_status"()) AND ("email" = "public"."current_email"()))));



CREATE POLICY "recipe ingredients delete by owner or admin" ON "public"."recipe_ingredients" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."recipes" "recipe"
  WHERE (("recipe"."id" = "recipe_ingredients"."recipe_id") AND ("public"."is_admin"() OR ("recipe"."created_by" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "recipe ingredients insert by owner or admin" ON "public"."recipe_ingredients" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."recipes" "recipe"
  WHERE (("recipe"."id" = "recipe_ingredients"."recipe_id") AND ("public"."is_admin"() OR ("recipe"."created_by" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "recipe ingredients read with visible recipe" ON "public"."recipe_ingredients" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."recipes" "recipe"
  WHERE ("recipe"."id" = "recipe_ingredients"."recipe_id")))));



CREATE POLICY "recipe ingredients update by owner or admin" ON "public"."recipe_ingredients" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."recipes" "recipe"
  WHERE (("recipe"."id" = "recipe_ingredients"."recipe_id") AND ("public"."is_admin"() OR ("recipe"."created_by" = ( SELECT "auth"."uid"() AS "uid"))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."recipes" "recipe"
  WHERE (("recipe"."id" = "recipe_ingredients"."recipe_id") AND ("public"."is_admin"() OR ("recipe"."created_by" = ( SELECT "auth"."uid"() AS "uid")))))));



ALTER TABLE "public"."recipe_ingredients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recipes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "recipes delete by coach or admin" ON "public"."recipes" FOR DELETE TO "authenticated" USING (("public"."is_admin"() OR (( SELECT "auth"."uid"() AS "uid") = "created_by")));



CREATE POLICY "recipes insert by coach or admin" ON "public"."recipes" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_admin"() OR (( SELECT "auth"."uid"() AS "uid") = "created_by")));



CREATE POLICY "recipes read by owner audience assignment or admin" ON "public"."recipes" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") IS NOT NULL) AND ("public"."is_admin"() OR ("owner_role" = 'admin'::"public"."nutrition_owner_role") OR ("created_by" = ( SELECT "auth"."uid"() AS "uid")) OR (("owner_role" = 'coach'::"public"."nutrition_owner_role") AND (EXISTS ( SELECT 1
   FROM "public"."coach_athlete_assignments" "assignment"
  WHERE (("assignment"."coach_id" = "recipes"."created_by") AND ("assignment"."athlete_id" = ( SELECT "auth"."uid"() AS "uid")) AND "assignment"."active")))) OR (EXISTS ( SELECT 1
   FROM "public"."day_meal_plans" "day_meal"
  WHERE (("day_meal"."recipe_id" = "recipes"."id") AND (("day_meal"."athlete_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_coach_of"("day_meal"."athlete_id"))))) OR (EXISTS ( SELECT 1
   FROM ("public"."assigned_meal_plan_items" "item"
     JOIN "public"."assigned_meal_plans" "plan" ON (("plan"."id" = "item"."assigned_plan_id")))
  WHERE (("item"."recipe_id" = "recipes"."id") AND "plan"."active" AND (("plan"."athlete_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_coach_of"("plan"."athlete_id"))))))));



CREATE POLICY "recipes update by coach or admin" ON "public"."recipes" FOR UPDATE TO "authenticated" USING (("public"."is_admin"() OR (( SELECT "auth"."uid"() AS "uid") = "created_by"))) WITH CHECK (("public"."is_admin"() OR (( SELECT "auth"."uid"() AS "uid") = "created_by")));



CREATE POLICY "scheduled workouts delete by coach or admin" ON "public"."scheduled_workouts" FOR DELETE USING (("public"."is_admin"() OR (("coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_coach_of"("athlete_id"))));



CREATE POLICY "scheduled workouts insert by coach or admin" ON "public"."scheduled_workouts" FOR INSERT WITH CHECK (("public"."is_admin"() OR (("coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_coach_of"("athlete_id"))));



CREATE POLICY "scheduled workouts read by participant or admin" ON "public"."scheduled_workouts" FOR SELECT USING (("public"."is_admin"() OR ("coach_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("athlete_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "scheduled workouts update by coach or admin" ON "public"."scheduled_workouts" FOR UPDATE USING (("public"."is_admin"() OR (("coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_coach_of"("athlete_id")))) WITH CHECK (("public"."is_admin"() OR (("coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_coach_of"("athlete_id"))));



ALTER TABLE "public"."scheduled_workouts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sessions delete by participant or admin" ON "public"."workout_sessions" FOR DELETE USING (("public"."is_admin"() OR ("athlete_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."scheduled_workouts" "workout"
  WHERE (("workout"."id" = "workout_sessions"."scheduled_workout_id") AND ("workout"."coach_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "sessions insert by participant or admin" ON "public"."workout_sessions" FOR INSERT WITH CHECK (("public"."is_admin"() OR ("athlete_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."scheduled_workouts" "workout"
  WHERE (("workout"."id" = "workout_sessions"."scheduled_workout_id") AND ("workout"."coach_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "sessions read by participant or admin" ON "public"."workout_sessions" FOR SELECT USING (("public"."is_admin"() OR ("athlete_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."scheduled_workouts" "workout"
  WHERE (("workout"."id" = "workout_sessions"."scheduled_workout_id") AND ("workout"."coach_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "sessions update by participant or admin" ON "public"."workout_sessions" FOR UPDATE USING (("public"."is_admin"() OR ("athlete_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."scheduled_workouts" "workout"
  WHERE (("workout"."id" = "workout_sessions"."scheduled_workout_id") AND ("workout"."coach_id" = ( SELECT "auth"."uid"() AS "uid"))))))) WITH CHECK (("public"."is_admin"() OR ("athlete_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."scheduled_workouts" "workout"
  WHERE (("workout"."id" = "workout_sessions"."scheduled_workout_id") AND ("workout"."coach_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "set logs delete by participant or admin" ON "public"."workout_set_logs" FOR DELETE USING (("public"."is_admin"() OR (EXISTS ( SELECT 1
   FROM ("public"."workout_sessions" "session"
     JOIN "public"."scheduled_workouts" "workout" ON (("workout"."id" = "session"."scheduled_workout_id")))
  WHERE (("session"."id" = "workout_set_logs"."session_id") AND (("session"."athlete_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("workout"."coach_id" = ( SELECT "auth"."uid"() AS "uid"))))))));



CREATE POLICY "set logs insert by participant or admin" ON "public"."workout_set_logs" FOR INSERT WITH CHECK (("public"."is_admin"() OR (EXISTS ( SELECT 1
   FROM ("public"."workout_sessions" "session"
     JOIN "public"."scheduled_workouts" "workout" ON (("workout"."id" = "session"."scheduled_workout_id")))
  WHERE (("session"."id" = "workout_set_logs"."session_id") AND (("session"."athlete_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("workout"."coach_id" = ( SELECT "auth"."uid"() AS "uid"))))))));



CREATE POLICY "set logs read by participant or admin" ON "public"."workout_set_logs" FOR SELECT USING (("public"."is_admin"() OR (EXISTS ( SELECT 1
   FROM ("public"."workout_sessions" "session"
     JOIN "public"."scheduled_workouts" "workout" ON (("workout"."id" = "session"."scheduled_workout_id")))
  WHERE (("session"."id" = "workout_set_logs"."session_id") AND (("session"."athlete_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("workout"."coach_id" = ( SELECT "auth"."uid"() AS "uid"))))))));



CREATE POLICY "set logs update by participant or admin" ON "public"."workout_set_logs" FOR UPDATE USING (("public"."is_admin"() OR (EXISTS ( SELECT 1
   FROM ("public"."workout_sessions" "session"
     JOIN "public"."scheduled_workouts" "workout" ON (("workout"."id" = "session"."scheduled_workout_id")))
  WHERE (("session"."id" = "workout_set_logs"."session_id") AND (("session"."athlete_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("workout"."coach_id" = ( SELECT "auth"."uid"() AS "uid")))))))) WITH CHECK (("public"."is_admin"() OR (EXISTS ( SELECT 1
   FROM ("public"."workout_sessions" "session"
     JOIN "public"."scheduled_workouts" "workout" ON (("workout"."id" = "session"."scheduled_workout_id")))
  WHERE (("session"."id" = "workout_set_logs"."session_id") AND (("session"."athlete_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("workout"."coach_id" = ( SELECT "auth"."uid"() AS "uid"))))))));



CREATE POLICY "training plans delete by coach or admin" ON "public"."training_plans" FOR DELETE USING (("public"."is_admin"() OR (("coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_coach_of"("athlete_id"))));



CREATE POLICY "training plans insert by coach or admin" ON "public"."training_plans" FOR INSERT WITH CHECK (("public"."is_admin"() OR (("coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_coach_of"("athlete_id"))));



CREATE POLICY "training plans read by participant or admin" ON "public"."training_plans" FOR SELECT USING (("public"."is_admin"() OR ("coach_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("athlete_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "training plans update by coach or admin" ON "public"."training_plans" FOR UPDATE USING (("public"."is_admin"() OR (("coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_coach_of"("athlete_id")))) WITH CHECK (("public"."is_admin"() OR (("coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_coach_of"("athlete_id"))));



ALTER TABLE "public"."training_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workout_notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workout_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workout_set_logs" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "service_role";






















































































































































REVOKE ALL ON FUNCTION "public"."complete_workout_atomic"("p_scheduled_workout_id" "uuid", "p_requester_id" "uuid", "p_requester_role" "public"."app_role", "p_expected_session_updated_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_workout_atomic"("p_scheduled_workout_id" "uuid", "p_requester_id" "uuid", "p_requester_role" "public"."app_role", "p_expected_session_updated_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."current_email"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."current_email"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_email"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."current_role"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."current_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_role"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."current_status"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."current_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_status"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_latest_autofill_logs"("p_athlete_id" "uuid", "p_exercise_ids" "text"[], "p_session_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_latest_autofill_logs"("p_athlete_id" "uuid", "p_exercise_ids" "text"[], "p_session_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_auth_user_profile_sync"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_auth_user_profile_sync"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_athlete_of"("target_coach" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_athlete_of"("target_coach" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_athlete_of"("target_coach" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_coach_of"("target_athlete" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_coach_of"("target_athlete" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_coach_of"("target_athlete" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_workout_note_entry"("p_scheduled_workout_id" "uuid", "p_requester_id" "uuid", "p_requester_role" "public"."app_role", "p_body" "text", "p_expected_note_updated_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_workout_note_entry"("p_scheduled_workout_id" "uuid", "p_requester_id" "uuid", "p_requester_role" "public"."app_role", "p_body" "text", "p_expected_note_updated_at" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "postgres";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "anon";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "service_role";



GRANT ALL ON FUNCTION "public"."show_limit"() TO "postgres";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."start_workout_atomic"("p_requester_id" "uuid", "p_requester_role" "public"."app_role", "p_set_logs" "jsonb", "p_scheduled_workout_id" "uuid", "p_training_plan_id" "uuid", "p_program_workout_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."start_workout_atomic"("p_requester_id" "uuid", "p_requester_role" "public"."app_role", "p_set_logs" "jsonb", "p_scheduled_workout_id" "uuid", "p_training_plan_id" "uuid", "p_program_workout_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_profile_from_auth_user"("auth_user_id" "uuid", "auth_email" "text", "auth_user_meta_data" "jsonb", "auth_created_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_profile_from_auth_user"("auth_user_id" "uuid", "auth_email" "text", "auth_user_meta_data" "jsonb", "auth_created_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_workout_date_atomic"("p_scheduled_workout_id" "uuid", "p_requester_id" "uuid", "p_requester_role" "public"."app_role", "p_expected_session_updated_at" timestamp with time zone, "p_scheduled_date" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_workout_date_atomic"("p_scheduled_workout_id" "uuid", "p_requester_id" "uuid", "p_requester_role" "public"."app_role", "p_expected_session_updated_at" timestamp with time zone, "p_scheduled_date" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_workout_duration_atomic"("p_scheduled_workout_id" "uuid", "p_requester_id" "uuid", "p_requester_role" "public"."app_role", "p_expected_session_updated_at" timestamp with time zone, "p_duration_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_workout_duration_atomic"("p_scheduled_workout_id" "uuid", "p_requester_id" "uuid", "p_requester_role" "public"."app_role", "p_expected_session_updated_at" timestamp with time zone, "p_duration_seconds" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_workout_set_log"("p_scheduled_workout_id" "uuid", "p_log_id" "uuid", "p_requester_id" "uuid", "p_requester_role" "public"."app_role", "p_expected_session_updated_at" timestamp with time zone, "p_has_done" boolean, "p_done" boolean, "p_has_actual_reps" boolean, "p_actual_reps" integer, "p_has_actual_load" boolean, "p_actual_load" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_workout_set_log"("p_scheduled_workout_id" "uuid", "p_log_id" "uuid", "p_requester_id" "uuid", "p_requester_role" "public"."app_role", "p_expected_session_updated_at" timestamp with time zone, "p_has_done" boolean, "p_done" boolean, "p_has_actual_reps" boolean, "p_actual_reps" integer, "p_has_actual_load" boolean, "p_actual_load" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "service_role";


















GRANT ALL ON TABLE "public"."ai_usage_events" TO "anon";
GRANT ALL ON TABLE "public"."ai_usage_events" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_usage_events" TO "service_role";



GRANT ALL ON TABLE "public"."assigned_meal_plan_items" TO "anon";
GRANT ALL ON TABLE "public"."assigned_meal_plan_items" TO "authenticated";
GRANT ALL ON TABLE "public"."assigned_meal_plan_items" TO "service_role";



GRANT ALL ON TABLE "public"."assigned_meal_plans" TO "anon";
GRANT ALL ON TABLE "public"."assigned_meal_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."assigned_meal_plans" TO "service_role";



GRANT ALL ON TABLE "public"."body_measurements" TO "anon";
GRANT ALL ON TABLE "public"."body_measurements" TO "authenticated";
GRANT ALL ON TABLE "public"."body_measurements" TO "service_role";



GRANT ALL ON TABLE "public"."coach_athlete_assignments" TO "anon";
GRANT ALL ON TABLE "public"."coach_athlete_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."coach_athlete_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."conversation_entries" TO "anon";
GRANT ALL ON TABLE "public"."conversation_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."conversation_entries" TO "service_role";



GRANT ALL ON TABLE "public"."day_meal_plans" TO "anon";
GRANT ALL ON TABLE "public"."day_meal_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."day_meal_plans" TO "service_role";



GRANT ALL ON TABLE "public"."exercises" TO "anon";
GRANT ALL ON TABLE "public"."exercises" TO "authenticated";
GRANT ALL ON TABLE "public"."exercises" TO "service_role";



GRANT ALL ON TABLE "public"."extra_activities" TO "anon";
GRANT ALL ON TABLE "public"."extra_activities" TO "authenticated";
GRANT ALL ON TABLE "public"."extra_activities" TO "service_role";



GRANT ALL ON TABLE "public"."ingredient_catalog" TO "anon";
GRANT ALL ON TABLE "public"."ingredient_catalog" TO "authenticated";
GRANT ALL ON TABLE "public"."ingredient_catalog" TO "service_role";



GRANT ALL ON TABLE "public"."invites" TO "anon";
GRANT ALL ON TABLE "public"."invites" TO "authenticated";
GRANT ALL ON TABLE "public"."invites" TO "service_role";



GRANT ALL ON TABLE "public"."meal_plan_template_items" TO "anon";
GRANT ALL ON TABLE "public"."meal_plan_template_items" TO "authenticated";
GRANT ALL ON TABLE "public"."meal_plan_template_items" TO "service_role";



GRANT ALL ON TABLE "public"."meal_plan_templates" TO "anon";
GRANT ALL ON TABLE "public"."meal_plan_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."meal_plan_templates" TO "service_role";



GRANT ALL ON TABLE "public"."nutrition_profiles" TO "anon";
GRANT ALL ON TABLE "public"."nutrition_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."nutrition_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."password_reset_requests" TO "anon";
GRANT ALL ON TABLE "public"."password_reset_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."password_reset_requests" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."recipe_ingredients" TO "anon";
GRANT ALL ON TABLE "public"."recipe_ingredients" TO "authenticated";
GRANT ALL ON TABLE "public"."recipe_ingredients" TO "service_role";



GRANT ALL ON TABLE "public"."recipes" TO "anon";
GRANT ALL ON TABLE "public"."recipes" TO "authenticated";
GRANT ALL ON TABLE "public"."recipes" TO "service_role";



GRANT ALL ON TABLE "public"."scheduled_workouts" TO "anon";
GRANT ALL ON TABLE "public"."scheduled_workouts" TO "authenticated";
GRANT ALL ON TABLE "public"."scheduled_workouts" TO "service_role";



GRANT ALL ON TABLE "public"."training_plans" TO "anon";
GRANT ALL ON TABLE "public"."training_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."training_plans" TO "service_role";



GRANT ALL ON TABLE "public"."workout_notes" TO "anon";
GRANT ALL ON TABLE "public"."workout_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."workout_notes" TO "service_role";



GRANT ALL ON TABLE "public"."workout_sessions" TO "anon";
GRANT ALL ON TABLE "public"."workout_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."workout_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."workout_set_logs" TO "anon";
GRANT ALL ON TABLE "public"."workout_set_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."workout_set_logs" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































