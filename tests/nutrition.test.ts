import { describe, expect, it } from "vitest";

import { cloneDemoState } from "@/lib/domain";
import {
  assignMealPlan,
  buildPersonalNutritionGoalComparison,
  calculateMacroTarget,
  calculateRecipeNutrition,
  getActiveMealPlanForAthlete,
  joinRecipeInstructionSteps,
  scaleRecipeIngredient,
  splitRecipeInstructions,
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
    expect(target?.kcal).toBeGreaterThan(1700);
    expect(target?.proteinG).toBeGreaterThan(110);
  });

  it("keeps a 98 kg / 180 cm cut target close to the requested macro split", () => {
    const target = calculateMacroTarget({
      age: 30,
      sex: "male",
      heightCm: 180,
      weightKg: 98,
      goal: "lose",
      activityLevel: "moderate",
    });

    expect(target).not.toBeNull();
    expect(target?.kcal).toBeGreaterThanOrEqual(2175);
    expect(target?.kcal).toBeLessThanOrEqual(2225);
    expect(target?.proteinG).toBeGreaterThanOrEqual(155);
    expect(target?.proteinG).toBeLessThanOrEqual(170);
    expect(target?.carbsG).toBeGreaterThanOrEqual(235);
    expect(target?.carbsG).toBeLessThanOrEqual(250);
    expect(target?.fatG).toBeGreaterThanOrEqual(60);
    expect(target?.fatG).toBeLessThanOrEqual(70);
  });

  it("raises calories and carbs from cut to maintain to gain", () => {
    const cut = calculateMacroTarget({
      age: 30,
      sex: "male",
      heightCm: 180,
      weightKg: 98,
      goal: "lose",
      activityLevel: "moderate",
    });
    const maintain = calculateMacroTarget({
      age: 30,
      sex: "male",
      heightCm: 180,
      weightKg: 98,
      goal: "maintain",
      activityLevel: "moderate",
    });
    const gain = calculateMacroTarget({
      age: 30,
      sex: "male",
      heightCm: 180,
      weightKg: 98,
      goal: "gain",
      activityLevel: "moderate",
    });

    expect(cut && maintain && gain).toBeTruthy();
    expect((maintain?.kcal ?? 0)).toBeGreaterThan(cut?.kcal ?? 0);
    expect((gain?.kcal ?? 0)).toBeGreaterThan(maintain?.kcal ?? 0);
    expect((maintain?.carbsG ?? 0)).toBeGreaterThan(cut?.carbsG ?? 0);
    expect((gain?.carbsG ?? 0)).toBeGreaterThan(maintain?.carbsG ?? 0);
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

  it("sets lower calorie target for weight-loss than maintenance", () => {
    const maintain = calculateMacroTarget({
      age: 31,
      heightCm: 184,
      weightKg: 95,
      sex: "male",
      goal: "maintain",
      activityLevel: "moderate",
    });
    const lose = calculateMacroTarget({
      age: 31,
      heightCm: 184,
      weightKg: 95,
      sex: "male",
      goal: "lose",
      activityLevel: "moderate",
    });

    expect(maintain).not.toBeNull();
    expect(lose).not.toBeNull();
    expect(lose!.kcal).toBeLessThan(maintain!.kcal);
    expect(lose!.kcal).toBeLessThanOrEqual(2300);
  });

  it("builds personal comparison targets from active profile and keeps phase order", () => {
    const comparison = buildPersonalNutritionGoalComparison(
      {
        age: 31,
        heightCm: 184,
        weightKg: 95,
        sex: "male",
      },
      {
        goal: "gain",
        activityLevel: "moderate",
        targetKcal: 3200,
        proteinG: 190,
        carbsG: 380,
        fatG: 80,
        calculationMode: "manual_override",
      },
    );

    expect(comparison).not.toBeNull();
    expect(comparison?.activeGoal).toBe("gain");
    expect(comparison?.activeTarget.kcal).toBe(3200);
    expect(comparison?.comparisonTargets.lose.kcal).toBeLessThan(comparison?.comparisonTargets.maintain.kcal ?? 0);
    expect(comparison?.comparisonTargets.maintain.kcal).toBeLessThan(comparison?.comparisonTargets.gain.kcal ?? 0);
    expect(comparison?.isEstimate).toBe(true);
  });

  it("returns null comparison when required profile data is missing", () => {
    const comparison = buildPersonalNutritionGoalComparison(
      {
        heightCm: 168,
        weightKg: 67.8,
        sex: "female",
      },
      null,
    );

    expect(comparison).toBeNull();
  });

  it("defaults comparison targets to high activity when no profile exists", () => {
    const comparison = buildPersonalNutritionGoalComparison(
      {
        age: 30,
        heightCm: 180,
        weightKg: 87,
        sex: "male",
      },
      null,
    );

    const expectedMaintain = calculateMacroTarget({
      age: 30,
      heightCm: 180,
      weightKg: 87,
      sex: "male",
      goal: "maintain",
      activityLevel: "high",
    });

    expect(comparison).not.toBeNull();
    expect(comparison?.activityLevel).toBe("high");
    expect(comparison?.comparisonTargets.maintain.kcal).toBe(expectedMaintain?.kcal);
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

  it("converts recipe steps to numbered instruction text", () => {
    const instructions = joinRecipeInstructionSteps([
      "Kypsenna riisi pakkauksen ohjeen mukaan.",
      "Paista kana pannulla.",
      "Yhdista ainekset ja tarjoile.",
    ]);

    expect(instructions).toBe(
      "1. Kypsenna riisi pakkauksen ohjeen mukaan.\n2. Paista kana pannulla.\n3. Yhdista ainekset ja tarjoile.",
    );
  });

  it("splits numbered instruction text into clean steps", () => {
    const steps = splitRecipeInstructions("1. Kypsenna riisi.\n2. Paista kana.\n3. Tarjoile.");

    expect(steps).toEqual([
      "Kypsenna riisi.",
      "Paista kana.",
      "Tarjoile.",
    ]);
  });
});
