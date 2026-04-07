import { describe, expect, it } from "vitest";

import { cloneDemoState } from "@/lib/domain";
import {
  assignMealPlan,
  calculateMacroTarget,
  calculateRecipeNutrition,
  getActiveMealPlanForAthlete,
  scaleRecipeIngredient,
} from "@/lib/nutrition";

describe("nutrition helpers", () => {
  it("calculates a macro target from body data, goal and activity", () => {
    const target = calculateMacroTarget({
      age: 29,
      heightCm: 168,
      weightKg: 67.8,
      sex: "female",
      goal: "maintain",
      activityLevel: "moderate",
    });

    expect(target).not.toBeNull();
    expect(target?.kcal).toBeGreaterThan(1800);
    expect(target?.proteinG).toBeGreaterThan(100);
  });

  it("returns null when auto calculation profile data is incomplete", () => {
    const target = calculateMacroTarget({
      heightCm: 168,
      weightKg: 67.8,
      goal: "maintain",
      activityLevel: "moderate",
    });

    expect(target).toBeNull();
  });

  it("scales linear recipe ingredients but keeps fixed spices stable", () => {
    const linear = scaleRecipeIngredient(
      {
        id: "main_1",
        ingredientId: "ingredient_chicken",
        ingredientName: "Kanan rintafilee",
        quantity: 600,
        unit: "g",
        normalizedQuantity: 600,
        ingredientRole: "main",
        scalingMode: "linear",
      },
      8,
      4,
    );

    const fixed = scaleRecipeIngredient(
      {
        id: "spice_1",
        ingredientId: "ingredient_salt",
        ingredientName: "Suola",
        quantity: 5,
        unit: "g",
        normalizedQuantity: 5,
        ingredientRole: "spice",
        scalingMode: "fixed",
      },
      8,
      4,
    );

    expect(linear.quantity).toBe(1200);
    expect(fixed.quantity).toBe(5);
  });

  it("ignores text-only spices in recipe nutrition", () => {
    const state = cloneDemoState();
    const recipe = state.recipes.find((item) => item.id === "recipe_chicken_rice");
    expect(recipe).toBeDefined();
    if (!recipe) {
      return;
    }

    const summary = calculateRecipeNutrition(recipe, state.ingredientsCatalog);

    expect(summary.nutritionPerRecipe.kcal).toBeGreaterThan(1500);
    expect(summary.nutritionPerServing.kcal).toBeGreaterThan(300);
  });

  it("assigns a new meal plan and deactivates the previous one", () => {
    const state = cloneDemoState();
    const assigned = assignMealPlan(state, "user_admin_1", {
      athleteId: "user_athlete_1",
      templateId: "meal_template_1",
    });

    const activePlans = assigned.assignedMealPlans.filter((plan) => plan.athleteId === "user_athlete_1" && plan.active);
    expect(activePlans).toHaveLength(1);
    expect(getActiveMealPlanForAthlete(assigned, "user_athlete_1")?.templateId).toBe("meal_template_1");
  });
});
