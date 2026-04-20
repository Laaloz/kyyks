import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { NutritionAthleteCard } from "@/components/workout/nutrition-athlete-card";
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
    ingredientsCatalog: [
      {
        id: "ingredient_1",
        name: "Kanan rintafilee",
        displayName: "Kanan rintafilee",
        source: "manual",
        ownerRole: "admin",
        createdBy: "admin_1",
        kcalPer100: 200,
        proteinPer100: 20,
        carbsPer100: 24,
        fatPer100: 8,
        createdAt: "2026-04-01T08:00:00.000Z",
        updatedAt: "2026-04-01T08:00:00.000Z",
      },
    ],
    recipes: [
      {
        id: "recipe_1",
        name: "Kana ja riisi",
        description: "Palauttava lounas treenipaivaan.",
        instructions: "1. Kypsenna.\n2. Tarjoile.",
        mealTag: "lunch",
        dietaryFlags: [],
        allergies: [],
        ownerRole: "admin",
        createdBy: "admin_1",
        defaultServings: 1,
        minServings: 1,
        maxServings: 4,
        ingredients: [
          {
            id: "recipe_ingredient_1",
            ingredientId: "ingredient_1",
            ingredientName: "Kanan rintafilee",
            quantity: 250,
            normalizedQuantity: 250,
            unit: "g",
            ingredientRole: "main",
            scalingMode: "linear",
          },
        ],
        createdAt: "2026-04-01T08:00:00.000Z",
        updatedAt: "2026-04-01T08:00:00.000Z",
      },
    ],
    mealPlanTemplates: [
      {
        id: "template_1",
        name: "Peruspaiva",
        ownerRole: "admin",
        createdBy: "admin_1",
        items: [
          {
            id: "template_item_1",
            mealTag: "lunch",
            recipeId: "recipe_1",
            sortOrder: 0,
          },
        ],
        createdAt: "2026-04-01T08:00:00.000Z",
        updatedAt: "2026-04-01T08:00:00.000Z",
      },
    ],
    assignedMealPlans: [
      {
        id: "assigned_1",
        athleteId: user.id,
        templateId: "template_1",
        assignedBy: "admin_1",
        name: "Peruspaiva",
        items: [
          {
            id: "assigned_item_1",
            mealTag: "lunch",
            recipeId: "recipe_1",
            sortOrder: 0,
          },
        ],
        active: true,
        assignedAt: "2026-04-01T08:00:00.000Z",
        updatedAt: "2026-04-01T08:00:00.000Z",
      },
    ],
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

describe("NutritionAthleteCard", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders recipe goal comparison in list and detail dialog when profile exists", () => {
    const user = createUser();
    const state = createState(user);
    state.nutritionProfiles = [
      {
        id: "profile_1",
        userId: user.id,
        goal: "maintain",
        activityLevel: "moderate",
        mealsPerDay: 5,
        targetKcal: 2500,
        proteinG: 200,
        carbsG: 300,
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

    render(<NutritionAthleteCard state={state} user={user} />);

    expect(screen.getByText("20 % päivän energiasta")).toBeInTheDocument();
    expect(screen.getByText("P 25 % · H 20 % · R 25 %")).toBeInTheDocument();
    expect(screen.getByText("Lounaan suositus 625-750 kcal, ja tämä annos hieman alle haarukan.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Kana ja riisi/i }));

    expect(screen.getAllByText("20 % päivän energiasta").length).toBeGreaterThan(1);
    expect(screen.getByText("Lounaan suositus 625-750 kcal. Tämä annos hieman alle haarukan.")).toBeInTheDocument();
  });

  it("hides recipe goal comparison when nutrition profile is missing", () => {
    const user = createUser();
    const state = createState(user);

    render(<NutritionAthleteCard state={state} user={user} />);

    expect(screen.queryByText(/päivän energiasta/)).not.toBeInTheDocument();
    expect(screen.queryByText(/suositus 625-750 kcal/)).not.toBeInTheDocument();
  });
});
