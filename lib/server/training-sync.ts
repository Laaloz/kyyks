import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  PROGRAMS_DASHBOARD_VIEW,
  type AppState,
  type BodyMeasurement,
  type CoachAthleteAssignment,
  type ConversationEntry,
  type Exercise,
  type ScheduledWorkout,
  type TrainingPlan,
  type UserProfile,
  type WorkoutNote,
  type WorkoutSession,
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
  load_increment_kg: 1 | 2.5 | 5 | null;
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

type ConversationEntryRow = {
  id: string;
  athlete_id: string;
  coach_id: string;
  author_user_id: string;
  author_role: ConversationEntry["authorRole"];
  type: ConversationEntry["type"];
  body: string;
  context_type: ConversationEntry["contextType"];
  context_id: string | null;
  context_label: string | null;
  read_by_user_ids: string[] | null;
  created_at: string;
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
  | "conversationEntries"
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
        profile.default_dashboard_view === PROGRAMS_DASHBOARD_VIEW ||
        profile.default_dashboard_view === "invites" ||
        profile.default_dashboard_view === "athlete-log" ||
        profile.default_dashboard_view === "conversation"
          ? profile.default_dashboard_view
          : profile.role === "athlete"
            ? "athlete-log"
            : "overview",
      emailNotifications: profile.email_notifications,
      themeMode: profile.theme_mode,
      loadIncrementKg: profile.load_increment_kg ?? 2.5,
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
  options?: { lite?: boolean },
): Promise<SupabaseVisibleAppStateSnapshot> {
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  const profileStartedAt = performance.now();
  const { data: currentProfile } = authUser
    ? await supabase
        .from("profiles")
        .select("id, role")
        .eq("id", authUser.id)
        .maybeSingle<{ id: string; role: UserProfile["role"] }>()
    : { data: null };
  logSyncPhase("current-profile", profileStartedAt);

  const isAdminViewer = currentProfile?.role === "admin";
  const lite = Boolean(options?.lite);
  const queryStartedAt = performance.now();
  const [
    profilesResult,
    bodyMeasurementsResult,
    assignmentsResult,
    exercisesResult,
    plansResult,
    scheduledWorkoutsResult,
    sessionsResult,
    setLogsResult,
    notesResult,
    conversationEntriesResult,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, role, status, full_name, email, default_dashboard_view, email_notifications, theme_mode, load_increment_kg, height_cm, weight_kg, waist_cm, created_at, updated_at",
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("body_measurements")
      .select("id, user_id, height_cm, weight_kg, waist_cm, measured_at, created_at")
      .limit(lite ? 60 : isAdminViewer ? 500 : 200)
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
      .from("training_plans")
      .select("id, coach_id, athlete_id, title, description, status, start_date, week_count, workouts, created_at, updated_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("scheduled_workouts")
      .select("id, training_plan_id, program_workout_id, athlete_id, coach_id, title, scheduled_date, status, completed_at, created_at, updated_at")
      .limit(lite ? 80 : isAdminViewer ? 500 : 200)
      .order("scheduled_date", { ascending: false }),
    supabase
      .from("workout_sessions")
      .select("id, scheduled_workout_id, athlete_id, energy_level, started_at, completed_at, paused_at, paused_duration_seconds, updated_at")
      .limit(lite ? 80 : isAdminViewer ? 500 : 200)
      .order("started_at", { ascending: false }),
    supabase
      .from("workout_set_logs")
      .select("id, session_id, scheduled_workout_id, template_exercise_id, set_id, exercise_id, exercise_name, muscle_group, superset_group, set_label, target_reps, target_reps_min, target_reps_max, target_load, target_rest_seconds, program_workout_id, actual_reps, actual_load, done")
      .order("session_id", { ascending: true })
      .order("template_exercise_id", { ascending: true })
      .order("set_label", { ascending: true })
      .limit(lite ? 320 : isAdminViewer ? 4000 : 1500),
    supabase
      .from("workout_notes")
      .select("id, session_id, athlete_id, coach_id, body, created_at, updated_at")
      .limit(lite ? 40 : isAdminViewer ? 300 : 150)
      .order("updated_at", { ascending: false }),
    supabase
      .from("conversation_entries")
      .select("id, athlete_id, coach_id, author_user_id, author_role, type, body, context_type, context_id, context_label, read_by_user_ids, created_at")
      .limit(lite ? 80 : isAdminViewer ? 1000 : 400)
      .order("created_at", { ascending: false }),
  ]);
  logSyncPhase("all-queries", queryStartedAt);

  throwIfQueryFailed("Profiles", profilesResult);
  throwIfQueryFailed("Body measurements", bodyMeasurementsResult);
  throwIfQueryFailed("Assignments", assignmentsResult);
  throwIfQueryFailed("Exercises", exercisesResult);
  throwIfQueryFailed("Training plans", plansResult);
  throwIfQueryFailed("Scheduled workouts", scheduledWorkoutsResult);
  throwIfQueryFailed("Workout sessions", sessionsResult);
  throwIfQueryFailed("Workout set logs", setLogsResult);
  throwIfQueryFailed("Workout notes", notesResult);
  throwIfQueryFailed("Conversation entries", conversationEntriesResult);

  const mappingStartedAt = performance.now();

  const users = (profilesResult.data ?? []).map((entry) => mapProfileRow(entry as ProfileRow));
  const bodyMeasurements = (bodyMeasurementsResult.data ?? []).map((entry) =>
    mapBodyMeasurementRow(entry as BodyMeasurementRow),
  );
  const assignments = (assignmentsResult.data ?? []).map((entry) =>
    mapAssignmentRow(entry as AssignmentRow),
  );
  const exercises = (exercisesResult.data ?? []).map((entry) => mapExerciseRow(entry as ExerciseRow));
  const templates: AppState["templates"] = [];

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
  const conversationEntries = ((conversationEntriesResult.data ?? []) as ConversationEntryRow[]).map((entry) => ({
    id: entry.id,
    athleteId: entry.athlete_id,
    coachId: entry.coach_id,
    authorUserId: entry.author_user_id,
    authorRole: entry.author_role,
    type: entry.type,
    body: entry.body,
    contextType: entry.context_type,
    contextId: entry.context_id ?? undefined,
    contextLabel: entry.context_label ?? undefined,
    readByUserIds: entry.read_by_user_ids ?? [],
    createdAt: entry.created_at,
  }));

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
    conversationEntries,
  };
}
