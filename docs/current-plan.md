# Current Plan

Tämä tiedosto kuvaa tämänhetkisen tilanteen ilman vanhoja välivaiheita tai historiallisen review-kierroksen yksityiskohtia.

## Tavoite
Pidetään sovellus ajantasaisena, helposti käynnistettävänä ja julkaisukelpoisena ilman että dokumentaatio paisuu vanhoista välivaiheista.

## Nykyinen toteutettu scope
- roolipohjainen käyttö admin-, coach-, athlete- ja independent athlete -näkymillä
- Supabase-authiin nojaavat login-, invite accept- ja password reset -polut
- ohjelmien luonti, päivitys, tilamuutokset ja treenin käynnistys API-routien kautta
- athlete-loggaus: sarjat, kuormat, muistiinpanot ja kehonmittaukset
- Supabase-skeema, migraatiot ja testit kriittisille domain- ja serveriflowille
- demo-fallback, jolla käyttöliittymää ja domainia voi kehittää ilman taustapalvelua

## Seuraavat järkevät siivousaskeleet
1. Pilko [`providers/app-state-provider.tsx`](/Users/laalo/Omat projektit/rookiapp/providers/app-state-provider.tsx) pienempiin moduuleihin, jotta auth-, sync- ja action-logiikka eriytyvät.
2. Erota demo-fallback näkyvämmin omaksi adapteriksi, jotta tuotantopolku ja kehityspolku eivät sekoitu dokumentaatiossa tai koodissa.
3. Tiivistä deploy- ja ympäristödokumentaatio vielä yhteen operatiiviseen checklistiin ennen varsinaista tuotantojulkaisua.

## Ei tehdä tässä siivouskierroksessa
- laajaa UI-uusintaa
- demo-tilan poistamista
- uutta domain-mallin kierrosta tai skeemaremonttia ilman erillistä tarvetta

## Hyväksymiskriteeri dokumentaatiolle
- `README.md` kertoo oikein miten projekti käynnistyy ja missä tilassa se toimii
- suunnitelmadokkarissa näkyy vain nykytila ja seuraavat realistiset askeleet
- historiallinen tai ylimääräinen teksti ei ole enää keskeisen dokumentaation varassa
