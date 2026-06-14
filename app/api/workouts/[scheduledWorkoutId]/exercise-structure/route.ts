import { z } from "zod";

import { createRequestTimer } from "@/lib/server/request-timing";
import { updateWorkoutExerciseStructureOnServer } from "@/lib/server/training-workflows";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const requestSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("replace"),
    templateExerciseId: z.string().min(1),
    exerciseId: z.string().min(1),
    exerciseName: z.string().min(1),
    muscleGroup: z.enum(["shoulders", "arms", "chest", "abs", "back", "legs", "other"]).optional(),
    setCount: z.number().int().min(1).max(8).optional(),
    targetReps: z.number().int().min(1).max(50).optional(),
    targetRepsMin: z.number().int().min(1).max(50).optional(),
    targetRepsMax: z.number().int().min(1).max(50).optional(),
    targetLoad: z.number().min(0).max(2000).optional(),
    restSeconds: z.number().int().min(15).max(900).optional(),
  }),
  z.object({
    type: z.literal("add_extra"),
    exerciseId: z.string().min(1),
    exerciseName: z.string().min(1),
    muscleGroup: z.enum(["shoulders", "arms", "chest", "abs", "back", "legs", "other"]).optional(),
    setCount: z.number().int().min(1).max(8).optional(),
    targetReps: z.number().int().min(1).max(50).optional(),
    targetRepsMin: z.number().int().min(1).max(50).optional(),
    targetRepsMax: z.number().int().min(1).max(50).optional(),
    targetLoad: z.number().min(0).max(2000).optional(),
    restSeconds: z.number().int().min(15).max(900).optional(),
  }),
  z.object({
    type: z.literal("remove"),
    templateExerciseId: z.string().min(1),
  }),
]);

export async function POST(request: Request, context: { params: Promise<{ scheduledWorkoutId: string }> }) {
  const timer = createRequestTimer("workout-exercise-structure");
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return timer.json({ message: "Supabase ei ole käytössä tässä ympäristössä." }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return timer.json({ message: "Kirjaudu sisään ennen treenin muokkausta." }, { status: 401 });
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
    return timer.json({ message: "Virheellinen liikemuutospyyntö." }, { status: 400 });
  }

  const { scheduledWorkoutId } = await context.params;
  const result = await updateWorkoutExerciseStructureOnServer({
    requester,
    scheduledWorkoutId,
    action: parsed.data,
  });

  if (!result.ok) {
    return timer.json({ message: result.message, code: result.code }, { status: 400 });
  }

  timer.log({ userId: user.id, scheduledWorkoutId, actionType: parsed.data.type });
  return timer.json({ ok: true, updatedAt: result.updatedAt });
}
