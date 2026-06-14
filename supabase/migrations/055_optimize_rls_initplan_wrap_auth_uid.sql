-- Perf (auth_rls_initplan): RLS policies called auth.uid() directly, so Postgres
-- re-evaluated it once per row. Wrapping as (select auth.uid()) turns it into an initplan
-- evaluated once per query. Semantically identical (same uuid) -- only performance changes.
-- All flagged policies use ONLY auth.uid() (no auth.role()/jwt()/current_setting()), so this
-- is a single uniform swap. The regex guard skips policies that are already wrapped (matches
-- the decompiled "select auth.uid()" form), making this idempotent. The DO block is atomic:
-- any failure rolls the whole thing back.
do $$
declare r record; nq text; nc text; stmt text;
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (coalesce(qual,'') || coalesce(with_check,'')) ~* 'auth\.uid\(\)'
      and (coalesce(qual,'') || coalesce(with_check,'')) !~* 'select\s+auth\.uid\(\)'
  loop
    nq := replace(r.qual, 'auth.uid()', '(select auth.uid())');
    nc := replace(r.with_check, 'auth.uid()', '(select auth.uid())');
    stmt := format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    if r.qual is not null then
      stmt := stmt || format(' using (%s)', nq);
    end if;
    if r.with_check is not null then
      stmt := stmt || format(' with check (%s)', nc);
    end if;
    execute stmt;
  end loop;
end$$;
