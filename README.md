# Rookiapp

Coach-first, mobile-first treenisovellus valmentajille ja treenaajille.

## Mitä mukana
- `Next.js` App Router + `TypeScript`
- `Tailwind CSS` -pohjainen custom UI
- Demo-tilassa toimiva localStorage-pohjainen data layer
- Supabase-ready skeema, auth-polku ja RLS-dokumentaatio
- Roolit: `admin`, `coach`, `athlete`
- Flowt:
  - login / kutsun hyväksyntä
  - adminin lähettämät käyttäjäkutsut
  - valmentajan ohjelmapohjien rakennus
  - templatejen duplikointi ja ajastus treenaajalle
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
2. Aja [`supabase/schema.sql`](/Users/laalo/Omat projektit/rookiapp/supabase/schema.sql).
3. Lisää `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

4. Korvaa demo-providerin localStorage-tallennus Supabase route handlers / server actions -kutsuilla.
5. Säilytä domain-logiikka [`lib/domain.ts`](/Users/laalo/Omat projektit/rookiapp/lib/domain.ts):ssa ja kytke se tietokantakerrokseen.

## Rakenne
- [`app`](/Users/laalo/Omat projektit/rookiapp/app): App Router -näkymät, layout, PWA-manifesti
- [`components/workout-app.tsx`](/Users/laalo/Omat projektit/rookiapp/components/workout-app.tsx): admin/coach/athlete UI-käyttäjäpolut
- [`providers/app-state-provider.tsx`](/Users/laalo/Omat projektit/rookiapp/providers/app-state-provider.tsx): demo-auth + local state
- [`lib/domain.ts`](/Users/laalo/Omat projektit/rookiapp/lib/domain.ts): liiketoimintasäännöt
- [`supabase/schema.sql`](/Users/laalo/Omat projektit/rookiapp/supabase/schema.sql): relaatiomalli + RLS
- [`AGENTS.md`](/Users/laalo/Omat projektit/rookiapp/AGENTS.md): agenttiroolit, yhteistyöprotokolla ja julkaisukriteerit
- [`docs/agent-checklists.md`](/Users/laalo/Omat projektit/rookiapp/docs/agent-checklists.md): käytännön tarkistuslistat
- [`docs/agent-handoff-template.md`](/Users/laalo/Omat projektit/rookiapp/docs/agent-handoff-template.md): vakioitu handoff-pohja
- [`docs/agent-prompts.md`](/Users/laalo/Omat projektit/rookiapp/docs/agent-prompts.md): valmiit promptipohjat kaikille agenteille
- [`docs/agent-review-report.md`](/Users/laalo/Omat projektit/rookiapp/docs/agent-review-report.md): viimeisin moniroolinen review-kierros ja korjaukset

## Testit
- `npm run typecheck`
- `npm test`
