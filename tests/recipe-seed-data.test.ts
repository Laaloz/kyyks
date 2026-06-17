import { describe, expect, it } from "vitest";

// Seed files are plain ESM scripts used by the import tooling.
// @ts-ignore
import { ingredientAliases } from "../scripts/recipe-ingredient-aliases.mjs";
// @ts-ignore
import { manualIngredientSeed } from "../scripts/manual-ingredient-seed.mjs";
// @ts-ignore
import { recipeSeedData } from "../scripts/recipe-seed-data.mjs";

type ManualIngredient = {
  name: string;
  displayName?: string;
  gramsPerUnit?: number;
  kcalPer100: number;
  proteinPer100: number;
  carbsPer100: number;
  fatPer100: number;
};

type RecipeIngredientSeed = {
  ingredientName: string;
  quantity?: number;
  unit: "g" | "ml" | "pcs";
  displayQuantity?: string;
  displayUnit?: string;
  alternatives?: string[];
  groupLabel?: string;
  scalingMode: "linear" | "gentle" | "fixed" | "text_only";
};

type RecipeSeed = {
  name: string;
  instructions: string;
  defaultServings: number;
  ingredients: RecipeIngredientSeed[];
};

function normalizeName(value: unknown) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[%]/g, " % ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function buildIngredientCatalogMap() {
  const catalog = new Map<string, ManualIngredient>();

  for (const ingredient of manualIngredientSeed as ManualIngredient[]) {
    catalog.set(normalizeName(ingredient.name), ingredient);
    if (ingredient.displayName) {
      catalog.set(normalizeName(ingredient.displayName), ingredient);
    }
  }

  return catalog;
}

function resolveIngredient(catalog: Map<string, ManualIngredient>, ingredientName: string) {
  const normalizedName = normalizeName(ingredientName);
  const directMatch = catalog.get(normalizedName);
  if (directMatch) {
    return directMatch;
  }

  const aliases = (ingredientAliases as Record<string, string[]>)[normalizedName] ?? [];
  for (const alias of aliases) {
    const aliasMatch = catalog.get(normalizeName(alias));
    if (aliasMatch) {
      return aliasMatch;
    }
  }

  return null;
}

function calculateRecipeMacros(recipe: RecipeSeed) {
  const catalog = buildIngredientCatalogMap();
  const totals = recipe.ingredients.reduce(
    (sum, row) => {
      if (row.scalingMode === "text_only") {
        return sum;
      }

      const ingredient = resolveIngredient(catalog, row.ingredientName);
      if (!ingredient) {
        return {
          ...sum,
          missingIngredients: [...sum.missingIngredients, row.ingredientName],
        };
      }

      const quantity = row.unit === "pcs" && ingredient.gramsPerUnit
        ? (row.quantity ?? 0) * ingredient.gramsPerUnit
        : row.quantity;
      const multiplier = (quantity ?? 0) / 100;

      return {
        kcal: sum.kcal + ingredient.kcalPer100 * multiplier,
        proteinG: sum.proteinG + ingredient.proteinPer100 * multiplier,
        carbsG: sum.carbsG + ingredient.carbsPer100 * multiplier,
        fatG: sum.fatG + ingredient.fatPer100 * multiplier,
        missingIngredients: sum.missingIngredients,
      };
    },
    { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, missingIngredients: [] as string[] },
  );

  const servings = recipe.defaultServings > 0 ? recipe.defaultServings : 1;
  return {
    kcal: Math.round(totals.kcal / servings),
    proteinG: Math.round((totals.proteinG / servings) * 10) / 10,
    carbsG: Math.round((totals.carbsG / servings) * 10) / 10,
    fatG: Math.round((totals.fatG / servings) * 10) / 10,
    missingIngredients: totals.missingIngredients,
  };
}

describe("recipe seed data", () => {
  it("keeps Banaani-tuorepuuro instructions and macros aligned with a breakfast slot", () => {
    const recipe = (recipeSeedData as RecipeSeed[]).find((item) => item.name === "Banaani-tuorepuuro");

    expect(recipe).toBeDefined();
    if (!recipe) {
      return;
    }

    const macros = calculateRecipeMacros(recipe);
    const steps = recipe.instructions.split("\n").map((line) => line.replace(/^\d+\.\s+/, ""));
    const ingredient = (ingredientName: string, groupLabel?: string) =>
      recipe.ingredients.find((item) => item.ingredientName === ingredientName && (!groupLabel || item.groupLabel === groupLabel));

    expect(macros.missingIngredients).toEqual([]);
    expect(macros.kcal).toBeGreaterThanOrEqual(300);
    expect(macros.kcal).toBeLessThanOrEqual(520);
    expect(macros.proteinG).toBeGreaterThanOrEqual(20);
    expect(ingredient("Kaurahiutale")?.quantity).toBe(40);
    expect(ingredient("Tumma suklaa")?.quantity).toBe(10);
    expect(ingredient("Saksanpähkinä")).toBeUndefined();
    expect(ingredient("Banaani", "Pohja")).toMatchObject({ quantity: 0.5, unit: "pcs", displayQuantity: "½", displayUnit: "kpl" });
    expect(ingredient("Banaani", "Hedelmäkerros")).toMatchObject({ quantity: 0.5, unit: "pcs", displayQuantity: "½", displayUnit: "kpl" });
    expect(ingredient("Voi")?.alternatives).toContain("Kookosöljy");
    expect(steps.at(-1)).toContain("Anna tekeytyä jääkaapissa");
  });

  it("keeps Kot&go chicken ball macros tied to the branded product and store-friendly packs", () => {
    const recipe = (recipeSeedData as RecipeSeed[]).find((item) => item.name === "Kanapyörykät ja riisi");

    expect(recipe).toBeDefined();
    if (!recipe) {
      return;
    }

    const chickenBalls = recipe.ingredients.find((item) => item.ingredientName === "Kot&go kanafileepyörykät");
    const macros = calculateRecipeMacros(recipe);

    expect(chickenBalls).toMatchObject({
      quantity: 640,
      unit: "g",
      displayQuantity: "2",
      displayUnit: "pkt",
    });
    expect(resolveIngredient(buildIngredientCatalogMap(), "Kot&go kanafileepyörykät")?.name).toBe("Kot&go kanafileepyörykät");
    expect(macros.missingIngredients).toEqual([]);
    expect(macros.kcal).toBeGreaterThanOrEqual(500);
    expect(macros.proteinG).toBeGreaterThanOrEqual(30);
  });
});
