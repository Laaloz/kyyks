import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AthleteSessionPanel } from "@/components/workout/athlete/session-panel";
import type { WorkoutSession } from "@/lib/types";

function buildSession(): WorkoutSession {
  return {
    id: "session_1",
    scheduledWorkoutId: "workout_1",
    athleteId: "athlete_1",
    startedAt: "2026-03-24T08:00:00.000Z",
    updatedAt: "2026-03-24T08:30:00.000Z",
    pausedDurationSeconds: 0,
    setLogs: [
      {
        id: "log_1",
        scheduledWorkoutId: "workout_1",
        templateExerciseId: "exercise_group_1",
        setId: "set_1",
        exerciseId: "exercise_1",
        exerciseName: "Penkkipunnerrus",
        setLabel: "1",
        targetReps: 5,
        targetLoad: 100,
        targetRestSeconds: 180,
        actualReps: 5,
        actualLoad: 100,
        rpe: 8,
        done: false,
      },
    ],
  };
}

afterEach(() => {
  cleanup();
});

describe("AthleteSessionPanel", () => {
  it("shows a compact coach instruction button for an exercise", () => {
    render(
      <AthleteSessionPanel
        scheduledWorkoutId="workout_1"
        scheduledWorkoutTitle="Penkkipäivä"
        selectedSession={buildSession()}
        note=""
        status="in_progress"
        onStart={() => undefined}
        onUpdate={() => undefined}
        onUpdateDuration={async () => ({ ok: true })}
        onSaveNote={() => undefined}
        onComplete={() => undefined}
        onCancel={() => undefined}
        onDelete={() => undefined}
        onBackToList={() => undefined}
        canDeleteWorkout
        initialCorrectionMode={false}
        progress={{ totalSets: 1, completedSets: 0, percent: 0, allDone: false }}
        previousExerciseResults={new Map()}
        exerciseInstructions={new Map([["exercise_group_1", "Pidä lapatuet tiukkana ja hallitse ala-asento."]])}
        workoutMessage=""
        isCompleting={false}
      />,
    );

    expect(screen.getAllByRole("button", { name: "Ohje" })[0]).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the coach instruction in a dialog", () => {
    const longInstruction =
      "Pidä lapatuet tiukkana, hengitä sisään ennen irrotusta, pysäytä tanko hallitusti rinnalle, työnnä jalat lattiaan koko sarjan ajan ja pidä ranne neutraalina jokaisella toistolla, vaikka sarja alkaisi hidastua loppua kohti.";

    render(
      <AthleteSessionPanel
        scheduledWorkoutId="workout_1"
        scheduledWorkoutTitle="Penkkipäivä"
        selectedSession={buildSession()}
        note=""
        status="in_progress"
        onStart={() => undefined}
        onUpdate={() => undefined}
        onUpdateDuration={async () => ({ ok: true })}
        onSaveNote={() => undefined}
        onComplete={() => undefined}
        onCancel={() => undefined}
        onDelete={() => undefined}
        onBackToList={() => undefined}
        canDeleteWorkout
        initialCorrectionMode={false}
        progress={{ totalSets: 1, completedSets: 0, percent: 0, allDone: false }}
        previousExerciseResults={new Map()}
        exerciseInstructions={new Map([["exercise_group_1", longInstruction]])}
        workoutMessage=""
        isCompleting={false}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Ohje" })[0]!);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("Valmentajan ohje")).toBeInTheDocument();
    expect(screen.getAllByText("Penkkipunnerrus")[0]).toBeInTheDocument();
    expect(dialog).toHaveTextContent("Pidä lapatuet tiukkana");
  });
});
