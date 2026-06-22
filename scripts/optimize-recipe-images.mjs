#!/usr/bin/env node
// Optimoi olemassa olevat reseptikuvat nopeammin latautuviksi:
//   - lataa nykyinen kuva storagesta
//   - skaalaa pisin sivu <= MAX_PX ja koodaa WebP:ksi (cwebp, laatu QUALITY)
//   - lataa {id}.webp pitkällä cache-controllilla ja päivittää recipes.image_url
//   - poistaa vanhan {id}.png-orvon (ellei --keep-original)
//
//   node --env-file=.env scripts/optimize-recipe-images.mjs --dry-run
//   node --env-file=.env scripts/optimize-recipe-images.mjs
//   node --env-file=.env scripts/optimize-recipe-images.mjs --only "<recipe-id>"
//
// Tarvitsee NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY sekä cwebp:n (brew install webp).

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BUCKET = "recipe-images";
const MAX_PX = 800;
const QUALITY = 75;
// Supabase odottaa sekuntimäärää (asettaa max-age). HUOM: tämän projektin julkinen
// object-endpoint palauttaa silti "no-cache" (Smart CDN ei käytössä) → selain revalidoi
// ETagilla (304, ei bodyn latausta). Arvo on silti oikea jos CDN otetaan käyttöön.
const CACHE_CONTROL = "31536000";

function toOptimizedWebp(inputBuffer) {
  const dir = mkdtempSync(join(tmpdir(), "recipe-webp-"));
  const inPath = join(dir, "in.img");
  const outPath = join(dir, "out.webp");
  writeFileSync(inPath, inputBuffer);
  try {
    execFileSync("cwebp", ["-q", String(QUALITY), "-resize", String(MAX_PX), "0", "-mt", "-quiet", inPath, "-o", outPath]);
    return readFileSync(outPath);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function parseArgs(argv) {
  const args = { dryRun: false, only: null, keepOriginal: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--dry-run") args.dryRun = true;
    else if (argv[i] === "--keep-original") args.keepOriginal = true;
    else if (argv[i] === "--only") { args.only = argv[i + 1]; i += 1; }
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

  const { data: recipes, error } = await supabase
    .from("recipes")
    .select("id,name,image_url")
    .not("image_url", "is", null);
  if (error) throw new Error(`reseptien haku epäonnistui: ${error.message}`);

  const targets = recipes.filter((r) => (!args.only || r.id === args.only) && !r.image_url.endsWith(".webp"));
  const results = { optimized: 0, skipped: recipes.length - targets.length, errors: [], bytesBefore: 0, bytesAfter: 0 };

  for (const r of targets) {
    try {
      const res = await fetch(r.image_url);
      if (!res.ok) { results.errors.push(`${r.name}: lataus ${res.status}`); continue; }
      const original = Buffer.from(await res.arrayBuffer());
      const webp = toOptimizedWebp(original);

      results.bytesBefore += original.length;
      results.bytesAfter += webp.length;
      const beforeKb = Math.round(original.length / 1024);
      const afterKb = Math.round(webp.length / 1024);

      if (args.dryRun) {
        console.log(`[dry] ${r.name}: ${beforeKb}KB -> ${afterKb}KB`);
        results.optimized += 1;
        continue;
      }

      const webpPath = `${r.id}.webp`;
      const up = await supabase.storage.from(BUCKET).upload(webpPath, webp, {
        contentType: "image/webp",
        cacheControl: CACHE_CONTROL,
        upsert: true,
      });
      if (up.error) { results.errors.push(`${r.name}: upload ${up.error.message}`); continue; }

      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(webpPath);
      const { error: updErr } = await supabase.from("recipes").update({ image_url: pub.publicUrl }).eq("id", r.id);
      if (updErr) { results.errors.push(`${r.name}: image_url ${updErr.message}`); continue; }

      if (!args.keepOriginal) {
        await supabase.storage.from(BUCKET).remove([`${r.id}.png`]);
      }

      console.log(`ok ${r.name}: ${beforeKb}KB -> ${afterKb}KB`);
      results.optimized += 1;
    } catch (e) {
      results.errors.push(`${r.name}: ${e.message}`);
      console.error(`VIRHE ${r.name}: ${e.message}`);
    }
  }

  const saved = results.bytesBefore - results.bytesAfter;
  console.log("\n" + JSON.stringify({
    optimized: results.optimized,
    skipped: results.skipped,
    errors: results.errors,
    totalBeforeMB: +(results.bytesBefore / 1048576).toFixed(1),
    totalAfterMB: +(results.bytesAfter / 1048576).toFixed(1),
    savedPct: results.bytesBefore ? Math.round((saved / results.bytesBefore) * 100) : 0,
  }, null, 2));
}

main().catch((e) => { console.error(e instanceof Error ? e.message : String(e)); process.exitCode = 1; });
