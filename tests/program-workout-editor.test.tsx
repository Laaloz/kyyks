import { fireEvent, render, screen } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";

import { ProgramWorkoutEditor } from "@/components/workout/coach/program-workout-editor";
import { programComposerSchema } from "@/components/workout/schemas";
import { emptyProgramWorkout } from "@/components/workout/schemas";
import type { ProgramComposerFormValues, ProgramComposerValues } from "@/components/workout/coach/program-composer";

function ProgramWorkoutEditorHarness() {
  const form = useForm<ProgramComposerFormValues, unknown, ProgramComposerValues>({
    defaultValues: {
      title: "Testiohjelma",
      description: "",
      athleteId: "athlete_1",
      workouts: [emptyProgramWorkout("upper")],
    },
  });

  return (
    <ProgramWorkoutEditor
      fieldId="workout-1"
      index={0}
      control={form.control}
      register={form.register}
      setValue={form.setValue}
      watch={form.watch}
      exerciseOptions={[]}
      onRemove={() => undefined}
      removable={false}
      allowExerciseRemoval
    />
  );
}

describe("ProgramWorkoutEditor", () => {
  it("shows a workout name field when split type is custom", () => {
    render(<ProgramWorkoutEditorHarness />);

    expect(screen.queryByLabelText(/Treenin nimi/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Treenialue/), {
      target: { value: "custom" },
    });

    expect(screen.getByLabelText(/Treenin nimi/)).toBeInTheDocument();
  });

  it("shows an editable short workout guidance field", () => {
    render(<ProgramWorkoutEditorHarness />);

    expect(screen.getByLabelText(/Treenin yleisohje/)).toBeInTheDocument();
  });

  it("requires a name when custom workout is selected", () => {
    const parsed = programComposerSchema.safeParse({
      title: "Testiohjelma",
      description: "",
      athleteId: "athlete_1",
      workouts: [
        {
          ...emptyProgramWorkout("custom"),
          nameOverride: "",
        },
      ],
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.some((issue) => issue.path.join(".") === "workouts.0.nameOverride")).toBe(true);
  });
});
