#!/usr/bin/env node
// Tuo liikkeiden esimerkkikuvat free-exercise-db:stä Supabaseen.
//
//   node --env-file=.env scripts/import-exercise-media.mjs --dry-run
//   node --env-file=.env scripts/import-exercise-media.mjs
//   node --env-file=.env scripts/import-exercise-media.mjs --only ex_back_squat
//   node --env-file=.env scripts/import-exercise-media.mjs --force      # uudista olemassa olevat
//
// Lähde: https://github.com/yuhonas/free-exercise-db (Unlicense / public domain).
// Jokaisella liikkeellä on 2 kuvaa: 0.jpg = alkuasento, 1.jpg = loppuasento. UI ristihäivyttää
// parin, jolloin liikerata hahmottuu ilman videota.
//
// Kuvat tallennetaan omaan bucketiin eikä linkitetä GitHubiin: raw.githubusercontent ei anna
// cache-control-takuita eikä sovi tuotantojakeluun.
//
// Vaatii NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY sekä cwebp:n (brew install webp).

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { exerciseMediaMap } from "./exercise-media-map.mjs";

const BUCKET = "exercise-media";
const SOURCE = "free-exercise-db";
const RAW_BASE = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises";

// Lähdekuvat ovat 850x567. Ohjesheetissä kuva näkyy ~320 CSS-pikselin levyisenä, joten 640
// riittää 2x-näytölle. 850 olisi turhaa painoa mobiilidatassa.
const MAX_PX = 640;
const WEBP_QUALITY = 78;
// HUOM: storage-js etuliittää tämän "public, max-age="-merkkijonolla, joten arvon on oltava
// pelkkä sekuntimäärä (sama ansa kuin optimize-recipe-images.mjs:ssä).
const CACHE_CONTROL = "31536000";

function toWebp(inputBuffer) {
  const dir = mkdtempSync(join(tmpdir(), "exercise-webp-"));
  const inPath = join(dir, "in.jpg");
  const outPath = join(dir, "out.webp");
  writeFileSync(inPath, inputBuffer);
  try {
    execFileSync("cwebp", ["-q", String(WEBP_QUALITY), "-resize", String(MAX_PX), "0", "-mt", "-quiet", inPath, "-o", outPath]);
    return readFileSync(outPath);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function parseArgs(argv) {
  const args = { dryRun: false, only: null, force: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--dry-run") args.dryRun = true;
    else if (argv[i] === "--force") args.force = true;
    else if (argv[i] === "--only") { args.only = argv[i + 1]; i += 1; }
  }
  return args;
}

// Lataa yhden kuvan ja palauttaa sen julkisen URLin. Palauttaa null jos lähde puuttuu.
async function uploadOne(supabase, sourceId, frame, exerciseKey, args) {
  const res = await fetch(`${RAW_BASE}/${sourceId}/${frame}.jpg`);
  if (!res.ok) return { error: `lähdekuva ${frame}.jpg: HTTP ${res.status}` };

  const original = Buffer.from(await res.arrayBuffer());
  const webp = toWebp(original);
  const path = `${exerciseKey}-${frame === 0 ? "start" : "end"}.webp`;

  if (args.dryRun) {
    return { url: `[dry] ${path}`, bytesBefore: original.length, bytesAfter: webp.length };
  }

  const up = await supabase.storage.from(BUCKET).upload(path, webp, {
    contentType: "image/webp",
    cacheControl: CACHE_CONTROL,
    upsert: true,
  });
  if (up.error) return { error: `lataus ${path}: ${up.error.message}` };

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, bytesBefore: original.length, bytesAfter: webp.length };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL ja SUPABASE_SERVICE_ROLE_KEY vaaditaan.");

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // Liikkeen asiakaspuolen id on external_key (training-sync.ts mapExerciseRow), joten
  // mappauksen ex_*-avaimet osuvat siihen.
  const { data: rows, error } = await supabase
    .from("exercises")
    .select("id, external_key, name, image_start_url")
    .not("external_key", "is", null);
  if (error) throw new Error(`liikkeiden haku epäonnistui: ${error.message}`);

  const rowByKey = new Map(rows.map((row) => [row.external_key, row]));
  const results = { imported: 0, skipped: 0, missing: [], errors: [], bytesBefore: 0, bytesAfter: 0 };

  for (const [exerciseKey, sourceId] of Object.entries(exerciseMediaMap)) {
    if (args.only && exerciseKey !== args.only) continue;

    const row = rowByKey.get(exerciseKey);
    if (!row) { results.missing.push(exerciseKey); continue; }
    if (row.image_start_url && !args.force) { results.skipped += 1; continue; }

    try {
      const start = await uploadOne(supabase, sourceId, 0, exerciseKey, args);
      if (start.error) { results.errors.push(`${row.name}: ${start.error}`); continue; }
      const end = await uploadOne(supabase, sourceId, 1, exerciseKey, args);
      if (end.error) { results.errors.push(`${row.name}: ${end.error}`); continue; }

      results.bytesBefore += start.bytesBefore + end.bytesBefore;
      results.bytesAfter += start.bytesAfter + end.bytesAfter;

      if (args.dryRun) {
        console.log(`[dry] ${row.name}: ${sourceId} → ${Math.round((start.bytesAfter + end.bytesAfter) / 1024)}KB`);
        results.imported += 1;
        continue;
      }

      const { error: updateError } = await supabase
        .from("exercises")
        .update({
          image_start_url: start.url,
          image_end_url: end.url,
          media_source: SOURCE,
          media_source_id: sourceId,
        })
        .eq("id", row.id);
      if (updateError) { results.errors.push(`${row.name}: päivitys ${updateError.message}`); continue; }

      console.log(`${row.name}: ${Math.round((start.bytesAfter + end.bytesAfter) / 1024)}KB`);
      results.imported += 1;
    } catch (e) {
      results.errors.push(`${row.name}: ${e.message}`);
    }
  }

  console.log("\n--- yhteenveto ---");
  console.log(`tuotu           ${results.imported}`);
  console.log(`ohitettu        ${results.skipped} (oli jo kuva; --force uudistaa)`);
  console.log(`ei kannassa     ${results.missing.length}${results.missing.length ? " → " + results.missing.join(", ") : ""}`);
  console.log(`virheitä        ${results.errors.length}`);
  results.errors.forEach((e) => console.log(`  ${e}`));
  if (results.bytesBefore) {
    console.log(`koko            ${Math.round(results.bytesBefore / 1024)}KB → ${Math.round(results.bytesAfter / 1024)}KB`);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
