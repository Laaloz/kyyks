#!/usr/bin/env node
// Seedaa globaalin liikekirjaston kantaan.
//
//   node --env-file=.env scripts/seed-global-exercises.mjs --dry-run
//   node --env-file=.env scripts/seed-global-exercises.mjs
//
// Taustaa: globaalit liikkeet ovat tähän asti eläneet vain selainbundlessa
// (lib/demo-data.ts → defaultGlobalExercises), ja app-state-provider.tsx yhdistää ne
// ajossa kannasta tulevaan listaan. Kannassa on ollut vain valmentajien omat liikkeet.
//
// Kuvat ja vaiheittaiset ohjeet eivät mahdu bundleen (873 liikettä ohjeineen olisi satoja
// kilotavuja jokaisen käyttäjän ladattavaksi), joten katalogi siirtyy kannan puolelle.
// Tämä skripti on se ensimmäinen askel: se vie nykyiset 133 liikettä kantaan external_key:llä,
// jonka jälkeen import-exercise-media.mjs löytää rivit ja voi liittää niihin kuvat.
//
// Skripti on idempotentti: puuttuvat rivit insertoidaan, olemassa olevat päivitetään
// external_key:n perusteella. HUOM: exercises.external_key on partiaalinen uniikki-indeksi
// (migraatio 005, `where external_key is not null`), eikä PostgREST osaa päätellä ON CONFLICTia
// partiaalisesta indeksistä — siksi tässä ei käytetä upsertia.
//
// Vaatii NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.

import { exerciseSeedData } from "./exercise-seed-data.mjs";

const CHUNK_SIZE = 50;

function parseArgs(argv) {
  const args = { dryRun: false };
  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL ja SUPABASE_SERVICE_ROLE_KEY vaaditaan.");

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // PostgREST palauttaa oletuksena enintään 1000 riviä ja globaaleja on enemmän, joten
  // nykytila haetaan sivuttain — muuten seed yrittäisi lisätä jo olemassa olevia rivejä.
  const existing = [];
  for (let from = 0; ; from += 1000) {
    const { data, error: existingError } = await supabase
      .from("exercises")
      .select("external_key")
      .eq("scope", "global")
      .range(from, from + 999);
    if (existingError) throw new Error(`nykytilan haku epäonnistui: ${existingError.message}`);
    existing.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }

  const existingKeys = new Set((existing ?? []).map((row) => row.external_key));
  const toInsert = exerciseSeedData.filter((exercise) => !existingKeys.has(exercise.id));

  console.log(`seedissä ${exerciseSeedData.length} liikettä, kannassa jo ${existingKeys.size} globaalia`);
  console.log(`${toInsert.length} uutta, ${exerciseSeedData.length - toInsert.length} päivittyy`);

  if (args.dryRun) {
    toInsert.slice(0, 10).forEach((exercise) => console.log(`  [dry] uusi: ${exercise.id} — ${exercise.name}`));
    if (toInsert.length > 10) console.log(`  [dry] ... ja ${toInsert.length - 10} muuta`);
    return;
  }

  // scope='global' vaatii coach_id is null (exercises_scope_owner_check, migraatio 001).
  const toRow = (exercise) => ({
    external_key: exercise.id,
    name: exercise.name,
    category: exercise.category,
    equipment: exercise.equipment,
    cue: exercise.cue,
    scope: "global",
    coach_id: null,
  });

  const insertRows = toInsert.map(toRow);
  for (let i = 0; i < insertRows.length; i += CHUNK_SIZE) {
    const chunk = insertRows.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase.from("exercises").insert(chunk);
    if (error) throw new Error(`insert (rivit ${i}-${i + chunk.length}) epäonnistui: ${error.message}`);
    console.log(`  lisätty ${Math.min(i + chunk.length, insertRows.length)}/${insertRows.length}`);
  }

  const toUpdate = exerciseSeedData.filter((exercise) => existingKeys.has(exercise.id));
  let updated = 0;
  for (const exercise of toUpdate) {
    const { external_key: _key, ...fields } = toRow(exercise);
    const { error } = await supabase.from("exercises").update(fields).eq("external_key", exercise.id);
    if (error) throw new Error(`päivitys ${exercise.id} epäonnistui: ${error.message}`);
    updated += 1;
  }
  if (updated) console.log(`  päivitetty ${updated}`);

  const { count, error: countError } = await supabase
    .from("exercises")
    .select("*", { count: "exact", head: true })
    .eq("scope", "global");
  if (countError) throw new Error(`varmistus epäonnistui: ${countError.message}`);

  console.log(`\nvalmis — kannassa nyt ${count} globaalia liikettä`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
