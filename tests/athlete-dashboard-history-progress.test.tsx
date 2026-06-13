import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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

afterEach(() => {
  cleanup();
  mockUseAppState.mockReset();
});

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

function renderDashboard(state: AppState, options: { tab?: "training" | "history" | "exercises" } = {}) {
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
  if (options.tab === "exercises") {
    fireEvent.click(screen.getByRole("tab", { name: "Liikkeet" }));
  } else if (options.tab !== "training") {
    fireEvent.click(screen.getByRole("tab", { name: "Historia" }));
  }
}

describe("AthleteDashboard history exercise progress", () => {
  it("keeps program workouts in the order defined by the program", () => {
    const state = createBaseState();
    state.plans = [
      {
        id: "plan_1",
        coachId: "coach_1",
        athleteId: "athlete_1",
        title: "Perusvoima",
        status: "active",
        startDate: "2026-04-01",
        weekCount: 4,
        createdAt: "2026-04-01T08:00:00.000Z",
        updatedAt: "2026-04-01T08:00:00.000Z",
        workouts: [
          {
            id: "program_workout_first",
            name: "Ensimmäinen ohjelmassa",
            splitType: "custom",
            defaultRestSeconds: 120,
            exercises: [],
          },
          {
            id: "program_workout_second",
            name: "Toinen ohjelmassa",
            splitType: "custom",
            defaultRestSeconds: 120,
            exercises: [],
          },
          {
            id: "program_workout_third",
            name: "Kolmas ohjelmassa",
            splitType: "custom",
            defaultRestSeconds: 120,
            exercises: [],
          },
        ],
      },
    ];
    state.scheduledWorkouts = [
      {
        id: "completed_third",
        trainingPlanId: "plan_1",
        programWorkoutId: "program_workout_third",
        athleteId: "athlete_1",
        coachId: "coach_1",
        title: "Kolmas ohjelmassa",
        scheduledDate: "2026-04-14",
        status: "completed",
        createdAt: "2026-04-14T08:00:00.000Z",
        updatedAt: "2026-04-14T09:00:00.000Z",
        completedAt: "2026-04-14T09:00:00.000Z",
      },
    ];

    renderDashboard(state, { tab: "training" });

    const trainingPanel = screen.getByRole("tabpanel", { name: "Treeni" });
    const first = within(trainingPanel).getByText("Ensimmäinen ohjelmassa");
    const second = within(trainingPanel).getByText("Toinen ohjelmassa");
    const third = within(trainingPanel).getByText("Kolmas ohjelmassa");

    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(second.compareDocumentPosition(third) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("lists tracked exercises in the Liikkeet tab and opens an exercise detail with its e1RM trend", () => {
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

    renderDashboard(state, { tab: "exercises" });

    // Liikelista näyttää molemmat kuormalliset liikkeet + niiden e1RM:n.
    expect(screen.getByText("Takakyykky")).toBeInTheDocument();
    expect(screen.getByText("Penkkipunnerrus")).toBeInTheDocument();

    // Liikkeen napautus avaa kehityssivun e1RM-trendillä.
    fireEvent.click(screen.getByText("Takakyykky"));
    expect(screen.getByText("Liikkeen kehitys")).toBeInTheDocument();
    expect(screen.getByTestId("metric-trend-chart")).toHaveTextContent("Takakyykky e1RM kehitystrendi:1");
  });

  it("omits exercises with only non-weighted history from the Liikkeet tab", () => {
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

    renderDashboard(state, { tab: "exercises" });

    // Vain kuormalliset liikkeet näkyvät kehityslistassa; Leuanveto (ei kuormaa) suodattuu pois.
    expect(screen.queryByText("Leuanveto")).not.toBeInTheDocument();
    expect(screen.getByText("Ei liikkeitä tällä haulla.")).toBeInTheDocument();
  });
});
