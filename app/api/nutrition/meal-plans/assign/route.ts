import { NextResponse } from "next/server";

import { assignedMealPlanSchema } from "@/components/workout/schemas";
import {
  assignMealPlanOnServer,
  ensureAdminRequester,
  getNutritionRequester,
} from "@/lib/server/nutrition";

export async function POST(request: Request) {
  const requesterResult = await getNutritionRequester();
  if ("error" in requesterResult) {
    return requesterResult.error;
  }

  const forbidden = ensureAdminRequester(requesterResult.requester);
  if (forbidden) {
    return forbidden;
  }

  const body = await request.json().catch(() => ({}));
  const parsed = assignedMealPlanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Virheellinen ateriapohjan jako." }, { status: 400 });
  }

  const result = await assignMealPlanOnServer(requesterResult.requester, parsed.data);
  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, assignedPlanId: result.assignedPlanId });
}
