import { NextResponse } from "next/server";

import { ingredientSchema } from "@/components/workout/schemas";
import {
  deleteIngredientOnServer,
  getNutritionRequester,
  saveIngredientOnServer,
} from "@/lib/server/nutrition";
import { fetchAllIngredientRows, mapIngredientRow } from "@/lib/server/training-sync";

// Koko katalogi mapattuna (Ingredient[]). Tämä on tarvittaessa-lataus: oletussynkka lataa vain
// kevennetyn katalogin, ja reseptieditori/admin hakee koko Fineli-valikoiman tästä.
export async function GET() {
  const requesterResult = await getNutritionRequester();
  if ("error" in requesterResult) {
    return requesterResult.error;
  }

  const { supabase } = requesterResult;
  try {
    const rows = await fetchAllIngredientRows(supabase);
    return NextResponse.json(rows.map(mapIngredientRow));
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Raaka-aineiden haku epäonnistui." },
      { status: 400 },
    );
  }
}

async function saveIngredient(request: Request) {
  const requesterResult = await getNutritionRequester();
  if ("error" in requesterResult) {
    return requesterResult.error;
  }

  // Admin tallentaa globaaleja tuotteita; muut käyttäjät vain omia (omistus + lähde
  // pakotetaan saveIngredientOnServerissä ja RLS:ssä).
  const body = await request.json().catch(() => ({}));
  const parsed = ingredientSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    const firstError = Object.values(fieldErrors).flat().find(Boolean);
    return NextResponse.json({
      message: firstError ?? "Virheellinen raaka-aine.",
      fieldErrors,
    }, { status: 400 });
  }

  const result = await saveIngredientOnServer(requesterResult.requester, parsed.data);
  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  return saveIngredient(request);
}

export async function PATCH(request: Request) {
  return saveIngredient(request);
}

export async function DELETE(request: Request) {
  const requesterResult = await getNutritionRequester();
  if ("error" in requesterResult) {
    return requesterResult.error;
  }

  const body = (await request.json().catch(() => ({}))) as { id?: unknown };
  const ingredientId = typeof body.id === "string" ? body.id : "";
  if (!ingredientId) {
    return NextResponse.json({ message: "Raaka-aineen tunniste puuttuu." }, { status: 400 });
  }

  const result = await deleteIngredientOnServer(requesterResult.requester, ingredientId);
  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
