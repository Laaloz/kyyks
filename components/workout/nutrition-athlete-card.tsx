"use client";

import { ChevronDown, Minus, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import {
  getActiveMealPlanForAthlete,
  getMealPlanRecipes,
  getRecipeCompatibilityAlerts,
  mealTagLabel,
  resolveRecipeNutritionPreview,
  scaleRecipeIngredient,
  splitRecipeInstructions,
} from "@/lib/nutrition";
import type { AppState, MealTag, Recipe, UserProfile } from "@/lib/types";

const mealTagOrder: MealTag[] = ["breakfast", "lunch", "snack", "dinner", "evening_snack"];

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
        <div className="border-b border-[var(--border)] px-4 py-4 sm:px-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.06em] text-[var(--accent)]">{mealTagLabel(mealTag)}</p>
              <h3 id="nutrition-recipe-title" className="mt-2 text-2xl font-semibold text-[var(--text)]">
                {recipe.name}
              </h3>
              <p id="nutrition-recipe-description" className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                {recipe.description ?? "Selkeä reseptinäkymä, jossa näet annosmäärän, raaka-aineet ja valmistusvaiheet yhdellä kertaa."}
              </p>
            </div>
            <Button type="button" variant="ghost" className="shrink-0" onClick={onClose}>
              Sulje
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
              <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Per annos</p>
              <p className="mt-1 text-lg font-semibold text-[var(--text)]">{nutrition.kcal} kcal</p>
            </div>
            <div className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
              <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Proteiini</p>
              <p className="mt-1 text-lg font-semibold text-[var(--text)]">{Math.round(nutrition.proteinG)} g</p>
            </div>
            <div className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
              <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Hiilarit</p>
              <p className="mt-1 text-lg font-semibold text-[var(--text)]">{Math.round(nutrition.carbsG)} g</p>
            </div>
            <div className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
              <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Rasva</p>
              <p className="mt-1 text-lg font-semibold text-[var(--text)]">{Math.round(nutrition.fatG)} g</p>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Annosmäärä</p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  Lisää tai vähennä annoksia sen mukaan paljonko haluat valmistaa kerralla.
                </p>
              </div>
              <div className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 sm:w-auto sm:min-w-[15rem]">
                <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-2 py-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="size-11 shrink-0 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-0 text-lg"
                    onClick={onDecreaseServings}
                    aria-label="Vähennä annoksia"
                  >
                    <Minus className="size-4" aria-hidden="true" />
                  </Button>
                  <div className="flex min-w-0 flex-1 flex-col items-center justify-center text-center">
                    <p className="text-[11px] font-semibold tracking-[0.06em] text-[var(--text-subtle)]">ANNOKSIA</p>
                    <p className="mt-1 text-2xl font-semibold text-[var(--text)]">{selectedServings}</p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    className="size-11 shrink-0 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-0 text-lg"
                    onClick={onIncreaseServings}
                    aria-label="Lisää annoksia"
                  >
                    <Plus className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3">
                <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Koko satsi</p>
                <p className="mt-1 text-lg font-semibold text-[var(--text)]">{batchNutrition.kcal} kcal</p>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3">
                <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Proteiini</p>
                <p className="mt-1 text-lg font-semibold text-[var(--text)]">{Math.round(batchNutrition.proteinG)} g</p>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3">
                <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Hiilarit</p>
                <p className="mt-1 text-lg font-semibold text-[var(--text)]">{Math.round(batchNutrition.carbsG)} g</p>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3">
                <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Rasva</p>
                <p className="mt-1 text-lg font-semibold text-[var(--text)]">{Math.round(batchNutrition.fatG)} g</p>
              </div>
            </div>
          </div>

          {compatibilityAlerts.length > 0 ? (
            <div className="mt-4 rounded-2xl border border-[color:color-mix(in_srgb,var(--warning)_35%,var(--border))] bg-[color:color-mix(in_srgb,var(--warning)_12%,var(--surface))] p-3 text-sm text-[var(--warning)]">
              {compatibilityAlerts.map((alert) => (
                <p key={`${recipe.id}-${alert.key}`}>
                  {alert.label}: {alert.matchedIngredients.join(", ")}
                </p>
              ))}
            </div>
          ) : null}

          <div className="mt-4 space-y-4">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
              <div>
                <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Mitä tarvitset</p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">Raaka-aineet {selectedServings} annokselle.</p>
              </div>
              <div className="mt-4 space-y-4">
                {groupedIngredients.map((group) => (
                  <div key={`${recipe.id}-${group.label}`} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold tracking-[0.06em] text-[var(--accent)]">{group.label}</p>
                      <p className="text-[11px] font-medium text-[var(--text-subtle)]">{group.rows.length} riviä</p>
                    </div>
                    <ul className="space-y-2 text-sm text-[var(--text-muted)]">
                      {group.rows.map((ingredient) => (
                        <li key={`${recipe.id}-${ingredient.id}`} className="rounded-xl bg-[var(--surface-2)] px-3 py-3 leading-6">
                          {formatRecipeIngredientLine(
                            ingredient,
                            ingredient.ingredientId ? ingredientNameById.get(ingredient.ingredientId) ?? ingredient.ingredientName : ingredient.ingredientName,
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
              <div>
                <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Valmistus</p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">Seuraa vaiheet järjestyksessä. Ryhmät ainesosissa auttavat näkemään nopeasti mikä kuuluu kastikkeeseen, lisukkeeseen tai päälle.</p>
              </div>
              <ol className="mt-4 space-y-3 pl-0 text-sm text-[var(--text-muted)]">
                {splitRecipeInstructions(recipe.instructions).map((step, index) => (
                  <li key={`${recipe.id}-step-${index}`} className="flex gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3">
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

  useEffect(() => {
    if (availableMealTags.length === 0) {
      setSelectedMealTag(null);
      setSelectedRecipeId(null);
      return;
    }

    setSelectedMealTag((current) => (current && availableMealTags.includes(current) ? current : availableMealTags[0]));
  }, [availableMealTags]);

  const selectedMealItems = selectedMealTag ? groupedMealPlanRecipes[selectedMealTag] ?? [] : [];
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
          <CardTitle className="mt-2 text-balance text-2xl leading-tight">Päivän ateriat</CardTitle>
          <CardDescription className="mt-2">
            Valitse ateriaryhmä ja avaa sen alta haluamasi resepti omaan näkymään ilman, että koko lista venyy mobiilissa pitkäksi.
          </CardDescription>
        </div>

        {nutritionProfile ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
              <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Tavoite kcal</p>
              <p className="mt-1 text-xl font-semibold text-[var(--text)]">{nutritionProfile.targetKcal}</p>
            </div>
            <div className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
              <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Proteiini</p>
              <p className="mt-1 text-xl font-semibold text-[var(--text)]">{nutritionProfile.proteinG} g</p>
            </div>
            <div className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
              <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Hiilarit</p>
              <p className="mt-1 text-xl font-semibold text-[var(--text)]">{nutritionProfile.carbsG} g</p>
            </div>
            <div className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
              <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Rasva</p>
              <p className="mt-1 text-xl font-semibold text-[var(--text)]">{nutritionProfile.fatG} g</p>
            </div>
          </div>
        ) : null}

        {assignedPlan ? (
          <>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
              <p className="text-sm font-semibold text-[var(--text)]">{assignedPlan.name}</p>
              {assignedTemplate?.description ? (
                <p className="mt-1 text-sm text-[var(--text-muted)]">{assignedTemplate.description}</p>
              ) : null}
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                Valitse ensin ateriaryhmä ja selaa sen alta sopivia vaihtoehtoja. Kun napautat reseptiä, se aukeaa omaan selkeään reseptinäkymään.
              </p>
            </div>

            {availableMealTags.length > 0 ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2 xl:grid-cols-5">
                  {availableMealTags.map((mealTag) => {
                    const items = groupedMealPlanRecipes[mealTag] ?? [];
                    const selected = selectedMealTag === mealTag;
                    const slotGuidance = mealSlotGuidance(mealTag, nutritionProfile?.targetKcal);

                    return (
                      <button
                        key={mealTag}
                        type="button"
                        className={`min-w-0 rounded-2xl border px-4 py-4 text-left transition ${
                          selected
                            ? "border-[color-mix(in_srgb,var(--accent)_35%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))]"
                            : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)]"
                        }`}
                        onClick={() => {
                          setSelectedMealTag(mealTag);
                          setSelectedRecipeId(null);
                        }}
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

                {selectedMealTag ? (
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-4 px-1">
                      <div>
                        <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">{mealTagLabel(selectedMealTag)}</p>
                        <p className="mt-1 text-sm text-[var(--text-muted)]">Valitse resepti listasta avataksesi tarkemmat tiedot.</p>
                      </div>
                      <p className="text-sm text-[var(--text-muted)]">{selectedMealItems.length} reseptiä</p>
                    </div>

                    <div className="grid gap-3">
                      {selectedMealItems.map((item) => {
                        const recipeNutrition = resolveRecipeNutritionPreview(item.recipe, state.ingredientsCatalog).nutritionPerServing;
                        const isOpen = selectedRecipeId === item.recipe.id;

                        return (
                          <button
                            key={`${item.mealTag}-${item.recipe.id}`}
                            type="button"
                            className={`w-full rounded-2xl border p-4 text-left transition ${
                              isOpen
                                ? "border-[color-mix(in_srgb,var(--accent)_35%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]"
                                : "border-[var(--border)] bg-[var(--surface-2)] hover:bg-[var(--surface)]"
                            }`}
                            onClick={() => {
                              setSelectedServings(Math.max(1, item.recipe.defaultServings));
                              setSelectedRecipeId(item.recipe.id);
                            }}
                          >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <p className="text-lg font-semibold text-[var(--text)]">{item.recipe.name}</p>
                                <p className="mt-1 text-sm text-[var(--text-muted)]">
                                  {item.recipe.description ?? "Valmis ateriasuositus tämän ateriaryhmän sisälle."}
                                </p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {macroPill("kcal", `${recipeNutrition.kcal}`)}
                                  {macroPill("P", `${Math.round(recipeNutrition.proteinG)} g`)}
                                  {macroPill("H", `${Math.round(recipeNutrition.carbsG)} g`)}
                                  {macroPill("R", `${Math.round(recipeNutrition.fatG)} g`)}
                                </div>
                                <p className="mt-3 text-sm font-medium text-[var(--text)]">{isOpen ? "Resepti auki" : "Avaa resepti"}</p>
                              </div>
                              <div className="w-fit shrink-0 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--text)]">
                                {isOpen ? "Auki" : "Avaa"}
                              </div>
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

        {selectedMealTag && selectedRecipeEntry && selectedRecipeNutrition ? (
          <RecipeDetailDialog
            mealTag={selectedMealTag}
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
