import { NextResponse } from "next/server";

import { createRequestTimer } from "@/lib/server/request-timing";
import { startScheduledWorkoutOnServer } from "@/lib/server/training-workflows";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(_request: Request, context: { params: Promise<{ scheduledWorkoutId: string }> }) {
  const timer = createRequestTimer("scheduled-workout-start");
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return timer.json({ message: "Supabase ei ole käytössä tässä ympäristössä." }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  timer.checkpoint("auth");

  if (!user) {
    return timer.json({ message: "Kirjaudu sisään ennen treenin käynnistystä." }, { status: 401 });
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

  const { scheduledWorkoutId } = await context.params;
  const result = await startScheduledWorkoutOnServer({
    requester,
    scheduledWorkoutId,
  });
  timer.checkpoint("start", { scheduledWorkoutId });

  if (!result.ok) {
    return timer.json({ message: result.message }, { status: 400 });
  }

  timer.log({ userId: user.id, scheduledWorkoutId });
  return timer.json({
    ok: true,
    scheduledWorkoutId,
    updatedAt: result.updatedAt,
    scheduledWorkout: result.payload?.scheduledWorkout,
    session: result.payload?.session,
  });
}
