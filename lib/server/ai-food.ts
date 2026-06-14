import "server-only";

import { z } from "zod";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

// gemini-3.5-flash: paras Flash-laatu teksti- ja kuvahaulle (multimodaali), kulu sentit/kk
// nykykäytöllä. Google poistaa malli-ID:itä ajoittain (esim. gemini-2.0-flash → 404
// "no longer available"), joten GEMINI_MODEL voi ylikirjoittaa oletuksen ilman koodimuutosta.
// Vahvista saatavuus Google AI Studiosta.
const DEFAULT_MODEL = "gemini-3.5-flash";
const DAILY_LIMIT = 30;

const IMAGE_PROMPT = [
  "Tunnista kuvassa näkyvä ruoka ja arvioi sen ravintosisältö.",
  "Palauta arvio: ruoan nimi suomeksi, arvioitu annoskoko grammoina,",
  "sekä energia ja makrot PER 100 GRAMMAA (kcal, proteiini, hiilihydraatit, rasva).",
  "Jos lautasella on useita ruokia, arvioi koko annos yhtenä kokonaisuutena.",
  "Arvio on suuntaa-antava; vastaa pelkkä JSON ilman selityksiä.",
].join(" ");

function textPrompt(query: string): string {
  return [
    `Arvioi ruoan "${query}" ravintosisältö.`,
    "Palauta: siistitty nimi suomeksi, tyypillinen annoskoko grammoina,",
    "sekä energia ja makrot PER 100 GRAMMAA (kcal, proteiini, hiilihydraatit, rasva).",
    'Jos käyttäjä ilmoitti määrän tai kappalemäärän (esim. "2 banaania"), säilytä se nimessä',
    "ja huomioi se annoskoossa grammoina.",
    "Arvio on suuntaa-antava; vastaa pelkkä JSON ilman selityksiä.",
  ].join(" ");
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
});

export type FineliMatch = {
  ingredientId: string;
  name: string;
  kcalPer100: number;
  proteinPer100: number;
  carbsPer100: number;
  fatPer100: number;
};

export type AiFoodEstimate = z.infer<typeof estimateSchema> & {
  fineliMatch?: FineliMatch;
};

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

async function findFineliMatch(supabase: SupabaseClient, name: string): Promise<FineliMatch | undefined> {
  const term = name.trim();
  if (term.length < 3) {
    return undefined;
  }

  // Yksiselitteinen osuma: jos haulle löytyy tasan yksi Fineli-rivi, tarjotaan sen
  // tarkat arvot. Useampi osuma jätetään pois (epävarma), jolloin käytetään AI-arviota.
  const { data } = await supabase
    .from("ingredient_catalog")
    .select("id, name, display_name, kcal_per_100, protein_per_100, carbs_per_100, fat_per_100")
    .eq("source", "fineli")
    .ilike("name", `%${term}%`)
    .limit(2);

  if (!data || data.length !== 1) {
    return undefined;
  }

  const row = data[0] as {
    id: string;
    name: string;
    display_name: string | null;
    kcal_per_100: number | string;
    protein_per_100: number | string;
    carbs_per_100: number | string;
    fat_per_100: number | string;
  };

  return {
    ingredientId: row.id,
    name: row.display_name?.trim() || row.name,
    kcalPer100: Number(row.kcal_per_100) || 0,
    proteinPer100: Number(row.protein_per_100) || 0,
    carbsPer100: Number(row.carbs_per_100) || 0,
    fatPer100: Number(row.fat_per_100) || 0,
  };
}

// Jaettu Gemini-kutsu: rate limit + kutsu + turvallinen parsinta + hybridi Fineli-osuma.
// `parts` on Gemini-pyynnön sisältö (teksti ja/tai kuva).
async function runGeminiEstimate(
  supabase: SupabaseClient,
  userId: string,
  parts: unknown[],
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

  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  let response: Response | null = null;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
          // Ruoka-arvio on muistinvaraista poimintaa, ei päättelyä — "thinking" ei paranna
          // tulosta mutta hidastaa rajusti (3.5-flash: ~7s → ~1s) ja maksaa. 3.5 kunnioittaa
          // budjetin 0 täysin (thoughtTokens=0). Koodi ei rajaa maxOutputTokens → JSON ei jää
          // tyhjäksi vaikka jokin malli pakottaisi minimi-thinkingin.
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });
  } catch {
    return { ok: false, status: 502, message: "AI-palveluun ei saatu yhteyttä." };
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    console.warn(`[ai-food] Gemini ${response.status} (${model}): ${errorBody.slice(0, 500)}`);
    if (response.status === 429) {
      return {
        ok: false,
        status: 429,
        message: "AI-palvelun kiintiö on täynnä tai ruuhkautunut. Yritä myöhemmin tai täytä arvot itse.",
      };
    }
    return { ok: false, status: 502, message: "AI-arvio epäonnistui. Yritä uudelleen tai täytä arvot itse." };
  }

  const payload = (await response.json().catch(() => null)) as
    | { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
    | null;
  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    return { ok: false, status: 502, message: "AI-vastaus oli tyhjä. Yritä uudelleen." };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(stripCodeFences(text));
  } catch {
    return { ok: false, status: 502, message: "AI-vastausta ei voitu lukea. Yritä uudelleen." };
  }

  const parsed = estimateSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return { ok: false, status: 502, message: "AI-arvio oli puutteellinen. Yritä uudelleen tai täytä itse." };
  }

  // Kirjataan vain onnistunut kutsu — epäonnistumiset (esim. Geminin 429) eivät polta omaa
  // vuorokausikiintiötä.
  await adminClient.from("ai_usage_events").insert({ user_id: userId, kind: "food_estimate" });

  const fineliMatch = await findFineliMatch(supabase, parsed.data.name);
  return { ok: true, estimate: { ...parsed.data, fineliMatch } };
}

export async function estimateFoodFromImage(args: {
  supabase: SupabaseClient;
  userId: string;
  imageBase64: string;
  mimeType: string;
}): Promise<AiFoodResult> {
  return runGeminiEstimate(args.supabase, args.userId, [
    { text: IMAGE_PROMPT },
    { inline_data: { mime_type: args.mimeType, data: args.imageBase64 } },
  ]);
}

export async function estimateFoodFromText(args: {
  supabase: SupabaseClient;
  userId: string;
  query: string;
}): Promise<AiFoodResult> {
  return runGeminiEstimate(args.supabase, args.userId, [{ text: textPrompt(args.query) }]);
}
