"use client";

import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import {
  getRecipeCompatibilityAlerts,
  mealTagLabel,
  getActiveMealPlanForAthlete,
  getMealPlanRecipes,
  calculateRecipeNutrition,
  splitRecipeInstructions,
} from "@/lib/nutrition";
import type { AppState, MealTag, UserProfile } from "@/lib/types";

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
            Näet tämän hetken aktiivisen ateriapohjan, annokset sekä karkean osuvuuden päivän tavoitteeseen.
          </CardDescription>
        </div>

        {nutritionProfile ? (
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
              <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Tavoite kcal</p>
              <p className="mt-1 text-xl font-semibold text-[var(--text)]">{nutritionProfile.targetKcal}</p>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
              <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Proteiini</p>
              <p className="mt-1 text-xl font-semibold text-[var(--text)]">{nutritionProfile.proteinG} g</p>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
              <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Hiilarit</p>
              <p className="mt-1 text-xl font-semibold text-[var(--text)]">{nutritionProfile.carbsG} g</p>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
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
                Ateriapohja nayttaa vaihtoehdot per ateriaryhma. Valitse aamupaloista, lounaista, valipaloista, illallisista ja iltapaloista arkeen sopivat vaihtoehdot ilman etta kaikki listatut annokset kuuluvat samaan paivaan.
              </p>
            </div>

            <div className="grid gap-3">
              {Object.entries(groupedMealPlanRecipes).map(([mealTag, items]) => {
                const typedMealTag = mealTag as MealTag;
                const slotGuidance = mealSlotGuidance(typedMealTag, nutritionProfile?.targetKcal);
                return (
                  <div key={mealTag} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">{mealTagLabel(typedMealTag)}</p>
                        <p className="mt-1 text-sm text-[var(--text-muted)]">
                          {slotGuidance ? `Tyypillinen haarukka: ${slotGuidance}` : "Valitse tilanteeseen sopiva vaihtoehto."}
                        </p>
                      </div>
                      <div className="text-right text-sm text-[var(--text-muted)]">
                        <p>{items.length} vaihtoehtoa</p>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3">
                      {items.map((item) => {
                        const recipeNutrition = item.recipe.nutritionPerServing ?? calculateRecipeNutrition(item.recipe, state.ingredientsCatalog).nutritionPerServing;
                        const compatibilityAlerts = getRecipeCompatibilityAlerts(item.recipe, nutritionProfile);
                        return (
                          <div key={`${item.mealTag}-${item.recipe.id}`} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <p className="text-lg font-semibold text-[var(--text)]">{item.recipe.name}</p>
                                <p className="mt-1 text-sm text-[var(--text-muted)]">{item.recipe.description ?? "Valmis ateriasuositus taman ateriaryhman sisalle."}</p>
                              </div>
                              <div className="text-right text-sm text-[var(--text-muted)]">
                                <p>{recipeNutrition.kcal} kcal</p>
                                <p>P {Math.round(recipeNutrition.proteinG)} g</p>
                                <p>H {Math.round(recipeNutrition.carbsG)} g</p>
                                <p>R {Math.round(recipeNutrition.fatG)} g</p>
                              </div>
                            </div>
                            {compatibilityAlerts.length > 0 ? (
                              <div className="mt-3 rounded-2xl border border-[color:color-mix(in_srgb,var(--warning)_35%,var(--border))] bg-[color:color-mix(in_srgb,var(--warning)_12%,var(--surface))] p-3 text-sm text-[var(--warning)]">
                                {compatibilityAlerts.map((alert) => (
                                  <p key={`${item.recipe.id}-${alert.key}`}>
                                    {alert.label}: {alert.matchedIngredients.join(", ")}
                                  </p>
                                ))}
                              </div>
                            ) : null}
                            <div className="mt-3 border-t border-[var(--border)] pt-3">
                              <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Ohjeet</p>
                              <ol className="mt-1 list-decimal space-y-1 pl-4 text-sm text-[var(--text-muted)]">
                                {splitRecipeInstructions(item.recipe.instructions).map((step, index) => (
                                  <li key={`${item.recipe.id}-step-${index}`}>{step}</li>
                                ))}
                              </ol>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
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
