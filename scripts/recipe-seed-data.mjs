// Vaihtoehto, jossa on sulkeissa grammamäärä ("Margariini alle 50% rasvaa (13 g)"),
// on rakenteinen swap: nimi + oma grammamäärä. Se nostetaan alternativeOptions-kenttään,
// jotta esikatselu voi laskea makrot uudelleen. Grammattomat vaihtoehdot jäävät
// vapaatekstiksi alternatives-kenttään (geneeriset, esim. "Muut marjat").
const GRAM_ALTERNATIVE_RE = /^(.*?)\s*\(\s*(\d+(?:[.,]\d+)?)\s*g\s*\)\s*$/i;

function splitAlternatives(alternatives) {
  const textAlternatives = [];
  const alternativeOptions = [];

  for (const raw of alternatives ?? []) {
    const value = String(raw).trim();
    if (!value) {
      continue;
    }

    const match = value.match(GRAM_ALTERNATIVE_RE);
    if (match) {
      alternativeOptions.push({
        ingredientName: match[1].trim(),
        grams: Number(match[2].replace(",", ".")),
      });
    } else {
      textAlternatives.push(value);
    }
  }

  return { alternatives: textAlternatives, alternativeOptions };
}

function ingredient(ingredientName, quantity, unit = "g", options = {}) {
  const {
    ingredientRole = "main",
    scalingMode = "linear",
    displayQuantity,
    displayUnit,
    groupLabel,
    alternatives,
  } = options;

  const { alternatives: textAlternatives, alternativeOptions } = splitAlternatives(alternatives);

  return {
    ingredientName,
    quantity,
    unit,
    ingredientRole,
    scalingMode,
    ...(groupLabel ? { groupLabel } : {}),
    ...(textAlternatives.length ? { alternatives: textAlternatives } : {}),
    ...(alternativeOptions.length ? { alternativeOptions } : {}),
    ...(displayQuantity !== undefined ? { displayQuantity: String(displayQuantity) } : {}),
    ...(displayUnit !== undefined ? { displayUnit } : {}),
  };
}

function fixedIngredient(ingredientName, quantity, unit = "g", options = {}) {
  return ingredient(ingredientName, quantity, unit, { ...options, scalingMode: "fixed" });
}

function gentleIngredient(ingredientName, quantity, unit = "g", options = {}) {
  return ingredient(ingredientName, quantity, unit, { ...options, scalingMode: "gentle" });
}

function textIngredient(ingredientName, displayQuantity = "maun mukaan", displayUnit = "", options = {}) {
  return ingredient(ingredientName, undefined, "g", {
    ...options,
    ingredientRole: "spice",
    scalingMode: "text_only",
    displayQuantity,
    displayUnit,
  });
}

function numbered(steps) {
  return steps.map((step, index) => `${index + 1}. ${step}`).join("\n");
}

function recipe({
  name,
  description,
  mealTag,
  dietaryFlags = [],
  allergies = [],
  ingredients,
  instructions,
  defaultServings,
  minServings,
  maxServings,
}) {
  return {
    name,
    description,
    mealTag,
    dietaryFlags,
    allergies,
    ingredients,
    instructions: numbered(instructions),
    defaultServings,
    minServings,
    maxServings,
  };
}

const singleServe = { defaultServings: 1, minServings: 1, maxServings: 1 };
const batchServe = { defaultServings: 4, minServings: 4, maxServings: 4 };

// Määrät on koottu Laalon ruokaohjelma -PDF:stä (Team FitBeny). PDF antaa määrät per annos;
// yhden annoksen reseptit (aamupala, välipala, iltapala) noudattavat näitä sellaisinaan ja
// neljän annoksen erät (lounas, illallinen) on skaalattu ×4. VAIHTOEHDOT-osion vaihtoehdot on
// lisätty alternatives-kenttään, ja sulkeissa oleva grammamäärä on saman annosperustan mukainen.
export const recipeSeedData = [
  // ===== AAMIAINEN (~396 kcal / annos) =====
  recipe({
    name: "Ruisleipää ja kananmunaa",
    description: "Selkeä aamupala leivästä, kananmunista ja kevyistä päällysteistä.",
    mealTag: "breakfast",
    ...singleServe,
    ingredients: [
      ingredient("Ruisleipä", 2, "pcs", { groupLabel: "Leivät" }),
      ingredient("Tuorejuusto 11%", 30, "g", { groupLabel: "Leivät", alternatives: ["Margariini alle 50% rasvaa (13 g)"] }),
      ingredient("Aamupala Kevyenraikas 5% sulatejuustoviipale", 20, "g", { groupLabel: "Leivät" }),
      ingredient("Kananmuna", 2, "pcs", { groupLabel: "Lisäksi" }),
    ],
    instructions: [
      "Keitä tai paista kananmunat ja halutessasi paahda leivät kevyesti.",
      "Voitele leivät, lisää sulatejuustoviipale ja tarjoile kananmunien kera. Mausta esim. herbamarella tai suolalla ja pippurilla.",
      "Lisää halutessasi kasviksia (esim. tomaatti, kurkku, salaatinlehtiä).",
    ],
  }),
  recipe({
    name: "Leipä ja proteiinivanukas",
    description: "Nopea aamupala leivällä, kalkkunalla ja proteiinivanukkaalla.",
    mealTag: "breakfast",
    ...singleServe,
    ingredients: [
      ingredient("100% kauraleipä", 2, "pcs", { groupLabel: "Leivät" }),
      ingredient("Margariini alle 50% rasvaa", 15, "g", { groupLabel: "Leivät", alternatives: ["Tuorejuusto 11% (35 g)"] }),
      ingredient("Kalkkunaviipaleet", 30, "g", { groupLabel: "Leivät" }),
      ingredient("Profeel proteiinivanukas", 180, "g", { groupLabel: "Lisäksi", alternatives: ["Vähärasvainen proteiinirahka", "Maitorahka 0,2%"] }),
    ],
    instructions: [
      "Paahda leivät halutessasi. Tarjoile levitteen ja kalkkunan kanssa.",
      "Laita leivän päälle halutessasi esim. tomaattia ja/tai kurkkua.",
      "Nauti proteiinivanukkaan tai rahkan kanssa.",
    ],
  }),
  recipe({
    name: "Puuro maapähkinävoilla ja marjoilla",
    description: "Kaurapuuro raejuustolla, marjoilla ja maapähkinävoilla. Maapähkinävoin voi vaihtaa pähkinöihin, väh. 85 % tummaan suklaaseen tai soijalesitiiniin.",
    mealTag: "breakfast",
    ...singleServe,
    ingredients: [
      ingredient("Kaurahiutale", 50, "g", { groupLabel: "Puuro" }),
      ingredient("Maapähkinävoi 99%", 10, "g", { groupLabel: "Päälle", alternatives: ["Suolaamattomat pähkinät", "Tumma suklaa 85%", "Soijalesitiini"] }),
      ingredient("Raejuusto", 125, "g", { groupLabel: "Päälle", alternatives: ["Heraproteiinijauhe (22 g)", "Maitorahka 0,2% (158 g)"] }),
      ingredient("Mustikka", 50, "g", { groupLabel: "Päälle" }),
      ingredient("Sokeroimaton mehukeitto", 100, "ml", { groupLabel: "Päälle" }),
    ],
    instructions: [
      "Valmista puuro mikrossa tai kattilassa.",
      "Annostele puuro kulhoon ja lisää päälle raejuusto, mustikat ja maapähkinävoi.",
      "Viimeistele halutessasi sokerittomalla mehukeitolla juuri ennen syömistä.",
    ],
  }),
  recipe({
    name: "Vadelma-tuorepuuro",
    description: "Yön yli tekeytyvä tuorepuuro vadelmilla ja skyrillä. Chian siemenet voi korvata maapähkinävoilla.",
    mealTag: "breakfast",
    ...singleServe,
    ingredients: [
      ingredient("Kaurahiutale", 45, "g", { groupLabel: "Tuorepuuro" }),
      ingredient("Rasvaton maito", 80, "ml", { groupLabel: "Tuorepuuro", alternatives: ["Vähärasvainen kauramaito"] }),
      ingredient("Chian siemenet", 6, "g", { groupLabel: "Tuorepuuro", alternatives: ["Maapähkinävoi 99%"] }),
      ingredient("Skyr", 200, "g", { groupLabel: "Tuorepuuro" }),
      ingredient("Vadelma", 60, "g", { groupLabel: "Päälle", alternatives: ["Muut marjat"] }),
    ],
    instructions: [
      "Sekoita kaurahiutaleet, maito, chian siemenet ja skyr kannelliseen rasiaan.",
      "Anna tekeytyä jääkaapissa vähintään parin tunnin ajan tai yön yli.",
      "Sekoita ennen tarjoilua, lisää päälle vadelmat ja tarvittaessa hieman nestettä.",
    ],
  }),
  recipe({
    name: "Rahkasmoothie",
    description: "Täyttävä smoothie maitorahkasta, banaanista, marjoista ja maapähkinävoista.",
    mealTag: "breakfast",
    ...singleServe,
    ingredients: [
      ingredient("Maitorahka 0,2%", 250, "g", { alternatives: ["Muu noin 150 kcal maitorahka"] }),
      ingredient("Banaani", 1, "pcs", { displayQuantity: "1", displayUnit: "kpl" }),
      ingredient("Vadelma", 75, "g"),
      ingredient("Maapähkinävoi 99%", 20, "g", { alternatives: ["Kookoshiutaleet (19 g)"] }),
      ingredient("Sokeroimaton mehukeitto", 50, "ml"),
    ],
    instructions: [
      "Lisää kaikki ainekset blenderiin.",
      "Sekoita tasaiseksi smoothieksi. Lisää tarvittaessa hieman nestettä ohuemmaksi.",
      "Vaihtoehtoisesti voit syödä ainekset suoraan kulhosta.",
    ],
  }),
  recipe({
    name: "Leipä ja skyr-kulho",
    description: "Leivät kalkkunalla ja skyr-kulho myslillä. Mikä tahansa n. 65–80 kcal/viipale leipä ja vähärasvainen proteiinirahka/-vanukas käy. Kasviksia voi lisätä vapaasti.",
    mealTag: "breakfast",
    ...singleServe,
    ingredients: [
      ingredient("Skyr", 150, "g", { groupLabel: "Skyr-kulho", alternatives: ["Vähärasvainen proteiinirahka", "Proteiinivanukas"] }),
      ingredient("Muromysli", 20, "g", { groupLabel: "Skyr-kulho" }),
      ingredient("Ruisleipä", 2, "pcs", { groupLabel: "Leivät" }),
      ingredient("Margariini alle 50% rasvaa", 10, "g", { groupLabel: "Leivät" }),
      ingredient("Kalkkunaleike 3% rasvaa", 40, "g", { groupLabel: "Leivät", displayQuantity: "3", displayUnit: "viipaletta" }),
    ],
    instructions: [
      "Kokoa ruispalat margariinilla ja kalkkunaleikkeellä.",
      "Lisää skyr kulhoon ja ripottele mysli päälle.",
      "Tarjoile halutessasi kasvisten kanssa.",
    ],
  }),
  recipe({
    name: "Chia-vanukas mustikoilla",
    description: "Vaniljainen aamupala chiasta, rahkasta ja mustikoista.",
    mealTag: "breakfast",
    ...singleServe,
    ingredients: [
      ingredient("High protein pudding vanilja", 200, "g", { groupLabel: "Vanukas", alternatives: ["Profeel proteiinivanukas (189 g)"] }),
      ingredient("Maitorahka 0,2%", 100, "g", { groupLabel: "Vanukas" }),
      ingredient("Chian siemenet", 20, "g", { groupLabel: "Vanukas" }),
      ingredient("Mustikka", 100, "g", { groupLabel: "Päälle" }),
      ingredient("Kiivi", 1, "pcs", { groupLabel: "Päälle", displayQuantity: "1", displayUnit: "kpl", alternatives: ["Vapaavalintainen hedelmä"] }),
    ],
    instructions: [
      "Sekoita keskenään pudding, maitorahka ja chian siemenet.",
      "Anna tekeytyä jääkaapissa vähintään 30 minuuttia tai yön yli.",
      "Lisää päälle mustikat ja nauti kiivi tai vapaavalintainen hedelmä lisukkeena.",
    ],
  }),

  // ===== LOUNAS (~550 kcal / annos) =====
  recipe({
    name: "Kana ja riisi",
    description: "Legendaarinen kana ja riisi. Mikä tahansa riisi (basmati, jasmiini, täysjyvä) toimii.",
    mealTag: "lunch",
    ...batchServe,
    ingredients: [
      ingredient("Kanan rintafilee", 600, "g", { groupLabel: "Pääosa" }),
      ingredient("Basmatiriisi", 200, "g", { groupLabel: "Lisuke", alternatives: ["Muu riisi"] }),
      ingredient("Oliiviöljy", 60, "g", { groupLabel: "Lisuke" }),
      ingredient("Sekalaiset kasvikset", 600, "g", { groupLabel: "Lisuke" }),
    ],
    instructions: [
      "Keitä riisi pakkauksen ohjeen mukaan.",
      "Paista kanan rintafileet kypsiksi ja mausta haluamallasi tavalla.",
      "Lisää riisin sekaan oliiviöljyä.",
      "Tarjoile kanan ja vapaasti valittavien kasvisten kanssa (esim. parsakaali, kurkku, tomaatti, paprika, sipuli).",
    ],
  }),
  recipe({
    name: "Kanatortillat",
    description: "Fajita-tyylinen lounas, johon voi lisätä reilusti kasviksia.",
    mealTag: "lunch",
    ...batchServe,
    ingredients: [
      ingredient("Tortilla original large", 4, "pcs", { groupLabel: "Tortillat" }),
      ingredient("Kanan rintafilee", 600, "g", { groupLabel: "Täyte" }),
      gentleIngredient("Fajita mausteseos", 40, "g", { groupLabel: "Täyte", ingredientRole: "spice" }),
      ingredient("Juustoraaste 12%", 120, "g", { groupLabel: "Täyte" }),
      ingredient("Salsa", 120, "g", { groupLabel: "Täyte", alternatives: ["Santa Maria Chunky Salsa"] }),
      ingredient("Jäävuorisalaatti", 120, "g", { groupLabel: "Täyte" }),
      ingredient("Punainen paprika", 240, "g", { groupLabel: "Täyte", displayQuantity: "2", displayUnit: "kpl" }),
      ingredient("Kurkku", 120, "g", { groupLabel: "Täyte", displayQuantity: "1", displayUnit: "kpl" }),
      ingredient("Sipuli", 120, "g", { groupLabel: "Täyte", displayQuantity: "1", displayUnit: "kpl" }),
    ],
    instructions: [
      "Suikaloi kana, mausta fajita-mausteella ja paista kypsäksi.",
      "Halutessasi paista myös sipuli ja paprika kanan kanssa.",
      "Lämmitä tortillat ja kokoa niihin kana, kasvikset, juustoraaste ja salsa.",
      "Rullaa tortillat tiiviiksi ja tarjoile heti. Kasviksia ei tarvitse punnita.",
    ],
  }),
  recipe({
    name: "Makaronilaatikko",
    description: "Arjen klassikko kevyemmillä maitotuotteilla ja enintään 10 % jauhelihalla.",
    mealTag: "lunch",
    ...batchServe,
    ingredients: [
      ingredient("Naudan jauheliha 10%", 400, "g", { groupLabel: "Laatikko" }),
      ingredient("Makaroni", 200, "g", { groupLabel: "Laatikko" }),
      ingredient("Sipuli", 80, "g", { groupLabel: "Laatikko" }),
      ingredient("Ketsuppi vähemmän suolaa ja sokeria", 120, "g", { groupLabel: "Laatikko" }),
      ingredient("Tuorejuusto 11%", 80, "g", { groupLabel: "Laatikko" }),
      ingredient("Kananmuna", 2, "pcs", { groupLabel: "Munamaito" }),
      ingredient("Rasvaton maito", 360, "ml", { groupLabel: "Munamaito" }),
      ingredient("Juustoraaste 12%", 120, "g", { groupLabel: "Päälle", alternatives: ["Raejuusto 1,5% (392 g)"] }),
    ],
    instructions: [
      "Paista jauheliha ja sipuli, mausta haluamillasi mausteilla (esim. jauhelihamauste tai suola & pippuri) ja sekoita joukkoon tuorejuusto.",
      "Tee munamaito kananmunista ja maidosta.",
      "Kaada vuokaan jauhelihaseos, raaka makaroni ja munamaito niin, että neste peittää seoksen.",
      "Ripottele päälle juustoraaste ja paista 200 asteessa noin 30 minuuttia.",
      "Tarjoile ketsupin, vihannesten ja halutessasi raejuuston kanssa.",
    ],
  }),
  recipe({
    name: "Pesto-pasta kanalla",
    description: "Helppo pastaruoka vihreällä tai punaisella pestolla.",
    mealTag: "lunch",
    ...batchServe,
    ingredients: [
      ingredient("Pasta", 280, "g"),
      ingredient("Kanan rintafilee", 520, "g"),
      ingredient("Pesto", 160, "g", { alternatives: ["Vihreä pesto", "Punainen pesto"] }),
      ingredient("Kirsikkatomaatti", 240, "g", { displayQuantity: "4", displayUnit: "kourallista" }),
    ],
    instructions: [
      "Keitä pasta pakkauksen ohjeen mukaan ja anna jäähtyä jääkaapissa.",
      "Paista kana kypsäksi, suolaa ja pippuroi, ja kuutioi.",
      "Puolita kirsikkatomaatit.",
      "Sekoita pasta, pesto, kana ja tomaatit keskenään juuri ennen tarjoilua.",
    ],
  }),
  recipe({
    name: "Kanapyörykät ja riisi",
    description: "Helppo valmispyörykkä-lounas riisillä, ananaksella ja kevyt sweet chili -kastikkeella. Sweet chili ei ole pakollinen.",
    mealTag: "lunch",
    ...batchServe,
    ingredients: [
      ingredient("Risella valmisriisi", 400, "g", { groupLabel: "Lisuke", alternatives: ["Muu riisi"] }),
      ingredient("Kot&go kanafileepyörykät", 600, "g", { groupLabel: "Pääosa", displayQuantity: "2", displayUnit: "pkt" }),
      ingredient("Sweet chili -kastike vähemmän sokeria", 200, "g", { groupLabel: "Pääosa" }),
      ingredient("Ananas", 400, "g", { groupLabel: "Pääosa" }),
    ],
    instructions: [
      "Lämmitä valmisriisi pakkauksen ohjeen mukaan.",
      "Kypsennä kanafileepyörykät pakkauksen ohjeen mukaan.",
      "Lämmitä ananas kevyesti pannulla ja lisää joukkoon sweet chili -kastike.",
      "Tarjoile pyörykät riisin ja ananasseoksen kanssa.",
    ],
  }),
  recipe({
    name: "Nakkikastike perunoilla",
    description: "Kotiruokaa kevyemmällä kalkkunanakilla ja paksulla kermakastikkeella.",
    mealTag: "lunch",
    ...batchServe,
    ingredients: [
      ingredient("Kalkkunanakki kevyt 5%", 560, "g", { groupLabel: "Kastike" }),
      ingredient("Ruokakerma kevyt ja paksu 4%", 480, "ml", { groupLabel: "Kastike" }),
      ingredient("Sipuli", 160, "g", { groupLabel: "Kastike" }),
      ingredient("Sinappi", 60, "g", { groupLabel: "Kastike" }),
      ingredient("Ketsuppi vähemmän suolaa ja sokeria", 60, "g", { groupLabel: "Kastike" }),
      textIngredient("Lihaliemikuutio", "1–2", "kpl", { groupLabel: "Kastike" }),
      ingredient("Peruna", 800, "g", { groupLabel: "Lisuke", alternatives: ["Perunamuussi"] }),
      ingredient("Sekalaiset kasvikset", 800, "g", { groupLabel: "Lisuke" }),
      ingredient("Raejuusto", 300, "g", { groupLabel: "Lisäksi" }),
    ],
    instructions: [
      "Paloittele nakit ja pilko sipuli silpuksi. Ruskista seos pannulla (tilkka vettä estää palamisen).",
      "Lisää ruokakerma, sinappi, ketsuppi ja lihaliemikuutio, ja kuumenna koko seos. Mausta halutessasi muilla mausteilla.",
      "Keitä perunat ja pilko sivusalaatti.",
      "Tarjoile keitettyjen perunoiden, vihersalaatin ja raejuuston kanssa.",
    ],
  }),
  recipe({
    name: "Crispy chicken -salaatti",
    description: "Raikas kana-riisisalaatti rapeaksi maustetulla kanalla. Kasviksia voi käyttää vapaasti, eikä maissi ole pakollinen.",
    mealTag: "lunch",
    ...batchServe,
    ingredients: [
      textIngredient("Mausteseos", "2", "rkl", { groupLabel: "Kana" }),
      ingredient("Kanan rintafilee", 560, "g", { groupLabel: "Kana" }),
      ingredient("Oliiviöljy", 40, "g", { groupLabel: "Kana" }),
      ingredient("Jasmiiniriisi, kuiva", 160, "g", { groupLabel: "Lisuke" }),
      ingredient("Apetina juustokuutiot 10%", 160, "g", { groupLabel: "Salaatti" }),
      ingredient("Maissi", 120, "g", { groupLabel: "Salaatti" }),
      ingredient("Jäävuorisalaatti", 120, "g", { groupLabel: "Salaatti", displayQuantity: "4", displayUnit: "kourallista" }),
      ingredient("Kirsikkatomaatti", 120, "g", { groupLabel: "Salaatti", displayQuantity: "4", displayUnit: "kourallista" }),
      ingredient("Kurkku", 120, "g", { groupLabel: "Salaatti", displayQuantity: "4", displayUnit: "kourallista" }),
    ],
    instructions: [
      "Lisää kana kulhoon paloiteltuna. Sekoita joukkoon puolet öljystä ja mausteseos.",
      "Paista kana pannulla tai airfryerissä kypsäksi.",
      "Huuhtele riisi ennen keittämistä ja keitä se pakkauksen ohjeen mukaan.",
      "Kokoa riisi, kana, juustokuutiot ja vihannekset kulhoon, ja tarjoile.",
    ],
  }),
  recipe({
    name: "VHH-ateria",
    description: "Vähähiilihydraattinen kevyt lounas/päivällinen, kun haluat karsia kaloreita päivältä. Vapaavalintaisia kasviksia vähintään puoli lautasellista.",
    mealTag: "lunch",
    ...batchServe,
    ingredients: [
      ingredient("Naudan jauheliha 10%", 520, "g", { groupLabel: "Pääosa", alternatives: ["Kanan jauheliha (800 g)", "Kanan fileesuikale (760 g)", "Lohi (508 g)"] }),
      ingredient("Raejuusto", 400, "g", { groupLabel: "Lisäksi" }),
      ingredient("Parsakaali", 800, "g", { groupLabel: "Lisäksi" }),
      ingredient("Kirsikkatomaatti", 120, "g", { groupLabel: "Lisäksi", displayQuantity: "4", displayUnit: "kourallista" }),
    ],
    instructions: [
      "Ruskista jauheliha pannulla ja mausta oman maun mukaan.",
      "Keitä tai höyrytä parsakaali kypsäksi.",
      "Kokoa annos jauhelihasta, raejuustosta, parsakaalista ja kirsikkatomaateista. Lisää vapaasti kasviksia.",
    ],
  }),

  // ===== ILTAPÄIVÄN VÄLIPALA (~308 kcal / annos) =====
  recipe({
    name: "Helppo ja nopea rahkasetti",
    description: "Nopea rahkasetti marjoilla ja pähkinöillä. Marjat ja pähkinät voi vaihtaa vapaasti, hunaja ei ole pakollinen.",
    mealTag: "snack",
    ...singleServe,
    ingredients: [
      ingredient("Maitorahka 0,2%", 250, "g", { alternatives: ["Muu noin 150 kcal maitorahka"] }),
      ingredient("Mustikka", 75, "g", { alternatives: ["Muut marjat"] }),
      ingredient("Saksanpähkinä", 15, "g", { alternatives: ["Muut suolaamattomat pähkinät", "Maapähkinävoi 99%"] }),
      ingredient("Sokeroimaton mehukeitto", 50, "ml"),
      ingredient("Hunaja", 5, "g"),
    ],
    instructions: [
      "Annostele rahka kulhoon.",
      "Lisää päälle marjat, pähkinät ja halutessasi hunaja sekä sokeroimaton mehukeitto.",
    ],
  }),
  recipe({
    name: "Proteiinirahka, hedelmä ja pähkinät",
    description: "Helppo välipala. Rahkan voi vaihtaa mihin tahansa n. 20 g proteiinia ja 150 kcal sisältävään proteiinirahkaan, maitorahkaan tai proteiinivanukkaaseen, ja hedelmän oman maun mukaan.",
    mealTag: "snack",
    ...singleServe,
    ingredients: [
      ingredient("Proteiinirahka maustamaton", 200, "g", { alternatives: ["Maitorahka 0,2%", "Proteiinivanukas"] }),
      ingredient("Omena", 1, "pcs", { displayQuantity: "1", displayUnit: "kpl", alternatives: ["Mandariini", "Kiivi", "Persikka"] }),
      ingredient("Cashewpähkinät suolattomat", 12, "g", { alternatives: ["Saksanpähkinä", "Mantelit"] }),
    ],
    instructions: [
      "Syö proteiinirahka sellaisenaan.",
      "Nauti lisäksi hedelmä ja pähkinät.",
    ],
  }),
  recipe({
    name: "Proteiinivanukas mansikoilla",
    description: "Helppo välipala, jossa on marjoja ja pieni määrä pähkinöitä.",
    mealTag: "snack",
    ...singleServe,
    ingredients: [
      ingredient("Profeel proteiinimousse suklaa", 180, "g", { alternatives: ["Proteiinivanukas", "Vähärasvainen proteiinirahka", "Maitorahka 0,2%"] }),
      ingredient("Mansikka", 70, "g", { alternatives: ["Muut marjat"] }),
      ingredient("Cashewpähkinät suolattomat", 18, "g", { alternatives: ["Muut suolaamattomat pähkinät"] }),
    ],
    instructions: [
      "Kaada proteiinivanukas kulhoon.",
      "Viipaloi sekaan marjoja ja lisää pähkinät tai syö ne erikseen.",
    ],
  }),
  recipe({
    name: "Proteiinijauhe, hedelmä ja pähkinät",
    description: "Nopea välipala, jossa hedelmän voi vaihtaa oman maun mukaan.",
    mealTag: "snack",
    ...singleServe,
    ingredients: [
      ingredient("Heraproteiinijauhe", 35, "g", { alternatives: ["Muu heraproteiini"] }),
      ingredient("Banaani", 1, "pcs", { displayQuantity: "1", displayUnit: "kpl", alternatives: ["Iso omena", "Iso päärynä", "Kaksi pientä hedelmää"] }),
      ingredient("Cashewpähkinät suolattomat", 10, "g", { alternatives: ["Muut suolaamattomat pähkinät"] }),
    ],
    instructions: [
      "Sekoita heraproteiinijauhe veteen tai maitoon.",
      "Syö banaani (tai muu hedelmä) ja pähkinät juoman kanssa.",
    ],
  }),
  recipe({
    name: "Maissikakut ja proteiinirahka",
    description: "Kevyt välipala maissikakuilla, kalkkunalla ja proteiinirahkalla.",
    mealTag: "snack",
    ...singleServe,
    ingredients: [
      ingredient("Maissikakku chian siemeniä ja suolaa Friggs", 4, "pcs", { groupLabel: "Maissikakut" }),
      ingredient("Kalkkunaviipaleet", 20, "g", { groupLabel: "Maissikakut" }),
      ingredient("Profeel proteiinirahka", 180, "g", { groupLabel: "Lisäksi", alternatives: ["Vähärasvainen proteiinirahka", "Proteiinivanukas"] }),
      ingredient("Kiivi", 1, "pcs", { groupLabel: "Lisäksi", displayQuantity: "1", displayUnit: "kpl" }),
    ],
    instructions: [
      "Kokoa maissikakut kalkkunaviipaleilla.",
      "Nauti proteiinirahka ja kiivi rinnalla. Lisää halutessasi kasviksia.",
    ],
  }),
  recipe({
    name: "Skyr-juoma, banaani ja pähkinät",
    description: "Toimiva välipala liikkeellä ollessa. Pähkinät voi vaihtaa vapaasti tai korvata samalla määrällä 70 % tummaa suklaata.",
    mealTag: "snack",
    ...singleServe,
    ingredients: [
      ingredient("Skyrdrik", 200, "ml"),
      ingredient("Banaani", 1, "pcs", { displayQuantity: "1", displayUnit: "kpl" }),
      ingredient("Cashewpähkinät suolattomat", 17, "g", { alternatives: ["Muut suolaamattomat pähkinät", "Tumma suklaa 70%"] }),
    ],
    instructions: [
      "Nauti skyr-juoma kylmänä.",
      "Syö banaani ja pähkinät juoman kanssa.",
    ],
  }),
  recipe({
    name: "Ruisleipää vuolukanalla",
    description: "Suolainen välipala ruispaloilla ja kasviksilla.",
    mealTag: "snack",
    ...singleServe,
    ingredients: [
      ingredient("Ruisleipä", 2, "pcs", { groupLabel: "Leivät" }),
      ingredient("Margariini alle 50% rasvaa", 12, "g", { groupLabel: "Leivät" }),
      ingredient("Aamupala Kevyenraikas 5% sulatejuustoviipale", 20, "g", { groupLabel: "Leivät" }),
      ingredient("Vuolu kanafilee", 50, "g", { groupLabel: "Leivät", alternatives: ["Kalkkunaleike 3% rasvaa"] }),
      ingredient("Tomaatti", 20, "g", { groupLabel: "Leivät" }),
      ingredient("Kurkku", 20, "g", { groupLabel: "Leivät" }),
    ],
    instructions: [
      "Paahda leivät halutessasi ja levitä margariini.",
      "Lisää sulatejuustoviipale ja vuolukana (tai kalkkunaleike).",
      "Viimeistele tomaatilla ja kurkulla.",
    ],
  }),

  // ===== ILLALLINEN (~550 kcal / annos) =====
  recipe({
    name: "Mac and cheese kanalla",
    description: "Ruokaisa treeni-illallinen, jossa on runsaasti proteiinia ja hiilihydraattia.",
    mealTag: "dinner",
    ...batchServe,
    ingredients: [
      ingredient("Kanan rintafilee", 700, "g", { groupLabel: "Kana" }),
      gentleIngredient("Suola", 4, "g", { groupLabel: "Kana", ingredientRole: "spice" }),
      gentleIngredient("Paprikamauste", 4, "g", { groupLabel: "Kana", ingredientRole: "spice" }),
      gentleIngredient("Valkosipulijauhe", 4, "g", { groupLabel: "Kana", ingredientRole: "spice" }),
      gentleIngredient("Chilijauhe", 2, "g", { groupLabel: "Kana", ingredientRole: "spice" }),
      gentleIngredient("Oregano", 2, "g", { groupLabel: "Kana", ingredientRole: "spice" }),
      ingredient("Hunaja", 25, "g", { groupLabel: "Kana" }),
      ingredient("BBQ-kastike ilman lisättyä sokeria", 85, "g", { groupLabel: "Kana" }),
      ingredient("Makaroni", 300, "g", { groupLabel: "Mac and cheese" }),
      ingredient("Rasvaton maito", 300, "ml", { groupLabel: "Mac and cheese" }),
      ingredient("Philadelphia Light 11%", 80, "g", { groupLabel: "Mac and cheese" }),
      ingredient("Juustoraaste 12%", 100, "g", { groupLabel: "Mac and cheese" }),
      ingredient("Knorr kana-annosfondi", 28, "g", { groupLabel: "Mac and cheese" }),
      ingredient("Oliiviöljy", 5, "g", { groupLabel: "Kana" }),
    ],
    instructions: [
      "Mausta kana suolalla, paprikalla, valkosipulijauheella, chilillä ja oreganolla.",
      "Paista kana öljyssä kypsäksi, lisää loppuvaiheessa hunaja ja BBQ-kastike ja siirrä sivuun.",
      "Keitä makaroni pakkauksen ohjeen mukaan.",
      "Lämmitä maito kattilassa ja sekoita joukkoon tuorejuusto, juustoraaste ja kanafondi tasaiseksi juustokastikkeeksi.",
      "Sekoita makaroni juustokastikkeeseen ja annostele BBQ-hunajakana päälle tai rinnalle.",
    ],
  }),
  recipe({
    name: "Spaghetti ja jauhelihakastike",
    description: "Arjen klassikko kevyellä jauhelihalla ja tomaattikastikkeella.",
    mealTag: "dinner",
    ...batchServe,
    ingredients: [
      ingredient("Naudan jauheliha 10%", 400, "g", { groupLabel: "Kastike" }),
      ingredient("Tomaattikastike", 400, "g", { groupLabel: "Kastike" }),
      ingredient("Spagetti", 280, "g", { groupLabel: "Lisuke" }),
      ingredient("Sekalaiset kasvikset", 600, "g", { groupLabel: "Lisuke" }),
    ],
    instructions: [
      "Paista jauheliha sen omassa rasvassa kypsäksi ja mausta oman maun mukaan.",
      "Keitä spagetti pakkauksen ohjeen mukaan.",
      "Lisää tomaattikastike lähes kypsän jauhelihan sekaan ja anna hautua hetki.",
      "Tarjoile spagetti jauhelihakastikkeen kanssa. Lisää halutessasi kasviksia.",
    ],
  }),
  recipe({
    name: "Uunilohi ja maalaislohkoperunat",
    description: "Uunilohi kypsyy samalla pellillä maalaislohkoperunoiden kanssa. Seuraksi höyrytettyä tai keitettyä parsakaalia.",
    mealTag: "dinner",
    ...batchServe,
    ingredients: [
      ingredient("Lohifilee", 400, "g", { groupLabel: "Lohi" }),
      textIngredient("Suola", "ripaus", "", { groupLabel: "Lohi" }),
      textIngredient("Cayennepippuri", "ripaus", "", { groupLabel: "Lohi" }),
      textIngredient("Tilli", "ripaus", "", { groupLabel: "Lohi" }),
      textIngredient("Sitruuna", "muutama", "lohko", { groupLabel: "Lohi" }),
      ingredient("Peruna", 1200, "g", { groupLabel: "Perunat" }),
      ingredient("Rypsiöljy", 20, "g", { groupLabel: "Perunat", alternatives: ["Oliiviöljy (20 g)"] }),
      ingredient("Valkosipuli", 18, "g", { groupLabel: "Perunat", displayQuantity: "6", displayUnit: "kynttä" }),
      ingredient("Parsakaali", 600, "g", { groupLabel: "Lisäksi" }),
    ],
    instructions: [
      "Aseta lohifileet nahkapuoli alaspäin leivinpaperilla vuoratulle uunipellille ja poista ruodot tarvittaessa.",
      "Ripottele lohelle suola, cayennepippuri ja tilli.",
      "Pese ja leikkaa perunat kuorineen lohkoiksi.",
      "Sekoita perunoiden joukkoon öljy, hienonnettu valkosipuli, suola ja cayennepippuri.",
      "Laita perunat samalle pellille lohen viereen (tai keitä perunat erikseen).",
      "Kypsennä 175 asteessa uunin alaosassa noin 35 minuuttia, kunnes lohi on kypsä ja perunat kullanruskeita.",
      "Tarjoile lohkoperunoiden, sitruunalohkojen ja höyrytetyn tai keitetyn parsakaalin kanssa.",
    ],
  }),
  recipe({
    name: "Tulinen kanapasta",
    description: "Täyteläinen tomaatti-kermapasta kanalla ja kevyellä tuorejuustolla. Ohjevideo löytyy myös FitBenyn somesta.",
    mealTag: "dinner",
    ...batchServe,
    ingredients: [
      textIngredient("Ruoanlaittosuihke", "muutama", "suihkaus", { groupLabel: "Kana" }),
      ingredient("Kanan rintafilee", 560, "g", { groupLabel: "Kana" }),
      gentleIngredient("Cayennepippuri", 4, "g", { groupLabel: "Kana", ingredientRole: "spice" }),
      gentleIngredient("Suola", 4, "g", { groupLabel: "Kana", ingredientRole: "spice" }),
      gentleIngredient("Mustapippuri", 4, "g", { groupLabel: "Kana", ingredientRole: "spice" }),
      gentleIngredient("Valkosipulijauhe", 4, "g", { groupLabel: "Kana", ingredientRole: "spice" }),
      gentleIngredient("Sipulijauhe", 4, "g", { groupLabel: "Kana", ingredientRole: "spice" }),
      ingredient("Pasta", 280, "g", { groupLabel: "Pasta" }),
      ingredient("Voi suolaamaton", 8, "g", { groupLabel: "Kastike" }),
      ingredient("Valkosipuli", 12, "g", { groupLabel: "Kastike" }),
      gentleIngredient("Chilihiutaleet", 4, "g", { groupLabel: "Kastike", ingredientRole: "spice" }),
      ingredient("Ruokakerma kevyt ja paksu 4%", 200, "ml", { groupLabel: "Kastike" }),
      ingredient("Tomaattimurska", 80, "g", { groupLabel: "Kastike" }),
      ingredient("Tuorejuusto 11%", 80, "g", { groupLabel: "Kastike" }),
      fixedIngredient("Kanaliemikuutio", 10, "g", { groupLabel: "Kastike", ingredientRole: "spice" }),
      ingredient("Vesi", 200, "ml", { groupLabel: "Kastike" }),
      ingredient("Parmesaani", 40, "g", { groupLabel: "Päälle" }),
      gentleIngredient("Paprikamauste", 4, "g", { groupLabel: "Päälle", ingredientRole: "spice" }),
    ],
    instructions: [
      "Pilko kana kuutioiksi ja mausta suolalla, pippurilla, valkosipulijauheella, sipulijauheella ja cayennepippurilla.",
      "Keitä pasta suolatussa vedessä ja ota talteen hieman pastavettä.",
      "Paista kana kypsäksi ruoanlaittosuihkeella voidellulla kuumalla pannulla ja aseta sivuun.",
      "Kuullota valkosipuli ja chilihiutaleet voissa.",
      "Lisää ruokakerma, tomaattimurska, tuorejuusto, murskattu kanaliemikuutio ja pastavettä. Anna porista matalalla lämmöllä noin 10 min.",
      "Sekoita kastike, pasta ja kana, ja viimeistele parmesaanilla sekä paprikamausteella.",
    ],
  }),
  recipe({
    name: "Makkaraperunat",
    description: "Nopea iltaruoka kalkkunanakilla, ranskalaisilla, raejuustolla ja kermaviilidipillä.",
    mealTag: "dinner",
    ...batchServe,
    ingredients: [
      ingredient("Kalkkunanakki kevyt 5%", 720, "g", { groupLabel: "Pääosa" }),
      ingredient("Ranskalaiset", 800, "g", { groupLabel: "Pääosa" }),
      ingredient("Raejuusto", 320, "g", { groupLabel: "Lisäksi" }),
      ingredient("Ketsuppi vähemmän suolaa ja sokeria", 120, "g", { groupLabel: "Lisäksi" }),
      ingredient("Kermaviili 6%", 200, "g", { groupLabel: "Dippi" }),
      textIngredient("Taffel American Dippi", "1", "pussi", { groupLabel: "Dippi" }),
    ],
    instructions: [
      "Kypsennä ranskalaiset uunissa tai airfryerissä pakkauksen ohjeen mukaan.",
      "Lisää kalkkunanakit paistumaan, kun paistoaikaa on noin 5 min jäljellä.",
      "Sekoita Taffel American Dippi -jauhe kermaviiliin ja mausta makkaraperunat ranskanperunamaustesuolalla.",
      "Tarjoile makkaraperunat raejuuston, ketsupin ja kermaviilidipin kanssa.",
    ],
  }),
  recipe({
    name: "Uunifeta kanapasta",
    description: "Uunissa kypsyvä kreikkalainen feta-kanapasta kirsikkatomaateilla.",
    mealTag: "dinner",
    ...batchServe,
    ingredients: [
      ingredient("Pasta", 240, "g", { groupLabel: "Pasta" }),
      ingredient("Kanan rintafilee", 600, "g", { groupLabel: "Uunivuoka" }),
      ingredient("Fetajuusto 22%", 160, "g", { groupLabel: "Uunivuoka" }),
      ingredient("Punasipuli", 120, "g", { groupLabel: "Uunivuoka" }),
      ingredient("Kirsikkatomaatti", 300, "g", { groupLabel: "Uunivuoka" }),
      ingredient("Oliiviöljy", 20, "g", { groupLabel: "Uunivuoka" }),
      gentleIngredient("Mustapippuri", 2, "g", { groupLabel: "Uunivuoka", ingredientRole: "spice" }),
      ingredient("Valkosipuli", 12, "g", { groupLabel: "Uunivuoka" }),
      ingredient("Basilika", 10, "g", { groupLabel: "Päälle" }),
    ],
    instructions: [
      "Aseta salaattijuustopala vuoan keskelle ja lisää ympärille kirsikkatomaatit ja viipaloidut punasipulit. Pirskottele päälle öljy ja mausteet.",
      "Paista 200 asteessa (kiertoilma) noin 25–30 minuuttia.",
      "Keitä sillä välin pasta pakkauksen ohjeen mukaan ja paista kanat erikseen kypsäksi.",
      "Kaada pasta ja kanat vuokaan ja sekoita hyvin, jotta feta sulaa kastikkeeksi.",
      "Viimeistele tuoreella basilikalla.",
    ],
  }),
  recipe({
    name: "Bataatti-jauheliha bowl",
    description: "Mausteinen bowl bataatista, jauhelihasta ja jogurttikastikkeesta.",
    mealTag: "dinner",
    ...batchServe,
    ingredients: [
      ingredient("Bataatti", 800, "g", { groupLabel: "Bataatti" }),
      ingredient("Sipuli", 120, "g", { groupLabel: "Lihaseos" }),
      ingredient("Naudan jauheliha 10%", 520, "g", { groupLabel: "Lihaseos" }),
      gentleIngredient("Cayennepippuri", 4, "g", { groupLabel: "Lihaseos", ingredientRole: "spice" }),
      gentleIngredient("Suola", 4, "g", { groupLabel: "Lihaseos", ingredientRole: "spice" }),
      gentleIngredient("Paprikamauste", 8, "g", { groupLabel: "Lihaseos", ingredientRole: "spice" }),
      gentleIngredient("Juustokumina", 8, "g", { groupLabel: "Lihaseos", ingredientRole: "spice" }),
      ingredient("Valkosipuli", 12, "g", { groupLabel: "Lihaseos" }),
      ingredient("Tomaattipyree", 40, "g", { groupLabel: "Lihaseos" }),
      ingredient("Juustoraaste 12%", 80, "g", { groupLabel: "Lihaseos" }),
      ingredient("Kreikkalainen jogurtti 0%", 160, "g", { groupLabel: "Kastike" }),
      ingredient("Oliiviöljy", 4, "g", { groupLabel: "Kastike" }),
      gentleIngredient("Valkosipulijauhe", 2, "g", { groupLabel: "Kastike", ingredientRole: "spice" }),
      gentleIngredient("Sipulijauhe", 2, "g", { groupLabel: "Kastike", ingredientRole: "spice" }),
      ingredient("Dijon sinappi", 12, "g", { groupLabel: "Kastike" }),
    ],
    instructions: [
      "Kuori ja kuutioi bataatit, suihkauta päälle hieman oliiviöljyä, mausta suolalla ja paahda kiertoilmauunissa 200 asteessa noin 30 minuuttia.",
      "Pilko ja kuullota sipuli pannulla, lisää jauheliha ja mausta cayennepippurilla, paprikamausteella, juustokuminalla ja suolalla. Ruskista.",
      "Lisää jauhelihaan valkosipuli, tomaattipyree ja juustoraaste. Sekoita ja hauduta kannen alla matalalla lämmöllä noin 5 min.",
      "Sekoita kastike kreikkalaisesta jogurtista, öljystä, valkosipulijauheesta, sipulijauheesta ja sinapista.",
      "Kokoa annokset bataatista, lihaseoksesta ja kastikkeesta.",
    ],
  }),
  recipe({
    name: "Sticky Korean fried chicken",
    description: "Makean tulinen kanaruoka gochujangilla ja basmatiriisillä. Sopii hyvin kimchin tai maustekurkkujen kanssa.",
    mealTag: "dinner",
    ...batchServe,
    ingredients: [
      ingredient("Voi suolaamaton", 20, "g", { groupLabel: "Kana" }),
      ingredient("Kanan rintafilee", 760, "g", { groupLabel: "Kana" }),
      gentleIngredient("Valkosipulijauhe", 4, "g", { groupLabel: "Kana", ingredientRole: "spice" }),
      gentleIngredient("Mustapippuri", 3, "g", { groupLabel: "Kana", ingredientRole: "spice" }),
      gentleIngredient("Paprikamauste", 4, "g", { groupLabel: "Kana", ingredientRole: "spice" }),
      gentleIngredient("Suola", 3, "g", { groupLabel: "Kana", ingredientRole: "spice" }),
      ingredient("Maissitärkkelys", 36, "g", { groupLabel: "Kana", alternatives: ["Jätä pois"] }),
      ingredient("Hunaja", 28, "g", { groupLabel: "Kastike" }),
      ingredient("Gochujang pippuritahna", 48, "g", { groupLabel: "Kastike", alternatives: ["Sriracha"] }),
      ingredient("Soijakastike", 40, "ml", { groupLabel: "Kastike" }),
      ingredient("Vesi", 80, "ml", { groupLabel: "Kastike" }),
      ingredient("Basmatiriisi", 280, "g", { groupLabel: "Lisuke" }),
    ],
    instructions: [
      "Keitä riisi pakkauksen ohjeen mukaan.",
      "Viipaloi kana suikaleiksi tai kuutioiksi.",
      "Mausta kana valkosipulijauheella, mustapippurilla, paprikamausteella ja suolalla, ja sekoita joukkoon maissitärkkelys (ei pakollinen, mutta parantaa koostumusta).",
      "Paista kana voissa kypsäksi kuumalla pannulla.",
      "Kaada pannulle soijakastike ja vesi, lisää hunaja ja gochujang. Sekoita, kunnes kastike sakeutuu.",
      "Lisää kana kastikkeeseen ja sekoita hyvin. Tarjoile riisin ja kasvisten kanssa.",
    ],
  }),
  recipe({
    name: "Udon-nuudelikeitto",
    description: "Lämmin nuudelikeitto katkaravuilla, kananmunalla ja misopohjalla.",
    mealTag: "dinner",
    ...batchServe,
    ingredients: [
      ingredient("Oliiviöljy", 20, "g", { groupLabel: "Liemi" }),
      ingredient("Valkosipuli", 24, "g", { groupLabel: "Liemi", displayQuantity: "8", displayUnit: "kynttä" }),
      ingredient("Chili", 32, "g", { groupLabel: "Liemi", displayQuantity: "4", displayUnit: "kpl" }),
      ingredient("Saitaku misokeitto", 4, "pcs", { groupLabel: "Liemi" }),
      ingredient("Soijakastike", 36, "ml", { groupLabel: "Liemi" }),
      ingredient("Katkarapu", 560, "g", { groupLabel: "Keitto" }),
      ingredient("Udon-nuudeli", 240, "g", { groupLabel: "Keitto" }),
      ingredient("Maapähkinät", 36, "g", { groupLabel: "Päälle" }),
      ingredient("Kananmuna", 4, "pcs", { groupLabel: "Päälle" }),
      ingredient("Seesaminsiemenet", 20, "g", { groupLabel: "Päälle" }),
      ingredient("Kevätsipuli", 36, "g", { groupLabel: "Päälle" }),
      ingredient("Korianteri", 36, "g", { groupLabel: "Päälle" }),
    ],
    instructions: [
      "Kuumenna tilkka öljyä pannulla ja paista valkosipuli, chili ja katkaravut (paista, kunnes neste on haihtunut).",
      "Kaada syvään lautaseen misokeittopussi ja soijakastiketta.",
      "Keitä udon-nuudelit pakkauksen ohjeen mukaan ja kaada lautaselle. Lisää keitinvettä oman maun mukaan. Keitä kananmunat erikseen.",
      "Viimeistele paistetuilla katkaravuilla, maapähkinöillä, korianterilla, seesaminsiemenillä, kevätsipulilla ja keitetyllä kananmunalla.",
    ],
  }),

  // ===== ILTAPALA (~396 kcal / annos) =====
  recipe({
    name: "Kalkkunajuustovoileipä",
    description: "Helppo iltapalaleipä kalkkunalla, juustolla ja kasviksilla. Mikä tahansa n. 70–75 kcal/viipale leipä käy.",
    mealTag: "evening_snack",
    ...singleServe,
    ingredients: [
      ingredient("100% kauraleipä", 3, "pcs"),
      ingredient("Margariini alle 50% rasvaa", 15, "g", { alternatives: ["Tuorejuusto 11% (36 g)"] }),
      ingredient("Kalkkunaviipaleet", 30, "g"),
      ingredient("Juusto alle 10%", 30, "g", { alternatives: ["Aamupala Kevyenraikas 5% sulatejuustoviipale (48 g)"] }),
      ingredient("Kurkku", 50, "g"),
      ingredient("Tomaatti", 80, "g", { displayQuantity: "1", displayUnit: "kpl" }),
    ],
    instructions: [
      "Huuhtele ja viipaloi kasvikset. Paahda leipä halutessasi.",
      "Voitele leivät ja lisää kalkkuna ja juusto.",
      "Viimeistele kurkulla ja tomaatilla.",
    ],
  }),
  recipe({
    name: "Rahkaohukaiset proteiinivanukkaalla",
    description: "Nopea iltapala valmiista rahkaohukaisesta ja proteiinivanukkaasta.",
    mealTag: "evening_snack",
    ...singleServe,
    ingredients: [
      ingredient("Profeel proteiinivanukas", 180, "g", { groupLabel: "Täyte", alternatives: ["Proteiinivanukas", "Vähärasvainen proteiinirahka", "Maitorahka 0,2%"] }),
      ingredient("Atria rahkaohukainen kaakao-vadelma", 130, "g", { groupLabel: "Ohukaiset" }),
    ],
    instructions: [
      "Lämmitä rahkaohukaiset mikrossa tai pannulla.",
      "Lisää päälle proteiinivanukasta ja halutessasi marjoja.",
    ],
  }),
  recipe({
    name: "Suklainen tuorepuuro",
    description: "Yön yli tekeytyvä suklaisa tuorepuuro banaanilla.",
    mealTag: "evening_snack",
    ...singleServe,
    ingredients: [
      ingredient("Kaurahiutale", 40, "g", { groupLabel: "Tuorepuuro" }),
      ingredient("Profeel proteiinivanukas suklaa", 180, "g", { groupLabel: "Tuorepuuro" }),
      ingredient("Chian siemenet", 5, "g", { groupLabel: "Tuorepuuro" }),
      ingredient("Rasvaton maito", 10, "ml", { groupLabel: "Tuorepuuro", alternatives: ["Vähärasvainen kauramaito"] }),
      ingredient("Banaani", 0.5, "pcs", { groupLabel: "Päälle", displayQuantity: "½", displayUnit: "kpl" }),
    ],
    instructions: [
      "Muussaa banaani haarukalla.",
      "Sekoita kulhossa muussattu banaani, suklainen proteiinivanukas, kaurahiutaleet ja chian siemenet.",
      "Anna tekeytyä jääkaapissa yön yli tai vähintään 30 minuuttia.",
      "Ennen nauttimista lisää maito ja sekoita.",
    ],
  }),
  recipe({
    name: "Rahka myslillä ja marjoilla",
    description: "Iltapala, jossa mysliä voi säätää oman energiatavoitteen mukaan. Maapähkinävoin voi vaihtaa suolaamattomiin pähkinöihin.",
    mealTag: "evening_snack",
    ...singleServe,
    ingredients: [
      ingredient("Rahka", 250, "g", { alternatives: ["Vähärasvainen proteiinirahka", "Proteiinivanukas"] }),
      ingredient("Maapähkinävoi 99%", 10, "g", { alternatives: ["Suolaamattomat pähkinät"] }),
      ingredient("Mysli", 35, "g"),
      ingredient("Mustikka", 75, "g", { alternatives: ["Muut marjat"] }),
      ingredient("Sokeroimaton mehukeitto", 50, "ml"),
    ],
    instructions: [
      "Annostele rahka kulhoon.",
      "Lisää päälle maapähkinävoi, mysli ja mustikat.",
      "Tarjoile halutessasi sokerittoman mehukeiton kanssa.",
    ],
  }),
  recipe({
    name: "Jogurtti myslillä ja vadelmilla",
    description: "Raikas iltapala kreikkalaisesta jogurtista ja myslisekoituksesta. Mikä tahansa 350–360 kcal/100 g mysli käy.",
    mealTag: "evening_snack",
    ...singleServe,
    ingredients: [
      ingredient("Kreikkalainen jogurtti 2%", 275, "g"),
      ingredient("Chian siemenet", 10, "g", { alternatives: ["Maapähkinävoi 99%", "Suolaamattomat pähkinät"] }),
      ingredient("Vadelma", 75, "g", { alternatives: ["Muut marjat"] }),
      ingredient("Mysli", 40, "g"),
    ],
    instructions: [
      "Lisää kreikkalainen jogurtti kulhoon.",
      "Sekoita sekaan chian siemenet ja marjat.",
      "Lisää päälle mysli ja nauti.",
    ],
  }),
  recipe({
    name: "Hedelmiä ja proteiinirahka",
    description: "Hedelmäkulho ja vähärasvainen proteiinirahka iltapalaksi. Hedelmät voi valita vapaasti, ja ananas on parempi tuoreena.",
    mealTag: "evening_snack",
    ...singleServe,
    ingredients: [
      ingredient("Kiivi", 1, "pcs", { groupLabel: "Hedelmäkulho", displayQuantity: "1", displayUnit: "kpl", alternatives: ["Muut hedelmät"] }),
      ingredient("Omena", 1, "pcs", { groupLabel: "Hedelmäkulho", displayQuantity: "1", displayUnit: "kpl", alternatives: ["Muut hedelmät"] }),
      ingredient("Viinirypäleet", 60, "g", { groupLabel: "Hedelmäkulho" }),
      ingredient("Ananas", 100, "g", { groupLabel: "Hedelmäkulho", alternatives: ["Tuore ananas"] }),
      ingredient("Skyr", 200, "g", { groupLabel: "Lisäksi", alternatives: ["Vähärasvainen proteiinirahka", "Proteiinivanukas"] }),
    ],
    instructions: [
      "Kuori ja paloittele hedelmät, halkaise viinirypäleet ja valuta ananaspalat.",
      "Tarjoile hedelmät proteiinirahkan kera.",
    ],
  }),
  recipe({
    name: "Munakas",
    description: "Yksinkertainen iltamunakas kalkkunalla, kirsikkatomaateilla ja pinaatilla.",
    mealTag: "evening_snack",
    ...singleServe,
    ingredients: [
      ingredient("Kananmuna", 2, "pcs"),
      ingredient("Kalkkunaviipaleet", 50, "g", { displayQuantity: "5", displayUnit: "viipaletta" }),
      ingredient("Oliiviöljy", 10, "g"),
      ingredient("Aamupala Kevyenraikas 5% sulatejuustoviipale", 20, "g", { alternatives: ["Parmesaani (7 g)"] }),
      ingredient("Kirsikkatomaatti", 100, "g", { displayQuantity: "1", displayUnit: "kourallinen" }),
      textIngredient("Pinaatti", "1", "kourallinen"),
    ],
    instructions: [
      "Kuumenna pannulla pieni teelusikallinen oliiviöljyä.",
      "Riko kananmunat kulhoon ja pilko sekaan kalkkuna, sulatejuusto ja kirsikkatomaatit. Lisää suolaa.",
      "Kaada seos pannulle ja paista keskilämmöllä. Levitä pinaatti munakkaan sekaan ja taita munakas kaksinkerroin paistamisen lopuksi.",
    ],
  }),
  recipe({
    name: "Banaanipannukakut",
    description: "Pannukakut banaanista ja kananmunasta, päälle mustikoita ja vaniljaskyr.",
    mealTag: "evening_snack",
    ...singleServe,
    ingredients: [
      ingredient("Banaani", 1, "pcs", { groupLabel: "Pannukakut", displayQuantity: "1", displayUnit: "kpl" }),
      ingredient("Kananmuna", 1, "pcs", { groupLabel: "Pannukakut" }),
      ingredient("Vehnäjauho", 15, "g", { groupLabel: "Pannukakut", displayQuantity: "1", displayUnit: "rkl" }),
      gentleIngredient("Leivinjauhe", 4, "g", { groupLabel: "Pannukakut", ingredientRole: "spice", displayQuantity: "½", displayUnit: "tl" }),
      gentleIngredient("Vaniljasokeri", 5, "g", { groupLabel: "Pannukakut", ingredientRole: "spice", displayQuantity: "½", displayUnit: "tl" }),
      ingredient("Mustikka", 40, "g", { groupLabel: "Päälle" }),
      ingredient("Skyr wanhanajan vanilja", 200, "g", { groupLabel: "Päälle", alternatives: ["Profeel proteiinivanukas (186 g)", "Vähärasvainen proteiinirahka"] }),
    ],
    instructions: [
      "Muussaa banaani hyvin kulhossa ja sekoita joukkoon kananmuna.",
      "Lisää vehnäjauho, leivinjauhe ja vaniljasokeri. Taikina saa olla melko paksua.",
      "Paista taikinasta pieniä pannukakkuja pannulla ja laita mustikkaa taikinan päälle, jotta ne jäävät pannukakun sisälle.",
      "Tarjoile mustikoiden ja vaniljaskyrin (tai proteiinivanukkaan) kanssa.",
    ],
  }),

  // ===== Lisäreseptit (eivät tässä PDF:ssä, säilytetty entisellään) =====
  recipe({
    name: "Pastasalaatti",
    description: "Raikas kanapastasalaatti, joka toimii myös eväänä.",
    mealTag: "lunch",
    ...batchServe,
    ingredients: [
      ingredient("Pasta", 320, "g", { groupLabel: "Salaatti" }),
      ingredient("Kanan rintafilee", 600, "g", { groupLabel: "Salaatti" }),
      ingredient("Paprika", 150, "g", { groupLabel: "Salaatti" }),
      ingredient("Kurkku", 150, "g", { groupLabel: "Salaatti" }),
      ingredient("Tomaatti", 200, "g", { groupLabel: "Salaatti" }),
      ingredient("Punasipuli", 80, "g", { groupLabel: "Salaatti" }),
      ingredient("Juustoraaste 12%", 60, "g", { groupLabel: "Salaatti" }),
      ingredient("Kreikkalainen jogurtti 2%", 150, "g", { groupLabel: "Kastike" }),
      ingredient("Oliiviöljy", 10, "g", { groupLabel: "Kastike" }),
      ingredient("Sitruunamehu", 15, "ml", { groupLabel: "Kastike" }),
    ],
    instructions: [
      "Keitä pasta ja jäähdytä se.",
      "Paista kana kypsäksi ja kuutioi.",
      "Pilko kasvikset ja sekoita ne pastan sekä kanan kanssa.",
      "Sekoita kastike jogurtista, öljystä ja sitruunamehusta.",
      "Yhdistä kastike salaattiin juuri ennen tarjoilua.",
    ],
  }),
  recipe({
    name: "Tiramisu-tuorepuuro",
    description: "Kahvilla ja kaakaolla maustettu tuorepuuro, jonka päällä vaniljainen proteiinijogurtti.",
    mealTag: "breakfast",
    ...singleServe,
    ingredients: [
      ingredient("Kaurahiutale", 45, "g", { groupLabel: "Pohja" }),
      ingredient("Kaakaojauhe", 8, "g", { groupLabel: "Pohja" }),
      ingredient("Chian siemenet", 8, "g", { groupLabel: "Pohja" }),
      ingredient("Espresso", 22, "ml", { groupLabel: "Pohja", alternatives: ["Vahva kahvi"] }),
      ingredient("Mantelimaito", 150, "ml", { groupLabel: "Pohja", alternatives: ["Rasvaton maito"] }),
      ingredient("Hunaja", 21, "g", { groupLabel: "Pohja", displayQuantity: "1", displayUnit: "rkl" }),
      textIngredient("Vaniljauute", "ripaus", "", { groupLabel: "Pohja" }),
      ingredient("Vaniljaproteiinijauhe", 15, "g", { groupLabel: "Päälle" }),
      ingredient("Kreikkalainen jogurtti 2%", 115, "g", { groupLabel: "Päälle" }),
      ingredient("Hunaja", 10, "g", { groupLabel: "Päälle", displayQuantity: "½", displayUnit: "rkl" }),
      textIngredient("Vaniljauute", "ripaus", "", { groupLabel: "Päälle" }),
    ],
    instructions: [
      "Sekoita pohjan kaurahiutaleet, kaakaojauhe ja chian siemenet kulhossa tai rasiassa.",
      "Lisää espresso, mantelimaito, hunaja ja vaniljauute, ja sekoita tasaiseksi.",
      "Anna tekeytyä jääkaapissa vähintään yön yli.",
      "Sekoita päällyskerroksen kreikkalainen jogurtti, vaniljaproteiini, hunaja ja vaniljauute.",
      "Lusikoi jogurttikerros tuorepuuron päälle ja ripottele halutessasi kaakaojauhetta.",
    ],
  }),
  recipe({
    name: "Snickers-tuorepuuro",
    description: "Snickers-henkinen proteiinituorepuuro maapähkinävoilla, banaanilla, paahdetuilla maapähkinöillä ja tummasuklaavalulla. Karkea maapähkinävoi tuo lisää rakennetta ilman että makrot muuttuvat merkittävästi.",
    mealTag: "breakfast",
    ...singleServe,
    ingredients: [
      ingredient("Kaurahiutale", 50, "g", { groupLabel: "Pohja" }),
      ingredient("Kreikkalainen jogurtti 0%", 150, "g", { groupLabel: "Pohja" }),
      ingredient("Rasvaton maito", 100, "ml", { groupLabel: "Pohja", alternatives: ["Vähärasvainen kauramaito", "Mantelimaito"] }),
      ingredient("Vaniljaproteiinijauhe", 20, "g", { groupLabel: "Pohja" }),
      ingredient("Chian siemenet", 5, "g", { groupLabel: "Pohja" }),
      ingredient("Kaakaojauhe", 10, "g", { groupLabel: "Pohja" }),
      textIngredient("Makeutusaine tai hunaja", "maun mukaan", "", { groupLabel: "Pohja" }),
      ingredient("Maapähkinävoi 99%", 15, "g", { groupLabel: "Täytteet" }),
      ingredient("Banaani", 0.5, "pcs", { groupLabel: "Täytteet", displayQuantity: "½", displayUnit: "kpl" }),
      ingredient("Paahdetut maapähkinät", 10, "g", { groupLabel: "Täytteet" }),
      ingredient("Tumma suklaa", 10, "g", { groupLabel: "Päälle" }),
      textIngredient("Sormisuola", "ripaus", "", { groupLabel: "Päälle" }),
    ],
    instructions: [
      "Sekoita kaikki pohjan ainekset tasaiseksi purkissa tai kulhossa.",
      "Sulje purkki ja anna tekeytyä jääkaapissa vähintään 4 tuntia, mieluiten yön yli.",
      "Lisää aamulla päälle banaaniviipaleet, maapähkinävoi ja paahdetut maapähkinät.",
      "Sulata tumma suklaa mikrossa noin 15–20 sekuntia ja valuta se annoksen päälle.",
      "Ripottele halutessasi päälle pieni ripaus sormisuolaa, anna suklaan jähmettyä hetki ja nauti.",
    ],
  }),
  recipe({
    name: "Brownie-tuorepuuro",
    description: "Suklainen proteiinipitoinen tuorepuuro kaakaokuorrutteella.",
    mealTag: "breakfast",
    ...singleServe,
    ingredients: [
      ingredient("Kaurahiutale", 50, "g", { groupLabel: "Pohja" }),
      ingredient("Suklaaproteiinijauhe", 25, "g", { groupLabel: "Pohja" }),
      ingredient("Kaakaojauhe", 10, "g", { groupLabel: "Pohja" }),
      ingredient("Kreikkalainen jogurtti 2%", 100, "g", { groupLabel: "Pohja" }),
      ingredient("Chian siemenet", 5, "g", { groupLabel: "Pohja" }),
      ingredient("Tumma suklaa", 8, "g", { groupLabel: "Pohja", displayQuantity: "5–10", displayUnit: "g" }),
      ingredient("Vesi", 110, "ml", { groupLabel: "Pohja", alternatives: ["Rasvaton maito"] }),
      ingredient("Kaakaojauhe", 10, "g", { groupLabel: "Suklaakuorrute" }),
      ingredient("Vesi", 18, "ml", { groupLabel: "Suklaakuorrute", displayQuantity: "15–20", displayUnit: "ml" }),
      textIngredient("Hunaja", "maun mukaan", "", { groupLabel: "Suklaakuorrute" }),
    ],
    instructions: [
      "Sekoita kaurahiutaleet, suklaaproteiini, kaakaojauhe, chian siemenet ja suklaanpalat kulhossa.",
      "Lisää kreikkalainen jogurtti ja vesi, ja sekoita tasaiseksi taikinaksi.",
      "Anna tekeytyä jääkaapissa vähintään yön yli.",
      "Sekoita kuorrutteeksi kaakaojauhe, kuuma vesi ja hunaja.",
      "Levitä suklaakuorrute tuorepuuron päälle ennen tarjoilua.",
    ],
  }),
];
