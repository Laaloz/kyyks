import { NextResponse } from "next/server";
import { z } from "zod";

import { createRequestTimer } from "@/lib/server/request-timing";
import { startProgramWorkoutOnServer } from "@/lib/server/training-workflows";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ScheduledWorkout, WorkoutSession } from "@/lib/types";

const requestSchema = z.object({
  programId: z.string(),
  programWorkoutId: z.string(),
  autofillSetLogs: z
    .array(
      z.object({
        templateExerciseId: z.string().min(1),
        setId: z.string().min(1),
        exerciseId: z.string().min(1),
        setLabel: z.string().min(1),
        actualReps: z.number().optional(),
        actualLoad: z.number().optional(),
      }),
    )
    .optional(),
});

export async function POST(request: Request) {
  const timer = createRequestTimer("workouts-start");
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return timer.json({ message: "Supabase ei ole käytössä tässä ympäristössä." }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  timer.checkpoint("auth");

  if (!user) {
    return timer.json({ message: "Kirjaudu sisään ennen harjoituksen käynnistystä." }, { status: 401 });
  }

  const { data: requester } = await supabase
    .from("profiles")
    .select("id, role, email, full_name")
    .eq("id", user.id)
    .maybeSingle();
  timer.checkpoint("profile");

  if (!requester) {
    return timer.json({ message: "Käyttäjäprofiilia ei löytynyt." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return timer.json({ message: "Virheellinen treenipyyntö." }, { status: 400 });
  }

  const result = await startProgramWorkoutOnServer({
    requester,
    programId: parsed.data.programId,
    programWorkoutId: parsed.data.programWorkoutId,
    autofillHints: parsed.data.autofillSetLogs,
  });
  timer.checkpoint("start", { programId: parsed.data.programId, programWorkoutId: parsed.data.programWorkoutId });

  if (!result.ok) {
    return timer.json({ message: result.message }, { status: 400 });
  }

  const payload = ("payload" in result ? result.payload : undefined) as
    | { scheduledWorkout?: ScheduledWorkout; session?: WorkoutSession }
    | undefined;
  timer.log({ userId: user.id, programId: parsed.data.programId, scheduledWorkoutId: result.scheduledWorkoutId });
  return timer.json({
    ok: true,
    scheduledWorkoutId: result.scheduledWorkoutId,
    autoCancelledWorkoutTitle: "autoCancelledWorkoutTitle" in result ? result.autoCancelledWorkoutTitle : undefined,
    scheduledWorkout: payload?.scheduledWorkout,
    session: payload?.session,
  });
}
