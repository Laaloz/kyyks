import { describe, expect, it } from "vitest";

import { cloneDemoState } from "@/lib/domain";
import { getMeasurementReminderState } from "@/lib/measurement-reminder";

describe("measurement reminder", () => {
  it("opens on Friday morning in Helsinki time even when the runtime timezone differs", () => {
    const state = cloneDemoState();
    const athlete = state.users.find((user) => user.id === "user_athlete_1") ?? null;

    const reminder = getMeasurementReminderState(state, athlete, new Date("2026-04-03T03:30:00.000Z"));

    expect(reminder.isWindowOpen).toBe(true);
    expect(reminder.isDue).toBe(true);
    expect(reminder.cycleKey).toBe("2026-04-03");
  });

  it("does not open yet before Friday morning in Helsinki time", () => {
    const state = cloneDemoState();
    const athlete = state.users.find((user) => user.id === "user_athlete_1") ?? null;

    const reminder = getMeasurementReminderState(state, athlete, new Date("2026-04-03T00:30:00.000Z"));

    expect(reminder.isWindowOpen).toBe(false);
    expect(reminder.isDue).toBe(false);
    expect(reminder.cycleKey).toBeNull();
  });

  it("marks the current week as completed once both measurements were logged during the same Helsinki week", () => {
    const state = cloneDemoState();
    const athlete = state.users.find((user) => user.id === "user_athlete_1") ?? null;

    state.bodyMeasurements = [
      {
        id: "measurement_weight",
        userId: "user_athlete_1",
        weightKg: 81.2,
        measuredAt: "2026-04-03T05:15:00.000Z",
        createdAt: "2026-04-03T05:15:00.000Z",
      },
      {
        id: "measurement_waist",
        userId: "user_athlete_1",
        waistCm: 84,
        measuredAt: "2026-04-03T05:20:00.000Z",
        createdAt: "2026-04-03T05:20:00.000Z",
      },
    ];

    const reminder = getMeasurementReminderState(state, athlete, new Date("2026-04-04T09:00:00.000Z"));

    expect(reminder.isWindowOpen).toBe(true);
    expect(reminder.weightDue).toBe(false);
    expect(reminder.waistDue).toBe(false);
    expect(reminder.isDue).toBe(false);
    expect(reminder.cycleKey).toBe("2026-04-03");
  });

  it("hides the reminder entirely once either weight or waist was logged for the current cycle", () => {
    const state = cloneDemoState();
    const athlete = state.users.find((user) => user.id === "user_athlete_1") ?? null;

    state.bodyMeasurements = [
      {
        id: "measurement_weight",
        userId: "user_athlete_1",
        weightKg: 81.2,
        measuredAt: "2026-04-03T05:15:00.000Z",
        createdAt: "2026-04-03T05:15:00.000Z",
      },
    ];

    const reminder = getMeasurementReminderState(state, athlete, new Date("2026-04-04T09:00:00.000Z"));

    expect(reminder.isWindowOpen).toBe(true);
    expect(reminder.weightDue).toBe(false);
    expect(reminder.waistDue).toBe(true);
    expect(reminder.isDue).toBe(false);
  });

  it("allows the weekly reminder for coach users tracking their own body metrics", () => {
    const state = cloneDemoState();
    const coach = state.users.find((user) => user.role === "coach") ?? null;

    const reminder = getMeasurementReminderState(state, coach, new Date("2026-04-03T03:30:00.000Z"));

    expect(reminder.isWindowOpen).toBe(true);
    expect(reminder.isDue).toBe(true);
    expect(reminder.cycleKey).toBe("2026-04-03");
  });
});
