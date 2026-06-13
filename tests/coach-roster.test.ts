import { describe, expect, it } from "vitest";

import { buildAthleteRosterSummary } from "@/lib/coach-roster";
import type { AppState } from "@/lib/types";

// Viikko Ma 2026-06-08 .. Su 2026-06-14; viitepäivä Pe 2026-06-12.
const REFERENCE = new Date(2026, 5, 12, 12, 0, 0);

function makeWorkout(
  id: string,
  scheduledDate: string,
  status: "completed" | "in_progress" | "cancelled",
  completedAt?: string,
) {
  return {
    id,
    athleteId: "a1",
    coachId: "c1",
    title: "Treeni",
    scheduledDate,
    status,
    createdAt: "2026-06-01T08:00:00.000Z",
    updatedAt: "2026-06-01T08:00:00.000Z",
    ...(completedAt ? { completedAt } : {}),
  };
}

function makeState(overrides: {
  workouts: ReturnType<typeof makeWorkout>[];
  weeklyTarget?: number;
  dayMealPlans?: AppState["dayMealPlans"];
}): AppState {
  const workoutCount = overrides.weeklyTarget ?? 3;
  return {
    plans: [
      {
        id: "p1",
        coachId: "c1",
        athleteId: "a1",
        title: "Voima 3",
        status: "active",
        workouts: Array.from({ length: workoutCount }, (_, i) => ({ id: `w${i}`, title: `W${i}` })),
        startDate: "2026-06-01",
        weekCount: 8,
        createdAt: "2026-06-01T08:00:00.000Z",
      },
    ],
    sessions: [],
    scheduledWorkouts: overrides.workouts,
    dayMealPlans: overrides.dayMealPlans ?? [],
  } as unknown as AppState;
}

describe("buildAthleteRosterSummary", () => {
  it("marks completed days done, in_progress today as plan, and stays Rytmissä on pace", () => {
    const state = makeState({
      workouts: [
        makeWorkout("w-mon", "2026-06-08", "completed", "2026-06-08T17:00:00.000Z"),
        makeWorkout("w-wed", "2026-06-10", "completed", "2026-06-10T17:00:00.000Z"),
        makeWorkout("w-fri", "2026-06-12", "in_progress"),
      ],
      dayMealPlans: [
        { id: "m1", athleteId: "a1", planDate: "2026-06-08", eatenAt: "x" },
        { id: "m2", athleteId: "a1", planDate: "2026-06-08", eatenAt: "x" },
        { id: "m3", athleteId: "a1", planDate: "2026-06-09", eatenAt: "x" },
        { id: "m4", athleteId: "a1", planDate: "2026-06-09", eatenAt: undefined },
      ] as unknown as AppState["dayMealPlans"],
    });

    const summary = buildAthleteRosterSummary(state, "a1", REFERENCE);

    expect(summary.weeklyTarget).toBe(3);
    expect(summary.doneThisWeek).toBe(2);
    expect(summary.statusLabel).toBe("Rytmissä");
    expect(summary.statusTone).toBe("good");
    expect(summary.cells).toHaveLength(7);
    expect(summary.cells[0]).toMatchObject({ weekdayLabel: "Ma", training: "done", nutrition: "ok" });
    expect(summary.cells[1]).toMatchObject({ weekdayLabel: "Ti", nutrition: "part" });
    expect(summary.cells[2]).toMatchObject({ weekdayLabel: "Ke", training: "done" });
    expect(summary.cells[4]).toMatchObject({ weekdayLabel: "Pe", training: "plan", isToday: true });
    expect(summary.cells[6]).toMatchObject({ training: "rest", nutrition: "none" });
  });

  it("flags an athlete that is behind pace", () => {
    const state = makeState({
      workouts: [makeWorkout("w-mon", "2026-06-08", "completed", "2026-06-08T17:00:00.000Z")],
    });

    const summary = buildAthleteRosterSummary(state, "a1", REFERENCE);

    expect(summary.doneThisWeek).toBe(1);
    expect(summary.statusLabel).toBe("1 treeni jäljessä");
    expect(summary.statusTone).toBe("warn");
    expect(summary.lastSeenLabel).toBe("Ma");
  });

  it("reports Viikko valmis when the weekly target is reached", () => {
    const state = makeState({
      workouts: [
        makeWorkout("w-mon", "2026-06-08", "completed", "2026-06-08T17:00:00.000Z"),
        makeWorkout("w-wed", "2026-06-10", "completed", "2026-06-10T17:00:00.000Z"),
        makeWorkout("w-fri", "2026-06-12", "completed", "2026-06-12T09:00:00.000Z"),
      ],
    });

    const summary = buildAthleteRosterSummary(state, "a1", REFERENCE);

    expect(summary.doneThisWeek).toBe(3);
    expect(summary.statusLabel).toBe("Viikko valmis");
    expect(summary.statusTone).toBe("good");
    expect(summary.lastSeenLabel).toBe("tänään");
  });

  it("reports Ei ohjelmaa when there is no active program", () => {
    const state = makeState({ workouts: [], weeklyTarget: 0 });

    const summary = buildAthleteRosterSummary(state, "a1", REFERENCE);

    expect(summary.weeklyTarget).toBe(0);
    expect(summary.statusLabel).toBe("Ei ohjelmaa");
    expect(summary.statusTone).toBe("neutral");
    expect(summary.lastSeenLabel).toBe("—");
  });
});
