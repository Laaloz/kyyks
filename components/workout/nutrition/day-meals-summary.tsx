"use client";

import { Check, ChevronRight } from "lucide-react";
import { useMemo } from "react";

import { Card, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  adHocEntryMacros,
  getVisibleRecipesForUser,
  mealTagLabel,
  resolveRecipeNutritionPreview,
} from "@/lib/nutrition";
import type { DayMealPlanEntry, MealTag, UserProfile } from "@/lib/types";
import { useAppState } from "@/providers/app-state-provider";

const MEAL_TAG_ORDER: MealTag[] = ["breakfast", "lunch", "snack", "dinner", "evening_snack"];

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Tänään-näkymän kevyt yhteenveto päivän aterioista. Pelkkä esitys (read-only):
 * näyttää aterialistan ja syöty-laskurin, napautus avaa Ravinto-välilehden, jossa
 * ateriat lisätään, merkitään syödyksi ja muokataan. Pitää aterioiden hallinnan
 * yhdessä paikassa, ettei sama interaktiopinta toistu kahdessa näkymässä.
 */
export function DayMealsSummary({ user, onOpen }: { user: UserProfile; onOpen?: () => void }) {
  const { state } = useAppState();
  const todayKey = useMemo(() => localDateKey(new Date()), []);
  const catalog = state.ingredientsCatalog;
  const recipeById = useMemo(
    () => new Map(getVisibleRecipesForUser(state, user).map((recipe) => [recipe.id, recipe])),
    [state, user],
  );

  const dayRows = useMemo(
    () =>
      (state.dayMealPlans ?? [])
        .filter((entry) => entry.athleteId === user.id && entry.planDate === todayKey)
        .sort((left, right) => {
          const tagDelta = MEAL_TAG_ORDER.indexOf(left.mealTag) - MEAL_TAG_ORDER.indexOf(right.mealTag);
          if (tagDelta !== 0) return tagDelta;
          if (left.position !== right.position) return left.position - right.position;
          const createdDelta = (left.createdAt ?? "").localeCompare(right.createdAt ?? "");
          return createdDelta !== 0 ? createdDelta : left.id.localeCompare(right.id);
        }),
    [state.dayMealPlans, todayKey, user.id],
  );

  const entryKcal = (entry: DayMealPlanEntry): number => {
    if (entry.recipeId) {
      const recipe = recipeById.get(entry.recipeId);
      if (!recipe) return 0;
      const perServing = resolveRecipeNutritionPreview(recipe, catalog).nutritionPerServing;
      return Math.round((perServing?.kcal ?? 0) * entry.servings);
    }
    if (entry.foodName) {
      return Math.round(adHocEntryMacros(entry).kcal);
    }
    return 0;
  };

  const entryLabel = (entry: DayMealPlanEntry): string =>
    entry.recipeId ? (recipeById.get(entry.recipeId)?.name ?? "Resepti") : (entry.foodName?.trim() || "Ruoka");

  const hasDay = dayRows.length > 0;
  const eatenCount = dayRows.filter((entry) => entry.eatenAt).length;

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen?.();
        }
      }}
      aria-label="Avaa Ravinto-välilehti"
      className="cursor-pointer text-left transition hover:border-[var(--border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
    >
      <div className="flex items-baseline justify-between gap-3">
        <CardTitle>Päivän ateriat</CardTitle>
        {hasDay ? (
          <span className="shrink-0 font-[family-name:var(--font-display)] text-sm font-semibold tabular-nums text-[var(--accent)]">
            {eatenCount}/{dayRows.length} syöty
          </span>
        ) : null}
      </div>

      {hasDay ? (
        <div className="mt-3 divide-y divide-[var(--border)]">
          {dayRows.map((entry) => {
            const isEaten = Boolean(entry.eatenAt);
            return (
              <div key={entry.id} className="flex items-center gap-3 py-2.5">
                <span
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-full",
                    isEaten ? "bg-[var(--success)] text-white" : "border border-[var(--border-strong)] text-transparent",
                  )}
                  aria-hidden="true"
                >
                  <Check className="size-3.5 stroke-[2.5]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "truncate text-sm font-semibold",
                      isEaten ? "text-[var(--text-subtle)]" : "text-[var(--text)]",
                    )}
                  >
                    {entryLabel(entry)}
                  </p>
                  <p className="truncate text-xs text-[var(--text-subtle)]">
                    {mealTagLabel(entry.mealTag)} · {entryKcal(entry)} kcal
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-3 text-sm text-[var(--text-muted)]">
          Ei vielä aterioita tänään. Avaa Ravinto lisätäksesi.
        </p>
      )}

      <div className="mt-4 flex items-center justify-end gap-1 text-sm font-semibold text-[var(--accent)]">
        Avaa Ravinto
        <ChevronRight className="size-4" aria-hidden="true" />
      </div>
    </Card>
  );
}
