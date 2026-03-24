grant execute on function public.current_role() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_coach_of(uuid) to authenticated;
grant execute on function public.is_athlete_of(uuid) to authenticated;
