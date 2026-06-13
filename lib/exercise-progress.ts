import type { AppState, ScheduledWorkout, WorkoutSession, WorkoutSetLog } from "@/lib/types";

export type ExerciseProgressPoint = {
  date: string;
  value: number;
  actualLoad: number;
  actualReps: number;
  scheduledWorkoutId: string;
  workoutTitle: string;
  completedAt: string;
};

export type ExerciseProgressSetSummary = {
  actualLoad: number;
  actualReps: number;
  estimatedOneRepMax: number;
  scheduledWorkoutId: string;
  workoutTitle: string;
  completedAt: string;
};

// Toistoennätys: paras paino tietyllä toistomäärällä.
export type ExerciseRepRecord = { reps: number; weight: number; completedAt: string };
// Painoennätys: eniten toistoja tietyllä painolla.
export type ExerciseWeightRecord = { weight: number; reps: number; completedAt: string };

export type ExerciseProgressSummary = {
  exerciseKey: string;
  exerciseId?: string;
  exerciseName: string;
  lastCompletedAt: string;
  completedSetCount: number;
  currentEstimatedOneRepMax?: number;
  trendPoints: ExerciseProgressPoint[];
  bestSet?: ExerciseProgressSetSummary;
  latestSet?: ExerciseProgressSetSummary;
  repRecords: ExerciseRepRecord[];
  weightRecords: ExerciseWeightRecord[];
  hasWeightedData: boolean;
};

export type ExerciseProgressOption = {
  key: string;
  exerciseId?: string;
  exerciseName: string;
  lastCompletedAt: string;
  completedSetCount: number;
  hasWeightedData: boolean;
};

export type ExerciseProgressCatalog = {
  exercises: ExerciseProgressOption[];
  summaries: Map<string, ExerciseProgressSummary>;
};

type WeightedExerciseSet = {
  actualLoad: number;
  actualReps: number;
  estimatedOneRepMax: number;
  scheduledWorkoutId: string;
  workoutTitle: string;
  completedAt: string;
};

type ExerciseAccumulator = {
  exerciseKey: string;
  exerciseId?: string;
  exerciseName: string;
  lastCompletedAt: string;
  completedSetCount: number;
  weightedSets: WeightedExerciseSet[];
};

export function buildExerciseProgressCatalog(state: AppState, athleteId: string): ExerciseProgressCatalog {
  const sessionByWorkoutId = new Map(
    state.sessions.map((session) => [session.scheduledWorkoutId, session]),
  );
  const groupedExercises = new Map<string, ExerciseAccumulator>();

  state.scheduledWorkouts
    .filter((workout) => workout.athleteId === athleteId)
    .forEach((workout) => {
      const session = sessionByWorkoutId.get(workout.id);
      if (!session || !isCompletedWorkout(workout, session)) {
        return;
      }

      const completedAt = resolveWorkoutCompletedAt(workout, session);
      session.setLogs
        .filter((log) => log.done)
        .forEach((log) => {
          const identity = resolveExerciseIdentity(log);
          const current = groupedExercises.get(identity.exerciseKey);
          const nextExerciseName = log.exerciseName.trim() || current?.exerciseName || "Liike";
          const accumulator: ExerciseAccumulator = current ?? {
            exerciseKey: identity.exerciseKey,
            exerciseId: identity.exerciseId,
            exerciseName: nextExerciseName,
            lastCompletedAt: completedAt,
            completedSetCount: 0,
            weightedSets: [],
          };

          accumulator.completedSetCount += 1;
          accumulator.exerciseName = nextExerciseName;
          if (completedAt > accumulator.lastCompletedAt) {
            accumulator.lastCompletedAt = completedAt;
          }

          const weightedSet = resolveWeightedExerciseSet(log, workout, completedAt);
          if (weightedSet) {
            accumulator.weightedSets.push(weightedSet);
          }

          groupedExercises.set(identity.exerciseKey, accumulator);
        });
    });

  const summaries = new Map<string, ExerciseProgressSummary>();

  groupedExercises.forEach((entry) => {
    const trendPoints = buildTrendPoints(entry.weightedSets);
    const bestSet = buildBestSetSummary(entry.weightedSets);
    const latestSet = buildLatestSetSummary(entry.weightedSets);
    const summary: ExerciseProgressSummary = {
      exerciseKey: entry.exerciseKey,
      exerciseId: entry.exerciseId,
      exerciseName: entry.exerciseName,
      lastCompletedAt: entry.lastCompletedAt,
      completedSetCount: entry.completedSetCount,
      currentEstimatedOneRepMax: trendPoints.at(-1)?.value,
      trendPoints,
      bestSet,
      latestSet,
      repRecords: buildRepRecords(entry.weightedSets),
      weightRecords: buildWeightRecords(entry.weightedSets),
      hasWeightedData: trendPoints.length > 0,
    };

    summaries.set(entry.exerciseKey, summary);
  });

  const exercises = Array.from(summaries.values())
    .sort((left, right) => {
      const completedComparison = right.lastCompletedAt.localeCompare(left.lastCompletedAt);
      if (completedComparison !== 0) {
        return completedComparison;
      }

      return left.exerciseName.localeCompare(right.exerciseName, "fi");
    })
    .map((summary) => ({
      key: summary.exerciseKey,
      exerciseId: summary.exerciseId,
      exerciseName: summary.exerciseName,
      lastCompletedAt: summary.lastCompletedAt,
      completedSetCount: summary.completedSetCount,
      hasWeightedData: summary.hasWeightedData,
    }));

  return {
    exercises,
    summaries,
  };
}

export function calculateEstimatedOneRepMax(load: number, reps: number) {
  return load * (1 + reps / 30);
}

// Toistoennätykset: paras (raskain) paino per toistomäärä, nousevassa toistojärjestyksessä.
function buildRepRecords(weightedSets: WeightedExerciseSet[]): ExerciseRepRecord[] {
  const bestByReps = new Map<number, WeightedExerciseSet>();
  weightedSets.forEach((set) => {
    const current = bestByReps.get(set.actualReps);
    if (!current || set.actualLoad > current.actualLoad) {
      bestByReps.set(set.actualReps, set);
    }
  });

  return Array.from(bestByReps.entries())
    .map(([reps, set]) => ({ reps, weight: set.actualLoad, completedAt: set.completedAt }))
    .sort((left, right) => left.reps - right.reps);
}

// Painoennätykset: eniten toistoja per paino, laskevassa painojärjestyksessä.
function buildWeightRecords(weightedSets: WeightedExerciseSet[]): ExerciseWeightRecord[] {
  const bestByWeight = new Map<number, WeightedExerciseSet>();
  weightedSets.forEach((set) => {
    const current = bestByWeight.get(set.actualLoad);
    if (!current || set.actualReps > current.actualReps) {
      bestByWeight.set(set.actualLoad, set);
    }
  });

  return Array.from(bestByWeight.entries())
    .map(([weight, set]) => ({ weight, reps: set.actualReps, completedAt: set.completedAt }))
    .sort((left, right) => right.weight - left.weight);
}

function buildTrendPoints(weightedSets: WeightedExerciseSet[]): ExerciseProgressPoint[] {
  const bestSetByWorkoutId = new Map<string, WeightedExerciseSet>();

  weightedSets.forEach((entry) => {
    const current = bestSetByWorkoutId.get(entry.scheduledWorkoutId);
    if (!current || compareWeightedSetByEstimated(entry, current) > 0) {
      bestSetByWorkoutId.set(entry.scheduledWorkoutId, entry);
    }
  });

  return Array.from(bestSetByWorkoutId.values())
    .sort((left, right) => {
      const completedComparison = left.completedAt.localeCompare(right.completedAt);
      if (completedComparison !== 0) {
        return completedComparison;
      }

      return left.scheduledWorkoutId.localeCompare(right.scheduledWorkoutId);
    })
    .map((entry) => ({
      date: entry.completedAt,
      value: entry.estimatedOneRepMax,
      actualLoad: entry.actualLoad,
      actualReps: entry.actualReps,
      scheduledWorkoutId: entry.scheduledWorkoutId,
      workoutTitle: entry.workoutTitle,
      completedAt: entry.completedAt,
    }));
}

function buildBestSetSummary(weightedSets: WeightedExerciseSet[]): ExerciseProgressSetSummary | undefined {
  const best = [...weightedSets].sort(compareWeightedSetByStrength)[0];
  if (!best) {
    return undefined;
  }

  return {
    actualLoad: best.actualLoad,
    actualReps: best.actualReps,
    estimatedOneRepMax: best.estimatedOneRepMax,
    scheduledWorkoutId: best.scheduledWorkoutId,
    workoutTitle: best.workoutTitle,
    completedAt: best.completedAt,
  };
}

function buildLatestSetSummary(weightedSets: WeightedExerciseSet[]): ExerciseProgressSetSummary | undefined {
  const latest = [...weightedSets].sort(compareWeightedSetByRecency)[0];
  if (!latest) {
    return undefined;
  }

  return {
    actualLoad: latest.actualLoad,
    actualReps: latest.actualReps,
    estimatedOneRepMax: latest.estimatedOneRepMax,
    scheduledWorkoutId: latest.scheduledWorkoutId,
    workoutTitle: latest.workoutTitle,
    completedAt: latest.completedAt,
  };
}

function resolveWeightedExerciseSet(
  log: WorkoutSetLog,
  workout: ScheduledWorkout,
  completedAt: string,
): WeightedExerciseSet | undefined {
  if (!hasWeightedResult(log)) {
    return undefined;
  }

  const actualLoad = log.actualLoad as number;
  const actualReps = log.actualReps as number;
  return {
    actualLoad,
    actualReps,
    estimatedOneRepMax: calculateEstimatedOneRepMax(actualLoad, actualReps),
    scheduledWorkoutId: workout.id,
    workoutTitle: workout.title,
    completedAt,
  };
}

function hasWeightedResult(log: WorkoutSetLog) {
  return (
    typeof log.actualLoad === "number" &&
    typeof log.actualReps === "number" &&
    log.actualLoad > 0 &&
    log.actualReps > 0
  );
}

function resolveExerciseIdentity(log: WorkoutSetLog) {
  const exerciseId = log.exerciseId.trim();
  if (exerciseId) {
    return {
      exerciseKey: `id:${exerciseId}`,
      exerciseId,
    };
  }

  return {
    exerciseKey: `name:${normalizeExerciseName(log.exerciseName)}`,
    exerciseId: undefined,
  };
}

function normalizeExerciseName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function isCompletedWorkout(workout: ScheduledWorkout, session: WorkoutSession) {
  return workout.status === "completed" || Boolean(workout.completedAt) || Boolean(session.completedAt);
}

function resolveWorkoutCompletedAt(workout: ScheduledWorkout, session: WorkoutSession) {
  return workout.completedAt ?? session.completedAt ?? session.startedAt ?? session.updatedAt ?? workout.updatedAt ?? workout.scheduledDate;
}

function compareWeightedSetByEstimated(left: WeightedExerciseSet, right: WeightedExerciseSet) {
  if (left.estimatedOneRepMax !== right.estimatedOneRepMax) {
    return left.estimatedOneRepMax - right.estimatedOneRepMax;
  }

  if (left.actualLoad !== right.actualLoad) {
    return left.actualLoad - right.actualLoad;
  }
  if (left.actualReps !== right.actualReps) {
    return left.actualReps - right.actualReps;
  }

  return left.completedAt.localeCompare(right.completedAt);
}

function compareWeightedSetByStrength(left: WeightedExerciseSet, right: WeightedExerciseSet) {
  if (right.actualLoad !== left.actualLoad) {
    return right.actualLoad - left.actualLoad;
  }
  if (right.actualReps !== left.actualReps) {
    return right.actualReps - left.actualReps;
  }

  return right.completedAt.localeCompare(left.completedAt);
}

function compareWeightedSetByRecency(left: WeightedExerciseSet, right: WeightedExerciseSet) {
  const completedComparison = right.completedAt.localeCompare(left.completedAt);
  if (completedComparison !== 0) {
    return completedComparison;
  }

  return compareWeightedSetByStrength(left, right);
}
