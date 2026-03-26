import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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
        scheduledDate="2026-03-24T08:00:00.000Z"
        onStart={() => undefined}
        onUpdate={() => undefined}
        onUpdateDate={async () => ({ ok: true })}
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
        exerciseOrder={new Map([["exercise_group_1", 0]])}
        loadIncrementKg={2.5}
        workoutMessage=""
        isCompleting={false}
      />,
    );

    expect(screen.getByRole("button", { name: "Penkkipunnerrus ohje" })).toBeInTheDocument();
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
        scheduledDate="2026-03-24T08:00:00.000Z"
        onStart={() => undefined}
        onUpdate={() => undefined}
        onUpdateDate={async () => ({ ok: true })}
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
        exerciseOrder={new Map([["exercise_group_1", 0]])}
        loadIncrementKg={2.5}
        workoutMessage=""
        isCompleting={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Penkkipunnerrus ohje" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("Valmentajan ohje")).toBeInTheDocument();
    expect(screen.getAllByText("Penkkipunnerrus")[0]).toBeInTheDocument();
    expect(dialog).toHaveTextContent("Pidä lapatuet tiukkana");
  });

  it("moves focus semantically to next workout field on Enter", async () => {
    const session = buildSession();
    session.setLogs = [
      ...session.setLogs,
      {
        ...session.setLogs[0]!,
        id: "log_2",
        setId: "set_2",
        setLabel: "2",
      },
    ];

    render(
      <AthleteSessionPanel
        scheduledWorkoutId="workout_1"
        scheduledWorkoutTitle="Penkkipäivä"
        selectedSession={session}
        note=""
        status="in_progress"
        scheduledDate="2026-03-24T08:00:00.000Z"
        onStart={() => undefined}
        onUpdate={() => undefined}
        onUpdateDate={async () => ({ ok: true })}
        onUpdateDuration={async () => ({ ok: true })}
        onSaveNote={() => undefined}
        onComplete={() => undefined}
        onCancel={() => undefined}
        onDelete={() => undefined}
        onBackToList={() => undefined}
        canDeleteWorkout
        initialCorrectionMode={false}
        progress={{ totalSets: 2, completedSets: 0, percent: 0, allDone: false }}
        previousExerciseResults={new Map()}
        exerciseInstructions={new Map()}
        exerciseOrder={new Map([["exercise_group_1", 0]])}
        loadIncrementKg={2.5}
        workoutMessage=""
        isCompleting={false}
      />,
    );

    const repsInput = screen.getByLabelText("Penkkipunnerrus sarja 1 toteutuneet toistot");
    const loadInput = screen.getByLabelText("Penkkipunnerrus sarja 1 toteutunut kuorma");
    const nextRepsInput = screen.getByLabelText("Penkkipunnerrus sarja 2 toteutuneet toistot");

    repsInput.focus();
    fireEvent.keyDown(repsInput, { key: "Enter" });
    await vi.waitFor(() => expect(loadInput).toHaveFocus());

    fireEvent.keyDown(loadInput, { key: "Enter" });
    await vi.waitFor(() => expect(nextRepsInput).toHaveFocus());
  });

  it("starts completed workout in edit mode without toggle and allows date save", async () => {
    const onUpdateDate = vi.fn(async () => ({ ok: true }));

    render(
      <AthleteSessionPanel
        scheduledWorkoutId="workout_1"
        scheduledWorkoutTitle="Penkkipäivä"
        selectedSession={{ ...buildSession(), completedAt: "2026-03-24T09:00:00.000Z" }}
        note=""
        status="completed"
        scheduledDate="2026-03-24T09:00:00.000Z"
        onStart={() => undefined}
        onUpdate={() => undefined}
        onUpdateDate={onUpdateDate}
        onUpdateDuration={async () => ({ ok: true })}
        onSaveNote={() => undefined}
        onComplete={() => undefined}
        onCancel={() => undefined}
        onDelete={() => undefined}
        onBackToList={() => undefined}
        canDeleteWorkout
        initialCorrectionMode
        progress={{ totalSets: 1, completedSets: 1, percent: 100, allDone: true }}
        previousExerciseResults={new Map()}
        exerciseInstructions={new Map()}
        exerciseOrder={new Map([["exercise_group_1", 0]])}
        loadIncrementKg={2.5}
        workoutMessage=""
        isCompleting={false}
      />,
    );

    expect(screen.queryByRole("button", { name: "Avaa muokkaus" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Päivämäärä"), { target: { value: "2026-03-25" } });
    fireEvent.click(screen.getByRole("button", { name: "Tallenna päivä" }));

    await vi.waitFor(() => expect(onUpdateDate).toHaveBeenCalledWith("2026-03-25"));
  });
});
