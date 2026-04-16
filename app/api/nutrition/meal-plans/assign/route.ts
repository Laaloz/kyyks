import { NextResponse } from "next/server";

import { assignedMealPlanSchema } from "@/components/workout/schemas";
import {
  assignMealPlanOnServer,
  ensureNutritionManagerRequester,
  getNutritionRequester,
} from "@/lib/server/nutrition";

export async function POST(request: Request) {
  const requesterResult = await getNutritionRequester();
  if ("error" in requesterResult) {
    return requesterResult.error;
  }

  const forbidden = ensureNutritionManagerRequester(requesterResult.requester);
  if (forbidden) {
    return forbidden;
  }

  const body = await request.json().catch(() => ({}));
  const parsed = assignedMealPlanSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    const firstError = Object.values(fieldErrors).flat().find(Boolean);
    return NextResponse.json({
      message: firstError ?? "Virheellinen ateriapohjan jako.",
      fieldErrors,
    }, { status: 400 });
  }

  const result = await assignMealPlanOnServer(requesterResult.requester, parsed.data);
  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, assignedPlanId: result.assignedPlanId });
}
