import { describe, expect, it } from "vitest";

import { macroEnergyWarning } from "@/components/workout/schemas";
import { adHocEntryMacros, inferMealTagForTime } from "@/lib/nutrition";
import type { DayMealPlanEntry } from "@/lib/types";

function adHocEntry(overrides: Partial<DayMealPlanEntry>): DayMealPlanEntry {
  return {
    id: "entry-1",
    athleteId: "athlete-1",
    planDate: "2026-06-14",
    mealTag: "lunch",
    recipeId: null,
    source: "added",
    servings: 1,
    eatenAt: null,
    position: 0,
    foodName: "Testiruoka",
    foodSource: "manual",
    createdAt: "2026-06-14T00:00:00.000Z",
    updatedAt: "2026-06-14T00:00:00.000Z",
    ...overrides,
  };
}

describe("adHocEntryMacros", () => {
  it("scales per-100g macros by the gram amount", () => {
    const macros = adHocEntryMacros(
      adHocEntry({ grams: 150, kcalPer100: 400, proteinPer100: 10, carbsPer100: 60, fatPer100: 8 }),
    );
    expect(macros).toEqual({ kcal: 600, p: 15, c: 90, f: 12 });
  });

  it("returns zeros when grams or macros are missing", () => {
    expect(adHocEntryMacros(adHocEntry({ grams: null, kcalPer100: 400 }))).toEqual({ kcal: 0, p: 0, c: 0, f: 0 });
    expect(adHocEntryMacros(adHocEntry({ grams: 100 }))).toEqual({ kcal: 0, p: 0, c: 0, f: 0 });
  });

  it("handles fractional gram amounts", () => {
    const macros = adHocEntryMacros(adHocEntry({ grams: 50, kcalPer100: 250, proteinPer100: 20, carbsPer100: 0, fatPer100: 10 }));
    expect(macros).toEqual({ kcal: 125, p: 10, c: 0, f: 5 });
  });
});

describe("macroEnergyWarning", () => {
  it("returns null when energy roughly matches 4P + 4C + 9F", () => {
    // 4*10 + 4*10 + 9*5 = 125, ilmoitettu 120 → ~4 % ero
    expect(macroEnergyWarning(120, 10, 10, 5)).toBeNull();
  });

  it("warns when energy and macros are clearly inconsistent", () => {
    // laskennallinen 125 kcal vs ilmoitettu 50 kcal → 60 % ero
    const warning = macroEnergyWarning(50, 10, 10, 5);
    expect(warning).toBeTypeOf("string");
    expect(warning).toContain("eivät täsmää");
  });

  it("returns null when everything is zero", () => {
    expect(macroEnergyWarning(0, 0, 0, 0)).toBeNull();
  });
});

describe("inferMealTagForTime", () => {
  const at = (hour: number) => inferMealTagForTime(new Date(2026, 5, 14, hour, 0, 0));

  it("maps the time of day to a sensible meal slot", () => {
    expect(at(8)).toBe("breakfast");
    expect(at(12)).toBe("lunch");
    expect(at(15)).toBe("snack");
    expect(at(19)).toBe("dinner");
    expect(at(22)).toBe("evening_snack");
  });

  it("uses inclusive lower / exclusive upper boundaries", () => {
    expect(at(10)).toBe("lunch");
    expect(at(14)).toBe("snack");
    expect(at(17)).toBe("dinner");
    expect(at(21)).toBe("evening_snack");
  });
});
