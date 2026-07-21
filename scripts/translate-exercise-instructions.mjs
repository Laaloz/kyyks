#!/usr/bin/env node
// Kääntää liikkeiden vaiheittaiset suoritusohjeet suomeksi ja tallentaa ne
// exercises.instruction_steps -sarakkeeseen.
//
//   node --env-file=.env scripts/translate-exercise-instructions.mjs --dry-run
//   node --env-file=.env scripts/translate-exercise-instructions.mjs
//   node --env-file=.env scripts/translate-exercise-instructions.mjs --only ex_back_squat
//   node --env-file=.env scripts/translate-exercise-instructions.mjs --force
//
// instruction_steps EI korvaa cue-saraketta: cue on valmentajan tiivis pääohje sheetin
// yläosassa, tämä on sen alle avautuva "Suoritus"-erittely.
//
// Lähdeohjeet tulevat samasta liikepankista kuin animaatiot (media_id täsmää), joten
// teksti ja kuva kuvaavat samaa suoritusta.
//
// Vaatii GEMINI_API_KEY + NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY sekä
// paikallisen kopion pankin datasta (--source, oletus scripts/data/exercise-instructions.json).

import { readFileSync } from "node:fs";

import { exerciseAnimationMap, customExerciseAnimationMap } from "./exercise-animation-map.mjs";
import { exerciseMediaMap } from "./exercise-media-map.mjs";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const BATCH_SIZE = 8;
const TIMEOUT_MS = 120_000;

const PROMPT = `Käännä alla olevat kuntosaliliikkeiden suoritusohjeet englannista suomeksi.

Vaatimukset:
- Käytä vakiintunutta suomalaista salisanastoa (esim. "hip thrust", "lantonnosto", "keskivartalo", "lavat", "kyynärpäät", "liikerata"). Älä käännä väkisin liikkeiden vakiintuneita englanninkielisiä nimiä.
- Kirjoita käskymuodossa ja valmentavaan sävyyn, kuten suomalainen personal trainer neuvoisi.
- Säilytä askelten määrä ja järjestys täsmälleen: jos syötteessä on 7 askelta, palauta 7.
- Yksi askel = yksi lyhyt, konkreettinen ohje. Älä yhdistä tai pilko askelia.
- Älä lisää numerointia tekstiin — pelkkä lause.
- Älä lisää mitään mitä lähteessä ei ole.

Palauta VAIN JSON-objekti muodossa {"<avain>": ["askel 1", "askel 2", ...], ...} käyttäen samoja avaimia kuin syötteessä. Ei selityksiä, ei koodilohkoa.

Syöte:
`;

function parseArgs(argv) {
  const args = { dryRun: false, only: null, force: false, source: "scripts/data/exercise-instructions.json" };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--dry-run") args.dryRun = true;
    else if (argv[i] === "--force") args.force = true;
    else if (argv[i] === "--only") { args.only = argv[i + 1]; i += 1; }
    else if (argv[i] === "--source") { args.source = argv[i + 1]; i += 1; }
  }
  return args;
}

async function callGemini(payload) {
  const apiKey = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: PROMPT + JSON.stringify(payload, null, 1) }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
          // Suora käännöstehtävä ei hyödy ajattelusta, ja se moninkertaistaisi keston.
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
    if (!text) throw new Error("Gemini palautti tyhjän vastauksen");
    return JSON.parse(text);
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

  const stepsByMediaId = JSON.parse(readFileSync(args.source, "utf8"));
  // Varalähde niille liikkeille joilla ei ole animaatiota: still-parin oma lähde
  // (free-exercise-db). Ilman tätä ne jäisivät kokonaan ilman "Suoritus"-osiota.
  const fallbackSteps = JSON.parse(readFileSync("scripts/data/exercise-instructions-fallback.json", "utf8"));

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // PostgREST palauttaa oletuksena enintään 1000 riviä ja katalogi ylittää sen, joten
  // rivit haetaan sivuttain — muuten osa liikkeistä jää hiljaa käsittelemättä.
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("exercises")
      .select("id, external_key, name, instruction_steps")
      .range(from, from + 999);
    if (error) throw new Error(`liikkeiden haku epäonnistui: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }

  const rowByKey = new Map();
  rows.forEach((row) => {
    if (row.external_key) rowByKey.set(row.external_key, row);
    rowByKey.set(row.id, row);
  });

  // Kerää käännettävät: liike → englanninkieliset askeleet.
  // Ensisijainen lähde on animaatiota vastaava liike (teksti ja kuva samasta suorituksesta);
  // jos animaatiota ei ole, käytetään still-parin lähdettä.
  const sources = new Map();
  for (const [key, mediaId] of Object.entries({ ...exerciseAnimationMap, ...customExerciseAnimationMap })) {
    const steps = stepsByMediaId[mediaId];
    if (steps?.length) sources.set(key, steps);
  }
  for (const [key, sourceId] of Object.entries(exerciseMediaMap)) {
    if (sources.has(key)) continue;
    const steps = fallbackSteps[sourceId];
    if (steps?.length) sources.set(key, steps);
  }

  const pending = [];
  for (const [key, steps] of sources) {
    if (args.only && key !== args.only) continue;
    const row = rowByKey.get(key);
    if (!row) continue;
    if (row.instruction_steps?.length && !args.force) continue;
    pending.push({ key, row, steps });
  }

  console.log(`käännettäviä ${pending.length} liikettä, ${pending.reduce((s, p) => s + p.steps.length, 0)} askelta`);
  if (!pending.length) return;

  const results = { translated: 0, errors: [], mismatched: [] };

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const payload = Object.fromEntries(batch.map((p) => [p.key, p.steps]));

    if (args.dryRun) {
      console.log(`[dry] erä ${i / BATCH_SIZE + 1}: ${batch.map((p) => p.row.name).join(", ")}`);
      results.translated += batch.length;
      continue;
    }

    let translated;
    try {
      translated = await callGemini(payload);
    } catch (e) {
      results.errors.push(`erä ${i}-${i + batch.length}: ${e.message}`);
      continue;
    }

    for (const item of batch) {
      const fi = translated[item.key];
      if (!Array.isArray(fi) || !fi.length) {
        results.errors.push(`${item.row.name}: käännös puuttui vastauksesta`);
        continue;
      }
      // Askelmäärän muutos tarkoittaa että malli yhdisti tai pilkkoi ohjeita → kirjataan,
      // mutta hyväksytään: sisältö on silti oikea eikä askelten 1:1-vastaavuus ole kriittinen.
      if (fi.length !== item.steps.length) {
        results.mismatched.push(`${item.row.name}: ${item.steps.length} → ${fi.length}`);
      }
      const { error: updateError } = await supabase
        .from("exercises")
        .update({ instruction_steps: fi })
        .eq("id", item.row.id);
      if (updateError) { results.errors.push(`${item.row.name}: ${updateError.message}`); continue; }
      results.translated += 1;
    }
    console.log(`  ${Math.min(i + BATCH_SIZE, pending.length)}/${pending.length}`);
  }

  console.log("\n--- yhteenveto ---");
  console.log(`käännetty        ${results.translated}`);
  console.log(`askelmäärä muuttui ${results.mismatched.length}`);
  results.mismatched.slice(0, 8).forEach((m) => console.log(`  ${m}`));
  console.log(`virheitä         ${results.errors.length}`);
  results.errors.forEach((e) => console.log(`  ${e}`));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
