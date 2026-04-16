"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import {
  scaleRecipeIngredient,
  getRecipeCompatibilityAlerts,
  mealTagLabel,
  getActiveMealPlanForAthlete,
  getMealPlanRecipes,
  calculateRecipeNutrition,
  splitRecipeInstructions,
} from "@/lib/nutrition";
import type { AppState, MealTag, Recipe, UserProfile } from "@/lib/types";

const mealTagOrder: MealTag[] = ["breakfast", "lunch", "snack", "dinner", "evening_snack"];

function formatQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
}

function formatRecipeIngredientLine(ingredient: Recipe["ingredients"][number]) {
  const displayQuantity = ingredient.displayQuantity?.trim();
  const displayUnit = ingredient.displayUnit?.trim();
  if (displayQuantity) {
    return `${displayQuantity}${displayUnit ? ` ${displayUnit}` : ""} ${ingredient.ingredientName}`.trim();
  }

  if (ingredient.quantity !== undefined) {
    return `${formatQuantity(ingredient.quantity)} ${ingredient.unit} ${ingredient.ingredientName}`;
  }

  return ingredient.ingredientName;
}

export function NutritionAthleteCard({
  state,
  user,
}: {
  state: AppState;
  user: UserProfile;
}) {
  const nutritionProfile = state.nutritionProfiles.find((profile) => profile.userId === user.id) ?? null;
  const assignedPlan = getActiveMealPlanForAthlete(state, user.id);
  const mealPlanRecipes = getMealPlanRecipes(state, assignedPlan);

  if (!nutritionProfile && !assignedPlan) {
    return null;
  }

  const groupedMealPlanRecipes = mealPlanRecipes.reduce<Partial<Record<MealTag, typeof mealPlanRecipes>>>((groups, item) => {
    const existing = groups[item.mealTag] ?? [];
    return {
      ...groups,
      [item.mealTag]: [...existing, item],
    };
  }, {});
  const availableMealTags = mealTagOrder.filter((mealTag) => (groupedMealPlanRecipes[mealTag] ?? []).length > 0);
  const [selectedMealTag, setSelectedMealTag] = useState<MealTag | null>(availableMealTags[0] ?? null);
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [selectedServings, setSelectedServings] = useState<number>(1);
  const mealPickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (availableMealTags.length === 0) {
      setSelectedMealTag(null);
      setSelectedRecipeId(null);
      return;
    }

    setSelectedMealTag((current) => (current && availableMealTags.includes(current) ? current : availableMealTags[0]));
  }, [availableMealTags]);

  const selectedMealItems = selectedMealTag ? groupedMealPlanRecipes[selectedMealTag] ?? [] : [];

  useEffect(() => {
    if (selectedMealItems.length === 0) {
      setSelectedRecipeId(null);
      return;
    }

    setSelectedRecipeId((current) => (
      current && selectedMealItems.some((item) => item.recipe.id === current)
        ? current
        : selectedMealItems[0]?.recipe.id ?? null
    ));
  }, [selectedMealItems]);

  const selectedRecipeEntry = useMemo(
    () => selectedMealItems.find((item) => item.recipe.id === selectedRecipeId) ?? selectedMealItems[0] ?? null,
    [selectedMealItems, selectedRecipeId],
  );

  useEffect(() => {
    const recipe = selectedRecipeEntry?.recipe;
    if (!recipe) {
      setSelectedServings(1);
      return;
    }

    setSelectedServings((current) => {
      if (current >= recipe.minServings && current <= recipe.maxServings) {
        return current;
      }
      return recipe.defaultServings;
    });
  }, [selectedRecipeEntry]);

  const mealSlotGuidance = (mealTag: MealTag, targetKcal: number | undefined) => {
    if (!targetKcal) {
      return null;
    }

    const ranges = {
      breakfast: [0.15, 0.2],
      lunch: [0.25, 0.3],
      snack: [0.1, 0.15],
      dinner: [0.25, 0.3],
      evening_snack: [0.1, 0.15],
    } as const;
    const [minRatio, maxRatio] = ranges[mealTag as keyof typeof ranges] ?? [0.1, 0.2];
    return `${Math.round(targetKcal * minRatio)}-${Math.round(targetKcal * maxRatio)} kcal`;
  };

  return (
    <Card className="border-[var(--border-strong)]">
      <div className="space-y-5">
        <div>
          <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Ruokalista</p>
          <CardTitle className="mt-2 text-2xl">Päivän ateriat</CardTitle>
          <CardDescription className="mt-2">
            Valitse ateriaryhmä, avaa resepti ja säädä annosmäärä suoraan mobiilissa ilman turhaa etsimistä.
          </CardDescription>
        </div>

        {nutritionProfile ? (
          <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1 sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-0">
            <div className="min-w-[10.5rem] snap-start rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 sm:min-w-0">
              <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Tavoite kcal</p>
              <p className="mt-1 text-xl font-semibold text-[var(--text)]">{nutritionProfile.targetKcal}</p>
            </div>
            <div className="min-w-[10.5rem] snap-start rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 sm:min-w-0">
              <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Proteiini</p>
              <p className="mt-1 text-xl font-semibold text-[var(--text)]">{nutritionProfile.proteinG} g</p>
            </div>
            <div className="min-w-[10.5rem] snap-start rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 sm:min-w-0">
              <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Hiilarit</p>
              <p className="mt-1 text-xl font-semibold text-[var(--text)]">{nutritionProfile.carbsG} g</p>
            </div>
            <div className="min-w-[10.5rem] snap-start rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 sm:min-w-0">
              <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Rasva</p>
              <p className="mt-1 text-xl font-semibold text-[var(--text)]">{nutritionProfile.fatG} g</p>
            </div>
          </div>
        ) : null}

        {assignedPlan ? (
          <>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
              <p className="text-sm font-semibold text-[var(--text)]">{assignedPlan.name}</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Valitse ensin ateriaryhmä ja sen alta sinulle sopiva resepti. Resepti aukeaa omaan selkeään näkymään, jossa näet raaka-aineet ja valmistusvaiheet yhdellä silmäyksellä.
              </p>
            </div>

            {availableMealTags.length > 0 ? (
              <div className="space-y-4">
                <div ref={mealPickerRef} className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 xl:mx-0 xl:grid xl:grid-cols-5 xl:overflow-visible xl:px-0">
                  {availableMealTags.map((mealTag) => {
                    const items = groupedMealPlanRecipes[mealTag] ?? [];
                    const selected = selectedMealTag === mealTag;
                    const slotGuidance = mealSlotGuidance(mealTag, nutritionProfile?.targetKcal);

                    return (
                      <button
                        key={mealTag}
                        type="button"
                        className={`min-w-[11rem] snap-start rounded-2xl border px-4 py-4 text-left transition xl:min-w-0 ${
                          selected
                            ? "border-[color-mix(in_srgb,var(--accent)_35%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))]"
                            : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)]"
                        }`}
                        onClick={() => setSelectedMealTag(mealTag)}
                      >
                        <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">{mealTagLabel(mealTag)}</p>
                        <p className="mt-2 text-base font-semibold text-[var(--text)]">{items.length} vaihtoehtoa</p>
                        <p className="mt-1 text-sm text-[var(--text-muted)]">
                          {slotGuidance ?? "Valitse tilanteeseen sopiva vaihtoehto."}
                        </p>
                      </button>
                    );
                  })}
                </div>

                {selectedMealTag && selectedRecipeEntry ? (
                  <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">{mealTagLabel(selectedMealTag)}</p>
                          <p className="mt-1 text-sm text-[var(--text-muted)]">Valitse resepti listasta avataksesi tarkemmat tiedot.</p>
                        </div>
                        <p className="text-sm text-[var(--text-muted)]">{selectedMealItems.length} reseptiä</p>
                      </div>

                      <div className="mt-4 space-y-3">
                        {selectedMealItems.map((item) => {
                          const recipeNutrition = item.recipe.nutritionPerServing ?? calculateRecipeNutrition(item.recipe, state.ingredientsCatalog).nutritionPerServing;
                          const selected = selectedRecipeEntry.recipe.id === item.recipe.id;

                          return (
                            <button
                              key={`${item.mealTag}-${item.recipe.id}`}
                              type="button"
                              className={`w-full rounded-2xl border p-4 text-left transition ${
                                selected
                                  ? "border-[color-mix(in_srgb,var(--accent)_35%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]"
                                  : "border-[var(--border)] bg-[var(--surface-2)] hover:bg-[var(--surface)]"
                              }`}
                              onClick={() => setSelectedRecipeId(item.recipe.id)}
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div>
                                  <p className="text-lg font-semibold text-[var(--text)]">{item.recipe.name}</p>
                                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                                    {item.recipe.description ?? "Valmis ateriasuositus tämän ateriaryhmän sisälle."}
                                  </p>
                                </div>
                                <div className="text-right text-sm text-[var(--text-muted)]">
                                  <p>{recipeNutrition.kcal} kcal</p>
                                  <p>P {Math.round(recipeNutrition.proteinG)} g</p>
                                  <p>H {Math.round(recipeNutrition.carbsG)} g</p>
                                  <p>R {Math.round(recipeNutrition.fatG)} g</p>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {(() => {
                      const recipeNutritionBase = selectedRecipeEntry.recipe.nutritionPerServing ?? calculateRecipeNutrition(selectedRecipeEntry.recipe, state.ingredientsCatalog).nutritionPerServing;
                      const compatibilityAlerts = getRecipeCompatibilityAlerts(selectedRecipeEntry.recipe, nutritionProfile);
                      const batchNutrition = {
                        kcal: Math.round(recipeNutritionBase.kcal * selectedServings),
                        proteinG: recipeNutritionBase.proteinG * selectedServings,
                        carbsG: recipeNutritionBase.carbsG * selectedServings,
                        fatG: recipeNutritionBase.fatG * selectedServings,
                      };
                      const scaledIngredients = selectedRecipeEntry.recipe.ingredients.map((ingredient) =>
                        scaleRecipeIngredient(
                          ingredient,
                          selectedServings,
                          selectedRecipeEntry.recipe.defaultServings,
                        ),
                      );
                      const servingOptions = Array.from(
                        { length: selectedRecipeEntry.recipe.maxServings - selectedRecipeEntry.recipe.minServings + 1 },
                        (_, index) => selectedRecipeEntry.recipe.minServings + index,
                      );

                      return (
                        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Valittu resepti</p>
                              <p className="mt-1 text-2xl font-semibold text-[var(--text)]">{selectedRecipeEntry.recipe.name}</p>
                              <p className="mt-2 text-sm text-[var(--text-muted)]">
                                {selectedRecipeEntry.recipe.description ?? "Selkeä ateriavaihtoehto tämän ateriaryhmän sisälle."}
                              </p>
                            </div>
                            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--text-muted)] sm:min-w-[11rem] sm:text-right">
                              <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Per annos</p>
                              <p className="text-lg font-semibold text-[var(--text)]">{recipeNutritionBase.kcal} kcal</p>
                              <p>P {Math.round(recipeNutritionBase.proteinG)} g</p>
                              <p>H {Math.round(recipeNutritionBase.carbsG)} g</p>
                              <p>R {Math.round(recipeNutritionBase.fatG)} g</p>
                            </div>
                          </div>

                          <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                            <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
                              <div>
                                <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Kuinka monta annosta teet?</p>
                                <p className="mt-1 text-sm text-[var(--text-muted)]">
                                  Valitse annosmäärä, niin näytämme koko satsin raaka-aineet ja makrot selkeästi yhdellä kertaa.
                                </p>
                              </div>
                              <div className="sm:min-w-[10rem]">
                                <label className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]" htmlFor={`servings-${selectedRecipeEntry.recipe.id}`}>
                                  Annoksia
                                </label>
                                <select
                                  id={`servings-${selectedRecipeEntry.recipe.id}`}
                                  className="mt-1 min-h-11 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)]"
                                  value={selectedServings}
                                  onChange={(event) => setSelectedServings(Number(event.target.value))}
                                >
                                  {servingOptions.map((option) => (
                                    <option key={option} value={option}>
                                      {option} annosta
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            <div className="-mx-1 mt-4 flex snap-x gap-3 overflow-x-auto px-1 pb-1 sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-0">
                              <div>
                                <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Koko satsi</p>
                                <p className="mt-1 text-lg font-semibold text-[var(--text)]">{batchNutrition.kcal} kcal</p>
                              </div>
                              <div>
                                <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Proteiini</p>
                                <p className="mt-1 text-lg font-semibold text-[var(--text)]">{Math.round(batchNutrition.proteinG)} g</p>
                              </div>
                              <div>
                                <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Hiilarit</p>
                                <p className="mt-1 text-lg font-semibold text-[var(--text)]">{Math.round(batchNutrition.carbsG)} g</p>
                              </div>
                              <div>
                                <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Rasva</p>
                                <p className="mt-1 text-lg font-semibold text-[var(--text)]">{Math.round(batchNutrition.fatG)} g</p>
                              </div>
                            </div>
                          </div>

                          {compatibilityAlerts.length > 0 ? (
                            <div className="mt-4 rounded-2xl border border-[color:color-mix(in_srgb,var(--warning)_35%,var(--border))] bg-[color:color-mix(in_srgb,var(--warning)_12%,var(--surface))] p-3 text-sm text-[var(--warning)]">
                              {compatibilityAlerts.map((alert) => (
                                <p key={`${selectedRecipeEntry.recipe.id}-${alert.key}`}>
                                  {alert.label}: {alert.matchedIngredients.join(", ")}
                                </p>
                              ))}
                            </div>
                          ) : null}

                          <div className="mt-4 grid gap-4 lg:grid-cols-2">
                            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Raaka-aineet {selectedServings} annokselle</p>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  className="px-3 py-2 text-sm"
                                  onClick={() => mealPickerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                                >
                                  Vaihda ateriaa
                                </Button>
                              </div>
                              <ul className="mt-3 space-y-2 text-sm text-[var(--text-muted)]">
                                {scaledIngredients.map((ingredient) => (
                                  <li key={`${selectedRecipeEntry.recipe.id}-${ingredient.id}`}>
                                    {formatRecipeIngredientLine(ingredient)}
                                  </li>
                                ))}
                              </ul>
                            </div>

                            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                              <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Valmistus</p>
                              <ol className="mt-3 list-decimal space-y-2 pl-4 text-sm text-[var(--text-muted)]">
                                {splitRecipeInstructions(selectedRecipeEntry.recipe.instructions).map((step, index) => (
                                  <li key={`${selectedRecipeEntry.recipe.id}-step-${index}`}>{step}</li>
                                ))}
                              </ol>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] px-4 py-5 text-sm text-[var(--text-muted)]">
            Tälle käyttäjälle ei ole vielä jaettu aktiivista ateriapohjaa.
          </div>
        )}
      </div>
    </Card>
  );
}
