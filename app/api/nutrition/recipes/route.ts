import { NextResponse } from "next/server";

import { recipeSchema } from "@/components/workout/schemas";
import {
  deleteRecipeOnServer,
  ensureNutritionManagerRequester,
  getNutritionRequester,
  saveRecipeOnServer,
} from "@/lib/server/nutrition";

export async function GET() {
  const requesterResult = await getNutritionRequester();
  if ("error" in requesterResult) {
    return requesterResult.error;
  }

  const { supabase } = requesterResult;
  const { data, error } = await supabase.from("recipes").select("*").order("updated_at", { ascending: false });
  if (error) {
    return NextResponse.json({ message: error.message || "Reseptien haku epäonnistui." }, { status: 400 });
  }

  return NextResponse.json(data ?? []);
}

async function saveRecipe(request: Request) {
  const requesterResult = await getNutritionRequester();
  if ("error" in requesterResult) {
    return requesterResult.error;
  }

  const forbidden = ensureNutritionManagerRequester(requesterResult.requester);
  if (forbidden) {
    return forbidden;
  }

  const body = await request.json().catch(() => ({}));
  const parsed = recipeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Virheellinen resepti." }, { status: 400 });
  }

  const result = await saveRecipeOnServer(requesterResult.requester, parsed.data);
  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, recipeId: result.recipeId });
}

export async function POST(request: Request) {
  return saveRecipe(request);
}

export async function PATCH(request: Request) {
  return saveRecipe(request);
}

export async function DELETE(request: Request) {
  const requesterResult = await getNutritionRequester();
  if ("error" in requesterResult) {
    return requesterResult.error;
  }

  const forbidden = ensureNutritionManagerRequester(requesterResult.requester);
  if (forbidden) {
    return forbidden;
  }

  const recipeId = new URL(request.url).searchParams.get("id")?.trim();
  if (!recipeId) {
    return NextResponse.json({ message: "Reseptin id puuttuu." }, { status: 400 });
  }

  const result = await deleteRecipeOnServer(recipeId);
  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
