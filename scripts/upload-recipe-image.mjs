#!/usr/bin/env node
// Lataa valmiin kuvatiedoston reseptille (ei Gemini-generointia, ei cwebp-riippuvuutta).
// Käyttö, kun kuva on jo olemassa paikallisesti (esim. oikea valokuva annoksesta):
//
//   node --env-file=.env scripts/upload-recipe-image.mjs \
//     --recipe "Suklainen proteiinijogurtti ja mansikat" \
//     --file scripts/recipe-images-manual/suklainen-proteiinijogurtti-ja-mansikat.jpg
//
// Vaatii NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. Lataa tiedoston sellaisenaan
// julkiseen recipe-images-bucketiin nimellä {recipe_id}.{ext} ja asettaa recipes.image_url.

import { readFileSync } from "node:fs";
import { extname } from "node:path";

const BUCKET = "recipe-images";
const CACHE_CONTROL = "31536000";
const CONTENT_TYPE = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".avif": "image/avif" };

function parseArgs(argv) {
  const args = { recipe: null, file: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--recipe") { args.recipe = argv[i + 1]; i += 1; }
    else if (argv[i] === "--file") { args.file = argv[i + 1]; i += 1; }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.recipe || !args.file) {
    throw new Error('Käyttö: --recipe "Reseptin nimi" --file polku/kuvaan.jpg');
  }

  const ext = extname(args.file).toLowerCase();
  const contentType = CONTENT_TYPE[ext];
  if (!contentType) {
    throw new Error(`Tuntematon kuvatyyppi: ${ext}. Sallitut: ${Object.keys(CONTENT_TYPE).join(", ")}`);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Vaatii NEXT_PUBLIC_SUPABASE_URL ja SUPABASE_SERVICE_ROLE_KEY.");
  }

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: recipe, error: recipeError } = await supabase
    .from("recipes")
    .select("id,name")
    .eq("name", args.recipe)
    .eq("owner_role", "admin")
    .maybeSingle();
  if (recipeError) throw new Error(`Reseptin haku epäonnistui: ${recipeError.message}`);
  if (!recipe?.id) throw new Error(`Reseptiä ei löytynyt nimellä: ${args.recipe}`);

  const body = readFileSync(args.file);
  const path = `${recipe.id}${ext}`;
  const up = await supabase.storage.from(BUCKET).upload(path, body, {
    contentType,
    cacheControl: CACHE_CONTROL,
    upsert: true,
  });
  if (up.error) throw new Error(`Lataus epäonnistui: ${up.error.message}`);

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
  // Versioparametri kiertää selaimen ja PWA:n service workerin immutable-cachen.
  const imageUrl = `${pub.publicUrl}?v=${Date.now()}`;
  const { error: updErr } = await supabase.from("recipes").update({ image_url: imageUrl }).eq("id", recipe.id);
  if (updErr) throw new Error(`image_url:n päivitys epäonnistui: ${updErr.message}`);

  // Poista mahdolliset muunmuotoiset orpokuvat samalle reseptille.
  const orphans = [".jpg", ".jpeg", ".png", ".webp", ".avif"].filter((e) => e !== ext).map((e) => `${recipe.id}${e}`);
  await supabase.storage.from(BUCKET).remove(orphans);

  console.log(JSON.stringify({ recipe: recipe.name, id: recipe.id, path, imageUrl }, null, 2));
}

main().catch((e) => { console.error(e instanceof Error ? e.message : String(e)); process.exitCode = 1; });
