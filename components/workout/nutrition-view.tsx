"use client";

import { BookOpen, Check, ChevronRight, Loader2, Plus, Repeat2, Search, Sparkles, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import { AddFoodSheet, FoodEntryEditSheet } from "@/components/workout/add-food-sheet";
import { useHeaderAction } from "@/components/workout/header-action";
import { OwnRecipeEditor } from "@/components/workout/own-recipe-editor";
import { useKeepScreenOnPreference, useWakeLock } from "@/lib/use-wake-lock";
import { cn } from "@/lib/utils";
import {
  adHocEntryMacros,
  buildPersonalNutritionGoalComparison,
  getActiveMealPlanForAthlete,
  getMissingMacroProfileFields,
  getVisibleRecipesForUser,
  inferMealTagForTime,
  mealTagLabel,
  resolveRecipeNutritionPreview,
  splitRecipeInstructions,
} from "@/lib/nutrition";
import type { AppState, DayMealPlanEntry, MealTag, Recipe, UserProfile } from "@/lib/types";
import { isSupabaseConfigured } from "@/lib/config";
import { useAppState } from "@/providers/app-state-provider";

const MEAL_TAG_ORDER: MealTag[] = ["breakfast", "lunch", "snack", "dinner", "evening_snack"];

const missingFieldLabel: Record<"age" | "sex" | "heightCm" | "weightKg", string> = {
  age: "ikä",
  sex: "sukupuoli",
  heightCm: "pituus",
  weightKg: "paino",
};

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
  onOpenSettings,
  onOpenMeasurements,
}: {
  user: UserProfile;
  readOnly?: boolean;
  // Tänään-näkymä: vain Päivä-osio (sama komponentti kuin Ravinto-välilehdellä).
  dayOnly?: boolean;
  onOpenSettings?: () => void;
  onOpenMeasurements?: () => void;
}) {
  const { state, addDayMeal, swapDayMeal, removeDayMeal, setDayMealEaten, quickAddAiFood, saveDayMealFood } = useAppState();
  const [seg, setSeg] = useState<"day" | "recipes">("day");
  const [filter, setFilter] = useState<MealTag | "all">("all");
  const [query, setQuery] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editRecipe, setEditRecipe] = useState<Recipe | null>(null);
  const [detail, setDetail] = useState<{ recipeId: string; entryId?: string } | null>(null);
  const [swapTarget, setSwapTarget] = useState<{ entryId: string; mealTag: MealTag; currentRecipeId: string } | null>(null);
  const [addTag, setAddTag] = useState<MealTag | null>(null);
  const [addFoodOpen, setAddFoodOpen] = useState(false);
  // Yksi "Lisää ateriaan" -sisäänmeno → valikko (AI:lla / Reseptit).
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [editFoodEntry, setEditFoodEntry] = useState<DayMealPlanEntry | null>(null);
  // Ravinto-välilehden "+ Oma resepti" nostetaan yläpalkkiin (ei Tänään-dayOnly-tilassa).
  useHeaderAction(
    "nutrition",
    !dayOnly && !readOnly
      ? {
          label: "Oma resepti",
          icon: Plus,
          onClick: () => {
            setSeg("recipes");
            setEditRecipe(null);
            setEditorOpen(true);
          },
        }
      : null,
  );
  const [isMaterializing, setIsMaterializing] = useState(false);
  const isMaterializingRef = useRef(false);
  const [materializeMessage, setMaterializeMessage] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);

  const todayKey = useMemo(() => localDateKey(new Date()), []);
  const catalog = state.ingredientsCatalog;
  const visibleRecipeSource = useMemo(() => getVisibleRecipesForUser(state, user), [state, user]);
  const recipeById = useMemo(() => new Map(visibleRecipeSource.map((recipe) => [recipe.id, recipe])), [visibleRecipeSource]);
  const assignedPlan = useMemo(() => getActiveMealPlanForAthlete(state, user.id), [state, user.id]);
  const basePlan = useMemo(
    () =>
      assignedPlan
        ? assignedPlan.items
            .slice()
            .sort((left, right) => left.sortOrder - right.sortOrder)
            .flatMap((item) => {
              const recipe = recipeById.get(item.recipeId);
              return recipe ? [{ mealTag: item.mealTag, recipe }] : [];
            })
        : [],
    [assignedPlan, recipeById],
  );
  // Jaettu ateriapohja on valikko, ei valmis päivä: yhdellä ateriatyypillä voi
  // olla useita reseptejä. Esikatselu ja "Kokoa" käyttävät tästä yhtä reseptiä
  // per ateriatyyppi (ensimmäinen sortOrderin mukaan), ateriatyyppijärjestyksessä.
  const plannedDay = useMemo(() => {
    const seen = new Set<MealTag>();
    const picked: { mealTag: MealTag; recipe: Recipe }[] = [];
    for (const item of basePlan) {
      if (seen.has(item.mealTag)) {
        continue;
      }
      seen.add(item.mealTag);
      picked.push(item);
    }
    return picked.sort(
      (left, right) => MEAL_TAG_ORDER.indexOf(left.mealTag) - MEAL_TAG_ORDER.indexOf(right.mealTag),
    );
  }, [basePlan]);
  const nutritionProfile = state.nutritionProfiles.find((profile) => profile.userId === user.id) ?? null;
  const nutritionComparison = buildPersonalNutritionGoalComparison(user, nutritionProfile);
  const macroTarget = nutritionComparison?.activeTarget ?? null;
  const missingMacroFields = getMissingMacroProfileFields(user);
  const missingSettingsLabels = missingMacroFields.filter((field) => field !== "weightKg").map((field) => missingFieldLabel[field]);
  const hasMissingSettings = missingSettingsLabels.length > 0;
  const hasMissingWeight = missingMacroFields.includes("weightKg");

  const dayRows = useMemo(
    () =>
      (state.dayMealPlans ?? [])
        .filter((entry) => entry.athleteId === user.id && entry.planDate === todayKey)
        .sort((left, right) => {
          const tagDelta = MEAL_TAG_ORDER.indexOf(left.mealTag) - MEAL_TAG_ORDER.indexOf(right.mealTag);
          if (tagDelta !== 0) return tagDelta;
          if (left.position !== right.position) return left.position - right.position;
          // Tasapelin (esim. nopeat lisäykset samalla positiolla) deterministinen ratkaisu,
          // jottei järjestys sekoa refetchissä.
          const createdDelta = (left.createdAt ?? "").localeCompare(right.createdAt ?? "");
          return createdDelta !== 0 ? createdDelta : left.id.localeCompare(right.id);
        }),
    [state.dayMealPlans, todayKey, user.id],
  );
  const hasDay = dayRows.length > 0;
  const eatenRows = dayRows.filter((entry) => entry.eatenAt);
  // Päiväkirjarivin makrot: resepti (reseptin ainekset × annokset) tai ad hoc -ruoka
  // (snapshot per 100 g × grammat). Palauttaa null jos reseptiä ei löydy.
  const entryMacros = (entry: DayMealPlanEntry): Macros | null => {
    if (entry.recipeId) {
      const recipe = recipeById.get(entry.recipeId);
      if (!recipe) {
        return null;
      }
      const m = servingMacros(recipe, catalog);
      return { kcal: m.kcal * entry.servings, p: m.p * entry.servings, c: m.c * entry.servings, f: m.f * entry.servings };
    }
    if (entry.foodName) {
      return adHocEntryMacros(entry);
    }
    return null;
  };
  const consumed = eatenRows.reduce<Macros>(
    (acc, entry) => {
      const m = entryMacros(entry);
      if (!m) {
        return acc;
      }
      return { kcal: acc.kcal + m.kcal, p: acc.p + m.p, c: acc.c + m.c, f: acc.f + m.f };
    },
    { kcal: 0, p: 0, c: 0, f: 0 },
  );

  const visibleRecipes = useMemo(
    () =>
      visibleRecipeSource
        .filter(
          (recipe) =>
            (filter === "all" || recipe.mealTag === filter) &&
            (!query.trim() || recipe.name.toLowerCase().includes(query.trim().toLowerCase())),
        )
        .sort((left, right) => left.name.localeCompare(right.name, "fi")),
    [visibleRecipeSource, filter, query],
  );

  const materializeFromPlan = async () => {
    if (isMaterializingRef.current) {
      return;
    }

    isMaterializingRef.current = true;
    setIsMaterializing(true);
    setMaterializeMessage("");
    try {
      const existingPlanMealTags = new Set(
        dayRows
          .filter((entry) => entry.source === "plan")
          .map((entry) => entry.mealTag),
      );
      const rowsToAdd = plannedDay
        .map((item, index) => ({ item, position: index }))
        .filter(({ item }) => !existingPlanMealTags.has(item.mealTag));
      if (rowsToAdd.length === 0) {
        return;
      }

      const results = await Promise.all(
        rowsToAdd.map(({ item, position }) =>
          addDayMeal({ planDate: todayKey, mealTag: item.mealTag, recipeId: item.recipe.id, source: "plan", position }),
        ),
      );
      const failed = results.find((result) => !result.ok);
      if (failed) {
        setMaterializeMessage(failed.message);
      }
    } finally {
      isMaterializingRef.current = false;
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
        <Segmented
          ariaLabel="Päivä tai reseptit"
          value={seg}
          onChange={setSeg}
          options={[
            { value: "day", label: "Päivä" },
            { value: "recipes", label: "Reseptit" },
          ]}
        />
      )}

      {dayOnly || seg === "day" ? (
        <div className={dayOnly ? "" : "mt-5"}>
          {!dayOnly && macroTarget ? (
            <div className="rounded-2xl bg-[var(--surface-2)] p-4">
              <p className="font-[family-name:var(--font-display)] text-4xl font-bold leading-none tabular-nums text-[var(--text)]">
                {Math.round(consumed.kcal)}
                <span className="ml-1.5 text-base font-semibold text-[var(--text-subtle)]">/ {macroTarget.kcal} kcal</span>
              </p>
              {nutritionComparison?.activeTargetSource === "auto_fallback" ? (
                <p className="mt-1 text-xs font-medium text-[var(--text-subtle)]">Arvio profiilitiedoista</p>
              ) : null}
              <div className="mt-4 space-y-3">
                <MacroBar label="Proteiini" value={consumed.p} target={macroTarget.proteinG} />
                <MacroBar label="Hiilihydraatit" value={consumed.c} target={macroTarget.carbsG} />
                <MacroBar label="Rasva" value={consumed.f} target={macroTarget.fatG} />
              </div>
            </div>
          ) : !dayOnly ? (
            <div className="rounded-2xl bg-[color-mix(in_srgb,var(--warning)_10%,var(--surface))] p-4">
              <p className="text-sm font-semibold text-[var(--text)]">Täydennä tiedot, niin saat makrot näkyviin</p>
              <p className="mt-1 text-sm leading-5 text-[var(--text-muted)]">
                Makrot lasketaan, kun profiilin tiedot ja viimeisin paino ovat kunnossa.
              </p>
              {hasMissingSettings ? (
                <p className="mt-2 text-xs font-medium text-[var(--text-subtle)]">
                  Asetuksista puuttuu: {missingSettingsLabels.join(", ")}.
                </p>
              ) : null}
              {hasMissingWeight ? (
                <p className="mt-2 text-xs font-medium text-[var(--text-subtle)]">
                  Keho-näkymästä puuttuu: paino.
                </p>
              ) : null}
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                {onOpenSettings && hasMissingSettings ? (
                  <Button type="button" variant="secondary" onClick={onOpenSettings}>
                    Avaa asetukset
                  </Button>
                ) : null}
                {onOpenMeasurements && hasMissingWeight ? (
                  <Button type="button" variant="secondary" onClick={onOpenMeasurements}>
                    Avaa Keho
                  </Button>
                ) : null}
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
              {plannedDay.length > 0 ? (
                <>
                  <div className="divide-y divide-[var(--border)]">
                    {plannedDay.map((item, index) => (
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
                    <div className="mt-4 grid gap-2">
                      <Button
                        type="button"
                        className="w-full"
                        loading={isMaterializing}
                        loadingText="Kootaan päivää..."
                        onClick={() => void materializeFromPlan()}
                      >
                        Kokoa tämän päivän ateriat
                      </Button>
                      {materializeMessage ? (
                        <p className="text-sm text-[var(--danger)]" role="alert">
                          {materializeMessage}
                        </p>
                      ) : null}
                      <Button type="button" variant="secondary" className="w-full gap-2" onClick={() => setAddMenuOpen(true)}>
                        <Plus className="size-4" aria-hidden="true" />
                        Lisää ateriaan
                      </Button>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-2)] px-4 py-5 text-center">
                  <p className="text-sm text-[var(--text-subtle)]">Ei vielä aterioita tälle päivälle.</p>
                  {!readOnly ? (
                    <div className="mt-4 grid gap-2">
                      <Button type="button" variant="secondary" className="w-full gap-2" onClick={() => setAddMenuOpen(true)}>
                        <Plus className="size-4" aria-hidden="true" />
                        Lisää ateriaan
                      </Button>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="mt-3 divide-y divide-[var(--border)]">
                {dayRows.map((entry) => {
                  const recipe = entry.recipeId ? recipeById.get(entry.recipeId) : undefined;
                  const isAdHoc = !entry.recipeId;
                  // Jumiin jäänyt "pending" (esim. AI ei vastannut, sessio katkesi) merkitään
                  // vanhentumisen jälkeen muokattavaksi, ettei se jää ikuisesti "arvioidaan"-tilaan.
                  const updatedMs = Date.parse(entry.updatedAt);
                  const isStalePending =
                    entry.aiStatus === "pending" && Number.isFinite(updatedMs) && Date.now() - updatedMs > 120_000;
                  const aiPending = entry.aiStatus === "pending" && !isStalePending;
                  const aiFailed = entry.aiStatus === "failed" || isStalePending;
                  // AI generoi vielä makroja → lukitaan kortti (ei muokkausta/syödyksi-merkintää
                  // keskeneräisillä 0-arvoilla). Disable on sidottu vain aiPendingiin: kun arvio
                  // valmistuu (aiStatus=null) tai epäonnistuu (aiFailed / stale), lukko poistuu itsestään.
                  const aiDisabled = aiPending;
                  const isEaten = Boolean(entry.eatenAt);
                  const isPending = pendingId === entry.id;
                  const m = entryMacros(entry);
                  const title = recipe?.name ?? entry.foodName ?? "Tuntematon ateria";
                  const macroLine = `${mealTagLabel(entry.mealTag)}${isAdHoc && entry.grams ? ` · ${Math.round(entry.grams)} g` : ""}${m ? ` · ${Math.round(m.kcal)} kcal · P ${Math.round(m.p)} g` : ""}`;
                  const subtitle = aiPending
                    ? "Arvioidaan tekoälyllä…"
                    : aiFailed
                      ? `${mealTagLabel(entry.mealTag)} · arvio ei onnistunut — muokkaa`
                      : macroLine;
                  return (
                    <div
                      key={entry.id}
                      className={cn("flex items-center gap-3 py-3 transition-opacity", aiDisabled && "opacity-60")}
                      aria-busy={aiDisabled || undefined}
                    >
                      {!readOnly ? (
                        <button
                          type="button"
                          className={`grid size-9 shrink-0 place-items-center rounded-full transition ${
                            isEaten ? "bg-[var(--success)] text-white" : "border border-[var(--border-strong)] text-transparent"
                          } disabled:cursor-not-allowed`}
                          aria-pressed={isEaten}
                          aria-label={isEaten ? "Merkitse syömättömäksi" : "Merkitse syödyksi"}
                          disabled={isPending || aiDisabled}
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
                      {recipe ? (
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left"
                          onClick={() => setDetail({ recipeId: recipe.id, entryId: entry.id })}
                        >
                          <p
                            className={cn(
                              "truncate text-sm font-semibold",
                              aiDisabled ? "ai-shimmer-text" : isEaten ? "text-[var(--text-subtle)]" : "text-[var(--text)]",
                            )}
                          >
                            {title}
                          </p>
                          <p className={cn("truncate text-xs", aiDisabled ? "ai-shimmer-text" : "text-[var(--text-subtle)]")}>
                            {subtitle}
                          </p>
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left disabled:cursor-not-allowed"
                          disabled={aiDisabled}
                          aria-disabled={aiDisabled || undefined}
                          onClick={() => setEditFoodEntry(entry)}
                        >
                          <p
                            className={cn(
                              "truncate text-sm font-semibold",
                              aiDisabled ? "ai-shimmer-text" : isEaten ? "text-[var(--text-subtle)]" : "text-[var(--text)]",
                            )}
                          >
                            {title}
                          </p>
                          <p className={cn("truncate text-xs", aiDisabled ? "ai-shimmer-text" : "text-[var(--text-subtle)]")}>
                            {subtitle}
                          </p>
                        </button>
                      )}
                      {!readOnly ? (
                        <>
                          {recipe ? (
                            <button
                              type="button"
                              className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--surface-2)] text-[var(--text-subtle)] transition hover:text-[var(--accent)] disabled:opacity-40 disabled:hover:text-[var(--text-subtle)]"
                              aria-label="Vaihda ateria"
                              disabled={isEaten || isPending}
                              onClick={() => setSwapTarget({ entryId: entry.id, mealTag: entry.mealTag, currentRecipeId: recipe.id })}
                            >
                              <Repeat2 className="size-4" aria-hidden="true" />
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="grid size-8 shrink-0 place-items-center rounded-full text-[var(--text-subtle)] transition hover:text-[var(--danger)] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:text-[var(--text-subtle)]"
                            aria-label="Poista ateria"
                            disabled={isEaten || isPending}
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
                      {recipe ? (
                        <button
                          type="button"
                          className="grid size-8 shrink-0 place-items-center rounded-full text-[var(--text-subtle)] transition hover:text-[var(--text)]"
                          aria-label={`Avaa resepti: ${recipe.name}`}
                          onClick={() => setDetail({ recipeId: recipe.id, entryId: entry.id })}
                        >
                          <ChevronRight className="size-4" aria-hidden="true" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="grid size-8 shrink-0 place-items-center rounded-full text-[var(--text-subtle)] transition hover:text-[var(--text)] disabled:cursor-not-allowed disabled:hover:text-[var(--text-subtle)]"
                          aria-label={aiDisabled ? "Arvioidaan tekoälyllä…" : `Muokkaa: ${title}`}
                          disabled={aiDisabled}
                          onClick={() => setEditFoodEntry(entry)}
                        >
                          {aiDisabled ? (
                            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                          ) : (
                            <ChevronRight className="size-4" aria-hidden="true" />
                          )}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              {!readOnly ? (
                <div className="mt-4 grid gap-2">
                  <Button type="button" variant="secondary" className="w-full gap-2" onClick={() => setAddMenuOpen(true)}>
                    <Plus className="size-4" aria-hidden="true" />
                    Lisää ateriaan
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : (
        <div className="mt-5">
          {/* "+ Oma resepti" on nyt yläpalkissa (useHeaderAction). */}
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
          {/* Full-bleed: chipit scrollaavat kortin reunaan asti (ei valkoista
              padding-kaistaa päälle). Negatiivinen marginaali kumoaa kortin p-4/sm:p-5. */}
          <div className="-mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:-mx-5 sm:px-5">
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
                  <span
                    className="grid h-16 place-items-center rounded-xl text-[10px] font-medium text-[var(--text-subtle)]"
                    style={{
                      // Raidat kontrastaavat surface-2-kortin kanssa (pohja oli ennen sama → näkymätön).
                      backgroundImage:
                        "repeating-linear-gradient(-45deg, var(--surface) 0 8px, var(--surface-3) 8px 16px)",
                    }}
                  >
                    ruokakuva
                  </span>
                  <span>
                    <span className="block text-sm font-semibold leading-tight text-[var(--text)] [overflow-wrap:anywhere]">{recipe.name}</span>
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
          onEdit={
            !readOnly &&
            recipeById.get(detail.recipeId)?.ownerRole === "athlete" &&
            recipeById.get(detail.recipeId)?.createdBy === user.id
              ? () => {
                  const target = recipeById.get(detail.recipeId);
                  if (!target) {
                    return;
                  }
                  setDetail(null);
                  setEditRecipe(target);
                  setSeg("recipes");
                  setEditorOpen(true);
                }
              : undefined
          }
        />
      ) : null}

      {swapTarget ? (
        <MealPickerSheet
          title="Vaihda ateria"
          recipes={visibleRecipeSource
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

      {addMenuOpen ? (
        <Sheet ariaLabel="Lisää ateriaan" onClose={() => setAddMenuOpen(false)}>
          <h2 className="font-[family-name:var(--font-display)] text-lg font-bold text-[var(--text)]">Lisää ateriaan</h2>
          <div className="mt-3 grid gap-2">
            <button
              type="button"
              className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-left transition hover:border-[var(--border-strong)]"
              onClick={() => {
                setAddMenuOpen(false);
                setAddFoodOpen(true);
              }}
            >
              <Sparkles className="size-5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
              <span className="text-sm font-semibold text-[var(--text)]">AI:lla</span>
            </button>
            <button
              type="button"
              className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-left transition hover:border-[var(--border-strong)]"
              onClick={() => {
                setAddMenuOpen(false);
                setAddTag("breakfast");
              }}
            >
              <BookOpen className="size-5 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
              <span className="text-sm font-semibold text-[var(--text)]">Reseptit</span>
            </button>
          </div>
        </Sheet>
      ) : null}

      {addTag ? (
        <MealPickerSheet
          title="Lisää resepti"
          mealTag={addTag}
          onChangeMealTag={setAddTag}
          recipes={visibleRecipeSource
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

      {addFoodOpen ? (
        <AddFoodSheet
          userId={user.id}
          catalog={catalog}
          aiEnabled={isSupabaseConfigured}
          onClose={() => setAddFoodOpen(false)}
          onLogOwnFood={async (ingredientId, grams) => {
            // Ateriapaikka päätellään kellonajasta (ei valitsinta lisäysnäkymässä).
            const mealTag = inferMealTagForTime(new Date());
            const position = dayRows.filter((entry) => entry.mealTag === mealTag).length;
            return addDayMeal({ planDate: todayKey, mealTag, position, ingredientId, grams });
          }}
          onQuickAdd={async (name) => {
            const mealTag = inferMealTagForTime(new Date());
            const position = dayRows.filter((entry) => entry.mealTag === mealTag).length;
            return quickAddAiFood({ planDate: todayKey, mealTag, position, name });
          }}
          onQuickAddPhoto={async ({ imageBase64, mimeType }) => {
            const mealTag = inferMealTagForTime(new Date());
            const position = dayRows.filter((entry) => entry.mealTag === mealTag).length;
            return quickAddAiFood({ planDate: todayKey, mealTag, position, name: "Kuva-arvio", imageBase64, mimeType });
          }}
        />
      ) : null}

      {editFoodEntry ? (
        <FoodEntryEditSheet
          entry={editFoodEntry}
          aiEnabled={isSupabaseConfigured}
          onClose={() => setEditFoodEntry(null)}
          onSave={async (values) =>
            saveDayMealFood(editFoodEntry.id, {
              name: values.name,
              grams: values.grams,
              kcalPer100: values.kcalPer100,
              proteinPer100: values.proteinPer100,
              carbsPer100: values.carbsPer100,
              fatPer100: values.fatPer100,
              saveToMyFoods: values.saveToMyFoods,
            })
          }
        />
      ) : null}

      {editorOpen ? (
        <OwnRecipeEditor
          initialRecipe={editRecipe}
          onClose={() => {
            setEditorOpen(false);
            setEditRecipe(null);
          }}
          onSaved={() => {
            setEditorOpen(false);
            setEditRecipe(null);
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
  onEdit,
}: {
  recipe: Recipe | null;
  catalog: AppState["ingredientsCatalog"];
  entry: DayMealPlanEntry | null;
  readOnly: boolean;
  onToggleEaten: (entryId: string, eaten: boolean) => void | Promise<void>;
  onClose: () => void;
  onEdit?: () => void;
}) {
  const [servings, setServings] = useState(recipe?.defaultServings ?? 1);
  const [isPending, setIsPending] = useState(false);
  // Per-aines valittu vaihtoehto: -1 = alkuperäinen, >=0 = indeksi alternativeOptionsiin.
  const [altByIngredient, setAltByIngredient] = useState<Record<string, number>>({});
  // Pidä näyttö päällä reseptiä lukiessa (laitekohtainen preferenssi, sama kuin
  // treenin kirjauksessa). Sheet on mountattuna vain kun resepti on auki.
  const [keepScreenOn] = useKeepScreenOnPreference();
  useWakeLock(keepScreenOn);
  if (!recipe) {
    return null;
  }

  // Kun jokin vaihtoehto on valittu, lasketaan makrot uudelleen aineksista (ohitetaan
  // tallennettu cache rakentamalla efektiivinen resepti valituilla aineksilla).
  const hasAltSelection = Object.values(altByIngredient).some((value) => value >= 0);
  const effectiveRecipe: Recipe = hasAltSelection
    ? {
        ...recipe,
        nutritionPerServing: undefined,
        nutritionPerRecipe: undefined,
        ingredients: recipe.ingredients.map((ing) => {
          const selectedIndex = altByIngredient[ing.id];
          const alternative =
            selectedIndex !== undefined && selectedIndex >= 0 ? ing.alternativeOptions?.[selectedIndex] : undefined;
          if (!alternative) {
            return ing;
          }
          return {
            ...ing,
            ingredientId: alternative.ingredientId,
            ingredientName: alternative.ingredientName,
            quantity: alternative.grams,
            unit: "g" as const,
            normalizedQuantity: alternative.grams,
          };
        }),
      }
    : recipe;
  const macros = servingMacros(effectiveRecipe, catalog);
  const steps = splitRecipeInstructions(recipe.instructions).filter(Boolean);

  // Ryhmittele ainekset osioittain (Pohja, Kastike, ...) ensiesiintymisjärjestyksessä;
  // ryhmättömät renderöidään ilman otsikkoa (back-compat resepteille ilman osioita).
  const ingredientGroups: { label: string; items: typeof recipe.ingredients }[] = [];
  const ingredientGroupIndexByLabel = new Map<string, number>();
  for (const ing of recipe.ingredients) {
    const label = ing.groupLabel?.trim() ?? "";
    let groupIndex = ingredientGroupIndexByLabel.get(label);
    if (groupIndex === undefined) {
      groupIndex = ingredientGroups.length;
      ingredientGroupIndexByLabel.set(label, groupIndex);
      ingredientGroups.push({ label, items: [] });
    }
    ingredientGroups[groupIndex]!.items.push(ing);
  }
  const perServingScale = recipe.defaultServings > 0 ? servings / recipe.defaultServings : servings;
  const isEaten = Boolean(entry?.eatenAt);

  return (
    <Sheet onClose={onClose} ariaLabel={recipe.name}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--accent)]">
              {mealTagLabel(recipe.mealTag)}
              {recipe.ownerRole === "athlete" ? " · Oma resepti" : ""}
            </p>
            <h2 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-bold leading-tight text-[var(--text)] [overflow-wrap:anywhere]">{recipe.name}</h2>
          </div>
          {onEdit ? (
            <button
              type="button"
              onClick={onEdit}
              className="shrink-0 rounded-full bg-[var(--surface-2)] px-3 py-1.5 text-xs font-semibold text-[var(--text-muted)] transition hover:text-[var(--text)]"
            >
              Muokkaa
            </button>
          ) : null}
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
          <div className="mt-2 space-y-3">
            {ingredientGroups.map((group) => (
              <div key={group.label || "__ungrouped"}>
                {group.label ? (
                  <p className="mb-1 font-[family-name:var(--font-display)] text-xs font-semibold uppercase tracking-[0.05em] text-[var(--text-subtle)]">
                    {group.label}
                  </p>
                ) : null}
                <div className="divide-y divide-[var(--border)]">
                  {group.items.map((ing) => {
              const options = ing.alternativeOptions ?? [];
              const selectedIndex = altByIngredient[ing.id] ?? -1;
              const activeName = selectedIndex >= 0 ? options[selectedIndex]?.ingredientName ?? ing.ingredientName : ing.ingredientName;
              const activeGrams = selectedIndex >= 0 ? options[selectedIndex]?.grams : ing.quantity;
              const activeUnit = selectedIndex >= 0 ? "g" : ing.unit;
              return (
                <div key={ing.id} className="py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-[var(--text)]">{activeName}</span>
                    {activeGrams !== undefined ? (
                      <span className="shrink-0 font-[family-name:var(--font-display)] text-sm tabular-nums text-[var(--text-subtle)]">
                        {Math.round(activeGrams * perServingScale)} {activeUnit}
                      </span>
                    ) : null}
                  </div>
                  {options.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        aria-pressed={selectedIndex === -1}
                        onClick={() => setAltByIngredient((previous) => ({ ...previous, [ing.id]: -1 }))}
                        className={cn(
                          "rounded-full px-2.5 py-0.5 text-xs font-medium transition",
                          selectedIndex === -1
                            ? "bg-[var(--accent)] text-[var(--accent-contrast)]"
                            : "bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)]",
                        )}
                      >
                        {ing.ingredientName}
                      </button>
                      {options.map((option, index) => (
                        <button
                          key={`${ing.id}-alt-${index}`}
                          type="button"
                          aria-pressed={selectedIndex === index}
                          onClick={() => setAltByIngredient((previous) => ({ ...previous, [ing.id]: index }))}
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-xs font-medium transition",
                            selectedIndex === index
                              ? "bg-[var(--accent)] text-[var(--accent-contrast)]"
                              : "bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)]",
                          )}
                        >
                          ⇄ {option.ingredientName}
                        </button>
                      ))}
                    </div>
                  ) : ing.alternatives && ing.alternatives.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {ing.alternatives.map((alt) => (
                        <span key={alt} className="rounded-full bg-[var(--surface-2)] px-2.5 py-0.5 text-xs text-[var(--text-muted)]">
                          ⇄ {alt}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
                  })}
                </div>
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
    </Sheet>
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
    <Sheet onClose={onClose} ariaLabel={title}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--text)]">{title}</h2>
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
    </Sheet>
  );
}
