-- These SECURITY DEFINER functions authorize the caller purely from the self-asserted
-- p_requester_role/p_requester_id parameters and bypass RLS. They are only ever invoked
-- server-side via the service_role admin client, so EXECUTE must not be available to
-- anon/authenticated -- otherwise anyone with the public anon key could call e.g.
-- update_workout_set_log with p_requester_role => 'admin' and tamper with any user's data.
--
-- The EXECUTE privilege comes from the default PUBLIC grant, so it must be revoked from
-- PUBLIC (revoking from anon/authenticated alone is a no-op). service_role is re-granted
-- so the server-side admin client keeps working. RLS helper functions (is_admin,
-- is_coach_of, is_athlete_of, current_role) are intentionally left alone because
-- authenticated needs them inside RLS policies.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in (
        'start_workout_atomic',
        'complete_workout_atomic',
        'update_workout_set_log',
        'save_workout_note_entry',
        'update_workout_date_atomic',
        'update_workout_duration_atomic',
        'get_latest_autofill_logs',
        'sync_profile_from_auth_user'
      )
  loop
    execute format('revoke execute on function %s from public, anon, authenticated;', r.sig);
    execute format('grant execute on function %s to service_role;', r.sig);
  end loop;
end$$;
