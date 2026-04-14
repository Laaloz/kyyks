import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AthleteDashboard } from "@/components/workout/athlete-dashboard";
import type { AppState } from "@/lib/types";

vi.mock("@/components/workout/metric-trend-chart", () => ({
  MetricTrendChart: ({
    ariaLabel,
    emptyMessage,
    points,
  }: {
    ariaLabel: string;
    emptyMessage: string;
    points: Array<{ date: string; value: number }>;
  }) => (
    <div data-testid="metric-trend-chart">
      {points.length > 0 ? `${ariaLabel}:${points.length}` : emptyMessage}
    </div>
  ),
}));

const mockUseAppState = vi.fn();

vi.mock("@/providers/app-state-provider", () => ({
  resolveBlockingWorkoutStart: () => null,
  useAppState: () => mockUseAppState(),
}));

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
      {
        id: "coach_1",
        role: "coach",
        fullName: "Coach One",
        email: "coach@example.com",
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

function renderDashboard(state: AppState) {
  mockUseAppState.mockReturnValue({
    authenticatedUser: { id: "athlete_1", email: "athlete@example.com" },
    currentUser: state.users[0],
    state,
    notify: vi.fn(),
    startWorkout: vi.fn(),
    startProgramWorkout: vi.fn(),
    updateCurrentUserMeasurements: vi.fn(),
    updateWorkoutDate: vi.fn(),
    updateWorkoutDuration: vi.fn(),
    updateWorkoutSet: vi.fn(),
    saveWorkoutNote: vi.fn(),
    addConversationComment: vi.fn(),
    completeWorkout: vi.fn(),
    cancelWorkout: vi.fn(),
    deleteWorkout: vi.fn(),
  });

  render(<AthleteDashboard view="athlete-log" />);
  fireEvent.click(screen.getByRole("tab", { name: "Historia" }));
}

describe("AthleteDashboard history exercise progress", () => {
  it("shows the new exercise progress card and updates metrics when exercise changes", () => {
    const state = createBaseState();
    state.scheduledWorkouts = [
      {
        id: "workout_1",
        athleteId: "athlete_1",
        coachId: "coach_1",
        title: "Push A",
        scheduledDate: "2026-04-10",
        status: "completed",
        createdAt: "2026-04-10T08:00:00.000Z",
        updatedAt: "2026-04-10T09:00:00.000Z",
        completedAt: "2026-04-10T09:00:00.000Z",
        programWorkoutId: "program_workout_1",
      },
      {
        id: "workout_2",
        athleteId: "athlete_1",
        coachId: "coach_1",
        title: "Legs A",
        scheduledDate: "2026-04-14",
        status: "completed",
        createdAt: "2026-04-14T08:00:00.000Z",
        updatedAt: "2026-04-14T09:00:00.000Z",
        completedAt: "2026-04-14T09:00:00.000Z",
        programWorkoutId: "program_workout_2",
      },
    ];
    state.sessions = [
      {
        id: "session_1",
        scheduledWorkoutId: "workout_1",
        athleteId: "athlete_1",
        startedAt: "2026-04-10T08:00:00.000Z",
        completedAt: "2026-04-10T09:00:00.000Z",
        updatedAt: "2026-04-10T09:00:00.000Z",
        setLogs: [
          {
            id: "log_1",
            scheduledWorkoutId: "workout_1",
            templateExerciseId: "exercise_group_1",
            setId: "set_1",
            exerciseId: "exercise_bench",
            exerciseName: "Penkkipunnerrus",
            setLabel: "1",
            targetReps: 5,
            actualReps: 5,
            actualLoad: 100,
            done: true,
          },
        ],
      },
      {
        id: "session_2",
        scheduledWorkoutId: "workout_2",
        athleteId: "athlete_1",
        startedAt: "2026-04-14T08:00:00.000Z",
        completedAt: "2026-04-14T09:00:00.000Z",
        updatedAt: "2026-04-14T09:00:00.000Z",
        setLogs: [
          {
            id: "log_2",
            scheduledWorkoutId: "workout_2",
            templateExerciseId: "exercise_group_2",
            setId: "set_2",
            exerciseId: "exercise_squat",
            exerciseName: "Takakyykky",
            setLabel: "1",
            targetReps: 4,
            actualReps: 4,
            actualLoad: 140,
            done: true,
          },
        ],
      },
    ];

    renderDashboard(state);

    expect(screen.getByText("Liikekohtainen kehitys")).toBeInTheDocument();
    expect(screen.getByText("e1RM-trendi · Takakyykky")).toBeInTheDocument();
    expect(screen.getByText("150,7 kg")).toBeInTheDocument();
    expect(screen.getByTestId("metric-trend-chart")).toHaveTextContent("Takakyykky e1RM kehitystrendi:1");

    fireEvent.change(screen.getByLabelText("Valitse liike"), {
      target: { value: "id:exercise_bench" },
    });

    expect(screen.getByText("e1RM-trendi · Penkkipunnerrus")).toBeInTheDocument();
    expect(screen.getByText("116,7 kg")).toBeInTheDocument();
    expect(screen.getByText("100 kg x 5")).toBeInTheDocument();
    expect(screen.getByTestId("metric-trend-chart")).toHaveTextContent("Penkkipunnerrus e1RM kehitystrendi:1");
  });

  it("shows an empty weighted-data state when the selected exercise has only non-weighted history", () => {
    const state = createBaseState();
    state.scheduledWorkouts = [
      {
        id: "workout_1",
        athleteId: "athlete_1",
        coachId: "coach_1",
        title: "Pull A",
        scheduledDate: "2026-04-12",
        status: "completed",
        createdAt: "2026-04-12T08:00:00.000Z",
        updatedAt: "2026-04-12T09:00:00.000Z",
        completedAt: "2026-04-12T09:00:00.000Z",
        programWorkoutId: "program_workout_3",
      },
    ];
    state.sessions = [
      {
        id: "session_1",
        scheduledWorkoutId: "workout_1",
        athleteId: "athlete_1",
        startedAt: "2026-04-12T08:00:00.000Z",
        completedAt: "2026-04-12T09:00:00.000Z",
        updatedAt: "2026-04-12T09:00:00.000Z",
        setLogs: [
          {
            id: "log_1",
            scheduledWorkoutId: "workout_1",
            templateExerciseId: "exercise_group_1",
            setId: "set_1",
            exerciseId: "exercise_pullup",
            exerciseName: "Leuanveto",
            setLabel: "1",
            targetReps: 8,
            actualReps: 8,
            done: true,
          },
        ],
      },
    ];

    renderDashboard(state);

    expect(screen.getByText("Liikekohtainen kehitys")).toBeInTheDocument();
    expect(screen.getAllByText("Ei dataa")).toHaveLength(3);
    expect(
      screen.getByText("Valitulla liikkeellä ei ole vielä kuormallista toteumaa, josta e1RM voitaisiin arvioida."),
    ).toBeInTheDocument();
  });
});
