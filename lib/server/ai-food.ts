import "server-only";

import { z } from "zod";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { lookupByBarcode, searchByName, type OffMatch } from "@/lib/server/open-food-facts";
import type { SupabaseClient } from "@supabase/supabase-js";

// gemini-2.5-flash: vakaa GA-malli, jolla on enemmän kapasiteettia → vähemmän 503-ruuhkavirheitä
// kuin uudemmalla 3.5-flashilla (testattu: 2.5 nopein ja vakain). Google poistaa malli-ID:itä
// ajoittain (esim. gemini-2.0-flash → 404), joten GEMINI_MODEL voi ylikirjoittaa oletuksen.
const DEFAULT_MODEL = "gemini-2.5-flash";
// Varamalli 503-ruuhkaan: eri (vanhempi GA) malli = eri kapasiteettipooli, joten kun ensisijainen
// on hetkellisesti ylikuormitettu, vara saattaa silti vastata. Käytetään vain uusintayrityksessä.
const FALLBACK_MODEL = "gemini-3.5-flash";
const DAILY_LIMIT = 30;
// Gemini-kutsun aikakatkaisut. Tekstihaku on normaalisti ~1 s → katkaistaan tiukasti, jotta
// kortti ei jää pitkäksi aikaa "Arvioidaan…" -tilaan ruuhkassa. Kuva on epävarmempi ja kestää
// ~3-4 s (oletusbudjetti), joten sille annetaan enemmän aikaa. Timeout palauttaa 504:n, jota EI
// yritetä uudelleen.
const GEMINI_TEXT_TIMEOUT_MS = 8_000;
// Ajatteleva uusintayritys (vaikea/heikko tekstihaku) kestää kauemmin → väljempi katkaisu.
const GEMINI_TEXT_THINKING_TIMEOUT_MS = 14_000;
const GEMINI_IMAGE_TIMEOUT_MS = 12_000;

// Kuvaprompti: selkeä tärkeysjärjestys (taulukko → viivakoodi → brändi → visuaalinen arvio) ohjaa
// mallin nopeasti oikeaan lähteeseen → vähemmän heikkoja arvioita ja siten vähemmän hidasta OFF-/
// uusintapolkua. "Anna AINA paras arvio" + kalibroitu confidence pitävät tulokset löydettävinä.
const IMAGE_PROMPT = [
  "Olet ravitsemusasiantuntija. Tunnista kuvan ruoka tai juoma ja arvioi ravintosisältö mahdollisimman tarkasti.",
  "Etene tässä tärkeysjärjestyksessä ja käytä ensimmäistä saatavilla olevaa lähdettä:",
  "1) Jos näkyy pakkauksen RAVINTOSISÄLTÖTAULUKKO, lue arvot suoraan siitä äläkä arvaa; jos arvot ovat per annos, muunna ne per 100 g.",
  "2) Jos näkyy viivakoodi, palauta sen numerot kenttään barcode (vain numerot).",
  '3) Jos tuote on pakattu, lue brändi ja tuotenimi pakkauksesta ja käytä niitä nimessä (esim. pieni Pringles-tölkki → "Pringles Original"). Tunnista myös pienet pakkaukset, pullot ja tölkit.',
  "4) Muuten arvioi ruoka visuaalisesti suomalaisen ruokakulttuurin tyypillisillä arvoilla.",
  "Jos kuvassa on useita ruokia, nimeä ne yhdessä ja arvioi koko annos yhtenä kokonaisuutena: yhteispaino grammoina ja makrot per 100 g annoksen painotettuna keskiarvona.",
  "Anna AINA paras mahdollinen arvio tunnistettavasta ruoasta — älä koskaan palauta pelkkiä nollia.",
  "Palauta: nimi suomeksi, annoskoko grammoina sekä energia ja makrot PER 100 GRAMMAA (kcal, proteiini, hiilihydraatit, rasva).",
  "confidence välillä 0–1: 0.9+ kun arvot on luettu pakkausselosteesta, 0.6–0.8 selkeästi tunnistettu ruoka, alle 0.5 epävarma.",
  "Vastaa pelkkä JSON ilman selityksiä.",
].join(" ");

// Tekstiprompti: pidetään tiiviinä ja yksiselitteisenä, jotta pikapolku (thinking pois) palauttaa
// hyvän, ei-nollan arvion jo ensimmäisellä yrityksellä → ei hidasta ajattelevaa uusintaa.
function textPrompt(query: string): string {
  return [
    `Olet ravitsemusasiantuntija. Arvioi mahdollisimman tarkasti mitä käyttäjä söi tai joi: "${query}".`,
    'Jos syöte sisältää useita komponentteja (eroteltu pilkulla, sanalla "ja" tai määrillä, esim. "banaani, proteiinivanukas ja 10 g cashewpähkinöitä"), pura se osiin, arvioi kunkin paino ja makrot erikseen ja yhdistä yhdeksi annokseksi: laske yhteispaino grammoina ja per 100 g annoksen painotettuna keskiarvona.',
    'Jos mukana on brändi- tai kauppatuote (esim. "Coop proteiinivanukas", "Valio"), käytä tuotteen pakkausselosteen tyypillisiä arvoja.',
    'Säilytä käyttäjän ilmoittamat määrät ja kappalemäärät (esim. "2 banaania", "10 g pähkinöitä") nimessä ja huomioi ne annoskoossa grammoina.',
    'Tulkitse yleiset suomalaiset ruokanimet, lyhenteet ja puhekieli (esim. "rahka", "pyttipannu", "prkl").',
    "Anna AINA paras mahdollinen arvio tunnistettavasta ruoasta — älä koskaan palauta pelkkiä nollia.",
    "Palauta: siistitty nimi suomeksi, annoskoko grammoina sekä energia ja makrot PER 100 GRAMMAA (kcal, proteiini, hiilihydraatit, rasva).",
    "confidence välillä 0–1: 0.8+ kun tunnet tuotteen hyvin, 0.5–0.7 yleisarvio, alle 0.5 epävarma.",
    "Vastaa pelkkä JSON ilman selityksiä.",
  ].join(" ");
}

/** Monikomponentti/brändi/määräsyöte on epäluotettava pikapolussa → ajatellaan heti. */
function isComplexQuery(query: string): boolean {
  const q = query.trim();
  if (!q) {
    return false;
  }
  if (/[,+&/]/.test(q)) {
    return true; // erotin → useita komponentteja
  }
  if (/\bja\b/i.test(q)) {
    return true; // "x ja y"
  }
  if (/\d\s*(g|kg|dl|ml|l|kpl|rkl|tl|kcal)\b/i.test(q)) {
    return true; // ilmoitettu määrä → komponentti
  }
  return q.split(/\s+/).length >= 4; // pitkä syöte → todennäköisesti monikomponentti
}

/** Heikko arvio: malli "luovutti" (kaikki makrot 0) tai ilmoitti matalan varmuuden. */
function isWeakEstimate(estimate: AiFoodEstimate): boolean {
  const allZero =
    estimate.kcalPer100 === 0 &&
    estimate.proteinPer100 === 0 &&
    estimate.carbsPer100 === 0 &&
    estimate.fatPer100 === 0;
  const lowConfidence = typeof estimate.confidence === "number" && estimate.confidence < 0.35;
  return allZero || lowConfidence;
}

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" },
    grams: { type: "number" },
    kcalPer100: { type: "number" },
    proteinPer100: { type: "number" },
    carbsPer100: { type: "number" },
    fatPer100: { type: "number" },
    confidence: { type: "number" },
    // Vain kuvahaussa: pakkauksen viivakoodin numerot (EAN/UPC) tarkkaa Open Food Facts -hakua varten.
    barcode: { type: "string" },
  },
  required: ["name", "grams", "kcalPer100", "proteinPer100", "carbsPer100", "fatPer100"],
};

const estimateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  grams: z.coerce.number().min(1).max(5000),
  kcalPer100: z.coerce.number().min(0).max(1000),
  proteinPer100: z.coerce.number().min(0).max(100),
  carbsPer100: z.coerce.number().min(0).max(100),
  fatPer100: z.coerce.number().min(0).max(100),
  confidence: z.coerce.number().min(0).max(1).optional(),
  barcode: z.string().trim().optional(),
});

export type AiFoodEstimate = z.infer<typeof estimateSchema>;

export type AiFoodResult =
  | { ok: true; estimate: AiFoodEstimate }
  | { ok: false; status: number; message: string };

/** Poistaa mahdolliset ```json ... ``` -aidat ja palauttaa puhtaan JSON-tekstin. */
function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("```")) {
    return trimmed
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
  }
  return trimmed;
}

async function countTodaysUsage(adminClient: SupabaseClient, userId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await adminClient
    .from("ai_usage_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since);
  return count ?? 0;
}

// Jaettu Gemini-kutsu: rate limit + kutsu + turvallinen parsinta.
// `parts` on Gemini-pyynnön sisältö (teksti ja/tai kuva).
async function runGeminiEstimate(
  userId: string,
  parts: unknown[],
  options?: { thinkingBudget?: number; timeoutMs?: number; model?: string },
): Promise<AiFoodResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { ok: false, status: 503, message: "AI-haku ei ole käytössä tässä ympäristössä." };
  }

  const adminClient = createSupabaseAdminClient();
  if (!adminClient) {
    return { ok: false, status: 503, message: "Palvelu ei ole käytettävissä." };
  }

  // Rate limit: suojaa ilmaiskiintiötä per käyttäjä per vuorokausi.
  const used = await countTodaysUsage(adminClient, userId);
  if (used >= DAILY_LIMIT) {
    return { ok: false, status: 429, message: "AI-arvioiden vuorokausiraja täynnä. Lisää ateriaan haulla tai täytä arvot itse." };
  }

  const model = options?.model || process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const generationConfig: Record<string, unknown> = {
    responseMimeType: "application/json",
    responseSchema: RESPONSE_SCHEMA,
    // temperature 0 = deterministinen: sama haku antaa saman tuloksen ja poistaa "joskus löytää,
    // joskus ei" -satunnaisuuden. Ravintoarvio on faktapoiminta, ei luovuutta vaativa tehtävä.
    temperature: 0,
  };
  // Tekstihaku on muistinvaraista poimintaa → thinking pois (thinkingBudget 0) pitää sen
  // nopeana (~1s) ilman laatuhaittaa. Kuvahaku taas on epävarmempaa visuaalista arviointia
  // (esim. monta tuotetta samassa kuvassa), ja budjetilla 0 malli voi palauttaa tyhjän/heikon
  // tuloksen → kuvalle annetaan ajatella (ei thinkingConfigia = mallin oletusbudjetti).
  if (typeof options?.thinkingBudget === "number") {
    generationConfig.thinkingConfig = { thinkingBudget: options.thinkingBudget };
  }

  // Aikakatkaisu: kun Gemini on ruuhkautunut, pyyntö voi jäädä roikkumaan kymmeniä sekunteja
  // ilman tätä → ruoka jää kortilla "Arvioidaan…" -tilaan loputtomiin. Katkaisu kattaa myös
  // vastauksen luvun (luetaan body samassa suojatussa lohkossa) ja palauttaa 504:n ajan
  // loppuessa — sitä EI yritetä uudelleen.
  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), options?.timeoutMs ?? GEMINI_TEXT_TIMEOUT_MS);
  let response: Response | null = null;
  let bodyText = "";
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig,
      }),
      signal: controller.signal,
    });
    bodyText = await response.text();
  } catch (caught) {
    const timedOut = caught instanceof Error && caught.name === "AbortError";
    return {
      ok: false,
      status: timedOut ? 504 : 502,
      message: timedOut
        ? "AI-arvio kesti liian kauan — yritä uudelleen tai täytä arvot itse."
        : "AI-palveluun ei saatu yhteyttä.",
    };
  } finally {
    clearTimeout(abortTimer);
  }

  if (!response.ok) {
    console.warn(`[ai-food] Gemini ${response.status} (${model}): ${bodyText.slice(0, 500)}`);
    if (response.status === 429) {
      return {
        ok: false,
        status: 429,
        message: "AI-palvelun kiintiö on täynnä tai ruuhkautunut. Yritä myöhemmin tai täytä arvot itse.",
      };
    }
    return { ok: false, status: 502, message: "AI-arvio epäonnistui. Yritä uudelleen tai täytä arvot itse." };
  }

  let payload: { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> } | null = null;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    payload = null;
  }
  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    console.warn(`[ai-food] tyhjä vastaus (${model}): ${bodyText.slice(0, 300)}`);
    return { ok: false, status: 502, message: "AI-vastaus oli tyhjä. Yritä uudelleen." };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(stripCodeFences(text));
  } catch {
    console.warn(`[ai-food] jäsennysvirhe (${model}): ${text.slice(0, 300)}`);
    return { ok: false, status: 502, message: "AI-vastausta ei voitu lukea. Yritä uudelleen." };
  }

  const parsed = estimateSchema.safeParse(parsedJson);
  if (!parsed.success) {
    console.warn(`[ai-food] puutteellinen arvio (${model}): ${JSON.stringify(parsedJson).slice(0, 300)}`);
    return { ok: false, status: 502, message: "AI-arvio oli puutteellinen. Yritä uudelleen tai täytä itse." };
  }

  // Kirjataan vain onnistunut kutsu — epäonnistumiset (esim. Geminin 429) eivät polta omaa
  // vuorokausikiintiötä. Fire-and-forget: kirjaus ei saa hidastaa vastausta.
  void adminClient.from("ai_usage_events").insert({ user_id: userId, kind: "food_estimate" });

  return { ok: true, estimate: parsed.data };
}

/** Open Food Facts -osuma sovelluksen arviomuotoon (korkea varmuus, pakkausselosteen arvot). */
function offToEstimate(match: OffMatch, confidence: number): AiFoodEstimate {
  return {
    name: match.name,
    grams: match.grams,
    kcalPer100: match.kcalPer100,
    proteinPer100: match.proteinPer100,
    carbsPer100: match.carbsPer100,
    fatPer100: match.fatPer100,
    confidence,
  };
}

export async function estimateFoodFromImage(args: {
  userId: string;
  imageBase64: string;
  mimeType: string;
}): Promise<AiFoodResult> {
  // Ei thinkingBudgetia → malli saa ajatella: parantaa kuvan (etenkin monen tuotteen)
  // tunnistuksen luotettavuutta. Latenssi maltillinen (~3-4s), kuvalle hyväksyttävä.
  const result = await estimateWithModelFallback(
    args.userId,
    [{ text: IMAGE_PROMPT }, { inline_data: { mime_type: args.mimeType, data: args.imageBase64 } }],
    { timeoutMs: GEMINI_IMAGE_TIMEOUT_MS },
  );
  if (!result.ok) {
    return result;
  }

  // Viivakoodi kuvassa → tarkat pakkausselosteen arvot Open Food Factsista korvaavat arvion.
  if (result.estimate.barcode) {
    const off = await lookupByBarcode(result.estimate.barcode);
    if (off) {
      return { ok: true, estimate: offToEstimate(off, 0.95) };
    }
  }
  // Ei viivakoodia mutta heikko arvio → kokeile tunnistettua nimeä OFF-nimihaulla.
  if (isWeakEstimate(result.estimate)) {
    const off = await searchByName(result.estimate.name);
    if (off) {
      return { ok: true, estimate: offToEstimate(off, 0.7) };
    }
  }
  return result;
}

// Arvio 503-sietoisesti: ensisijainen malli → tilapäisvirheessä (status 502 kattaa Googlen 503:n)
// uusinta VARAMALLILLA (eri kapasiteettipooli) → vielä yksi yritys ensisijaisella. 429 (kiintiö) ja
// 504 (timeout) eivät uusita. Koska 503 palaa nopeasti (~1 s), uusinnat ovat halpoja.
async function estimateWithModelFallback(
  userId: string,
  parts: unknown[],
  opts: { thinkingBudget?: number; timeoutMs: number },
): Promise<AiFoodResult> {
  const models = [
    process.env.GEMINI_MODEL || DEFAULT_MODEL,
    FALLBACK_MODEL,
    process.env.GEMINI_MODEL || DEFAULT_MODEL,
  ];
  let last: AiFoodResult = { ok: false, status: 502, message: "AI-arvio epäonnistui. Yritä uudelleen." };
  for (let i = 0; i < models.length; i += 1) {
    last = await runGeminiEstimate(userId, parts, { ...opts, model: models[i] });
    if (last.ok || last.status !== 502) {
      return last;
    }
    if (i < models.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
  }
  return last;
}

export async function estimateFoodFromText(args: { userId: string; query: string }): Promise<AiFoodResult> {
  const parts = [{ text: textPrompt(args.query) }];
  const complex = isComplexQuery(args.query);

  // 1) Gemini: pikapolku yksinkertaiselle, ajatteleva vaikealle/heikolle.
  let result: AiFoodResult;
  if (!complex) {
    const fast = await runGeminiEstimate(args.userId, parts, {
      thinkingBudget: 0,
      timeoutMs: GEMINI_TEXT_TIMEOUT_MS,
    });
    if (fast.ok && !isWeakEstimate(fast.estimate)) {
      return fast;
    }
    if (!fast.ok && fast.status !== 502) {
      // Kova virhe (429/503/504) ei hyödy ajattelevasta uusinnasta → siirry suoraan OFF-fallbackiin.
      result = fast;
    } else {
      if (fast.ok) {
        console.warn(`[ai-food] heikko pika-arvio "${args.query}" → uusinta ajattelulla`);
      }
      result = await estimateWithModelFallback(args.userId, parts, { timeoutMs: GEMINI_TEXT_THINKING_TIMEOUT_MS });
    }
  } else {
    // Vaikea syöte → ajatellaan heti (503-sietoinen: ensisijainen → varamalli → ensisijainen).
    result = await estimateWithModelFallback(args.userId, parts, { timeoutMs: GEMINI_TEXT_THINKING_TIMEOUT_MS });
  }

  // 2) Yksittäistuote, jolle Gemini epäonnistui/antoi heikon arvion → Open Food Facts -nimihaku.
  //    Monikomponenttiaterialle OFF ei sovi (ei yhtä tuotetta) → ohitetaan ja luotetaan Geminiin.
  if (!complex && (!result.ok || isWeakEstimate(result.estimate))) {
    const off = await searchByName(args.query);
    if (off) {
      return { ok: true, estimate: offToEstimate(off, 0.7) };
    }
  }

  return result;
}
