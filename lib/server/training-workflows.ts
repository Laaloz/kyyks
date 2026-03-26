import "server-only";

import { createProgram as domainCreateProgram, updateProgram as domainUpdateProgram } from "@/lib/domain";
import { canActAsCoach, isAdminRole } from "@/lib/role-access";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  Exercise,
  ProgramBuilderInput,
  ProgramStatus,
  ProgramUpdateInput,
  Role,
  ScheduledWorkout,
  TrainingPlan,
  WorkoutSession,
  WorkoutUpdateInput,
} from "@/lib/types";

type RequesterProfile = {
  id: string;
  role: Role;
  email?: string;
  full_name?: string;
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
    if (athlete.role !== "athlete") {
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
  adminClient: NonNullable<ReturnType<typeof createSupabaseAdminClient>> | null = null,
) {
  const admin = adminClient ?? createSupabaseAdminClient();
  if (!admin) {
    return {
      byExerciseAndSetLabel: new Map<string, { actualReps?: number; actualLoad?: number }>(),
      byExercise: new Map<string, { actualReps?: number; actualLoad?: number }>(),
    };
  }

  const { data: completedSessions } = await admin
    .from("workout_sessions")
    .select("id, completed_at, updated_at")
    .eq("athlete_id", athleteId)
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false });

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
    .in("session_id", sessionIds);

  const sessionOrder = new Map(sessionIds.map((sessionId, index) => [sessionId, index]));
  const orderedLogs = (logs ?? []).sort((left, right) => {
    const leftIndex = sessionOrder.get(left.session_id) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = sessionOrder.get(right.session_id) ?? Number.MAX_SAFE_INTEGER;
    return leftIndex - rightIndex;
  });

  const byExerciseAndSetLabel = new Map<string, { actualReps?: number; actualLoad?: number }>();
  const byExercise = new Map<string, { actualReps?: number; actualLoad?: number }>();

  orderedLogs.forEach((log) => {
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

  const autofill = await buildAutofillSnapshotMaps(plan.athleteId, adminClient);

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
    .select("id")
    .single<{ id: string }>();

  if (sessionError || !session) {
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

  return { ok: true as const, sessionId: session.id };
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
  if (!canActAsCoach(requester.role)) {
    return { ok: false as const, message: "Vain admin tai valmentaja voi luoda treeniohjelman." };
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
  if (!canActAsCoach(requester.role)) {
    return { ok: false as const, message: "Vain admin tai valmentaja voi muokata treeniohjelmaa." };
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
  if (!canActAsCoach(requester.role)) {
    return { ok: false as const, message: "Vain admin tai valmentaja voi muuttaa ohjelman tilaa." };
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
  if (!canActAsCoach(requester.role)) {
    return { ok: false as const, message: "Vain admin tai valmentaja voi poistaa treeniohjelman." };
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

  const { count } = await admin
    .from("scheduled_workouts")
    .select("id", { count: "exact", head: true })
    .eq("training_plan_id", programId);

  if ((count ?? 0) > 0) {
    return {
      ok: false as const,
      message: "Ohjelmaa ei voi poistaa, koska siitä on jo käynnistetty treenejä tai historiaa.",
    };
  }

  const { error } = await admin.from("training_plans").delete().eq("id", programId);
  if (error) {
    return { ok: false as const, message: "Treeniohjelman poisto epäonnistui." };
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

  if (existingActive.data?.id) {
    return { ok: true as const, scheduledWorkoutId: existingActive.data.id };
  }
  timer.checkpoint("blocking-query");

  if (blockingWorkout.data) {
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

  const timestamp = nowIso();
  const [scheduledWorkoutResult, setLogs] = await Promise.all([
    admin
      .from("scheduled_workouts")
      .insert({
        training_plan_id: plan.id,
        program_workout_id: programWorkout.id,
        athlete_id: plan.athleteId,
        coach_id: plan.coachId,
        title: programWorkout.name,
        scheduled_date: timestamp,
        status: "in_progress",
        created_by: requester.id,
        updated_by: requester.id,
        created_at: timestamp,
        updated_at: timestamp,
      })
      .select("id")
      .single<{ id: string }>(),
    buildProgramWorkoutSetLogs(plan, programWorkout.id, admin),
  ]);
  const { data: scheduledWorkout, error: scheduledWorkoutError } = scheduledWorkoutResult;
  timer.checkpoint("scheduled-workout-insert");
  timer.checkpoint("set-log-build");

  if (scheduledWorkoutError || !scheduledWorkout) {
    return { ok: false as const, message: "Harjoituksen käynnistys epäonnistui." };
  }

  if (!setLogs) {
    await admin.from("scheduled_workouts").delete().eq("id", scheduledWorkout.id);
    return { ok: false as const, message: "Harjoituksen käynnistys epäonnistui." };
  }

  const sessionResult = await createSessionWithLogs({
    scheduledWorkoutId: scheduledWorkout.id,
    athleteId: plan.athleteId,
    setLogs,
    admin,
  });
  timer.checkpoint("session-and-log-insert");

  if (!sessionResult.ok) {
    await admin.from("scheduled_workouts").delete().eq("id", scheduledWorkout.id);
    return sessionResult;
  }

  timer.checkpoint("done");
  return { ok: true as const, scheduledWorkoutId: scheduledWorkout.id };
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
    .select("id, paused_at, paused_duration_seconds")
    .eq("scheduled_workout_id", scheduledWorkoutId)
    .maybeSingle<{ id: string; paused_at: string | null; paused_duration_seconds: number | null }>();

  if (existingSession) {
    if (workout.status === "completed" || workout.status === "in_progress") {
      return { ok: true as const, scheduledWorkoutId };
    }

    const resumedAt = nowIso();
    const pausedAtMs = existingSession.paused_at ? new Date(existingSession.paused_at).getTime() : Number.NaN;
    const resumedAtMs = new Date(resumedAt).getTime();
    const pausedSeconds =
      Number.isFinite(pausedAtMs) && Number.isFinite(resumedAtMs) && resumedAtMs >= pausedAtMs
        ? Math.round((resumedAtMs - pausedAtMs) / 1000)
        : 0;

    const { error: sessionError } = await admin
      .from("workout_sessions")
      .update({
        paused_at: null,
        paused_duration_seconds: (existingSession.paused_duration_seconds ?? 0) + pausedSeconds,
        updated_at: resumedAt,
      })
      .eq("id", existingSession.id);

    if (sessionError) {
      return { ok: false as const, message: "Treeniä ei voitu jatkaa." };
    }

    await admin
      .from("scheduled_workouts")
      .update({
        status: "in_progress",
        updated_at: resumedAt,
      })
      .eq("id", scheduledWorkoutId);

    return { ok: true as const, scheduledWorkoutId };
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

  const timestamp = nowIso();
  await admin
    .from("scheduled_workouts")
    .update({
      status: "in_progress",
      updated_at: timestamp,
    })
    .eq("id", scheduledWorkoutId);

  const sessionResult = await createSessionWithLogs({
    scheduledWorkoutId,
    athleteId: workout.athlete_id,
    setLogs,
  });

  if (!sessionResult.ok) {
    await admin
      .from("scheduled_workouts")
      .update({
        status: "cancelled",
        updated_at: timestamp,
      })
      .eq("id", scheduledWorkoutId);
    return sessionResult;
  }

  return { ok: true as const, scheduledWorkoutId };
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
}) {
  const admin = createSupabaseAdminClient();
  const timer = createPhaseTimer(`workout-set:${scheduledWorkoutId}`);
  if (!admin) {
    return { ok: false as const, message: "Supabase admin -yhteys puuttuu. Tarkista service role -avain." };
  }

  const timestamp = nowIso();

  const { data: workout } = await admin
    .from("scheduled_workouts")
    .select("id, athlete_id, status")
    .eq("id", scheduledWorkoutId)
    .maybeSingle<{ id: string; athlete_id: string; status: ScheduledWorkout["status"] }>();
  timer.checkpoint("workout-query");

  if (!workout || (!isAdminRole(requester.role) && workout.athlete_id !== requester.id)) {
    return { ok: false as const, message: "Treeniä ei löytynyt." };
  }

  if (workout.status !== "in_progress" && workout.status !== "completed") {
    return { ok: false as const, message: "Sarjoja voi muokata vain aktiivisesta tai valmiista treenistä." };
  }

  const { data: targetLog } = await admin
    .from("workout_set_logs")
    .select("id, template_exercise_id, set_id, set_label, superset_group, target_reps, target_reps_min, target_load, actual_reps, actual_load, done")
    .eq("id", logId)
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
    return { ok: false as const, message: "Sarjaa ei löytynyt." };
  }

  const nextDone = patch.done ?? targetLog.done;
  const nextActualReps = patch.actualReps ?? targetLog.actual_reps ?? undefined;
  const nextActualLoad = patch.actualLoad ?? toNumberOrUndefined(targetLog.actual_load);

  const updatePayload = {
    actual_reps:
      nextDone ? (nextActualReps ?? resolveDefaultActualReps({ targetReps: targetLog.target_reps, targetRepsMin: targetLog.target_reps_min ?? undefined })) : nextActualReps ?? null,
    actual_load:
      nextDone ? (nextActualLoad ?? resolveDefaultActualLoad({ targetLoad: toNumberOrUndefined(targetLog.target_load) }) ?? null) : nextActualLoad ?? null,
    done: nextDone,
    updated_at: timestamp,
  };

  const updates: Array<PromiseLike<{ error: unknown }>> = [
    admin
      .from("workout_set_logs")
      .update(updatePayload)
      .eq("id", logId),
  ];

  if (patch.done !== undefined && targetLog.superset_group) {
    const supersetUpdatePayload = {
      done: patch.done,
      updated_at: updatePayload.updated_at,
      ...(patch.done
        ? {
            actual_reps: updatePayload.actual_reps,
            actual_load: updatePayload.actual_load,
          }
        : {}),
    };

    updates.push(
      admin
        .from("workout_set_logs")
        .update(supersetUpdatePayload)
        .eq("scheduled_workout_id", scheduledWorkoutId)
        .eq("superset_group", targetLog.superset_group)
        .eq("set_label", targetLog.set_label)
        .neq("id", logId),
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
  return { ok: true as const };
}

export async function saveWorkoutNoteOnServer({
  requester,
  scheduledWorkoutId,
  body,
}: {
  requester: RequesterProfile;
  scheduledWorkoutId: string;
  body: string;
}) {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return { ok: false as const, message: "Supabase admin -yhteys puuttuu. Tarkista service role -avain." };
  }

  const { data: workout } = await admin
    .from("scheduled_workouts")
    .select("id, athlete_id, coach_id")
    .eq("id", scheduledWorkoutId)
    .maybeSingle<{ id: string; athlete_id: string; coach_id: string }>();

  if (!workout || (!isAdminRole(requester.role) && workout.athlete_id !== requester.id)) {
    return { ok: false as const, message: "Treeniä ei löytynyt." };
  }

  const { data: session } = await admin
    .from("workout_sessions")
    .select("id")
    .eq("scheduled_workout_id", scheduledWorkoutId)
    .maybeSingle<{ id: string }>();

  if (!session) {
    return { ok: false as const, message: "Aloita treeni ennen muistiinpanon tallennusta." };
  }

  const timestamp = nowIso();
  const { error } = await admin.from("workout_notes").upsert(
    {
      session_id: session.id,
      athlete_id: workout.athlete_id,
      coach_id: workout.coach_id,
      body,
      updated_at: timestamp,
    },
    { onConflict: "session_id" },
  );

  if (error) {
    return { ok: false as const, message: "Muistiinpanon tallennus epäonnistui." };
  }

  return { ok: true as const };
}

export async function completeWorkoutOnServer({
  requester,
  scheduledWorkoutId,
}: {
  requester: RequesterProfile;
  scheduledWorkoutId: string;
}) {
  const admin = createSupabaseAdminClient();
  const timer = createPhaseTimer(`workout-complete:${scheduledWorkoutId}`);
  if (!admin) {
    return { ok: false as const, message: "Supabase admin -yhteys puuttuu. Tarkista service role -avain." };
  }

  const { data: workout } = await admin
    .from("scheduled_workouts")
    .select("id, athlete_id")
    .eq("id", scheduledWorkoutId)
    .maybeSingle<{ id: string; athlete_id: string }>();
  timer.checkpoint("workout-query");

  if (!workout || (!isAdminRole(requester.role) && workout.athlete_id !== requester.id)) {
    return { ok: false as const, message: "Treeniä ei löytynyt." };
  }

  const { count } = await admin
    .from("workout_set_logs")
    .select("id", { count: "exact", head: true })
    .eq("scheduled_workout_id", scheduledWorkoutId);
  timer.checkpoint("set-count-query");

  if ((count ?? 0) === 0) {
    return { ok: false as const, message: "Treeniä ei voitu merkitä valmiiksi." };
  }

  const completedAt = nowIso();
  const [{ error: sessionError }, { error }] = await Promise.all([
    admin
      .from("workout_sessions")
      .update({
        completed_at: completedAt,
        paused_at: null,
        updated_at: completedAt,
      })
      .eq("scheduled_workout_id", scheduledWorkoutId),
    admin
      .from("scheduled_workouts")
      .update({
        status: "completed",
        completed_at: completedAt,
        updated_at: completedAt,
      })
      .eq("id", scheduledWorkoutId),
  ]);
  timer.checkpoint("complete-updates");

  if (sessionError || error) {
    return { ok: false as const, message: "Treeniä ei voitu merkitä valmiiksi." };
  }

  timer.checkpoint("done");
  return { ok: true as const };
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
}: {
  requester: RequesterProfile;
  scheduledWorkoutId: string;
  durationSeconds: number;
}) {
  if (!Number.isFinite(durationSeconds) || durationSeconds < 60) {
    return { ok: false as const, message: "Anna treeniajalle vähintään 1 minuutti." };
  }

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

  if (workout.status !== "completed") {
    return { ok: false as const, message: "Treeniaikaa voi muokata vain valmiilta treeniltä." };
  }

  const { data: session } = await admin
    .from("workout_sessions")
    .select("id, completed_at, paused_duration_seconds")
    .eq("scheduled_workout_id", scheduledWorkoutId)
    .maybeSingle<{ id: string; completed_at: string | null; paused_duration_seconds: number | null }>();

  if (!session?.completed_at) {
    return { ok: false as const, message: "Valmiin treenin aikaa ei löytynyt muokattavaksi." };
  }

  const completedAtMs = new Date(session.completed_at).getTime();
  if (!Number.isFinite(completedAtMs)) {
    return { ok: false as const, message: "Treeniaikaa ei voitu päivittää." };
  }

  const startedAt = new Date(
    completedAtMs - (durationSeconds + (session.paused_duration_seconds ?? 0)) * 1000,
  ).toISOString();

  const { error } = await admin
    .from("workout_sessions")
    .update({
      started_at: startedAt,
    })
    .eq("scheduled_workout_id", scheduledWorkoutId);

  if (error) {
    return { ok: false as const, message: "Treeniaikaa ei voitu päivittää." };
  }

  return { ok: true as const };
}

export async function updateWorkoutDateOnServer({
  requester,
  scheduledWorkoutId,
  scheduledDate,
}: {
  requester: RequesterProfile;
  scheduledWorkoutId: string;
  scheduledDate: string;
}) {
  const match = scheduledDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return { ok: false as const, message: "Anna treenille kelvollinen päivämäärä." };
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return { ok: false as const, message: "Supabase admin -yhteys puuttuu. Tarkista service role -avain." };
  }

  const { data: workout } = await admin
    .from("scheduled_workouts")
    .select("id, athlete_id, scheduled_date, completed_at")
    .eq("id", scheduledWorkoutId)
    .maybeSingle<{
      id: string;
      athlete_id: string;
      scheduled_date: string;
      completed_at: string | null;
    }>();

  if (!workout || (!isAdminRole(requester.role) && workout.athlete_id !== requester.id)) {
    return { ok: false as const, message: "Treeniä ei löytynyt." };
  }

  const { data: session } = await admin
    .from("workout_sessions")
    .select("id, started_at, completed_at, paused_at")
    .eq("scheduled_workout_id", scheduledWorkoutId)
    .maybeSingle<{
      id: string;
      started_at: string;
      completed_at: string | null;
      paused_at: string | null;
    }>();

  const referenceTimestamp = workout.completed_at ?? session?.completed_at ?? workout.scheduled_date;
  const reference = new Date(referenceTimestamp);
  if (!Number.isFinite(reference.getTime())) {
    return { ok: false as const, message: "Treenipäivää ei voitu päivittää." };
  }

  const [, yearText, monthText, dayText] = match;
  const shiftedReference = new Date(reference);
  shiftedReference.setFullYear(Number(yearText), Number(monthText) - 1, Number(dayText));
  const deltaMs = shiftedReference.getTime() - reference.getTime();
  const updatedAt = nowIso();

  const shiftTimestamp = (value: string | null) => {
    if (!value) {
      return value;
    }

    const timestamp = new Date(value).getTime();
    if (!Number.isFinite(timestamp)) {
      return value;
    }

    return new Date(timestamp + deltaMs).toISOString();
  };

  const workoutUpdate = await admin
    .from("scheduled_workouts")
    .update({
      scheduled_date: shiftTimestamp(workout.scheduled_date),
      completed_at: shiftTimestamp(workout.completed_at),
      updated_at: updatedAt,
    })
    .eq("id", scheduledWorkoutId);

  if (workoutUpdate.error) {
    return { ok: false as const, message: "Treenipäivän päivitys epäonnistui." };
  }

  if (session) {
    const sessionUpdate = await admin
      .from("workout_sessions")
      .update({
        started_at: shiftTimestamp(session.started_at),
        completed_at: shiftTimestamp(session.completed_at),
        paused_at: shiftTimestamp(session.paused_at),
        updated_at: updatedAt,
      })
      .eq("id", session.id);

    if (sessionUpdate.error) {
      return { ok: false as const, message: "Treenipäivän päivitys epäonnistui." };
    }
  }

  return { ok: true as const };
}
