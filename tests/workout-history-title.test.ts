import { describe, expect, it } from "vitest";

import {
  buildWorkoutHistoryTitleMap,
  normalizeWorkoutHistoryTitle,
} from "@/lib/workout-history-title";

describe("workout history title helpers", () => {
  it("normalizes trailing number and letter variants", () => {
    expect(normalizeWorkoutHistoryTitle("Alakroppa 1")).toBe("Alakroppa");
    expect(normalizeWorkoutHistoryTitle("Voimapäivä A")).toBe("Voimapäivä");
    expect(normalizeWorkoutHistoryTitle("Koko kroppa C")).toBe("Koko kroppa");
  });

  it("keeps explicit schedule titles and empty fallback sane", () => {
    expect(normalizeWorkoutHistoryTitle("Viikko 1 · Päivä 2")).toBe("Viikko 1 · Päivä 2");
    expect(normalizeWorkoutHistoryTitle("  ")).toBe("Harjoitus");
  });

  it("builds occurrence order by normalized history title", () => {
    const mapped = buildWorkoutHistoryTitleMap([
      {
        id: "w_1",
        title: "Alakroppa A",
        scheduledDate: "2026-01-01T08:00:00.000Z",
        createdAt: "2026-01-01T08:00:00.000Z",
        updatedAt: "2026-01-01T08:00:00.000Z",
      },
      {
        id: "w_2",
        title: "Alakroppa B",
        scheduledDate: "2026-01-08T08:00:00.000Z",
        createdAt: "2026-01-08T08:00:00.000Z",
        updatedAt: "2026-01-08T08:00:00.000Z",
      },
      {
        id: "w_3",
        title: "Alakroppa A",
        scheduledDate: "2026-01-15T08:00:00.000Z",
        createdAt: "2026-01-15T08:00:00.000Z",
        updatedAt: "2026-01-15T08:00:00.000Z",
      },
    ]);

    expect(mapped.get("w_1")).toMatchObject({
      title: "Alakroppa",
      occurrenceNumber: 1,
      occurrenceLabel: "Treeni 1",
    });
    expect(mapped.get("w_2")).toMatchObject({
      title: "Alakroppa",
      occurrenceNumber: 2,
      occurrenceLabel: "Treeni 2",
    });
    expect(mapped.get("w_3")).toMatchObject({
      title: "Alakroppa",
      occurrenceNumber: 3,
      occurrenceLabel: "Treeni 3",
    });
  });

  it("keeps counters separate for distinct program workouts when title is already clean", () => {
    const mapped = buildWorkoutHistoryTitleMap([
      {
        id: "w_1",
        title: "Yläkroppa",
        programWorkoutId: "program_a",
        scheduledDate: "2026-02-01T08:00:00.000Z",
        createdAt: "2026-02-01T08:00:00.000Z",
        updatedAt: "2026-02-01T08:00:00.000Z",
      },
      {
        id: "w_2",
        title: "Yläkroppa",
        programWorkoutId: "program_b",
        scheduledDate: "2026-02-02T08:00:00.000Z",
        createdAt: "2026-02-02T08:00:00.000Z",
        updatedAt: "2026-02-02T08:00:00.000Z",
      },
    ]);

    expect(mapped.get("w_1")?.occurrenceNumber).toBe(1);
    expect(mapped.get("w_2")?.occurrenceNumber).toBe(1);
  });
});
