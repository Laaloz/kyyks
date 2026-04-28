import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminDashboard } from "@/components/workout/admin-dashboard";
import { AthleteDashboard } from "@/components/workout/athlete-dashboard";
import { CoachDashboard } from "@/components/workout/coach-dashboard";

vi.mock("@/components/workout/personal-nutrition-summary-card", () => ({
  PersonalNutritionSummaryCard: () => <div>PersonalNutritionSummaryCard</div>,
}));

vi.mock("@/components/workout/nutrition-athlete-card", () => ({
  NutritionAthleteCard: () => <div>NutritionAthleteCard</div>,
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
  it("renders in athlete nutrition view", () => {
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
    expect(screen.getByText("PersonalNutritionSummaryCard")).toBeInTheDocument();
  });

  it("keeps coach overview focused on training and measurements", () => {
    const state = createBaseState();
    const coachUser = { ...state.users[0], id: "coach_1", role: "coach", email: "coach@example.com" };
    state.users = [coachUser];

    mockUseAppState.mockReturnValue({
      currentUser: coachUser,
      state,
      notify: vi.fn(),
      createProgram: vi.fn(),
      updateProgram: vi.fn(),
      setProgramStatus: vi.fn(),
      deleteProgram: vi.fn(),
      getCoachAthletes: vi.fn(() => []),
      createInvite: vi.fn(),
      resendInvite: vi.fn(),
      startWorkout: vi.fn(),
      startProgramWorkout: vi.fn(),
      updateWorkoutDate: vi.fn(),
      updateWorkoutDuration: vi.fn(),
      updateWorkoutSet: vi.fn(),
      saveWorkoutNote: vi.fn(),
      addConversationComment: vi.fn(),
      completeWorkout: vi.fn(),
      cancelWorkout: vi.fn(),
      deleteWorkout: vi.fn(),
      markConversationRead: vi.fn(),
    });

    render(<CoachDashboard view="overview" />);
    expect(screen.queryByText("PersonalNutritionSummaryCard")).not.toBeInTheDocument();
    expect(screen.getByText("OwnTrainingOverviewCard")).toBeInTheDocument();
  });

  it("keeps admin own overview focused on training and measurements", () => {
    const state = createBaseState();
    const adminUser = { ...state.users[0], id: "admin_1", role: "admin", email: "admin@example.com" };
    state.users = [adminUser];

    mockUseAppState.mockReturnValue({
      currentUser: adminUser,
      state,
      notify: vi.fn(),
      createInvite: vi.fn(),
      resendInvite: vi.fn(),
    });

    render(<AdminDashboard view="overview" />);
    expect(screen.queryByText("PersonalNutritionSummaryCard")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Oma" }));
    expect(screen.queryByText("PersonalNutritionSummaryCard")).not.toBeInTheDocument();
    expect(screen.getByText("OwnTrainingOverviewCard")).toBeInTheDocument();
  });
});
