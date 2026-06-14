import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AthleteDashboard } from "@/components/workout/athlete-dashboard";

vi.mock("@/components/workout/personal-nutrition-summary-card", () => ({
  PersonalNutritionSummaryCard: () => <div>PersonalNutritionSummaryCard</div>,
}));

vi.mock("@/components/workout/nutrition-athlete-card", () => ({
  NutritionAthleteCard: () => <div>NutritionAthleteCard</div>,
}));

vi.mock("@/components/workout/nutrition-view", () => ({
  NutritionView: () => <div>NutritionView</div>,
}));

vi.mock("@/components/workout/own-measurements-card", () => ({
  OwnMeasurementsCard: () => <div>OwnMeasurementsCard</div>,
}));

vi.mock("@/components/workout/shared", async () => {
  const actual = await vi.importActual<object>("@/components/workout/shared");
  return {
    ...actual,
    OwnTrainingOverviewCard: () => <div>OwnTrainingOverviewCard</div>,
    MetricGrid: () => <div>MetricGrid</div>,
    roleLabel: (role: string) => role,
  };
});

const mockUseAppState = vi.fn();

vi.mock("@/providers/app-state-provider", () => ({
  resolveBlockingWorkoutStart: () => null,
  canDeleteProgramFromState: () => false,
  useAppState: () => mockUseAppState(),
}));

afterEach(() => {
  cleanup();
  mockUseAppState.mockReset();
});

function createBaseState() {
  return {
    users: [
      {
        id: "user_1",
        role: "athlete",
        fullName: "User One",
        email: "user@example.com",
        status: "active",
        age: 31,
        sex: "male",
        heightCm: 184,
        weightKg: 95,
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

describe("personal nutrition summary overview wiring", () => {
  it("renders the nutrition view in the athlete Ravinto tab", () => {
    const state = createBaseState();
    mockUseAppState.mockReturnValue({
      authenticatedUser: state.users[0],
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

    render(<AthleteDashboard view="nutrition" />);
    expect(screen.getByText("NutritionView")).toBeInTheDocument();
  });
});
