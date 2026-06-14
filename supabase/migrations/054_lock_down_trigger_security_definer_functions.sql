-- handle_auth_user_profile_sync (trigger on_auth_user_created_sync_profile) and
-- rls_auto_enable (event trigger ensure_rls) are only ever invoked by their triggers,
-- which run as the function owner regardless of EXECUTE grants. They are not meant to be
-- callable via the REST RPC API, so remove them from the anon/authenticated surface.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('handle_auth_user_profile_sync', 'rls_auto_enable')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated;', r.sig);
  end loop;
end$$;
