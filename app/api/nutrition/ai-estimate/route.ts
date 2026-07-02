import { NextResponse } from "next/server";

import { estimateFoodFromImage, estimateFoodFromText } from "@/lib/server/ai-food";
import { getNutritionRequester } from "@/lib/server/nutrition";

// AI-arvio kutsuu Geminiä (teksti ajatteluineen jopa ~20 s, kuva ~12 s) ja voi vielä tehdä Open
// Food Facts -varahaun. Ilman tätä alustan serverless-oletus (esim. Vercel 10 s) katkaisee funktion
// ennen koodin omaa aikakatkaisua → etenkin monikomponenttihaku "ei palauta tuloksia". Pahin
// laillinen ketju (pika-arvio 8 s + rinnakkainen ajatteleva uusinta 20 s + kiintiökysely) hipoo
// 30 sekuntia → 60 antaa turvamarginaalin, ettei alusta katkaise ennen koodin omia timeoutteja.
// Itse hostatuilla (next start) tämä on harmiton no-op.
export const maxDuration = 60;

// Base64-katto: ~6 MB kuva (kerroin 4/3). Asiakas pienentää kuvan ennen lähetystä.
const MAX_BASE64_LENGTH = 8_000_000;
const ALLOWED_MIME = /^image\/(jpeg|png|webp|heic|heif)$/i;

type BodyPayload = {
  imageBase64?: string;
  mimeType?: string;
  query?: string;
};

export async function POST(request: Request) {
  const requesterResult = await getNutritionRequester();
  if ("error" in requesterResult) {
    return requesterResult.error;
  }

  const body = (await request.json().catch(() => null)) as BodyPayload | null;
  const query = typeof body?.query === "string" ? body.query.trim() : "";
  const imageBase64 = typeof body?.imageBase64 === "string" ? body.imageBase64 : "";
  const mimeType = typeof body?.mimeType === "string" ? body.mimeType : "";

  // Tekstihaku: arvioi makrot ruoan nimen perusteella (haun "ei löytynyt" -polku).
  if (query) {
    if (query.length < 2 || query.length > 120) {
      return NextResponse.json({ message: "Anna ruoan nimi." }, { status: 400 });
    }

    const result = await estimateFoodFromText({
      userId: requesterResult.requester.id,
      query,
    });

    if (!result.ok) {
      return NextResponse.json({ message: result.message }, { status: result.status });
    }

    return NextResponse.json({ estimate: result.estimate });
  }

  // Kuvahaku.
  if (!imageBase64 || !mimeType) {
    return NextResponse.json({ message: "Anna kuva tai ruoan nimi." }, { status: 400 });
  }

  if (!ALLOWED_MIME.test(mimeType)) {
    return NextResponse.json({ message: "Tukematon kuvamuoto." }, { status: 400 });
  }

  if (imageBase64.length > MAX_BASE64_LENGTH) {
    return NextResponse.json({ message: "Kuva on liian suuri. Kokeile pienempää." }, { status: 413 });
  }

  const result = await estimateFoodFromImage({
    userId: requesterResult.requester.id,
    imageBase64,
    mimeType,
  });

  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: result.status });
  }

  return NextResponse.json({ estimate: result.estimate });
}
