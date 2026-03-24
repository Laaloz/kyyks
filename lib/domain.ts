import { demoState } from "@/lib/demo-data";
import { makeId } from "@/lib/utils";
import type {
  AppState,
  Invite,
  InviteInput,
  ProgramUpdateInput,
  ProgramBuilderInput,
  ProgramWorkout,
  ProgramWorkoutInput,
  ScheduledWorkout,
  SplitType,
  TemplateBuilderInput,
  WorkoutSession,
  TrainingPlan,
  WorkoutTemplate,
  WorkoutUpdateInput,
} from "@/lib/types";

function nowIso() {
  return new Date().toISOString();
}

const DEFAULT_RPE = 8;

function defaultWorkoutName(splitType: SplitType, _index: number) {
  if (splitType === "upper") return "Yläkroppa";
  if (splitType === "lower") return "Alakroppa";
  if (splitType === "full_body") return "Koko kroppa";
  return "Harjoitus";
}

function buildProgramWorkouts(
  workouts: ProgramWorkoutInput[],
  existingWorkouts: ProgramWorkout[] = [],
): ProgramWorkout[] {
  return workouts.map((workout, workoutIndex) => {
    const existingWorkout = existingWorkouts[workoutIndex];

    return {
      id: existingWorkout?.id ?? makeId("program_workout"),
      name: workout.nameOverride?.trim() || defaultWorkoutName(workout.splitType, workoutIndex),
      splitType: workout.splitType,
      defaultRestSeconds: workout.defaultRestSeconds,
      exercises: workout.exercises.map((exercise, exerciseIndex) => {
        const existingExercise = existingWorkout?.exercises[exerciseIndex];
        const rangeMode =
          exercise.repMode === "range" ||
          (exercise.targetRepsMin !== undefined && exercise.targetRepsMax !== undefined);
        const rangeMin = exercise.targetRepsMin ?? exercise.targetReps;
        const rangeMax = exercise.targetRepsMax ?? exercise.targetReps;

        return {
          id: existingExercise?.id ?? makeId("program_ex"),
          exerciseId: exercise.exerciseId,
          exerciseName:
            exercise.exerciseNameOverride?.trim() ||
            exercise.exerciseName?.trim() ||
            exercise.customExerciseName?.trim() ||
            `Liike ${exerciseIndex + 1}`,
          muscleGroup: exercise.customMuscleGroup,
          supersetGroup: exercise.supersetGroup,
          instruction: exercise.instruction,
          sets: Array.from({ length: exercise.setCount }, (_, setIndex) => ({
            // Range mode uses min reps as the baseline targetReps value.
            // This keeps old consumers working while enabling 6-8 style progression.
            targetReps: rangeMode ? rangeMin : exercise.targetReps,
            id: existingExercise?.sets[setIndex]?.id ?? makeId("program_set"),
            label: String(setIndex + 1),
            targetRepsMin: rangeMode ? rangeMin : undefined,
            targetRepsMax: rangeMode ? rangeMax : undefined,
            targetLoad: exercise.targetLoad,
            restSeconds: exercise.restSeconds,
            notes: exercise.notes,
          })),
        };
      }),
    };
  });
}

type AutofillSnapshot = {
  actualReps?: number;
  actualLoad?: number;
  rpe?: number;
};

type SetLogDefaultsTarget = {
  targetReps: number;
  targetRepsMin?: number;
  targetLoad?: number;
};

function resolveDefaultActualReps(target: SetLogDefaultsTarget) {
  return target.targetRepsMin ?? target.targetReps;
}

function resolveDefaultActualLoad(target: SetLogDefaultsTarget) {
  if (target.targetLoad === undefined || target.targetLoad <= 0) {
    return undefined;
  }

  return target.targetLoad;
}

function buildExerciseAutofillSnapshots(
  state: AppState,
  athleteId: string,
  currentScheduledWorkoutId: string,
) {
  const scheduledById = new Map(state.scheduledWorkouts.map((workout) => [workout.id, workout]));
  const sessionCandidates = state.sessions
    .filter((session) => session.athleteId === athleteId && session.scheduledWorkoutId !== currentScheduledWorkoutId)
    .filter((session) => {
      const scheduledWorkout = scheduledById.get(session.scheduledWorkoutId);
      return Boolean(session.completedAt || scheduledWorkout?.status === "completed");
    })
    .sort((a, b) => {
      const aCompletedAt = a.completedAt ?? "";
      const bCompletedAt = b.completedAt ?? "";
      if (aCompletedAt !== bCompletedAt) {
        return bCompletedAt.localeCompare(aCompletedAt);
      }
      return b.updatedAt.localeCompare(a.updatedAt);
    });

  const byExerciseAndSetLabel = new Map<string, AutofillSnapshot>();
  const byExercise = new Map<string, AutofillSnapshot>();

  sessionCandidates.forEach((session) => {
    session.setLogs.forEach((log) => {
      if (!log.done) {
        return;
      }

      if (log.actualReps === undefined && log.actualLoad === undefined && log.rpe === undefined) {
        return;
      }

      const snapshot: AutofillSnapshot = {
        actualReps: log.actualReps,
        actualLoad: log.actualLoad,
        rpe: log.rpe,
      };
      const exerciseSetKey = `${log.exerciseId}:${log.setLabel}`;
      if (!byExerciseAndSetLabel.has(exerciseSetKey)) {
        byExerciseAndSetLabel.set(exerciseSetKey, snapshot);
      }
      if (!byExercise.has(log.exerciseId)) {
        byExercise.set(log.exerciseId, snapshot);
      }
    });
  });

  return {
    byExerciseAndSetLabel,
    byExercise,
  };
}

export function cloneDemoState(): AppState {
  return JSON.parse(JSON.stringify(demoState)) as AppState;
}

export function createTemplate(input: TemplateBuilderInput, coachId: string): WorkoutTemplate {
  const createdAt = nowIso();

  return {
    id: makeId("template"),
    coachId,
    title: input.title,
    description: input.description,
    goal: input.goal,
    splitType: input.splitType,
    status: "published",
    blocks: [
      {
        id: makeId("block"),
        title: input.blockTitle,
        note: input.blockNote,
        exercises: input.exercises.map((exercise) => ({
          id: makeId("template_ex"),
          exerciseId: exercise.exerciseId,
          instruction: exercise.instruction,
          sets: Array.from({ length: exercise.setCount }, (_, index) => ({
            id: makeId("set"),
            label: String(index + 1),
            targetReps: exercise.targetReps,
            targetLoad: exercise.targetLoad,
            restSeconds: exercise.restSeconds,
            notes: exercise.notes,
          })),
        })),
      },
    ],
    createdAt,
    updatedAt: createdAt,
    createdBy: coachId,
    updatedBy: coachId,
  };
}

export function splitLabel(splitType: SplitType | undefined) {
  switch (splitType) {
    case "upper":
      return "Yläkroppa";
    case "lower":
      return "Alakroppa";
    case "full_body":
      return "Koko kroppa";
    default:
      return "Custom";
  }
}

export function createProgram(input: ProgramBuilderInput, coachId: string): TrainingPlan {
  const timestamp = nowIso();
  const workouts = buildProgramWorkouts(input.workouts);

  return {
    id: makeId("plan"),
    coachId,
    athleteId: input.athleteId,
    title: input.title,
    workouts,
    startDate: input.startDate ? new Date(`${input.startDate}T08:00:00`).toISOString() : timestamp,
    weekCount: input.weekCount ?? 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function updateProgram(plan: TrainingPlan, patch: ProgramUpdateInput): TrainingPlan {
  const timestamp = nowIso();

  return {
    ...plan,
    title: patch.title?.trim() || plan.title,
    workouts: patch.workouts
      ? buildProgramWorkouts(patch.workouts, plan.workouts ?? [])
      : plan.workouts,
    updatedAt: timestamp,
  };
}

export function isInviteExpired(expiresAt: string) {
  return new Date(expiresAt).getTime() < Date.now();
}

export function canCoachManageAthlete(state: AppState, coachId: string, athleteId: string) {
  const coach = state.users.find((user) => user.id === coachId);
  if (coach?.role === "admin") {
    return state.users.some((user) => user.id === athleteId && user.role === "athlete");
  }

  return state.assignments.some(
    (assignment) =>
      assignment.coachId === coachId &&
      assignment.athleteId === athleteId &&
      assignment.active,
  );
}

export function getSessionProgress(state: AppState, scheduledWorkoutId: string) {
  const session = state.sessions.find((item) => item.scheduledWorkoutId === scheduledWorkoutId);
  if (!session) {
    return {
      totalSets: 0,
      completedSets: 0,
      percent: 0,
      allDone: false,
    };
  }

  const totalSets = session.setLogs.length;
  const completedSets = session.setLogs.filter((log) => log.done).length;

  return {
    totalSets,
    completedSets,
    percent: totalSets === 0 ? 0 : Math.round((completedSets / totalSets) * 100),
    allDone: totalSets > 0 && completedSets === totalSets,
  };
}

export function canCompleteSession(state: AppState, scheduledWorkoutId: string) {
  const progress = getSessionProgress(state, scheduledWorkoutId);
  return progress.totalSets > 0;
}

export function duplicateTemplate(template: WorkoutTemplate, actorId: string): WorkoutTemplate {
  const timestamp = nowIso();

  return {
    ...template,
    id: makeId("template"),
    title: `${template.title} Copy`,
    blocks: template.blocks.map((block) => ({
      ...block,
      id: makeId("block"),
      exercises: block.exercises.map((exercise) => ({
        ...exercise,
        id: makeId("template_ex"),
        sets: exercise.sets.map((set) => ({ ...set, id: makeId("set") })),
      })),
    })),
    createdAt: timestamp,
    updatedAt: timestamp,
    createdBy: actorId,
    updatedBy: actorId,
  };
}

export function createInvite(input: InviteInput, invitedBy: string): Invite {
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  return {
    id: makeId("invite"),
    token: makeId("join"),
    email: input.email,
    role: input.role,
    invitedBy,
    coachId: input.coachId,
    status: "pending",
    createdAt,
    expiresAt,
  };
}

export function startProgramWorkout(
  state: AppState,
  programId: string,
  programWorkoutId: string,
  athleteId: string,
): { state: AppState; scheduledWorkout: ScheduledWorkout; session: WorkoutSession } {
  const plan = state.plans.find((item) => item.id === programId && item.athleteId === athleteId);
  if (!plan || !plan.workouts?.length) {
    throw new Error("Program not found");
  }

  const workout = plan.workouts.find((item) => item.id === programWorkoutId);
  if (!workout) {
    throw new Error("Program workout not found");
  }

  const timestamp = nowIso();
  const scheduledWorkout: ScheduledWorkout = {
    id: makeId("workout"),
    trainingPlanId: plan.id,
    programWorkoutId: workout.id,
    athleteId,
    coachId: plan.coachId,
    title: workout.name,
    scheduledDate: timestamp,
    status: "cancelled",
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const nextState = {
    ...state,
    scheduledWorkouts: [scheduledWorkout, ...state.scheduledWorkouts],
  };

  const started = startSession(nextState, scheduledWorkout.id);
  return { state: started.state, scheduledWorkout, session: started.session };
}

export function startSession(
  state: AppState,
  scheduledWorkoutId: string,
): { state: AppState; session: WorkoutSession } {
  const existing = state.sessions.find((session) => session.scheduledWorkoutId === scheduledWorkoutId);
  if (existing) {
    const scheduled = state.scheduledWorkouts.find((item) => item.id === scheduledWorkoutId);
    if (!scheduled || scheduled.status === "completed" || scheduled.status === "in_progress") {
      return { state, session: existing };
    }

    const resumedAt = nowIso();
    return {
      state: {
        ...state,
        scheduledWorkouts: state.scheduledWorkouts.map((item) =>
          item.id === scheduledWorkoutId
            ? { ...item, status: "in_progress", updatedAt: resumedAt }
            : item,
        ),
      },
      session: existing,
    };
  }

  const scheduledWorkout = state.scheduledWorkouts.find((item) => item.id === scheduledWorkoutId);
  if (!scheduledWorkout) {
    throw new Error("Scheduled workout not found");
  }

  const autofillSnapshots = buildExerciseAutofillSnapshots(
    state,
    scheduledWorkout.athleteId,
    scheduledWorkoutId,
  );
  const getAutofillSnapshot = (exerciseId: string, setLabel: string) =>
    autofillSnapshots.byExerciseAndSetLabel.get(`${exerciseId}:${setLabel}`) ??
    autofillSnapshots.byExercise.get(exerciseId);

  const template = scheduledWorkout.templateId
    ? state.templates.find((item) => item.id === scheduledWorkout.templateId)
    : undefined;

  let setLogs: WorkoutSession["setLogs"];

  if (template) {
    const exercises = state.exercises;
    setLogs = template.blocks.flatMap((block) =>
      block.exercises.flatMap((exercise) =>
        exercise.sets.map((set) => {
          const snapshot = getAutofillSnapshot(exercise.exerciseId, set.label);
          return {
            id: makeId("log"),
            scheduledWorkoutId,
            templateExerciseId: exercise.id,
            setId: set.id,
            exerciseId: exercise.exerciseId,
            exerciseName:
              exercises.find((candidate) => candidate.id === exercise.exerciseId)?.name ?? "Liike",
            setLabel: set.label,
            targetReps: set.targetReps,
            targetRepsMin: undefined,
            targetRepsMax: undefined,
            targetLoad: set.targetLoad,
            targetRestSeconds: set.restSeconds,
            actualReps: snapshot?.actualReps ?? resolveDefaultActualReps(set),
            actualLoad: snapshot?.actualLoad ?? resolveDefaultActualLoad(set),
            rpe: snapshot?.rpe ?? DEFAULT_RPE,
            done: false,
          };
        }),
      ),
    );
  } else {
    const program = scheduledWorkout.trainingPlanId
      ? state.plans.find((item) => item.id === scheduledWorkout.trainingPlanId)
      : undefined;
    const programWorkout = scheduledWorkout.programWorkoutId
      ? program?.workouts?.find((item) => item.id === scheduledWorkout.programWorkoutId)
      : undefined;

    if (!programWorkout) {
      throw new Error("Template or program workout not found");
    }

    setLogs = programWorkout.exercises.flatMap((exercise) =>
      exercise.sets.map((set) => {
        const resolvedExerciseId = exercise.exerciseId ?? `custom_${exercise.id}`;
        const snapshot = getAutofillSnapshot(resolvedExerciseId, set.label);
        return {
          id: makeId("log"),
          scheduledWorkoutId,
          templateExerciseId: exercise.id,
          setId: set.id,
          exerciseId: resolvedExerciseId,
          exerciseName: exercise.exerciseName,
          muscleGroup: exercise.muscleGroup,
          supersetGroup: exercise.supersetGroup,
          setLabel: set.label,
          targetReps: set.targetReps,
          targetRepsMin: set.targetRepsMin,
          targetRepsMax: set.targetRepsMax,
          targetLoad: set.targetLoad,
          targetRestSeconds: set.restSeconds ?? programWorkout.defaultRestSeconds,
          programWorkoutId: programWorkout.id,
          actualReps: snapshot?.actualReps ?? resolveDefaultActualReps(set),
          actualLoad: snapshot?.actualLoad ?? resolveDefaultActualLoad(set),
          rpe: snapshot?.rpe ?? DEFAULT_RPE,
          done: false,
        };
      }),
    );
  }

  const session: WorkoutSession = {
    id: makeId("session"),
    scheduledWorkoutId,
    athleteId: scheduledWorkout.athleteId,
    startedAt: nowIso(),
    updatedAt: nowIso(),
    setLogs,
  };

  return {
    state: {
      ...state,
      scheduledWorkouts: state.scheduledWorkouts.map((item) =>
        item.id === scheduledWorkoutId
          ? { ...item, status: "in_progress", updatedAt: nowIso() }
          : item,
      ),
      sessions: [...state.sessions, session],
    },
    session,
  };
}

export function updateSessionSet(
  state: AppState,
  scheduledWorkoutId: string,
  logId: string,
  patch: WorkoutUpdateInput,
): AppState {
  const updatedAt = nowIso();

  return {
    ...state,
    sessions: state.sessions.map((session) =>
      session.scheduledWorkoutId === scheduledWorkoutId
        ? {
            ...session,
            updatedAt,
            setLogs: (() => {
              const targetLog = session.setLogs.find((log) => log.id === logId);
              if (!targetLog) {
                return session.setLogs;
              }

              return session.setLogs.map((log) => {
                if (log.id === logId) {
                  const nextLog = { ...log, ...patch };
                  if (patch.done) {
                    return {
                      ...nextLog,
                      actualReps: nextLog.actualReps ?? resolveDefaultActualReps(nextLog),
                      actualLoad: nextLog.actualLoad ?? resolveDefaultActualLoad(nextLog),
                    };
                  }

                  return nextLog;
                }

                if (
                  patch.done !== undefined &&
                  targetLog.supersetGroup &&
                  log.supersetGroup === targetLog.supersetGroup &&
                  log.setLabel === targetLog.setLabel
                ) {
                  const nextLog = { ...log, done: patch.done };
                  if (patch.done) {
                    return {
                      ...nextLog,
                      actualReps: nextLog.actualReps ?? resolveDefaultActualReps(nextLog),
                      actualLoad: nextLog.actualLoad ?? resolveDefaultActualLoad(nextLog),
                    };
                  }

                  return nextLog;
                }

                return log;
              });
            })(),
          }
        : session,
    ),
    scheduledWorkouts: state.scheduledWorkouts.map((item) =>
      item.id === scheduledWorkoutId
        ? {
            ...item,
            status: item.status === "completed" ? "completed" : "in_progress",
            updatedAt,
          }
        : item,
    ),
  };
}

export function saveSessionNote(
  state: AppState,
  scheduledWorkoutId: string,
  body: string,
): AppState {
  const session = state.sessions.find((item) => item.scheduledWorkoutId === scheduledWorkoutId);
  const scheduled = state.scheduledWorkouts.find((item) => item.id === scheduledWorkoutId);

  if (!session || !scheduled) {
    return state;
  }

  const existing = state.notes.find((note) => note.sessionId === session.id);

  if (existing) {
    return {
      ...state,
      notes: state.notes.map((note) =>
        note.id === existing.id ? { ...note, body, updatedAt: nowIso() } : note,
      ),
    };
  }

  return {
    ...state,
    notes: [
      ...state.notes,
      {
        id: makeId("note"),
        sessionId: session.id,
        athleteId: session.athleteId,
        coachId: scheduled.coachId,
        body,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
    ],
  };
}

export function cancelSession(state: AppState, scheduledWorkoutId: string): AppState {
  const scheduled = state.scheduledWorkouts.find((item) => item.id === scheduledWorkoutId);
  if (!scheduled || scheduled.status === "completed") {
    return state;
  }

  return {
    ...state,
    scheduledWorkouts: state.scheduledWorkouts.map((item) =>
      item.id === scheduledWorkoutId
        ? {
            ...item,
            status: "cancelled",
            completedAt: undefined,
            updatedAt: nowIso(),
          }
        : item,
    ),
  };
}

export function deleteScheduledWorkout(state: AppState, scheduledWorkoutId: string): AppState {
  const sessionIds = new Set(
    state.sessions
      .filter((session) => session.scheduledWorkoutId === scheduledWorkoutId)
      .map((session) => session.id),
  );

  return {
    ...state,
    scheduledWorkouts: state.scheduledWorkouts.filter((item) => item.id !== scheduledWorkoutId),
    sessions: state.sessions.filter((session) => session.scheduledWorkoutId !== scheduledWorkoutId),
    notes: state.notes.filter((note) => !sessionIds.has(note.sessionId)),
  };
}

export function completeSession(state: AppState, scheduledWorkoutId: string): AppState {
  if (!canCompleteSession(state, scheduledWorkoutId)) {
    return state;
  }

  const completedAt = nowIso();

  return {
    ...state,
    sessions: state.sessions.map((session) =>
      session.scheduledWorkoutId === scheduledWorkoutId
        ? { ...session, completedAt, updatedAt: completedAt }
        : session,
    ),
    scheduledWorkouts: state.scheduledWorkouts.map((item) =>
      item.id === scheduledWorkoutId
        ? { ...item, status: "completed", completedAt, updatedAt: completedAt }
        : item,
    ),
  };
}

export function getCoachAthletes(state: AppState, coachId: string) {
  const coach = state.users.find((user) => user.id === coachId);
  if (coach?.role === "admin") {
    return state.users.filter((user) => user.role === "athlete");
  }

  const athleteIds = state.assignments
    .filter((assignment) => assignment.coachId === coachId && assignment.active)
    .map((assignment) => assignment.athleteId);

  return state.users.filter((user) => athleteIds.includes(user.id));
}
