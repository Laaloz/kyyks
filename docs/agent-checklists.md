# Agent Checklists

Tämä tiedosto toimii käytännön tarkistuslistana agenttien yhteistyöhön. Käytä tätä yhdessä [`AGENTS.md`](/Users/laalo/Omat projektit/rookiapp/AGENTS.md):n kanssa.

## Ennen toteutusta

### Projektin päällikkö
- tavoite on kirjoitettu yhdellä lauseella
- onnistumiskriteerit ovat mitattavia
- scope on rajattu
- riippuvuudet ovat näkyvissä

### Arkkitehti
- toteutuksen omistavat kerrokset on nimetty
- mahdolliset data- tai auth-muutokset on tunnistettu
- laajennettavuus myöhempiin vaiheisiin on huomioitu

### UX-suunnittelija
- tärkein käyttäjäpolku on kuvattu
- virhepolku on tunnistettu
- mobiilikäyttö on arvioitu

### UI-suunnittelija
- tärkeimmät tilat on määritelty
- painikkeiden, korttien ja lomakkeiden prioriteetti on selvä
- tilaeroille on visuaalinen kieli

### Saavutettavuusagentti
- lomakkeiden labelit ja errorit suunniteltu
- fokusjärjestys huomioitu
- komponentit eivät nojaa vain väriin

### Tietoturva-agentti
- roolivaikutukset tiedossa
- input-validointi suunniteltu
- backend-authorisointi huomioitu

## Toteutuksen aikana

### Koodaaja
- domain-logiikka pysyy pois presentaatioista
- jokaisella tiedostolla on selkeä vastuu
- väliaikaiset ratkaisut on merkitty

### Koodin laatu
- duplikaatio tunnistettu
- liian isot komponentit tai funktiot tunnistettu
- rajapinnat pysyvät luettavina

### Testaaja
- yksikkö- tai integraatiotesti on lisätty kun logiikka muuttuu
- kriittinen käyttäjäpolku on testattu
- virhetilat on huomioitu

## Ennen mergeä tai julkaisua

### QA
- acceptance criteria täyttyy
- regressioriskit arvioitu
- tunnetut puutteet kirjattu

### DevOps
- build onnistuu puhtaassa ympäristössä
- ympäristömuuttujat dokumentoitu
- julkaisu ei nojaa paikallisesti syntyvään dataan

### Saavutettavuusagentti
- näppäimistökäyttö testattu
- tärkeimmät näkymät toimivat ilman hiirtä
- fokus näkyy

### Tietoturva-agentti
- ei salaisuuksia repositoryssä
- roolirajaukset tarkistettu
- client ei luota yksin UI-piilotukseen

### Projektin päällikkö
- päätös julkaista tai olla julkaisematta on kirjattu
- jos jotain siirretään myöhempään, se on näkyvissä backlogissa

## Roolikohtaiset keskustelusäännöt
- Saavutettavuusagentti puuttuu heti, jos UI-ratkaisu estää käytön.
- Arkkitehti puuttuu heti, jos logiikka leviää vääriin kerroksiin.
- Koodin laatu puuttuu, jos ratkaisu on tarpeettoman vaikea ylläpitää.
- DevOps puuttuu, jos ratkaisu ei ole toistettavasti ajettavissa tai julkaistavissa.
- Projektin päällikkö pysäyttää työn, jos scope karkaa.
- QA ei hyväksy muutosta pelkän “toimii minulla” -havainnon perusteella.
- Tietoturva voi estää julkaisun, jos autorisointi on puutteellinen.
- Testaaja voi avata bugit suoraan ilman hyväksyntäkierrosta.
- UI-suunnittelija ei viimeistele ulkoasua ilman UX- ja saavutettavuuslinjausta.
- UX-suunnittelija voi pyytää virtaviivaistamista, vaikka tekninen toteutus olisi jo valmis.

## Yhteinen Definition of Done
- käyttäjälle näkyvä tavoite toteutuu
- koodi on ymmärrettävää ja testattavaa
- testit, build ja typecheck läpi
- saavutettavuus ja tietoturva arvioitu
- dokumentaatio päivitetty
