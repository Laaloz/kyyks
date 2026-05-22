"use client";

import { ChevronDown, Minus, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import {
  buildRecipeGoalComparison,
  getActiveMealPlanForAthlete,
  getMealPlanRecipes,
  getMealSlotGroupForTag,
  getMealSlotGroupKcalRange,
  getRecipeCompatibilityAlerts,
  mealSlotGroups,
  mealTagLabel,
  resolveRecipeNutritionPreview,
  scaleRecipeIngredient,
  splitRecipeInstructions,
  type MealSlotGroupId,
} from "@/lib/nutrition";
import type { AppState, MealTag, Recipe, UserProfile } from "@/lib/types";

function formatQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
}

function formatIngredientUnit(unit: Recipe["ingredients"][number]["unit"]) {
  return unit === "pcs" ? "kpl" : unit;
}

function formatRecipeIngredientLine(ingredient: Recipe["ingredients"][number], ingredientName: string) {
  const displayQuantity = ingredient.displayQuantity?.trim();
  const displayUnit = ingredient.displayUnit?.trim();
  if (displayQuantity) {
    return `${displayQuantity}${displayUnit ? ` ${displayUnit}` : ""} ${ingredientName}`.trim();
  }

  if (ingredient.quantity !== undefined) {
    return `${formatQuantity(ingredient.quantity)} ${formatIngredientUnit(ingredient.unit)} ${ingredientName}`;
  }

  return ingredientName;
}

function formatIngredientAlternatives(alternatives?: string[]) {
  if (!alternatives || alternatives.length === 0) {
    return null;
  }

  return `Vaihtoehdot: ${alternatives.join(", ")}`;
}

function groupRecipeIngredients(ingredients: Recipe["ingredients"]) {
  const groups = new Map<string, Recipe["ingredients"]>();
  for (const ingredient of ingredients) {
    const key = ingredient.groupLabel?.trim() || "Ainekset";
    const existing = groups.get(key) ?? [];
    existing.push(ingredient);
    groups.set(key, existing);
  }
  return Array.from(groups.entries()).map(([label, rows]) => ({ label, rows }));
}

function macroPill(label: string, value: string) {
  return (
    <div className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--text)]">
      <span className="text-[var(--text-subtle)]">{label}</span>{" "}
      <span>{value}</span>
    </div>
  );
}

function formatShareValue(value: number) {
  return `${Math.round(value)} %`;
}

function formatRoundedCalories(value: number) {
  return new Intl.NumberFormat("fi-FI", {
    maximumFractionDigits: 0,
  }).format(Math.round(value / 50) * 50);
}

function formatRoundedGrams(value: number) {
  return new Intl.NumberFormat("fi-FI", {
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

function mealSlotStatusLabel(status: "below" | "within" | "above") {
  switch (status) {
    case "below":
      return "hieman alle haarukan";
    case "within":
      return "osuu haarukkaan";
    case "above":
      return "hieman yli haarukan";
  }
}

function mealTagPossessiveLabel(mealTag: MealTag) {
  switch (mealTag) {
    case "breakfast":
      return "Aamupalan";
    case "lunch":
      return "Lounaan";
    case "snack":
      return "Välipalan";
    case "dinner":
      return "Illallisen";
    case "evening_snack":
      return "Iltapalan";
  }
}

function GoalComparisonPreview({
  comparison,
  mealTag,
}: {
  comparison: NonNullable<ReturnType<typeof buildRecipeGoalComparison>>;
  mealTag: MealTag;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
      <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Tavoitevertailu</p>
      <p className="mt-2 text-sm font-semibold text-[var(--text)]">
        {formatShareValue(comparison.dailyShare.kcal)} päivän energiasta
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {macroPill("P", formatShareValue(comparison.dailyShare.proteinG))}
        {macroPill("H", formatShareValue(comparison.dailyShare.carbsG))}
        {macroPill("R", formatShareValue(comparison.dailyShare.fatG))}
      </div>
      <p className="mt-3 text-sm text-[var(--text-muted)]">
        {mealTagPossessiveLabel(mealTag)} suositus {comparison.mealSlot.range[0]}-{comparison.mealSlot.range[1]} kcal. Tämä annos {mealSlotStatusLabel(comparison.mealSlot.status)}.
      </p>
    </div>
  );
}

function RecipeDetailDialog({
  mealTag,
  recipe,
  nutrition,
  nutritionProfile,
  ingredientsCatalog,
  selectedServings,
  onDecreaseServings,
  onIncreaseServings,
  onClose,
}: {
  mealTag: MealTag;
  recipe: Recipe;
  nutrition: { kcal: number; proteinG: number; carbsG: number; fatG: number };
  nutritionProfile: AppState["nutritionProfiles"][number] | null;
  ingredientsCatalog: AppState["ingredientsCatalog"];
  selectedServings: number;
  onDecreaseServings: () => void;
  onIncreaseServings: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const { body, documentElement } = document;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyOverscrollBehavior = body.style.overscrollBehavior;
    const previousDocumentOverflow = documentElement.style.overflow;
    const previousDocumentOverscrollBehavior = documentElement.style.overscrollBehavior;

    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    documentElement.style.overflow = "hidden";
    documentElement.style.overscrollBehavior = "none";

    return () => {
      body.style.overflow = previousBodyOverflow;
      body.style.overscrollBehavior = previousBodyOverscrollBehavior;
      documentElement.style.overflow = previousDocumentOverflow;
      documentElement.style.overscrollBehavior = previousDocumentOverscrollBehavior;
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const compatibilityAlerts = getRecipeCompatibilityAlerts(recipe, nutritionProfile);
  const batchNutrition = {
    kcal: Math.round(nutrition.kcal * selectedServings),
    proteinG: nutrition.proteinG * selectedServings,
    carbsG: nutrition.carbsG * selectedServings,
    fatG: nutrition.fatG * selectedServings,
  };
  const scaledIngredients = recipe.ingredients.map((ingredient) =>
    scaleRecipeIngredient(ingredient, selectedServings, recipe.defaultServings),
  );
  const ingredientNameById = useMemo(
    () =>
      new Map(
        ingredientsCatalog.map((ingredient) => [ingredient.id, ingredient.displayName?.trim() || ingredient.name]),
      ),
    [ingredientsCatalog],
  );
  const groupedIngredients = useMemo(
    () => groupRecipeIngredients(scaledIngredients),
    [scaledIngredients],
  );
  const goalComparison = useMemo(
    () => buildRecipeGoalComparison(mealTag, nutrition, nutritionProfile),
    [mealTag, nutrition, nutritionProfile],
  );

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-[color:color-mix(in_srgb,var(--background)_56%,transparent)] p-3 sm:items-center sm:p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="nutrition-recipe-title"
        aria-describedby="nutrition-recipe-description"
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-[var(--border-strong)] bg-[var(--surface)] shadow-[0_24px_60px_-24px_var(--shadow)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-[var(--border)] px-4 py-3 sm:px-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.06em] text-[var(--accent)]">{mealTagLabel(mealTag)}</p>
              <h3 id="nutrition-recipe-title" className="mt-1.5 text-xl font-semibold text-[var(--text)] sm:text-2xl">
                {recipe.name}
              </h3>
              <p id="nutrition-recipe-description" className="mt-1.5 text-sm leading-5 text-[var(--text-muted)]">
                {recipe.description ?? "Selkeä reseptinäkymä, jossa näet annosmäärän, raaka-aineet ja valmistusvaiheet yhdellä kertaa."}
              </p>
            </div>
            <Button type="button" variant="ghost" className="shrink-0" onClick={onClose}>
              Sulje
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 sm:px-5">
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            <div className="min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-2">
              <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Per annos</p>
              <p className="mt-0.5 text-base font-semibold text-[var(--text)]">{nutrition.kcal} kcal</p>
            </div>
            <div className="min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-2">
              <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Proteiini</p>
              <p className="mt-0.5 text-base font-semibold text-[var(--text)]">{Math.round(nutrition.proteinG)} g</p>
            </div>
            <div className="min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-2">
              <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Hiilarit</p>
              <p className="mt-0.5 text-base font-semibold text-[var(--text)]">{Math.round(nutrition.carbsG)} g</p>
            </div>
            <div className="min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-2">
              <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Rasva</p>
              <p className="mt-0.5 text-base font-semibold text-[var(--text)]">{Math.round(nutrition.fatG)} g</p>
            </div>
          </div>

          <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Annosmäärä</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Lisää tai vähennä annoksia sen mukaan paljonko haluat valmistaa kerralla.
                </p>
              </div>
              <div className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2 sm:w-auto sm:min-w-[14rem]">
                <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="size-10 shrink-0 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-0 text-base"
                    onClick={onDecreaseServings}
                    aria-label="Vähennä annoksia"
                  >
                    <Minus className="size-4" aria-hidden="true" />
                  </Button>
                  <div className="flex min-w-0 flex-1 flex-col items-center justify-center text-center">
                    <p className="text-[11px] font-semibold tracking-[0.06em] text-[var(--text-subtle)]">ANNOKSIA</p>
                    <p className="mt-0.5 text-xl font-semibold text-[var(--text)]">{selectedServings}</p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    className="size-10 shrink-0 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-0 text-base"
                    onClick={onIncreaseServings}
                    aria-label="Lisää annoksia"
                  >
                    <Plus className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2">
                <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Koko satsi</p>
                <p className="mt-0.5 text-base font-semibold text-[var(--text)]">{batchNutrition.kcal} kcal</p>
              </div>
              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2">
                <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Proteiini</p>
                <p className="mt-0.5 text-base font-semibold text-[var(--text)]">{Math.round(batchNutrition.proteinG)} g</p>
              </div>
              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2">
                <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Hiilarit</p>
                <p className="mt-0.5 text-base font-semibold text-[var(--text)]">{Math.round(batchNutrition.carbsG)} g</p>
              </div>
              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2">
                <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Rasva</p>
                <p className="mt-0.5 text-base font-semibold text-[var(--text)]">{Math.round(batchNutrition.fatG)} g</p>
              </div>
            </div>
          </div>

          {goalComparison ? (
            <div className="mt-4">
              <GoalComparisonPreview comparison={goalComparison} mealTag={mealTag} />
            </div>
          ) : null}

          {compatibilityAlerts.length > 0 ? (
            <div className="mt-4 rounded-2xl border border-[color:color-mix(in_srgb,var(--warning)_35%,var(--border))] bg-[color:color-mix(in_srgb,var(--warning)_12%,var(--surface))] p-3 text-sm text-[var(--warning)]">
              {compatibilityAlerts.map((alert) => (
                <p key={`${recipe.id}-${alert.key}`}>
                  {alert.label}: {alert.matchedIngredients.join(", ")}
                </p>
              ))}
            </div>
          ) : null}

          <div className="mt-3 space-y-3">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
              <div>
                <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Mitä tarvitset</p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">Raaka-aineet {selectedServings} annokselle.</p>
              </div>
              <div className="mt-3 space-y-3">
                {groupedIngredients.map((group) => (
                  <div key={`${recipe.id}-${group.label}`} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold tracking-[0.06em] text-[var(--accent)]">{group.label}</p>
                      <p className="text-[11px] font-medium text-[var(--text-subtle)]">{group.rows.length} riviä</p>
                    </div>
                    <ul className="space-y-1.5 text-sm text-[var(--text-muted)]">
                      {group.rows.map((ingredient) => (
                        <li key={`${recipe.id}-${ingredient.id}`} className="rounded-lg bg-[var(--surface-2)] px-2.5 py-2 leading-6">
                          <p className="text-[var(--text-muted)]">
                            {formatRecipeIngredientLine(
                              ingredient,
                              ingredient.ingredientId ? ingredientNameById.get(ingredient.ingredientId) ?? ingredient.ingredientName : ingredient.ingredientName,
                            )}
                          </p>
                          {formatIngredientAlternatives(ingredient.alternatives) ? (
                            <p className="mt-1 text-xs text-[var(--text-subtle)]">
                              {formatIngredientAlternatives(ingredient.alternatives)}
                            </p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
              <div>
                <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Valmistus</p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">Seuraa vaiheet järjestyksessä.</p>
              </div>
              <ol className="mt-3 space-y-2 pl-0 text-sm text-[var(--text-muted)]">
                {splitRecipeInstructions(recipe.instructions).map((step, index) => (
                  <li key={`${recipe.id}-step-${index}`} className="flex gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2.5">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-xs font-semibold text-[var(--text)]">
                      {index + 1}
                    </span>
                    <span className="leading-6">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
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
  const assignedTemplate = assignedPlan
    ? state.mealPlanTemplates.find((template) => template.id === assignedPlan.templateId) ?? null
    : null;
  const mealPlanRecipes = useMemo(() => getMealPlanRecipes(state, assignedPlan), [state, assignedPlan]);

  const groupedMealPlanRecipes = useMemo(
    () =>
      mealPlanRecipes.reduce<Partial<Record<MealSlotGroupId, typeof mealPlanRecipes>>>((groups, item) => {
        const groupId = getMealSlotGroupForTag(item.mealTag).id;
        const existing = groups[groupId] ?? [];
        return {
          ...groups,
          [groupId]: [...existing, item],
        };
      }, {}),
    [mealPlanRecipes],
  );
  const availableMealGroups = useMemo(
    () => mealSlotGroups.filter((group) => (groupedMealPlanRecipes[group.id] ?? []).length > 0),
    [groupedMealPlanRecipes],
  );
  const [selectedMealGroupId, setSelectedMealGroupId] = useState<MealSlotGroupId | null>(availableMealGroups[0]?.id ?? null);
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [selectedServings, setSelectedServings] = useState<number>(1);

  useEffect(() => {
    if (availableMealGroups.length === 0) {
      setSelectedMealGroupId(null);
      setSelectedRecipeId(null);
      return;
    }

    setSelectedMealGroupId((current) =>
      current && availableMealGroups.some((group) => group.id === current) ? current : availableMealGroups[0].id,
    );
  }, [availableMealGroups]);

  const selectedMealGroup = selectedMealGroupId ? mealSlotGroups.find((group) => group.id === selectedMealGroupId) ?? null : null;
  const selectedMealItems = selectedMealGroupId ? groupedMealPlanRecipes[selectedMealGroupId] ?? [] : [];
  const selectedRecipeEntry = useMemo(
    () => selectedMealItems.find((item) => item.recipe.id === selectedRecipeId) ?? null,
    [selectedMealItems, selectedRecipeId],
  );

  useEffect(() => {
    const recipe = selectedRecipeEntry?.recipe;
    if (!recipe) {
      setSelectedServings(1);
      return;
    }
    setSelectedServings(Math.max(1, recipe.defaultServings));
  }, [selectedRecipeEntry?.recipe.id]);

  const selectedRecipeNutrition = useMemo(() => {
    if (!selectedRecipeEntry) {
      return null;
    }
    return resolveRecipeNutritionPreview(selectedRecipeEntry.recipe, state.ingredientsCatalog).nutritionPerServing;
  }, [selectedRecipeEntry, state.ingredientsCatalog]);

  if (!nutritionProfile && !assignedPlan) {
    return null;
  }

  return (
    <Card className="max-w-full overflow-x-clip border-[var(--border-strong)] [contain:inline-size]">
      <div className="space-y-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Ruokalista</p>
          <CardTitle className="mt-1.5 text-balance text-xl leading-tight sm:text-2xl">Päivän ateriat</CardTitle>
        </div>

        {nutritionProfile ? (
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            <div className="min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-2">
              <p className="text-[11px] font-semibold tracking-[0.03em] text-[var(--text-subtle)]">Tavoite kcal</p>
              <p className="mt-0.5 text-base font-semibold text-[var(--text)]">{formatRoundedCalories(nutritionProfile.targetKcal)}</p>
            </div>
            <div className="min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-2">
              <p className="text-[11px] font-semibold tracking-[0.03em] text-[var(--text-subtle)]">Proteiini</p>
              <p className="mt-0.5 text-base font-semibold text-[var(--text)]">{formatRoundedGrams(nutritionProfile.proteinG)} g</p>
            </div>
            <div className="min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-2">
              <p className="text-[11px] font-semibold tracking-[0.03em] text-[var(--text-subtle)]">Hiilarit</p>
              <p className="mt-0.5 text-base font-semibold text-[var(--text)]">{formatRoundedGrams(nutritionProfile.carbsG)} g</p>
            </div>
            <div className="min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-2">
              <p className="text-[11px] font-semibold tracking-[0.03em] text-[var(--text-subtle)]">Rasva</p>
              <p className="mt-0.5 text-base font-semibold text-[var(--text)]">{formatRoundedGrams(nutritionProfile.fatG)} g</p>
            </div>
          </div>
        ) : null}

        {assignedPlan ? (
          <>
            {availableMealGroups.length > 0 ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {availableMealGroups.map((group) => {
                    const items = groupedMealPlanRecipes[group.id] ?? [];
                    const selected = selectedMealGroupId === group.id;
                    const slotRange = getMealSlotGroupKcalRange(group.id, nutritionProfile?.targetKcal);
                    const slotGuidance = slotRange ? `${slotRange[0]}-${slotRange[1]} kcal` : null;

                    return (
                      <button
                        key={group.id}
                        type="button"
                        className={`min-w-0 rounded-xl border px-3 py-3 text-left transition ${
                          selected
                            ? "border-[color-mix(in_srgb,var(--accent)_35%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))]"
                            : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)]"
                        }`}
                        onClick={() => {
                          setSelectedMealGroupId(group.id);
                          setSelectedRecipeId(null);
                        }}
                      >
                        <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">{group.label}</p>
                        <p className="mt-1.5 text-sm font-semibold text-[var(--text)]">{items.length} vaihtoehtoa</p>
                        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                          {slotGuidance ?? group.description}
                        </p>
                      </button>
                    );
                  })}
                </div>

                {selectedMealGroup ? (
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-4 px-1">
                      <div>
                        <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">{selectedMealGroup.label}</p>
                        <p className="mt-1 text-sm text-[var(--text-muted)]">Valitse resepti.</p>
                      </div>
                      <p className="text-sm text-[var(--text-muted)]">{selectedMealItems.length} reseptiä</p>
                    </div>

                    <div className="grid gap-2.5">
                      {selectedMealItems.map((item) => {
                        const recipeNutrition = resolveRecipeNutritionPreview(item.recipe, state.ingredientsCatalog).nutritionPerServing;
                        const goalComparison = buildRecipeGoalComparison(item.mealTag, recipeNutrition, nutritionProfile);
                        const isOpen = selectedRecipeId === item.recipe.id;

                        return (
                          <button
                            key={`${item.mealTag}-${item.recipe.id}`}
                            type="button"
                            className={`w-full rounded-xl border p-3 text-left transition ${
                              isOpen
                                ? "border-[color-mix(in_srgb,var(--accent)_35%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]"
                                : "border-[var(--border)] bg-[var(--surface-2)] hover:bg-[var(--surface)]"
                            }`}
                            onClick={() => {
                              setSelectedServings(Math.max(1, item.recipe.defaultServings));
                              setSelectedRecipeId(item.recipe.id);
                            }}
                          >
                            <div className="min-w-0">
                              <div className="flex items-start justify-between gap-3">
                                <p className="text-base font-semibold text-[var(--text)]">{item.recipe.name}</p>
                                <div className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text-subtle)] transition ${isOpen ? "rotate-180 text-[var(--accent)]" : "-rotate-90"}`}>
                                  <ChevronDown className="size-3.5" aria-hidden="true" />
                                </div>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {macroPill("kcal", `${recipeNutrition.kcal}`)}
                              </div>
                              {goalComparison ? (
                                <div className="mt-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-xs text-[var(--text-muted)]">
                                  <p className="font-semibold text-[var(--text)]">
                                    {formatShareValue(goalComparison.dailyShare.kcal)} päivän energiasta
                                  </p>
                                  <p className="mt-0.5">
                                    P {Math.round(recipeNutrition.proteinG)} g · H {Math.round(recipeNutrition.carbsG)} g · R {Math.round(recipeNutrition.fatG)} g
                                  </p>
                                </div>
                              ) : (
                                <p className="mt-1.5 text-xs text-[var(--text-muted)]">
                                  P {Math.round(recipeNutrition.proteinG)} g · H {Math.round(recipeNutrition.carbsG)} g · R {Math.round(recipeNutrition.fatG)} g
                                </p>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
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

        {selectedRecipeEntry && selectedRecipeNutrition ? (
          <RecipeDetailDialog
            mealTag={selectedRecipeEntry.mealTag}
            recipe={selectedRecipeEntry.recipe}
            nutrition={selectedRecipeNutrition}
            nutritionProfile={nutritionProfile}
            ingredientsCatalog={state.ingredientsCatalog}
            selectedServings={selectedServings}
            onDecreaseServings={() => setSelectedServings((current) => Math.max(1, current - 1))}
            onIncreaseServings={() => setSelectedServings((current) => current + 1)}
            onClose={() => setSelectedRecipeId(null)}
          />
        ) : null}
      </div>
    </Card>
  );
}
