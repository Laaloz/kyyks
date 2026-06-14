-- Tietoturva: poista RLS-apufunktioiden EXECUTE anonilta (security advisor:
-- anon_security_definer_function_executable). Nämä SECURITY DEFINER -funktiot
-- ovat oletuksena PUBLIC-grantilla → kutsuttavissa myös kirjautumattomana
-- /rest/v1/rpc/<fn> kautta. `authenticated` säilyttää EXECUTE-oikeuden, koska
-- RLS-politiikat kutsuvat näitä evaluoinnin aikana kutsujan roolilla; vain anon
-- pudotetaan pois. (Authenticated-altistuksen täysi poisto vaatisi funktioiden
-- siirron ei-julkiseen skeemaan ja kaikkien politiikkojen uudelleenkirjoituksen.)

-- Huom: anonilla on suora grant (ei vain PUBLICin kautta), joten revoke pitää
-- kohdistaa suoraan anoniin — pelkkä `from public` ei riitä.
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_coach_of(uuid) from public, anon;
revoke execute on function public.is_athlete_of(uuid) from public, anon;
revoke execute on function public."current_role"() from public, anon;

grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.is_coach_of(uuid) to authenticated, service_role;
grant execute on function public.is_athlete_of(uuid) to authenticated, service_role;
grant execute on function public."current_role"() to authenticated, service_role;
