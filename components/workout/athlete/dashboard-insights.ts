import {
  createEmptyMuscleGroupLiftedKg,
  createEmptyMuscleGroupSetCounts,
  ensureMuscleGroups,
  type HistoryMuscleGroupKey,
  mapExerciseToMuscleGroups,
} from "@/components/workout/athlete/dashboard-muscle-groups";
import { estimateStrengthCalories, getMeasurementsForUser, getWeightAtMoment } from "@/lib/body-metrics";
import { calculateSessionDurationSeconds } from "@/lib/domain";
import type { AppState, WorkoutSession } from "@/lib/types";

export type WorkoutOrderMetadata = {
  primaryTimestamp: string;
  secondaryTimestamp: string;
};

export function getWorkoutOrderTimestamps(
  workout: AppState["scheduledWorkouts"][number],
  session?: WorkoutSession,
): WorkoutOrderMetadata {
  return {
    primaryTimestamp: session?.startedAt ?? workout.createdAt ?? workout.scheduledDate,
    secondaryTimestamp: workout.scheduledDate ?? workout.createdAt,
  };
}

export function compareWorkoutOrderValues(left: WorkoutOrderMetadata, right: WorkoutOrderMetadata) {
  const primaryComparison = right.primaryTimestamp.localeCompare(left.primaryTimestamp);
  if (primaryComparison !== 0) {
    return primaryComparison;
  }

  const secondaryComparison = right.secondaryTimestamp.localeCompare(left.secondaryTimestamp);
  if (secondaryComparison !== 0) {
    return secondaryComparison;
  }

  return 0;
}

export function getSessionDisplayCompletedAt(session: WorkoutSession) {
  return session.completedAt ?? session.startedAt ?? session.updatedAt;
}

export type PreviousExerciseResult = {
  actualReps?: number;
  actualLoad?: number;
  completedAt: string;
  timesCompleted: number;
};

export type WorkoutInsight = {
  exerciseCount: number;
  setCount: number;
  completedSetCount: number;
  completionPercent: number;
  totalLoadKg: number;
  liftedKg: number;
  durationSeconds: number;
  estimatedCalories: number;
  muscleGroupSetCounts: Record<HistoryMuscleGroupKey, number>;
  muscleGroupLiftedKg: Record<HistoryMuscleGroupKey, number>;
  bestSet: { exerciseName: string; load: number; reps: number } | null;
};

export function buildWorkoutInsights(state: AppState) {
  const sessionByWorkoutId = new Map(
    state.sessions.map((session) => [session.scheduledWorkoutId, session]),
  );
  const planById = new Map(state.plans.map((plan) => [plan.id, plan]));
  const exerciseById = new Map(state.exercises.map((exercise) => [exercise.id, exercise]));
  const userById = new Map(state.users.map((user) => [user.id, user]));
  const bodyMeasurementsByUserId = new Map(
    state.users.map((user) => [user.id, getMeasurementsForUser(state, user.id)]),
  );
  const insights = new Map<string, WorkoutInsight>();

  state.scheduledWorkouts.forEach((workout) => {
    const session = sessionByWorkoutId.get(workout.id);
    let exerciseCount = 0;
    let setCount = 0;
    let completedSetCount = 0;
    let completionPercent = 0;
    let totalLoadKg = 0;
    let liftedKg = 0;
    let durationSeconds = 0;
    let estimatedCalories = 0;
    let bestSet: WorkoutInsight["bestSet"] = null;
    const muscleGroupSetCounts = createEmptyMuscleGroupSetCounts();
    const muscleGroupLiftedKg = createEmptyMuscleGroupLiftedKg();

    if (session) {
      session.setLogs.forEach((log) => {
        if (!log.done) {
          return;
        }

        const load = log.actualLoad ?? log.targetLoad ?? 0;
        const reps = log.actualReps ?? log.targetReps;
        if (load <= 0 || reps <= 0) {
          return;
        }

        if (!bestSet || load > bestSet.load || (load === bestSet.load && reps > bestSet.reps)) {
          bestSet = { exerciseName: log.exerciseName, load, reps };
        }
      });

      exerciseCount = new Set(session.setLogs.map((log) => log.templateExerciseId)).size;
      setCount = session.setLogs.length;
      completedSetCount = session.setLogs.filter((log) => log.done).length;
      completionPercent = setCount > 0 ? Math.round((completedSetCount / setCount) * 100) : 0;
      totalLoadKg = session.setLogs.reduce((sum, log) => {
        if (!log.done) {
          return sum;
        }
        return sum + (log.actualLoad ?? log.targetLoad ?? 0);
      }, 0);
      liftedKg = session.setLogs.reduce((sum, log) => {
        if (!log.done) {
          return sum;
        }

        const reps = log.actualReps ?? log.targetReps;
        const load = log.actualLoad ?? log.targetLoad ?? 0;
        return sum + reps * load;
      }, 0);

      durationSeconds = calculateSessionDurationSeconds(session);
      estimatedCalories = estimateStrengthCalories({
        durationSeconds,
        completionPercent,
        completedSetCount,
        weightKg: getWeightAtMoment(
          userById.get(workout.athleteId),
          bodyMeasurementsByUserId.get(workout.athleteId) ?? [],
          getSessionDisplayCompletedAt(session),
        ),
      });

      const logsForGroupSummary =
        completedSetCount > 0 ? session.setLogs.filter((log) => log.done) : session.setLogs;
      logsForGroupSummary.forEach((log) => {
        const category = exerciseById.get(log.exerciseId)?.category;
        const groups = ensureMuscleGroups(
          mapExerciseToMuscleGroups(category, log.exerciseName, log.muscleGroup),
        );
        groups.forEach((groupKey) => {
          muscleGroupSetCounts[groupKey] += 1;
        });
      });

      session.setLogs
        .filter((log) => log.done)
        .forEach((log) => {
          const category = exerciseById.get(log.exerciseId)?.category;
          const groups = ensureMuscleGroups(
            mapExerciseToMuscleGroups(category, log.exerciseName, log.muscleGroup),
          );
          const reps = log.actualReps ?? log.targetReps;
          const load = log.actualLoad ?? log.targetLoad ?? 0;
          const liftedForLog = reps * load;
          const distributedLiftedForLog = groups.length > 0 ? liftedForLog / groups.length : liftedForLog;
          groups.forEach((groupKey) => {
            muscleGroupLiftedKg[groupKey] += distributedLiftedForLog;
          });
        });
    } else if (workout.trainingPlanId && workout.programWorkoutId) {
      const plan = planById.get(workout.trainingPlanId);
      const programWorkout = plan?.workouts?.find((item) => item.id === workout.programWorkoutId);
      if (programWorkout) {
        exerciseCount = programWorkout.exercises.length;
        setCount = programWorkout.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
      }
    }

    insights.set(workout.id, {
      exerciseCount,
      setCount,
      completedSetCount,
      completionPercent,
      totalLoadKg,
      liftedKg,
      durationSeconds,
      estimatedCalories,
      muscleGroupSetCounts,
      muscleGroupLiftedKg,
      bestSet,
    });
  });

  return insights;
}

export function countWorkoutCompletions(
  state: AppState,
  athleteId: string,
  workoutRef: { templateId?: string; programWorkoutId?: string },
) {
  if (!workoutRef.templateId && !workoutRef.programWorkoutId) {
    return 0;
  }

  return state.scheduledWorkouts.filter(
    (workout) =>
      workout.athleteId === athleteId &&
      (workoutRef.programWorkoutId
        ? workout.programWorkoutId === workoutRef.programWorkoutId
        : workout.templateId === workoutRef.templateId) &&
      workout.status === "completed",
  ).length;
}

export function getLatestWorkoutCompletionDate(
  state: AppState,
  athleteId: string,
  workoutRef: { templateId?: string; programWorkoutId?: string },
) {
  if (!workoutRef.templateId && !workoutRef.programWorkoutId) {
    return undefined;
  }

  const sessionByWorkoutId = new Map(
    state.sessions.map((session) => [session.scheduledWorkoutId, session]),
  );

  const latest = state.scheduledWorkouts
    .filter(
      (workout) =>
        workout.athleteId === athleteId &&
        (workoutRef.programWorkoutId
          ? workout.programWorkoutId === workoutRef.programWorkoutId
          : workout.templateId === workoutRef.templateId) &&
        workout.status === "completed",
    )
    .sort((a, b) => {
      const leftCompletedAt =
        a.completedAt ?? getWorkoutOrderTimestamps(a, sessionByWorkoutId.get(a.id)).primaryTimestamp;
      const rightCompletedAt =
        b.completedAt ?? getWorkoutOrderTimestamps(b, sessionByWorkoutId.get(b.id)).primaryTimestamp;
      return rightCompletedAt.localeCompare(leftCompletedAt);
    })[0];

  if (!latest) {
    return undefined;
  }

  const latestSession = state.sessions.find((session) => session.scheduledWorkoutId === latest.id);
  return latest.completedAt ?? getWorkoutOrderTimestamps(latest, latestSession).primaryTimestamp;
}

export function buildPreviousExerciseResults(
  state: AppState,
  athleteId: string,
  workoutRef: { templateId?: string; programWorkoutId?: string },
  currentScheduledWorkoutId: string,
) {
  if (!workoutRef.templateId && !workoutRef.programWorkoutId) {
    return new Map<string, PreviousExerciseResult>();
  }

  const sessionByWorkoutId = new Map(
    state.sessions.map((session) => [session.scheduledWorkoutId, session]),
  );

  const previousWorkouts = state.scheduledWorkouts
    .filter(
      (workout) =>
        workout.athleteId === athleteId &&
        (workoutRef.programWorkoutId
          ? workout.programWorkoutId === workoutRef.programWorkoutId
          : workout.templateId === workoutRef.templateId) &&
        workout.id !== currentScheduledWorkoutId &&
        workout.status === "completed",
    )
    .sort((a, b) => {
      const metadataComparison = compareWorkoutOrderValues(
        getWorkoutOrderTimestamps(a, sessionByWorkoutId.get(a.id)),
        getWorkoutOrderTimestamps(b, sessionByWorkoutId.get(b.id)),
      );
      return metadataComparison !== 0 ? metadataComparison : b.id.localeCompare(a.id);
    });

  const previousWorkoutIds = new Set(previousWorkouts.map((workout) => workout.id));
  const exerciseCompletionCount = new Map<string, number>();

  state.sessions
    .filter((session) => previousWorkoutIds.has(session.scheduledWorkoutId))
    .forEach((session) => {
      const exercisesInSession = new Set(
        session.setLogs.filter((log) => log.done).map((log) => log.exerciseId),
      );
      exercisesInSession.forEach((exerciseId) => {
        exerciseCompletionCount.set(exerciseId, (exerciseCompletionCount.get(exerciseId) ?? 0) + 1);
      });
    });

  const result = new Map<string, PreviousExerciseResult>();

  state.sessions
    .filter((session) => previousWorkoutIds.has(session.scheduledWorkoutId))
    .sort((a, b) => {
      const metadataComparison = compareWorkoutOrderValues(
        { primaryTimestamp: getSessionDisplayCompletedAt(a), secondaryTimestamp: a.startedAt ?? a.updatedAt },
        { primaryTimestamp: getSessionDisplayCompletedAt(b), secondaryTimestamp: b.startedAt ?? b.updatedAt },
      );
      return metadataComparison !== 0 ? metadataComparison : b.id.localeCompare(a.id);
    })
    .forEach((session) => {
      session.setLogs.forEach((log) => {
        if (result.has(log.exerciseId)) {
          return;
        }

        if (!log.done) {
          return;
        }

        result.set(log.exerciseId, {
          actualReps: log.actualReps,
          actualLoad: log.actualLoad,
          completedAt: getSessionDisplayCompletedAt(session),
          timesCompleted: exerciseCompletionCount.get(log.exerciseId) ?? 0,
        });
      });
    });

  return result;
}

export function buildWorkoutExerciseInstructions(
  state: AppState,
  scheduledWorkout: AppState["scheduledWorkouts"][number],
) {
  const workout = resolveScheduledProgramWorkout(state, scheduledWorkout);
  if (!workout) {
    return new Map<string, string>();
  }

  return new Map(
    workout.exercises
      .map((exercise) => [exercise.id, exercise.instruction.trim()] as const)
      .filter((entry) => entry[1].length > 0),
  );
}

export function resolveScheduledProgramWorkout(
  state: AppState,
  scheduledWorkout: AppState["scheduledWorkouts"][number],
) {
  if (scheduledWorkout.trainingPlanId && scheduledWorkout.programWorkoutId) {
    const plan = state.plans.find((item) => item.id === scheduledWorkout.trainingPlanId);
    const workout = plan?.workouts?.find((item) => item.id === scheduledWorkout.programWorkoutId);
    if (workout) {
      return workout;
    }
  }

  if (!scheduledWorkout.programWorkoutId) {
    return undefined;
  }

  return state.plans
    .flatMap((plan) => plan.workouts ?? [])
    .find((workout) => workout.id === scheduledWorkout.programWorkoutId);
}
