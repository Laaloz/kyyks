import { NextResponse } from "next/server";

import { getNutritionRequester } from "@/lib/server/nutrition";
import {
  INGREDIENT_SELECT_COLUMNS,
  mapIngredientRow,
  type IngredientRow,
} from "@/lib/server/training-sync";

// Palvelinpuolen ainesosahaku: palauttaa korkeintaan RESULT_LIMIT osumaa nimihaulla.
// Korvaa koko Fineli-katalogin (tuhansia rivejä) lataamisen selaimeen, joka aiheutti
// muistipaineen/kaatuman mobiilissa (reseptieditorin ainesosahaku).
const RESULT_LIMIT = 20;
const MIN_TERM_LENGTH = 2;

export async function GET(request: Request) {
  const requesterResult = await getNutritionRequester();
  if ("error" in requesterResult) {
    return requesterResult.error;
  }

  const term = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (term.length < MIN_TERM_LENGTH) {
    return NextResponse.json({ ingredients: [] });
  }

  const { supabase } = requesterResult;
  const { data, error } = await supabase
    .from("ingredient_catalog")
    .select(INGREDIENT_SELECT_COLUMNS)
    .ilike("name", `%${term}%`)
    .order("name", { ascending: true })
    .limit(RESULT_LIMIT)
    .returns<IngredientRow[]>();

  if (error) {
    return NextResponse.json({ message: "Raaka-aineiden haku epäonnistui." }, { status: 400 });
  }

  return NextResponse.json({ ingredients: (data ?? []).map(mapIngredientRow) });
}
