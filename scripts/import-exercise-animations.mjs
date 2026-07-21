#!/usr/bin/env node
// Tuo liikkeiden animoidut demot Supabaseen animoituna WebP:nä.
//
//   node --env-file=.env scripts/import-exercise-animations.mjs --dry-run
//   node --env-file=.env scripts/import-exercise-animations.mjs
//   node --env-file=.env scripts/import-exercise-animations.mjs --only ex_back_squat
//   node --env-file=.env scripts/import-exercise-animations.mjs --force
//
// Animaatio on ohjesheetin ensisijainen esitys; still-pari (import-exercise-media.mjs) jää
// varalle niille liikkeille joilta animaatio puuttuu.
//
// LISENSSI: media on © Gym visual eikä sille ole julkista käyttöehtoa — ks. pitkä selitys
// scripts/exercise-animation-map.mjs:n alusta. Käyttökelpoinen nykyisessä ei-kaupallisessa
// käytössä; kaupallistuessa korvattava.
//
// Vaatii NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY sekä gif2webp:n
// (tulee libwebp:n mukana, brew install webp).

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { exerciseAnimationMap, customExerciseAnimationMap } from "./exercise-animation-map.mjs";

const BUCKET = "exercise-media";
const SOURCE = "exercisedb-gymvisual";
const GIF_BASE = "https://static.exercisedb.dev/media";
// Animaation staattinen versio liikerivin pikkukuvaksi. 180x180 JPEG, ~7 kt.
const THUMB_BASE = "https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main";
const THUMB_PATHS = "scripts/data/exercise-thumbnail-paths.json";
const WEBP_QUALITY = 80;
// storage-js etuliittää tämän "public, max-age="-merkkijonolla → pelkkä sekuntimäärä.
const CACHE_CONTROL = "31536000";

// Lähde on 180x180 viivagrafiikkaa. gif2webp säilyttää kehykset ja läpinäkyvyyden; skaalausta
// ei tehdä, koska ylösskaalaus ei tuo tietoa ja UI venyttää kuvan CSS:llä.
// Staattinen kuva (pikkukuva) → tavallinen WebP. Ei skaalausta: lähde on jo 180x180 ja
// rivillä kuva näkyy 44 pikselin levyisenä.
function toWebp(jpegBuffer) {
  const dir = mkdtempSync(join(tmpdir(), "exercise-thumb-"));
  const inPath = join(dir, "in.jpg");
  const outPath = join(dir, "out.webp");
  writeFileSync(inPath, jpegBuffer);
  try {
    execFileSync("cwebp", ["-q", "80", "-quiet", inPath, "-o", outPath]);
    return readFileSync(outPath);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Lähdeanimaatiot pysähtyvät kokonaiseksi sekunniksi molempiin ääriasentoihin ja vilauttavat
// liikkeen niiden välillä 100 ms:n kehyksillä. Kaksi kolmasosaa silmukasta on siis pysäytyskuvaa,
// ja lopputulos näyttää kahdelta valokuvalta eikä liikkeeltä.
//
// Ääriasentojen pito lyhennetään 400 ms:iin ja välikehyksiä pidennetään hieman: silmukka
// lyhenee 3,0 s → 1,9 s ja liikkeen osuus nousee 33 %:sta 55 %:iin. Asennot ehtii silti
// rekisteröidä.
//
// Viiveet ovat GIFin Graphic Control Extensionissa (21 F9 04 <packed> <delay-lo> <delay-hi>),
// joten ne voi kirjoittaa suoraan tavuina — erillistä työkalua ei tarvita.
const HOLD_CS = 40; // 400 ms ääriasennoille
const STEP_CS = 11; // 110 ms välikehyksille
const HOLD_THRESHOLD_CS = 50; // yli 500 ms lähteessä = tarkoituksellinen pito

function retimeGif(gifBuffer) {
  const buffer = Buffer.from(gifBuffer);
  for (let i = 0; i < buffer.length - 8; i += 1) {
    if (buffer[i] === 0x21 && buffer[i + 1] === 0xf9 && buffer[i + 2] === 0x04) {
      const current = buffer[i + 4] | (buffer[i + 5] << 8);
      const next = current >= HOLD_THRESHOLD_CS ? HOLD_CS : STEP_CS;
      buffer[i + 4] = next & 0xff;
      buffer[i + 5] = (next >> 8) & 0xff;
    }
  }
  return buffer;
}

function toAnimatedWebp(gifBuffer) {
  const dir = mkdtempSync(join(tmpdir(), "exercise-anim-"));
  const inPath = join(dir, "in.gif");
  const outPath = join(dir, "out.webp");
  writeFileSync(inPath, gifBuffer);
  try {
    execFileSync("gif2webp", ["-q", String(WEBP_QUALITY), "-m", "6", "-quiet", inPath, "-o", outPath]);
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL ja SUPABASE_SERVICE_ROLE_KEY vaaditaan.");

  const thumbPaths = existsSync(THUMB_PATHS) ? JSON.parse(readFileSync(THUMB_PATHS, "utf8")) : {};

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // PostgREST palauttaa oletuksena enintään 1000 riviä ja katalogi ylittää sen, joten
  // rivit haetaan sivuttain — muuten osa liikkeistä jää hiljaa käsittelemättä.
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("exercises")
      .select("id, external_key, name, animation_url")
      .range(from, from + 999);
    if (error) throw new Error(`liikkeiden haku epäonnistui: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }

  // Globaalit avataan external_keyllä, valmentajien omat UUID:llä (ks. map-tiedoston selitys).
  const rowByKey = new Map();
  rows.forEach((row) => {
    if (row.external_key) rowByKey.set(row.external_key, row);
    rowByKey.set(row.id, row);
  });

  const allMappings = { ...exerciseAnimationMap, ...customExerciseAnimationMap };
  const results = { imported: 0, skipped: 0, missing: [], errors: [], bytesBefore: 0, bytesAfter: 0 };

  for (const [exerciseKey, mediaId] of Object.entries(allMappings)) {
    if (args.only && exerciseKey !== args.only) continue;

    const row = rowByKey.get(exerciseKey);
    if (!row) { results.missing.push(exerciseKey); continue; }
    if (row.animation_url && !args.force) { results.skipped += 1; continue; }

    try {
      const res = await fetch(`${GIF_BASE}/${mediaId}.gif`);
      if (!res.ok) { results.errors.push(`${row.name}: GIF HTTP ${res.status}`); continue; }
      const gif = Buffer.from(await res.arrayBuffer());
      const webp = toAnimatedWebp(retimeGif(gif));

      results.bytesBefore += gif.length;
      results.bytesAfter += webp.length;

      if (args.dryRun) {
        console.log(`[dry] ${row.name}: ${mediaId} → ${Math.round(webp.length / 1024)}KB`);
        results.imported += 1;
        continue;
      }

      const path = `${exerciseKey}-anim.webp`;
      const up = await supabase.storage.from(BUCKET).upload(path, webp, {
        contentType: "image/webp",
        cacheControl: CACHE_CONTROL,
        upsert: true,
      });
      if (up.error) { results.errors.push(`${row.name}: lataus ${up.error.message}`); continue; }

      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);

      // Pikkukuva: animaation staattinen versio. Epäonnistuminen ei kaada tuontia —
      // komponentti putoaa still-pariin jos tätä ei ole.
      let thumbnailUrl = null;
      const thumbPath = thumbPaths[mediaId];
      if (thumbPath) {
        try {
          const tres = await fetch(`${THUMB_BASE}/${thumbPath}`);
          if (tres.ok) {
            const thumbWebp = toWebp(Buffer.from(await tres.arrayBuffer()));
            const tPath = `${exerciseKey}-thumb.webp`;
            const tUp = await supabase.storage.from(BUCKET).upload(tPath, thumbWebp, {
              contentType: "image/webp",
              cacheControl: CACHE_CONTROL,
              upsert: true,
            });
            if (!tUp.error) thumbnailUrl = supabase.storage.from(BUCKET).getPublicUrl(tPath).data.publicUrl;
          }
        } catch {
          // pikkukuva on valinnainen
        }
      }

      const { error: updateError } = await supabase
        .from("exercises")
        .update({
          animation_url: pub.publicUrl,
          animation_source: SOURCE,
          animation_source_id: mediaId,
          ...(thumbnailUrl ? { thumbnail_url: thumbnailUrl } : {}),
        })
        .eq("id", row.id);
      if (updateError) { results.errors.push(`${row.name}: päivitys ${updateError.message}`); continue; }

      console.log(`${row.name}: ${Math.round(webp.length / 1024)}KB`);
      results.imported += 1;
    } catch (e) {
      results.errors.push(`${row.name}: ${e.message}`);
    }
  }

  console.log("\n--- yhteenveto ---");
  console.log(`tuotu        ${results.imported}`);
  console.log(`ohitettu     ${results.skipped} (oli jo animaatio; --force uudistaa)`);
  console.log(`ei kannassa  ${results.missing.length}${results.missing.length ? " → " + results.missing.join(", ") : ""}`);
  console.log(`virheitä     ${results.errors.length}`);
  results.errors.forEach((e) => console.log(`  ${e}`));
  if (results.bytesBefore) {
    console.log(`koko         ${Math.round(results.bytesBefore / 1024)}KB → ${Math.round(results.bytesAfter / 1024)}KB`);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
