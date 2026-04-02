import { NextResponse } from "next/server";
import { z } from "zod";

import { createRequestTimer } from "@/lib/server/request-timing";
import { updateWorkoutSetOnServer } from "@/lib/server/training-workflows";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  actualReps: z.number().nullable().optional(),
  actualLoad: z.number().nullable().optional(),
  done: z.boolean().optional(),
  expectedUpdatedAt: z.string().datetime().optional(),
  templateExerciseId: z.string().min(1).optional(),
  setLabel: z.string().min(1).optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ scheduledWorkoutId: string; logId: string }> }) {
  const timer = createRequestTimer("workout-set-patch");
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return timer.json({ message: "Supabase ei ole käytössä tässä ympäristössä." }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return timer.json({ message: "Kirjaudu sisään ennen sarjan päivitystä." }, { status: 401 });
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
    return timer.json({ message: "Virheellinen sarjapäivitys." }, { status: 400 });
  }

  const { scheduledWorkoutId, logId } = await context.params;
  const result = await updateWorkoutSetOnServer({
    requester,
    scheduledWorkoutId,
    logId,
    patch: parsed.data,
  });

  if (!result.ok) {
    return timer.json({ message: result.message, code: result.code }, { status: result.code === "stale_session" ? 409 : 400 });
  }

  timer.log({ userId: user.id, scheduledWorkoutId, logId });
  return timer.json({
    ok: true,
    sessionUpdatedAt: result.sessionUpdatedAt,
    setLog: result.setLog,
  });
}
