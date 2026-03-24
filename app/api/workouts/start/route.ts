import { NextResponse } from "next/server";
import { z } from "zod";

import { createRequestTimer } from "@/lib/server/request-timing";
import { startProgramWorkoutOnServer } from "@/lib/server/training-workflows";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  programId: z.string(),
  programWorkoutId: z.string(),
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

  if (!user) {
    return timer.json({ message: "Kirjaudu sisään ennen harjoituksen käynnistystä." }, { status: 401 });
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
    return timer.json({ message: "Virheellinen treenipyyntö." }, { status: 400 });
  }

  const result = await startProgramWorkoutOnServer({
    requester,
    programId: parsed.data.programId,
    programWorkoutId: parsed.data.programWorkoutId,
  });

  if (!result.ok) {
    return timer.json({ message: result.message }, { status: 400 });
  }

  timer.log({ userId: user.id, programId: parsed.data.programId, scheduledWorkoutId: result.scheduledWorkoutId });
  return timer.json({ ok: true, scheduledWorkoutId: result.scheduledWorkoutId });
}
