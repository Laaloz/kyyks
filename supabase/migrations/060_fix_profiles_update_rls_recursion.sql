-- Korjaa "infinite recursion detected in policy for relation profiles".
--
-- Oire: oma mittatietojen tallennus (paino/vyötärö) epäonnistui aina, kun arvo
-- muuttui — virhe "Mittatietojen tallennus epäonnistui." Mittaustallennus on yksi
-- harvoista kirjoituksista, joka osuu suoraan `profiles`-tauluun selaimesta
-- (asetukset menevät service-role-API:n kautta), joten se paljasti bugin.
--
-- Juurisyy: `profiles update by self or admin` -politiikan WITH CHECK vertasi
-- riviä alikyselyillä SAMAAN `profiles`-tauluun (role/status/email). Politiikan
-- sisäinen suora viittaus omaan tauluun ajetaan kutsujan roolilla RLS:n alla →
-- politiikka evaluoidaan rekursiivisesti → Postgres 42P17 (infinite recursion).
--
-- Korjaus: luetaan kutsujan nykyinen role/status/email SECURITY DEFINER
-- -apufunktioilla (taulun omistaja ohittaa RLS:n → ei rekursiota), samalla
-- mallilla kuin olemassa oleva public."current_role"(). Muuttumattomuusehto
-- (käyttäjä ei voi vaihtaa omaa rooliaan/statustaan/sähköpostiaan) säilyy
-- ennallaan.

create or replace function public.current_status()
returns user_status
language sql
stable
security definer
set search_path to ''
as $function$
  select status
  from public.profiles
  where id = auth.uid()
$function$;

create or replace function public.current_email()
returns text
language sql
stable
security definer
set search_path to ''
as $function$
  select email
  from public.profiles
  where id = auth.uid()
$function$;

-- Sama grant-malli kuin muillakin RLS-apufunktioilla (058): anon pois,
-- authenticated säilyttää EXECUTEn koska politiikka kutsuu näitä evaluoinnin
-- aikana kutsujan roolilla.
revoke execute on function public.current_status() from public, anon;
revoke execute on function public.current_email() from public, anon;
grant execute on function public.current_status() to authenticated, service_role;
grant execute on function public.current_email() to authenticated, service_role;

drop policy if exists "profiles update by self or admin" on public.profiles;

create policy "profiles update by self or admin"
on public.profiles for update
using ((select auth.uid()) = id or public.is_admin())
with check (
  public.is_admin()
  or (
    (select auth.uid()) = id
    and role = public.current_role()
    and status = public.current_status()
    and email = public.current_email()
  )
);
