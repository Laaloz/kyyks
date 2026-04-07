# rooki.fit

Coach-first, mobile-first treenisovellus valmentajille ja treenaajille.

## Nykytila
- `Next.js 16` + `React 19` + `TypeScript`
- `Tailwind CSS 4` -pohjainen custom UI
- Roolit: `admin`, `coach`, `athlete`, `independent_athlete`
- Supabase-pohjaiset auth- ja server-flowt tuotantopolulle
- Demo-fallback localStoragella kehitystä ja nopeaa testausta varten

Sovellus tukee tällä hetkellä ainakin nämä ydinkäyttäjäpolut:
- kirjautuminen, kutsun hyväksyntä ja salasanan nollaus
- adminin käyttäjä- ja coach-athlete-hallinta
- coachin ohjelmien rakennus, muokkaus, ajastus ja kutsujen hallinta
- athlete-näkymän treenin käynnistys, sarjaloggaus, muistiinpanot ja mittaukset
- admin-vetoinen ravintodomain: raaka-aineet, reseptit, ateriapohjat ja athleteille jaettavat ruokalistat
- roolipohjainen dashboard ja keskusteluketjut

## Käyttötilat

### 1. Demo-tila
Jos Supabase-ympäristömuuttujia ei ole asetettu, sovellus käynnistyy demo-fallbackilla. Tämä on hyödyllinen UI- ja domain-kehityksessä.

Demo-käyttäjät:
- `admin@rooki.fit` / `demo123`
- `coach@rooki.fit` / `demo123`
- `sara@rooki.fit` / `demo123`
- `elias@rooki.fit` / `demo123`

### 2. Supabase-tila
Kun Supabase on konfiguroitu, sovellus käyttää server routeja authiin, kutsuihin, salasanan nollaukseen ja näkyvän applikaatiotilan synkronointiin.

## Käynnistys
1. `source ~/.nvm/nvm.sh`
2. `nvm install`
3. `nvm use`
4. `npm install`
5. `npm run dev`

Suositeltu Node-versio on `22.x`.

## Ympäristömuuttujat

### Vähintään demo-kehitykseen
Ei pakollisia muuttujia.

### Supabase- ja sähköpostiflowihin
Lisää `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_HCAPTCHA_SITE_KEY=...
HCAPTCHA_SECRET_KEY=...
RESEND_API_KEY=...
EMAIL_FROM="rooki.fit <no-reply@rooki.fit>"
```

Huomiot:
- `NEXT_PUBLIC_SUPABASE_URL` ja `NEXT_PUBLIC_SUPABASE_ANON_KEY` ottavat Supabase-tilan käyttöön.
- `SUPABASE_SERVICE_ROLE_KEY` tarvitaan serveripuolen admin-operaatioihin.
- `RESEND_API_KEY` ja `EMAIL_FROM` tarvitaan oikeisiin invite- ja password reset -sähköposteihin.
- `HCAPTCHA_SECRET_KEY` tarvitaan julkisen salasanan nollauksen varmennukseen, jos captcha on käytössä.

## Supabase-skeema
1. Luo Supabase-projekti.
2. Käytä [`supabase/schema.sql`](/Users/laalo/Omat projektit/rookiapp/supabase/schema.sql) uuden ympäristön lähtöpohjana.
3. Jos ympäristössä on vanhempi skeema, aja migraatiot järjestyksessä kansiosta [`supabase/migrations`](/Users/laalo/Omat projektit/rookiapp/supabase/migrations).

Pidä domain-logiikka [`lib/domain.ts`](/Users/laalo/Omat projektit/rookiapp/lib/domain.ts):ssa ja serveri-integraatiot [`lib/server`](/Users/laalo/Omat projektit/rookiapp/lib/server):ssä.

## Komennot
- `npm run dev`
- `npm run build`
- `npm run typecheck`
- `npm test`
- `npm run import:fineli -- /polku/resultset.csv --dry-run`

## Fineli-import
Jos sinulla on Fineli-export CSV-muodossa, voit esikatsella tai importata sen `ingredient_catalog`-tauluun.

Esikatselu:

```bash
npm run import:fineli -- /Users/laalo/Downloads/resultset.csv --dry-run
```

Tuonti Supabaseen:

```bash
FINELI_CREATED_BY=<admin-user-uuid> npm run import:fineli -- /Users/laalo/Downloads/resultset.csv
```

Huomiot:
- skripti odottaa Fineli-tyyppistä `;`-eroteltua CSV:tä
- ympäristömuuttujat `NEXT_PUBLIC_SUPABASE_URL` ja `SUPABASE_SERVICE_ROLE_KEY` pitää olla asetettuina
- `FINELI_CREATED_BY` tai `FINELI_ADMIN_USER_ID` pitää osoittaa olemassa olevaan admin-käyttäjän UUID:hen
- skripti muuntaa `kJ -> kcal` ja normalisoi arvot kuten `N/A` ja `<0.1`

## Rakenne
- [`app`](/Users/laalo/Omat projektit/rookiapp/app): App Router -sivut ja API-routet
- [`components`](/Users/laalo/Omat projektit/rookiapp/components): käyttöliittymä ja roolikohtaiset näkymät
- [`providers/app-state-provider.tsx`](/Users/laalo/Omat projektit/rookiapp/providers/app-state-provider.tsx): client state, demo-fallback ja Supabase-synkronointi
- [`lib/domain.ts`](/Users/laalo/Omat projektit/rookiapp/lib/domain.ts): domain-säännöt
- [`lib/server`](/Users/laalo/Omat projektit/rookiapp/lib/server): serveripuolen auth-, sync- ja training-workflowt
- [`supabase`](/Users/laalo/Omat projektit/rookiapp/supabase): skeema ja migraatiot
- [`tests`](/Users/laalo/Omat projektit/rookiapp/tests): Vitest-testit
- [`docs/current-plan.md`](/Users/laalo/Omat projektit/rookiapp/docs/current-plan.md): nykytila ja seuraavat siivousaskeleet
- [`AGENTS.md`](/Users/laalo/Omat projektit/rookiapp/AGENTS.md): projektin agenttimalli
