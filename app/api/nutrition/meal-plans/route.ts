import { NextResponse } from "next/server";

import { mealPlanTemplateSchema } from "@/components/workout/schemas";
import {
  ensureNutritionManagerRequester,
  getNutritionRequester,
  saveMealPlanTemplateOnServer,
} from "@/lib/server/nutrition";

export async function GET() {
  const requesterResult = await getNutritionRequester();
  if ("error" in requesterResult) {
    return requesterResult.error;
  }

  const { supabase, requester } = requesterResult;
  if (requester.role === "athlete" || requester.role === "independent_athlete") {
    const { data, error } = await supabase
      .from("assigned_meal_plans")
      .select("*")
      .eq("athlete_id", requester.id)
      .eq("active", true)
      .order("assigned_at", { ascending: false });
    if (error) {
      return NextResponse.json({ message: error.message || "Ateriapohjien haku epäonnistui." }, { status: 400 });
    }
    return NextResponse.json(data ?? []);
  }

  const { data, error } = await supabase.from("meal_plan_templates").select("*").order("updated_at", { ascending: false });
  if (error) {
    return NextResponse.json({ message: error.message || "Ateriapohjien haku epäonnistui." }, { status: 400 });
  }

  return NextResponse.json(data ?? []);
}

async function saveMealPlanTemplate(request: Request) {
  const requesterResult = await getNutritionRequester();
  if ("error" in requesterResult) {
    return requesterResult.error;
  }

  const forbidden = ensureNutritionManagerRequester(requesterResult.requester);
  if (forbidden) {
    return forbidden;
  }

  const body = await request.json().catch(() => ({}));
  const parsed = mealPlanTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Virheellinen ateriapohja." }, { status: 400 });
  }

  const result = await saveMealPlanTemplateOnServer(requesterResult.requester, parsed.data);
  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, templateId: result.templateId });
}

export async function POST(request: Request) {
  return saveMealPlanTemplate(request);
}

export async function PATCH(request: Request) {
  return saveMealPlanTemplate(request);
}
