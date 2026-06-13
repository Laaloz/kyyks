"use client";

import { Check, Plus, Repeat2, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import {
  getActiveMealPlanForAthlete,
  getMealPlanRecipes,
  mealTagLabel,
  resolveRecipeNutritionPreview,
} from "@/lib/nutrition";
import type { AppState, MealTag, Recipe, UserProfile } from "@/lib/types";
import { useAppState } from "@/providers/app-state-provider";

const MEAL_TAG_ORDER: MealTag[] = ["breakfast", "lunch", "snack", "dinner", "evening_snack"];

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function recipeServingKcal(recipe: Recipe, ingredients: AppState["ingredientsCatalog"]) {
  const preview = resolveRecipeNutritionPreview(recipe, ingredients);
  return Math.round(preview.nutritionPerServing?.kcal ?? 0);
}

export function DayMealsCard({ user, readOnly = false }: { user: UserProfile; readOnly?: boolean }) {
  const { state, addDayMeal, swapDayMeal, removeDayMeal, setDayMealEaten } = useAppState();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isMaterializing, setIsMaterializing] = useState(false);
  const [swapTarget, setSwapTarget] = useState<{ entryId: string; mealTag: MealTag; currentRecipeId: string } | null>(null);
  const [addTag, setAddTag] = useState<MealTag | null>(null);

  const todayKey = useMemo(() => localDateKey(new Date()), []);
  const recipeById = useMemo(() => new Map(state.recipes.map((recipe) => [recipe.id, recipe])), [state.recipes]);
  const assignedPlan = useMemo(() => getActiveMealPlanForAthlete(state, user.id), [state, user.id]);
  const basePlan = useMemo(() => getMealPlanRecipes(state, assignedPlan), [state, assignedPlan]);
  const nutritionProfile = state.nutritionProfiles.find((profile) => profile.userId === user.id) ?? null;

  const dayRows = useMemo(
    () =>
      (state.dayMealPlans ?? [])
        .filter((entry) => entry.athleteId === user.id && entry.planDate === todayKey)
        .sort((left, right) => {
          const tagDelta = MEAL_TAG_ORDER.indexOf(left.mealTag) - MEAL_TAG_ORDER.indexOf(right.mealTag);
          return tagDelta !== 0 ? tagDelta : left.position - right.position;
        }),
    [state.dayMealPlans, todayKey, user.id],
  );

  const hasDay = dayRows.length > 0;
  const eatenCount = dayRows.filter((entry) => entry.eatenAt).length;
  const consumedKcal = dayRows.reduce((sum, entry) => {
    if (!entry.eatenAt) {
      return sum;
    }
    const recipe = recipeById.get(entry.recipeId);
    return recipe ? sum + recipeServingKcal(recipe, state.ingredientsCatalog) * entry.servings : sum;
  }, 0);
  const targetKcal = nutritionProfile?.targetKcal ?? 0;

  if (!assignedPlan && !hasDay) {
    return null;
  }

  const materializeFromPlan = async () => {
    setIsMaterializing(true);
    try {
      for (const [index, item] of basePlan.entries()) {
        await addDayMeal({
          planDate: todayKey,
          mealTag: item.mealTag,
          recipeId: item.recipe.id,
          source: "plan",
          position: index,
        });
      }
    } finally {
      setIsMaterializing(false);
    }
  };

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3">
        <CardTitle>Päivän ateriat</CardTitle>
        {hasDay ? (
          <span className="shrink-0 font-[family-name:var(--font-display)] text-sm font-semibold tabular-nums text-[var(--accent)]">
            {eatenCount}/{dayRows.length} syöty
          </span>
        ) : null}
      </div>

      {targetKcal > 0 ? (
        <p className="mt-1.5 text-sm text-[var(--text-muted)]">
          <span className="font-[family-name:var(--font-display)] font-semibold tabular-nums text-[var(--text)]">
            {consumedKcal}
          </span>{" "}
          / {targetKcal} kcal syöty
        </p>
      ) : null}

      {!hasDay ? (
        <div className="mt-4">
          <p className="text-sm text-[var(--text-muted)]">Päivän pohja suunnitelmastasi:</p>
          <div className="mt-3 divide-y divide-[var(--border)]">
            {basePlan.map((item, index) => (
              <div key={`${item.recipe.id}-${index}`} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--text)]">{item.recipe.name}</p>
                  <p className="text-xs text-[var(--text-subtle)]">{mealTagLabel(item.mealTag)}</p>
                </div>
                <span className="shrink-0 font-[family-name:var(--font-display)] text-sm tabular-nums text-[var(--text-subtle)]">
                  {recipeServingKcal(item.recipe, state.ingredientsCatalog)} kcal
                </span>
              </div>
            ))}
          </div>
          {!readOnly ? (
            <Button
              type="button"
              className="mt-4 w-full"
              loading={isMaterializing}
              loadingText="Kootaan päivää..."
              disabled={basePlan.length === 0}
              onClick={() => void materializeFromPlan()}
            >
              Kokoa tämän päivän ateriat
            </Button>
          ) : null}
        </div>
      ) : (
        <>
          <div className="mt-4 divide-y divide-[var(--border)]">
            {dayRows.map((entry) => {
              const recipe = recipeById.get(entry.recipeId);
              const isEaten = Boolean(entry.eatenAt);
              const isPending = pendingId === entry.id;

              return (
                <div key={entry.id} className="flex items-center gap-3 py-3">
                  {!readOnly ? (
                    <button
                      type="button"
                      className={`grid size-8 shrink-0 place-items-center rounded-full transition ${
                        isEaten
                          ? "bg-[var(--success)] text-white"
                          : "bg-[var(--surface-2)] text-[var(--text-subtle)] hover:text-[var(--text)]"
                      }`}
                      aria-pressed={isEaten}
                      aria-label={isEaten ? "Merkitse syömättömäksi" : "Merkitse syödyksi"}
                      disabled={isPending}
                      onClick={async () => {
                        setPendingId(entry.id);
                        try {
                          await setDayMealEaten(entry.id, !isEaten);
                        } finally {
                          setPendingId(null);
                        }
                      }}
                    >
                      <Check className="size-4 stroke-[2.5]" aria-hidden="true" />
                    </button>
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-sm font-semibold ${isEaten ? "text-[var(--text-subtle)] line-through" : "text-[var(--text)]"}`}>
                      {recipe?.name ?? "Tuntematon resepti"}
                    </p>
                    <p className="text-xs text-[var(--text-subtle)]">
                      {mealTagLabel(entry.mealTag)}
                      {recipe ? ` · ${recipeServingKcal(recipe, state.ingredientsCatalog) * entry.servings} kcal` : ""}
                      {entry.source === "swapped" ? " · vaihdettu" : entry.source === "added" ? " · lisätty" : ""}
                    </p>
                  </div>
                  {!readOnly && !isEaten ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        className="grid size-8 place-items-center rounded-full bg-[var(--surface-2)] text-[var(--text-subtle)] transition hover:text-[var(--accent)]"
                        aria-label="Vaihda ateria"
                        onClick={() => setSwapTarget({ entryId: entry.id, mealTag: entry.mealTag, currentRecipeId: entry.recipeId })}
                      >
                        <Repeat2 className="size-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="grid size-8 place-items-center rounded-full bg-[var(--surface-2)] text-[var(--text-subtle)] transition hover:text-[var(--danger)]"
                        aria-label="Poista ateria"
                        disabled={isPending}
                        onClick={async () => {
                          setPendingId(entry.id);
                          try {
                            await removeDayMeal(entry.id);
                          } finally {
                            setPendingId(null);
                          }
                        }}
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {!readOnly ? (
            <Button type="button" variant="secondary" className="mt-4 w-full gap-2" onClick={() => setAddTag("breakfast")}>
              <Plus className="size-4" aria-hidden="true" />
              Lisää ateria
            </Button>
          ) : null}
        </>
      )}

      {swapTarget ? (
        <MealPickerSheet
          title="Vaihda ateria"
          label="Valitse korvaava resepti"
          recipes={state.recipes
            .filter((recipe) => recipe.mealTag === swapTarget.mealTag && recipe.id !== swapTarget.currentRecipeId)
            .sort((left, right) => left.name.localeCompare(right.name, "fi"))}
          ingredients={state.ingredientsCatalog}
          baselineKcal={recipeById.get(swapTarget.currentRecipeId) ? recipeServingKcal(recipeById.get(swapTarget.currentRecipeId)!, state.ingredientsCatalog) : 0}
          onClose={() => setSwapTarget(null)}
          onPick={async (recipeId) => {
            const entryId = swapTarget.entryId;
            setSwapTarget(null);
            await swapDayMeal(entryId, recipeId);
          }}
        />
      ) : null}

      {addTag ? (
        <MealPickerSheet
          title="Lisää ateria"
          label="Valitse ateriapaikka ja resepti"
          mealTag={addTag}
          onChangeMealTag={setAddTag}
          recipes={state.recipes
            .filter((recipe) => recipe.mealTag === addTag)
            .sort((left, right) => left.name.localeCompare(right.name, "fi"))}
          ingredients={state.ingredientsCatalog}
          onClose={() => setAddTag(null)}
          onPick={async (recipeId) => {
            const tag = addTag;
            setAddTag(null);
            const position = dayRows.filter((entry) => entry.mealTag === tag).length;
            await addDayMeal({ planDate: todayKey, mealTag: tag, recipeId, source: "added", position });
          }}
        />
      ) : null}
    </Card>
  );
}

function MealPickerSheet({
  title,
  label,
  recipes,
  ingredients,
  baselineKcal,
  mealTag,
  onChangeMealTag,
  onClose,
  onPick,
}: {
  title: string;
  label: string;
  recipes: Recipe[];
  ingredients: AppState["ingredientsCatalog"];
  baselineKcal?: number;
  mealTag?: MealTag;
  onChangeMealTag?: (tag: MealTag) => void;
  onClose: () => void;
  onPick: (recipeId: string) => void | Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const filtered = recipes.filter((recipe) => recipe.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-[color:color-mix(in_srgb,var(--background)_48%,transparent)] p-4 sm:items-center" role="presentation">
      <div role="dialog" aria-modal="true" aria-label={title} className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-3xl bg-[var(--surface)] p-5 shadow-[0_24px_60px_-24px_var(--shadow)]">
        <div className="flex items-center justify-between gap-3">
          <CardTitle>{title}</CardTitle>
          <button type="button" className="grid size-8 place-items-center rounded-full bg-[var(--surface-2)] text-[var(--text-subtle)]" aria-label="Sulje" onClick={onClose}>
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        <p className="mt-1 text-sm text-[var(--text-muted)]">{label}</p>

        {mealTag && onChangeMealTag ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {MEAL_TAG_ORDER.map((tag) => (
              <button
                key={tag}
                type="button"
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  tag === mealTag ? "bg-[var(--text)] text-[var(--background)]" : "bg-[var(--surface-2)] text-[var(--text-muted)]"
                }`}
                onClick={() => onChangeMealTag(tag)}
              >
                {mealTagLabel(tag)}
              </button>
            ))}
          </div>
        ) : null}

        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Hae reseptiä..."
          className="mt-3 w-full rounded-xl bg-[var(--surface-2)] px-4 py-2.5 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-subtle)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        />

        <div className="mt-3 min-h-0 flex-1 divide-y divide-[var(--border)] overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--text-subtle)]">Ei reseptejä tälle ateriapaikalle.</p>
          ) : (
            filtered.map((recipe) => {
              const kcal = Math.round(resolveRecipeNutritionPreview(recipe, ingredients).nutritionPerServing?.kcal ?? 0);
              const diff = baselineKcal !== undefined ? kcal - baselineKcal : null;
              return (
                <button
                  key={recipe.id}
                  type="button"
                  className="flex w-full items-center justify-between gap-3 py-3 text-left"
                  onClick={() => void onPick(recipe.id)}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-[var(--text)]">{recipe.name}</span>
                    <span className="block text-xs text-[var(--text-subtle)]">{kcal} kcal</span>
                  </span>
                  {diff !== null && diff !== 0 ? (
                    <span className={`shrink-0 text-xs font-semibold tabular-nums ${diff > 0 ? "text-[var(--warning)]" : "text-[var(--success)]"}`}>
                      {diff > 0 ? "+" : ""}
                      {diff} kcal
                    </span>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
