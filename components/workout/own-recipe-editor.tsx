"use client";

import { Plus, Search, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/field";
import { FullScreenOverlay } from "@/components/ui/sheet";
import {
  mealTagLabel,
  resolveRecipeIngredientNormalizedQuantity,
  resolveRecipeNutritionPreview,
} from "@/lib/nutrition";
import type { MealTag, RecipeIngredient, RecipeInput } from "@/lib/types";
import { useAppState } from "@/providers/app-state-provider";

const MEAL_TAG_ORDER: MealTag[] = ["breakfast", "lunch", "snack", "dinner", "evening_snack"];

type DraftAlt = { key: string; ingredientId: string; ingredientName: string; grams: string };

type DraftRow = {
  key: string;
  ingredientId: string;
  ingredientName: string;
  grams: string;
  alternatives: DraftAlt[];
};

export function OwnRecipeEditor({
  initialMealTag = "breakfast",
  onClose,
  onSaved,
}: {
  initialMealTag?: MealTag;
  onClose: () => void;
  onSaved?: (recipeName: string) => void;
}) {
  const { state, saveRecipe } = useAppState();
  const [name, setName] = useState("");
  const [mealTag, setMealTag] = useState<MealTag>(initialMealTag);
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [query, setQuery] = useState("");
  const [altSearchRowKey, setAltSearchRowKey] = useState<string | null>(null);
  const [altQuery, setAltQuery] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const catalogById = useMemo(
    () => new Map(state.ingredientsCatalog.map((item) => [item.id, item])),
    [state.ingredientsCatalog],
  );

  const searchResults = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return [];
    }
    return state.ingredientsCatalog
      .filter((item) => item.name.toLowerCase().includes(trimmed))
      .sort((left, right) => left.name.localeCompare(right.name, "fi"))
      .slice(0, 8);
  }, [query, state.ingredientsCatalog]);

  // Vaihtoehtoisen aineksen haku (yhdelle ainekselle kerrallaan).
  const altSearchResults = useMemo(() => {
    const trimmed = altQuery.trim().toLowerCase();
    if (!trimmed || !altSearchRowKey) {
      return [];
    }
    const activeRow = rows.find((row) => row.key === altSearchRowKey);
    const excludeIds = new Set(
      [activeRow?.ingredientId, ...(activeRow?.alternatives.map((alt) => alt.ingredientId) ?? [])].filter(Boolean),
    );
    return state.ingredientsCatalog
      .filter((item) => item.name.toLowerCase().includes(trimmed) && !excludeIds.has(item.id))
      .sort((left, right) => left.name.localeCompare(right.name, "fi"))
      .slice(0, 6);
  }, [altQuery, altSearchRowKey, rows, state.ingredientsCatalog]);

  // Live-makrot: rakennetaan pseudoresepti ja lasketaan annoskohtaiset makrot.
  const preview = useMemo(() => {
    const previewIngredients: RecipeIngredient[] = rows
      .filter((row) => row.ingredientId && Number(row.grams) > 0)
      .map((row, index) => {
        const catalogItem = catalogById.get(row.ingredientId);
        const grams = Number(row.grams);
        return {
          id: `draft-${index}`,
          ingredientId: row.ingredientId,
          ingredientName: row.ingredientName,
          quantity: grams,
          unit: "g" as const,
          normalizedQuantity: resolveRecipeIngredientNormalizedQuantity(grams, "g", catalogItem),
          ingredientRole: "main" as const,
          scalingMode: "linear" as const,
        };
      });

    if (previewIngredients.length === 0) {
      return null;
    }

    return resolveRecipeNutritionPreview(
      { defaultServings: 1, ingredients: previewIngredients, nutritionPerServing: undefined, nutritionPerRecipe: undefined },
      state.ingredientsCatalog,
    ).nutritionPerServing;
  }, [rows, catalogById, state.ingredientsCatalog]);

  const canSave = name.trim().length > 0 && rows.some((row) => row.ingredientId && Number(row.grams) > 0);

  const handleSave = async () => {
    if (!canSave) {
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      const input: RecipeInput = {
        name: name.trim(),
        instructions: "",
        mealTag,
        defaultServings: 1,
        minServings: 1,
        maxServings: 1,
        ingredients: rows
          .filter((row) => row.ingredientId && Number(row.grams) > 0)
          .map((row) => ({
            ingredientId: row.ingredientId,
            ingredientName: row.ingredientName,
            quantity: Number(row.grams),
            unit: "g" as const,
            ingredientRole: "main" as const,
            scalingMode: "linear" as const,
            alternativeOptions: row.alternatives
              .filter((alt) => alt.ingredientId && Number(alt.grams) > 0)
              .map((alt) => ({ ingredientId: alt.ingredientId, ingredientName: alt.ingredientName, grams: Number(alt.grams) })),
          })),
      };

      const result = await saveRecipe(input);
      if (!result.ok) {
        setError(result.message ?? "Reseptin tallennus epäonnistui.");
        return;
      }

      onSaved?.(input.name);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <FullScreenOverlay onClose={onClose} ariaLabel="Oma resepti" closeOnEscape={false} scroll={false}>
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3.5">
        <CardTitle>Oma resepti</CardTitle>
        <button
          type="button"
          className="grid size-9 place-items-center rounded-full bg-[var(--surface-2)] text-[var(--text-subtle)]"
          aria-label="Sulje"
          onClick={onClose}
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        <div>
          <Label htmlFor="own-recipe-name">Nimi</Label>
          <Input
            id="own-recipe-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Esim. Kaurapuuro ja marjat"
          />
        </div>

        <div>
          <p className="text-sm font-semibold text-[var(--text)]">Ateriapaikka</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {MEAL_TAG_ORDER.map((tag) => (
              <button
                key={tag}
                type="button"
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  tag === mealTag ? "bg-[var(--text)] text-[var(--background)]" : "bg-[var(--surface-2)] text-[var(--text-muted)]"
                }`}
                onClick={() => setMealTag(tag)}
              >
                {mealTagLabel(tag)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold text-[var(--text)]">Ainekset</p>
          {rows.length > 0 ? (
            <div className="mt-2 divide-y divide-[var(--border)]">
              {rows.map((row) => (
                <div key={row.key} className="py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="min-w-0 flex-1 truncate text-sm text-[var(--text)]">{row.ingredientName}</span>
                    <Input
                      className="h-9 w-20 px-2 text-center text-sm"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={row.grams}
                      aria-label={`${row.ingredientName} grammat`}
                      onChange={(event) =>
                        setRows((previous) =>
                          previous.map((item) => (item.key === row.key ? { ...item, grams: event.target.value } : item)),
                        )
                      }
                    />
                    <span className="text-xs text-[var(--text-subtle)]">g</span>
                    <button
                      type="button"
                      className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--surface-2)] text-[var(--text-subtle)] transition hover:text-[var(--danger)]"
                      aria-label={`Poista ${row.ingredientName}`}
                      onClick={() => setRows((previous) => previous.filter((item) => item.key !== row.key))}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  </div>

                  {row.alternatives.length > 0 ? (
                    <div className="mt-1.5 space-y-1.5 border-l-2 border-[var(--border)] pl-3">
                      {row.alternatives.map((alt) => (
                        <div key={alt.key} className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-xs text-[var(--text-muted)]">tai {alt.ingredientName}</span>
                          <Input
                            className="h-8 w-16 px-2 text-center text-xs"
                            type="number"
                            inputMode="numeric"
                            min={0}
                            value={alt.grams}
                            aria-label={`${alt.ingredientName} grammat`}
                            onChange={(event) =>
                              setRows((previous) =>
                                previous.map((item) =>
                                  item.key === row.key
                                    ? {
                                        ...item,
                                        alternatives: item.alternatives.map((option) =>
                                          option.key === alt.key ? { ...option, grams: event.target.value } : option,
                                        ),
                                      }
                                    : item,
                                ),
                              )
                            }
                          />
                          <span className="text-[11px] text-[var(--text-subtle)]">g</span>
                          <button
                            type="button"
                            className="grid size-7 shrink-0 place-items-center rounded-full text-[var(--text-subtle)] transition hover:text-[var(--danger)]"
                            aria-label={`Poista vaihtoehto ${alt.ingredientName}`}
                            onClick={() =>
                              setRows((previous) =>
                                previous.map((item) =>
                                  item.key === row.key
                                    ? { ...item, alternatives: item.alternatives.filter((option) => option.key !== alt.key) }
                                    : item,
                                ),
                              )
                            }
                          >
                            <X className="size-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-1.5 pl-3">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--border-strong)] px-3 py-1 text-xs font-semibold text-[var(--text-muted)] transition hover:text-[var(--text)]"
                      onClick={() => {
                        setAltSearchRowKey((current) => (current === row.key ? null : row.key));
                        setAltQuery("");
                      }}
                    >
                      <Plus className="size-3" aria-hidden="true" /> Vaihtoehto
                    </button>
                  </div>

                  {altSearchRowKey === row.key ? (
                    <div className="mt-2 rounded-xl bg-[var(--surface-2)] p-2">
                      <div className="flex items-center gap-2 rounded-lg bg-[var(--surface)] px-3 py-2">
                        <Search className="size-4 shrink-0 text-[var(--text-subtle)]" aria-hidden="true" />
                        <input
                          type="search"
                          value={altQuery}
                          onChange={(event) => setAltQuery(event.target.value)}
                          placeholder="Hae vaihtoehtoinen raaka-aine..."
                          className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-subtle)]"
                        />
                      </div>
                      {altSearchResults.length > 0 ? (
                        <div className="mt-1 divide-y divide-[var(--border)]">
                          {altSearchResults.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              className="flex w-full items-center justify-between gap-2 py-2 text-left"
                              onClick={() => {
                                setRows((previous) =>
                                  previous.map((candidate) =>
                                    candidate.key === row.key
                                      ? {
                                          ...candidate,
                                          alternatives: [
                                            ...candidate.alternatives,
                                            { key: `${item.id}-${Date.now()}`, ingredientId: item.id, ingredientName: item.name, grams: row.grams || "100" },
                                          ],
                                        }
                                      : candidate,
                                  ),
                                );
                                setAltSearchRowKey(null);
                                setAltQuery("");
                              }}
                            >
                              <span className="min-w-0 truncate text-sm text-[var(--text)]">{item.name}</span>
                              <Plus className="size-4 shrink-0 text-[var(--accent)]" aria-hidden="true" />
                            </button>
                          ))}
                        </div>
                      ) : altQuery.trim() ? (
                        <p className="px-1 py-2 text-xs text-[var(--text-subtle)]">Ei osumia.</p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-[var(--text-subtle)]">Hae ja lisää ainekset alta.</p>
          )}

          <div className="mt-3">
            <div className="flex items-center gap-2 rounded-xl bg-[var(--surface-2)] px-3 py-2.5 focus-within:ring-2 focus-within:ring-inset focus-within:ring-[var(--accent)]">
              <Search className="size-4 shrink-0 text-[var(--text-subtle)]" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Hae raaka-ainetta..."
                className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-subtle)]"
              />
            </div>
            {searchResults.length > 0 ? (
              <div className="mt-2 divide-y divide-[var(--border)]">
                {searchResults.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="flex w-full items-center justify-between gap-2 py-2 text-left"
                    onClick={() => {
                      setRows((previous) =>
                        previous.some((row) => row.ingredientId === item.id)
                          ? previous
                          : [...previous, { key: `${item.id}-${Date.now()}`, ingredientId: item.id, ingredientName: item.name, grams: "100", alternatives: [] }],
                      );
                      setQuery("");
                    }}
                  >
                    <span className="min-w-0 truncate text-sm text-[var(--text)]">{item.name}</span>
                    <Plus className="size-4 shrink-0 text-[var(--accent)]" aria-hidden="true" />
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {preview ? (
          <div className="rounded-2xl bg-[var(--surface-2)] p-4">
            <p className="text-sm font-semibold text-[var(--text)]">Makrot / annos</p>
            <div className="mt-3 grid grid-cols-4 gap-2">
              <div>
                <p className="font-[family-name:var(--font-display)] text-lg font-semibold tabular-nums text-[var(--text)]">{Math.round(preview.kcal)}</p>
                <p className="text-[11px] font-medium text-[var(--text-subtle)]">kcal</p>
              </div>
              <div>
                <p className="font-[family-name:var(--font-display)] text-lg font-semibold tabular-nums text-[var(--text)]">{Math.round(preview.proteinG)}</p>
                <p className="text-[11px] font-medium text-[var(--text-subtle)]">P (g)</p>
              </div>
              <div>
                <p className="font-[family-name:var(--font-display)] text-lg font-semibold tabular-nums text-[var(--text)]">{Math.round(preview.carbsG)}</p>
                <p className="text-[11px] font-medium text-[var(--text-subtle)]">H (g)</p>
              </div>
              <div>
                <p className="font-[family-name:var(--font-display)] text-lg font-semibold tabular-nums text-[var(--text)]">{Math.round(preview.fatG)}</p>
                <p className="text-[11px] font-medium text-[var(--text-subtle)]">R (g)</p>
              </div>
            </div>
          </div>
        ) : null}

        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      </div>

      <div className="border-t border-[var(--border)] px-4 py-3.5">
        <Button
          type="button"
          className="w-full"
          loading={isSaving}
          loadingText="Tallennetaan..."
          disabled={!canSave}
          onClick={() => void handleSave()}
        >
          Tallenna resepti
        </Button>
      </div>
    </FullScreenOverlay>
  );
}
