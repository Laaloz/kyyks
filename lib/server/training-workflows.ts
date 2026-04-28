import "server-only";

import { createProgram as domainCreateProgram, updateProgram as domainUpdateProgram } from "@/lib/domain";
import { canManagePrograms, isAdminRole, isAthleteRole } from "@/lib/role-access";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  Exercise,
  ProgramBuilderInput,
  ProgramStatus,
  ProgramUpdateInput,
  Role,
  ScheduledWorkout,
  TrainingPlan,
  WorkoutBatchSetSyncResult,
  WorkoutSetLog,
  WorkoutSetDraftPatch,
  WorkoutNote,
  WorkoutSession,
  WorkoutUpdateInput,
} from "@/lib/types";

type RequesterProfile = {
  id: string;
  role: Role;
  email?: string;
  full_name?: string;
};

type WorkoutSetMutationResult =
  | { ok: true; sessionUpdatedAt: string; setLog: { id: string; actualReps?: number; actualLoad?: number; done: boolean } }
  | { ok: false; message: string; code?: "stale_session" | "not_found" | "invalid_state" | "forbidden" };

type WorkoutBatchSetMutationResult =
  | { ok: true; updatedAt: string; setLogs: WorkoutBatchSetSyncResult["setLogs"] }
  | { ok: false; message: string; code?: "not_found" | "invalid_state" | "forbidden" };

type WorkoutMutationResult =
  | { ok: true; updatedAt: string; completedAt?: string }
  | { ok: false; message: string; code?: "stale_session" | "stale_note" | "not_found" | "invalid_state" | "forbidden" };

type WorkoutNoteMutationResult =
  | { ok: true; updatedAt: string }
  | { ok: false; message: string; code?: "stale_note" | "not_found" | "invalid_state" | "forbidden" };

type StartedWorkoutPayload = {
  scheduledWorkout: ScheduledWorkout;
  session: WorkoutSession;
};

type StartWorkoutAtomicPayload = {
  ok?: boolean;
  code?: string | null;
  message?: string | null;
  scheduled_workout_id?: string | null;
  session_id?: string | null;
  updated_at?: string | null;
};

function createPhaseTimer(label: string) {
  const startedAt = performance.now();
  return {
    checkpoint(phase: string) {
      const durationMs = Number((performance.now() - startedAt).toFixed(1));
      console.info(`[timing:${label}] ${phase}`, { durationMs });
      return durationMs;
    },
  };
}

type PlanRow = {
  id: string;
  coach_id: string;
  athlete_id: string;
  title: string;
  description: string | null;
  status: ProgramStatus | null;
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

type SessionRow = {
  id: string;
  scheduled_workout_id: string;
  athlete_id: string;
  started_at: string;
  completed_at: string | null;
  paused_at: string | null;
  paused_duration_seconds: number | null;
  updated_at: string;
};

type SetLogRow = {
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

function toNumberOrUndefined(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  const nextValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(nextValue) ? nextValue : undefined;
}

function nowIso() {
  return new Date().toISOString();
}

const AUTOFILL_SESSION_SCAN_LIMIT = 12;

function isExercisesExternalKeySchemaError(message: string | undefined) {
  const normalized = message?.toLowerCase() ?? "";
  return (
    normalized.includes("external_key") ||
    normalized.includes("on conflict specification")
  );
}

function displayWorkoutTitle(title: string) {
  return title.trim() || "Treeni";
}

function resolveDefaultActualReps(target: { targetReps: number; targetRepsMin?: number }) {
  return target.targetRepsMin ?? target.targetReps;
}

function resolveDefaultActualLoad(target: { targetLoad?: number }) {
  if (target.targetLoad === undefined || target.targetLoad <= 0) {
    return undefined;
  }

  return target.targetLoad;
}

function buildWorkoutSetDraftKey(patch: {
  logId?: string;
  templateExerciseId?: string;
  setLabel?: string;
}) {
  if (patch.logId) {
    return `log::${patch.logId}`;
  }

  if (patch.templateExerciseId && patch.setLabel) {
    return `${patch.templateExerciseId}::${patch.setLabel}`;
  }

  return null;
}

function mapPlanRow(row: PlanRow): TrainingPlan {
  return {
    id: row.id,
    coachId: row.coach_id,
    athleteId: row.athlete_id,
    title: row.title,
    description: row.description ?? undefined,
    status: row.status ?? "active",
    workouts: Array.isArray(row.workouts) ? row.workouts : [],
    startDate: new Date(`${row.start_date}T08:00:00`).toISOString(),
    weekCount: row.week_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapScheduledWorkoutRow(row: ScheduledWorkoutRow): ScheduledWorkout {
  return {
    id: row.id,
    trainingPlanId: row.training_plan_id ?? undefined,
    templateId: row.template_id ?? undefined,
    programWorkoutId: row.program_workout_id ?? undefined,
    athleteId: row.athlete_id,
    coachId: row.coach_id,
    title: row.title,
    scheduledDate: row.scheduled_date,
    status: row.status,
    completedAt: row.completed_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSetLogRow(row: SetLogRow): WorkoutSetLog {
  return {
    id: row.id,
    scheduledWorkoutId: row.scheduled_workout_id,
    templateExerciseId: row.template_exercise_id,
    setId: row.set_id,
    exerciseId: row.exercise_id,
    exerciseName: row.exercise_name,
    muscleGroup: (row.muscle_group as WorkoutSetLog["muscleGroup"]) ?? undefined,
    supersetGroup: row.superset_group ?? undefined,
    setLabel: row.set_label,
    targetReps: row.target_reps,
    targetRepsMin: row.target_reps_min ?? undefined,
    targetRepsMax: row.target_reps_max ?? undefined,
    targetLoad: toNumberOrUndefined(row.target_load),
    targetRestSeconds: row.target_rest_seconds ?? undefined,
    programWorkoutId: row.program_workout_id ?? undefined,
    actualReps: row.actual_reps ?? undefined,
    actualLoad: toNumberOrUndefined(row.actual_load),
    done: row.done,
  };
}

function mapSessionRow(row: SessionRow, setLogs: WorkoutSetLog[]): WorkoutSession {
  return {
    id: row.id,
    scheduledWorkoutId: row.scheduled_workout_id,
    athleteId: row.athlete_id,
    startedAt: row.started_at,
    completedAt: row.completed_at ?? undefined,
    pausedAt: row.paused_at ?? undefined,
    pausedDurationSeconds: row.paused_duration_seconds ?? undefined,
    updatedAt: row.updated_at,
    setLogs,
  };
}

async function fetchStartedWorkoutPayload(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  scheduledWorkoutId: string,
): Promise<StartedWorkoutPayload | null> {
  const { data: scheduledWorkout } = await admin
    .from("scheduled_workouts")
    .select("id, training_plan_id, template_id, program_workout_id, athlete_id, coach_id, title, scheduled_date, status, completed_at, created_at, updated_at")
    .eq("id", scheduledWorkoutId)
    .maybeSingle<ScheduledWorkoutRow>();

  if (!scheduledWorkout) {
    return null;
  }

  const { data: session } = await admin
    .from("workout_sessions")
    .select("id, scheduled_workout_id, athlete_id, started_at, completed_at, paused_at, paused_duration_seconds, updated_at")
    .eq("scheduled_workout_id", scheduledWorkoutId)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle<SessionRow>();

  if (!session) {
    return null;
  }

  const { data: setLogs } = await admin
    .from("workout_set_logs")
    .select("id, session_id, scheduled_workout_id, template_exercise_id, set_id, exercise_id, exercise_name, muscle_group, superset_group, set_label, target_reps, target_reps_min, target_reps_max, target_load, target_rest_seconds, program_workout_id, actual_reps, actual_load, done")
    .eq("session_id", session.id)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .order("set_label", { ascending: true });

  return {
    scheduledWorkout: mapScheduledWorkoutRow(scheduledWorkout),
    session: mapSessionRow(session, ((setLogs ?? []) as SetLogRow[]).map((row) => mapSetLogRow(row))),
  };
}

async function resolveProfileByIdOrEmail(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  athleteId: string,
  athleteEmail?: string,
) {
  let { data: athlete } = await admin
    .from("profiles")
    .select("id, role, email")
    .eq("id", athleteId)
    .maybeSingle<{ id: string; role: Role; email: string }>();

  if (!athlete && athleteEmail) {
    const profileByEmail = await admin
      .from("profiles")
      .select("id, role, email")
      .ilike("email", athleteEmail)
      .maybeSingle<{ id: string; role: Role; email: string }>();

    athlete = profileByEmail.data ?? null;
  }

  return athlete;
}

async function resolveManageableAthlete(requester: RequesterProfile, athleteId: string, athleteEmail?: string) {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return { ok: false as const, message: "Supabase admin -yhteys puuttuu. Tarkista service role -avain." };
  }

  const athlete = await resolveProfileByIdOrEmail(admin, athleteId, athleteEmail);

  if (!athlete) {
    return { ok: false as const, message: "Käyttäjää ei löytynyt." };
  }

  if (athlete.id === requester.id) {
    return { ok: true as const, admin, athlete };
  }

  if (isAdminRole(requester.role)) {
    if (!isAthleteRole(athlete.role)) {
      return { ok: false as const, message: "Ohjelman voi kohdistaa vain treenaajalle." };
    }

    return { ok: true as const, admin, athlete };
  }

  const { data: assignment } = await admin
    .from("coach_athlete_assignments")
    .select("id")
    .eq("coach_id", requester.id)
    .eq("athlete_id", athlete.id)
    .eq("active", true)
    .maybeSingle();

  if (!assignment) {
    return { ok: false as const, message: "Voit luoda ohjelman vain itsellesi tai omalle valmennettavallesi." };
  }

  return { ok: true as const, admin, athlete };
}

async function upsertCustomExercises(
  customExercises: Exercise[] | undefined,
  coachId: string,
) {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return { ok: false as const, message: "Supabase admin -yhteys puuttuu. Tarkista service role -avain." };
  }

  if (!customExercises?.length) {
    return { ok: true as const };
  }

  const { error } = await admin.from("exercises").upsert(
    customExercises.map((exercise) => ({
      external_key: exercise.id,
      name: exercise.name,
      category: exercise.category,
      equipment: exercise.equipment,
      cue: exercise.cue,
      scope: "coach_custom" as const,
      coach_id: coachId,
    })),
    { onConflict: "external_key" },
  );

  if (error && isExercisesExternalKeySchemaError(error.message)) {
    const { data: existingExercises, error: existingExercisesError } = await admin
      .from("exercises")
      .select("name")
      .eq("coach_id", coachId)
      .eq("scope", "coach_custom");

    if (existingExercisesError) {
      return {
        ok: false as const,
        message: existingExercisesError.message
          ? `Custom-liikkeiden tallennus epäonnistui: ${existingExercisesError.message}`
          : "Custom-liikkeiden tallennus epäonnistui.",
      };
    }

    const existingNames = new Set(
      (existingExercises ?? []).map((exercise) => exercise.name.trim().toLowerCase()),
    );

    const missingExercises = customExercises.filter(
      (exercise) => !existingNames.has(exercise.name.trim().toLowerCase()),
    );

    if (!missingExercises.length) {
      return { ok: true as const };
    }

    const { error: fallbackInsertError } = await admin.from("exercises").insert(
      missingExercises.map((exercise) => ({
        name: exercise.name,
        category: exercise.category,
        equipment: exercise.equipment,
        cue: exercise.cue,
        scope: "coach_custom" as const,
        coach_id: coachId,
      })),
    );

    if (fallbackInsertError) {
      return {
        ok: false as const,
        message: fallbackInsertError.message
          ? `Custom-liikkeiden tallennus epäonnistui: ${fallbackInsertError.message}`
          : "Custom-liikkeiden tallennus epäonnistui.",
      };
    }

    return { ok: true as const };
  }

  if (error) {
    return {
      ok: false as const,
      message: error.message ? `Custom-liikkeiden tallennus epäonnistui: ${error.message}` : "Custom-liikkeiden tallennus epäonnistui.",
    };
  }

  return { ok: true as const };
}

async function resolveExerciseDatabaseRows() {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return { ok: false as const, message: "Supabase admin -yhteys puuttuu. Tarkista service role -avain." };
  }

  const { data, error } = await admin
    .from("exercises")
    .select("id, external_key, name, category, equipment, cue, scope, coach_id");

  if (error && isExercisesExternalKeySchemaError(error.message)) {
    const { data: fallbackData, error: fallbackError } = await admin
      .from("exercises")
      .select("id, name, category, equipment, cue, scope, coach_id");

    if (fallbackError) {
      return {
        ok: false as const,
        message: fallbackError.message
          ? `Liiketietojen haku epäonnistui: ${fallbackError.message}`
          : "Liiketietojen haku epäonnistui.",
      };
    }

    return {
      ok: true as const,
      admin,
      rows: (fallbackData ?? []).map((row) => ({
        ...row,
        external_key: null,
      })) as Array<{
        id: string;
        external_key: string | null;
        name: string;
        category: string;
        equipment: string;
        cue: string;
        scope: Exercise["scope"];
        coach_id: string | null;
      }>,
    };
  }

  if (error) {
    return {
      ok: false as const,
      message: error.message ? `Liiketietojen haku epäonnistui: ${error.message}` : "Liiketietojen haku epäonnistui.",
    };
  }

  return {
    ok: true as const,
    admin,
    rows: (data ?? []) as Array<{
      id: string;
      external_key: string | null;
      name: string;
      category: string;
      equipment: string;
      cue: string;
      scope: Exercise["scope"];
      coach_id: string | null;
    }>,
  };
}

async function buildAutofillSnapshotMaps(
  athleteId: string,
  exerciseIds: string[],
  adminClient: NonNullable<ReturnType<typeof createSupabaseAdminClient>> | null = null,
) {
  const admin = adminClient ?? createSupabaseAdminClient();
  if (!admin) {
    return {
      byExerciseAndSetLabel: new Map<string, { actualReps?: number; actualLoad?: number }>(),
      byExercise: new Map<string, { actualReps?: number; actualLoad?: number }>(),
    };
  }

  const uniqueExerciseIds = Array.from(new Set(exerciseIds.filter(Boolean)));
  if (!uniqueExerciseIds.length) {
    return {
      byExerciseAndSetLabel: new Map<string, { actualReps?: number; actualLoad?: number }>(),
      byExercise: new Map<string, { actualReps?: number; actualLoad?: number }>(),
    };
  }

  const rpcResult = await admin.rpc("get_latest_autofill_logs", {
    p_athlete_id: athleteId,
    p_exercise_ids: uniqueExerciseIds,
    p_session_limit: AUTOFILL_SESSION_SCAN_LIMIT,
  });

  type AutofillLogRow = {
    session_id: string;
    exercise_id: string;
    set_label: string;
    actual_reps: number | null;
    actual_load: number | string | null;
    done: boolean;
    completed_at: string | null;
  };

  const buildMapsFromLogs = (rows: AutofillLogRow[]) => {
    const byExerciseAndSetLabel = new Map<string, { actualReps?: number; actualLoad?: number }>();
    const byExercise = new Map<string, { actualReps?: number; actualLoad?: number }>();

    rows.forEach((log) => {
      if (!log.done) {
        return;
      }

      const snapshot = {
        actualReps: log.actual_reps ?? undefined,
        actualLoad: toNumberOrUndefined(log.actual_load),
      };

      if (snapshot.actualReps === undefined && snapshot.actualLoad === undefined) {
        return;
      }

      const setKey = `${log.exercise_id}:${log.set_label}`;
      if (!byExerciseAndSetLabel.has(setKey)) {
        byExerciseAndSetLabel.set(setKey, snapshot);
      }
      if (!byExercise.has(log.exercise_id)) {
        byExercise.set(log.exercise_id, snapshot);
      }
    });

    return { byExerciseAndSetLabel, byExercise };
  };

  if (!rpcResult.error && Array.isArray(rpcResult.data)) {
    return buildMapsFromLogs(rpcResult.data as AutofillLogRow[]);
  }

  const { data: completedSessions } = await admin
    .from("workout_sessions")
    .select("id, completed_at, updated_at")
    .eq("athlete_id", athleteId)
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .limit(AUTOFILL_SESSION_SCAN_LIMIT);

  const sessionIds = (completedSessions ?? []).map((session) => session.id);
  if (!sessionIds.length) {
    return {
      byExerciseAndSetLabel: new Map<string, { actualReps?: number; actualLoad?: number }>(),
      byExercise: new Map<string, { actualReps?: number; actualLoad?: number }>(),
    };
  }

  const { data: logs } = await admin
    .from("workout_set_logs")
    .select("session_id, exercise_id, set_label, actual_reps, actual_load, done")
    .in("session_id", sessionIds)
    .in("exercise_id", uniqueExerciseIds);

  const sessionOrder = new Map(sessionIds.map((sessionId, index) => [sessionId, index]));
  const orderedLogs = (logs ?? []).sort((left, right) => {
    const leftIndex = sessionOrder.get(left.session_id) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = sessionOrder.get(right.session_id) ?? Number.MAX_SAFE_INTEGER;
    return leftIndex - rightIndex;
  });
  return buildMapsFromLogs(orderedLogs as AutofillLogRow[]);
}

async function buildProgramWorkoutSetLogs(
  plan: TrainingPlan,
  workoutId: string,
  adminClient: NonNullable<ReturnType<typeof createSupabaseAdminClient>> | null = null,
) {
  const programWorkout = plan.workouts?.find((item) => item.id === workoutId);
  if (!programWorkout) {
    return null;
  }

  const autofill = await buildAutofillSnapshotMaps(
    plan.athleteId,
    programWorkout.exercises.map((exercise) => exercise.exerciseId ?? `custom_${exercise.id}`),
    adminClient,
  );

  return programWorkout.exercises.flatMap((exercise) =>
    exercise.sets.map((set) => {
      const resolvedExerciseId = exercise.exerciseId ?? `custom_${exercise.id}`;
      const snapshot =
        autofill.byExerciseAndSetLabel.get(`${resolvedExerciseId}:${set.label}`) ??
        autofill.byExercise.get(resolvedExerciseId);

      return {
        template_exercise_id: exercise.id,
        set_id: set.id,
        exercise_id: resolvedExerciseId,
        exercise_name: exercise.exerciseName,
        muscle_group: exercise.muscleGroup ?? null,
        superset_group: exercise.supersetGroup ?? null,
        set_label: set.label,
        target_reps: set.targetReps,
        target_reps_min: set.targetRepsMin ?? null,
        target_reps_max: set.targetRepsMax ?? null,
        target_load: set.targetLoad ?? null,
        target_rest_seconds: set.restSeconds ?? programWorkout.defaultRestSeconds,
        program_workout_id: programWorkout.id,
        actual_reps: snapshot?.actualReps ?? resolveDefaultActualReps(set),
        actual_load: snapshot?.actualLoad ?? resolveDefaultActualLoad(set) ?? null,
        done: false,
      };
    }),
  );
}

async function getLatestWorkoutSession<T extends Record<string, unknown>>(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  scheduledWorkoutId: string,
  columns: string,
) {
  return admin
    .from("workout_sessions")
    .select(columns)
    .eq("scheduled_workout_id", scheduledWorkoutId)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle<T>();
}

async function createSessionWithLogs(params: {
  scheduledWorkoutId: string;
  athleteId: string;
  setLogs: Array<Record<string, unknown>>;
  admin?: NonNullable<ReturnType<typeof createSupabaseAdminClient>>;
}) {
  const admin = params.admin ?? createSupabaseAdminClient();
  if (!admin) {
    return { ok: false as const, message: "Supabase admin -yhteys puuttuu. Tarkista service role -avain." };
  }

  const { data: existingSession } = await getLatestWorkoutSession<{
    id: string;
    completed_at: string | null;
    updated_at: string;
  }>(admin, params.scheduledWorkoutId, "id, completed_at, updated_at");

  if (existingSession) {
    return { ok: true as const, sessionId: existingSession.id, updatedAt: existingSession.updated_at };
  }

  const timestamp = nowIso();
  const { data: session, error: sessionError } = await admin
    .from("workout_sessions")
    .insert({
      scheduled_workout_id: params.scheduledWorkoutId,
      athlete_id: params.athleteId,
      started_at: timestamp,
      updated_at: timestamp,
      paused_duration_seconds: 0,
    })
    .select("id, updated_at")
    .single<{ id: string; updated_at: string }>();

  if (sessionError || !session) {
    const { data: recoveredSession } = await getLatestWorkoutSession<{
      id: string;
      completed_at: string | null;
      updated_at: string;
    }>(admin, params.scheduledWorkoutId, "id, completed_at, updated_at");

    if (recoveredSession) {
      return { ok: true as const, sessionId: recoveredSession.id, updatedAt: recoveredSession.updated_at };
    }

    return { ok: false as const, message: "Treenisession luonti epäonnistui." };
  }

  if (params.setLogs.length) {
    const { error: logsError } = await admin.from("workout_set_logs").insert(
      params.setLogs.map((entry) => ({
        ...entry,
        session_id: session.id,
        scheduled_workout_id: params.scheduledWorkoutId,
      })),
    );

    if (logsError) {
      await admin.from("workout_sessions").delete().eq("id", session.id);
      return { ok: false as const, message: "Sarjalokin luonti epäonnistui." };
    }
  }

  return { ok: true as const, sessionId: session.id, updatedAt: session.updated_at };
}

async function startWorkoutAtomic(params: {
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>;
  requester: RequesterProfile;
  setLogs: Array<Record<string, unknown>>;
  scheduledWorkoutId?: string;
  trainingPlanId?: string;
  programWorkoutId?: string;
}) {
  const { data, error } = await params.admin.rpc("start_workout_atomic", {
    p_requester_id: params.requester.id,
    p_requester_role: params.requester.role,
    p_set_logs: params.setLogs,
    p_scheduled_workout_id: params.scheduledWorkoutId ?? null,
    p_training_plan_id: params.trainingPlanId ?? null,
    p_program_workout_id: params.programWorkoutId ?? null,
  });

  if (error) {
    console.error("[workout-start] atomic rpc failed", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      scheduledWorkoutId: params.scheduledWorkoutId,
      trainingPlanId: params.trainingPlanId,
      programWorkoutId: params.programWorkoutId,
    });
    return { ok: false as const, message: "Treeniä ei voitu käynnistää.", code: "rpc_error" };
  }

  const payload = (Array.isArray(data) ? data[0] : data) as StartWorkoutAtomicPayload | null;
  if (!payload || typeof payload !== "object") {
    return { ok: false as const, message: "Treeniä ei voitu käynnistää." };
  }

  if (!payload.ok) {
    return {
      ok: false as const,
      message: typeof payload.message === "string" && payload.message ? payload.message : "Treeniä ei voitu käynnistää.",
      code: typeof payload.code === "string" ? payload.code : undefined,
    };
  }

  if (!payload.scheduled_workout_id || !payload.updated_at) {
    return { ok: false as const, message: "Treeniä ei voitu käynnistää." };
  }

  return {
    ok: true as const,
    scheduledWorkoutId: payload.scheduled_workout_id,
    sessionId: payload.session_id ?? undefined,
    updatedAt: payload.updated_at,
  };
}

async function createProgramWorkoutWithLegacyWrites(params: {
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>;
  requester: RequesterProfile;
  plan: TrainingPlan;
  programWorkout: NonNullable<TrainingPlan["workouts"]>[number];
  setLogs: Array<Record<string, unknown>>;
}) {
  const timestamp = nowIso();
  const { data: scheduledWorkout, error: scheduledWorkoutError } = await params.admin
    .from("scheduled_workouts")
    .insert({
      training_plan_id: params.plan.id,
      program_workout_id: params.programWorkout.id,
      athlete_id: params.plan.athleteId,
      coach_id: params.plan.coachId,
      title: params.programWorkout.name,
      scheduled_date: timestamp,
      status: "in_progress",
      created_by: params.requester.id,
      updated_by: params.requester.id,
      created_at: timestamp,
      updated_at: timestamp,
    })
    .select("id")
    .single<{ id: string }>();

  if (scheduledWorkoutError || !scheduledWorkout) {
    return { ok: false as const, message: "Harjoituksen käynnistys epäonnistui." };
  }

  const sessionResult = await createSessionWithLogs({
    scheduledWorkoutId: scheduledWorkout.id,
    athleteId: params.plan.athleteId,
    setLogs: params.setLogs,
    admin: params.admin,
  });

  if (!sessionResult.ok) {
    await params.admin.from("scheduled_workouts").delete().eq("id", scheduledWorkout.id);
    return sessionResult;
  }

  return {
    ok: true as const,
    scheduledWorkoutId: scheduledWorkout.id,
    updatedAt: sessionResult.updatedAt,
  };
}

async function getWorkoutCompletionSnapshot(params: {
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>;
  requester: RequesterProfile;
  scheduledWorkoutId: string;
}) {
  const { admin, requester, scheduledWorkoutId } = params;
  const [{ data: workout }, { data: session }] = await Promise.all([
    admin
      .from("scheduled_workouts")
      .select("id, athlete_id, status, completed_at")
      .eq("id", scheduledWorkoutId)
      .maybeSingle<{
        id: string;
        athlete_id: string;
        status: ScheduledWorkout["status"];
        completed_at: string | null;
      }>(),
    admin
      .from("workout_sessions")
      .select("id, completed_at, updated_at")
      .eq("scheduled_workout_id", scheduledWorkoutId)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle<{
        id: string;
        completed_at: string | null;
        updated_at: string;
      }>(),
  ]);

  if (!workout || (!isAdminRole(requester.role) && workout.athlete_id !== requester.id)) {
    return null;
  }

  return { workout, session: session ?? null };
}

async function recoverCompletedWorkoutState(params: {
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>;
  requester: RequesterProfile;
  scheduledWorkoutId: string;
}) {
  const snapshot = await getWorkoutCompletionSnapshot(params);
  if (!snapshot) {
    return null;
  }

  const { admin, scheduledWorkoutId } = params;
  const { workout, session } = snapshot;
  if (!session?.completed_at) {
    return null;
  }

  const recoveredCompletedAt = session.completed_at;
  const recoveredUpdatedAt = session.updated_at;

  if (workout.status !== "completed" || workout.completed_at !== recoveredCompletedAt) {
    await admin
      .from("scheduled_workouts")
      .update({
        status: "completed",
        completed_at: recoveredCompletedAt,
        updated_at: recoveredUpdatedAt,
      })
      .eq("id", scheduledWorkoutId);
  }

  return {
    ok: true as const,
    updatedAt: recoveredUpdatedAt,
    completedAt: recoveredCompletedAt,
  };
}

async function retryCompleteWorkoutOnServer(params: {
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>;
  requester: RequesterProfile;
  scheduledWorkoutId: string;
}) {
  const snapshot = await getWorkoutCompletionSnapshot(params);
  if (!snapshot) {
    return null;
  }

  const { admin, requester, scheduledWorkoutId } = params;
  const { workout, session } = snapshot;

  if (workout.status === "completed" || session?.completed_at) {
    return recoverCompletedWorkoutState({ admin, requester, scheduledWorkoutId });
  }

  if (!session?.updated_at) {
    return null;
  }

  const { data, error } = await admin.rpc("complete_workout_atomic", {
    p_scheduled_workout_id: scheduledWorkoutId,
    p_requester_id: requester.id,
    p_requester_role: requester.role,
    p_expected_session_updated_at: session.updated_at,
  });

  if (error) {
    return null;
  }

  const payload = Array.isArray(data) ? data[0] : data;
  if (!payload || typeof payload !== "object") {
    return null;
  }

  if (!payload.ok) {
    return recoverCompletedWorkoutState({ admin, requester, scheduledWorkoutId });
  }

  return {
    ok: true as const,
    updatedAt: String(payload.updated_at),
    completedAt: typeof payload.completed_at === "string" ? payload.completed_at : undefined,
  };
}

export async function createProgramOnServer({
  requester,
  payload,
  customExercises,
}: {
  requester: RequesterProfile;
  payload: ProgramBuilderInput;
  customExercises?: Exercise[];
}) {
  if (!canManagePrograms(requester.role)) {
    return { ok: false as const, message: "Vain admin, valmentaja tai itsenäinen treenaaja voi luoda treeniohjelman." };
  }

  const targetResult = await resolveManageableAthlete(requester, payload.athleteId, payload.athleteEmail);
  if (!targetResult.ok) {
    return targetResult;
  }

  const customExerciseResult = await upsertCustomExercises(customExercises, requester.id);
  if (!customExerciseResult.ok) {
    return customExerciseResult;
  }

  const createdProgram = domainCreateProgram(
    { ...payload, athleteId: targetResult.athlete.id },
    requester.id,
  );

  if ((createdProgram.status ?? "active") === "active") {
    await targetResult.admin
      .from("training_plans")
      .update({ status: "archived", updated_at: createdProgram.updatedAt ?? createdProgram.createdAt })
      .eq("athlete_id", targetResult.athlete.id)
      .eq("status", "active");
  }

  const { data, error } = await targetResult.admin
    .from("training_plans")
    .insert({
      coach_id: requester.id,
      athlete_id: targetResult.athlete.id,
      title: createdProgram.title,
      description: createdProgram.description ?? null,
      status: createdProgram.status ?? "active",
      start_date: createdProgram.startDate.slice(0, 10),
      week_count: createdProgram.weekCount,
      workouts: createdProgram.workouts ?? [],
      created_at: createdProgram.createdAt,
      updated_at: createdProgram.updatedAt ?? createdProgram.createdAt,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    return {
      ok: false as const,
      message: error?.message ? `Treeniohjelman luonti epäonnistui: ${error.message}` : "Treeniohjelman luonti epäonnistui.",
    };
  }

  return { ok: true as const, programId: data.id };
}

export async function updateProgramOnServer({
  requester,
  programId,
  payload,
  customExercises,
}: {
  requester: RequesterProfile;
  programId: string;
  payload: ProgramUpdateInput;
  customExercises?: Exercise[];
}) {
  if (!canManagePrograms(requester.role)) {
    return { ok: false as const, message: "Vain admin, valmentaja tai itsenäinen treenaaja voi muokata treeniohjelmaa." };
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return { ok: false as const, message: "Supabase admin -yhteys puuttuu. Tarkista service role -avain." };
  }

  const { data: programRow } = await admin
    .from("training_plans")
    .select("id, coach_id, athlete_id, title, description, status, start_date, week_count, workouts, created_at, updated_at")
    .eq("id", programId)
    .maybeSingle<PlanRow>();

  if (!programRow) {
    return { ok: false as const, message: "Treeniohjelmaa ei löytynyt." };
  }

  if (!isAdminRole(requester.role) && programRow.coach_id !== requester.id) {
    return { ok: false as const, message: "Voit muokata vain omia ohjelmiasi." };
  }

  const nextAthleteId = payload.athleteId ?? programRow.athlete_id;
  let resolvedNextAthleteId = nextAthleteId;
  if (nextAthleteId !== programRow.athlete_id) {
    const targetResult = await resolveManageableAthlete(requester, nextAthleteId, payload.athleteEmail);
    if (!targetResult.ok) {
      return targetResult;
    }

    resolvedNextAthleteId = targetResult.athlete.id;

    const { count } = await admin
      .from("scheduled_workouts")
      .select("id", { count: "exact", head: true })
      .eq("training_plan_id", programId);

    if ((count ?? 0) > 0) {
      return {
        ok: false as const,
        message: "Käyttäjää ei voi vaihtaa, koska ohjelmasta on jo käynnistetty treenejä tai historiaa.",
      };
    }
  }

  const customExerciseResult = await upsertCustomExercises(customExercises, requester.id);
  if (!customExerciseResult.ok) {
    return customExerciseResult;
  }

  const updatedProgram = domainUpdateProgram(mapPlanRow(programRow), {
    ...payload,
    athleteId: resolvedNextAthleteId,
  });
  const updatedAt = updatedProgram.updatedAt ?? nowIso();

  const { error } = await admin
    .from("training_plans")
    .update({
      athlete_id: updatedProgram.athleteId,
      title: updatedProgram.title,
      description: updatedProgram.description ?? null,
      workouts: updatedProgram.workouts ?? [],
      updated_at: updatedAt,
    })
    .eq("id", programId);

  if (error) {
    return { ok: false as const, message: "Treeniohjelman päivitys epäonnistui." };
  }

  return { ok: true as const };
}

export async function setProgramStatusOnServer({
  requester,
  programId,
  status,
}: {
  requester: RequesterProfile;
  programId: string;
  status: ProgramStatus;
}) {
  if (!canManagePrograms(requester.role)) {
    return { ok: false as const, message: "Vain admin, valmentaja tai itsenäinen treenaaja voi muuttaa ohjelman tilaa." };
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return { ok: false as const, message: "Supabase admin -yhteys puuttuu. Tarkista service role -avain." };
  }

  const { data: targetProgram } = await admin
    .from("training_plans")
    .select("id, coach_id, athlete_id, status")
    .eq("id", programId)
    .maybeSingle<{ id: string; coach_id: string; athlete_id: string; status: ProgramStatus | null }>();

  if (!targetProgram) {
    return { ok: false as const, message: "Treeniohjelmaa ei löytynyt." };
  }

  if (!isAdminRole(requester.role) && targetProgram.coach_id !== requester.id) {
    return { ok: false as const, message: "Voit hallita vain omia ohjelmiasi." };
  }

  const updatedAt = nowIso();
  if (status === "active") {
    await admin
      .from("training_plans")
      .update({ status: "archived", updated_at: updatedAt })
      .eq("athlete_id", targetProgram.athlete_id)
      .in("status", ["active", "archived"])
      .neq("id", targetProgram.id);
  }

  const { error } = await admin
    .from("training_plans")
    .update({ status, updated_at: updatedAt })
    .eq("id", targetProgram.id);

  if (error) {
    return { ok: false as const, message: "Ohjelman tilan päivitys epäonnistui." };
  }

  return { ok: true as const };
}

export async function deleteProgramOnServer({
  requester,
  programId,
}: {
  requester: RequesterProfile;
  programId: string;
}) {
  if (!canManagePrograms(requester.role)) {
    return { ok: false as const, message: "Vain admin, valmentaja tai itsenäinen treenaaja voi poistaa treeniohjelman." };
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return { ok: false as const, message: "Supabase admin -yhteys puuttuu. Tarkista service role -avain." };
  }

  const { data: targetProgram } = await admin
    .from("training_plans")
    .select("id, coach_id")
    .eq("id", programId)
    .maybeSingle<{ id: string; coach_id: string }>();

  if (!targetProgram) {
    return { ok: false as const, message: "Treeniohjelmaa ei löytynyt." };
  }

  if (!isAdminRole(requester.role) && targetProgram.coach_id !== requester.id) {
    return { ok: false as const, message: "Voit poistaa vain omia ohjelmiasi." };
  }

  const { error } = await admin
    .from("training_plans")
    .update({ status: "removed", updated_at: nowIso() })
    .eq("id", programId);
  if (error) {
    return { ok: false as const, message: "Treeniohjelman poistaminen näkyvistä epäonnistui." };
  }

  return { ok: true as const };
}

export async function startProgramWorkoutOnServer({
  requester,
  programId,
  programWorkoutId,
}: {
  requester: RequesterProfile;
  programId: string;
  programWorkoutId: string;
}) {
  const admin = createSupabaseAdminClient();
  const timer = createPhaseTimer(`workouts-start:${programId}`);
  if (!admin) {
    return { ok: false as const, message: "Supabase admin -yhteys puuttuu. Tarkista service role -avain." };
  }

  const { data: planRow } = await admin
    .from("training_plans")
    .select("id, coach_id, athlete_id, title, description, status, start_date, week_count, workouts, created_at, updated_at")
    .eq("id", programId)
    .maybeSingle<PlanRow>();
  timer.checkpoint("plan-query");

  if (!planRow) {
    return { ok: false as const, message: "Ohjelmaa ei löytynyt tai se ei kuulu sinulle." };
  }

  if (!isAdminRole(requester.role) && planRow.athlete_id !== requester.id) {
    return { ok: false as const, message: "Ohjelmaa ei löytynyt tai se ei kuulu sinulle." };
  }

  if ((planRow.status ?? "active") !== "active") {
    return { ok: false as const, message: "Ohjelma on arkistoitu eikä siitä voi käynnistää uutta treeniä." };
  }

  const [existingActive, blockingWorkout] = await Promise.all([
    admin
      .from("scheduled_workouts")
      .select("id")
      .eq("athlete_id", planRow.athlete_id)
      .eq("program_workout_id", programWorkoutId)
      .in("status", ["in_progress", "cancelled"])
      .maybeSingle<{ id: string }>(),
    admin
      .from("scheduled_workouts")
      .select("id, title")
      .eq("athlete_id", planRow.athlete_id)
      .eq("status", "in_progress")
      .neq("program_workout_id", programWorkoutId)
      .maybeSingle<{ id: string; title: string }>(),
  ]);
  timer.checkpoint("existing-active-query");

  const [existingActiveSession, blockingWorkoutSession] = await Promise.all([
    existingActive.data?.id
      ? getLatestWorkoutSession<{ completed_at: string | null }>(
          admin,
          existingActive.data.id,
          "completed_at",
        )
      : Promise.resolve({ data: null, error: null }),
    blockingWorkout.data?.id
      ? getLatestWorkoutSession<{ completed_at: string | null }>(
          admin,
          blockingWorkout.data.id,
          "completed_at",
        )
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (existingActive.data?.id && existingActiveSession.data && !existingActiveSession.data.completed_at) {
    const payload = await fetchStartedWorkoutPayload(admin, existingActive.data.id);
    return { ok: true as const, scheduledWorkoutId: existingActive.data.id, payload: payload ?? undefined };
  }
  timer.checkpoint("blocking-query");

  if (blockingWorkout.data && !blockingWorkoutSession.data?.completed_at) {
    return {
      ok: false as const,
      message: `Sinulla on kesken oleva treeni "${displayWorkoutTitle(blockingWorkout.data.title)}". Jatka se ensin.`,
    };
  }

  const plan = mapPlanRow(planRow);
  const programWorkout = plan.workouts?.find((item) => item.id === programWorkoutId);
  if (!programWorkout) {
    return { ok: false as const, message: "Harjoituksen käynnistys epäonnistui." };
  }

  const setLogs = await buildProgramWorkoutSetLogs(plan, programWorkout.id, admin);
  timer.checkpoint("set-log-build");

  if (!setLogs) {
    return { ok: false as const, message: "Harjoituksen käynnistys epäonnistui." };
  }

  const startResult = await startWorkoutAtomic({
    admin,
    requester,
    setLogs,
    trainingPlanId: plan.id,
    programWorkoutId: programWorkout.id,
  });
  timer.checkpoint("rpc-start");

  if (!startResult.ok) {
    if (startResult.code === "rpc_error") {
      const fallbackResult = await createProgramWorkoutWithLegacyWrites({
        admin,
        requester,
        plan,
        programWorkout,
        setLogs,
      });
      timer.checkpoint("legacy-start-fallback");
      if (fallbackResult.ok) {
        return { ok: true as const, scheduledWorkoutId: fallbackResult.scheduledWorkoutId };
      }
    }

    return startResult;
  }

  timer.checkpoint("done");
  return { ok: true as const, scheduledWorkoutId: startResult.scheduledWorkoutId };
}

export async function startScheduledWorkoutOnServer({
  requester,
  scheduledWorkoutId,
}: {
  requester: RequesterProfile;
  scheduledWorkoutId: string;
}) {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return { ok: false as const, message: "Supabase admin -yhteys puuttuu. Tarkista service role -avain." };
  }

  const { data: workout } = await admin
    .from("scheduled_workouts")
    .select("id, training_plan_id, template_id, program_workout_id, athlete_id, coach_id, title, scheduled_date, status, completed_at, created_at, updated_at")
    .eq("id", scheduledWorkoutId)
    .maybeSingle<ScheduledWorkoutRow>();

  if (!workout || (!isAdminRole(requester.role) && workout.athlete_id !== requester.id)) {
    return { ok: false as const, message: "Treeniä ei löytynyt." };
  }

  const { data: existingSession } = await admin
    .from("workout_sessions")
    .select("id, paused_at, paused_duration_seconds, updated_at")
    .eq("scheduled_workout_id", scheduledWorkoutId)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; paused_at: string | null; paused_duration_seconds: number | null; updated_at: string }>();

  if (existingSession) {
    if (workout.status === "completed" || workout.status === "in_progress") {
      const payload = await fetchStartedWorkoutPayload(admin, scheduledWorkoutId);
      return { ok: true as const, scheduledWorkoutId, updatedAt: existingSession.updated_at, payload: payload ?? undefined };
    }

    const startResult = await startWorkoutAtomic({
      admin,
      requester,
      scheduledWorkoutId,
      setLogs: [],
    });

    if (!startResult.ok) {
      return startResult;
    }

    const payload = await fetchStartedWorkoutPayload(admin, scheduledWorkoutId);
    return { ok: true as const, scheduledWorkoutId, updatedAt: startResult.updatedAt, payload: payload ?? undefined };
  }

  let setLogs: Array<Record<string, unknown>> | null = null;
  if (workout.training_plan_id && workout.program_workout_id) {
    const { data: planRow } = await admin
      .from("training_plans")
      .select("id, coach_id, athlete_id, title, description, status, start_date, week_count, workouts, created_at, updated_at")
      .eq("id", workout.training_plan_id)
      .maybeSingle<PlanRow>();

    if (!planRow) {
      return { ok: false as const, message: "Treeniä ei löytynyt." };
    }

    setLogs = await buildProgramWorkoutSetLogs(mapPlanRow(planRow), workout.program_workout_id);
  }

  if (!setLogs) {
    return { ok: false as const, message: "Treeniä ei voitu käynnistää." };
  }

  const startResult = await startWorkoutAtomic({
    admin,
    requester,
    scheduledWorkoutId,
    setLogs,
  });

  if (!startResult.ok) {
    return startResult;
  }

  const payload = await fetchStartedWorkoutPayload(admin, scheduledWorkoutId);
  return { ok: true as const, scheduledWorkoutId, updatedAt: startResult.updatedAt, payload: payload ?? undefined };
}

export async function updateWorkoutSetOnServer({
  requester,
  scheduledWorkoutId,
  logId,
  patch,
}: {
  requester: RequesterProfile;
  scheduledWorkoutId: string;
  logId: string;
  patch: WorkoutUpdateInput;
}): Promise<WorkoutSetMutationResult> {
  const admin = createSupabaseAdminClient();
  const timer = createPhaseTimer(`workout-set:${scheduledWorkoutId}`);
  if (!admin) {
    return { ok: false as const, message: "Supabase admin -yhteys puuttuu. Tarkista service role -avain." };
  }

  const timestamp = nowIso();
  let resolvedLogId = logId;

  if (patch.templateExerciseId && patch.setLabel) {
    const { data: matchingLog, error: matchingLogError } = await admin
      .from("workout_set_logs")
      .select("id")
      .eq("scheduled_workout_id", scheduledWorkoutId)
      .eq("template_exercise_id", patch.templateExerciseId)
      .eq("set_label", patch.setLabel)
      .maybeSingle();

    if (!matchingLogError && matchingLog?.id) {
      resolvedLogId = matchingLog.id;
    }
  }

  const { data: workout } = await admin
    .from("scheduled_workouts")
    .select("id, athlete_id, status")
    .eq("id", scheduledWorkoutId)
    .maybeSingle<{ id: string; athlete_id: string; status: ScheduledWorkout["status"] }>();
  timer.checkpoint("workout-query");

  if (!workout || (!isAdminRole(requester.role) && workout.athlete_id !== requester.id)) {
    return { ok: false as const, message: "Treeniä ei löytynyt.", code: "forbidden" };
  }

  if (workout.status !== "in_progress" && workout.status !== "completed") {
    return {
      ok: false as const,
      message: "Sarjoja voi muokata vain aktiivisesta tai valmiista treenistä.",
      code: "invalid_state",
    };
  }

  const { data: targetLog } = await admin
    .from("workout_set_logs")
    .select("id, template_exercise_id, set_id, set_label, superset_group, target_reps, target_reps_min, target_load, actual_reps, actual_load, done")
    .eq("id", resolvedLogId)
    .eq("scheduled_workout_id", scheduledWorkoutId)
    .maybeSingle<{
      id: string;
      template_exercise_id: string;
      set_id: string;
      set_label: string;
      superset_group: string | null;
      target_reps: number;
      target_reps_min: number | null;
      target_load: number | string | null;
      actual_reps: number | null;
      actual_load: number | string | null;
      done: boolean;
    }>();
  timer.checkpoint("target-log-query");

  if (!targetLog) {
    return { ok: false as const, message: "Sarjaa ei löytynyt.", code: "not_found" };
  }

  const hasActualReps = Object.prototype.hasOwnProperty.call(patch, "actualReps");
  const hasActualLoad = Object.prototype.hasOwnProperty.call(patch, "actualLoad");
  const nextDone = patch.done ?? targetLog.done;
  const nextActualReps = hasActualReps ? patch.actualReps ?? undefined : targetLog.actual_reps ?? undefined;
  const nextActualLoad = hasActualLoad ? patch.actualLoad ?? undefined : toNumberOrUndefined(targetLog.actual_load);

  const updatePayload = {
    actual_reps: nextDone
      ? (nextActualReps ??
          resolveDefaultActualReps({
            targetReps: targetLog.target_reps,
            targetRepsMin: targetLog.target_reps_min ?? undefined,
          }) ??
          null)
      : nextActualReps ?? null,
    actual_load: nextDone
      ? (nextActualLoad ?? resolveDefaultActualLoad({ targetLoad: toNumberOrUndefined(targetLog.target_load) }) ?? null)
      : nextActualLoad ?? null,
    done: nextDone,
    updated_at: timestamp,
  };

  const updates: Array<PromiseLike<{ error: unknown }>> = [
    admin.from("workout_set_logs").update(updatePayload).eq("id", resolvedLogId),
  ];

  if (patch.done !== undefined && targetLog.superset_group) {
    const supersetUpdatePayload = {
      done: patch.done,
      updated_at: updatePayload.updated_at,
    };

    updates.push(
      admin
        .from("workout_set_logs")
        .update(supersetUpdatePayload)
        .eq("scheduled_workout_id", scheduledWorkoutId)
        .eq("superset_group", targetLog.superset_group)
        .eq("set_label", targetLog.set_label)
        .neq("id", resolvedLogId),
    );
  }

  updates.push(
    admin
      .from("workout_sessions")
      .update({ updated_at: updatePayload.updated_at })
      .eq("scheduled_workout_id", scheduledWorkoutId),
  );

  if (workout.status !== "completed") {
    updates.push(
      admin
        .from("scheduled_workouts")
        .update({
          status: "in_progress",
          updated_at: updatePayload.updated_at,
        })
        .eq("id", scheduledWorkoutId)
        .eq("status", "in_progress"),
    );
  }

  const results = await Promise.all(updates);
  timer.checkpoint("update-write-phase");

  if (results.some((result) => Boolean(result.error))) {
    return { ok: false as const, message: "Sarjan päivitys epäonnistui." };
  }

  timer.checkpoint("done");
  return {
    ok: true as const,
    sessionUpdatedAt: timestamp,
    setLog: {
      id: resolvedLogId,
      actualReps: updatePayload.actual_reps ?? undefined,
      actualLoad: toNumberOrUndefined(updatePayload.actual_load),
      done: updatePayload.done,
    },
  };
}

export async function syncWorkoutSetDraftsOnServer({
  requester,
  scheduledWorkoutId,
  sets,
}: {
  requester: RequesterProfile;
  scheduledWorkoutId: string;
  sets: WorkoutSetDraftPatch[];
}): Promise<WorkoutBatchSetMutationResult> {
  const admin = createSupabaseAdminClient();
  const timer = createPhaseTimer(`workout-set-sync:${scheduledWorkoutId}`);
  if (!admin) {
    return { ok: false as const, message: "Supabase admin -yhteys puuttuu. Tarkista service role -avain." };
  }

  if (!sets.length) {
    return { ok: true as const, updatedAt: nowIso(), setLogs: [] };
  }

  const dedupedSetPatches = new Map<string, WorkoutSetDraftPatch>();
  sets.forEach((setPatch) => {
    const key = buildWorkoutSetDraftKey(setPatch);
    if (key) {
      dedupedSetPatches.set(key, setPatch);
    }
  });

  if (!dedupedSetPatches.size) {
    return { ok: false as const, message: "Sarjapäivityksistä puuttuu tunniste.", code: "not_found" };
  }

  const { data: workout } = await admin
    .from("scheduled_workouts")
    .select("id, athlete_id, status")
    .eq("id", scheduledWorkoutId)
    .maybeSingle<{ id: string; athlete_id: string; status: ScheduledWorkout["status"] }>();
  timer.checkpoint("workout-query");

  if (!workout || (!isAdminRole(requester.role) && workout.athlete_id !== requester.id)) {
    return { ok: false as const, message: "Treeniä ei löytynyt.", code: "forbidden" };
  }

  if (workout.status !== "in_progress" && workout.status !== "completed") {
    return {
      ok: false as const,
      message: "Sarjoja voi muokata vain aktiivisesta tai valmiista treenistä.",
      code: "invalid_state",
    };
  }

  const { data: targetLogs } = await admin
    .from("workout_set_logs")
    .select("id, template_exercise_id, set_id, set_label, superset_group, target_reps, target_reps_min, target_load, actual_reps, actual_load, done")
    .eq("scheduled_workout_id", scheduledWorkoutId);
  timer.checkpoint("target-logs-query");

  if (!targetLogs?.length) {
    return { ok: false as const, message: "Sarjoja ei löytynyt.", code: "not_found" };
  }

  type TargetLog = NonNullable<typeof targetLogs>[number];
  const workingLogs = new Map<string, TargetLog>(targetLogs.map((log) => [log.id, { ...log }]));
  const logsByDraftKey = new Map<string, TargetLog>();
  targetLogs.forEach((log) => {
    if (log.template_exercise_id && log.set_label) {
      logsByDraftKey.set(`${log.template_exercise_id}::${log.set_label}`, log);
    }
    logsByDraftKey.set(`log::${log.id}`, log);
  });

  const changedLogIds = new Set<string>();

  for (const setPatch of dedupedSetPatches.values()) {
    const key = buildWorkoutSetDraftKey(setPatch);
    const targetLog = key ? logsByDraftKey.get(key) : null;
    if (!targetLog) {
      return { ok: false as const, message: "Sarjaa ei löytynyt.", code: "not_found" };
    }

    const currentLog = workingLogs.get(targetLog.id) ?? targetLog;
    const hasActualReps = Object.prototype.hasOwnProperty.call(setPatch, "actualReps");
    const hasActualLoad = Object.prototype.hasOwnProperty.call(setPatch, "actualLoad");
    const nextDone = setPatch.done ?? currentLog.done;
    const nextActualReps = hasActualReps ? setPatch.actualReps ?? undefined : currentLog.actual_reps ?? undefined;
    const nextActualLoad = hasActualLoad ? setPatch.actualLoad ?? undefined : toNumberOrUndefined(currentLog.actual_load);

    const updatePayload = {
      actual_reps: nextDone
        ? (nextActualReps ??
            resolveDefaultActualReps({
              targetReps: currentLog.target_reps,
              targetRepsMin: currentLog.target_reps_min ?? undefined,
            }) ??
            null)
        : nextActualReps ?? null,
      actual_load: nextDone
        ? (nextActualLoad ?? resolveDefaultActualLoad({ targetLoad: toNumberOrUndefined(currentLog.target_load) }) ?? null)
        : nextActualLoad ?? null,
      done: nextDone,
    };

    workingLogs.set(targetLog.id, {
      ...currentLog,
      actual_reps: updatePayload.actual_reps,
      actual_load: updatePayload.actual_load,
      done: updatePayload.done,
    });
    changedLogIds.add(targetLog.id);

    if (setPatch.done !== undefined && currentLog.superset_group) {
      targetLogs.forEach((candidate) => {
        if (
          candidate.id === targetLog.id ||
          candidate.superset_group !== currentLog.superset_group ||
          candidate.set_label !== currentLog.set_label
        ) {
          return;
        }

        const siblingCurrent = workingLogs.get(candidate.id) ?? candidate;
        workingLogs.set(candidate.id, {
          ...siblingCurrent,
          done: setPatch.done ?? siblingCurrent.done,
        });
        changedLogIds.add(candidate.id);
      });
    }
  }

  const timestamp = nowIso();
  const updates: Array<PromiseLike<{ error: unknown }>> = [];
  changedLogIds.forEach((logId) => {
    const currentLog = workingLogs.get(logId);
    if (!currentLog) {
      return;
    }

    updates.push(
      admin
        .from("workout_set_logs")
        .update({
          actual_reps: currentLog.actual_reps,
          actual_load: currentLog.actual_load,
          done: currentLog.done,
          updated_at: timestamp,
        })
        .eq("id", logId),
    );
  });

  updates.push(
    admin
      .from("workout_sessions")
      .update({ updated_at: timestamp })
      .eq("scheduled_workout_id", scheduledWorkoutId),
  );

  if (workout.status !== "completed") {
    updates.push(
      admin
        .from("scheduled_workouts")
        .update({
          status: "in_progress",
          updated_at: timestamp,
        })
        .eq("id", scheduledWorkoutId),
        );
  }

  const results = await Promise.all(updates);
  timer.checkpoint("update-write-phase");

  if (results.some((result) => Boolean(result.error))) {
    return { ok: false as const, message: "Sarjojen tallennus epäonnistui." };
  }

  timer.checkpoint("done");
  return {
    ok: true as const,
    updatedAt: timestamp,
    setLogs: Array.from(changedLogIds).map((logId) => {
      const currentLog = workingLogs.get(logId)!;
      return {
        id: currentLog.id,
        templateExerciseId: currentLog.template_exercise_id ?? undefined,
        setLabel: currentLog.set_label ?? undefined,
        actualReps: currentLog.actual_reps ?? undefined,
        actualLoad: toNumberOrUndefined(currentLog.actual_load),
        done: currentLog.done,
      };
    }),
  };
}

export async function saveWorkoutNoteOnServer({
  requester,
  scheduledWorkoutId,
  body,
  expectedUpdatedAt,
}: {
  requester: RequesterProfile;
  scheduledWorkoutId: string;
  body: string;
  expectedUpdatedAt?: string | null;
}): Promise<WorkoutNoteMutationResult> {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return { ok: false as const, message: "Supabase admin -yhteys puuttuu. Tarkista service role -avain." };
  }

  const { data, error } = await admin.rpc("save_workout_note_entry", {
    p_scheduled_workout_id: scheduledWorkoutId,
    p_requester_id: requester.id,
    p_requester_role: requester.role,
    p_body: body,
    p_expected_note_updated_at: expectedUpdatedAt ?? null,
  });

  if (error) {
    return { ok: false as const, message: "Muistiinpanon tallennus epäonnistui." };
  }

  const payload = Array.isArray(data) ? data[0] : data;
  if (!payload || typeof payload !== "object") {
    return { ok: false as const, message: "Muistiinpanon tallennus epäonnistui." };
  }

  if (!payload.ok) {
    const code = typeof payload.code === "string" ? payload.code : undefined;
    return {
      ok: false as const,
      message: typeof payload.message === "string" ? payload.message : "Muistiinpanon tallennus epäonnistui.",
      code: code as "stale_note" | "not_found" | "invalid_state" | "forbidden" | undefined,
    };
  }

  if (typeof payload.note_updated_at !== "string") {
    return { ok: false as const, message: "Muistiinpanon tallennus epäonnistui." };
  }

  return { ok: true as const, updatedAt: payload.note_updated_at };
}

export async function completeWorkoutOnServer({
  requester,
  scheduledWorkoutId,
  expectedUpdatedAt,
}: {
  requester: RequesterProfile;
  scheduledWorkoutId: string;
  expectedUpdatedAt?: string;
}): Promise<WorkoutMutationResult> {
  const admin = createSupabaseAdminClient();
  const timer = createPhaseTimer(`workout-complete:${scheduledWorkoutId}`);
  if (!admin) {
    return { ok: false as const, message: "Supabase admin -yhteys puuttuu. Tarkista service role -avain." };
  }

  if (!expectedUpdatedAt) {
    return { ok: false as const, message: "Treenin viimeistelystä puuttuu versiotieto." };
  }

  const { data, error } = await admin.rpc("complete_workout_atomic", {
    p_scheduled_workout_id: scheduledWorkoutId,
    p_requester_id: requester.id,
    p_requester_role: requester.role,
    p_expected_session_updated_at: expectedUpdatedAt,
  });
  timer.checkpoint("rpc-complete");

  if (error) {
    return { ok: false as const, message: "Treeniä ei voitu merkitä valmiiksi." };
  }

  const payload = Array.isArray(data) ? data[0] : data;
  if (!payload || typeof payload !== "object") {
    return { ok: false as const, message: "Treeniä ei voitu merkitä valmiiksi." };
  }

  if (!payload.ok) {
    const code = typeof payload.code === "string" ? payload.code : undefined;
    if (code === "stale_session") {
      const retried = await retryCompleteWorkoutOnServer({
        admin,
        requester,
        scheduledWorkoutId,
      });
      if (retried) {
        timer.checkpoint("retry-after-stale-session");
        return retried;
      }
    }

    if (code !== "forbidden" && code !== "not_found") {
      const recovered = await recoverCompletedWorkoutState({
        admin,
        requester,
        scheduledWorkoutId,
      });
      if (recovered) {
        timer.checkpoint("recovered-completed-state");
        return recovered;
      }
    }

    return {
      ok: false as const,
      message: typeof payload.message === "string" ? payload.message : "Treeniä ei voitu merkitä valmiiksi.",
      code: code as "stale_session" | "stale_note" | "not_found" | "invalid_state" | "forbidden" | undefined,
    };
  }

  timer.checkpoint("done");
  return {
    ok: true as const,
    updatedAt: String(payload.updated_at),
    completedAt: typeof payload.completed_at === "string" ? payload.completed_at : undefined,
  };
}

export async function cancelWorkoutOnServer({
  requester,
  scheduledWorkoutId,
}: {
  requester: RequesterProfile;
  scheduledWorkoutId: string;
}) {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return { ok: false as const, message: "Supabase admin -yhteys puuttuu. Tarkista service role -avain." };
  }

  const { data: workout } = await admin
    .from("scheduled_workouts")
    .select("id, athlete_id, status")
    .eq("id", scheduledWorkoutId)
    .maybeSingle<{ id: string; athlete_id: string; status: ScheduledWorkout["status"] }>();

  if (!workout || (!isAdminRole(requester.role) && workout.athlete_id !== requester.id)) {
    return { ok: false as const, message: "Treeniä ei löytynyt." };
  }

  if (workout.status === "completed") {
    return { ok: false as const, message: "Valmista treeniä ei voi keskeyttää." };
  }

  const cancelledAt = nowIso();

  await admin
    .from("workout_sessions")
    .update({
      paused_at: cancelledAt,
      updated_at: cancelledAt,
    })
    .eq("scheduled_workout_id", scheduledWorkoutId);

  const { error } = await admin
    .from("scheduled_workouts")
    .update({
      status: "cancelled",
      completed_at: null,
      updated_at: cancelledAt,
    })
    .eq("id", scheduledWorkoutId);

  if (error) {
    return { ok: false as const, message: "Treenin keskeytys epäonnistui." };
  }

  return { ok: true as const };
}

export async function deleteWorkoutOnServer({
  requester,
  scheduledWorkoutId,
}: {
  requester: RequesterProfile;
  scheduledWorkoutId: string;
}) {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return { ok: false as const, message: "Supabase admin -yhteys puuttuu. Tarkista service role -avain." };
  }

  const { data: workout } = await admin
    .from("scheduled_workouts")
    .select("id, athlete_id, program_workout_id")
    .eq("id", scheduledWorkoutId)
    .maybeSingle<{ id: string; athlete_id: string; program_workout_id: string | null }>();

  if (!workout || (!isAdminRole(requester.role) && workout.athlete_id !== requester.id)) {
    return { ok: false as const, message: "Treeniä ei löytynyt." };
  }

  if (!workout.program_workout_id) {
    return { ok: false as const, message: "Vain ohjelmasta käynnistetyn treenin voi poistaa." };
  }

  const { error } = await admin.from("scheduled_workouts").delete().eq("id", scheduledWorkoutId);
  if (error) {
    return { ok: false as const, message: "Treenin poisto epäonnistui." };
  }

  return { ok: true as const };
}

export async function updateWorkoutDurationOnServer({
  requester,
  scheduledWorkoutId,
  durationSeconds,
  expectedUpdatedAt,
}: {
  requester: RequesterProfile;
  scheduledWorkoutId: string;
  durationSeconds: number;
  expectedUpdatedAt?: string;
}): Promise<WorkoutMutationResult> {
  if (!Number.isFinite(durationSeconds) || durationSeconds < 60) {
    return { ok: false as const, message: "Anna treeniajalle vähintään 1 minuutti." };
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return { ok: false as const, message: "Supabase admin -yhteys puuttuu. Tarkista service role -avain." };
  }

  if (!expectedUpdatedAt) {
    return { ok: false as const, message: "Treeniajan muokkauksesta puuttuu versiotieto." };
  }

  const { data, error } = await admin.rpc("update_workout_duration_atomic", {
    p_scheduled_workout_id: scheduledWorkoutId,
    p_requester_id: requester.id,
    p_requester_role: requester.role,
    p_expected_session_updated_at: expectedUpdatedAt,
    p_duration_seconds: durationSeconds,
  });

  if (error) {
    return { ok: false as const, message: "Treeniaikaa ei voitu päivittää." };
  }

  const payload = Array.isArray(data) ? data[0] : data;
  if (!payload || typeof payload !== "object") {
    return { ok: false as const, message: "Treeniaikaa ei voitu päivittää." };
  }

  if (!payload.ok) {
    const code = typeof payload.code === "string" ? payload.code : undefined;
    return {
      ok: false as const,
      message: typeof payload.message === "string" ? payload.message : "Treeniaikaa ei voitu päivittää.",
      code: code as "stale_session" | "stale_note" | "not_found" | "invalid_state" | "forbidden" | undefined,
    };
  }

  return { ok: true as const, updatedAt: String(payload.updated_at) };
}

export async function updateWorkoutDateOnServer({
  requester,
  scheduledWorkoutId,
  scheduledDate,
  expectedUpdatedAt,
}: {
  requester: RequesterProfile;
  scheduledWorkoutId: string;
  scheduledDate: string;
  expectedUpdatedAt?: string;
}): Promise<WorkoutMutationResult> {
  const match = scheduledDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return { ok: false as const, message: "Anna treenille kelvollinen päivämäärä." };
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return { ok: false as const, message: "Supabase admin -yhteys puuttuu. Tarkista service role -avain." };
  }

  if (!expectedUpdatedAt) {
    return { ok: false as const, message: "Treenipäivän muokkauksesta puuttuu versiotieto." };
  }

  const { data, error } = await admin.rpc("update_workout_date_atomic", {
    p_scheduled_workout_id: scheduledWorkoutId,
    p_requester_id: requester.id,
    p_requester_role: requester.role,
    p_expected_session_updated_at: expectedUpdatedAt,
    p_scheduled_date: scheduledDate,
  });

  if (error) {
    return { ok: false as const, message: "Treenipäivän päivitys epäonnistui." };
  }

  const payload = Array.isArray(data) ? data[0] : data;
  if (!payload || typeof payload !== "object") {
    return { ok: false as const, message: "Treenipäivän päivitys epäonnistui." };
  }

  if (!payload.ok) {
    const code = typeof payload.code === "string" ? payload.code : undefined;
    return {
      ok: false as const,
      message: typeof payload.message === "string" ? payload.message : "Treenipäivän päivitys epäonnistui.",
      code: code as "stale_session" | "stale_note" | "not_found" | "invalid_state" | "forbidden" | undefined,
    };
  }

  return {
    ok: true as const,
    updatedAt: String(payload.updated_at),
    completedAt: typeof payload.completed_at === "string" ? payload.completed_at : undefined,
  };
}
