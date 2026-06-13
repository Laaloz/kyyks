import { NextResponse } from "next/server";

import type { DayMealSource } from "@/lib/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const SOURCES: DayMealSource[] = ["plan", "swapped", "added"];

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ entryId: string }> },
) {
  const { entryId } = await params;
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
  // null = merkitse syömättömäksi; ISO-aikaleima = merkitse syödyksi.
  eatenAt?: string | null;
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ entryId: string }> },
) {
  const { entryId } = await params;
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

  if (body.servings !== undefined) {
    const servings = Number(body.servings);
    if (!Number.isFinite(servings) || servings <= 0) {
      return NextResponse.json({ message: "Annoskoon on oltava suurempi kuin 0." }, { status: 400 });
    }
    update.servings = servings;
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
