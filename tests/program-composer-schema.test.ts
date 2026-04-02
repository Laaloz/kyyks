import { describe, expect, it } from "vitest";

import { CUSTOM_EXERCISE_VALUE, emptyProgramWorkout, emptyProgramWorkoutExercise, programComposerSchema } from "@/components/workout/schemas";

function buildBaseProgram() {
  return {
    title: "Testiohjelma",
    description: "",
    athleteId: "athlete_1",
    workouts: [emptyProgramWorkout("custom")],
  };
}

describe("programComposerSchema", () => {
  it("fails when a custom workout is missing a name", () => {
    const parsed = programComposerSchema.safeParse(buildBaseProgram());

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.some((issue) => issue.path.join(".") === "workouts.0.nameOverride")).toBe(true);
  });

  it("fails when range mode is missing min and max reps", () => {
    const parsed = programComposerSchema.safeParse({
      ...buildBaseProgram(),
      workouts: [
        {
          ...emptyProgramWorkout("custom"),
          nameOverride: "Penkki + selkä",
          exercises: [
            {
              ...emptyProgramWorkoutExercise(),
              exerciseId: "exercise_1",
              instruction: "Pidä rintakehä ylhäällä.",
              repMode: "range",
              targetRepsMin: "",
              targetRepsMax: "",
            },
          ],
        },
      ],
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.some((issue) => issue.path.join(".") === "workouts.0.exercises.0.targetRepsMin")).toBe(true);
    expect(parsed.error?.issues.some((issue) => issue.path.join(".") === "workouts.0.exercises.0.targetRepsMax")).toBe(true);
  });

  it("fails when a custom exercise is missing name or muscle group", () => {
    const parsed = programComposerSchema.safeParse({
      ...buildBaseProgram(),
      workouts: [
        {
          ...emptyProgramWorkout("custom"),
          nameOverride: "Penkki + selkä",
          exercises: [
            {
              ...emptyProgramWorkoutExercise(),
              exerciseId: CUSTOM_EXERCISE_VALUE,
              customExerciseName: "",
              customMuscleGroup: "",
              instruction: "Pidä kyynärpää pehmeänä.",
            },
          ],
        },
      ],
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.some((issue) => issue.path.join(".") === "workouts.0.exercises.0.customExerciseName")).toBe(true);
    expect(parsed.error?.issues.some((issue) => issue.path.join(".") === "workouts.0.exercises.0.customMuscleGroup")).toBe(true);
  });
});
