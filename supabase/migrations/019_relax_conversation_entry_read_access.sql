drop policy if exists "conversation entries read by participant or admin" on public.conversation_entries;

create policy "conversation entries read by participant or admin"
on public.conversation_entries for select
using (
  public.is_admin()
  or athlete_id = auth.uid()
  or (coach_id = auth.uid() and public.is_coach_of(athlete_id))
);

drop policy if exists "conversation entries update by participant or admin" on public.conversation_entries;

create policy "conversation entries update by participant or admin"
on public.conversation_entries for update
using (
  public.is_admin()
  or athlete_id = auth.uid()
  or (coach_id = auth.uid() and public.is_coach_of(athlete_id))
)
with check (
  public.is_admin()
  or athlete_id = auth.uid()
  or (coach_id = auth.uid() and public.is_coach_of(athlete_id))
);
