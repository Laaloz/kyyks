"use client";

import { Camera, Check, Plus, Search, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { CameraCapture } from "@/components/workout/camera-capture";
import { addFoodFormSchema, macroEnergyWarning } from "@/components/workout/schemas";
import { mealTagLabel } from "@/lib/nutrition";
import { cn } from "@/lib/utils";
import type { AppState, DayMealPlanEntry, MealTag } from "@/lib/types";

const MEAL_TAGS: MealTag[] = ["breakfast", "lunch", "snack", "dinner", "evening_snack"];

type FineliMatchLite = {
  ingredientId: string;
  name: string;
  kcalPer100: number;
  proteinPer100: number;
  carbsPer100: number;
  fatPer100: number;
};

type AiEstimate = {
  name: string;
  grams: number;
  kcalPer100: number;
  proteinPer100: number;
  carbsPer100: number;
  fatPer100: number;
  fineliMatch?: FineliMatchLite;
};

type ActionOutcome = { ok: boolean; message?: string };

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
  onClose,
  onLogOwnFood,
  onQuickAdd,
  onQuickAddPhoto,
}: {
  userId: string;
  catalog: AppState["ingredientsCatalog"];
  aiEnabled?: boolean;
  onClose: () => void;
  onLogOwnFood: (ingredientId: string, grams: number) => Promise<ActionOutcome>;
  onQuickAdd: (name: string) => Promise<ActionOutcome>;
  onQuickAddPhoto: (input: { imageBase64: string; mimeType: string }) => Promise<ActionOutcome>;
}) {
  const [query, setQuery] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);

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
      const result = await onQuickAdd(name);
      if (result.ok) {
        onClose();
      } else {
        setError(result.message ?? "Lisäys epäonnistui.");
      }
    } finally {
      setPending(false);
    }
  };

  const analyzeAndAdd = async (base64: string, mimeType: string) => {
    const result = await onQuickAddPhoto({ imageBase64: base64, mimeType });
    if (result.ok) {
      onClose();
    } else {
      setError(result.message ?? "Lisäys epäonnistui.");
    }
  };

  // Tiedostopolku (galleria / fallback): skaalaa ensin, sitten arvioi.
  const runPhoto = async (file: File) => {
    setCameraOpen(false);
    setAnalyzing(true);
    setError("");
    try {
      const { base64, mimeType } = await fileToScaledBase64(file);
      await analyzeAndAdd(base64, mimeType);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kuvan käsittely epäonnistui.");
    } finally {
      setAnalyzing(false);
    }
  };

  // In-app-kamera: kuva on jo skaalattu canvasilla.
  const runCapturedPhoto = async (base64: string, mimeType: string) => {
    setCameraOpen(false);
    setAnalyzing(true);
    setError("");
    try {
      await analyzeAndAdd(base64, mimeType);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kuvan käsittely epäonnistui.");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <Sheet ariaLabel="Lisää ateriaan AI:lla" onClose={onClose}>
      <h2 className="flex items-center gap-2 font-[family-name:var(--font-display)] text-lg font-bold text-[var(--text)]">
        <Sparkles className="size-5 text-[var(--accent)]" aria-hidden="true" />
        Lisää ateriaan AI:lla
      </h2>
      <p className="mt-1 text-sm text-[var(--text-muted)]">Kirjoita tai kuvaa ruoka — AI arvioi ravintoarvot.</p>

      {error ? (
        <p className="mt-3 text-sm text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}

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
          <OwnFoodPicker
            foods={ownFoods}
            onPick={async (ingredientId, grams) => {
              setError("");
              const result = await onLogOwnFood(ingredientId, grams);
              if (result.ok) {
                onClose();
              } else {
                setError(result.message ?? "Lisäys epäonnistui.");
              }
            }}
          />
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
          onCapture={({ base64, mimeType }) => void runCapturedPhoto(base64, mimeType)}
          onPickFile={(file) => void runPhoto(file)}
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

type AiLookupResult = { estimate: AiEstimate } | { error: string };

/** Tekstihaku: hakee makrot ruoan nimellä. */
async function aiTextLookup(name: string): Promise<AiLookupResult> {
  const response = await fetch("/api/nutrition/ai-estimate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: name }),
  }).catch(() => null);
  const payload = (response ? await response.json().catch(() => null) : null) as
    | { estimate?: AiEstimate; message?: string }
    | null;
  if (!response?.ok || !payload?.estimate) {
    return { error: payload?.message ?? "Tekoäly ei juuri nyt vastaa — täytä arvot itse." };
  }
  return { estimate: payload.estimate };
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
  onSave: (values: FoodFormValues) => Promise<ActionOutcome>;
}) {
  const [error, setError] = useState("");

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
          aiLookup={aiEnabled ? aiTextLookup : undefined}
          onSubmit={async (values) => {
            setError("");
            const result = await onSave(values);
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

/**
 * Muokattava ruoan lomake. AI-tekstihaku voi esitäyttää (autoLookup tai painike); muuten
 * kentät täytetään käsin.
 */
function FoodEntryForm({
  initialFields,
  initialName,
  initialMealTag,
  aiPrefilled = false,
  aiLookup,
  onSubmit,
  submitLabel,
}: {
  initialFields?: FoodFieldState;
  initialName?: string;
  initialMealTag?: MealTag;
  aiPrefilled?: boolean;
  aiLookup?: (name: string) => Promise<AiLookupResult>;
  onSubmit: (values: FoodFormValues, source: "manual" | "ai") => Promise<void>;
  submitLabel: string;
}) {
  const [fields, setFields] = useState<FoodFieldState>(
    initialFields ?? { name: initialName ?? "", grams: "100", kcal: "", protein: "", carbs: "", fat: "" },
  );
  const [mealTag, setMealTag] = useState<MealTag | undefined>(initialMealTag);
  const [usedAi, setUsedAi] = useState(aiPrefilled);
  // Onko nimi muuttunut viimeksi arvioidusta → alapainike morffaa "Arvioi
  // ravintoarvot uudelleen" -toiminnoksi; muuten/arvion jälkeen "Tallenna".
  const [estimateBaselineName, setEstimateBaselineName] = useState((initialFields?.name ?? "").trim());
  const nameChanged = Boolean(aiLookup) && fields.name.trim().length >= 2 && fields.name.trim() !== estimateBaselineName;
  const [fieldError, setFieldError] = useState("");
  const [aiNote, setAiNote] = useState("");
  const [pending, setPending] = useState(false);
  const [aiPending, setAiPending] = useState(false);

  const runAiLookup = async (name: string) => {
    if (!aiLookup || name.trim().length < 2) {
      return;
    }
    setAiNote("");
    setAiPending(true);
    try {
      const result = await aiLookup(name.trim());
      if ("estimate" in result) {
        const e = result.estimate;
        setFields({
          name: e.name,
          grams: String(round(e.grams)),
          kcal: String(round(e.kcalPer100)),
          protein: String(round(e.proteinPer100)),
          carbs: String(round(e.carbsPer100)),
          fat: String(round(e.fatPer100)),
        });
        setUsedAi(true);
        // Arvio tehty tälle nimelle → painike palaa "Tallenna"-tilaan.
        setEstimateBaselineName(e.name.trim());
      } else {
        setAiNote(result.error);
        // Arvio epäonnistui → älä jää "Arvioi"-umpikujaan: salli tallennus
        // nykyisillä (käsin täytetyillä) arvoilla.
        setEstimateBaselineName(name.trim());
      }
    } finally {
      setAiPending(false);
    }
  };

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
          await onSubmit({ ...result.values, mealTag }, usedAi ? "ai" : "manual");
        } finally {
          setPending(false);
        }
      }}
    >
      {aiPending ? (
        <p className="text-sm text-[var(--text-subtle)]" role="status">
          Haetaan ravintotietoja tekoälyllä…
        </p>
      ) : usedAi ? (
        <div className="rounded-xl bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))] px-3 py-2.5">
          <p className="text-xs font-medium text-[var(--text-muted)]">AI-arvio — tarkista etenkin annoskoko.</p>
        </div>
      ) : aiNote ? (
        <p className="text-xs text-[var(--text-subtle)]">{aiNote}</p>
      ) : null}

      <FoodFields state={fields} setState={setFields} />

      {initialMealTag !== undefined ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-[var(--text-subtle)]">Ateriapaikka</span>
          <div className="flex flex-wrap gap-1.5">
            {MEAL_TAGS.map((tag) => {
              const active = (mealTag ?? initialMealTag) === tag;
              return (
                <button
                  key={tag}
                  type="button"
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                    active ? "bg-[var(--text)] text-[var(--background)]" : "bg-[var(--surface-2)] text-[var(--text-muted)]"
                  }`}
                  onClick={() => setMealTag(tag)}
                >
                  {mealTagLabel(tag)}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {fieldError ? (
        <p className="text-sm text-[var(--danger)]" role="alert">
          {fieldError}
        </p>
      ) : null}

      {nameChanged ? (
        <>
          <p className="text-xs text-[var(--text-muted)]">Nimi muuttui — päivitä ravintoarvot tekoälyllä.</p>
          <Button
            type="button"
            className="w-full gap-2"
            loading={aiPending}
            onClick={() => void runAiLookup(fields.name)}
          >
            <Sparkles className="size-4" aria-hidden="true" />
            Arvioi ravintoarvot uudelleen
          </Button>
        </>
      ) : (
        <Button type="submit" className="w-full gap-2" loading={pending} disabled={aiPending}>
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

  const maxDim = 1024;
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
  const jpeg = canvas.toDataURL("image/jpeg", 0.8);
  return { base64: jpeg.split(",")[1] ?? "", mimeType: "image/jpeg" };
}
