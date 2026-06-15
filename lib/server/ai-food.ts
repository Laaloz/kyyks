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
// Gemini-kutsun aikakatkaisut. Tekstihaku on normaalisti ~1 s → katkaistaan tiukasti, jotta
// kortti ei jää pitkäksi aikaa "Arvioidaan…" -tilaan ruuhkassa. Kuva on epävarmempi ja kestää
// ~3-4 s (oletusbudjetti), joten sille annetaan enemmän aikaa. Timeout palauttaa 504:n, jota EI
// yritetä uudelleen.
const GEMINI_TEXT_TIMEOUT_MS = 8_000;
const GEMINI_IMAGE_TIMEOUT_MS = 12_000;

const IMAGE_PROMPT = [
  "Tunnista kuvassa näkyvä ruoka tai juoma ja arvioi sen ravintosisältö.",
  "Jos kyseessä on pakattu tuote, lue pakkauksesta brändi, tuotenimi ja mahdollinen",
  "ravintosisältöseloste, ja käytä niitä tunnistukseen (esim. pieni Pringles-tölkki →",
  '"Pringles Original"). Tunnista myös pienet pakkaukset ja pullot/tölkit.',
  "Palauta arvio: ruoan nimi suomeksi, arvioitu annoskoko grammoina,",
  "sekä energia ja makrot PER 100 GRAMMAA (kcal, proteiini, hiilihydraatit, rasva).",
  "Jos kuvassa on useita eri ruokia tai tuotteita, nimeä ne yhdessä ja arvioi koko annos yhtenä kokonaisuutena.",
  "Arvio on suuntaa-antava; vastaa pelkkä JSON ilman selityksiä.",
].join(" ");

function textPrompt(query: string): string {
  return [
    `Arvioi mitä käyttäjä söi tai joi: "${query}".`,
    'Jos syöte sisältää useita ruokia tai komponentteja (esim. "päärynä ja 10 g pähkinöitä"),',
    "yhdistä ne yhdeksi arvioksi: laske koko annoksen kokonaispaino grammoina ja makrot niin, että",
    "PER 100 GRAMMAA -arvot vastaavat koko annoksen yhteismakroja (komponenttien painotettu keskiarvo).",
    'Säilytä käyttäjän ilmoittamat määrät ja kappalemäärät (esim. "2 banaania", "10 g pähkinöitä") nimessä',
    "ja huomioi ne annoskoossa grammoina.",
    "Palauta: siistitty nimi suomeksi, annoskoko grammoina,",
    "sekä energia ja makrot PER 100 GRAMMAA (kcal, proteiini, hiilihydraatit, rasva).",
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
  options?: { thinkingBudget?: number; timeoutMs?: number },
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

  const generationConfig: Record<string, unknown> = {
    responseMimeType: "application/json",
    responseSchema: RESPONSE_SCHEMA,
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
  // vuorokausikiintiötä. Fire-and-forget: kirjaus ei saa hidastaa vastausta.
  void adminClient.from("ai_usage_events").insert({ user_id: userId, kind: "food_estimate" });

  return { ok: true, estimate: parsed.data };
}

export async function estimateFoodFromImage(args: {
  userId: string;
  imageBase64: string;
  mimeType: string;
}): Promise<AiFoodResult> {
  // Ei thinkingBudgetia → malli saa ajatella: parantaa kuvan (etenkin monen tuotteen)
  // tunnistuksen luotettavuutta. Latenssi maltillinen (~3-4s), kuvalle hyväksyttävä.
  return runGeminiEstimate(
    args.userId,
    [{ text: IMAGE_PROMPT }, { inline_data: { mime_type: args.mimeType, data: args.imageBase64 } }],
    { timeoutMs: GEMINI_IMAGE_TIMEOUT_MS },
  );
}

export async function estimateFoodFromText(args: { userId: string; query: string }): Promise<AiFoodResult> {
  const parts = [{ text: textPrompt(args.query) }];
  // Nopea yritys ilman ajattelua (~1s) kattaa valtaosan hauista.
  const fast = await runGeminiEstimate(args.userId, parts, { thinkingBudget: 0, timeoutMs: GEMINI_TEXT_TIMEOUT_MS });
  if (fast.ok || fast.status !== 502) {
    return fast;
  }
  // Vaikeampi syöte (esim. monikomponentti "päärynä ja 10 g pähkinöitä") voi palauttaa tyhjän
  // tai jäsentymättömän vastauksen ilman ajattelua → yksi uusintayritys mallin oletusbudjetilla.
  // Vain 502 (tyhjä/jäsennys/validointi) yritetään uudelleen; 429 (kiintiö), 503 ja 504 eivät.
  return runGeminiEstimate(args.userId, parts, { timeoutMs: GEMINI_TEXT_TIMEOUT_MS });
}
