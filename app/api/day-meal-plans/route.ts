import { NextResponse } from "next/server";

import { mapDayMealPlanRow, type DayMealPlanRow } from "@/lib/server/training-sync";
import type { DayMealFoodSource, DayMealSource, MealTag } from "@/lib/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const MEAL_TAGS: MealTag[] = ["breakfast", "lunch", "snack", "dinner", "evening_snack"];
const SOURCES: DayMealSource[] = ["plan", "swapped", "added"];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const DAY_MEAL_SELECT =
  "id, athlete_id, plan_date, meal_tag, recipe_id, source, servings, eaten_at, position, ingredient_id, grams, food_name, kcal_per_100, protein_per_100, carbs_per_100, fat_per_100, food_source, ai_status, created_at, updated_at";

// Kevyt synkka: vain kirjautuneen käyttäjän omat ateriarivit (ei koko app-state-snapshotia).
// Tämä korvaa aterioiden lisäys/poisto/check-mutaatioissa raskaan full-refetchin.
export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ message: "Supabase ei ole käytössä tässä ympäristössä." }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ message: "Kirjaudu sisään." }, { status: 401 });
  }

  const date = new URL(request.url).searchParams.get("date");
  let query = supabase.from("day_meal_plans").select(DAY_MEAL_SELECT).eq("athlete_id", user.id);
  if (date && DATE_PATTERN.test(date)) {
    query = query.eq("plan_date", date);
  }

  const { data, error } = await query
    .order("plan_date", { ascending: false })
    .order("position", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(500)
    .returns<DayMealPlanRow[]>();

  if (error) {
    return NextResponse.json({ message: "Aterioiden haku epäonnistui." }, { status: 500 });
  }

  return NextResponse.json({ dayMealPlans: (data ?? []).map(mapDayMealPlanRow) });
}

type AdHocFoodPayload = {
  name?: string;
  kcalPer100?: number;
  proteinPer100?: number;
  carbsPer100?: number;
  fatPer100?: number;
  source?: DayMealFoodSource;
};

type BodyPayload = {
  planDate?: string;
  mealTag?: MealTag;
  source?: DayMealSource;
  servings?: number;
  position?: number;
  // Reseptirivi:
  recipeId?: string;
  // Ad hoc -ruoka: olemassa oleva katalogiaines + annos grammoina:
  ingredientId?: string;
  grams?: number;
  // Ad hoc -ruoka: suora snapshot ilman katalogiriviä:
  food?: AdHocFoodPayload;
  // Pikalisäys: luo "arvioidaan"-rivi, joka täydennetään AI:lla PATCHilla.
  pending?: boolean;
  foodName?: string;
};

function toFoodSource(source: string | null | undefined): DayMealFoodSource {
  if (source === "fineli") return "fineli";
  if (source === "ai") return "ai";
  return "manual";
}

function isValidGrams(value: unknown): value is number {
  const grams = Number(value);
  return Number.isFinite(grams) && grams > 0 && grams <= 5000;
}

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
  const source = body?.source ?? "added";
  const position = Number.isFinite(Number(body?.position)) ? Math.trunc(Number(body?.position)) : 0;

  if (!planDate || !DATE_PATTERN.test(planDate)) {
    return NextResponse.json({ message: "Anna kelvollinen päivä." }, { status: 400 });
  }

  if (!mealTag || !MEAL_TAGS.includes(mealTag)) {
    return NextResponse.json({ message: "Valitse ateriapaikka." }, { status: 400 });
  }

  if (!SOURCES.includes(source)) {
    return NextResponse.json({ message: "Tuntematon aterian lähde." }, { status: 400 });
  }

  // --- Pikalisäys: keskeneräinen "arvioidaan"-rivi (täydennetään AI-PATCHilla) ---
  if (body?.pending) {
    const foodName = typeof body.foodName === "string" ? body.foodName.trim() : "";
    if (!foodName) {
      return NextResponse.json({ message: "Anna ruoan nimi." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("day_meal_plans")
      .insert({
        athlete_id: user.id,
        plan_date: planDate,
        meal_tag: mealTag,
        recipe_id: null,
        source: "added",
        servings: 1,
        position,
        grams: 100,
        food_name: foodName,
        kcal_per_100: 0,
        protein_per_100: 0,
        carbs_per_100: 0,
        fat_per_100: 0,
        food_source: "ai",
        ai_status: "pending",
      })
      .select("id")
      .maybeSingle<{ id: string }>();

    if (error) {
      return NextResponse.json({ message: "Aterian lisäys epäonnistui." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: data?.id });
  }

  // --- Ad hoc -ruoka: olemassa oleva katalogiaines (Fineli tai oma tuote) + grammat ---
  if (body?.ingredientId) {
    if (!isValidGrams(body.grams)) {
      return NextResponse.json({ message: "Anna kelvollinen annoskoko grammoina." }, { status: 400 });
    }

    const { data: ingredient, error: ingredientError } = await supabase
      .from("ingredient_catalog")
      .select("name, display_name, source, kcal_per_100, protein_per_100, carbs_per_100, fat_per_100")
      .eq("id", body.ingredientId)
      .maybeSingle<{
        name: string;
        display_name: string | null;
        source: string;
        kcal_per_100: number | string;
        protein_per_100: number | string;
        carbs_per_100: number | string;
        fat_per_100: number | string;
      }>();

    if (ingredientError || !ingredient) {
      return NextResponse.json({ message: "Valittua ruokaa ei löytynyt." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("day_meal_plans")
      .insert({
        athlete_id: user.id,
        plan_date: planDate,
        meal_tag: mealTag,
        recipe_id: null,
        source: "added",
        servings: 1,
        position,
        ingredient_id: body.ingredientId,
        grams: Number(body.grams),
        food_name: ingredient.display_name?.trim() || ingredient.name,
        kcal_per_100: Number(ingredient.kcal_per_100) || 0,
        protein_per_100: Number(ingredient.protein_per_100) || 0,
        carbs_per_100: Number(ingredient.carbs_per_100) || 0,
        fat_per_100: Number(ingredient.fat_per_100) || 0,
        food_source: toFoodSource(ingredient.source),
      })
      .select("id")
      .maybeSingle<{ id: string }>();

    if (error) {
      return NextResponse.json({ message: "Aterian lisäys epäonnistui." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: data?.id });
  }

  // --- Ad hoc -ruoka: suora snapshot ilman katalogiriviä (kertaluonteinen) ---
  if (body?.food?.name) {
    if (!isValidGrams(body.grams)) {
      return NextResponse.json({ message: "Anna kelvollinen annoskoko grammoina." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("day_meal_plans")
      .insert({
        athlete_id: user.id,
        plan_date: planDate,
        meal_tag: mealTag,
        recipe_id: null,
        source: "added",
        servings: 1,
        position,
        grams: Number(body.grams),
        food_name: body.food.name.trim(),
        kcal_per_100: Number(body.food.kcalPer100) || 0,
        protein_per_100: Number(body.food.proteinPer100) || 0,
        carbs_per_100: Number(body.food.carbsPer100) || 0,
        fat_per_100: Number(body.food.fatPer100) || 0,
        food_source: toFoodSource(body.food.source),
      })
      .select("id")
      .maybeSingle<{ id: string }>();

    if (error) {
      return NextResponse.json({ message: "Aterian lisäys epäonnistui." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: data?.id });
  }

  // --- Reseptirivi (alkuperäinen käyttäytyminen) ---
  const recipeId = body?.recipeId;
  const servings = Number(body?.servings ?? 1);

  if (!recipeId) {
    return NextResponse.json({ message: "Valitse resepti tai ruoka." }, { status: 400 });
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
