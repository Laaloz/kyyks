import { z } from "zod";

import { createRequestTimer } from "@/lib/server/request-timing";
import { syncWorkoutSetDraftsOnServer } from "@/lib/server/training-workflows";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  sets: z.array(
    z.object({
      logId: z.string().min(1).optional(),
      templateExerciseId: z.string().min(1).optional(),
      setLabel: z.string().min(1).optional(),
      actualReps: z.number().nullable().optional(),
      actualLoad: z.number().nullable().optional(),
      done: z.boolean().optional(),
    }),
  ),
});

export async function PATCH(request: Request, context: { params: Promise<{ scheduledWorkoutId: string }> }) {
  const timer = createRequestTimer("workout-set-sync");
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return timer.json({ message: "Supabase ei ole käytössä tässä ympäristössä." }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return timer.json({ message: "Kirjaudu sisään ennen sarjojen päivitystä." }, { status: 401 });
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

  const { scheduledWorkoutId } = await context.params;
  const result = await syncWorkoutSetDraftsOnServer({
    requester,
    scheduledWorkoutId,
    sets: parsed.data.sets,
  });

  if (!result.ok) {
    return timer.json({ message: result.message, code: result.code }, { status: 400 });
  }

  timer.log({ userId: user.id, scheduledWorkoutId, setCount: result.setLogs.length });
  return timer.json({
    ok: true,
    updatedAt: result.updatedAt,
    setLogs: result.setLogs,
  });
}
