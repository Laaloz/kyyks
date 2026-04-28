import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { buildProgramDraftFromProgram, CoachDashboard } from "@/components/workout/coach-dashboard";
import { PROGRAMS_WORKSPACE_VIEW } from "@/components/workout/shared";
import { PROGRAMS_DASHBOARD_VIEW, type AppState, type Exercise, type TrainingPlan, type UserProfile } from "@/lib/types";

vi.mock("@/components/workout/conversation-panel", () => ({
  ConversationPanel: () => <div>ConversationPanel</div>,
}));

vi.mock("@/components/workout/metric-trend-chart", () => ({
  MetricTrendChart: () => <div>MetricTrendChart</div>,
}));

vi.mock("@/components/workout/own-measurements-card", () => ({
  OwnMeasurementsCard: () => <div>OwnMeasurementsCard</div>,
}));

vi.mock("@/components/workout/personal-nutrition-summary-card", () => ({
  PersonalNutritionSummaryCard: () => <div>PersonalNutritionSummaryCard</div>,
}));

vi.mock("@/components/workout/coach/invite-panel", () => ({
  CoachInvitePanel: () => <div>CoachInvitePanel</div>,
}));

vi.mock("@/components/workout/coach/program-workout-editor", () => ({
  ProgramWorkoutEditor: () => <div>ProgramWorkoutEditor</div>,
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

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  window.scrollTo = vi.fn();
});

vi.mock("@/providers/app-state-provider", () => ({
  resolveBlockingWorkoutStart: () => null,
  canDeleteProgramFromState: () => false,
  useAppState: () => mockUseAppState(),
}));

function createUser(overrides: Partial<UserProfile>): UserProfile {
  return {
    id: "user_default",
    role: "athlete",
    fullName: "Default User",
    email: "default@example.com",
    status: "active",
    createdAt: "2026-04-01T08:00:00.000Z",
    updatedAt: "2026-04-01T08:00:00.000Z",
    ...overrides,
  };
}

function createExercise(overrides: Partial<Exercise>): Exercise {
  return {
    id: "exercise_bench",
    name: "Penkkipunnerrus",
    category: "Rinta",
    equipment: "Tanko",
    cue: "Pidä lavat takana.",
    scope: "global",
    ...overrides,
  };
}

function createProgram(overrides: Partial<TrainingPlan> = {}): TrainingPlan {
  return {
    id: "plan_1",
    coachId: "coach_1",
    athleteId: "athlete_1",
    title: "Voimaohjelma",
    description: "Perusvoimaa kahdella treenipäivällä.",
    status: "active",
    startDate: "2026-04-01T08:00:00.000Z",
    weekCount: 4,
    createdAt: "2026-04-01T08:00:00.000Z",
    updatedAt: "2026-04-01T08:00:00.000Z",
    workouts: [
      {
        id: "workout_1",
        name: "Voima ylä",
        splitType: "upper",
        guidance: "Pääliikkeet ensin.",
        defaultRestSeconds: 120,
        exercises: [
          {
            id: "program_ex_1",
            exerciseId: "exercise_bench",
            exerciseName: "Penkkipunnerrus",
            supersetGroup: "A",
            instruction: "Paina lattiaa jaloilla.",
            sets: [
              {
                id: "set_1",
                label: "1",
                targetReps: 5,
                targetLoad: 80,
                restSeconds: 150,
                notes: "RPE 8",
              },
            ],
          },
        ],
      },
      {
        id: "workout_2",
        name: "Selkä pumppi",
        splitType: "custom",
        guidance: "Pidä tempo hallittuna.",
        defaultRestSeconds: 75,
        exercises: [
          {
            id: "program_ex_2",
            exerciseName: "Kuminauhasoutu",
            muscleGroup: "back",
            instruction: "Purista lapoja yhteen.",
            sets: [
              {
                id: "set_2",
                label: "1",
                targetReps: 10,
                targetRepsMin: 10,
                targetRepsMax: 12,
                targetLoad: 20,
                restSeconds: 60,
                notes: "Tasainen pumppi",
              },
            ],
          },
        ],
      },
    ],
    ...overrides,
  };
}

function createState(options?: {
  currentUser?: UserProfile;
  athletes?: UserProfile[];
  exercises?: Exercise[];
  plans?: TrainingPlan[];
}): AppState {
  const coach = options?.currentUser ?? createUser({
    id: "coach_1",
    role: "coach",
    fullName: "Coach Carter",
    email: "coach@example.com",
  });
  const athletes = options?.athletes ?? [
    createUser({
      id: "athlete_1",
      role: "athlete",
      fullName: "Athlete One",
      email: "athlete1@example.com",
    }),
    createUser({
      id: "athlete_2",
      role: "athlete",
      fullName: "Athlete Two",
      email: "athlete2@example.com",
    }),
  ];

  return {
    users: [coach, ...athletes],
    bodyMeasurements: [],
    nutritionProfiles: [],
    ingredientsCatalog: [],
    recipes: [],
    mealPlanTemplates: [],
    assignedMealPlans: [],
    assignments: [],
    exercises: options?.exercises ?? [createExercise({})],
    templates: [],
    plans: options?.plans ?? [createProgram({})],
    scheduledWorkouts: [],
    sessions: [],
    notes: [],
    conversationEntries: [],
    invites: [],
    passwordResetRequests: [],
  };
}

function mockCoachDashboardState(state: AppState, currentUser: UserProfile, athletes: UserProfile[]) {
  mockUseAppState.mockReturnValue({
    currentUser,
    state,
    notify: vi.fn(),
    createProgram: vi.fn(),
    updateProgram: vi.fn(),
    setProgramStatus: vi.fn(async () => ({ ok: true })),
    deleteProgram: vi.fn(async () => ({ ok: true })),
    addConversationComment: vi.fn(),
    getCoachAthletes: vi.fn(() => athletes),
    markConversationRead: vi.fn(),
  });
}

describe("coach program copy", () => {
  it("builds a copied program draft with all workouts and clears copied loads", () => {
    const exercise = createExercise({});
    const program = createProgram({});

    const draft = buildProgramDraftFromProgram(program, [exercise], "athlete_2");

    expect(draft.title).toBe("Voimaohjelma (kopio)");
    expect(draft.description).toBe("Perusvoimaa kahdella treenipäivällä.");
    expect(draft.athleteId).toBe("athlete_2");
    expect(draft.workouts).toHaveLength(2);
    expect(draft.workouts[0]).toMatchObject({
      splitType: "upper",
      nameOverride: "Voima ylä",
      guidance: "Pääliikkeet ensin.",
      defaultRestSeconds: 120,
    });
    expect(draft.workouts[0].exercises[0]).toMatchObject({
      exerciseId: "exercise_bench",
      exerciseNameOverride: "",
      supersetGroup: "A",
      instruction: "Paina lattiaa jaloilla.",
      repMode: "exact",
      setCount: 1,
      targetReps: 5,
      restSeconds: 150,
      notes: "RPE 8",
    });
    expect(draft.workouts[0].exercises[0].targetLoad).toBeUndefined();
    expect(draft.workouts[1]).toMatchObject({
      splitType: "custom",
      nameOverride: "Selkä pumppi",
      guidance: "Pidä tempo hallittuna.",
      defaultRestSeconds: 75,
    });
    expect(draft.workouts[1].exercises[0]).toMatchObject({
      exerciseId: "__custom__",
      customExerciseName: "Kuminauhasoutu",
      customMuscleGroup: "back",
      instruction: "Purista lapoja yhteen.",
      repMode: "range",
      setCount: 1,
      targetReps: 10,
      targetRepsMin: 10,
      targetRepsMax: 12,
      restSeconds: 60,
      notes: "Tasainen pumppi",
    });
    expect(draft.workouts[1].exercises[0].targetLoad).toBeUndefined();
  });

  it("copies a program to another user as a new builder draft", async () => {
    const state = createState();
    const currentUser = state.users[0];
    const athletes = state.users.slice(1);
    mockCoachDashboardState(state, currentUser, athletes);

    render(<CoachDashboard view={PROGRAMS_DASHBOARD_VIEW} />);

    fireEvent.click(screen.getByRole("button", { name: "Avaa ohjelman lisätoiminnot" }));
    fireEvent.click(screen.getByRole("button", { name: "Kopioi toiselle käyttäjälle" }));

    expect(screen.getByText("Kopioi ohjelma toiselle käyttäjälle")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Coach Carter (sinä)" }));
    expect(screen.queryByRole("button", { name: "Athlete One" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Athlete Two" }));

    fireEvent.click(screen.getByRole("button", { name: "Kopioi pohjaksi" }));

    expect(screen.getByDisplayValue("Voimaohjelma (kopio)")).toBeInTheDocument();
    expect((screen.getByLabelText("Käyttäjä *") as HTMLSelectElement).value).toBe("athlete_2");
    expect(screen.queryByText("Muokkaustila")).not.toBeInTheDocument();
    expect(screen.getByText('Ohjelma "Voimaohjelma" kopioitiin käyttäjälle "Athlete Two" uuden ohjelman pohjaksi.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Siirry lisäämään treenit" }));

    expect(await screen.findByText("Voima ylä")).toBeInTheDocument();
    expect(screen.getByText("Selkä pumppi")).toBeInTheDocument();
    expect(screen.getByText("Kuminauhasoutu")).toBeInTheDocument();
    expect(screen.getByText("Penkkipunnerrus")).toBeInTheDocument();
  });

  it("disables copy action when there are no other targets", () => {
    const currentUser = createUser({
      id: "coach_1",
      role: "coach",
      fullName: "Coach Carter",
      email: "coach@example.com",
    });
    const selfProgram = createProgram({ athleteId: currentUser.id, title: "Oma ohjelma" });
    const state = createState({
      currentUser,
      athletes: [],
      plans: [selfProgram],
    });

    mockCoachDashboardState(state, currentUser, []);

    render(<CoachDashboard view={PROGRAMS_DASHBOARD_VIEW} />);

    fireEvent.click(screen.getByRole("button", { name: "Avaa ohjelman lisätoiminnot" }));

    const copyButton = screen.getByRole("button", { name: "Kopioi toiselle käyttäjälle" });
    expect(copyButton).toBeDisabled();
    expect(screen.getByText("Ei muita käyttäjiä kopiointia varten.")).toBeInTheDocument();
  });
});
