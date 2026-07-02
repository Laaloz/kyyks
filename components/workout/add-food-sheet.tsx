"use client";

import { Camera, Check, MoreHorizontal, Plus, Search, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { CameraCapture } from "@/components/workout/camera-capture";
import { EnergySplit } from "@/components/workout/nutrition/energy-split";
import { addFoodFormSchema, macroEnergyWarning } from "@/components/workout/schemas";
import { mealTagLabel } from "@/lib/nutrition";
import { cn } from "@/lib/utils";
import type { AppState, DayMealPlanEntry, FoodImageMode, MealTag } from "@/lib/types";

const MEAL_TAGS: MealTag[] = ["breakfast", "lunch", "snack", "dinner", "evening_snack"];

type ActionOutcome = { ok: boolean; message?: string };

// Lämmitä AI-arvion serverless-funktio heti kun näkymä avataan: kylmäkäynnistys (~1-3 s
// Vercelillä) tapahtuu käyttäjän kirjoittaessa/kuvatessa eikä pidennä itse arviota. Kevyt
// 204-GET, virheet ohitetaan (pelkkä optimointi).
function warmUpAiEstimate() {
  try {
    void fetch("/api/nutrition/ai-estimate", { method: "GET" }).catch(() => {});
  } catch {
    // Pelkkä optimointi — jos fetch puuttuu tai hylkää URL:n (esim. testiympäristö), ohitetaan.
  }
}

/** Ateriapaikan valitsin (chipit). Jaettu lisäys- ja muokkausnäkymän kesken. */
function MealTagChips({ value, onChange }: { value: MealTag; onChange: (tag: MealTag) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-[var(--text-subtle)]">Ateriapaikka</span>
      <div className="flex flex-wrap gap-1.5">
        {MEAL_TAGS.map((tag) => (
          <button
            key={tag}
            type="button"
            aria-pressed={value === tag}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              value === tag ? "bg-[var(--text)] text-[var(--background)]" : "bg-[var(--surface-2)] text-[var(--text-muted)]"
            }`}
            onClick={() => onChange(tag)}
          >
            {mealTagLabel(tag)}
          </button>
        ))}
      </div>
    </div>
  );
}

function round(value: number): number {
  return Math.round(value);
}

/**
 * Lisää ateriaan -näkymä (ruoka tai juoma). Yksi näkymä: hae omista tuotteista, kirjoita uusi (Enter / nappi →
 * tekoäly täyttää taustalla) tai ota kuva. Arvojen tarkistus tapahtuu päivän kortin kautta.
 */
export function AddFoodSheet({
  userId,
  catalog,
  aiEnabled = true,
  defaultMealTag,
  onClose,
  onLogOwnFood,
  onQuickAdd,
  onQuickAddPhoto,
}: {
  userId: string;
  catalog: AppState["ingredientsCatalog"];
  aiEnabled?: boolean;
  // Kellonajasta päätelty oletus; käyttäjä voi vaihtaa ateriapaikan ennen lisäystä.
  defaultMealTag: MealTag;
  onClose: () => void;
  onLogOwnFood: (ingredientId: string, grams: number, mealTag: MealTag) => Promise<ActionOutcome>;
  onQuickAdd: (name: string, mealTag: MealTag) => Promise<ActionOutcome>;
  onQuickAddPhoto: (input: { imageBase64: string; mimeType: string; imageMode: FoodImageMode; mealTag: MealTag }) => Promise<ActionOutcome>;
}) {
  const [query, setQuery] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [mealTag, setMealTag] = useState<MealTag>(defaultMealTag);

  useEffect(() => {
    if (aiEnabled) {
      warmUpAiEstimate();
    }
  }, [aiEnabled]);

  // Suodata omat tuotteet koko katalogista vain kerran (ei joka näppäimenpainalluksella) —
  // koko katalogin läpikäynti per painallus aiheutti turhaa muisti-/CPU-painetta mobiilissa.
  const myFoods = useMemo(
    () =>
      catalog
        .filter((item) => item.ownerUserId === userId)
        .sort((left, right) => (left.displayName || left.name).localeCompare(right.displayName || right.name, "fi")),
    [catalog, userId],
  );
  const term = query.trim().toLowerCase();
  const ownFoods = (term ? myFoods.filter((item) => (item.displayName || item.name).toLowerCase().includes(term)) : myFoods).slice(0, 50);

  const runQuickAdd = async () => {
    const name = query.trim();
    if (!name || pending) {
      return;
    }
    setPending(true);
    setError("");
    try {
      const result = await onQuickAdd(name, mealTag);
      if (result.ok) {
        onClose();
      } else {
        setError(result.message ?? "Lisäys epäonnistui.");
      }
    } finally {
      setPending(false);
    }
  };

  const analyzeAndAdd = async (base64: string, mimeType: string, imageMode: FoodImageMode) => {
    const result = await onQuickAddPhoto({ imageBase64: base64, mimeType, imageMode, mealTag });
    if (result.ok) {
      onClose();
    } else {
      setError(result.message ?? "Lisäys epäonnistui.");
    }
  };

  // Tiedostopolku (galleria / fallback): skaalaa ensin, sitten arvioi.
  const runPhoto = async (file: File, imageMode: FoodImageMode) => {
    setCameraOpen(false);
    setAnalyzing(true);
    setError("");
    try {
      const { base64, mimeType } = await fileToScaledBase64(file);
      await analyzeAndAdd(base64, mimeType, imageMode);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kuvan käsittely epäonnistui.");
    } finally {
      setAnalyzing(false);
    }
  };

  // In-app-kamera: kuva on jo skaalattu canvasilla.
  const runCapturedPhoto = async (base64: string, mimeType: string, imageMode: FoodImageMode) => {
    setCameraOpen(false);
    setAnalyzing(true);
    setError("");
    try {
      await analyzeAndAdd(base64, mimeType, imageMode);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kuvan käsittely epäonnistui.");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <Sheet ariaLabel="Lisää ateria AI:lla" onClose={onClose}>
      <h2 className="flex items-center gap-2 font-[family-name:var(--font-display)] text-lg font-bold text-[var(--text)]">
        <Sparkles className="size-5 text-[var(--accent)]" aria-hidden="true" />
        Lisää ateria AI:lla
      </h2>
      <p className="mt-1 text-sm text-[var(--text-muted)]">Kirjoita tai kuvaa ruoka — AI arvioi ravintoarvot.</p>

      {error ? (
        <p className="mt-3 text-sm text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}

      {/* Ateriapaikka heti otsikon alla — sama paikka kaikissa kirjaussheeteissä. */}
      <div className="mt-3">
        <MealTagChips value={mealTag} onChange={setMealTag} />
      </div>

      <form
        className="mt-3 flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void runQuickAdd();
        }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-[var(--surface-2)] px-3 py-2.5">
          <Search className="size-4 shrink-0 text-[var(--text-subtle)]" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Mitä söit tai joit?"
            aria-label="Hae tai lisää ateriaan"
            enterKeyHint="done"
            className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-subtle)]"
          />
        </div>
        {aiEnabled ? (
          <button
            type="button"
            className={cn(
              "grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--surface-2)] text-[var(--text)]",
              analyzing && "opacity-50",
            )}
            aria-label="Lisää kuvasta"
            title="Lisää kuvasta"
            disabled={analyzing}
            onClick={() => setCameraOpen(true)}
          >
            <Camera className="size-5" aria-hidden="true" />
          </button>
        ) : null}
      </form>

      {analyzing ? (
        <p className="mt-3 text-sm text-[var(--text-subtle)]" role="status">
          Analysoidaan kuvaa…
        </p>
      ) : null}

      <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
        {ownFoods.length > 0 ? (
          <>
            <p className="mt-1 font-[family-name:var(--font-display)] text-xs font-semibold uppercase tracking-[0.05em] text-[var(--text-subtle)]">
              Omat tuotteet
            </p>
            <OwnFoodPicker
              foods={ownFoods}
              onPick={async (ingredientId, grams) => {
                setError("");
                const result = await onLogOwnFood(ingredientId, grams, mealTag);
                if (result.ok) {
                  onClose();
                } else {
                  setError(result.message ?? "Lisäys epäonnistui.");
                }
              }}
            />
          </>
        ) : null}

        {query.trim() ? (
          <Button
            type="button"
            className={cn("w-full gap-2", ownFoods.length > 0 ? "mt-4" : "mt-2")}
            loading={pending}
            loadingText="Lisätään…"
            onClick={() => void runQuickAdd()}
          >
            <Plus className="size-4" aria-hidden="true" />
            Lisää &ldquo;{query.trim()}&rdquo;
          </Button>
        ) : null}
      </div>

      {cameraOpen ? (
        <CameraCapture
          onCapture={({ base64, mimeType, mode }) => void runCapturedPhoto(base64, mimeType, mode)}
          onPickFile={(file, mode) => void runPhoto(file, mode)}
          onClose={() => setCameraOpen(false)}
        />
      ) : null}
    </Sheet>
  );
}

function OwnFoodPicker({
  foods,
  onPick,
}: {
  foods: AppState["ingredientsCatalog"];
  onPick: (ingredientId: string, grams: number) => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [grams, setGrams] = useState("100");
  const [pending, setPending] = useState(false);

  const selected = selectedId ? foods.find((item) => item.id === selectedId) ?? null : null;
  const gramsNumber = Number(grams.replace(",", "."));
  const validGrams = Number.isFinite(gramsNumber) && gramsNumber > 0;
  const factor = validGrams ? gramsNumber / 100 : 0;

  return (
    <ul className="divide-y divide-[var(--border)]">
      {foods.map((item) => {
        const isSelected = item.id === selectedId;
        const name = item.displayName || item.name;
        return (
          <li key={item.id}>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 py-2.5 text-left"
              aria-expanded={isSelected}
              onClick={() => {
                setSelectedId(isSelected ? null : item.id);
                setGrams("100");
              }}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-[var(--text)]">{name}</span>
                <span className="block text-xs text-[var(--text-subtle)]">
                  {round(item.kcalPer100)} kcal · P {round(item.proteinPer100)} g / 100 g
                </span>
              </span>
              <Plus
                className={cn("size-4 shrink-0 transition", isSelected ? "rotate-45 text-[var(--accent)]" : "text-[var(--text-subtle)]")}
                aria-hidden="true"
              />
            </button>

            {isSelected && selected ? (
              <div className="pb-3">
                <label className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                  Annoskoko
                  <input
                    type="number"
                    inputMode="decimal"
                    min={1}
                    max={5000}
                    value={grams}
                    onChange={(event) => setGrams(event.target.value)}
                    aria-label="Annoskoko grammoina"
                    className="w-24 rounded-lg bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text)] outline-none"
                  />
                  <span className="text-[var(--text-subtle)]">g</span>
                </label>
                <p className="mt-2 text-xs text-[var(--text-subtle)]" aria-live="polite">
                  {validGrams
                    ? `${round(selected.kcalPer100 * factor)} kcal · P ${round(selected.proteinPer100 * factor)} g · H ${round(selected.carbsPer100 * factor)} g · R ${round(selected.fatPer100 * factor)} g`
                    : "Anna annoskoko grammoina."}
                </p>
                <Button
                  type="button"
                  className="mt-3 w-full gap-2"
                  loading={pending}
                  disabled={!validGrams}
                  onClick={async () => {
                    if (!validGrams) {
                      return;
                    }
                    setPending(true);
                    try {
                      await onPick(selected.id, gramsNumber);
                    } finally {
                      setPending(false);
                    }
                  }}
                >
                  <Check className="size-4" aria-hidden="true" />
                  Lisää ateriaan
                </Button>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export type FoodFormValues = {
  name: string;
  grams: number;
  kcalPer100: number;
  proteinPer100: number;
  carbsPer100: number;
  fatPer100: number;
  saveToMyFoods: boolean;
  mealTag?: MealTag;
};

type FoodFieldState = {
  name: string;
  grams: string;
  kcal: string;
  protein: string;
  carbs: string;
  fat: string;
};

function fieldsFromEntry(entry: DayMealPlanEntry): FoodFieldState {
  return {
    name: entry.foodName ?? "",
    grams: entry.grams != null ? String(round(entry.grams)) : "100",
    kcal: entry.kcalPer100 != null ? String(round(entry.kcalPer100)) : "",
    protein: entry.proteinPer100 != null ? String(round(entry.proteinPer100)) : "",
    carbs: entry.carbsPer100 != null ? String(round(entry.carbsPer100)) : "",
    fat: entry.fatPer100 != null ? String(round(entry.fatPer100)) : "",
  };
}

/** Jaetut, kontrolloidut ruoan kentät. */
function FoodFields({ state, setState }: { state: FoodFieldState; setState: (next: FoodFieldState) => void }) {
  const kcalNumber = Number(state.kcal.replace(",", ".")) || 0;
  const proteinNumber = Number(state.protein.replace(",", ".")) || 0;
  const carbsNumber = Number(state.carbs.replace(",", ".")) || 0;
  const fatNumber = Number(state.fat.replace(",", ".")) || 0;
  const energyWarning = macroEnergyWarning(kcalNumber, proteinNumber, carbsNumber, fatNumber);

  const numberField = (label: string, key: keyof FoodFieldState, suffix: string) => (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-[var(--text-subtle)]">{label}</span>
      <div className="flex items-center gap-2 rounded-lg bg-[var(--surface-2)] px-3 py-2">
        <input
          type="number"
          inputMode="decimal"
          min={0}
          value={state[key]}
          onChange={(event) => setState({ ...state, [key]: event.target.value })}
          className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text)] outline-none"
        />
        <span className="shrink-0 text-xs text-[var(--text-subtle)]">{suffix}</span>
      </div>
    </label>
  );

  return (
    <div className="space-y-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-[var(--text-subtle)]">Nimi</span>
        <input
          type="text"
          value={state.name}
          onChange={(event) => setState({ ...state, name: event.target.value })}
          placeholder="esim. Kaurapuuro"
          className="rounded-lg bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-subtle)]"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        {numberField("Energia", "kcal", "kcal/100 g")}
        {numberField("Annoskoko", "grams", "g")}
        {numberField("Proteiini", "protein", "g/100 g")}
        {numberField("Hiilihydraatit", "carbs", "g/100 g")}
        {numberField("Rasva", "fat", "g/100 g")}
      </div>

      {energyWarning ? (
        <p className="text-xs text-[var(--warning)]" role="status">
          {energyWarning}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Arvojen lukunäkymä: iso kcal/annos, makrosarakkeet energiaosuuksineen ja jakaumapalkki.
 * Arvoja ei muokata tässä — muokkaukset avataan kortin ...-valikosta.
 */
function FoodMacroSummary({ fields }: { fields: FoodFieldState }) {
  const toNumber = (value: string) => Number(value.replace(",", ".")) || 0;
  const gramsNumber = toNumber(fields.grams);
  const factor = gramsNumber > 0 ? gramsNumber / 100 : 0;
  const kcal100 = toNumber(fields.kcal);
  const protein100 = toNumber(fields.protein);
  const carbs100 = toNumber(fields.carbs);
  const fat100 = toNumber(fields.fat);
  const perServing = {
    kcal: round(kcal100 * factor),
    p: round(protein100 * factor),
    c: round(carbs100 * factor),
    f: round(fat100 * factor),
  };
  // Energiaosuudet samalla kaavalla kuin EnergySplit-palkki (4/4/9 kcal per g).
  const energyTotal = perServing.p * 4 + perServing.c * 4 + perServing.f * 9 || 1;
  const columns = [
    { label: "Proteiini", grams: perServing.p, share: (perServing.p * 4) / energyTotal, dot: "bg-[var(--accent)]" },
    { label: "Hiilihydraatit", grams: perServing.c, share: (perServing.c * 4) / energyTotal, dot: "bg-[var(--accent-secondary)]" },
    { label: "Rasva", grams: perServing.f, share: (perServing.f * 9) / energyTotal, dot: "bg-[var(--border-strong)]" },
  ];

  return (
    <div className="rounded-2xl bg-[var(--surface-2)] p-4" aria-live="polite">
      <p className="font-[family-name:var(--font-display)] text-3xl font-bold leading-none tabular-nums text-[var(--text)]">
        {perServing.kcal}
        <span className="ml-1.5 text-sm font-semibold text-[var(--text-subtle)]">kcal / annos</span>
      </p>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {columns.map((column) => (
          <div key={column.label} className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-subtle)]">
              <span className={cn("size-2 shrink-0 rounded-full", column.dot)} aria-hidden="true" />
              <span className="truncate">{column.label}</span>
            </p>
            <p className="mt-0.5 text-sm font-bold tabular-nums text-[var(--text)]">
              {column.grams} g <span className="font-semibold text-[var(--text-subtle)]">{Math.round(column.share * 100)} %</span>
            </p>
          </div>
        ))}
      </div>
      <div className="mt-3">
        <EnergySplit macros={perServing} legend={false} />
      </div>
      <p className="mt-3 text-xs text-[var(--text-subtle)]">
        {round(kcal100)} kcal · P {round(protein100)} g · H {round(carbs100)} g · R {round(fat100)} g / 100 g
      </p>
    </div>
  );
}

function validateFields(state: FoodFieldState): { values: FoodFormValues } | { error: string } {
  const parsed = addFoodFormSchema.safeParse({
    name: state.name,
    grams: state.grams,
    kcalPer100: state.kcal,
    proteinPer100: state.protein,
    carbsPer100: state.carbs,
    fatPer100: state.fat,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Tarkista kentät." };
  }
  return { values: parsed.data };
}

/** Päivän ad hoc -ruoan muokkausnäkymä (avataan kortista). */
export function FoodEntryEditSheet({
  entry,
  aiEnabled = true,
  onClose,
  onSave,
}: {
  entry: DayMealPlanEntry;
  aiEnabled?: boolean;
  onClose: () => void;
  onSave: (values: FoodFormValues, source: "manual" | "ai") => Promise<ActionOutcome>;
}) {
  const [error, setError] = useState("");

  // Nimen muutos ajaa AI-uudelleenarvion → lämmitetään funktio jo sheetin avautuessa.
  useEffect(() => {
    if (aiEnabled) {
      warmUpAiEstimate();
    }
  }, [aiEnabled]);

  return (
    <Sheet ariaLabel="Muokkaa ruokaa" onClose={onClose}>
      <h2 className="font-[family-name:var(--font-display)] text-lg font-bold text-[var(--text)]">Muokkaa ruokaa</h2>
      {error ? (
        <p className="mt-3 text-sm text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}
      <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
        <FoodEntryForm
          initialFields={fieldsFromEntry(entry)}
          initialMealTag={entry.mealTag}
          canReestimate={aiEnabled}
          onSubmit={async (values, source) => {
            setError("");
            const result = await onSave(values, source);
            if (result.ok) {
              onClose();
            } else {
              setError(result.message ?? "Tallennus epäonnistui.");
            }
          }}
          submitLabel="Tallenna"
        />
      </div>
    </Sheet>
  );
}

// Muokkauskortin tila: lukunäkymä on oletus, ja yksittäinen muokkaus (nimi / annoskoko / kaikki
// arvot käsin) avataan ...-valikosta.
type FoodEntryEditMode = "view" | "name" | "grams" | "manual";

/**
 * Ruoan muokkauslomake. Arvot näytetään lukunäkymänä (kcal/annos + makrosarakkeet + jakauma) ja
 * muokkaukset avataan ...-valikosta: nimen muutos ajaa AI-uudelleenarvion taustalla (kortti näkyy
 * "Arvioidaan…" -tilassa), annoskoon muutos tallentuu suoraan, ja "Muokkaa arvoja itse" avaa
 * täyden käsilomakkeen. Suoraan käsitilaan mennään, jos arvoja ei ole (esim. AI-arvio epäonnistui).
 */
function FoodEntryForm({
  initialFields,
  initialMealTag,
  canReestimate = false,
  onSubmit,
  submitLabel,
}: {
  initialFields?: FoodFieldState;
  initialMealTag?: MealTag;
  canReestimate?: boolean;
  onSubmit: (values: FoodFormValues, source: "manual" | "ai") => Promise<void>;
  submitLabel: string;
}) {
  const [fields, setFields] = useState<FoodFieldState>(
    initialFields ?? { name: "", grams: "100", kcal: "", protein: "", carbs: "", fat: "" },
  );
  const [mealTag, setMealTag] = useState<MealTag | undefined>(initialMealTag);
  // Nimi muuttunut viimeksi tallennetusta → tallennus ajaa AI-uudelleenarvion taustalla.
  const baselineName = (initialFields?.name ?? "").trim();
  const nameChanged = canReestimate && fields.name.trim().length >= 2 && fields.name.trim() !== baselineName;
  const [fieldError, setFieldError] = useState("");
  const [pending, setPending] = useState(false);
  const [mode, setMode] = useState<FoodEntryEditMode>(() => ((initialFields?.kcal ?? "").trim() ? "view" : "manual"));
  const [menuOpen, setMenuOpen] = useState(false);

  const menuItem = (label: string, onPick: () => void) => (
    <button
      type="button"
      role="menuitem"
      className="w-full rounded-lg px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-[var(--surface-3)]"
      onClick={() => {
        setMenuOpen(false);
        onPick();
      }}
    >
      {label}
    </button>
  );

  return (
    <form
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        const result = validateFields(fields);
        if ("error" in result) {
          setFieldError(result.error);
          return;
        }
        setFieldError("");
        setPending(true);
        try {
          await onSubmit({ ...result.values, mealTag }, nameChanged ? "ai" : "manual");
        } finally {
          setPending(false);
        }
      }}
    >
      {/* Ateriapaikka heti ylhäällä — sama paikka kaikissa kirjaussheeteissä. */}
      {initialMealTag !== undefined ? (
        <MealTagChips value={mealTag ?? initialMealTag} onChange={setMealTag} />
      ) : null}

      {mode === "manual" ? (
        <FoodFields state={fields} setState={setFields} />
      ) : (
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            {mode === "name" ? (
              <label className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-xs font-semibold text-[var(--text-subtle)]">Nimi</span>
                <input
                  type="text"
                  autoFocus
                  value={fields.name}
                  onChange={(event) => setFields({ ...fields, name: event.target.value })}
                  placeholder="esim. Kaurapuuro"
                  className="rounded-lg bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-subtle)]"
                />
              </label>
            ) : (
              <div className="min-w-0">
                <p className="text-base font-semibold text-[var(--text)] [overflow-wrap:anywhere]">{fields.name || "Ruoka"}</p>
                {mode === "grams" ? null : (
                  <p className="mt-0.5 text-xs text-[var(--text-subtle)]">{fields.grams} g</p>
                )}
              </div>
            )}

            <div className="relative shrink-0">
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="Avaa muokkausvalinnat"
                className="grid size-9 place-items-center rounded-full bg-[var(--surface-2)] text-[var(--text-muted)] transition hover:text-[var(--text)]"
                onClick={() => setMenuOpen((open) => !open)}
              >
                <MoreHorizontal className="size-5" aria-hidden="true" />
              </button>
              {menuOpen ? (
                <>
                  {/* Näkymätön tausta sulkee valikon ulkopuolelta napautettaessa. */}
                  <button
                    type="button"
                    aria-hidden="true"
                    tabIndex={-1}
                    className="fixed inset-0 z-10 cursor-default"
                    onClick={() => setMenuOpen(false)}
                  />
                  <div
                    role="menu"
                    className="absolute right-0 top-full z-20 mt-1 min-w-44 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 shadow-[0_12px_30px_-20px_var(--shadow)]"
                  >
                    {canReestimate ? menuItem("Muokkaa nimeä", () => setMode("name")) : null}
                    {menuItem("Muuta annoskokoa", () => setMode("grams"))}
                    {menuItem("Muokkaa arvoja itse", () => setMode("manual"))}
                  </div>
                </>
              ) : null}
            </div>
          </div>

          {mode === "grams" ? (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-[var(--text-subtle)]">Annoskoko</span>
              <div className="flex items-center gap-2 rounded-lg bg-[var(--surface-2)] px-3 py-2">
                <input
                  type="number"
                  inputMode="decimal"
                  autoFocus
                  min={1}
                  max={5000}
                  value={fields.grams}
                  onChange={(event) => setFields({ ...fields, grams: event.target.value })}
                  aria-label="Annoskoko grammoina"
                  className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text)] outline-none"
                />
                <span className="shrink-0 text-xs text-[var(--text-subtle)]">g</span>
              </div>
            </label>
          ) : null}

          <FoodMacroSummary fields={fields} />
        </div>
      )}

      {fieldError ? (
        <p className="text-sm text-[var(--danger)]" role="alert">
          {fieldError}
        </p>
      ) : null}

      {nameChanged ? (
        <>
          <p className="text-xs text-[var(--text-muted)]">
            Nimi muuttui — tallennetaan ja ravintoarvot päivitetään AI:lla taustalla.
          </p>
          <Button type="submit" className="w-full gap-2" loading={pending}>
            <Sparkles className="size-4" aria-hidden="true" />
            Tallenna ja arvioi uudelleen
          </Button>
        </>
      ) : (
        <Button type="submit" className="w-full gap-2" loading={pending}>
          <Plus className="size-4" aria-hidden="true" />
          {submitLabel}
        </Button>
      )}
    </form>
  );
}

/** Pienennä kuva (pitkä sivu ~1024 px) ja palauta JPEG-base64 ilman data-etuliitettä. */
async function fileToScaledBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Kuvan luku epäonnistui."));
    reader.readAsDataURL(file);
  });

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Kuvaa ei voitu avata."));
    img.src = dataUrl;
  });

  // 1536 px (ei 1024) jotta pakkauksen ravintosisältötaulukon pieni teksti pysyy luettavana.
  const maxDim = 1536;
  const scale = Math.min(1, maxDim / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Kuvan käsittely epäonnistui.");
  }
  ctx.drawImage(image, 0, 0, width, height);
  const jpeg = canvas.toDataURL("image/jpeg", 0.85);
  return { base64: jpeg.split(",")[1] ?? "", mimeType: "image/jpeg" };
}
