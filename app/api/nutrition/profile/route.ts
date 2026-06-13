import { NextResponse } from "next/server";

import { nutritionProfileSchema } from "@/components/workout/schemas";
import {
  getNutritionRequester,
  saveNutritionProfileOnServer,
} from "@/lib/server/nutrition";

export async function GET() {
  const requesterResult = await getNutritionRequester();
  if ("error" in requesterResult) {
    return requesterResult.error;
  }

  const { supabase, requester } = requesterResult;
  let query = supabase.from("nutrition_profiles").select("*").order("updated_at", { ascending: false });

  if (requester.role === "athlete" || requester.role === "independent_athlete") {
    query = query.eq("user_id", requester.id);
  } else if (requester.role === "coach") {
    const { data: assignments, error: assignmentsError } = await supabase
      .from("coach_athlete_assignments")
      .select("athlete_id")
      .eq("coach_id", requester.id)
      .eq("active", true);

    if (assignmentsError) {
      return NextResponse.json({ message: assignmentsError.message || "Valmennussuhteiden haku epäonnistui." }, { status: 400 });
    }

    const athleteIds = (assignments ?? []).map((assignment) => assignment.athlete_id).filter(Boolean);
    if (athleteIds.length === 0) {
      return NextResponse.json([]);
    }

    query = query.in("user_id", athleteIds);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ message: error.message || "Ravintoprofiilien haku epäonnistui." }, { status: 400 });
  }

  return NextResponse.json(data ?? []);
}

export async function PATCH(request: Request) {
  const requesterResult = await getNutritionRequester();
  if ("error" in requesterResult) {
    return requesterResult.error;
  }

  // Treenaaja saa tallentaa oman profiilinsa (esim. tavoite); kohdekohtainen
  // oikeus (admin / oma / valmennettava) tarkistetaan saveNutritionProfileOnServer-
  // funktiossa (canRequesterManageAthlete). RLS 038 sallii jo auth.uid() = user_id.
  const body = await request.json().catch(() => ({}));
  const parsed = nutritionProfileSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    const firstError = Object.values(fieldErrors).flat().find(Boolean);
    return NextResponse.json({
      message: firstError ?? "Virheellinen ravintoprofiili.",
      fieldErrors,
    }, { status: 400 });
  }

  const result = await saveNutritionProfileOnServer(requesterResult.requester, parsed.data);
  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
