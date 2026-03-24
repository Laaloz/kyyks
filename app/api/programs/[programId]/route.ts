import { NextResponse } from "next/server";
import { z } from "zod";

import { deleteProgramOnServer, updateProgramOnServer } from "@/lib/server/training-workflows";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const customExerciseSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  equipment: z.string(),
  cue: z.string(),
  scope: z.enum(["global", "coach_custom"]),
  coachId: z.string().optional(),
});

const exerciseSchema = z.object({
  exerciseId: z.string().optional(),
  exerciseName: z.string().optional(),
  exerciseNameOverride: z.string().optional(),
  customExerciseName: z.string().optional(),
  customMuscleGroup: z.enum(["shoulders", "arms", "chest", "abs", "back", "legs", "other"]).optional(),
  supersetGroup: z.string().optional(),
  instruction: z.string(),
  repMode: z.enum(["exact", "range"]).optional(),
  setCount: z.number(),
  targetReps: z.number(),
  targetRepsMin: z.number().optional(),
  targetRepsMax: z.number().optional(),
  targetLoad: z.number().optional(),
  restSeconds: z.number().optional(),
  notes: z.string().optional(),
});

const workoutSchema = z.object({
  splitType: z.enum(["upper", "lower", "full_body", "custom"]),
  nameOverride: z.string().optional(),
  defaultRestSeconds: z.number(),
  exercises: z.array(exerciseSchema),
});

const patchSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  athleteId: z.string().optional(),
  workouts: z.array(workoutSchema).optional(),
  customExercises: z.array(customExerciseSchema).optional(),
});

async function getRequester() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { error: NextResponse.json({ message: "Supabase ei ole käytössä tässä ympäristössä." }, { status: 503 }) };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ message: "Kirjaudu sisään ennen ohjelman hallintaa." }, { status: 401 }) };
  }

  const { data: requester } = await supabase
    .from("profiles")
    .select("id, role, email, full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (!requester) {
    return { error: NextResponse.json({ message: "Käyttäjäprofiilia ei löytynyt." }, { status: 403 }) };
  }

  return { requester };
}

export async function PATCH(request: Request, context: { params: Promise<{ programId: string }> }) {
  const requesterResult = await getRequester();
  if ("error" in requesterResult) {
    return requesterResult.error;
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Virheellinen ohjelmapyyntö." }, { status: 400 });
  }

  const { programId } = await context.params;
  const result = await updateProgramOnServer({
    requester: requesterResult.requester,
    programId,
    payload: {
      title: parsed.data.title,
      description: parsed.data.description,
      athleteId: parsed.data.athleteId,
      workouts: parsed.data.workouts,
    },
    customExercises: parsed.data.customExercises,
  });

  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, context: { params: Promise<{ programId: string }> }) {
  const requesterResult = await getRequester();
  if ("error" in requesterResult) {
    return requesterResult.error;
  }

  const { programId } = await context.params;
  const result = await deleteProgramOnServer({
    requester: requesterResult.requester,
    programId,
  });

  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
