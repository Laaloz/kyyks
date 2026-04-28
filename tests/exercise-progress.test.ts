import { describe, expect, it } from "vitest";

import { buildExerciseProgressCatalog, calculateEstimatedOneRepMax } from "@/lib/exercise-progress";
import type { AppState, ScheduledWorkout, WorkoutSession, WorkoutSetLog } from "@/lib/types";

function createBaseState(): AppState {
  return {
    users: [
      {
        id: "athlete_1",
        role: "athlete",
        fullName: "Athlete One",
        email: "athlete@example.com",
        status: "active",
        createdAt: "2026-04-01T08:00:00.000Z",
        updatedAt: "2026-04-01T08:00:00.000Z",
      },
    ],
    bodyMeasurements: [],
    nutritionProfiles: [],
    ingredientsCatalog: [],
    recipes: [],
    mealPlanTemplates: [],
    assignedMealPlans: [],
    assignments: [],
    exercises: [],
    templates: [],
    plans: [],
    scheduledWorkouts: [],
    sessions: [],
    notes: [],
    conversationEntries: [],
    invites: [],
    passwordResetRequests: [],
  };
}

function createWorkout(id: string, overrides: Partial<ScheduledWorkout> = {}): ScheduledWorkout {
  return {
    id,
    athleteId: "athlete_1",
    coachId: "coach_1",
    title: `Workout ${id}`,
    scheduledDate: "2026-04-10",
    status: "completed",
    createdAt: "2026-04-10T08:00:00.000Z",
    updatedAt: "2026-04-10T09:00:00.000Z",
    completedAt: "2026-04-10T09:00:00.000Z",
    ...overrides,
  };
}

function createLog(id: string, overrides: Partial<WorkoutSetLog> = {}): WorkoutSetLog {
  return {
    id,
    scheduledWorkoutId: "workout_1",
    templateExerciseId: "exercise_group_1",
    setId: `set_${id}`,
    exerciseId: "exercise_bench",
    exerciseName: "Penkkipunnerrus",
    setLabel: "1",
    targetReps: 5,
    actualReps: 5,
    actualLoad: 100,
    done: true,
    ...overrides,
  };
}

function createSession(
  id: string,
  scheduledWorkoutId: string,
  completedAt: string | undefined,
  setLogs: WorkoutSetLog[],
): WorkoutSession {
  return {
    id,
    scheduledWorkoutId,
    athleteId: "athlete_1",
    startedAt: "2026-04-10T08:00:00.000Z",
    completedAt,
    updatedAt: completedAt ?? "2026-04-10T08:30:00.000Z",
    setLogs,
  };
}

describe("exercise progress helpers", () => {
  it("calculates e1RM with the Epley formula", () => {
    expect(calculateEstimatedOneRepMax(100, 5)).toBeCloseTo(116.6667, 4);
  });

  it("builds exercise options from completed performed sets", () => {
    const state = createBaseState();
    state.scheduledWorkouts = [
      createWorkout("workout_1", { programWorkoutId: "program_1", title: "Push A" }),
      createWorkout("workout_2", { programWorkoutId: "program_2", title: "Legs B", completedAt: "2026-04-12T09:00:00.000Z" }),
    ];
    state.sessions = [
      createSession("session_1", "workout_1", "2026-04-10T09:00:00.000Z", [
        createLog("1", { scheduledWorkoutId: "workout_1", exerciseId: "exercise_bench", exerciseName: "Penkkipunnerrus" }),
      ]),
      createSession("session_2", "workout_2", "2026-04-12T09:00:00.000Z", [
        createLog("2", {
          scheduledWorkoutId: "workout_2",
          exerciseId: "exercise_squat",
          exerciseName: "Takakyykky",
          actualLoad: undefined,
          actualReps: 8,
        }),
      ]),
    ];

    const result = buildExerciseProgressCatalog(state, "athlete_1");

    expect(result.exercises.map((item) => item.exerciseName)).toEqual(["Takakyykky", "Penkkipunnerrus"]);
    expect(result.exercises[0]?.hasWeightedData).toBe(false);
    expect(result.exercises[1]?.hasWeightedData).toBe(true);
  });

  it("keeps the highest e1RM from each workout as the trend point", () => {
    const state = createBaseState();
    state.scheduledWorkouts = [
      createWorkout("workout_1", { programWorkoutId: "program_1", completedAt: "2026-04-10T09:00:00.000Z" }),
      createWorkout("workout_2", { programWorkoutId: "program_1", completedAt: "2026-04-14T09:00:00.000Z" }),
    ];
    state.sessions = [
      createSession("session_1", "workout_1", "2026-04-10T09:00:00.000Z", [
        createLog("1", { scheduledWorkoutId: "workout_1", actualLoad: 100, actualReps: 5 }),
        createLog("2", { scheduledWorkoutId: "workout_1", actualLoad: 95, actualReps: 8 }),
      ]),
      createSession("session_2", "workout_2", "2026-04-14T09:00:00.000Z", [
        createLog("3", { scheduledWorkoutId: "workout_2", actualLoad: 105, actualReps: 4 }),
      ]),
    ];

    const result = buildExerciseProgressCatalog(state, "athlete_1");
    const summary = result.summaries.get("id:exercise_bench");

    expect(summary?.trendPoints).toHaveLength(2);
    expect(summary?.trendPoints[0]?.date).toBe("2026-04-10T09:00:00.000Z");
    expect(summary?.trendPoints[0]?.value).toBeCloseTo(calculateEstimatedOneRepMax(95, 8), 4);
    expect(summary?.trendPoints[1]?.value).toBeCloseTo(calculateEstimatedOneRepMax(105, 4), 4);
    expect(summary?.currentEstimatedOneRepMax).toBeCloseTo(calculateEstimatedOneRepMax(105, 4), 4);
  });

  it("ignores incomplete workouts and logs without a usable weighted result", () => {
    const state = createBaseState();
    state.scheduledWorkouts = [
      createWorkout("workout_1", { programWorkoutId: "program_1", status: "in_progress", completedAt: undefined }),
      createWorkout("workout_2", { programWorkoutId: "program_1", completedAt: "2026-04-12T09:00:00.000Z" }),
    ];
    state.sessions = [
      createSession("session_1", "workout_1", undefined, [
        createLog("1", { scheduledWorkoutId: "workout_1", actualLoad: 100, actualReps: 5 }),
      ]),
      createSession("session_2", "workout_2", "2026-04-12T09:00:00.000Z", [
        createLog("2", { scheduledWorkoutId: "workout_2", actualLoad: 0, actualReps: 5 }),
        createLog("3", { scheduledWorkoutId: "workout_2", actualLoad: 90, actualReps: undefined }),
      ]),
    ];

    const result = buildExerciseProgressCatalog(state, "athlete_1");
    const summary = result.summaries.get("id:exercise_bench");

    expect(summary?.completedSetCount).toBe(2);
    expect(summary?.trendPoints).toEqual([]);
    expect(summary?.bestSet).toBeUndefined();
    expect(summary?.latestSet).toBeUndefined();
  });

  it("falls back to normalized exercise name when exercise id is missing", () => {
    const state = createBaseState();
    state.scheduledWorkouts = [
      createWorkout("workout_1", { programWorkoutId: "program_1", completedAt: "2026-04-10T09:00:00.000Z" }),
      createWorkout("workout_2", { programWorkoutId: "program_1", completedAt: "2026-04-14T09:00:00.000Z" }),
    ];
    state.sessions = [
      createSession("session_1", "workout_1", "2026-04-10T09:00:00.000Z", [
        createLog("1", {
          scheduledWorkoutId: "workout_1",
          exerciseId: "",
          exerciseName: "Leuanveto",
          actualLoad: 20,
          actualReps: 5,
        }),
      ]),
      createSession("session_2", "workout_2", "2026-04-14T09:00:00.000Z", [
        createLog("2", {
          scheduledWorkoutId: "workout_2",
          exerciseId: "",
          exerciseName: "  leuanveto ",
          actualLoad: 25,
          actualReps: 4,
        }),
      ]),
    ];

    const result = buildExerciseProgressCatalog(state, "athlete_1");
    const summary = result.summaries.get("name:leuanveto");

    expect(result.exercises).toHaveLength(1);
    expect(summary?.exerciseId).toBeUndefined();
    expect(summary?.exerciseName).toBe("leuanveto");
    expect(summary?.trendPoints).toHaveLength(2);
  });
});
