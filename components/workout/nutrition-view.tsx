"use client";

import { Check, ChevronRight, Plus, Repeat2, Search, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { OwnRecipeEditor } from "@/components/workout/own-recipe-editor";
import { useKeepScreenOnPreference, useWakeLock } from "@/lib/use-wake-lock";
import {
  getActiveMealPlanForAthlete,
  getMealPlanRecipes,
  mealTagLabel,
  resolveRecipeNutritionPreview,
  splitRecipeInstructions,
} from "@/lib/nutrition";
import type { AppState, DayMealPlanEntry, MealTag, Recipe, UserProfile } from "@/lib/types";
import { useAppState } from "@/providers/app-state-provider";

const MEAL_TAG_ORDER: MealTag[] = ["breakfast", "lunch", "snack", "dinner", "evening_snack"];

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

type Macros = { kcal: number; p: number; c: number; f: number };

function servingMacros(recipe: Recipe, catalog: AppState["ingredientsCatalog"]): Macros {
  const n = resolveRecipeNutritionPreview(recipe, catalog).nutritionPerServing;
  return {
    kcal: Math.round(n?.kcal ?? 0),
    p: Math.round(n?.proteinG ?? 0),
    c: Math.round(n?.carbsG ?? 0),
    f: Math.round(n?.fatG ?? 0),
  };
}

function MacroBar({ label, value, target }: { label: string; value: number; target: number }) {
  const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
  const over = target > 0 && value > target;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold text-[var(--text)]">{label}</span>
        <span className="font-[family-name:var(--font-display)] text-sm tabular-nums text-[var(--text-subtle)]">
          {Math.round(value)} / {target} g
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
        <div
          className={`h-full rounded-full ${over ? "bg-[var(--warning)]" : "bg-[var(--accent)]"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function EnergySplit({ macros }: { macros: Macros }) {
  const pe = macros.p * 4;
  const ce = macros.c * 4;
  const fe = macros.f * 9;
  const tot = pe + ce + fe || 1;
  const seg = (v: number) => `${Math.max(2, Math.round((v / tot) * 100))}%`;
  return (
    <div>
      <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
        <span style={{ width: seg(pe) }} className="rounded-full bg-[var(--accent)]" />
        <span style={{ width: seg(ce) }} className="rounded-full bg-[var(--accent-secondary)]" />
        <span style={{ width: seg(fe) }} className="rounded-full bg-[var(--border-strong)]" />
      </div>
      <div className="mt-2 flex gap-4 text-xs font-semibold text-[var(--text-muted)]">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-[var(--accent)]" aria-hidden="true" />P {macros.p} g
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-[var(--accent-secondary)]" aria-hidden="true" />H {macros.c} g
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-[var(--border-strong)]" aria-hidden="true" />R {macros.f} g
        </span>
      </div>
    </div>
  );
}

export function NutritionView({
  user,
  readOnly = false,
  dayOnly = false,
}: {
  user: UserProfile;
  readOnly?: boolean;
  // Tänään-näkymä: vain Päivä-osio (sama komponentti kuin Ravinto-välilehdellä).
  dayOnly?: boolean;
}) {
  const { state, addDayMeal, swapDayMeal, removeDayMeal, setDayMealEaten } = useAppState();
  const [seg, setSeg] = useState<"day" | "recipes">("day");
  const [filter, setFilter] = useState<MealTag | "all">("all");
  const [query, setQuery] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [detail, setDetail] = useState<{ recipeId: string; entryId?: string } | null>(null);
  const [swapTarget, setSwapTarget] = useState<{ entryId: string; mealTag: MealTag; currentRecipeId: string } | null>(null);
  const [addTag, setAddTag] = useState<MealTag | null>(null);
  const [isMaterializing, setIsMaterializing] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const todayKey = useMemo(() => localDateKey(new Date()), []);
  const catalog = state.ingredientsCatalog;
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
  const eatenRows = dayRows.filter((entry) => entry.eatenAt);
  const consumed = eatenRows.reduce<Macros>(
    (acc, entry) => {
      const recipe = recipeById.get(entry.recipeId);
      if (!recipe) {
        return acc;
      }
      const m = servingMacros(recipe, catalog);
      return {
        kcal: acc.kcal + m.kcal * entry.servings,
        p: acc.p + m.p * entry.servings,
        c: acc.c + m.c * entry.servings,
        f: acc.f + m.f * entry.servings,
      };
    },
    { kcal: 0, p: 0, c: 0, f: 0 },
  );

  const visibleRecipes = useMemo(
    () =>
      state.recipes
        .filter(
          (recipe) =>
            (filter === "all" || recipe.mealTag === filter) &&
            (!query.trim() || recipe.name.toLowerCase().includes(query.trim().toLowerCase())),
        )
        .sort((left, right) => left.name.localeCompare(right.name, "fi")),
    [state.recipes, filter, query],
  );

  const materializeFromPlan = async () => {
    setIsMaterializing(true);
    try {
      for (const [index, item] of basePlan.entries()) {
        await addDayMeal({ planDate: todayKey, mealTag: item.mealTag, recipeId: item.recipe.id, source: "plan", position: index });
      }
    } finally {
      setIsMaterializing(false);
    }
  };

  return (
    <Card className="max-w-full overflow-x-clip [contain:inline-size]">
      {dayOnly ? (
        <div className="flex items-baseline justify-between gap-3">
          <CardTitle>Päivän ateriat</CardTitle>
          {hasDay ? (
            <span className="shrink-0 font-[family-name:var(--font-display)] text-sm font-semibold tabular-nums text-[var(--accent)]">
              {eatenRows.length}/{dayRows.length} syöty
            </span>
          ) : null}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div className="grid w-full grid-cols-2 rounded-xl bg-[var(--surface-2)] p-1">
            <button
              type="button"
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                seg === "day" ? "bg-[var(--surface)] text-[var(--text)] shadow-[0_1px_3px_var(--shadow-soft)]" : "text-[var(--text-muted)]"
              }`}
              aria-pressed={seg === "day"}
              onClick={() => setSeg("day")}
            >
              Päivä
            </button>
            <button
              type="button"
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                seg === "recipes" ? "bg-[var(--surface)] text-[var(--text)] shadow-[0_1px_3px_var(--shadow-soft)]" : "text-[var(--text-muted)]"
              }`}
              aria-pressed={seg === "recipes"}
              onClick={() => setSeg("recipes")}
            >
              Reseptit
            </button>
          </div>
        </div>
      )}

      {dayOnly || seg === "day" ? (
        <div className="mt-5">
          {!dayOnly && nutritionProfile ? (
            <div className="rounded-2xl bg-[var(--surface-2)] p-4">
              <p className="font-[family-name:var(--font-display)] text-4xl font-bold leading-none tabular-nums text-[var(--text)]">
                {Math.round(consumed.kcal)}
                <span className="ml-1.5 text-base font-semibold text-[var(--text-subtle)]">/ {nutritionProfile.targetKcal} kcal</span>
              </p>
              <div className="mt-4 space-y-3">
                <MacroBar label="Proteiini" value={consumed.p} target={nutritionProfile.proteinG} />
                <MacroBar label="Hiilihydraatit" value={consumed.c} target={nutritionProfile.carbsG} />
                <MacroBar label="Rasva" value={consumed.f} target={nutritionProfile.fatG} />
              </div>
            </div>
          ) : null}

          <div className={`flex items-baseline justify-between gap-3 ${dayOnly ? "mt-1" : "mt-5"}`}>
            {dayOnly ? null : (
              <p className="font-[family-name:var(--font-display)] text-xs font-semibold uppercase tracking-[0.05em] text-[var(--text-subtle)]">
                Päivän ateriat
              </p>
            )}
            {!dayOnly && hasDay ? (
              <p className="font-[family-name:var(--font-display)] text-sm font-semibold tabular-nums text-[var(--text-subtle)]">
                {eatenRows.length}/{dayRows.length} syöty
              </p>
            ) : null}
          </div>

          {!hasDay ? (
            <div className="mt-3">
              {basePlan.length > 0 ? (
                <>
                  <div className="divide-y divide-[var(--border)]">
                    {basePlan.map((item, index) => (
                      <div key={`${item.recipe.id}-${index}`} className="flex items-center justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[var(--text)]">{item.recipe.name}</p>
                          <p className="text-xs text-[var(--text-subtle)]">{mealTagLabel(item.mealTag)}</p>
                        </div>
                        <span className="shrink-0 font-[family-name:var(--font-display)] text-sm tabular-nums text-[var(--text-subtle)]">
                          {servingMacros(item.recipe, catalog).kcal} kcal
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
                      onClick={() => void materializeFromPlan()}
                    >
                      Kokoa tämän päivän ateriat
                    </Button>
                  ) : null}
                </>
              ) : (
                <p className="py-6 text-center text-sm text-[var(--text-subtle)]">Ei suunnitelmaa — luo oma resepti Reseptit-välilehdellä.</p>
              )}
            </div>
          ) : (
            <>
              <div className="mt-3 divide-y divide-[var(--border)]">
                {dayRows.map((entry) => {
                  const recipe = recipeById.get(entry.recipeId);
                  const isEaten = Boolean(entry.eatenAt);
                  const isPending = pendingId === entry.id;
                  const m = recipe ? servingMacros(recipe, catalog) : null;
                  return (
                    <div key={entry.id} className="flex items-center gap-3 py-3">
                      {!readOnly ? (
                        <button
                          type="button"
                          className={`grid size-9 shrink-0 place-items-center rounded-full transition ${
                            isEaten ? "bg-[var(--success)] text-white" : "border border-[var(--border-strong)] text-transparent"
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
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => setDetail({ recipeId: entry.recipeId, entryId: entry.id })}
                      >
                        <p className={`truncate text-sm font-semibold ${isEaten ? "text-[var(--text-subtle)]" : "text-[var(--text)]"}`}>
                          {recipe?.name ?? "Tuntematon resepti"}
                        </p>
                        <p className="truncate text-xs text-[var(--text-subtle)]">
                          {mealTagLabel(entry.mealTag)}
                          {m ? ` · ${m.kcal * entry.servings} kcal · P ${m.p * entry.servings} g` : ""}
                        </p>
                      </button>
                      {!readOnly && !isEaten ? (
                        <>
                          <button
                            type="button"
                            className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--surface-2)] text-[var(--text-subtle)] transition hover:text-[var(--accent)]"
                            aria-label="Vaihda ateria"
                            onClick={() => setSwapTarget({ entryId: entry.id, mealTag: entry.mealTag, currentRecipeId: entry.recipeId })}
                          >
                            <Repeat2 className="size-4" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className="grid size-8 shrink-0 place-items-center rounded-full text-[var(--text-subtle)] transition hover:text-[var(--danger)]"
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
                        </>
                      ) : null}
                      <button
                        type="button"
                        className="grid size-8 shrink-0 place-items-center rounded-full text-[var(--text-subtle)] transition hover:text-[var(--text)]"
                        aria-label={`Avaa resepti: ${recipe?.name ?? "resepti"}`}
                        onClick={() => setDetail({ recipeId: entry.recipeId, entryId: entry.id })}
                      >
                        <ChevronRight className="size-4" aria-hidden="true" />
                      </button>
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
        </div>
      ) : (
        <div className="mt-5">
          {!readOnly ? (
            <Button type="button" variant="secondary" className="mb-3 w-full gap-2" onClick={() => setEditorOpen(true)}>
              <Plus className="size-4" aria-hidden="true" />
              Oma resepti
            </Button>
          ) : null}
          <div className="flex items-center gap-2 rounded-xl bg-[var(--surface-2)] px-3 py-2.5">
            <Search className="size-4 shrink-0 text-[var(--text-subtle)]" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Hae reseptiä..."
              className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-subtle)]"
            />
          </div>
          <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
            {(["all", ...MEAL_TAG_ORDER] as const).map((tag) => {
              const active = filter === tag;
              return (
                <button
                  key={tag}
                  type="button"
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    active ? "bg-[var(--text)] text-[var(--background)]" : "bg-[var(--surface-2)] text-[var(--text-muted)]"
                  }`}
                  onClick={() => setFilter(tag)}
                >
                  {tag === "all" ? "Kaikki" : mealTagLabel(tag)}
                </button>
              );
            })}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {visibleRecipes.map((recipe) => {
              const m = servingMacros(recipe, catalog);
              return (
                <button
                  key={recipe.id}
                  type="button"
                  className="flex flex-col gap-2 rounded-2xl bg-[var(--surface-2)] p-3 text-left"
                  onClick={() => setDetail({ recipeId: recipe.id })}
                >
                  <span className="grid h-16 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--surface)_60%,var(--surface-2))] text-[10px] font-medium text-[var(--text-subtle)]">
                    ruokakuva
                  </span>
                  <span>
                    <span className="block text-sm font-semibold leading-tight text-[var(--text)]">{recipe.name}</span>
                    <span className="mt-0.5 block text-xs text-[var(--text-subtle)]">{m.kcal} kcal · P {m.p} g</span>
                  </span>
                  <span className="mt-auto flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-[var(--surface)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-muted)]">
                      {mealTagLabel(recipe.mealTag)}
                    </span>
                    {recipe.ownerRole === "athlete" ? (
                      <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--accent)]">Oma</span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
          {visibleRecipes.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--text-subtle)]">Ei reseptejä tällä haulla.</p>
          ) : null}
        </div>
      )}

      {detail ? (
        <RecipeDetailSheet
          recipe={recipeById.get(detail.recipeId) ?? null}
          catalog={catalog}
          entry={detail.entryId ? dayRows.find((row) => row.id === detail.entryId) ?? null : null}
          readOnly={readOnly}
          onToggleEaten={async (entryId, eaten) => {
            await setDayMealEaten(entryId, eaten);
          }}
          onClose={() => setDetail(null)}
        />
      ) : null}

      {swapTarget ? (
        <MealPickerSheet
          title="Vaihda ateria"
          recipes={state.recipes
            .filter((recipe) => recipe.mealTag === swapTarget.mealTag && recipe.id !== swapTarget.currentRecipeId)
            .sort((left, right) => left.name.localeCompare(right.name, "fi"))}
          catalog={catalog}
          baselineKcal={recipeById.get(swapTarget.currentRecipeId) ? servingMacros(recipeById.get(swapTarget.currentRecipeId)!, catalog).kcal : 0}
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
          mealTag={addTag}
          onChangeMealTag={setAddTag}
          recipes={state.recipes
            .filter((recipe) => recipe.mealTag === addTag)
            .sort((left, right) => left.name.localeCompare(right.name, "fi"))}
          catalog={catalog}
          onClose={() => setAddTag(null)}
          onPick={async (recipeId) => {
            const tag = addTag;
            setAddTag(null);
            const position = dayRows.filter((entry) => entry.mealTag === tag).length;
            await addDayMeal({ planDate: todayKey, mealTag: tag, recipeId, source: "added", position });
          }}
        />
      ) : null}

      {editorOpen ? (
        <OwnRecipeEditor
          onClose={() => setEditorOpen(false)}
          onSaved={() => {
            setEditorOpen(false);
            setSeg("recipes");
          }}
        />
      ) : null}
    </Card>
  );
}

function RecipeDetailSheet({
  recipe,
  catalog,
  entry,
  readOnly,
  onToggleEaten,
  onClose,
}: {
  recipe: Recipe | null;
  catalog: AppState["ingredientsCatalog"];
  entry: DayMealPlanEntry | null;
  readOnly: boolean;
  onToggleEaten: (entryId: string, eaten: boolean) => void | Promise<void>;
  onClose: () => void;
}) {
  const [servings, setServings] = useState(recipe?.defaultServings ?? 1);
  const [isPending, setIsPending] = useState(false);
  // Pidä näyttö päällä reseptiä lukiessa (laitekohtainen preferenssi, sama kuin
  // treenin kirjauksessa). Sheet on mountattuna vain kun resepti on auki.
  const [keepScreenOn] = useKeepScreenOnPreference();
  useWakeLock(keepScreenOn);
  if (!recipe) {
    return null;
  }

  const macros = servingMacros(recipe, catalog);
  const steps = splitRecipeInstructions(recipe.instructions).filter(Boolean);
  const perServingScale = recipe.defaultServings > 0 ? servings / recipe.defaultServings : servings;
  const isEaten = Boolean(entry?.eatenAt);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[color:color-mix(in_srgb,var(--background)_48%,transparent)] p-0 sm:items-center sm:p-4" role="presentation">
      <div role="dialog" aria-modal="true" aria-label={recipe.name} className="flex max-h-[88vh] w-full max-w-lg flex-col rounded-t-3xl bg-[var(--surface)] p-5 shadow-[0_24px_60px_-24px_var(--shadow)] sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--accent)]">
              {mealTagLabel(recipe.mealTag)}
              {recipe.ownerRole === "athlete" ? " · Oma resepti" : ""}
            </p>
            <h2 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-bold leading-tight text-[var(--text)]">{recipe.name}</h2>
          </div>
          <button type="button" className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--surface-2)] text-[var(--text-subtle)]" aria-label="Sulje" onClick={onClose}>
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
          <p className="font-[family-name:var(--font-display)] text-4xl font-bold leading-none tabular-nums text-[var(--text)]">
            {macros.kcal}
            <span className="ml-1.5 text-base font-semibold text-[var(--text-subtle)]">kcal / annos</span>
          </p>
          <div className="mt-3">
            <EnergySplit macros={macros} />
          </div>

          <div className="mt-6 flex items-center justify-between">
            <p className="font-[family-name:var(--font-display)] text-xs font-semibold uppercase tracking-[0.05em] text-[var(--text-subtle)]">Ainekset</p>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold tabular-nums text-[var(--text-subtle)]">{servings} {servings === 1 ? "annos" : "annosta"}</span>
              <div className="flex overflow-hidden rounded-lg bg-[var(--surface-2)]">
                <button type="button" className="grid h-8 w-9 place-items-center text-[var(--text)]" aria-label="Vähemmän annoksia" onClick={() => setServings((s) => Math.max(1, s - 1))}>−</button>
                <button type="button" className="grid h-8 w-9 place-items-center text-[var(--text)]" aria-label="Enemmän annoksia" onClick={() => setServings((s) => Math.min(12, s + 1))}>+</button>
              </div>
            </div>
          </div>
          <div className="mt-2 divide-y divide-[var(--border)]">
            {recipe.ingredients.map((ing) => (
              <div key={ing.id} className="py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-[var(--text)]">{ing.ingredientName}</span>
                  {ing.quantity !== undefined ? (
                    <span className="shrink-0 font-[family-name:var(--font-display)] text-sm tabular-nums text-[var(--text-subtle)]">
                      {Math.round(ing.quantity * perServingScale)} {ing.unit}
                    </span>
                  ) : null}
                </div>
                {ing.alternatives && ing.alternatives.length > 0 ? (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {ing.alternatives.map((alt) => (
                      <span key={alt} className="rounded-full bg-[var(--surface-2)] px-2.5 py-0.5 text-xs text-[var(--text-muted)]">
                        ⇄ {alt}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          {steps.length > 0 ? (
            <>
              <p className="mt-6 font-[family-name:var(--font-display)] text-xs font-semibold uppercase tracking-[0.05em] text-[var(--text-subtle)]">Valmistus</p>
              <div className="mt-2 space-y-2.5">
                {steps.map((step, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--surface-2)] font-[family-name:var(--font-display)] text-xs font-bold text-[var(--text)]">
                      {index + 1}
                    </span>
                    <span className="pt-0.5 text-sm text-[var(--text-muted)]">{step}</span>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>

        {entry && !readOnly ? (
          <Button
            type="button"
            variant={isEaten ? "secondary" : "primary"}
            className="mt-4 w-full gap-2"
            loading={isPending}
            onClick={async () => {
              setIsPending(true);
              try {
                await onToggleEaten(entry.id, !isEaten);
                onClose();
              } finally {
                setIsPending(false);
              }
            }}
          >
            {isEaten ? "Syöty tänään · peru merkintä" : "Merkitse syödyksi"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function MealPickerSheet({
  title,
  recipes,
  catalog,
  baselineKcal,
  mealTag,
  onChangeMealTag,
  onClose,
  onPick,
}: {
  title: string;
  recipes: Recipe[];
  catalog: AppState["ingredientsCatalog"];
  baselineKcal?: number;
  mealTag?: MealTag;
  onChangeMealTag?: (tag: MealTag) => void;
  onClose: () => void;
  onPick: (recipeId: string) => void | Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const filtered = recipes.filter((recipe) => recipe.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[color:color-mix(in_srgb,var(--background)_48%,transparent)] p-0 sm:items-center sm:p-4" role="presentation">
      <div role="dialog" aria-modal="true" aria-label={title} className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-t-3xl bg-[var(--surface)] p-5 shadow-[0_24px_60px_-24px_var(--shadow)] sm:rounded-3xl">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--text)]">{title}</h2>
          <button type="button" className="grid size-8 place-items-center rounded-full bg-[var(--surface-2)] text-[var(--text-subtle)]" aria-label="Sulje" onClick={onClose}>
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

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
          className="mt-3 w-full rounded-xl bg-[var(--surface-2)] px-4 py-2.5 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-subtle)]"
        />

        <div className="mt-3 min-h-0 flex-1 divide-y divide-[var(--border)] overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--text-subtle)]">Ei reseptejä tälle ateriapaikalle.</p>
          ) : (
            filtered.map((recipe) => {
              const kcal = servingMacros(recipe, catalog).kcal;
              const diff = baselineKcal !== undefined ? kcal - baselineKcal : null;
              return (
                <button key={recipe.id} type="button" className="flex w-full items-center justify-between gap-3 py-3 text-left" onClick={() => void onPick(recipe.id)}>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold text-[var(--text)]">{recipe.name}</span>
                      {recipe.ownerRole === "athlete" ? (
                        <span className="shrink-0 rounded-full bg-[var(--accent-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--accent)]">Oma</span>
                      ) : null}
                    </span>
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
