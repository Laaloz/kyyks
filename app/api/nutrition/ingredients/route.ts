import { NextResponse } from "next/server";

import { ingredientSchema } from "@/components/workout/schemas";
import {
  deleteIngredientOnServer,
  ensureAdminRequester,
  getNutritionRequester,
  saveIngredientOnServer,
} from "@/lib/server/nutrition";

export async function GET() {
  const requesterResult = await getNutritionRequester();
  if ("error" in requesterResult) {
    return requesterResult.error;
  }

  const { supabase } = requesterResult;
  const { data, error } = await supabase.from("ingredient_catalog").select("*").order("name", { ascending: true });
  if (error) {
    return NextResponse.json({ message: error.message || "Raaka-aineiden haku epäonnistui." }, { status: 400 });
  }

  return NextResponse.json(data ?? []);
}

async function saveIngredient(request: Request) {
  const requesterResult = await getNutritionRequester();
  if ("error" in requesterResult) {
    return requesterResult.error;
  }

  const forbidden = ensureAdminRequester(requesterResult.requester);
  if (forbidden) {
    return forbidden;
  }

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

  const forbidden = ensureAdminRequester(requesterResult.requester);
  if (forbidden) {
    return forbidden;
  }

  const body = (await request.json().catch(() => ({}))) as { id?: unknown };
  const ingredientId = typeof body.id === "string" ? body.id : "";
  if (!ingredientId) {
    return NextResponse.json({ message: "Raaka-aineen tunniste puuttuu." }, { status: 400 });
  }

  const result = await deleteIngredientOnServer(ingredientId);
  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
