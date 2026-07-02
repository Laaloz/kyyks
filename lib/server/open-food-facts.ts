import "server-only";

// Open Food Facts: avoin pakkaustuotetietokanta. Käytetään brändi-/etikettituotteille tarkkojen
// pakkausselosteen arvojen hakuun, kun kuvasta löytyy viivakoodi tai kun Gemini antaa heikon
// arvion yksittäistuotteelle. OFF edellyttää tunnistavaa User-Agentia. Kaikki virheet ovat
// ei-fataaleja: paluuarvo on aina osuma tai null, jolloin Gemini-arvio jää voimaan.

const OFF_TIMEOUT_MS = 6_000;
const USER_AGENT = "Kyyks/1.0 (https://rooki.fit; nutrition tracking)";

export type OffMatch = {
  name: string;
  grams: number;
  kcalPer100: number;
  proteinPer100: number;
  carbsPer100: number;
  fatPer100: number;
};

type OffNutriments = {
  "energy-kcal_100g"?: number | string;
  energy_100g?: number | string; // kJ, jos kcal puuttuu
  proteins_100g?: number | string;
  carbohydrates_100g?: number | string;
  fat_100g?: number | string;
};

type OffProduct = {
  // product_name voi olla string; brands on v2-tuotteessa pilkkujono, search-a-liciousissa taulukko.
  product_name?: unknown;
  product_name_fi?: unknown;
  brands?: unknown;
  quantity?: unknown;
  nutriments?: OffNutriments;
};

function toNumber(value: number | string | undefined): number | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const parsed = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

/** Kenttä voi olla string tai taulukko (eri OFF-endpointit) → ensimmäinen merkkijonoarvo. */
function firstString(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (Array.isArray(value)) {
    const first = value.find((item) => typeof item === "string");
    return typeof first === "string" ? first.trim() : "";
  }
  return "";
}

/** Poimi annoskoko grammoina "quantity"-kentästä (esim. "180 g" → 180; "33 cl" → ei grammoja → 100). */
function parseGrams(quantity: unknown): number {
  const match = firstString(quantity).match(/(\d+(?:[.,]\d+)?)\s*g\b/i);
  if (match) {
    const grams = Number(match[1].replace(",", "."));
    if (Number.isFinite(grams) && grams >= 1 && grams <= 5000) {
      return Math.round(grams);
    }
  }
  return 100;
}

/** Muunna OFF-tuote sovelluksen muotoon. Vaatii täydelliset, järkevät makrot — muuten null. */
function mapProduct(product: OffProduct | undefined): OffMatch | null {
  const nutriments = product?.nutriments;
  if (!nutriments) {
    return null;
  }

  let kcal = toNumber(nutriments["energy-kcal_100g"]);
  if (kcal === null) {
    const kj = toNumber(nutriments.energy_100g);
    if (kj !== null) {
      kcal = kj / 4.184; // kJ → kcal
    }
  }
  const protein = toNumber(nutriments.proteins_100g);
  const carbs = toNumber(nutriments.carbohydrates_100g);
  const fat = toNumber(nutriments.fat_100g);

  if (kcal === null || protein === null || carbs === null || fat === null) {
    return null;
  }
  // Samat rajat kuin AI-arviolla — torju roskaa (esim. virheelliset OFF-rivit).
  if (kcal < 0 || kcal > 1000 || protein < 0 || protein > 100 || carbs < 0 || carbs > 100 || fat < 0 || fat > 100) {
    return null;
  }

  const brand = firstString(product?.brands).split(",")[0]?.trim();
  const base = firstString(product?.product_name_fi) || firstString(product?.product_name);
  const name = [brand, base].filter(Boolean).join(" ").trim() || base;
  if (!name) {
    return null;
  }

  const round1 = (value: number) => Math.round(value * 10) / 10;
  return {
    name: name.slice(0, 120),
    grams: parseGrams(product?.quantity),
    kcalPer100: Math.round(kcal),
    proteinPer100: round1(protein),
    carbsPer100: round1(carbs),
    fatPer100: round1(fat),
  };
}

async function offFetch(url: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OFF_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const PRODUCT_FIELDS = "product_name,product_name_fi,brands,quantity,nutriments";

/** Tarkka osuma viivakoodilla (kuvasta luettu EAN/UPC). Paras lähde pakkaustuotteille. */
export async function lookupByBarcode(barcode: string): Promise<OffMatch | null> {
  const code = barcode.replace(/\D/g, "");
  if (code.length < 8 || code.length > 14) {
    return null;
  }
  const data = (await offFetch(
    `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${PRODUCT_FIELDS}`,
  )) as { status?: number; product?: OffProduct } | null;
  if (!data || data.status !== 1) {
    return null;
  }
  return mapProduct(data.product);
}

/**
 * Vapaatekstihaku on meluisaa → hyväksy tulos vain, jos jokin haetun termin sana esiintyy
 * tuotenimessä. Ilman tätä ensimmäinen täysimakroinen osuma voi olla ihan väärä tuote
 * ("rahka" → satunnainen jogurtti), joka saisi silti korkeahkon varmuuden (0.7). Vertailu
 * tehdään 4 merkin sanavartalolla, jotta taivutus ja lähikielinen nimi ("banaani" / "Banana")
 * eivät hylkää aiheetta — väljä osuma on ok, koska tämä on vain varapolku.
 */
function nameMatchesQuery(productName: string, term: string): boolean {
  const name = productName.toLowerCase();
  const tokens = term
    .toLowerCase()
    .split(/[^a-zåäö0-9]+/)
    .filter((token) => token.length >= 3);
  if (!tokens.length) {
    return true; // ei vertailukelpoisia sanoja → älä hylkää turhaan
  }
  return tokens.some((token) => name.includes(token.slice(0, 4)));
}

/**
 * Nimihaku (search-a-licious -palvelu). Palautetaan ensimmäinen tulos, jolla on täydelliset
 * makrot JA jonka nimi vastaa hakutermiä. Sopii yksittäistuotteille, ei monikomponenttiaterioille.
 */
export async function searchByName(name: string): Promise<OffMatch | null> {
  const term = name.trim();
  if (term.length < 3) {
    return null;
  }
  const data = (await offFetch(
    `https://search.openfoodfacts.org/search?q=${encodeURIComponent(term)}&page_size=5&fields=${PRODUCT_FIELDS}`,
  )) as { hits?: OffProduct[] } | null;
  if (!data?.hits?.length) {
    return null;
  }
  for (const product of data.hits) {
    const match = mapProduct(product);
    if (match && nameMatchesQuery(match.name, term)) {
      return match;
    }
  }
  return null;
}
