import { NextResponse } from "next/server";

import type { DayMealSource, MealTag } from "@/lib/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const SOURCES: DayMealSource[] = ["plan", "swapped", "added"];
const MEAL_TAGS: MealTag[] = ["breakfast", "lunch", "snack", "dinner", "evening_snack"];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ entryId: string }> },
) {
  const { entryId } = await params;
  if (!UUID_PATTERN.test(entryId)) {
    return NextResponse.json({ message: "Aterian tunniste ei ole vielä valmis. Yritä hetken päästä uudelleen." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ message: "Supabase ei ole käytössä tässä ympäristössä." }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ message: "Kirjaudu sisään ennen aterian poistoa." }, { status: 401 });
  }

  const { error } = await supabase.from("day_meal_plans").delete().eq("id", entryId);
  if (error) {
    return NextResponse.json({ message: "Aterian poisto epäonnistui." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

type PatchBodyPayload = {
  recipeId?: string;
  source?: DayMealSource;
  servings?: number;
  // Ad hoc -ruoan annoskoon säätö grammoina.
  grams?: number;
  // Ad hoc -ruoan muokkaus / AI-arvion valmistuminen.
  foodName?: string;
  kcalPer100?: number;
  proteinPer100?: number;
  carbsPer100?: number;
  fatPer100?: number;
  // null = valmis; 'pending'/'failed' = AI-tila.
  aiStatus?: "pending" | "failed" | null;
  // null = merkitse syömättömäksi; ISO-aikaleima = merkitse syödyksi.
  eatenAt?: string | null;
  // Ad hoc -ruoan siirto toiseen ateriapaikkaan + uusi järjestyspaikka kohderyhmässä.
  mealTag?: MealTag;
  position?: number;
};

const PER_100_FIELDS: Array<{ key: "kcalPer100" | "proteinPer100" | "carbsPer100" | "fatPer100"; column: string; max: number }> = [
  { key: "kcalPer100", column: "kcal_per_100", max: 1000 },
  { key: "proteinPer100", column: "protein_per_100", max: 100 },
  { key: "carbsPer100", column: "carbs_per_100", max: 100 },
  { key: "fatPer100", column: "fat_per_100", max: 100 },
];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ entryId: string }> },
) {
  const { entryId } = await params;
  if (!UUID_PATTERN.test(entryId)) {
    return NextResponse.json({ message: "Aterian tunniste ei ole vielä valmis. Yritä hetken päästä uudelleen." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ message: "Supabase ei ole käytössä tässä ympäristössä." }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ message: "Kirjaudu sisään ennen aterian muokkausta." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as PatchBodyPayload | null;
  if (!body) {
    return NextResponse.json({ message: "Virheellinen pyyntö." }, { status: 400 });
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.recipeId !== undefined) {
    if (!body.recipeId) {
      return NextResponse.json({ message: "Valitse resepti." }, { status: 400 });
    }
    update.recipe_id = body.recipeId;
  }

  if (body.source !== undefined) {
    if (!SOURCES.includes(body.source)) {
      return NextResponse.json({ message: "Tuntematon aterian lähde." }, { status: 400 });
    }
    update.source = body.source;
  }

  if (body.mealTag !== undefined) {
    if (!MEAL_TAGS.includes(body.mealTag)) {
      return NextResponse.json({ message: "Tuntematon ateriapaikka." }, { status: 400 });
    }
    update.meal_tag = body.mealTag;
  }

  if (body.position !== undefined) {
    const position = Number(body.position);
    if (!Number.isFinite(position) || position < 0) {
      return NextResponse.json({ message: "Virheellinen järjestys." }, { status: 400 });
    }
    update.position = position;
  }

  if (body.servings !== undefined) {
    const servings = Number(body.servings);
    if (!Number.isFinite(servings) || servings <= 0) {
      return NextResponse.json({ message: "Annoskoon on oltava suurempi kuin 0." }, { status: 400 });
    }
    update.servings = servings;
  }

  if (body.grams !== undefined) {
    const grams = Number(body.grams);
    if (!Number.isFinite(grams) || grams <= 0 || grams > 5000) {
      return NextResponse.json({ message: "Anna kelvollinen annoskoko grammoina." }, { status: 400 });
    }
    update.grams = grams;
  }

  if (body.foodName !== undefined) {
    const name = typeof body.foodName === "string" ? body.foodName.trim() : "";
    if (!name) {
      return NextResponse.json({ message: "Anna ruoan nimi." }, { status: 400 });
    }
    update.food_name = name;
  }

  for (const field of PER_100_FIELDS) {
    const value = body[field.key];
    if (value !== undefined) {
      const num = Number(value);
      if (!Number.isFinite(num) || num < 0 || num > field.max) {
        return NextResponse.json({ message: "Tarkista ravintoarvot." }, { status: 400 });
      }
      update[field.column] = num;
    }
  }

  if (body.aiStatus !== undefined) {
    if (body.aiStatus !== null && body.aiStatus !== "pending" && body.aiStatus !== "failed") {
      return NextResponse.json({ message: "Tuntematon AI-tila." }, { status: 400 });
    }
    update.ai_status = body.aiStatus;
  }

  if (body.eatenAt !== undefined) {
    if (body.eatenAt === null) {
      update.eaten_at = null;
    } else {
      const eatenAtDate = new Date(body.eatenAt);
      if (!Number.isFinite(eatenAtDate.getTime())) {
        return NextResponse.json({ message: "Virheellinen aikaleima." }, { status: 400 });
      }
      update.eaten_at = eatenAtDate.toISOString();
    }
  }

  const { error } = await supabase.from("day_meal_plans").update(update).eq("id", entryId);
  if (error) {
    return NextResponse.json({ message: "Aterian muokkaus epäonnistui." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
