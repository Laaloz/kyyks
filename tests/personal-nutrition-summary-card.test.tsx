import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PersonalNutritionSummaryCard } from "@/components/workout/personal-nutrition-summary-card";
import type { AppState, UserProfile } from "@/lib/types";

function createUser(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: "user_1",
    role: "athlete",
    fullName: "Test User",
    email: "test@example.com",
    status: "active",
    age: 31,
    sex: "male",
    heightCm: 184,
    weightKg: 95,
    createdAt: "2026-04-01T08:00:00.000Z",
    updatedAt: "2026-04-01T08:00:00.000Z",
    ...overrides,
  };
}

function createState(user: UserProfile): AppState {
  return {
    users: [user],
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

// Intl.NumberFormat("fi-FI") groups thousands with a non-breaking space, so we
// normalise it to a plain space before comparing rendered text content.
function normalizeSpaces(value: string) {
  return value.replace(/\s/g, " ");
}

function getByExactTextContent(text: string) {
  return screen.getByText(
    (_, element) => element?.tagName === "P" && normalizeSpaces(element.textContent ?? "") === text,
  );
}

afterEach(() => {
  cleanup();
});

describe("PersonalNutritionSummaryCard", () => {
  it("renders comparison list and highlights the active goal from nutrition profile", () => {
    const user = createUser();
    const state = createState(user);
    state.nutritionProfiles = [
      {
        id: "profile_1",
        userId: user.id,
        goal: "gain",
        activityLevel: "moderate",
        mealsPerDay: 5,
        targetKcal: 3200,
        proteinG: 190,
        carbsG: 380,
        fatG: 80,
        calculationMode: "manual_override",
        dietaryFlags: [],
        allergies: [],
        createdBy: "coach_1",
        updatedBy: "coach_1",
        createdAt: "2026-04-01T08:00:00.000Z",
        updatedAt: "2026-04-01T08:00:00.000Z",
      },
    ];

    render(<PersonalNutritionSummaryCard state={state} user={user} />);

    expect(screen.getByText("Päivän energiasuositus")).toBeInTheDocument();
    expect(screen.getByText("Vertaile tavoitteita")).toBeInTheDocument();
    expect(screen.getAllByText("Nykyinen")).toHaveLength(1);
    // Hero shows the manual-override target (3200), rounded to the nearest 50.
    expect(getByExactTextContent("3 200")).toBeInTheDocument();
    expect(screen.getByText("Pudotus")).toBeInTheDocument();
    expect(screen.getByText("Ylläpito")).toBeInTheDocument();
    // The active goal label appears both in the header and the comparison list.
    expect(screen.getAllByText("Kasvatus").length).toBeGreaterThan(0);
  });

  it("rounds visible calorie recommendations for easier reading", () => {
    const user = createUser();
    const state = createState(user);

    render(<PersonalNutritionSummaryCard state={state} user={user} />);

    // Hero shows the active (maintain) target rounded to the nearest 50.
    expect(getByExactTextContent("2 850")).toBeInTheDocument();
    // The comparison list shows all three rounded targets (number + "kcal" suffix).
    expect(getByExactTextContent("2 400kcal")).toBeInTheDocument();
    expect(getByExactTextContent("2 850kcal")).toBeInTheDocument();
    expect(getByExactTextContent("3 050kcal")).toBeInTheDocument();
  });

  it("shows missing data guidance and opens settings callback", () => {
    const onOpenSettings = vi.fn();
    const user = createUser({ age: undefined, weightKg: undefined });
    const state = createState(user);

    render(<PersonalNutritionSummaryCard state={state} user={user} onOpenSettings={onOpenSettings} />);

    expect(screen.getByText("Täydennä tiedot tarkempia tuloksia varten")).toBeInTheDocument();
    expect(screen.getByText(/Lisää profiiliin ikä, sukupuoli, pituus ja paino/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Täydennä tiedot profiiliin" }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });
});
