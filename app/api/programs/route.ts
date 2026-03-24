import { NextResponse } from "next/server";
import { z } from "zod";

import { createProgramOnServer } from "@/lib/server/training-workflows";
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

const requestSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  athleteId: z.string(),
  athleteEmail: z.string().email().optional(),
  workouts: z.array(workoutSchema),
  startDate: z.string().optional(),
  weekCount: z.number().optional(),
  customExercises: z.array(customExerciseSchema).optional(),
});

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ message: "Supabase ei ole käytössä tässä ympäristössä." }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Kirjaudu sisään ennen ohjelman tallennusta." }, { status: 401 });
  }

  const { data: requester } = await supabase
    .from("profiles")
    .select("id, role, email, full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (!requester) {
    return NextResponse.json({ message: "Käyttäjäprofiilia ei löytynyt." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Virheellinen ohjelmapyyntö." }, { status: 400 });
  }

  const result = await createProgramOnServer({
    requester,
    payload: parsed.data,
    customExercises: parsed.data.customExercises,
  });

  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, programId: result.programId });
}
