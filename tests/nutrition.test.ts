import { describe, expect, it } from "vitest";

import { cloneDemoState } from "@/lib/domain";
import {
  assignMealPlan,
  buildPersonalNutritionGoalComparison,
  buildRecipeGoalComparison,
  calculateMacroTarget,
  calculateRecipeNutrition,
  formatRecipeIngredientAmount,
  getActiveMealPlanForAthlete,
  getMealSlotGroupForTag,
  getMealSlotGroupKcalRange,
  getMealSlotKcalRange,
  getVisibleRecipesForUser,
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
    expect(target?.kcal).toBeGreaterThanOrEqual(2160);
    expect(target?.kcal).toBeLessThanOrEqual(2170);
    expect(target?.proteinG).toBeGreaterThanOrEqual(160);
    expect(target?.proteinG).toBeLessThanOrEqual(170);
    expect(target?.carbsG).toBeGreaterThanOrEqual(230);
    expect(target?.carbsG).toBeLessThanOrEqual(240);
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
    if (!comparison?.comparisonTargets) {
      throw new Error("Expected nutrition comparison targets");
    }
    expect(comparison.activeGoal).toBe("gain");
    expect(comparison.activeTarget.kcal).toBe(3200);
    expect(comparison.comparisonTargets.lose.kcal).toBeLessThan(comparison.comparisonTargets.maintain.kcal);
    expect(comparison.comparisonTargets.maintain.kcal).toBeLessThan(comparison.comparisonTargets.gain.kcal);
    expect(comparison.isEstimate).toBe(true);
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
    if (!comparison?.comparisonTargets) {
      throw new Error("Expected default comparison targets");
    }
    expect(comparison.activityLevel).toBe("high");
    expect(comparison.comparisonTargets.maintain.kcal).toBe(expectedMaintain?.kcal);
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

  it("formats recipe ingredient units for Finnish recipe display", () => {
    expect(formatRecipeIngredientAmount({ quantity: 2, unit: "pcs" }, 1)).toBe("2 kpl");
    expect(formatRecipeIngredientAmount({ quantity: 0.5, unit: "pcs", displayQuantity: "½", displayUnit: "kpl" }, 1)).toBe("½ kpl");
    expect(formatRecipeIngredientAmount({ quantity: 640, unit: "g", displayQuantity: "2", displayUnit: "pkt" }, 1)).toBe("2 pkt");
    expect(formatRecipeIngredientAmount({ quantity: 640, unit: "g", displayQuantity: "2", displayUnit: "pkt" }, 2)).toBe("4 pkt");
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

  it("falls back to ingredient names and aliases when recipe ingredient ids are missing", () => {
    const summary = calculateRecipeNutrition(
      {
        defaultServings: 1,
        ingredients: [
          {
            id: "missing_direct_id",
            ingredientName: "Kanan rintafilee",
            quantity: 200,
            unit: "g",
            ingredientRole: "main",
            scalingMode: "linear",
          },
          {
            id: "missing_alias_id",
            ingredientName: "Tortilla",
            quantity: 62,
            unit: "g",
            ingredientRole: "main",
            scalingMode: "linear",
          },
        ],
      },
      [
        {
          id: "ingredient_chicken",
          name: "Kanan rintafilee",
          source: "manual",
          ownerRole: "admin",
          createdBy: "admin_1",
          kcalPer100: 110,
          proteinPer100: 23.1,
          carbsPer100: 0,
          fatPer100: 1.2,
          createdAt: "2026-04-01T08:00:00.000Z",
          updatedAt: "2026-04-01T08:00:00.000Z",
        },
        {
          id: "ingredient_tortilla",
          name: "Tortilla original large",
          displayName: "Tortilla original large",
          source: "manual",
          ownerRole: "admin",
          createdBy: "admin_1",
          kcalPer100: 310,
          proteinPer100: 8,
          carbsPer100: 52,
          fatPer100: 7,
          createdAt: "2026-04-01T08:00:00.000Z",
          updatedAt: "2026-04-01T08:00:00.000Z",
        },
      ],
    );

    expect(summary.nutritionPerServing.kcal).toBeGreaterThan(400);
    expect(summary.nutritionPerServing.proteinG).toBeGreaterThan(45);
  });

  it("builds recipe goal comparison from active profile targets", () => {
    const comparison = buildRecipeGoalComparison(
      "lunch",
      {
        kcal: 500,
        proteinG: 50,
        carbsG: 60,
        fatG: 20,
      },
      {
        targetKcal: 2500,
        proteinG: 200,
        carbsG: 300,
        fatG: 80,
      },
    );

    expect(comparison).not.toBeNull();
    expect(comparison?.dailyShare.kcal).toBe(20);
    expect(comparison?.dailyShare.proteinG).toBe(25);
    expect(comparison?.dailyShare.carbsG).toBe(20);
    expect(comparison?.dailyShare.fatG).toBe(25);
    expect(comparison?.mealSlot.range).toEqual([625, 750]);
    expect(comparison?.mealSlot.status).toBe("below");
  });

  it("returns null recipe goal comparison when profile targets are missing", () => {
    const comparison = buildRecipeGoalComparison(
      "dinner",
      {
        kcal: 500,
        proteinG: 30,
        carbsG: 45,
        fatG: 15,
      },
      null,
    );

    expect(comparison).toBeNull();
  });

  it("resolves meal slot range boundaries and status safely", () => {
    const breakfastRange = getMealSlotKcalRange("breakfast", 2400);
    expect(breakfastRange).toEqual([360, 480]);
    expect(getMealSlotKcalRange("evening_snack", 2400)).toEqual(breakfastRange);
    expect(getMealSlotKcalRange("dinner", 2400)).toEqual(getMealSlotKcalRange("lunch", 2400));
    expect(getMealSlotGroupKcalRange("morning_evening", 2400)).toEqual([360, 480]);
    expect(getMealSlotGroupForTag("breakfast").id).toBe("morning_evening");
    expect(getMealSlotGroupForTag("evening_snack").id).toBe("morning_evening");

    const withinComparison = buildRecipeGoalComparison(
      "breakfast",
      {
        kcal: 360,
        proteinG: 30,
        carbsG: 40,
        fatG: 10,
      },
      {
        targetKcal: 2400,
        proteinG: 180,
        carbsG: 240,
        fatG: 80,
      },
    );
    const aboveComparison = buildRecipeGoalComparison(
      "breakfast",
      {
        kcal: 481,
        proteinG: 30,
        carbsG: 40,
        fatG: 10,
      },
      {
        targetKcal: 2400,
        proteinG: 180,
        carbsG: 240,
        fatG: 80,
      },
    );

    expect(withinComparison?.mealSlot.status).toBe("within");
    expect(aboveComparison?.mealSlot.status).toBe("above");
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

  it("limits recipe visibility to global, owned, coach-assigned and referenced recipes", () => {
    const state = cloneDemoState();
    const baseRecipe = state.recipes[0];
    if (!baseRecipe) {
      throw new Error("Expected demo recipe");
    }

    state.recipes = [
      ...state.recipes,
      { ...baseRecipe, id: "recipe_coach_visible", name: "Coachin resepti", ownerRole: "coach", createdBy: "user_coach_1" },
      { ...baseRecipe, id: "recipe_other_coach", name: "Toisen coachin resepti", ownerRole: "coach", createdBy: "user_coach_2" },
      { ...baseRecipe, id: "recipe_own_athlete", name: "Oma resepti", ownerRole: "athlete", createdBy: "user_athlete_1" },
      { ...baseRecipe, id: "recipe_other_athlete", name: "Toisen urheilijan resepti", ownerRole: "athlete", createdBy: "user_athlete_2" },
      { ...baseRecipe, id: "recipe_assigned_private", name: "Pohjassa viitattu", ownerRole: "coach", createdBy: "user_coach_2" },
      { ...baseRecipe, id: "recipe_day_private", name: "Paivassa viitattu", ownerRole: "athlete", createdBy: "user_athlete_2" },
    ];
    state.assignedMealPlans = state.assignedMealPlans.map((plan) =>
      plan.id === "assigned_meal_plan_1"
        ? {
            ...plan,
            items: [
              ...plan.items,
              { id: "assigned_meal_plan_item_private", mealTag: "snack", recipeId: "recipe_assigned_private", sortOrder: 10 },
            ],
          }
        : plan,
    );
    state.dayMealPlans = [
      {
        id: "day_meal_private",
        athleteId: "user_athlete_1",
        planDate: "2026-06-14",
        mealTag: "dinner",
        recipeId: "recipe_day_private",
        source: "added",
        servings: 1,
        position: 0,
        createdAt: "2026-06-14T08:00:00.000Z",
        updatedAt: "2026-06-14T08:00:00.000Z",
      },
    ];

    const visibleIds = getVisibleRecipesForUser(state, { id: "user_athlete_1", role: "athlete" }).map((recipe) => recipe.id);

    expect(visibleIds).toEqual(expect.arrayContaining([
      "recipe_chicken_rice",
      "recipe_skyr_oats",
      "recipe_coach_visible",
      "recipe_own_athlete",
      "recipe_assigned_private",
      "recipe_day_private",
    ]));
    expect(visibleIds).not.toContain("recipe_other_coach");
    expect(visibleIds).not.toContain("recipe_other_athlete");
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
