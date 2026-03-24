import { describe, expect, it } from "vitest";

import { buildWorkoutConversationContextOptions } from "@/lib/workout-conversation-context";
import type { ScheduledWorkout, TrainingPlan, WorkoutTemplate } from "@/lib/types";

describe("buildWorkoutConversationContextOptions", () => {
  it("ignores cancelled workouts when building split-based conversation targets", () => {
    const workouts: ScheduledWorkout[] = [
      {
        id: "scheduled_cancelled_lower",
        templateId: "template_lower",
        athleteId: "athlete_1",
        coachId: "coach_1",
        title: "Voimapäivä A",
        scheduledDate: "2026-03-24T08:00:00.000Z",
        status: "cancelled",
        createdAt: "2026-03-23T08:00:00.000Z",
        updatedAt: "2026-03-23T08:00:00.000Z",
      },
      {
        id: "scheduled_upper",
        templateId: "template_upper",
        athleteId: "athlete_1",
        coachId: "coach_1",
        title: "Yläkroppa A",
        scheduledDate: "2026-03-25T08:00:00.000Z",
        status: "in_progress",
        createdAt: "2026-03-24T08:00:00.000Z",
        updatedAt: "2026-03-25T08:00:00.000Z",
      },
    ];
    const templates: WorkoutTemplate[] = [
      {
        id: "template_lower",
        coachId: "coach_1",
        title: "Voimapäivä A",
        description: "Lower day",
        goal: "Strength",
        splitType: "lower",
        status: "published",
        blocks: [],
        createdAt: "2026-03-20T08:00:00.000Z",
        updatedAt: "2026-03-20T08:00:00.000Z",
        createdBy: "coach_1",
        updatedBy: "coach_1",
      },
      {
        id: "template_upper",
        coachId: "coach_1",
        title: "Yläkroppa A",
        description: "Upper day",
        goal: "Strength",
        splitType: "upper",
        status: "published",
        blocks: [],
        createdAt: "2026-03-20T08:00:00.000Z",
        updatedAt: "2026-03-20T08:00:00.000Z",
        createdBy: "coach_1",
        updatedBy: "coach_1",
      },
    ];
    const plans: TrainingPlan[] = [];

    const options = buildWorkoutConversationContextOptions({ workouts, plans, templates });

    expect(options.map((option) => option.label)).toEqual(["Treenialue: Yläkroppa"]);
  });

  it("uses the custom workout name instead of a generic custom label", () => {
    const workouts: ScheduledWorkout[] = [
      {
        id: "scheduled_custom",
        trainingPlanId: "plan_1",
        programWorkoutId: "program_workout_1",
        athleteId: "athlete_1",
        coachId: "coach_1",
        title: "Penkki + olkapaat A",
        scheduledDate: "2026-03-25T08:00:00.000Z",
        status: "in_progress",
        createdAt: "2026-03-24T08:00:00.000Z",
        updatedAt: "2026-03-25T08:00:00.000Z",
      },
    ];
    const plans: TrainingPlan[] = [
      {
        id: "plan_1",
        coachId: "coach_1",
        athleteId: "athlete_1",
        title: "Kevatblokin ohjelma",
        workouts: [
          {
            id: "program_workout_1",
            name: "Penkki + olkapaat",
            splitType: "custom",
            defaultRestSeconds: 180,
            exercises: [],
          },
        ],
        startDate: "2026-03-24",
        weekCount: 4,
        createdAt: "2026-03-20T08:00:00.000Z",
      },
    ];
    const templates: WorkoutTemplate[] = [];

    const options = buildWorkoutConversationContextOptions({ workouts, plans, templates });

    expect(options.map((option) => option.label)).toEqual(["Treenialue: Penkki + olkapaat"]);
    expect(options[0]?.contextLabel).toBe("Penkki + olkapaat");
  });
});
