import { NextResponse } from "next/server";

import { nutritionProfileSchema } from "@/components/workout/schemas";
import {
  ensureAdminRequester,
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

  const forbidden = ensureAdminRequester(requesterResult.requester);
  if (forbidden) {
    return forbidden;
  }

  const body = await request.json().catch(() => ({}));
  const parsed = nutritionProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Virheellinen ravintoprofiili." }, { status: 400 });
  }

  const result = await saveNutritionProfileOnServer(requesterResult.requester, parsed.data);
  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
