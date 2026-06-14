"use client";

import { ArrowLeft, ChevronRight, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { ingredientSchema } from "@/components/workout/schemas";
import { withMinimumDelay } from "@/lib/min-delay";
import type { Ingredient } from "@/lib/types";
import { useAppState } from "@/providers/app-state-provider";

type IngredientFormState = {
  name: string;
  kcalPer100: string;
  proteinPer100: string;
  carbsPer100: string;
  fatPer100: string;
};

const emptyIngredientForm: IngredientFormState = {
  name: "",
  kcalPer100: "0",
  proteinPer100: "0",
  carbsPer100: "0",
  fatPer100: "0",
};

function formatNutritionValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

function ingredientTitle(ingredient: Pick<Ingredient, "name" | "displayName">) {
  return ingredient.displayName?.trim() || ingredient.name;
}

function ingredientNutritionLine(ingredient: Ingredient) {
  return `${formatNutritionValue(ingredient.kcalPer100)} kcal · P ${formatNutritionValue(
    ingredient.proteinPer100,
  )} · H ${formatNutritionValue(ingredient.carbsPer100)} · R ${formatNutritionValue(ingredient.fatPer100)}`;
}

export function AdminIngredientsView({ onBack }: { onBack?: () => void }) {
  const { currentUser, state, saveIngredient, deleteIngredient, notify } = useAppState();
  const [query, setQuery] = useState("");
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [selectedIngredientId, setSelectedIngredientId] = useState<string>("");
  const [form, setForm] = useState<IngredientFormState>(emptyIngredientForm);
  const [formMessage, setFormMessage] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const sortedIngredients = useMemo(
    () =>
      [...state.ingredientsCatalog].sort((left, right) =>
        ingredientTitle(left).localeCompare(ingredientTitle(right), "fi-FI"),
      ),
    [state.ingredientsCatalog],
  );
  const filteredIngredients = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return sortedIngredients;
    }

    return sortedIngredients.filter((ingredient) =>
      `${ingredient.name} ${ingredient.displayName ?? ""}`.toLowerCase().includes(normalizedQuery),
    );
  }, [query, sortedIngredients]);
  const selectedIngredient = useMemo(
    () => state.ingredientsCatalog.find((ingredient) => ingredient.id === selectedIngredientId) ?? null,
    [selectedIngredientId, state.ingredientsCatalog],
  );

  useEffect(() => {
    if (!isSheetOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsSheetOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSheetOpen]);

  if (currentUser?.role !== "admin") {
    return null;
  }

  const updateForm = (key: keyof IngredientFormState, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFormMessage("");
  };

  const openNewIngredientSheet = () => {
    setSelectedIngredientId("");
    setForm(emptyIngredientForm);
    setFormMessage("");
    setIsSheetOpen(true);
  };

  const openIngredientEditor = (ingredient: Ingredient) => {
    setSelectedIngredientId(ingredient.id);
    setForm({
      name: ingredient.displayName?.trim() || ingredient.name,
      kcalPer100: formatNutritionValue(ingredient.kcalPer100),
      proteinPer100: formatNutritionValue(ingredient.proteinPer100),
      carbsPer100: formatNutritionValue(ingredient.carbsPer100),
      fatPer100: formatNutritionValue(ingredient.fatPer100),
    });
    setFormMessage("");
    setIsSheetOpen(true);
  };

  const handleSave = async () => {
    const parsed = ingredientSchema.safeParse({
      id: selectedIngredient?.id,
      name: form.name,
      displayName: selectedIngredient?.displayName,
      source: selectedIngredient?.source ?? "manual",
      sourceExternalId: selectedIngredient?.sourceExternalId,
      defaultPurchaseUnit: selectedIngredient?.defaultPurchaseUnit ?? "g",
      gramsPerUnit: selectedIngredient?.gramsPerUnit,
      kcalPer100: form.kcalPer100,
      proteinPer100: form.proteinPer100,
      carbsPer100: form.carbsPer100,
      fatPer100: form.fatPer100,
    });

    if (!parsed.success) {
      setFormMessage(parsed.error.issues[0]?.message ?? "Tarkista raaka-aineen tiedot.");
      return;
    }

    setIsSaving(true);
    try {
      const result = await withMinimumDelay(saveIngredient(parsed.data));
      const isEditing = Boolean(selectedIngredient);
      notify({
        tone: result.ok ? "success" : "danger",
        message: result.ok ? (isEditing ? "Raaka-aine päivitettiin." : "Raaka-aine lisättiin katalogiin.") : result.message,
      });
      setFormMessage(result.ok ? "" : result.message);
      if (result.ok) {
        setForm(emptyIngredientForm);
        setSelectedIngredientId("");
        setIsSheetOpen(false);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedIngredient) {
      return;
    }

    const confirmed = window.confirm(
      `Poistetaanko raaka-aine ${ingredientTitle(selectedIngredient)} katalogista? Reseptien olemassa olevat rivit säilyvät, mutta katalogilinkki poistuu.`,
    );
    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    try {
      const result = await withMinimumDelay(deleteIngredient(selectedIngredient.id));
      notify({
        tone: result.ok ? "success" : "danger",
        message: result.ok ? "Raaka-aine poistettiin katalogista." : result.message,
      });
      setFormMessage(result.ok ? "" : result.message);
      if (result.ok) {
        setForm(emptyIngredientForm);
        setSelectedIngredientId("");
        setIsSheetOpen(false);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="relative min-h-[calc(100svh-8rem)] pb-24">
      <div className="flex items-start gap-5">
        <button
          type="button"
          aria-label="Takaisin Tiimi-näkymään"
          className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--surface)] text-[var(--text)] shadow-[0_1px_2px_var(--shadow-soft)] transition hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
          onClick={onBack}
        >
          <ArrowLeft className="size-5" aria-hidden="true" />
        </button>
        <div className="min-w-0 pt-1">
          <p className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-subtle)]">Admin · Hallinta</p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-bold leading-tight text-[var(--text)] sm:text-3xl">
            Raaka-ainekatalogi
          </h1>
        </div>
      </div>

      <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-muted)]">
        Raaka-aineet ovat reseptien rakennuspalikat. Ylläpidä nimet ja ravintoarvot — kaikki arvot per 100 g.
      </p>

      <div className="relative mt-5 rounded-xl bg-[var(--surface-2)] focus-within:ring-2 focus-within:ring-inset focus-within:ring-[var(--accent)]">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[var(--text-subtle)]" aria-hidden="true" />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Hae raaka-ainetta..."
          aria-label="Hae raaka-ainetta"
          className="h-12 rounded-xl border-0 bg-transparent pl-11 text-base shadow-none focus:border-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </div>

      <div className="mb-2 mt-6 flex items-baseline justify-between gap-4 px-1">
        <h2 className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-subtle)]">Raaka-aineet</h2>
        <span className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-subtle)]">
          {filteredIngredients.length} kpl
        </span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-0 shadow-[0_1px_2px_var(--shadow-soft)]">
        {filteredIngredients.length ? (
          filteredIngredients.map((ingredient) => (
            <button
              key={ingredient.id}
              type="button"
              className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]"
              aria-label={`Muokkaa raaka-ainetta ${ingredientTitle(ingredient)}, ${ingredientNutritionLine(ingredient)}`}
              onClick={() => openIngredientEditor(ingredient)}
            >
              <span className="min-w-0">
                <span className="block truncate font-[family-name:var(--font-display)] text-[15.5px] font-bold text-[var(--text)]">
                  {ingredientTitle(ingredient)}
                </span>
                <span className="mt-1 block truncate text-[12.5px] text-[var(--text-muted)]">{ingredientNutritionLine(ingredient)}</span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-[var(--text)]" aria-hidden="true" />
            </button>
          ))
        ) : (
          <p className="px-4 py-8 text-base text-[var(--text-muted)]">Hakua vastaavia raaka-aineita ei löytynyt.</p>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-3xl px-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
        <Button type="button" className="h-12 w-full rounded-xl text-base" onClick={openNewIngredientSheet}>
          <Plus className="mr-2 size-4" aria-hidden="true" />
          Lisää raaka-aine
        </Button>
      </div>

      {isSheetOpen ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/45" onMouseDown={() => setIsSheetOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-ingredient-title"
            className="max-h-[86svh] w-full overflow-y-auto rounded-t-[2rem] bg-[var(--surface)] px-4 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-6 shadow-[0_-24px_70px_-34px_var(--shadow)] sm:mx-auto sm:max-w-3xl sm:px-8"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mb-5 h-1.5 w-20 rounded-full bg-[var(--border-strong)]" aria-hidden="true" />
            <p className="text-sm font-semibold text-[var(--accent-strong)]">
              {selectedIngredient ? `${sourceLabel(selectedIngredient.source)}-raaka-aine` : "Uusi raaka-aine"}
            </p>
            <h2 id="new-ingredient-title" className="mt-2 font-[family-name:var(--font-display)] text-2xl font-bold leading-tight text-[var(--text)]">
              {selectedIngredient ? ingredientTitle(selectedIngredient) : "Lisää raaka-aine"}
            </h2>

            <div className="mt-6">
              <Label htmlFor="ingredient-sheet-name" className="text-xs font-semibold uppercase tracking-[0.06em]">
                Nimi
              </Label>
              <Input
                id="ingredient-sheet-name"
                value={form.name}
                onChange={(event) => updateForm("name", event.target.value)}
                placeholder="esim. Punainen linssi (kuivattu)"
                className="h-12 rounded-xl border-0 bg-[var(--surface-2)] text-base"
              />
            </div>

            <div className="mt-6 flex items-baseline justify-between gap-4">
              <h3 className="font-[family-name:var(--font-display)] text-lg font-bold text-[var(--text)]">Ravintoarvot</h3>
              <span className="text-sm text-[var(--text-muted)]">/ 100 g</span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4">
              <MacroInput label="Energia" unit="kcal" value={form.kcalPer100} onChange={(value) => updateForm("kcalPer100", value)} />
              <MacroInput label="Proteiini" unit="grammaa" value={form.proteinPer100} onChange={(value) => updateForm("proteinPer100", value)} />
              <MacroInput label="Hiilihydraatti" unit="grammaa" value={form.carbsPer100} onChange={(value) => updateForm("carbsPer100", value)} />
              <MacroInput label="Rasva" unit="grammaa" value={form.fatPer100} onChange={(value) => updateForm("fatPer100", value)} />
            </div>

            <p className="mt-5 text-sm leading-6 text-[var(--text-muted)]">
              Vedä numerosta tai napauta ja kirjoita. Reseptit laskevat makrot näistä arvoista grammamäärän mukaan.
            </p>

            {formMessage ? (
              <p className="mt-4 text-sm font-semibold text-[var(--danger)]" aria-live="polite">
                {formMessage}
              </p>
            ) : null}

            <Button
              type="button"
              className="mt-6 h-12 w-full rounded-xl text-base"
              loading={isSaving}
              loadingText={selectedIngredient ? "Tallennetaan..." : "Lisätään..."}
              onClick={handleSave}
            >
              {selectedIngredient ? "Tallenna muutokset" : "Lisää katalogiin"}
            </Button>
            {selectedIngredient ? (
              <button
                type="button"
                className="mt-5 inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-base font-bold text-[var(--danger)] transition hover:bg-[var(--surface-2)] disabled:cursor-progress disabled:opacity-70"
                disabled={isDeleting}
                onClick={handleDelete}
              >
                {isDeleting ? (
                  <>
                    <span
                      aria-hidden="true"
                      className="mr-2 size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
                    />
                    Poistetaan...
                  </>
                ) : (
                  <>
                    <Trash2 className="mr-2 size-4" aria-hidden="true" />
                    Poista raaka-aine
                  </>
                )}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function sourceLabel(source: Ingredient["source"]) {
  if (source === "fineli") {
    return "Fineli";
  }
  if (source === "open_food_facts") {
    return "Open Food Facts";
  }
  return "Manuaalinen";
}

function MacroInput({
  label,
  unit,
  value,
  onChange,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const inputId = `ingredient-${label.toLowerCase()}`;
  return (
    <div>
      <Label htmlFor={inputId} className="text-xs font-semibold uppercase tracking-[0.06em]">
        {label}
      </Label>
      <Input
        id={inputId}
        type="number"
        inputMode="decimal"
        min="0"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 rounded-xl border-0 bg-[var(--surface-2)] text-center text-base font-semibold"
      />
      <p className="mt-2 text-xs text-[var(--text-muted)]">{unit}</p>
    </div>
  );
}
