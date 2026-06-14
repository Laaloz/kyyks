import { NextResponse } from "next/server";

import type { DayMealSource, MealTag } from "@/lib/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const MEAL_TAGS: MealTag[] = ["breakfast", "lunch", "snack", "dinner", "evening_snack"];
const SOURCES: DayMealSource[] = ["plan", "swapped", "added"];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type BodyPayload = {
  planDate?: string;
  mealTag?: MealTag;
  recipeId?: string;
  source?: DayMealSource;
  servings?: number;
  position?: number;
};

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ message: "Supabase ei ole käytössä tässä ympäristössä." }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ message: "Kirjaudu sisään ennen aterian lisäystä." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as BodyPayload | null;
  const planDate = body?.planDate;
  const mealTag = body?.mealTag;
  const recipeId = body?.recipeId;
  const source = body?.source ?? "added";
  const servings = Number(body?.servings ?? 1);
  const position = Number.isFinite(Number(body?.position)) ? Math.trunc(Number(body?.position)) : 0;

  if (!planDate || !DATE_PATTERN.test(planDate)) {
    return NextResponse.json({ message: "Anna kelvollinen päivä." }, { status: 400 });
  }

  if (!mealTag || !MEAL_TAGS.includes(mealTag)) {
    return NextResponse.json({ message: "Valitse ateriapaikka." }, { status: 400 });
  }

  if (!recipeId) {
    return NextResponse.json({ message: "Valitse resepti." }, { status: 400 });
  }

  if (!SOURCES.includes(source)) {
    return NextResponse.json({ message: "Tuntematon aterian lähde." }, { status: 400 });
  }

  if (!Number.isFinite(servings) || servings <= 0) {
    return NextResponse.json({ message: "Annoskoon on oltava suurempi kuin 0." }, { status: 400 });
  }

  if (source === "plan") {
    const { data: existing, error: existingError } = await supabase
      .from("day_meal_plans")
      .select("id")
      .eq("athlete_id", user.id)
      .eq("plan_date", planDate)
      .eq("meal_tag", mealTag)
      .eq("source", "plan")
      .limit(1)
      .returns<Array<{ id: string }>>();

    if (existingError) {
      return NextResponse.json({ message: "Aterian lisäys epäonnistui." }, { status: 500 });
    }

    if (existing?.[0]?.id) {
      return NextResponse.json({ ok: true, id: existing[0].id });
    }
  }

  const { data, error } = await supabase
    .from("day_meal_plans")
    .insert({
      athlete_id: user.id,
      plan_date: planDate,
      meal_tag: mealTag,
      recipe_id: recipeId,
      source,
      servings,
      position,
    })
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) {
    return NextResponse.json({ message: "Aterian lisäys epäonnistui." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data?.id });
}
