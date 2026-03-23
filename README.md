# Rookiapp

Coach-first, mobile-first treenisovellus valmentajille ja treenaajille.

## Mitä mukana
- `Next.js` App Router + `TypeScript`
- `Tailwind CSS` -pohjainen custom UI
- Demo-tilassa toimiva localStorage-pohjainen data layer
- Nykyiseen domain-malliin päivitetty Supabase-skeema ja RLS-lähtöpohja
- Roolit: `admin`, `coach`, `athlete`
- Flowt:
  - login / kutsun hyväksyntä
  - adminin lähettämät käyttäjäkutsut
  - valmentajan ohjelmapohjien rakennus
  - templatejen duplikointi
  - ohjelmakokonaisuuksien rakentaminen ja treenin käynnistys ohjelmasta
  - treenaajan setti-, kuorma-, RPE- ja muistiinpanologgaus

## Demo-käyttäjät
- `admin@rookiapp.fi` / `demo123`
- `coach@rookiapp.fi` / `demo123`
- `sara@rookiapp.fi` / `demo123`
- `elias@rookiapp.fi` / `demo123`

## Käynnistys
1. `source ~/.nvm/nvm.sh`
2. `npm install`
3. `npm run dev`

## Supabase tuotantopolku
1. Luo Supabase-projekti.
2. Käytä [`supabase/schema.sql`](/Users/laalo/Omat projektit/rookiapp/supabase/schema.sql) uuden ympäristön lähtöpohjana.
3. Jos ympäristössä on vanha schema jo käytössä, aja migraatiot järjestyksessä kansiosta [`supabase/migrations`](/Users/laalo/Omat projektit/rookiapp/supabase/migrations).
4. Lisää `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

5. Älä aja skeemaa sokkona olemassa olevaan tuotantotietokantaan, koska enum- ja taulurakenne ovat muuttuneet vanhasta template-ajastusmallista ohjelmapohjaiseen malliin.
6. Korvaa demo-providerin localStorage-tallennus Supabase route handlers / server actions -kutsuilla.
7. Säilytä domain-logiikka [`lib/domain.ts`](/Users/laalo/Omat projektit/rookiapp/lib/domain.ts):ssa ja kytke se tietokantakerrokseen.

## Rakenne
- [`app`](/Users/laalo/Omat projektit/rookiapp/app): App Router -näkymät, layout, PWA-manifesti
- [`components/workout-app.tsx`](/Users/laalo/Omat projektit/rookiapp/components/workout-app.tsx): admin/coach/athlete UI-käyttäjäpolut
- [`providers/app-state-provider.tsx`](/Users/laalo/Omat projektit/rookiapp/providers/app-state-provider.tsx): demo-auth + local state
- [`lib/domain.ts`](/Users/laalo/Omat projektit/rookiapp/lib/domain.ts): liiketoimintasäännöt
- [`supabase/schema.sql`](/Users/laalo/Omat projektit/rookiapp/supabase/schema.sql): relaatiomalli + RLS
- [`supabase/migrations`](/Users/laalo/Omat projektit/rookiapp/supabase/migrations): vaiheistetut muutokset vanhasta skeemasta nykyiseen malliin
- [`AGENTS.md`](/Users/laalo/Omat projektit/rookiapp/AGENTS.md): agenttiroolit, yhteistyöprotokolla ja julkaisukriteerit
- [`docs/agent-checklists.md`](/Users/laalo/Omat projektit/rookiapp/docs/agent-checklists.md): käytännön tarkistuslistat
- [`docs/agent-handoff-template.md`](/Users/laalo/Omat projektit/rookiapp/docs/agent-handoff-template.md): vakioitu handoff-pohja
- [`docs/agent-prompts.md`](/Users/laalo/Omat projektit/rookiapp/docs/agent-prompts.md): valmiit promptipohjat kaikille agenteille
- [`docs/agent-review-report.md`](/Users/laalo/Omat projektit/rookiapp/docs/agent-review-report.md): viimeisin moniroolinen review-kierros ja korjaukset

## Testit
- `npm run typecheck`
- `npm test`
