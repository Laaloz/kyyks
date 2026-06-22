#!/usr/bin/env node
// Generoi reseptikuvat Imagen 4 Fast -mallilla (Gemini API).
//
//   node --env-file=.env scripts/generate-recipe-images.mjs            # generoi paikallisesti /tmp/recipe-images
//   node --env-file=.env scripts/generate-recipe-images.mjs --force    # uudista myös olemassa olevat
//   node --env-file=.env scripts/generate-recipe-images.mjs --only "Munakas,Banaanipannukakut"
//   node --env-file=.env scripts/generate-recipe-images.mjs --upload    # lataa Supabaseen + asettaa recipes.image_url
//
// Tarvitsee GEMINI_API_KEY:n. --upload lisäksi NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { recipeSeedData } from "./recipe-seed-data.mjs";

const MODEL = "imagen-4.0-fast-generate-001";
const OUT_DIR = process.env.RECIPE_IMAGE_DIR || "/tmp/recipe-images";
const BUCKET = "recipe-images";

const STYLE =
  "Professional overhead (top-down) food photograph, light neutral background, soft natural light, " +
  "bright, fresh and appetizing, healthy meal, realistic, high detail, no text, no labels, no people, no hands.";

// Tarkat englanninkieliset kuvaukset per resepti (näkyvät ainekset + astia). Yhtenäinen tyyli STYLE:sta.
const PROMPTS = {
  "Ruisleipää ja kananmunaa": "Two slices of Finnish dark rye bread topped with cream cheese and a slice of cheese, with two boiled eggs on a plate",
  "Leipä ja proteiinivanukas": "Two slices of oat bread with margarine and turkey cold cuts on a plate, a small pot of chocolate dessert pudding beside it (not coffee, not a drink)",
  "Puuro maapähkinävoilla ja marjoilla": "A bowl of oat porridge topped with cottage cheese, fresh blueberries and a spoonful of peanut butter",
  "Vadelma-tuorepuuro": "Overnight oats with fresh raspberries and white skyr yogurt in a glass jar",
  "Rahkasmoothie": "A thick pink berry-quark smoothie in a tall glass with a banana and fresh raspberries beside it (food photograph, light neutral background, soft natural light, bright, appetizing, no text, no people)",
  "Leipä ja skyr-kulho": "A bowl of skyr yogurt topped with muesli, next to two slices of rye bread with turkey cold cuts",
  "Chia-vanukas mustikoilla": "A small glass bowl of creamy white chia seed pudding topped with fresh blueberries, healthy breakfast on a table",
  "Kana ja riisi": "Grilled chicken breast with white rice and mixed vegetables on a plate",
  "Kanatortillat": "Chicken fajita wraps with grilled chicken strips, grated cheese, salsa, lettuce and bell peppers on a plate",
  "Makaronilaatikko": "Finnish macaroni and minced-beef casserole in a baking dish with a golden cheese crust",
  "Pesto-pasta kanalla": "Pasta with green pesto, grilled chicken pieces and halved cherry tomatoes in a bowl",
  "Kanapyörykät ja riisi": "Breaded chicken meatballs with white rice, pineapple pieces and sweet chili sauce on a plate",
  "Nakkikastike perunoilla": "A plate of boiled potatoes covered in creamy gravy with sliced sausage, comfort food",
  "Crispy chicken -salaatti": "A bowl of chicken and rice salad with feta cheese cubes, sweetcorn, iceberg lettuce, cherry tomatoes and cucumber, grilled chicken strips on top",
  "VHH-ateria": "A low-carb plate of browned lean minced meat with cottage cheese, steamed broccoli and cherry tomatoes",
  "Helppo ja nopea rahkasetti": "A bowl of quark topped with fresh blueberries, walnuts and a drizzle of honey",
  "Proteiinirahka, hedelmä ja pähkinät": "A cup of plain quark with a whole apple and a few cashew nuts beside it on a plate",
  "Proteiinivanukas mansikoilla": "A small dessert cup of chocolate mousse topped with fresh sliced strawberries and a few cashew nuts",
  "Proteiinijauhe, hedelmä ja pähkinät": "A protein shake in a glass with a banana and cashew nuts beside it (food photograph, light neutral background, bright, no text, no people)",
  "Maissikakut ja proteiinirahka": "Rice cakes topped with turkey slices next to a small bowl of protein quark with sliced kiwi",
  "Skyr-juoma, banaani ja pähkinät": "A tall glass of white drinking yogurt next to a whole banana and a small pile of cashew nuts on a table (food photograph, light neutral background, bright, no text, no people, no car)",
  "Ruisleipää vuolukanalla": "Slices of dark rye bread topped with cheese, sliced chicken, tomato and cucumber on a plate",
  "Mac and cheese kanalla": "Creamy macaroni and cheese in a bowl topped with BBQ-glazed grilled chicken pieces",
  "Spaghetti ja jauhelihakastike": "Spaghetti with tomato minced-meat sauce on a plate",
  "Uunilohi ja maalaislohkoperunat": "A baked salmon fillet with rustic oven potato wedges and steamed broccoli on a plate",
  "Tulinen kanapasta": "Creamy spicy tomato chicken pasta in a bowl, garnished with parmesan and bell pepper",
  "Makkaraperunat": "French fries topped with sliced frankfurter hot-dog sausages, cottage cheese, ketchup and a sour cream dip on a plate (no mushrooms)",
  "Uunifeta kanapasta": "Baked feta pasta with cherry tomatoes, grilled chicken and fresh basil in a bowl",
  "Bataatti-jauheliha bowl": "A deep bowl filled with orange roasted sweet potato cubes and browned ground beef, topped with grated cheese and a dollop of white yogurt",
  "Sticky Korean fried chicken": "Glossy sticky Korean fried chicken pieces with white rice in a bowl, sesame seeds on top",
  "Udon-nuudelikeitto": "Udon noodle soup with shrimp, a halved soft-boiled egg, spring onion and peanuts in a miso broth, in a bowl",
  "Kalkkunajuustovoileipä": "Oat bread sandwiches with turkey, cheese, cucumber and tomato on a plate",
  "Rahkaohukaiset proteiinivanukkaalla": "Finnish quark pancakes on a plate topped with protein pudding and fresh berries",
  "Suklainen tuorepuuro": "Chocolate overnight oats topped with banana slices in a glass jar",
  "Rahka myslillä ja marjoilla": "A bowl of quark with muesli, fresh blueberries and a spoonful of peanut butter",
  "Jogurtti myslillä ja vadelmilla": "A bowl of greek yogurt with muesli, fresh raspberries and chia seeds",
  "Hedelmiä ja proteiinirahka": "A fruit bowl with kiwi, apple, grapes and pineapple, next to a cup of skyr yogurt",
  "Munakas": "A folded yellow omelette on a white plate with cherry tomatoes and fresh spinach leaves",
  "Banaanipannukakut": "A short stack of small fluffy pancakes on a plate topped with fresh blueberries and a dollop of white vanilla yogurt (not cookies, not biscuits)",
  "Tiramisu-tuorepuuro": "Tiramisu-style overnight oats with a cocoa base and a vanilla yogurt layer in a glass jar, dusted with cocoa",
  "Banaani-tuorepuuro": "Banana overnight oats with greek yogurt and a dark chocolate drizzle in a glass jar",
  "Brownie-tuorepuuro": "Chocolate brownie overnight oats with a cocoa topping in a glass jar",
  "Pastasalaatti": "A bowl of cold pasta salad with chicken, bell peppers, cucumber, tomato and red onion",
};

function slugify(name) {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseArgs(argv) {
  const args = { force: false, upload: false, only: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--force") args.force = true;
    else if (argv[i] === "--upload") args.upload = true;
    else if (argv[i] === "--only") { args.only = (argv[i + 1] || "").split(",").map((s) => s.trim()).filter(Boolean); i += 1; }
  }
  return args;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Ilmaistason raja on ~10 pyyntöä/min Imagenille → kuristetaan ja yritetään 429:llä uudelleen.
async function generateImage(prompt, apiKey, maxRetries = 6) {
  for (let attempt = 0; ; attempt += 1) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({ instances: [{ prompt }], parameters: { sampleCount: 1, aspectRatio: "1:1" } }),
    });
    const json = await res.json();
    if (res.ok) {
      const b64 = json?.predictions?.[0]?.bytesBase64Encoded;
      if (!b64) throw new Error("vastaus ilman kuvadataa");
      return Buffer.from(b64, "base64");
    }
    const msg = json?.error?.message || "tuntematon virhe";
    if (res.status === 429 && attempt < maxRetries) {
      const m = msg.match(/retry in ([\d.]+)s/i);
      const waitMs = Math.ceil((m ? parseFloat(m[1]) : 35) * 1000) + 1500;
      console.log(`  429 – odotetaan ${Math.round(waitMs / 1000)} s (yritys ${attempt + 1}/${maxRetries})`);
      await sleep(waitMs);
      continue;
    }
    throw new Error(`HTTP ${res.status}: ${msg}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY puuttuu ympäristöstä.");

  mkdirSync(OUT_DIR, { recursive: true });

  let supabase = null;
  let recipeIdByName = null;
  if (args.upload) {
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) throw new Error("--upload vaatii NEXT_PUBLIC_SUPABASE_URL ja SUPABASE_SERVICE_ROLE_KEY.");
    supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await supabase.from("recipes").select("id,name").eq("owner_role", "admin");
    if (error) throw new Error(`reseptien haku epäonnistui: ${error.message}`);
    recipeIdByName = new Map(data.map((r) => [r.name, r.id]));
  }

  const recipes = recipeSeedData.filter((r) => !args.only || args.only.includes(r.name));
  const results = { generated: 0, skipped: 0, uploaded: 0, missingPrompt: [], errors: [] };

  for (const r of recipes) {
    const slug = slugify(r.name);
    const file = `${OUT_DIR}/${slug}.png`;
    const dish = PROMPTS[r.name];
    if (!dish) results.missingPrompt.push(r.name);
    const prompt = dish ? `${dish}. ${STYLE}` : `${r.name}. ${STYLE}`;

    try {
      if (existsSync(file) && !args.force) {
        results.skipped += 1;
      } else {
        const buf = await generateImage(prompt, apiKey);
        writeFileSync(file, buf);
        results.generated += 1;
        console.log(`generoitu: ${r.name} -> ${file}`);
        await sleep(6500); // tahdistus alle 10/min
      }

      if (args.upload) {
        const id = recipeIdByName.get(r.name);
        if (!id) { results.errors.push(`${r.name}: ei recipe_id:tä kannassa`); continue; }
        const { readFileSync } = await import("node:fs");
        const body = readFileSync(file);
        const path = `${id}.png`;
        const up = await supabase.storage.from(BUCKET).upload(path, body, { contentType: "image/png", upsert: true });
        if (up.error) { results.errors.push(`${r.name}: upload ${up.error.message}`); continue; }
        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
        const { error: updErr } = await supabase.from("recipes").update({ image_url: pub.publicUrl }).eq("id", id);
        if (updErr) { results.errors.push(`${r.name}: image_url ${updErr.message}`); continue; }
        results.uploaded += 1;
      }
    } catch (e) {
      results.errors.push(`${r.name}: ${e.message}`);
      console.error(`VIRHE ${r.name}: ${e.message}`);
    }
  }

  console.log("\n" + JSON.stringify(results, null, 2));
}

main().catch((e) => { console.error(e instanceof Error ? e.message : String(e)); process.exitCode = 1; });
