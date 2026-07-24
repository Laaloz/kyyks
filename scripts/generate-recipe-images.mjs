#!/usr/bin/env node
// Generoi reseptikuvat Imagen 4 Fast -mallilla (Gemini API).
//
//   node --env-file=.env scripts/generate-recipe-images.mjs            # generoi paikallisesti /tmp/recipe-images
//   node --env-file=.env scripts/generate-recipe-images.mjs --force    # uudista myös olemassa olevat
//   node --env-file=.env scripts/generate-recipe-images.mjs --only "Munakas,Banaanipannukakut"
//   node --env-file=.env scripts/generate-recipe-images.mjs --upload    # lataa Supabaseen + asettaa recipes.image_url
//
// Tarvitsee GEMINI_API_KEY:n. --upload lisäksi NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
// sekä cwebp:n (brew install webp) — kuvat ladataan optimoituna WebP:nä ({id}.webp).

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { recipeSeedData } from "./recipe-seed-data.mjs";

const MODEL = "imagen-4.0-fast-generate-001";
const OUT_DIR = process.env.RECIPE_IMAGE_DIR || "/tmp/recipe-images";
const BUCKET = "recipe-images";
// Latausoptimointi (--upload): skaalaa <= MAX_PX ja koodaa WebP:ksi (cwebp). 1024px PNG
// ~1,5 MB → ~50 KB WebP (kortti näyttää vain ~164px). Vaatii cwebp:n (brew install webp).
const MAX_PX = 800;
const WEBP_QUALITY = 75;
const CACHE_CONTROL = "31536000";

// Koodaa annettu kuvatiedosto optimoiduksi WebP-bufferiksi cwebp:llä.
function toOptimizedWebp(pngPath) {
  const outPath = `${pngPath}.webp`;
  execFileSync("cwebp", ["-q", String(WEBP_QUALITY), "-resize", String(MAX_PX), "0", "-mt", "-quiet", pngPath, "-o", outPath]);
  return readFileSync(outPath);
}

const STYLE =
  "Realistic photograph of real home-cooked food, professional overhead (top-down) angle, light neutral background, " +
  "soft natural daylight, authentic natural textures, slightly imperfect and unstyled like a genuine home meal, " +
  "fresh and appetizing, sharp focus, high detail, no text, no labels, no garnish overload, " +
  "no plastic-looking or fake-looking ingredients, no people, no hands.";

// Tarkat englanninkieliset kuvaukset per resepti (näkyvät ainekset + astia). Yhtenäinen tyyli STYLE:sta.
const PROMPTS = {
  "Ruisleipää ja kananmunaa": "Two slices of Finnish dark rye bread topped with cream cheese and a slice of cheese, with two boiled eggs on a plate",
  "Leipä ja proteiinivanukas": "Two slices of oat bread with margarine and turkey cold cuts on a plate, a small pot of chocolate dessert pudding beside it (not coffee, not a drink)",
  "Puuro maapähkinävoilla ja marjoilla": "A bowl of oat porridge topped with cottage cheese, fresh blueberries and a spoonful of peanut butter",
  "Vadelma-tuorepuuro": "Overnight oats with fresh raspberries and white skyr yogurt in a glass jar",
  "Rahkasmoothie": "A thick pink berry-quark smoothie in a tall glass with a banana and fresh raspberries beside it (food photograph, light neutral background, soft natural light, bright, appetizing, no text, no people)",
  "Leipä ja skyr-kulho": "A bowl of skyr yogurt topped with muesli, next to two slices of rye bread with turkey cold cuts",
  "Chia-vanukas mustikoilla": "A small glass bowl of creamy white chia seed pudding topped with fresh blueberries, healthy breakfast on a table",
  "Kana ja riisi": "Sliced pan-seared real chicken breast with light natural grill marks and visible meat fibres (authentic cooked white-meat texture, matte not glossy, not rubbery, not plastic-looking), with white rice and mixed vegetables on a plate",
  "Kanatortillat": "An open soft wheat tortilla on a plate, topped only with strips of real grilled chicken (authentic cooked meat texture), shredded lettuce, diced tomato, sliced green bell pepper and a light sprinkle of grated cheese. Only these toppings and nothing else on it",
  "Makaronilaatikko": "Finnish macaroni and minced-beef casserole in a baking dish with a golden cheese crust",
  "Pesto-pasta kanalla": "Pasta with green pesto, grilled chicken pieces and halved cherry tomatoes in a bowl",
  "Kanapyörykät ja riisi": "A plate of round browned chicken meatballs (small round balls, like Swedish meatballs, definitely not chicken fillets and not nuggets) with white rice, pineapple pieces and sweet chili sauce",
  "Nakkikastike perunoilla": "A plate of whole boiled potato chunks (clearly chunks of peeled boiled potato, absolutely no rice, no rice grains) topped with creamy light-brown sausage gravy with slices of frankfurter hot-dog sausage, Finnish home comfort food",
  "Crispy chicken -salaatti": "A generous green salad bowl with plenty of fresh iceberg lettuce leaves, cherry tomatoes, cucumber, feta cheese cubes and sweetcorn, topped with crispy golden breaded fried chicken strips (crunchy deep-fried coating, not grilled)",
  "VHH-ateria": "A low-carb plate of browned lean minced meat with cottage cheese, steamed broccoli and cherry tomatoes",
  "Helppo ja nopea rahkasetti": "A bowl of quark topped with fresh blueberries, walnuts and a drizzle of honey",
  "Proteiinirahka, hedelmä ja pähkinät": "A cup of plain quark with a whole apple and a few cashew nuts beside it on a plate",
  "Proteiinivanukas mansikoilla": "A small glass cup of chocolate protein pudding (matte soft real dessert texture, not glossy, not plastic-looking) topped with a few fresh sliced strawberries, simple and natural looking",
  "Proteiinijauhe, hedelmä ja pähkinät": "A protein shake in a glass with a banana and a few cashew nuts beside it on a plain light neutral surface (no recipe card, no note, no paper, no text or writing anywhere, no kitchen background, no people)",
  "Maissikakut ja proteiinirahka": "Two clearly separate things on a plate: corn rice cakes topped only with turkey cold-cut slices, and beside them a separate small bowl of white protein quark with sliced kiwi on top of the quark (the quark and kiwi sit in their own bowl, never on the turkey or rice cakes)",
  "Skyr-juoma, banaani ja pähkinät": "A tall glass of white drinking yogurt next to a whole banana and a small pile of cashew nuts on a table (food photograph, light neutral background, bright, no text, no people, no car)",
  "Ruisleipää vuolukanalla": "Slices of dark rye bread topped with cheese, sliced chicken, tomato and cucumber on a plate",
  "Suklainen proteiinijogurtti ja mansikat": "A small glass dish of creamy chocolate protein yogurt (matte soft real dessert texture, not glossy, not plastic-looking) topped with fresh sliced strawberries and a thin drizzle of set dark chocolate, a spoon resting in the dish, simple and natural looking",
  "Mac and cheese kanalla": "Creamy macaroni and cheese in a bowl topped with pieces of real grilled chicken breast with natural char marks and visible meat texture (authentic cooked chicken, matte surface, not glossy, rubbery or plastic-looking)",
  "Spaghetti ja jauhelihakastike": "Spaghetti with tomato minced-meat sauce on a plate",
  "Uunilohi ja maalaislohkoperunat": "A fully cooked oven-baked salmon fillet (opaque, flaky, cooked-through pink salmon, definitely not raw, not translucent, not glossy sashimi) served on a white plate with rustic oven-roasted potato wedges and bright green steamed broccoli florets",
  "Tulinen kanapasta": "Creamy spicy tomato chicken pasta in a bowl, garnished with parmesan and bell pepper",
  "Makkaraperunat": "French fries generously topped with plenty of clearly visible thick slices of grilled frankfurter hot-dog sausage, with a little cottage cheese, ketchup and a sour cream dip on a plate (lots of sausage pieces, no mushrooms)",
  "Uunifeta kanapasta": "Baked feta pasta with cherry tomatoes, grilled chicken and fresh basil in a bowl",
  "Bataatti-jauheliha bowl": "A hearty meal served in a deep round ceramic bowl, generously filled with orange roasted sweet potato cubes and browned ground beef mince, topped with a dollop of white yogurt and a sprinkle of fresh chopped herbs (absolutely no grated cheese, no cheese shreds; a deep bowl of food, not a flat plate, not a tostada, not a wrap)",
  "Sticky Korean fried chicken": "Glossy sticky Korean-style fried chicken made of boneless bite-sized chicken breast fillet chunks (cubed fillet pieces, definitely not wings, not drumsticks, no bones) coated in a shiny red-brown gochujang glaze, with white rice in a bowl, sprinkled with sesame seeds and spring onion",
  "Udon-nuudelikeitto": "Udon noodle soup with shrimp, a halved soft-boiled egg, spring onion and peanuts in a miso broth, in a bowl",
  "Kalkkunajuustovoileipä": "Oat bread sandwiches with turkey, cheese, cucumber and tomato on a plate",
  "Rahkaohukaiset proteiinivanukkaalla": "Finnish quark pancakes on a plate topped with protein pudding and fresh berries",
  "Suklainen tuorepuuro": "Chocolate overnight oats topped with banana slices in a glass jar",
  "Rahka myslillä ja marjoilla": "A bowl of quark with muesli, fresh blueberries and a spoonful of peanut butter",
  "Jogurtti myslillä ja vadelmilla": "A bowl of greek yogurt with muesli, fresh raspberries and chia seeds",
  "Hedelmiä ja proteiinirahka": "A simple clean plate with a couple of whole fresh fruits (a banana and an apple) beside a bowl of plain white quark, nothing fancy",
  "Munakas": "Close-up food photo of a classic folded yellow egg omelette on a white plate, garnished with a few cherry tomatoes and fresh green spinach leaves (a cooked omelette dish, food only, no landscape, no scenery)",
  "Banaanipannukakut": "A short stack of small fluffy pancakes on a plate topped with fresh blueberries and a dollop of white vanilla yogurt (not cookies, not biscuits)",
  "Tiramisu-tuorepuuro": "Tiramisu-style overnight oats with a cocoa base and a vanilla yogurt layer in a glass jar, dusted with cocoa",
  "Banaani-tuorepuuro": "Chocolate banana overnight oats in a glass jar, the oats mixed with cocoa, topped with banana slices and a dark chocolate drizzle (chocolate flavour, absolutely no berries, no raspberries, no blueberries)",
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
    // Erotin on ';' (ei ',') koska monessa reseptinimessä on pilkku (esim. "Proteiinijauhe, hedelmä ja pähkinät").
    else if (argv[i] === "--only") { args.only = (argv[i + 1] || "").split(";").map((s) => s.trim()).filter(Boolean); i += 1; }
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
        const body = toOptimizedWebp(file);
        const path = `${id}.webp`;
        const up = await supabase.storage.from(BUCKET).upload(path, body, {
          contentType: "image/webp",
          cacheControl: CACHE_CONTROL,
          upsert: true,
        });
        if (up.error) { results.errors.push(`${r.name}: upload ${up.error.message}`); continue; }
        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
        // Tiedostopolku ({id}.webp) pysyy samana uudelleenladattaessa, ja kuvilla on vuoden immutable-cache.
        // Lisätään versioparametri (ajan leima) → URL muuttuu → selaimen ja PWA:n service workerin cache ohittuu.
        const imageUrl = `${pub.publicUrl}?v=${Date.now()}`;
        const { error: updErr } = await supabase.from("recipes").update({ image_url: imageUrl }).eq("id", id);
        if (updErr) { results.errors.push(`${r.name}: image_url ${updErr.message}`); continue; }
        // Poista mahdollinen vanha PNG-orpo (aiemmat lataukset käyttivät {id}.png).
        await supabase.storage.from(BUCKET).remove([`${id}.png`]);
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
