import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  AppState,
  BodyMeasurement,
  CoachAthleteAssignment,
  Exercise,
  ScheduledWorkout,
  TrainingPlan,
  UserProfile,
  WorkoutNote,
  WorkoutSession,
  WorkoutTemplate,
} from "@/lib/types";

type ServerClient = SupabaseClient<any, "public", any>;

function logSyncPhase(phase: string, startedAt: number) {
  const durationMs = Number((performance.now() - startedAt).toFixed(1));
  console.info(`[timing:app-state] ${phase}`, { durationMs });
}

type ProfileRow = {
  id: string;
  role: UserProfile["role"];
  status: UserProfile["status"];
  full_name: string;
  email: string;
  default_dashboard_view: UserProfile["settings"] extends infer _ ? string | null : string | null;
  email_notifications: boolean;
  theme_mode: "light" | "dark";
  height_cm: number | string | null;
  weight_kg: number | string | null;
  waist_cm: number | string | null;
  created_at: string;
  updated_at: string;
};

type BodyMeasurementRow = {
  id: string;
  user_id: string;
  height_cm: number | string | null;
  weight_kg: number | string | null;
  waist_cm: number | string | null;
  measured_at: string;
  created_at: string;
};

type AssignmentRow = {
  id: string;
  coach_id: string;
  athlete_id: string;
  active: boolean;
  created_at: string;
};

type ExerciseRow = {
  id: string;
  external_key: string | null;
  name: string;
  category: string;
  equipment: string;
  cue: string;
  scope: Exercise["scope"];
  coach_id: string | null;
};

type TemplateRow = {
  id: string;
  coach_id: string;
  title: string;
  description: string;
  goal: string;
  split_type: WorkoutTemplate["splitType"];
  status: WorkoutTemplate["status"];
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
};

type TemplateBlockRow = {
  id: string;
  template_id: string;
  title: string;
  note: string | null;
  sort_order: number;
};

type TemplateExerciseRow = {
  id: string;
  block_id: string;
  exercise_id: string;
  instruction: string;
  sort_order: number;
};

type TemplateSetRow = {
  id: string;
  template_exercise_id: string;
  label: string;
  target_reps: number;
  target_load: number | string | null;
  rest_seconds: number;
  notes: string | null;
  sort_order: number;
};

type TrainingPlanRow = {
  id: string;
  coach_id: string;
  athlete_id: string;
  title: string;
  description: string | null;
  status: TrainingPlan["status"];
  start_date: string;
  week_count: number;
  workouts: TrainingPlan["workouts"];
  created_at: string;
  updated_at: string;
};

type ScheduledWorkoutRow = {
  id: string;
  training_plan_id: string | null;
  template_id: string | null;
  program_workout_id: string | null;
  athlete_id: string;
  coach_id: string;
  title: string;
  scheduled_date: string;
  status: ScheduledWorkout["status"];
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type WorkoutSessionRow = {
  id: string;
  scheduled_workout_id: string;
  athlete_id: string;
  energy_level: number | null;
  started_at: string;
  completed_at: string | null;
  paused_at: string | null;
  paused_duration_seconds: number | null;
  updated_at: string;
};

type WorkoutSetLogRow = {
  id: string;
  session_id: string;
  scheduled_workout_id: string;
  template_exercise_id: string;
  set_id: string;
  exercise_id: string;
  exercise_name: string;
  muscle_group: string | null;
  superset_group: string | null;
  set_label: string;
  target_reps: number;
  target_reps_min: number | null;
  target_reps_max: number | null;
  target_load: number | string | null;
  target_rest_seconds: number | null;
  program_workout_id: string | null;
  actual_reps: number | null;
  actual_load: number | string | null;
  rpe: number | string | null;
  done: boolean;
};

type WorkoutNoteRow = {
  id: string;
  session_id: string;
  athlete_id: string;
  coach_id: string;
  body: string;
  created_at: string;
  updated_at: string;
};

export type SupabaseVisibleAppStateSnapshot = Pick<
  AppState,
  | "users"
  | "bodyMeasurements"
  | "assignments"
  | "exercises"
  | "templates"
  | "plans"
  | "scheduledWorkouts"
  | "sessions"
  | "notes"
>;

function toNumberOrUndefined(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  const nextValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(nextValue) ? nextValue : undefined;
}

function mapProfileRow(profile: ProfileRow): UserProfile {
  return {
    id: profile.id,
    role: profile.role,
    fullName: profile.full_name,
    email: profile.email,
    status: profile.status,
    heightCm: toNumberOrUndefined(profile.height_cm),
    weightKg: toNumberOrUndefined(profile.weight_kg),
    waistCm: toNumberOrUndefined(profile.waist_cm),
    settings: {
      defaultDashboardView:
        profile.default_dashboard_view === "overview" ||
        profile.default_dashboard_view === "templates" ||
        profile.default_dashboard_view === "invites" ||
        profile.default_dashboard_view === "athlete-log" ||
        profile.default_dashboard_view === "conversation"
          ? profile.default_dashboard_view
          : profile.role === "athlete"
            ? "athlete-log"
            : "overview",
      emailNotifications: profile.email_notifications,
      themeMode: profile.theme_mode,
    },
    createdAt: profile.created_at,
    updatedAt: profile.updated_at,
  };
}

function mapBodyMeasurementRow(entry: BodyMeasurementRow): BodyMeasurement {
  return {
    id: entry.id,
    userId: entry.user_id,
    heightCm: toNumberOrUndefined(entry.height_cm),
    weightKg: toNumberOrUndefined(entry.weight_kg),
    waistCm: toNumberOrUndefined(entry.waist_cm),
    measuredAt: entry.measured_at,
    createdAt: entry.created_at,
  };
}

function mapAssignmentRow(entry: AssignmentRow): CoachAthleteAssignment {
  return {
    id: entry.id,
    coachId: entry.coach_id,
    athleteId: entry.athlete_id,
    active: entry.active,
    createdAt: entry.created_at,
  };
}

function mapExerciseRow(entry: ExerciseRow): Exercise {
  return {
    id: entry.external_key ?? entry.id,
    name: entry.name,
    category: entry.category,
    equipment: entry.equipment,
    cue: entry.cue,
    scope: entry.scope,
    coachId: entry.coach_id ?? undefined,
  };
}

function mapPlanRow(entry: TrainingPlanRow): TrainingPlan {
  return {
    id: entry.id,
    coachId: entry.coach_id,
    athleteId: entry.athlete_id,
    title: entry.title,
    description: entry.description ?? undefined,
    status: entry.status ?? "active",
    workouts: Array.isArray(entry.workouts) ? entry.workouts : [],
    startDate: new Date(`${entry.start_date}T08:00:00`).toISOString(),
    weekCount: entry.week_count,
    createdAt: entry.created_at,
    updatedAt: entry.updated_at,
  };
}

function mapScheduledWorkoutRow(entry: ScheduledWorkoutRow): ScheduledWorkout {
  return {
    id: entry.id,
    trainingPlanId: entry.training_plan_id ?? undefined,
    templateId: entry.template_id ?? undefined,
    programWorkoutId: entry.program_workout_id ?? undefined,
    athleteId: entry.athlete_id,
    coachId: entry.coach_id,
    title: entry.title,
    scheduledDate: entry.scheduled_date,
    status: entry.status,
    completedAt: entry.completed_at ?? undefined,
    createdAt: entry.created_at,
    updatedAt: entry.updated_at,
  };
}

function mapWorkoutNoteRow(entry: WorkoutNoteRow): WorkoutNote {
  return {
    id: entry.id,
    sessionId: entry.session_id,
    athleteId: entry.athlete_id,
    coachId: entry.coach_id,
    body: entry.body,
    createdAt: entry.created_at,
    updatedAt: entry.updated_at,
  };
}

function throwIfQueryFailed(
  label: string,
  result: {
    error: { message?: string | null } | null;
  },
) {
  if (result.error) {
    throw new Error(`${label} sync failed: ${result.error.message ?? "Unknown Supabase error."}`);
  }
}

export async function loadVisibleSupabaseAppState(
  supabase: ServerClient,
): Promise<SupabaseVisibleAppStateSnapshot> {
  const queryStartedAt = performance.now();
  const [
    profilesResult,
    bodyMeasurementsResult,
    assignmentsResult,
    exercisesResult,
    templatesResult,
    templateBlocksResult,
    templateExercisesResult,
    templateSetsResult,
    plansResult,
    scheduledWorkoutsResult,
    sessionsResult,
    setLogsResult,
    notesResult,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, role, status, full_name, email, default_dashboard_view, email_notifications, theme_mode, height_cm, weight_kg, waist_cm, created_at, updated_at",
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("body_measurements")
      .select("id, user_id, height_cm, weight_kg, waist_cm, measured_at, created_at")
      .order("measured_at", { ascending: false }),
    supabase
      .from("coach_athlete_assignments")
      .select("id, coach_id, athlete_id, active, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("exercises")
      .select("id, external_key, name, category, equipment, cue, scope, coach_id")
      .order("name", { ascending: true }),
    supabase
      .from("workout_templates")
      .select("id, coach_id, title, description, goal, split_type, status, created_at, updated_at, created_by, updated_by")
      .order("created_at", { ascending: false }),
    supabase
      .from("workout_template_blocks")
      .select("id, template_id, title, note, sort_order")
      .order("sort_order", { ascending: true }),
    supabase
      .from("workout_template_exercises")
      .select("id, block_id, exercise_id, instruction, sort_order")
      .order("sort_order", { ascending: true }),
    supabase
      .from("workout_template_sets")
      .select("id, template_exercise_id, label, target_reps, target_load, rest_seconds, notes, sort_order")
      .order("sort_order", { ascending: true }),
    supabase
      .from("training_plans")
      .select("id, coach_id, athlete_id, title, description, status, start_date, week_count, workouts, created_at, updated_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("scheduled_workouts")
      .select("id, training_plan_id, template_id, program_workout_id, athlete_id, coach_id, title, scheduled_date, status, completed_at, created_at, updated_at")
      .order("scheduled_date", { ascending: false }),
    supabase
      .from("workout_sessions")
      .select("id, scheduled_workout_id, athlete_id, energy_level, started_at, completed_at, paused_at, paused_duration_seconds, updated_at")
      .order("started_at", { ascending: false }),
    supabase
      .from("workout_set_logs")
      .select("id, session_id, scheduled_workout_id, template_exercise_id, set_id, exercise_id, exercise_name, muscle_group, superset_group, set_label, target_reps, target_reps_min, target_reps_max, target_load, target_rest_seconds, program_workout_id, actual_reps, actual_load, rpe, done"),
    supabase
      .from("workout_notes")
      .select("id, session_id, athlete_id, coach_id, body, created_at, updated_at")
      .order("updated_at", { ascending: false }),
  ]);
  logSyncPhase("all-queries", queryStartedAt);

  throwIfQueryFailed("Profiles", profilesResult);
  throwIfQueryFailed("Body measurements", bodyMeasurementsResult);
  throwIfQueryFailed("Assignments", assignmentsResult);
  throwIfQueryFailed("Exercises", exercisesResult);
  throwIfQueryFailed("Templates", templatesResult);
  throwIfQueryFailed("Template blocks", templateBlocksResult);
  throwIfQueryFailed("Template exercises", templateExercisesResult);
  throwIfQueryFailed("Template sets", templateSetsResult);
  throwIfQueryFailed("Training plans", plansResult);
  throwIfQueryFailed("Scheduled workouts", scheduledWorkoutsResult);
  throwIfQueryFailed("Workout sessions", sessionsResult);
  throwIfQueryFailed("Workout set logs", setLogsResult);
  throwIfQueryFailed("Workout notes", notesResult);

  const mappingStartedAt = performance.now();

  const users = (profilesResult.data ?? []).map((entry) => mapProfileRow(entry as ProfileRow));
  const bodyMeasurements = (bodyMeasurementsResult.data ?? []).map((entry) =>
    mapBodyMeasurementRow(entry as BodyMeasurementRow),
  );
  const assignments = (assignmentsResult.data ?? []).map((entry) =>
    mapAssignmentRow(entry as AssignmentRow),
  );
  const exercises = (exercisesResult.data ?? []).map((entry) => mapExerciseRow(entry as ExerciseRow));
  const exerciseIdByDatabaseId = new Map(
    (exercisesResult.data ?? []).map((entry) => [
      (entry as ExerciseRow).id,
      (entry as ExerciseRow).external_key ?? (entry as ExerciseRow).id,
    ]),
  );

  const templateBlocks = (templateBlocksResult.data ?? []) as TemplateBlockRow[];
  const templateExercises = (templateExercisesResult.data ?? []) as TemplateExerciseRow[];
  const templateSets = (templateSetsResult.data ?? []) as TemplateSetRow[];

  const setsByTemplateExerciseId = new Map<string, WorkoutTemplate["blocks"][number]["exercises"][number]["sets"]>();
  templateSets.forEach((entry) => {
    const existing = setsByTemplateExerciseId.get(entry.template_exercise_id) ?? [];
    existing.push({
      id: entry.id,
      label: entry.label,
      targetReps: entry.target_reps,
      targetLoad: toNumberOrUndefined(entry.target_load),
      restSeconds: entry.rest_seconds,
      notes: entry.notes ?? undefined,
    });
    setsByTemplateExerciseId.set(entry.template_exercise_id, existing);
  });

  const exercisesByBlockId = new Map<string, WorkoutTemplate["blocks"][number]["exercises"]>();
  templateExercises.forEach((entry) => {
    const existing = exercisesByBlockId.get(entry.block_id) ?? [];
    existing.push({
      id: entry.id,
      exerciseId: exerciseIdByDatabaseId.get(entry.exercise_id) ?? entry.exercise_id,
      instruction: entry.instruction,
      sets: setsByTemplateExerciseId.get(entry.id) ?? [],
    });
    exercisesByBlockId.set(entry.block_id, existing);
  });

  const blocksByTemplateId = new Map<string, WorkoutTemplate["blocks"]>();
  templateBlocks.forEach((entry) => {
    const existing = blocksByTemplateId.get(entry.template_id) ?? [];
    existing.push({
      id: entry.id,
      title: entry.title,
      note: entry.note ?? undefined,
      exercises: exercisesByBlockId.get(entry.id) ?? [],
    });
    blocksByTemplateId.set(entry.template_id, existing);
  });

  const templates = ((templatesResult.data ?? []) as TemplateRow[]).map((entry) => ({
    id: entry.id,
    coachId: entry.coach_id,
    title: entry.title,
    description: entry.description,
    goal: entry.goal,
    splitType: entry.split_type,
    status: entry.status,
    blocks: blocksByTemplateId.get(entry.id) ?? [],
    createdAt: entry.created_at,
    updatedAt: entry.updated_at,
    createdBy: entry.created_by,
    updatedBy: entry.updated_by,
  }));

  const scheduledWorkouts = ((scheduledWorkoutsResult.data ?? []) as ScheduledWorkoutRow[]).map((entry) =>
    mapScheduledWorkoutRow(entry),
  );

  const setLogsBySessionId = new Map<string, WorkoutSession["setLogs"]>();
  ((setLogsResult.data ?? []) as WorkoutSetLogRow[]).forEach((entry) => {
    const existing = setLogsBySessionId.get(entry.session_id) ?? [];
    existing.push({
      id: entry.id,
      scheduledWorkoutId: entry.scheduled_workout_id,
      templateExerciseId: entry.template_exercise_id,
      setId: entry.set_id,
      exerciseId: entry.exercise_id,
      exerciseName: entry.exercise_name,
      muscleGroup: (entry.muscle_group as WorkoutSession["setLogs"][number]["muscleGroup"]) ?? undefined,
      supersetGroup: entry.superset_group ?? undefined,
      setLabel: entry.set_label,
      targetReps: entry.target_reps,
      targetRepsMin: entry.target_reps_min ?? undefined,
      targetRepsMax: entry.target_reps_max ?? undefined,
      targetLoad: toNumberOrUndefined(entry.target_load),
      targetRestSeconds: entry.target_rest_seconds ?? undefined,
      programWorkoutId: entry.program_workout_id ?? undefined,
      actualReps: entry.actual_reps ?? undefined,
      actualLoad: toNumberOrUndefined(entry.actual_load),
      rpe: toNumberOrUndefined(entry.rpe),
      done: entry.done,
    });
    setLogsBySessionId.set(entry.session_id, existing);
  });

  const sessions = ((sessionsResult.data ?? []) as WorkoutSessionRow[]).map((entry) => ({
    id: entry.id,
    scheduledWorkoutId: entry.scheduled_workout_id,
    athleteId: entry.athlete_id,
    energyLevel: entry.energy_level ?? undefined,
    startedAt: entry.started_at,
    completedAt: entry.completed_at ?? undefined,
    pausedAt: entry.paused_at ?? undefined,
    pausedDurationSeconds: entry.paused_duration_seconds ?? undefined,
    updatedAt: entry.updated_at,
    setLogs: setLogsBySessionId.get(entry.id) ?? [],
  }));

  const notes = ((notesResult.data ?? []) as WorkoutNoteRow[]).map((entry) => mapWorkoutNoteRow(entry));

  logSyncPhase("mapping", mappingStartedAt);

  return {
    users,
    bodyMeasurements,
    assignments,
    exercises,
    templates,
    plans: ((plansResult.data ?? []) as TrainingPlanRow[]).map((entry) => mapPlanRow(entry)),
    scheduledWorkouts,
    sessions,
    notes,
  };
}
