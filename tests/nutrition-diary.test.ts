import { describe, expect, it } from "vitest";

import { getRecentFoods, lastNLocalDates } from "@/lib/nutrition";
import type { DayMealPlanEntry } from "@/lib/types";

function entry(overrides: Partial<DayMealPlanEntry> & Pick<DayMealPlanEntry, "id" | "planDate" | "createdAt">): DayMealPlanEntry {
  return {
    athleteId: "u1",
    mealTag: "lunch",
    recipeId: null,
    source: "added",
    servings: 1,
    position: 0,
    updatedAt: overrides.createdAt,
    ...overrides,
  };
}

describe("lastNLocalDates", () => {
  it("palauttaa n päivää, uusin ensin, päättyen annettuun päivään", () => {
    expect(lastNLocalDates(7, "2026-06-15")).toEqual([
      "2026-06-15",
      "2026-06-14",
      "2026-06-13",
      "2026-06-12",
      "2026-06-11",
      "2026-06-10",
      "2026-06-09",
    ]);
  });

  it("ylittää kuukauden rajan oikein (ei UTC-vuotoa)", () => {
    expect(lastNLocalDates(4, "2026-06-02")).toEqual(["2026-06-02", "2026-06-01", "2026-05-31", "2026-05-30"]);
  });
});

describe("getRecentFoods", () => {
  const entries: DayMealPlanEntry[] = [
    entry({ id: "1", planDate: "2026-06-14", createdAt: "2026-06-14T10:00:00.000Z", foodName: "Banaani", grams: 120, kcalPer100: 89 }),
    entry({ id: "2", planDate: "2026-06-13", createdAt: "2026-06-13T10:00:00.000Z", foodName: "Banaani", grams: 100, kcalPer100: 89 }),
    entry({ id: "3", planDate: "2026-06-12", createdAt: "2026-06-12T10:00:00.000Z", recipeId: "r1" }),
    entry({ id: "4", planDate: "2026-06-11", createdAt: "2026-06-11T10:00:00.000Z", recipeId: "deleted" }),
    entry({ id: "5", planDate: "2026-06-15", createdAt: "2026-06-15T10:00:00.000Z", foodName: "Tänään", grams: 50, kcalPer100: 10 }),
  ];

  it("deduplikoi ruoan nimellä ja reseptin id:llä, uusin ensin", () => {
    const result = getRecentFoods(entries, {
      athleteId: "u1",
      excludeDate: "2026-06-15",
      resolveRecipeName: (id) => (id === "r1" ? "Kanapasta" : undefined),
    });
    // Banaani esiintyy kahdesti -> yksi merkintä; poistettua reseptiä ei oteta; tämä päivä suljettu pois.
    expect(result.map((food) => food.label)).toEqual(["Banaani", "Kanapasta"]);
    const banaani = result[0];
    expect(banaani.kind).toBe("food");
    if (banaani.kind === "food") {
      expect(banaani.grams).toBe(120); // uusin esiintymä
    }
  });

  it("kunnioittaa limitiä ja athleteId-suodatusta", () => {
    expect(getRecentFoods(entries, { athleteId: "muu" })).toHaveLength(0);
    expect(getRecentFoods(entries, { athleteId: "u1", limit: 1 })).toHaveLength(1);
  });
});
