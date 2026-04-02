import { NextResponse } from "next/server";

import { createRequestTimer } from "@/lib/server/request-timing";
import { completeWorkoutOnServer } from "@/lib/server/training-workflows";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { z } from "zod";

const requestSchema = z.object({
  expectedUpdatedAt: z.string().datetime(),
});

export async function POST(request: Request, context: { params: Promise<{ scheduledWorkoutId: string }> }) {
  const timer = createRequestTimer("workout-complete");
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return timer.json({ message: "Supabase ei ole käytössä tässä ympäristössä." }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return timer.json({ message: "Kirjaudu sisään ennen treenin viimeistelyä." }, { status: 401 });
  }

  const { data: requester } = await supabase
    .from("profiles")
    .select("id, role, email, full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (!requester) {
    return timer.json({ message: "Käyttäjäprofiilia ei löytynyt." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return timer.json({ message: "Virheellinen treenin viimeistelypyyntö." }, { status: 400 });
  }

  const { scheduledWorkoutId } = await context.params;
  const result = await completeWorkoutOnServer({
    requester,
    scheduledWorkoutId,
    expectedUpdatedAt: parsed.data.expectedUpdatedAt,
  });

  console.info("[workout-action] complete", {
    userId: user.id,
    scheduledWorkoutId,
    ok: result.ok,
    message: result.ok ? undefined : result.message,
  });

  if (!result.ok) {
    return timer.json({ message: result.message, code: result.code }, { status: result.code?.startsWith("stale") ? 409 : 400 });
  }

  timer.log({ userId: user.id, scheduledWorkoutId });
  return timer.json({ ok: true, updatedAt: result.updatedAt, completedAt: result.completedAt });
}
