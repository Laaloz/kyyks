#!/usr/bin/env node
// Laajentaa globaalin liikekirjaston liikepankin liikkeillä.
//
//   node --env-file=.env scripts/seed-exercise-bank.mjs --dry-run
//   node --env-file=.env scripts/seed-exercise-bank.mjs --limit 40     # kokeile pienellä erällä
//   node --env-file=.env scripts/seed-exercise-bank.mjs
//
// Nimet käännetään Geminillä. Käännös saa palauttaa null, jolloin liike jää alkuperäiselle
// englanninkieliselle nimelleen — kömpelö konekäännös on huonompi kuin selkeä englanti, ja
// suomalaiset valmentajat tuntevat salitermistön englanniksikin. Otoksissa noin 83 % kääntyi.
//
// Ajattelubudjetti on tarkoituksella päällä: ilman sitä malli rikkoi sanajärjestyssääntöä
// ("Renkaat dipit" oikean "Dipit renkailla" sijaan) ja tuotti kirjoitusvirheitä.
//
// EI tuo mediaa — se ajetaan erikseen (import-exercise-animations.mjs), samoin ohjeet
// (translate-exercise-instructions.mjs). Uudet liikkeet näkyvät siis aluksi ilman kuvaa.
//
// Vaatii GEMINI_API_KEY + NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.

import { readFileSync } from "node:fs";

import { exerciseAnimationMap } from "./exercise-animation-map.mjs";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const BATCH_SIZE = 40;
const TIMEOUT_MS = 180_000;
const INSERT_CHUNK = 100;

// Uusien liikkeiden avain erotetaan käsin kuratoiduista (ex_back_squat jne.), jotta
// kuratoitu joukko pysyy tunnistettavana ja seed on idempotentti.
const KEY_PREFIX = "ex_edb_";

// Sama teksti jota sovellus käyttää valmentajan omille liikkeille — valmentaja muokkaa
// ohjeen itse. Vaiheittainen suoritusohje tulee erikseen instruction_steps-sarakkeeseen.
const DEFAULT_CUE = "Muokkaa liikkeen ohje valmennukseen sopivaksi.";

// body_part → kuratoidun kirjaston kategoriasanasto. upper arms ratkaistaan targetin mukaan.
const CATEGORY_BY_BODY_PART = {
  "upper legs": "Alavartalo",
  "lower legs": "Alavartalo",
  back: "Selkä",
  waist: "Core",
  chest: "Rinta",
  shoulders: "Hartiat",
  "lower arms": "Hauis",
  neck: "Yläselkä",
};

const EQUIPMENT_FI = {
  barbell: "Levytanko",
  "olympic barbell": "Olympiatanko",
  "ez barbell": "EZ-tanko",
  "trap bar": "Trap bar",
  dumbbell: "Käsipainot",
  cable: "Talja",
  "body weight": "Kehonpaino",
  "leverage machine": "Laite",
  "smith machine": "Smith-laite",
  "sled machine": "Kelkka",
  band: "Kuminauha",
  "resistance band": "Vastuskuminauha",
  kettlebell: "Kahvakuula",
  weighted: "Lisäpaino",
  "stability ball": "Jumppapallo",
  "bosu ball": "Bosu-pallo",
  "medicine ball": "Kuntopallo",
  rope: "Köysi",
  roller: "Rulla",
  "wheel roller": "Ab wheel",
  hammer: "Vasara",
  tire: "Rengas",
};

function resolveCategory(entry) {
  if (entry.body_part === "upper arms") {
    if (/tricep/i.test(entry.target || "")) return "Ojentajat";
    if (/bicep|brachial/i.test(entry.target || "")) return "Hauis";
    return "Kädet";
  }
  return CATEGORY_BY_BODY_PART[entry.body_part] || "Koko kroppa";
}

const PROMPT = `Käännä kuntosaliliikkeiden nimet englannista suomeksi suomalaiseen valmennussovellukseen.

Nykyinen nimeämistapa:
  barbell squat             → Takakyykky
  dumbbell bench press      → Käsipainopenkki
  cable crunch              → Vatsarutistus taljassa
  smith machine squat       → Kyykky smith-laitteessa
  lever seated leg curl     → Istuva takareisikoukistus
  dumbbell neutral grip bench press → Penkkipunnerrus käsipainoilla (neutraali ote)

SANAJÄRJESTYS on ehdoton: liike ensin, väline VIIMEISENÄ taivutettuna (-lla/-llä/-ssa/-ssä).
  OIKEIN: "Dipit renkailla", "Tuulimylly kahvakuulalla", "Pohkeennosto smith-laitteessa"
  VÄÄRIN: "Renkaat dipit", "Kahvakuula tuulimylly", "Smith pohkeennosto"
Tarkennukset sulkeisiin lopussa.

Palauta null jos et saa aikaan nimeä jonka suomalainen valmentaja oikeasti kirjoittaisi:
liikkeellä ei ole vakiintunutta suomenkielistä nimeä (burpee, muscle up, bear crawl,
landmine 180) tai käännös olisi sanasalaattia. Älä kuitenkaan turvaudu nulliin tavallisilla
sali-liikkeillä joille on selvä suomenkielinen vastine.

Iso alkukirjain. Versionumerot, (male)/(female) pois.

TARKISTA jokainen tuottamasi nimi ennen palautusta:
  1. Alkaako se liikkeellä eikä välineellä? Jos ei → korjaa sanajärjestys.
  2. Onko kirjoitusasu virheetön suomea? Jos epäilet → null.
  3. Sanoisiko valmentaja tämän ääneen? Jos ei → null.

Palauta VAIN JSON-taulukko (merkkijono tai null) samassa järjestyksessä ja samanmittaisena.

Syöte:
`;

function parseArgs(argv) {
  const args = { dryRun: false, limit: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--dry-run") args.dryRun = true;
    else if (argv[i] === "--limit") { args.limit = Number(argv[i + 1]); i += 1; }
  }
  return args;
}

// Gemini palauttaa ajoittain 503/429 kuormituksen takia. Ilman uudelleenyritystä koko erä
// (40 liikettä) jäisi väliin yhdestä ohimenevästä virheestä.
async function translateNamesWithRetry(names, attempts = 4) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await translateNames(names);
    } catch (e) {
      const retriable = /HTTP (429|500|502|503|504)/.test(e.message);
      if (!retriable || attempt >= attempts) throw e;
      const waitMs = 2000 * 2 ** (attempt - 1);
      console.log(`    ${e.message.slice(0, 60)} → uudelleen ${waitMs / 1000}s kuluttua`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}

async function translateNames(names) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ parts: [{ text: PROMPT + JSON.stringify(names, null, 1) }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
          thinkingConfig: { thinkingBudget: 2048 },
        },
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed) || parsed.length !== names.length) {
      throw new Error(`odotettiin ${names.length} nimeä, saatiin ${Array.isArray(parsed) ? parsed.length : "ei taulukkoa"}`);
    }
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY vaaditaan.");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL ja SUPABASE_SERVICE_ROLE_KEY vaaditaan.");

  const bank = JSON.parse(readFileSync("scripts/data/exercise-bank.json", "utf8"));

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // PostgREST palauttaa oletuksena enintään 1000 riviä. Katalogi ylittää sen, joten
  // nykytila haetaan sivuttain — muuten seed yrittäisi lisätä jo olemassa olevia rivejä.
  const existing = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("exercises")
      .select("external_key, name")
      .range(from, from + 999);
    if (error) throw new Error(`nykytilan haku epäonnistui: ${error.message}`);
    existing.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }

  const existingKeys = new Set((existing ?? []).map((row) => row.external_key).filter(Boolean));
  const existingNames = new Set((existing ?? []).map((row) => row.name.trim().toLowerCase()));
  // Kuratoituun 133:aan jo liitetyt lähdeliikkeet jätetään väliin — ne ovat kirjastossa
  // omilla suomenkielisillä nimillään.
  const curatedMediaIds = new Set(Object.values(exerciseAnimationMap));

  let candidates = bank.filter(
    (entry) => !curatedMediaIds.has(entry.media_id) && !existingKeys.has(`${KEY_PREFIX}${entry.media_id}`),
  );
  if (args.limit) candidates = candidates.slice(0, args.limit);

  console.log(`pankissa ${bank.length}, kuratoituun liitetty ${curatedMediaIds.size}, lisättäviä ${candidates.length}`);
  if (!candidates.length) return;

  const results = { inserted: 0, translated: 0, keptEnglish: 0, skippedDuplicate: 0, errors: [] };
  const rows = [];

  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);
    let names;
    try {
      names = await translateNamesWithRetry(batch.map((entry) => entry.name));
    } catch (e) {
      results.errors.push(`erä ${i}-${i + batch.length}: ${e.message}`);
      continue;
    }

    batch.forEach((entry, index) => {
      const translated = typeof names[index] === "string" ? names[index].trim() : "";
      // Englanniksi jäävät nimet siistitään samoilla säännöillä kuin käännetyt: mallin ohje
      // koski vain sen omaa tuotosta, ei alkuperäistä.
      const fallback = entry.name
        .replace(/\s*\((?:male|female)\)/gi, "")
        .replace(/\s*v\.\s*\d+\s*$/i, "")
        .trim()
        .replace(/^./, (c) => c.toUpperCase());
      const finalName = translated || fallback;
      if (translated) results.translated += 1;
      else results.keptEnglish += 1;

      // Nimi on käyttöliittymässä liikkeen tunniste — kaksi samannimistä sekoittaisi
      // valitsimen ja ohjelman liikelistan.
      const nameKey = finalName.trim().toLowerCase();
      if (existingNames.has(nameKey)) { results.skippedDuplicate += 1; return; }
      existingNames.add(nameKey);

      rows.push({
        external_key: `${KEY_PREFIX}${entry.media_id}`,
        name: finalName,
        category: resolveCategory(entry),
        equipment: EQUIPMENT_FI[entry.equipment] || "Muu",
        cue: DEFAULT_CUE,
        scope: "global",
        coach_id: null,
      });
    });

    console.log(`  käännetty ${Math.min(i + BATCH_SIZE, candidates.length)}/${candidates.length}`);
  }

  if (args.dryRun) {
    console.log("\n[dry] näyte:");
    rows.slice(0, 15).forEach((row) => console.log(`  ${row.name}  [${row.category} / ${row.equipment}]`));
    console.log(`\n[dry] lisättäisiin ${rows.length} liikettä`);
  } else {
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      const chunk = rows.slice(i, i + INSERT_CHUNK);
      const { error: insertError } = await supabase.from("exercises").insert(chunk);
      if (insertError) { results.errors.push(`insert ${i}: ${insertError.message}`); continue; }
      results.inserted += chunk.length;
      console.log(`  lisätty ${results.inserted}/${rows.length}`);
    }
  }

  console.log("\n--- yhteenveto ---");
  console.log(`suomennettu       ${results.translated}`);
  console.log(`englanniksi       ${results.keptEnglish}`);
  console.log(`ohitettu (sama nimi) ${results.skippedDuplicate}`);
  console.log(`lisätty           ${results.inserted}`);
  console.log(`virheitä          ${results.errors.length}`);
  results.errors.forEach((e) => console.log(`  ${e}`));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
