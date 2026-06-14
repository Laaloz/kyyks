import { makeId } from "@/lib/utils";
import type {
  AssignedMealPlan,
  AssignedMealPlanInput,
  AppState,
  Ingredient,
  IngredientInput,
  IngredientUnit,
  IngredientScalingMode,
  MacroTarget,
  MealPlanTemplate,
  MealPlanTemplateInput,
  MealTag,
  NutritionActivityLevel,
  NutritionOwnerRole,
  NutritionProfile,
  NutritionProfileInput,
  NutritionGoal,
  ProfileSex,
  Recipe,
  RecipeIngredient,
  RecipeInput,
  UserProfile,
} from "@/lib/types";

export type PersonalNutritionGoalComparison = {
  activeGoal: NutritionGoal;
  activeTarget: MacroTarget;
  activeTargetSource: "profile" | "auto_fallback";
  comparisonTargets: Record<NutritionGoal, MacroTarget> | null;
  guidanceByGoal: Record<NutritionGoal, string>;
  activityLevel: NutritionActivityLevel;
  hasCompleteProfile: boolean;
  missingFields: Array<"age" | "sex" | "heightCm" | "weightKg">;
  isEstimate: boolean;
  hasNutritionProfile: boolean;
  calculationMode?: NutritionProfile["calculationMode"];
};

export type RecipeCompatibilityAlert = {
  key: string;
  category: "allergy" | "dietary";
  label: string;
  matchedIngredients: string[];
};

export type MealSlotKcalStatus = "below" | "within" | "above";
export type MealSlotGroupId = "morning_evening" | "main" | "snack";

export type MealSlotGroup = {
  id: MealSlotGroupId;
  label: string;
  shortLabel: string;
  description: string;
  dailySlots: number;
  tags: readonly MealTag[];
};

export type RecipeGoalComparison = {
  dailyShare: {
    kcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  };
  mealSlot: {
    range: readonly [number, number];
    status: MealSlotKcalStatus;
  };
};

export const mealSlotGroups: readonly MealSlotGroup[] = [
  {
    id: "morning_evening",
    label: "Aamu / iltapala",
    shortLabel: "Aamu/ilta",
    description: "Aamupala ja iltapala jakavat saman kcal-haarukan, joten niitä voi vaihtaa keskenään.",
    dailySlots: 2,
    tags: ["breakfast", "evening_snack"],
  },
  {
    id: "main",
    label: "Lounas / illallinen",
    shortLabel: "Lounas/illallinen",
    description: "Lounas ja illallinen ovat saman kokoisia pääaterioita ja toimivat ristiin.",
    dailySlots: 2,
    tags: ["lunch", "dinner"],
  },
  {
    id: "snack",
    label: "Välipalat",
    shortLabel: "Välipalat",
    description: "Välipalat pidetään omassa kevyemmässä vaihtoryhmässään.",
    dailySlots: 1,
    tags: ["snack"],
  },
] as const;

const mealSlotGroupRanges: Record<MealSlotGroupId, [number, number]> = {
  morning_evening: [0.15, 0.2],
  main: [0.25, 0.3],
  snack: [0.1, 0.15],
};

const ingredientNameAliases: Record<string, readonly string[]> = {
  "100 kauraleipa": ["100% kauraleipä", "kauraleipä"],
  "aamupala kevyenraikas 5 sulatejuustoviipale": ["sulatejuustoviipale", "juusto alle 10%"],
  "bbq kastike ilman lisattya sokeria": ["bbq-kastike ilman lisättyä sokeria"],
  "jaavuorisalaatti": ["jäävuorisalaatti"],
  "jasmiiniriisi kuiva": ["riisi", "basmatiriisi"],
  "kevyt juustoraaste 12": ["juustoraaste 12%", "kadett lempeä 12% juustoraaste"],
  "kevyt juusto": ["juusto 17%", "juusto alle 10%"],
  "kot go kanafileepyorykat": ["kanafileepyörykät", "kanapyörykät"],
  "maapahkinavoi 99": ["maapähkinävoi"],
  "maissikakku chian siemenia ja suolaa friggs": ["maissikakku", "riisikakku"],
  "margariini alle 50 rasvaa": ["margariini"],
  "naudan jauheliha 10": ["jauheliha 10%", "naudan jauheliha max 10%"],
  "naudan paistijauheliha 5": ["naudan jauheliha 5%", "paistijauheliha 5%"],
  "oliivioljy": ["oliiviöljy"],
  "profeel proteiinirahka": ["proteiinirahka", "rahka"],
  "profeel proteiinivanukas": ["proteiinivanukas"],
  "profeel proteiinivanukas suklaa": ["proteiinivanukas suklaa", "profeel proteiinivanukas"],
  "proteiinijuoma vahasokerinen": ["proteiinijuoma vähäsokerinen"],
  "proteiinirahka maustamaton": ["rahka maustamaton", "rahka"],
  "rasvaton maito": ["maito rasvaton"],
  "ruisleipa": ["ruisleipä", "ruispalat"],
  "skyr wanhanajan vanilja": ["skyr vanilja", "skyr"],
  "skyrdrik": ["skyr drink", "proteiinijuoma"],
  "sweet chili kastike vahemman sokeria": ["sweet chili -kastike vähemmän sokeria", "sweet chili kastike"],
  "taysjyvaleipa": ["täysjyväleipä"],
  "tonnikala vedessa": ["tonnikala vedessä", "tonnikala"],
  "tortilla": ["tortilla original large", "tortilla large"],
  "tortilla original large": ["tortilla", "tortilla large"],
  "vahasukerinen mysli": ["vähäsokerinen mysli", "mysli"],
  "vahasokerinen granola": ["vähäsokerinen granola", "granola"],
};

function nowIso() {
  return new Date().toISOString();
}

export function splitRecipeInstructions(instructions: string) {
  const normalized = instructions
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^(?:\d+[.)]|[-*])\s+/, "").trim())
    .filter(Boolean);

  if (normalized.length > 1) {
    return normalized;
  }

  const sentenceBased = instructions
    .split(/(?<=[.!?])\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  return sentenceBased.length > 0 ? sentenceBased : [""];
}

export function joinRecipeInstructionSteps(steps: string[]) {
  const sanitized = steps
    .map((step) => step.trim())
    .filter(Boolean);

  if (sanitized.length === 0) {
    return "";
  }

  return sanitized.map((step, index) => `${index + 1}. ${step}`).join("\n");
}

function roundNutrition(value: number) {
  return Math.round(value * 10) / 10;
}

function calculateNutritionShare(value: number, target: number) {
  if (target <= 0) {
    return 0;
  }

  return roundNutrition((value / target) * 100);
}

function normalizeFoodText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeIngredientLookupText(value: string) {
  return normalizeFoodText(value)
    .replace(/[%]/g, " ")
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

type IngredientCatalogLookupItem = Pick<Ingredient, "id" | "name" | "displayName">;

function getIngredientLookupCandidates(value: string | undefined) {
  if (!value?.trim()) {
    return [];
  }

  const normalized = normalizeIngredientLookupText(value);
  return [normalized, ...(ingredientNameAliases[normalized] ?? []).map((alias) => normalizeIngredientLookupText(alias))]
    .filter(Boolean);
}

export function resolveIngredientCatalogMatch<TIngredient extends IngredientCatalogLookupItem>(
  recipeIngredient: Pick<RecipeIngredient, "ingredientId" | "ingredientName">,
  ingredients: TIngredient[],
) {
  if (recipeIngredient.ingredientId) {
    const matchById = ingredients.find((ingredient) => ingredient.id === recipeIngredient.ingredientId);
    if (matchById) {
      return matchById;
    }
  }

  const candidates = getIngredientLookupCandidates(recipeIngredient.ingredientName);
  if (candidates.length === 0) {
    return undefined;
  }

  const ingredientByName = new Map<string, TIngredient>();
  for (const ingredient of ingredients) {
    ingredientByName.set(normalizeIngredientLookupText(ingredient.name), ingredient);
    if (ingredient.displayName?.trim()) {
      ingredientByName.set(normalizeIngredientLookupText(ingredient.displayName), ingredient);
    }
  }

  for (const candidate of candidates) {
    const directMatch = ingredientByName.get(candidate);
    if (directMatch) {
      return directMatch;
    }
  }

  return undefined;
}

export function mealTagLabel(mealTag: MealTag) {
  switch (mealTag) {
    case "breakfast":
      return "Aamupala";
    case "lunch":
      return "Lounas";
    case "snack":
      return "Välipala";
    case "dinner":
      return "Illallinen";
    case "evening_snack":
      return "Iltapala";
  }
}

export function getMealSlotGroupForTag(mealTag: MealTag) {
  return mealSlotGroups.find((group) => group.tags.includes(mealTag)) ?? mealSlotGroups[2];
}

export function getMealSlotGroupKcalRange(groupId: MealSlotGroupId, targetKcal?: number) {
  if (!targetKcal || targetKcal <= 0) {
    return null;
  }

  const [minRatio, maxRatio] = mealSlotGroupRanges[groupId];
  return [Math.round(targetKcal * minRatio), Math.round(targetKcal * maxRatio)] as const;
}

export function getMealSlotKcalRange(mealTag: MealTag, targetKcal?: number) {
  return getMealSlotGroupKcalRange(getMealSlotGroupForTag(mealTag).id, targetKcal);
}

function resolveMealSlotKcalStatus(kcal: number, range: readonly [number, number]): MealSlotKcalStatus {
  if (kcal < range[0]) {
    return "below";
  }

  if (kcal > range[1]) {
    return "above";
  }

  return "within";
}

export function getMacroGoalGuidance(goal: NutritionGoal) {
  switch (goal) {
    case "lose":
      return "Pudotuksessa energia pidetään maltillisesti miinuksella, proteiini korkealla ja hiilarit riittävän ylhäällä treenin tueksi.";
    case "maintain":
      return "Ylläpidossa tavoite on vakaa painotrendi, hyvä treeniteho ja makrot jotka ovat helppo pitää arjessa tasaisina.";
    case "gain":
      return "Kasvatuksessa energia nostetaan maltillisesti ylös, jotta paino nousee hallitusti ilman turhan aggressiivista ylisyöntiä.";
  }
}

export function calculateMacroTarget(input: {
  age?: number;
  heightCm?: number;
  weightKg?: number;
  sex?: ProfileSex;
  goal: NutritionGoal;
  activityLevel: NutritionActivityLevel;
}): MacroTarget | null {
  const weightKg = input.weightKg;
  const heightCm = input.heightCm;
  const age = input.age;
  const sex = input.sex;
  if (!weightKg || !heightCm || !age || !sex) {
    return null;
  }

  const bmr =
    sex === "male"
      ? 10 * weightKg + 6.25 * heightCm - 5 * age + 5
      : sex === "female"
        ? 10 * weightKg + 6.25 * heightCm - 5 * age - 161
        : 10 * weightKg + 6.25 * heightCm - 5 * age - 78;

  const activityMultiplier = {
    low: 1.2,
    moderate: 1.3,
    high: 1.45,
  }[input.activityLevel];

  const goalAdjustment = {
    lose: 0.85,
    maintain: 1,
    gain: 1.08,
  }[input.goal];

  const targetKcal = Math.max(
    1200,
    Math.round(bmr * activityMultiplier * goalAdjustment),
  );

  const proteinPerKg = {
    lose: 1.65,
    maintain: 1.75,
    gain: 1.85,
  }[input.goal];
  const fatPerKg = {
    lose: 0.66,
    maintain: 0.76,
    gain: 0.82,
  }[input.goal];

  const proteinG = Math.max(90, roundNutrition(weightKg * proteinPerKg));
  const fatG = Math.max(45, roundNutrition(weightKg * fatPerKg));
  const remainingKcal = Math.max(0, targetKcal - proteinG * 4 - fatG * 9);
  const carbsG = roundNutrition(remainingKcal / 4);

  return {
    kcal: targetKcal,
    proteinG,
    carbsG,
    fatG,
  };
}

export function getMissingMacroProfileFields(user: Pick<UserProfile, "age" | "sex" | "heightCm" | "weightKg">) {
  const missing: Array<"age" | "sex" | "heightCm" | "weightKg"> = [];

  if (!user.age) {
    missing.push("age");
  }
  if (!user.sex) {
    missing.push("sex");
  }
  if (!user.heightCm) {
    missing.push("heightCm");
  }
  if (!user.weightKg) {
    missing.push("weightKg");
  }

  return missing;
}

export function buildPersonalNutritionGoalComparison(
  user: Pick<UserProfile, "age" | "sex" | "heightCm" | "weightKg">,
  nutritionProfile?: Pick<
    NutritionProfile,
    "goal" | "activityLevel" | "targetKcal" | "proteinG" | "carbsG" | "fatG" | "calculationMode"
  > | null,
): PersonalNutritionGoalComparison | null {
  const missingFields = getMissingMacroProfileFields(user);
  const hasCompleteProfile = missingFields.length === 0;
  const activityLevel = nutritionProfile?.activityLevel ?? "high";
  const comparisonTargets = {
    lose: calculateMacroTarget({
      age: user.age,
      heightCm: user.heightCm,
      weightKg: user.weightKg,
      sex: user.sex,
      goal: "lose",
      activityLevel,
    }),
    maintain: calculateMacroTarget({
      age: user.age,
      heightCm: user.heightCm,
      weightKg: user.weightKg,
      sex: user.sex,
      goal: "maintain",
      activityLevel,
    }),
    gain: calculateMacroTarget({
      age: user.age,
      heightCm: user.heightCm,
      weightKg: user.weightKg,
      sex: user.sex,
      goal: "gain",
      activityLevel,
    }),
  } satisfies Record<NutritionGoal, MacroTarget | null>;

  const guidanceByGoal = {
    lose: getMacroGoalGuidance("lose"),
    maintain: getMacroGoalGuidance("maintain"),
    gain: getMacroGoalGuidance("gain"),
  } satisfies Record<NutritionGoal, string>;

  if (!comparisonTargets.lose || !comparisonTargets.maintain || !comparisonTargets.gain) {
    if (!nutritionProfile) {
      return null;
    }

    return {
      activeGoal: nutritionProfile.goal,
      activeTarget: {
        kcal: nutritionProfile.targetKcal,
        proteinG: nutritionProfile.proteinG,
        carbsG: nutritionProfile.carbsG,
        fatG: nutritionProfile.fatG,
      },
      activeTargetSource: "profile",
      comparisonTargets: null,
      guidanceByGoal,
      activityLevel,
      hasCompleteProfile,
      missingFields,
      isEstimate: true,
      hasNutritionProfile: true,
      calculationMode: nutritionProfile.calculationMode,
    };
  }

  const activeGoal = nutritionProfile?.goal ?? "maintain";
  const resolvedComparisonTargets: Record<NutritionGoal, MacroTarget> = {
    lose: comparisonTargets.lose,
    maintain: comparisonTargets.maintain,
    gain: comparisonTargets.gain,
  };
  const activeTarget =
    nutritionProfile
      ? {
          kcal: nutritionProfile.targetKcal,
          proteinG: nutritionProfile.proteinG,
          carbsG: nutritionProfile.carbsG,
          fatG: nutritionProfile.fatG,
        }
      : resolvedComparisonTargets[activeGoal];

  return {
    activeGoal,
    activeTarget,
    activeTargetSource: nutritionProfile ? "profile" : "auto_fallback",
    comparisonTargets: resolvedComparisonTargets,
    guidanceByGoal,
    activityLevel,
    hasCompleteProfile,
    missingFields,
    isEstimate: !nutritionProfile || !hasCompleteProfile || nutritionProfile.calculationMode === "manual_override",
    hasNutritionProfile: Boolean(nutritionProfile),
    calculationMode: nutritionProfile?.calculationMode,
  };
}

function resolveIngredientNutritionContribution(
  ingredient: Ingredient | undefined,
  recipeIngredient: RecipeIngredient,
  servings: number,
) {
  if (!ingredient || recipeIngredient.scalingMode === "text_only") {
    return { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
  }

  const baseQuantity = recipeIngredient.normalizedQuantity ?? recipeIngredient.quantity ?? 0;
  const quantity = baseQuantity * getIngredientScalingRatio(recipeIngredient.scalingMode, servings, 1);
  const multiplier = quantity / 100;

  return {
    kcal: ingredient.kcalPer100 * multiplier,
    proteinG: ingredient.proteinPer100 * multiplier,
    carbsG: ingredient.carbsPer100 * multiplier,
    fatG: ingredient.fatPer100 * multiplier,
  };
}

function getIngredientScalingRatio(
  scalingMode: IngredientScalingMode,
  servings: number,
  defaultServings: number,
) {
  const safeDefaultServings = defaultServings > 0 ? defaultServings : 1;
  const ratio = servings > 0 ? servings / safeDefaultServings : 1;

  switch (scalingMode) {
    case "linear":
      return ratio;
    case "gentle":
      return ratio >= 1 ? 1 + (ratio - 1) * 0.5 : ratio;
    case "fixed":
    case "text_only":
      return 1;
  }
}

export function scaleRecipeIngredient(
  ingredient: RecipeIngredient,
  servings: number,
  defaultServings: number,
) {
  const ratio = getIngredientScalingRatio(ingredient.scalingMode, servings, defaultServings);
  const isScalable = ingredient.scalingMode === "linear" || ingredient.scalingMode === "gentle";
  const sourceQuantity = ingredient.quantity ?? ingredient.normalizedQuantity;
  const scaledQuantity = sourceQuantity !== undefined && isScalable ? roundNutrition(sourceQuantity * ratio) : sourceQuantity;
  const displayQuantityNumber = ingredient.displayQuantity ? Number(ingredient.displayQuantity.replace(",", ".")) : Number.NaN;
  const scaledDisplayQuantity =
    isScalable && Number.isFinite(displayQuantityNumber)
      ? String(roundNutrition(displayQuantityNumber * ratio))
      : ingredient.displayQuantity;

  return {
    ...ingredient,
    quantity: scaledQuantity,
    displayQuantity: scaledDisplayQuantity,
    normalizedQuantity:
      ingredient.normalizedQuantity !== undefined && isScalable
        ? roundNutrition(ingredient.normalizedQuantity * ratio)
        : ingredient.normalizedQuantity,
  };
}

export function resolveRecipeIngredientNormalizedQuantity(
  quantity: number | undefined,
  unit: IngredientUnit,
  ingredient?: Pick<Ingredient, "gramsPerUnit">,
) {
  if (quantity === undefined) {
    return undefined;
  }

  if (unit === "pcs" && ingredient?.gramsPerUnit) {
    return roundNutrition(quantity * ingredient.gramsPerUnit);
  }

  return quantity;
}

export function calculateRecipeNutrition(
  recipe: Pick<Recipe, "defaultServings" | "ingredients">,
  ingredients: Ingredient[],
) {
  const ingredientById = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));
  const totals = recipe.ingredients.reduce(
    (sum, item) => {
      const ingredient = item.ingredientId
        ? ingredientById.get(item.ingredientId) ?? resolveIngredientCatalogMatch(item, ingredients)
        : resolveIngredientCatalogMatch(item, ingredients);
      const contribution = resolveIngredientNutritionContribution(
        ingredient,
        item,
        1,
      );
      return {
        kcal: sum.kcal + contribution.kcal,
        proteinG: sum.proteinG + contribution.proteinG,
        carbsG: sum.carbsG + contribution.carbsG,
        fatG: sum.fatG + contribution.fatG,
      };
    },
    { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );

  const servings = recipe.defaultServings > 0 ? recipe.defaultServings : 1;
  return {
    nutritionPerRecipe: {
      servings,
      kcal: Math.round(totals.kcal),
      proteinG: roundNutrition(totals.proteinG),
      carbsG: roundNutrition(totals.carbsG),
      fatG: roundNutrition(totals.fatG),
    },
    nutritionPerServing: {
      servings: 1,
      kcal: Math.round(totals.kcal / servings),
      proteinG: roundNutrition(totals.proteinG / servings),
      carbsG: roundNutrition(totals.carbsG / servings),
      fatG: roundNutrition(totals.fatG / servings),
    },
  };
}

function hasMeaningfulNutrition(value: Pick<MacroTarget, "kcal" | "proteinG" | "carbsG" | "fatG"> | null | undefined) {
  if (!value) {
    return false;
  }

  return value.kcal > 0 || value.proteinG > 0 || value.carbsG > 0 || value.fatG > 0;
}

function hasCompleteMacroTarget(value: Pick<MacroTarget, "kcal" | "proteinG" | "carbsG" | "fatG"> | null | undefined) {
  if (!value) {
    return false;
  }

  return value.kcal > 0 && value.proteinG > 0 && value.carbsG > 0 && value.fatG > 0;
}

function hasCompleteNutritionProfileTarget(
  value: Pick<NutritionProfile, "targetKcal" | "proteinG" | "carbsG" | "fatG"> | null | undefined,
): value is Pick<NutritionProfile, "targetKcal" | "proteinG" | "carbsG" | "fatG"> {
  if (!value) {
    return false;
  }

  return value.targetKcal > 0 && value.proteinG > 0 && value.carbsG > 0 && value.fatG > 0;
}

export function resolveRecipeNutritionPreview(
  recipe: Pick<Recipe, "defaultServings" | "ingredients" | "nutritionPerServing" | "nutritionPerRecipe">,
  ingredients: Ingredient[],
) {
  const calculated = calculateRecipeNutrition(recipe, ingredients);
  const cachedPerServing = recipe.nutritionPerServing;
  const cachedPerRecipe = recipe.nutritionPerRecipe;

  const useCalculatedPerServing =
    !hasMeaningfulNutrition(cachedPerServing) && hasMeaningfulNutrition(calculated.nutritionPerServing);
  const useCalculatedPerRecipe =
    !hasMeaningfulNutrition(cachedPerRecipe) && hasMeaningfulNutrition(calculated.nutritionPerRecipe);

  return {
    nutritionPerServing: useCalculatedPerServing ? calculated.nutritionPerServing : cachedPerServing ?? calculated.nutritionPerServing,
    nutritionPerRecipe: useCalculatedPerRecipe ? calculated.nutritionPerRecipe : cachedPerRecipe ?? calculated.nutritionPerRecipe,
  };
}

export function buildRecipeGoalComparison(
  mealTag: MealTag,
  nutritionPerServing: Pick<MacroTarget, "kcal" | "proteinG" | "carbsG" | "fatG">,
  nutritionProfile?: Pick<NutritionProfile, "targetKcal" | "proteinG" | "carbsG" | "fatG"> | null,
): RecipeGoalComparison | null {
  if (!hasCompleteNutritionProfileTarget(nutritionProfile)) {
    return null;
  }

  const profile = nutritionProfile;
  const mealSlotRange = getMealSlotKcalRange(mealTag, profile.targetKcal);
  if (!mealSlotRange) {
    return null;
  }

  return {
    dailyShare: {
      kcal: calculateNutritionShare(nutritionPerServing.kcal, profile.targetKcal),
      proteinG: calculateNutritionShare(nutritionPerServing.proteinG, profile.proteinG),
      carbsG: calculateNutritionShare(nutritionPerServing.carbsG, profile.carbsG),
      fatG: calculateNutritionShare(nutritionPerServing.fatG, profile.fatG),
    },
    mealSlot: {
      range: mealSlotRange,
      status: resolveMealSlotKcalStatus(nutritionPerServing.kcal, mealSlotRange),
    },
  };
}

function findMatchedIngredientNames(ingredientNames: string[], keywords: readonly string[]) {
  const normalizedKeywords = keywords.map((keyword) => normalizeFoodText(keyword));
  return ingredientNames.filter((ingredientName) =>
    normalizedKeywords.some((keyword) => ingredientName.includes(keyword)),
  );
}

export function getRecipeCompatibilityAlerts(
  recipe: Pick<Recipe, "ingredients" | "dietaryFlags" | "allergies">,
  profile?: Pick<NutritionProfile, "dietaryFlags" | "allergies"> | null,
) {
  if (!profile) {
    return [] as RecipeCompatibilityAlert[];
  }

  const ingredientNames = recipe.ingredients
    .map((ingredient) => normalizeFoodText(ingredient.ingredientName))
    .filter(Boolean);

  if (ingredientNames.length === 0) {
    return [] as RecipeCompatibilityAlert[];
  }

  const alerts: RecipeCompatibilityAlert[] = [];
  const explicitAllergies = new Set(recipe.allergies ?? []);
  const explicitDietaryFlags = new Set(recipe.dietaryFlags ?? []);

  const allergyRules: Record<string, readonly string[]> = {
    maito: ["maito", "juusto", "jogurtti", "rahka", "raejuusto", "tuorejuusto", "kerma", "mozzarella", "feta", "parmesan", "skyr"],
    kananmuna: ["kananmuna", "muna", "valkuainen"],
    kala: ["kala", "lohi", "tonnikala"],
    äyriäiset: ["ayriainen", "katkarapu", "rapu", "shrimp"],
    pähkinä: ["pahkina", "manteli", "cashew", "maapahkina", "pekaanipahkina", "saksanpahkina"],
    soija: ["soija", "tofu", "soijakastike"],
    seesami: ["seesami", "tahini"],
  };

  for (const allergy of profile.allergies ?? []) {
    const matchedIngredients = findMatchedIngredientNames(ingredientNames, allergyRules[allergy] ?? [allergy]);
    if (explicitAllergies.has(allergy) || matchedIngredients.length > 0) {
      alerts.push({
        key: `allergy-${allergy}`,
        category: "allergy",
        label: `Mahdollinen allergeeniriski: ${allergy}`,
        matchedIngredients: matchedIngredients.length > 0 ? matchedIngredients : [allergy],
      });
    }
  }

  const dietaryRules: Record<string, readonly string[]> = {
    laktoositon: ["maito", "jogurtti", "rahka", "raejuusto", "tuorejuusto", "kerma", "skyr"],
    maidoton: ["maito", "juusto", "jogurtti", "rahka", "raejuusto", "tuorejuusto", "kerma", "mozzarella", "feta", "parmesan", "skyr"],
    gluteeniton: ["pasta", "spaghetti", "makaroni", "tortilla", "leipa", "ruisleipa", "mysli", "granola", "couscous"],
    kasvis: ["kana", "broileri", "kalkkuna", "jauheliha", "nauta", "liha", "lohi", "tonnikala", "kala"],
    vegaaninen: ["kana", "broileri", "kalkkuna", "jauheliha", "nauta", "liha", "lohi", "tonnikala", "kala", "kananmuna", "muna", "maito", "juusto", "jogurtti", "rahka", "raejuusto", "tuorejuusto", "kerma", "hunaja"],
    halal: ["kinkku", "pekoni", "bacon", "porsas", "sika", "salami"],
  };

  for (const flag of profile.dietaryFlags ?? []) {
    const matchedIngredients = findMatchedIngredientNames(ingredientNames, dietaryRules[flag] ?? []);
    if (explicitDietaryFlags.has(flag) || matchedIngredients.length > 0) {
      alerts.push({
        key: `dietary-${flag}`,
        category: "dietary",
        label: `Mahdollinen ristiriita ruokavalion kanssa: ${flag}`,
        matchedIngredients: matchedIngredients.length > 0 ? matchedIngredients : [flag],
      });
    }
  }

  return alerts;
}

export function upsertNutritionProfile(
  state: AppState,
  actorId: string,
  input: NutritionProfileInput,
) {
  const timestamp = nowIso();
  const current = state.nutritionProfiles.find((profile) => profile.userId === input.userId);
  const user = state.users.find((candidate) => candidate.id === input.userId);
  const calculatedTarget = calculateMacroTarget({
    age: user?.age,
    heightCm: user?.heightCm,
    weightKg: user?.weightKg,
    sex: user?.sex,
    goal: input.goal,
    activityLevel: input.activityLevel,
  });

  const nextTarget =
    input.calculationMode === "manual_override"
      ? {
          kcal: input.targetKcal ?? current?.targetKcal ?? calculatedTarget?.kcal ?? 2000,
          proteinG: input.proteinG ?? current?.proteinG ?? calculatedTarget?.proteinG ?? 140,
          carbsG: input.carbsG ?? current?.carbsG ?? calculatedTarget?.carbsG ?? 220,
          fatG: input.fatG ?? current?.fatG ?? calculatedTarget?.fatG ?? 70,
        }
      : {
          kcal: calculatedTarget?.kcal ?? current?.targetKcal ?? 2000,
          proteinG: calculatedTarget?.proteinG ?? current?.proteinG ?? 140,
          carbsG: calculatedTarget?.carbsG ?? current?.carbsG ?? 220,
          fatG: calculatedTarget?.fatG ?? current?.fatG ?? 70,
        };

  const nextProfile: NutritionProfile = {
    id: current?.id ?? makeId("nutrition_profile"),
    userId: input.userId,
    goal: input.goal,
    activityLevel: input.activityLevel,
    mealsPerDay: input.mealsPerDay,
    targetKcal: nextTarget.kcal,
    proteinG: nextTarget.proteinG,
    carbsG: nextTarget.carbsG,
    fatG: nextTarget.fatG,
    calculationMode: input.calculationMode,
    coachNotes: input.coachNotes?.trim() || undefined,
    dietaryFlags: input.dietaryFlags ?? current?.dietaryFlags ?? [],
    allergies: input.allergies ?? current?.allergies ?? [],
    createdBy: current?.createdBy ?? actorId,
    updatedBy: actorId,
    createdAt: current?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };

  return {
    ...state,
    nutritionProfiles: current
      ? state.nutritionProfiles.map((profile) => (profile.id === current.id ? nextProfile : profile))
      : [nextProfile, ...state.nutritionProfiles],
  };
}

export function upsertIngredient(state: AppState, actorId: string, input: IngredientInput) {
  const timestamp = nowIso();
  const current = input.id ? state.ingredientsCatalog.find((ingredient) => ingredient.id === input.id) : undefined;
  const nextIngredient: Ingredient = {
    id: current?.id ?? makeId("ingredient"),
    name: input.name.trim(),
    displayName: input.displayName?.trim() || undefined,
    source: input.source,
    sourceExternalId: input.sourceExternalId?.trim() || undefined,
    ownerRole: "admin",
    createdBy: current?.createdBy ?? actorId,
    defaultPurchaseUnit: input.defaultPurchaseUnit,
    gramsPerUnit: input.gramsPerUnit,
    kcalPer100: input.kcalPer100,
    proteinPer100: input.proteinPer100,
    carbsPer100: input.carbsPer100,
    fatPer100: input.fatPer100,
    createdAt: current?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };

  return {
    ...state,
    ingredientsCatalog: current
      ? state.ingredientsCatalog.map((ingredient) => (ingredient.id === current.id ? nextIngredient : ingredient))
      : [nextIngredient, ...state.ingredientsCatalog],
  };
}

export function deleteIngredientFromCatalog(state: AppState, ingredientId: string) {
  return {
    ...state,
    ingredientsCatalog: state.ingredientsCatalog.filter((ingredient) => ingredient.id !== ingredientId),
    recipes: state.recipes.map((recipe) => ({
      ...recipe,
      ingredients: recipe.ingredients.map((ingredient) =>
        ingredient.ingredientId === ingredientId ? { ...ingredient, ingredientId: undefined } : ingredient,
      ),
    })),
  };
}

export function upsertRecipe(
  state: AppState,
  actorId: string,
  input: RecipeInput,
  ownerRole: NutritionOwnerRole = "admin",
) {
  const timestamp = nowIso();
  const current = input.id ? state.recipes.find((recipe) => recipe.id === input.id) : undefined;
  const nextRecipeBase: Recipe = {
    id: current?.id ?? makeId("recipe"),
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
    instructions: input.instructions.trim(),
    mealTag: input.mealTag,
    dietaryFlags: input.dietaryFlags ?? current?.dietaryFlags ?? [],
    allergies: input.allergies ?? current?.allergies ?? [],
    ownerRole: current?.ownerRole ?? ownerRole,
    createdBy: current?.createdBy ?? actorId,
    defaultServings: input.defaultServings,
    minServings: input.minServings,
    maxServings: input.maxServings,
    ingredients: input.ingredients.map((ingredient) => {
      const catalogIngredient = ingredient.ingredientId
        ? state.ingredientsCatalog.find((item) => item.id === ingredient.ingredientId)
        : undefined;
      return {
        id: makeId("recipe_ingredient"),
        ingredientId: ingredient.ingredientId,
        ingredientName: ingredient.ingredientName?.trim() || "",
        groupLabel: ingredient.groupLabel?.trim() || undefined,
        quantity: ingredient.quantity,
        unit: ingredient.unit,
        displayQuantity: ingredient.displayQuantity?.trim() || undefined,
        displayUnit: ingredient.displayUnit?.trim() || undefined,
        normalizedQuantity: resolveRecipeIngredientNormalizedQuantity(ingredient.quantity, ingredient.unit, catalogIngredient),
        ingredientRole: ingredient.ingredientRole,
        scalingMode: ingredient.scalingMode,
      };
    }),
    createdAt: current?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
  const nutrition = calculateRecipeNutrition(nextRecipeBase, state.ingredientsCatalog);
  const nextRecipe: Recipe = {
    ...nextRecipeBase,
    ...nutrition,
  };

  return {
    ...state,
    recipes: current
      ? state.recipes.map((recipe) => (recipe.id === current.id ? nextRecipe : recipe))
      : [nextRecipe, ...state.recipes],
  };
}

export function recipeUsageSummary(state: AppState, recipeId: string) {
  const templateCount = state.mealPlanTemplates.filter((template) =>
    template.items.some((item) => item.recipeId === recipeId),
  ).length;
  const assignedPlanCount = state.assignedMealPlans.filter((plan) =>
    plan.items.some((item) => item.recipeId === recipeId),
  ).length;

  return {
    templateCount,
    assignedPlanCount,
    inUse: templateCount > 0 || assignedPlanCount > 0,
  };
}

export function removeRecipe(state: AppState, recipeId: string) {
  return {
    ...state,
    recipes: state.recipes.filter((recipe) => recipe.id !== recipeId),
  };
}

export function upsertMealPlanTemplate(state: AppState, actorId: string, input: MealPlanTemplateInput) {
  const timestamp = nowIso();
  const current = input.id ? state.mealPlanTemplates.find((template) => template.id === input.id) : undefined;
  const nextTemplate: MealPlanTemplate = {
    id: current?.id ?? makeId("meal_template"),
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
    ownerRole: "admin",
    createdBy: current?.createdBy ?? actorId,
    items: input.items.map((item) => ({
      id: makeId("meal_template_item"),
      mealTag: item.mealTag,
      recipeId: item.recipeId,
      sortOrder: item.sortOrder,
    })),
    createdAt: current?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };

  return {
    ...state,
    mealPlanTemplates: current
      ? state.mealPlanTemplates.map((template) => (template.id === current.id ? nextTemplate : template))
      : [nextTemplate, ...state.mealPlanTemplates],
    assignedMealPlans: current
      ? state.assignedMealPlans.map((plan) =>
          plan.templateId === current.id && plan.active
            ? {
                ...plan,
                name: nextTemplate.name,
                items: nextTemplate.items.map((item) => ({
                  id: makeId("assigned_meal_plan_item"),
                  mealTag: item.mealTag,
                  recipeId: item.recipeId,
                  sortOrder: item.sortOrder,
                })),
                updatedAt: timestamp,
              }
            : plan,
        )
      : state.assignedMealPlans,
  };
}

export function assignMealPlan(state: AppState, actorId: string, input: AssignedMealPlanInput) {
  const template = state.mealPlanTemplates.find((candidate) => candidate.id === input.templateId);
  if (!template) {
    return state;
  }

  const timestamp = nowIso();
  const nextAssigned: AssignedMealPlan = {
    id: makeId("assigned_meal_plan"),
    athleteId: input.athleteId,
    templateId: template.id,
    assignedBy: actorId,
    name: template.name,
    items: template.items.map((item) => ({
      id: makeId("assigned_meal_plan_item"),
      mealTag: item.mealTag,
      recipeId: item.recipeId,
      sortOrder: item.sortOrder,
    })),
    active: true,
    assignedAt: timestamp,
    updatedAt: timestamp,
  };

  return {
    ...state,
    assignedMealPlans: [
      nextAssigned,
      ...state.assignedMealPlans.map((plan) =>
        plan.athleteId === input.athleteId ? { ...plan, active: false, updatedAt: timestamp } : plan,
      ),
    ],
  };
}

export function getActiveMealPlanForAthlete(state: AppState, athleteId: string) {
  return state.assignedMealPlans.find((plan) => plan.athleteId === athleteId && plan.active) ?? null;
}

export function getVisibleRecipesForUser(state: AppState, user: Pick<UserProfile, "id" | "role"> | null | undefined) {
  if (!user) {
    return [];
  }

  if (user.role === "admin") {
    return state.recipes;
  }

  const referencedRecipeIds = new Set<string>();
  for (const entry of state.dayMealPlans ?? []) {
    if (entry.athleteId === user.id) {
      referencedRecipeIds.add(entry.recipeId);
    }
  }
  for (const plan of state.assignedMealPlans) {
    if (plan.athleteId === user.id && plan.active) {
      for (const item of plan.items) {
        referencedRecipeIds.add(item.recipeId);
      }
    }
  }

  const activeCoachIds = new Set(
    state.assignments
      .filter((assignment) => assignment.athleteId === user.id && assignment.active)
      .map((assignment) => assignment.coachId),
  );

  return state.recipes.filter((recipe) => {
    if (referencedRecipeIds.has(recipe.id)) {
      return true;
    }
    if (recipe.ownerRole === "admin") {
      return true;
    }
    if (recipe.createdBy === user.id) {
      return true;
    }
    return recipe.ownerRole === "coach" && activeCoachIds.has(recipe.createdBy);
  });
}

export function getMealPlanRecipes(state: AppState, assignedMealPlan: AssignedMealPlan | null) {
  if (!assignedMealPlan) {
    return [];
  }

  const recipeById = new Map(state.recipes.map((recipe) => [recipe.id, recipe]));
  return assignedMealPlan.items
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .flatMap((item) => {
      const recipe = recipeById.get(item.recipeId);
      return recipe ? [{ mealTag: item.mealTag, recipe }] : [];
    });
}
