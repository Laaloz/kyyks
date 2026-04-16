import { NextResponse } from "next/server";
import { z } from "zod";

import { saveIngredientOnServer, ensureAdminRequester, getNutritionRequester } from "@/lib/server/nutrition";

const fineliImportSchema = z.object({
  items: z.array(
    z.object({
      name: z.string().min(2),
      displayName: z.string().optional(),
      sourceExternalId: z.string().optional(),
      defaultPurchaseUnit: z.enum(["g", "kg", "ml", "l", "pcs", "pack"]).optional(),
      gramsPerUnit: z.number().optional(),
      kcalPer100: z.number().min(0),
      proteinPer100: z.number().min(0),
      carbsPer100: z.number().min(0),
      fatPer100: z.number().min(0),
    }),
  ).min(1),
});

export async function POST(request: Request) {
  const requesterResult = await getNutritionRequester();
  if ("error" in requesterResult) {
    return requesterResult.error;
  }

  const forbidden = ensureAdminRequester(requesterResult.requester);
  if (forbidden) {
    return forbidden;
  }

  const body = await request.json().catch(() => ({}));
  const parsed = fineliImportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Virheellinen Fineli-import." }, { status: 400 });
  }

  for (const item of parsed.data.items) {
    const result = await saveIngredientOnServer(requesterResult.requester, {
      ...item,
      source: "fineli",
    });
    if (!result.ok) {
      return NextResponse.json({ message: result.message }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true, count: parsed.data.items.length });
}
