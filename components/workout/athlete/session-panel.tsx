"use client";

import { BookOpen, Check, ChevronDown, ChevronLeft, ChevronUp, Clock3, GripVertical, MoreHorizontal, Plus, Search, Settings2, Trash2, X } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type CSSProperties,
} from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DragNumber } from "@/components/ui/drag-number";
import { calculateEstimatedOneRepMax } from "@/lib/exercise-progress";
import { Input, Label, Textarea } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { InfoTooltip } from "@/components/ui/tooltip";
import { InlineFeedback } from "@/components/workout/inline-feedback";
import { withMinimumDelay } from "@/lib/min-delay";
import { useKeepScreenOnPreference, useWakeLock } from "@/lib/use-wake-lock";
import { workoutStatusBadgeClass, workoutStatusLabel } from "@/components/workout/shared";
import { calculateSessionDurationSeconds } from "@/lib/domain";
import type { Exercise, WorkoutSession } from "@/lib/types";
import { formatDate } from "@/lib/utils";

type PreviousExerciseResult = {
  actualReps?: number;
  actualLoad?: number;
  completedAt: string;
  timesCompleted: number;
};

type ExerciseGroup = {
  key: string;
  exerciseName: string;
  supersetGroup?: string;
  logs: WorkoutSession["setLogs"];
};

type PersistedWorkoutUiState = {
  noteDraft?: string;
  restTotalSeconds?: number;
  restEndsAt?: number;
  restExerciseKey?: string;
  restExerciseName?: string;
  hasSeenDragHint?: boolean;
};

const inputDragHandleClass =
  "flex h-full w-full items-center justify-center rounded-[0.6rem] border border-[color-mix(in_srgb,var(--border)_58%,transparent)] bg-[color-mix(in_srgb,var(--surface)_96%,transparent)] text-[color-mix(in_srgb,var(--text-subtle)_82%,transparent)] transition hover:border-[color-mix(in_srgb,var(--border-strong)_72%,transparent)] hover:bg-[color-mix(in_srgb,var(--surface)_98%,var(--surface-2))] hover:text-[var(--text-muted)]";

const inputDragHandleActiveClass =
  "border-[color-mix(in_srgb,var(--accent)_55%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_12%,var(--surface))] text-[var(--accent)] shadow-[0_10px_20px_-16px_var(--accent)]";

const dragPixelsPerStep = 14;

type DragField = "reps" | "load";

type DragSession = {
  logId: string;
  field: DragField;
  pointerId: number;
  startY: number;
  lastStepOffset: number;
  currentValue: number;
  increment: number;
};

function getWorkoutUiStorageKey(scheduledWorkoutId: string) {
  return `rookiapp.workout-ui.${scheduledWorkoutId}`;
}

function readPersistedWorkoutUiState(scheduledWorkoutId: string): PersistedWorkoutUiState | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(getWorkoutUiStorageKey(scheduledWorkoutId));
    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as PersistedWorkoutUiState;
  } catch {
    return null;
  }
}

function persistWorkoutUiState(scheduledWorkoutId: string, state: PersistedWorkoutUiState) {
  if (typeof window === "undefined") {
    return;
  }

  const hasContent = Object.values(state).some((value) => value !== undefined && value !== null && value !== "");

  try {
    if (!hasContent) {
      window.sessionStorage.removeItem(getWorkoutUiStorageKey(scheduledWorkoutId));
      return;
    }

    window.sessionStorage.setItem(getWorkoutUiStorageKey(scheduledWorkoutId), JSON.stringify(state));
  } catch {
    // Ignore storage failures on restricted browsers.
  }
}

function compareSetLabels(left: string, right: string) {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

function getWorkoutFieldId(
  scheduledWorkoutId: string,
  logId: string,
  field: "reps" | "load",
) {
  return `${scheduledWorkoutId}-${logId}-${field}`;
}

// Liikkeen visuaalinen demo. Ensisijaisesti animaatio (näyttää koko liikeradan ja korostaa
// työskentelevät lihakset); jos sitä ei ole, alku- ja loppuasento ristihäivytettynä.
// Lähteillä on eri aukot, joten ne täydentävät toisiaan — 130/133 liikkeellä on jompikumpi.
// Kolmelta puuttuu molemmat, jolloin sheetissä näkyy pelkkä ohjeteksti kuten ennenkin.
function ExerciseDemo({ exercise }: { exercise: Exercise }) {
  if (exercise.animationUrl) {
    return (
      <div className="exercise-demo exercise-demo--animation mt-3 border border-[var(--border)]">
        <img
          className="exercise-demo-frame"
          src={exercise.animationUrl}
          alt={`${exercise.name}: suoritus`}
          width={180}
          height={180}
          loading="lazy"
          decoding="async"
        />
      </div>
    );
  }

  if (!exercise.imageStartUrl || !exercise.imageEndUrl) {
    return null;
  }

  return (
    <div className="exercise-demo mt-3 border border-[var(--border)]">
      <img
        className="exercise-demo-frame"
        src={exercise.imageStartUrl}
        alt={`${exercise.name}: alkuasento`}
        width={640}
        height={427}
        loading="lazy"
        decoding="async"
      />
      <img
        className="exercise-demo-frame exercise-demo-end"
        src={exercise.imageEndUrl}
        alt={`${exercise.name}: loppuasento`}
        width={640}
        height={427}
        loading="lazy"
        decoding="async"
      />
    </div>
  );
}

// Liikerivin tunnistekuva. Ensisijaisesti animaation staattinen versio: se on
// korkeakontrastista viivagrafiikkaa keskitettynä, mikä lukeutuu 44 pikselissä selvästi
// paremmin kuin tumma salivalokuva. Animaatiota itseään ei käytetä — kymmenen toistuvaa
// WebP:tä veisi huomion sarjakuittauksesta. Klikkaus avaa ohjesheetin, jossa animaatio
// näkyy täysikokoisena.
function ExerciseThumbnail({
  exercise,
  onOpen,
}: {
  exercise?: Exercise;
  onOpen?: () => void;
}) {
  const src = exercise?.thumbnailUrl ?? exercise?.imageStartUrl;
  if (!src) {
    return null;
  }

  const image = (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      width={44}
      height={44}
      loading="lazy"
      decoding="async"
      className="size-11 shrink-0 rounded-[10px] border border-[var(--border)] bg-white object-contain"
    />
  );

  if (!onOpen) {
    return image;
  }

  return (
    <button
      type="button"
      aria-label={`${exercise?.name ?? "Liike"} ohje`}
      title="Ohje"
      className="shrink-0 rounded-[10px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] hover:opacity-80"
      onClick={onOpen}
    >
      {image}
    </button>
  );
}

function CoachInstructionDialog({
  exerciseName,
  instruction,
  exercise,
  onClose,
}: {
  exerciseName: string;
  instruction: string;
  exercise?: Exercise;
  onClose: () => void;
}) {
  const steps = exercise?.instructionSteps ?? [];

  return (
    <Sheet onClose={onClose} ariaLabelledby="coach-instruction-title" ariaDescribedby="coach-instruction-description">
        <p className="text-sm font-semibold text-[var(--accent)]">Valmentajan ohje</p>
        <h3
          id="coach-instruction-title"
          className="mt-2 font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--text)]"
        >
          {exerciseName}
        </h3>
        <div className="mt-3 max-h-[60vh] overflow-y-auto">
          <p
            id="coach-instruction-description"
            className="whitespace-pre-line text-sm leading-6 text-[var(--text-muted)]"
          >
            {instruction}
          </p>
          {exercise ? <ExerciseDemo exercise={exercise} /> : null}
          {steps.length ? (
            <>
              <p className="mt-4 text-sm font-semibold text-[var(--text)]">Suoritus</p>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-6 text-[var(--text-muted)]">
                {steps.map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ol>
            </>
          ) : null}
        </div>
    </Sheet>
  );
}

function ExerciseStructureDialog({
  mode,
  exerciseName,
  templateExerciseId,
  exercises,
  initialExerciseId,
  initialSetCount,
  initialTargetReps,
  initialTargetRepsMin,
  initialTargetRepsMax,
  initialRestSeconds,
  onClose,
  onSubmit,
  onRemove,
}: {
  mode: "edit" | "add_extra";
  exerciseName?: string;
  templateExerciseId?: string;
  exercises: Exercise[];
  initialExerciseId?: string;
  initialSetCount?: number;
  initialTargetReps?: number;
  initialTargetRepsMin?: number;
  initialTargetRepsMax?: number;
  initialRestSeconds?: number;
  onClose: () => void;
  onSubmit: (payload: {
    exerciseId: string;
    customExerciseName?: string;
    setCount?: number;
    targetReps?: number;
    targetRepsMin?: number;
    targetRepsMax?: number;
    restSeconds?: number;
  }) => void;
  onRemove?: (templateExerciseId: string) => void;
}) {
  const CUSTOM_EXERCISE_VALUE = "__custom__";
  const hasInitialRange =
    initialTargetRepsMin !== undefined &&
    initialTargetRepsMax !== undefined &&
    initialTargetRepsMax > initialTargetRepsMin;
  const [exerciseId, setExerciseId] = useState(initialExerciseId ?? exercises[0]?.id ?? "");
  const [customExerciseName, setCustomExerciseName] = useState("");
  const [setCount, setSetCount] = useState(String(initialSetCount ?? 3));
  const [targetReps, setTargetReps] = useState(String(initialTargetReps ?? 12));
  const [repsMode, setRepsMode] = useState<"single" | "range">(hasInitialRange ? "range" : "single");
  const [targetRepsMin, setTargetRepsMin] = useState(String(initialTargetRepsMin ?? initialTargetReps ?? 8));
  const [targetRepsMax, setTargetRepsMax] = useState(String(initialTargetRepsMax ?? initialTargetReps ?? 12));
  const [restSeconds, setRestSeconds] = useState(String(initialRestSeconds ?? 120));
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filteredExercises = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return exercises;
    }
    return exercises.filter((item) => item.name.toLowerCase().includes(normalized));
  }, [exercises, query]);
  const selectedExercise = exercises.find((item) => item.id === exerciseId);
  const triggerLabel = exerciseId === CUSTOM_EXERCISE_VALUE
    ? customExerciseName.trim() || "Luo oma liike"
    : selectedExercise?.name ?? "Valitse liike";

  const buildPayload = () => {
    const nextSetCount = Math.min(8, Math.max(1, Number(setCount) || 3));
    const nextRestSeconds = Math.min(900, Math.max(15, Number(restSeconds) || 120));

    if (repsMode === "range") {
      const parsedMin = Math.min(50, Math.max(1, Number(targetRepsMin) || Number(targetReps) || 1));
      const parsedMax = Math.min(50, Math.max(1, Number(targetRepsMax) || Number(targetReps) || parsedMin));
      const nextTargetRepsMin = Math.min(parsedMin, parsedMax);
      const nextTargetRepsMax = Math.max(parsedMin, parsedMax);

      return {
        exerciseId,
        customExerciseName: exerciseId === CUSTOM_EXERCISE_VALUE ? customExerciseName.trim() : undefined,
        setCount: nextSetCount,
        targetReps: nextTargetRepsMin,
        targetRepsMin: nextTargetRepsMin,
        targetRepsMax: nextTargetRepsMax,
        restSeconds: nextRestSeconds,
      };
    }

    const nextTargetReps = Math.min(50, Math.max(1, Number(targetReps) || Number(targetRepsMin) || 12));
    return {
      exerciseId,
      customExerciseName: exerciseId === CUSTOM_EXERCISE_VALUE ? customExerciseName.trim() : undefined,
      setCount: nextSetCount,
      targetReps: nextTargetReps,
      restSeconds: nextRestSeconds,
    };
  };

  return (
    <Sheet
      onClose={onClose}
      ariaLabelledby="exercise-structure-title"
      className="max-w-none overflow-hidden sm:max-w-lg"
    >
        <p className="text-sm font-semibold text-[var(--accent)]">
          {mode === "edit" ? "Muokkaa liikettä" : "Lisää extra-liike"}
        </p>
        <h3
          id="exercise-structure-title"
          className="mt-2 font-[family-name:var(--font-display)] text-2xl font-bold leading-tight text-[var(--text)]"
        >
          {mode === "edit" ? exerciseName ?? "Liike" : "Uusi liike"}
        </h3>
        <div className="mt-5 flex-1 space-y-4 overflow-y-auto pr-1">
          <div className={`relative ${isOpen ? "z-20 pb-2" : ""}`}>
            <Label htmlFor="exercise-structure-select">Liike</Label>
            <button
              id="exercise-structure-select"
              type="button"
              className="flex w-full items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-left text-base text-[var(--text)] outline-none transition hover:border-[var(--border-strong)] focus-visible:border-[var(--accent)]"
              onClick={() => setIsOpen((current) => !current)}
              aria-expanded={isOpen}
              aria-haspopup="listbox"
            >
              <span className="truncate">{triggerLabel}</span>
              <ChevronDown
                className={`size-4 shrink-0 text-[var(--text-subtle)] transition ${isOpen ? "rotate-180" : ""}`}
                aria-hidden="true"
              />
            </button>
            {isOpen ? (
              <div className="mt-2 overflow-hidden rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] shadow-[0_18px_45px_-24px_var(--shadow)]">
                <div className="border-b border-[var(--border)] p-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-subtle)]" aria-hidden="true" />
                    <Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Hae tai nimeä uusi liike…" />
                  </div>
                </div>
                <div className="max-h-[min(40svh,18rem)] overflow-y-auto p-2">
                  <button
                    type="button"
                    className="mb-1 flex w-full items-center justify-between gap-2 rounded-xl border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-2.5 text-left text-sm font-semibold text-[var(--accent)] transition hover:brightness-105"
                    onClick={() => {
                      setExerciseId(CUSTOM_EXERCISE_VALUE);
                      if (query.trim()) {
                        setCustomExerciseName(query.trim());
                      }
                      setQuery("");
                      setIsOpen(false);
                    }}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Plus className="size-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">{query.trim() ? `Luo oma liike: "${query.trim()}"` : "Luo oma liike"}</span>
                    </span>
                    {exerciseId === CUSTOM_EXERCISE_VALUE ? <Check className="size-4 shrink-0" /> : null}
                  </button>
                  {filteredExercises.map((exercise) => (
                    <button
                      key={exercise.id}
                      type="button"
                      className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-[var(--surface-2)]"
                      onClick={() => {
                        setExerciseId(exercise.id);
                        setIsOpen(false);
                      }}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-[var(--text)]">{exercise.name}</span>
                          <span className="block truncate text-xs text-[var(--text-subtle)]">{exercise.category}</span>
                        </span>
                        {exercise.scope === "coach_custom" ? (
                          <span className="shrink-0 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--accent)]">
                            Oma
                          </span>
                        ) : null}
                      </span>
                      {exerciseId === exercise.id ? <Check className="size-4 shrink-0 text-[var(--accent)]" /> : null}
                    </button>
                  ))}
                  {filteredExercises.length === 0 ? (
                    <p className="px-3 py-3 text-sm text-[var(--text-subtle)]">Ei liikkeitä haulla — voit luoda oman yllä.</p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
          {exerciseId === CUSTOM_EXERCISE_VALUE ? (
            <div>
              <Label htmlFor="custom-exercise-name">Oman liikkeen nimi</Label>
              <Input
                id="custom-exercise-name"
                value={customExerciseName}
                onChange={(event) => setCustomExerciseName(event.target.value)}
                placeholder="Esim. Viparit taljassa"
              />
            </div>
          ) : null}
          {mode === "add_extra" || mode === "edit" ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="extra-set-count">Sarjat</Label>
                  <Input id="extra-set-count" value={setCount} onChange={(event) => setSetCount(event.target.value)} inputMode="numeric" placeholder="3" />
                </div>
                <div>
                  <Label htmlFor="extra-rest-seconds">Lepo (s)</Label>
                  <Input id="extra-rest-seconds" value={restSeconds} onChange={(event) => setRestSeconds(event.target.value)} inputMode="numeric" placeholder="120" />
                </div>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <Label className="mb-0" htmlFor={repsMode === "range" ? "extra-target-reps-min" : "extra-target-reps"}>
                    Toistot
                  </Label>
                  <div className="inline-flex shrink-0 rounded-full bg-[var(--surface-2)] p-1">
                    {(["single", "range"] as const).map((value) => (
                      <button
                        key={value}
                        type="button"
                        className={`rounded-full px-3 py-1 text-sm font-semibold transition ${
                          repsMode === value
                            ? "bg-[var(--text)] text-[var(--background)] shadow-[0_8px_18px_-16px_var(--shadow)]"
                            : "text-[var(--text-muted)] hover:text-[var(--text)]"
                        }`}
                        onClick={() => setRepsMode(value)}
                        aria-pressed={repsMode === value}
                      >
                        {value === "single" ? "Yksi" : "Range"}
                      </button>
                    ))}
                  </div>
                </div>
                {repsMode === "range" ? (
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                    <Input
                      id="extra-target-reps-min"
                      value={targetRepsMin}
                      onChange={(event) => setTargetRepsMin(event.target.value)}
                      inputMode="numeric"
                      placeholder="5"
                      aria-label="Toistojen minimi"
                    />
                    <span className="text-sm font-semibold text-[var(--text-subtle)]">-</span>
                    <Input
                      id="extra-target-reps-max"
                      value={targetRepsMax}
                      onChange={(event) => setTargetRepsMax(event.target.value)}
                      inputMode="numeric"
                      placeholder="8"
                      aria-label="Toistojen maksimi"
                    />
                  </div>
                ) : (
                  <Input id="extra-target-reps" value={targetReps} onChange={(event) => setTargetReps(event.target.value)} inputMode="numeric" placeholder="12" />
                )}
              </div>
            </div>
          ) : null}
        </div>
        <div className="mt-5 shrink-0 space-y-3 border-t border-[var(--border)] pt-4">
          <Button
            type="button"
            className="w-full"
            onClick={() => onSubmit(buildPayload())}
            disabled={!exerciseId || (exerciseId === CUSTOM_EXERCISE_VALUE && !customExerciseName.trim())}
          >
            {mode === "edit" ? "Tallenna muutokset" : "Lisää liike"}
          </Button>
          {mode === "edit" && templateExerciseId && onRemove ? (
            <button
              type="button"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-base font-semibold text-[var(--danger)] transition hover:bg-[color-mix(in_srgb,var(--danger)_8%,var(--surface))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--danger)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
              onClick={() => onRemove(templateExerciseId)}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              Poista liike
            </button>
          ) : null}
        </div>
    </Sheet>
  );
}

type AnchorRect = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

const floatingMenuPadding = 8;
const floatingMenuOffset = 6;

function toAnchorRect(rect: DOMRect): AnchorRect {
  return {
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    left: rect.left,
  };
}

function getHiddenFloatingMenuStyle(anchor: AnchorRect): CSSProperties {
  return {
    position: "fixed",
    top: anchor.bottom + floatingMenuOffset,
    left: Math.max(floatingMenuPadding, anchor.right - 180),
    maxWidth: `calc(100vw - ${floatingMenuPadding * 2}px)`,
    visibility: "hidden",
  };
}

function getFloatingMenuStyle(anchor: AnchorRect, menuElement: HTMLElement): CSSProperties {
  const menuRect = menuElement.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  const preferredLeft = anchor.right - menuRect.width;
  const maxLeft = viewportWidth - menuRect.width - floatingMenuPadding;
  const left = Math.max(floatingMenuPadding, Math.min(preferredLeft, maxLeft));

  const spaceBelow = viewportHeight - anchor.bottom - floatingMenuPadding;
  const spaceAbove = anchor.top - floatingMenuPadding;
  const placeAbove = spaceBelow < menuRect.height && spaceAbove > spaceBelow;
  const preferredTop = placeAbove
    ? anchor.top - menuRect.height - floatingMenuOffset
    : anchor.bottom + floatingMenuOffset;
  const maxTop = viewportHeight - menuRect.height - floatingMenuPadding;
  const top = Math.max(floatingMenuPadding, Math.min(preferredTop, maxTop));

  return {
    position: "fixed",
    top,
    left,
    maxWidth: viewportWidth - floatingMenuPadding * 2,
    maxHeight: viewportHeight - floatingMenuPadding * 2,
    overflowX: "hidden",
    overflowY: "auto",
  };
}

function formatPreviousExerciseResult(previous: PreviousExerciseResult) {
  const parts: string[] = [];

  if (previous.actualReps !== undefined) {
    parts.push(`${previous.actualReps} toistoa`);
  }
  if (previous.actualLoad !== undefined) {
    parts.push(`${previous.actualLoad} kg`);
  }
  return parts.length ? parts.join(" · ") : "ei tallennettua dataa";
}

function formatDuration(seconds: number) {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function formatWorkoutDuration(seconds: number) {
  const safe = Math.max(0, seconds);
  if (safe < 3600) {
    return formatDuration(safe);
  }

  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remainder = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function parseDurationInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parts = trimmed.split(":").map((part) => part.trim());
  if (parts.some((part) => part === "" || !/^\d+$/.test(part))) {
    return null;
  }

  if (parts.length === 2) {
    const [minutes, seconds] = parts.map(Number);
    if (seconds > 59) {
      return null;
    }
    return minutes * 60 + seconds;
  }

  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts.map(Number);
    if (minutes > 59 || seconds > 59) {
      return null;
    }
    return hours * 3600 + minutes * 60 + seconds;
  }

  return null;
}

function formatWorkoutDateInput(value: string) {
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) {
    return "";
  }

  const year = timestamp.getFullYear();
  const month = String(timestamp.getMonth() + 1).padStart(2, "0");
  const day = String(timestamp.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTargetReps(log: WorkoutSession["setLogs"][number]) {
  if (
    log.targetRepsMin !== undefined &&
    log.targetRepsMax !== undefined &&
    log.targetRepsMax >= log.targetRepsMin &&
    log.targetRepsMax !== log.targetRepsMin
  ) {
    return `${log.targetRepsMin}-${log.targetRepsMax}`;
  }

  return String(log.targetReps);
}

function formatExerciseTargetSummary(logs: WorkoutSession["setLogs"]) {
  if (!logs.length) {
    return "";
  }

  const repTargets = Array.from(new Set(logs.map((log) => formatTargetReps(log))));
  const restTargets = logs
    .map((log) => log.targetRestSeconds)
    .filter((value): value is number => value !== undefined);

  const parts = [`${logs.length} sarjaa`];

  parts.push(
    repTargets.length === 1
      ? `${repTargets[0]} toistoa`
      : "sarjakohtaiset toistot",
  );

  if (restTargets.length > 0) {
    const uniqueRests = Array.from(new Set(restTargets));
    parts.push(uniqueRests.length === 1 ? `lepo ${formatDuration(uniqueRests[0])}` : "sarjakohtainen lepo");
  }

  return parts.join(" · ");
}

function isBelowTargetRepMinimum(log: WorkoutSession["setLogs"][number]) {
  if (log.actualReps === undefined || log.actualReps === null) {
    return false;
  }

  const targetMinimum = log.targetRepsMin ?? log.targetReps;
  return log.actualReps < targetMinimum;
}

function formatLoadDraftValue(value: number) {
  return String(value).replace(".", ",");
}

function parseLoadDraftValue(rawValue: string) {
  const normalized = rawValue.trim().replace(",", ".");
  if (!normalized || normalized.endsWith(".")) {
    return null;
  }

  const parsedValue = Number(normalized);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

const repsTooltipText =
  "Kirjaa tähän toteutuneet toistot. Jos teit enemmän tai vähemmän kuin suunnitelmassa, merkitse tähän oikea määrä.";

const loadTooltipText =
  "Kirjaa tähän sarjassa käytetty kuorma kiloina. Jos teit sarjan ilman lisäpainoa, jätä kenttä arvoon 0 tai tyhjäksi käytäntönne mukaan. Kuorman säätöaskelta voit muuttaa kohdasta Tili > Asetukset.";

export function AthleteSessionPanel({
  scheduledWorkoutId,
  scheduledWorkoutTitle,
  scheduledWorkoutDescription,
  scheduledWorkoutGuidance,
  selectedSession,
  note,
  status,
  scheduledDate,
  onStart,
  onUpdate,
  onUpdateDate,
  onUpdateDuration,
  onSaveNote,
  onComplete,
  onCancel,
  onDelete,
  onBackToList,
  canDeleteWorkout,
  initialCorrectionMode,
  progress,
  previousExerciseResults,
  exerciseInstructions,
  exerciseOrder,
  activeWorkoutCount,
  workoutMessage,
  isCompleting,
  isSessionSyncing,
  forceReadOnly = false,
  loadIncrementKg,
  availableExercises,
  onExerciseStructureUpdate,
}: {
  scheduledWorkoutId: string;
  scheduledWorkoutTitle: string;
  scheduledWorkoutDescription?: string;
  scheduledWorkoutGuidance?: string;
  selectedSession?: WorkoutSession;
  note: string;
  status: string;
  scheduledDate?: string;
  onStart: () => void | Promise<void>;
  onUpdate: (logId: string, patch: { actualReps?: number | null; actualLoad?: number | null; done?: boolean }) => void;
  onUpdateDate: (scheduledDate: string) => Promise<{ ok: boolean; message?: string }>;
  onUpdateDuration: (durationSeconds: number) => Promise<{ ok: boolean; message?: string }>;
  onSaveNote: (body: string) => void;
  onComplete: () => void | Promise<void>;
  onCancel: () => void | Promise<void>;
  onDelete: () => void | Promise<void>;
  onBackToList: () => void;
  canDeleteWorkout: boolean;
  initialCorrectionMode: boolean;
  progress: { totalSets: number; completedSets: number; percent: number; allDone: boolean } | null;
  previousExerciseResults: Map<string, PreviousExerciseResult>;
  exerciseInstructions: Map<string, string>;
  exerciseOrder: Map<string, number>;
  activeWorkoutCount?: number;
  workoutMessage: string;
  isCompleting: boolean;
  isSessionSyncing?: boolean;
  // Esikatselu (vaihe 8): pakottaa koko paneelin read-only-tilaan tilasta riippumatta.
  forceReadOnly?: boolean;
  loadIncrementKg: 1 | 2.5 | 5;
  availableExercises: Exercise[];
  onExerciseStructureUpdate: (
    action:
      | {
          type: "replace";
          templateExerciseId: string;
          exerciseId: string;
          customExerciseName?: string;
          setCount?: number;
          targetReps?: number;
          targetRepsMin?: number;
          targetRepsMax?: number;
          restSeconds?: number;
        }
      | {
          type: "add_extra";
          exerciseId: string;
          customExerciseName?: string;
          setCount?: number;
          targetReps?: number;
          targetRepsMin?: number;
          targetRepsMax?: number;
          restSeconds?: number;
        }
      | { type: "remove"; templateExerciseId: string }
  ) => Promise<{ ok: boolean; message?: string }>;
}) {
  const [localNote, setLocalNote] = useState(note);
  const noteSaveTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    setLocalNote(note);
  }, [note, scheduledWorkoutId]);

  useEffect(() => {
    return () => {
      if (noteSaveTimeoutRef.current !== null) {
        window.clearTimeout(noteSaveTimeoutRef.current);
      }
    };
  }, []);
  const [correctionMode, setCorrectionMode] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [restTotalSeconds, setRestTotalSeconds] = useState(0);
  const [restSecondsLeft, setRestSecondsLeft] = useState(0);
  const [restRunning, setRestRunning] = useState(false);
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  const [restExerciseKey, setRestExerciseKey] = useState<string | null>(null);
  const [restExerciseName, setRestExerciseName] = useState<string | null>(null);
  const [expandedExerciseKeys, setExpandedExerciseKeys] = useState<Record<string, boolean>>({});
  // exerciseId talletetaan id:nä eikä olio-viitteenä, jotta sheetin sisältö seuraa
  // katalogin päivittymistä (kuvat saapuvat app-staten mukana taustalla).
  const [openInstruction, setOpenInstruction] = useState<{
    exerciseName: string;
    instruction: string;
    exerciseId?: string;
  } | null>(null);
  const exerciseById = useMemo(
    () => new Map(availableExercises.map((exercise) => [exercise.id, exercise])),
    [availableExercises],
  );
  const [openExerciseStructure, setOpenExerciseStructure] = useState<
    | {
        mode: "edit";
        templateExerciseId: string;
        exerciseName: string;
        initialExerciseId?: string;
        initialSetCount?: number;
        initialTargetReps?: number;
        initialTargetRepsMin?: number;
        initialTargetRepsMax?: number;
        initialRestSeconds?: number;
      }
    | { mode: "add_extra" }
    | null
  >(null);
  const [isSecondaryActionsOpen, setIsSecondaryActionsOpen] = useState(false);
  const [secondaryActionsAnchorRect, setSecondaryActionsAnchorRect] = useState<AnchorRect | null>(null);
  const [secondaryActionsMenuStyle, setSecondaryActionsMenuStyle] = useState<CSSProperties | null>(null);
  const [scheduledDateDraft, setScheduledDateDraft] = useState("");
  const [durationDraft, setDurationDraft] = useState("");
  const [dateMessage, setDateMessage] = useState("");
  const [durationMessage, setDurationMessage] = useState("");
  const [dateMessageTone, setDateMessageTone] = useState<"success" | "danger" | null>(null);
  const [durationMessageTone, setDurationMessageTone] = useState<"success" | "danger" | null>(null);
  const [isSavingDate, setIsSavingDate] = useState(false);
  const [isSavingDuration, setIsSavingDuration] = useState(false);
  const [hasSeenDragHint, setHasSeenDragHint] = useState(false);
  const [isStartingWorkout, setIsStartingWorkout] = useState(false);
  const [isCancellingWorkout, setIsCancellingWorkout] = useState(false);
  const [isDeletingWorkout, setIsDeletingWorkout] = useState(false);
  const [loadDrafts, setLoadDrafts] = useState<Record<string, string>>({});
  const [dragSession, setDragSession] = useState<DragSession | null>(null);
  const secondaryActionsMenuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const persistedState = readPersistedWorkoutUiState(scheduledWorkoutId);
    if (!persistedState) {
      setLocalNote(note);
      setRestTotalSeconds(0);
      setRestSecondsLeft(0);
      setRestRunning(false);
      setRestEndsAt(null);
      setRestExerciseKey(null);
      setRestExerciseName(null);
      setHasSeenDragHint(false);
      return;
    }

    setLocalNote(persistedState.noteDraft ?? note);
    setHasSeenDragHint(Boolean(persistedState.hasSeenDragHint));

    if (
      status === "in_progress" &&
      typeof persistedState.restEndsAt === "number" &&
      typeof persistedState.restTotalSeconds === "number" &&
      persistedState.restEndsAt > Date.now() &&
      persistedState.restTotalSeconds > 0
    ) {
      setRestTotalSeconds(persistedState.restTotalSeconds);
      setRestEndsAt(persistedState.restEndsAt);
      setRestSecondsLeft(Math.max(0, Math.ceil((persistedState.restEndsAt - Date.now()) / 1000)));
      setRestRunning(true);
      setRestExerciseKey(persistedState.restExerciseKey ?? null);
      setRestExerciseName(persistedState.restExerciseName ?? null);
      return;
    }

    setRestTotalSeconds(0);
    setRestSecondsLeft(0);
    setRestRunning(false);
    setRestEndsAt(null);
    setRestExerciseKey(null);
    setRestExerciseName(null);
  }, [note, scheduledWorkoutId, status]);

  useEffect(() => {
    persistWorkoutUiState(scheduledWorkoutId, {
      noteDraft: localNote.trim() ? localNote : undefined,
      restTotalSeconds: restRunning ? restTotalSeconds : undefined,
      restEndsAt: restRunning ? restEndsAt ?? undefined : undefined,
      restExerciseKey: restRunning ? restExerciseKey ?? undefined : undefined,
      restExerciseName: restRunning ? restExerciseName ?? undefined : undefined,
      hasSeenDragHint,
    });
  }, [hasSeenDragHint, localNote, restEndsAt, restExerciseKey, restExerciseName, restRunning, restTotalSeconds, scheduledWorkoutId]);

  useEffect(() => {
    setCorrectionMode(initialCorrectionMode && status === "completed");
  }, [initialCorrectionMode, status]);

  useEffect(() => {
    setIsSecondaryActionsOpen(false);
    setSecondaryActionsAnchorRect(null);
    setSecondaryActionsMenuStyle(null);
    setRestTotalSeconds(0);
    setRestSecondsLeft(0);
    setRestRunning(false);
    setRestEndsAt(null);
    setRestExerciseKey(null);
    setRestExerciseName(null);
    setExpandedExerciseKeys({});
    setOpenInstruction(null);
    setDateMessage("");
    setDurationMessage("");
    setDateMessageTone(null);
    setDurationMessageTone(null);
    setHasSeenDragHint(false);
    setLoadDrafts({});
  }, [scheduledWorkoutId]);

  useEffect(() => {
    if (!selectedSession) {
      setElapsedSeconds(0);
      return;
    }

    const getElapsed = () => {
      if (status === "in_progress") {
        return calculateSessionDurationSeconds(selectedSession, new Date().toISOString());
      }

      return calculateSessionDurationSeconds(selectedSession);
    };

    setElapsedSeconds(getElapsed());

    if (status !== "in_progress") {
      return;
    }

    const syncElapsed = () => {
      setElapsedSeconds(getElapsed());
    };

    const interval = window.setInterval(() => {
      syncElapsed();
    }, 1000);

    const handleVisibilityOrFocus = () => {
      syncElapsed();
    };

    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
    };
  }, [selectedSession, status]);

  useEffect(() => {
    setDurationDraft(formatWorkoutDuration(elapsedSeconds));
  }, [elapsedSeconds, scheduledWorkoutId, correctionMode]);

  useEffect(() => {
    setScheduledDateDraft(scheduledDate ? formatWorkoutDateInput(scheduledDate) : "");
  }, [scheduledDate, scheduledWorkoutId]);

  useEffect(() => {
    if (!selectedSession) {
      return;
    }

    setLoadDrafts((previous) => {
      let changed = false;
      const next = { ...previous };

      Object.entries(previous).forEach(([logId, rawValue]) => {
        const parsedValue = parseLoadDraftValue(rawValue);
        if (parsedValue === null) {
          return;
        }

        const log = selectedSession.setLogs.find((item) => item.id === logId);
        if (!log) {
          delete next[logId];
          changed = true;
          return;
        }

        if (log.actualLoad !== undefined && Math.abs(log.actualLoad - parsedValue) < 0.0001) {
          delete next[logId];
          changed = true;
        }
      });

      return changed ? next : previous;
    });
  }, [selectedSession]);

  useEffect(() => {
    if (!restRunning || !restEndsAt) {
      return;
    }

    const syncRestCountdown = () => {
      const remainingSeconds = Math.max(0, Math.ceil((restEndsAt - Date.now()) / 1000));

      if (remainingSeconds <= 0) {
        setRestSecondsLeft(0);
        setRestRunning(false);
        setRestTotalSeconds(0);
        setRestEndsAt(null);
        setRestExerciseKey(null);
        setRestExerciseName(null);
        return;
      }

      setRestSecondsLeft(remainingSeconds);
    };

    syncRestCountdown();

    const interval = window.setInterval(() => {
      syncRestCountdown();
    }, 1000);

    const handleVisibilityOrFocus = () => {
      syncRestCountdown();
    };

    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
    };
  }, [restEndsAt, restRunning]);

  useEffect(() => {
    if (status !== "in_progress") {
      setRestRunning(false);
      setRestEndsAt(null);
    }
  }, [status]);

  useEffect(() => {
    if (!isSecondaryActionsOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-session-actions-menu-root='true']")) {
        return;
      }

      setIsSecondaryActionsOpen(false);
      setSecondaryActionsAnchorRect(null);
      setSecondaryActionsMenuStyle(null);
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("touchstart", handlePointerDown);
    window.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("touchstart", handlePointerDown);
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isSecondaryActionsOpen]);

  useLayoutEffect(() => {
    if (!isSecondaryActionsOpen || !secondaryActionsAnchorRect || !secondaryActionsMenuRef.current) {
      return;
    }

    setSecondaryActionsMenuStyle(
      getFloatingMenuStyle(secondaryActionsAnchorRect, secondaryActionsMenuRef.current),
    );
  }, [isSecondaryActionsOpen, secondaryActionsAnchorRect]);

  useEffect(() => {
    if (!isSecondaryActionsOpen) {
      return;
    }

    const syncSecondaryActionsPosition = () => {
      const trigger = document.querySelector<HTMLElement>("[data-session-actions-trigger='true']");
      if (!trigger) {
        setIsSecondaryActionsOpen(false);
        setSecondaryActionsAnchorRect(null);
        setSecondaryActionsMenuStyle(null);
        return;
      }

      setSecondaryActionsAnchorRect(toAnchorRect(trigger.getBoundingClientRect()));
    };

    window.addEventListener("resize", syncSecondaryActionsPosition);
    window.addEventListener("scroll", syncSecondaryActionsPosition, true);
    return () => {
      window.removeEventListener("resize", syncSecondaryActionsPosition);
      window.removeEventListener("scroll", syncSecondaryActionsPosition, true);
    };
  }, [isSecondaryActionsOpen]);

  const exerciseGroups = useMemo(() => {
    if (!selectedSession) {
      return [] as ExerciseGroup[];
    }

    const grouped = new Map<string, ExerciseGroup>();
    selectedSession.setLogs.forEach((log) => {
      const key = log.templateExerciseId;
      const current = grouped.get(key);
      const sortedLogs = (logs: WorkoutSession["setLogs"]) =>
        [...logs].sort((left, right) => {
          const byLabel = compareSetLabels(left.setLabel, right.setLabel);
          if (byLabel !== 0) {
            return byLabel;
          }

          return left.id.localeCompare(right.id);
        });
      if (current) {
        grouped.set(key, {
          ...current,
          logs: sortedLogs([...current.logs, log]),
        });
        return;
      }

      grouped.set(key, {
        key,
        exerciseName: log.exerciseName,
        supersetGroup: log.supersetGroup,
        logs: [log],
      });
    });
    const groups = Array.from(grouped.values());
    const canUseExerciseOrder = exerciseOrder.size > 0 && groups.every((group) => exerciseOrder.has(group.key));
    if (!canUseExerciseOrder) {
      return groups;
    }

    return groups.sort((left, right) => {
      const leftOrder = exerciseOrder.get(left.key) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = exerciseOrder.get(right.key) ?? Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }

      return left.exerciseName.localeCompare(right.exerciseName, undefined, { sensitivity: "base" });
    });
  }, [exerciseOrder, selectedSession]);

  const supersetMembersByGroup = useMemo(() => {
    const map = new Map<string, string[]>();
    exerciseGroups.forEach((group) => {
      if (!group.supersetGroup) {
        return;
      }

      map.set(group.supersetGroup, [...(map.get(group.supersetGroup) ?? []), group.key]);
    });
    return map;
  }, [exerciseGroups]);

  const defaultExpandedKeys = useMemo(() => {
    const defaults = new Set<string>();
    const firstGroup = exerciseGroups[0];
    if (!firstGroup) {
      return defaults;
    }

    if (firstGroup.supersetGroup) {
      (supersetMembersByGroup.get(firstGroup.supersetGroup) ?? [firstGroup.key]).forEach((key) => defaults.add(key));
      return defaults;
    }

    defaults.add(firstGroup.key);
    return defaults;
  }, [exerciseGroups, supersetMembersByGroup]);

  const exerciseRenderBlocks = useMemo(() => {
    const blocks: Array<
      | { type: "single"; key: string; groups: ExerciseGroup[] }
      | { type: "superset"; key: string; supersetGroup: string; groups: ExerciseGroup[] }
    > = [];
    const handledSupersets = new Set<string>();

    exerciseGroups.forEach((group) => {
      if (!group.supersetGroup) {
        blocks.push({ type: "single", key: group.key, groups: [group] });
        return;
      }

      if (handledSupersets.has(group.supersetGroup)) {
        return;
      }

      handledSupersets.add(group.supersetGroup);
      blocks.push({
        type: "superset",
        key: `superset-${group.supersetGroup}`,
        supersetGroup: group.supersetGroup,
        groups: exerciseGroups.filter((candidate) => candidate.supersetGroup === group.supersetGroup),
      });
    });

    return blocks;
  }, [exerciseGroups]);

  const getIsExpanded = (group: ExerciseGroup) =>
    expandedExerciseKeys[group.key] ?? defaultExpandedKeys.has(group.key);

  const setGroupExpansion = (
    group: ExerciseGroup,
    nextExpanded?: boolean,
  ) => {
    setExpandedExerciseKeys((previous) => {
      const groupKeys = group.supersetGroup
        ? (supersetMembersByGroup.get(group.supersetGroup) ?? [group.key])
        : [group.key];
      const allTargetKeysOpen = groupKeys.every((key) => previous[key] ?? defaultExpandedKeys.has(key));
      const target = nextExpanded ?? !allTargetKeysOpen;
      const next: Record<string, boolean> = {};

      exerciseGroups.forEach((exerciseGroup) => {
        next[exerciseGroup.key] = false;
      });
      groupKeys.forEach((key) => {
        next[key] = target;
      });
      return next;
    });
  };

  const startRestTimer = (
    seconds: number | undefined,
    exerciseKey: string,
    exerciseName: string,
    supersetGroup?: string,
  ) => {
    const duration = seconds ?? 0;
    if (duration < 1) {
      return;
    }

    setRestTotalSeconds(duration);
    setRestSecondsLeft(duration);
    setRestRunning(true);
    setRestEndsAt(Date.now() + duration * 1000);
    setRestExerciseKey(exerciseKey);
    setRestExerciseName(exerciseName);
    setExpandedExerciseKeys(() => {
      const keys = supersetGroup
        ? (supersetMembersByGroup.get(supersetGroup) ?? [exerciseKey])
        : [exerciseKey];
      const next: Record<string, boolean> = {};
      exerciseGroups.forEach((exerciseGroup) => {
        next[exerciseGroup.key] = false;
      });
      keys.forEach((key) => {
        next[key] = true;
      });
      return next;
    });
  };

  const skipRestTimer = () => {
    setRestRunning(false);
    setRestSecondsLeft(0);
    setRestTotalSeconds(0);
    setRestEndsAt(null);
    setRestExerciseKey(null);
    setRestExerciseName(null);
  };

  const restartRestTimer = () => {
    if (restTotalSeconds < 1) {
      return;
    }

    setRestSecondsLeft(restTotalSeconds);
    setRestRunning(true);
    setRestEndsAt(Date.now() + restTotalSeconds * 1000);
  };

  const handleLogUpdate = (
    log: WorkoutSession["setLogs"][number],
    patch: { actualReps?: number | null; actualLoad?: number | null; done?: boolean },
  ) => {
    onUpdate(log.id, patch);
  };

  const handleLogUpdateById = (
    logId: string,
    patch: { actualReps?: number | null; actualLoad?: number | null; done?: boolean },
  ) => {
    onUpdate(logId, patch);
  };

  const handleDoneUpdate = (log: WorkoutSession["setLogs"][number], nextDone: boolean) => {
    if (nextDone && activeWorkoutCount && activeWorkoutCount > 1) {
      console.warn("[workout-ui] multiple-active-workouts-detected", {
        scheduledWorkoutId,
        activeWorkoutCount,
      });
    }

    onUpdate(log.id, { done: nextDone });

    if (!nextDone) {
      skipRestTimer();
      return;
    }

    startRestTimer(log.targetRestSeconds ?? 180, log.templateExerciseId, log.exerciseName, log.supersetGroup);
  };

  const handleLoadDraftChange = (log: WorkoutSession["setLogs"][number], rawValue: string) => {
    setLoadDrafts((previous) => ({
      ...previous,
      [log.id]: rawValue,
    }));

    if (rawValue.trim() === "") {
      onUpdate(log.id, { actualLoad: null });
      return;
    }

    const parsedValue = parseLoadDraftValue(rawValue);
    if (parsedValue === null) {
      return;
    }

    onUpdate(log.id, { actualLoad: parsedValue });
  };

  const handleLoadDraftBlur = (log: WorkoutSession["setLogs"][number]) => {
    setLoadDrafts((previous) => {
      const rawValue = previous[log.id];
      if (rawValue === undefined) {
        return previous;
      }

      const parsedValue = parseLoadDraftValue(rawValue);
      if (parsedValue !== null && (log.actualLoad === undefined || Math.abs(log.actualLoad - parsedValue) >= 0.0001)) {
        return previous;
      }

      const next = { ...previous };
      delete next[log.id];
      return next;
    });
  };

  const readOnly = forceReadOnly || (status === "completed" && !correctionMode) || Boolean(isSessionSyncing);
  // Aktiivinen kirjausnäkymä = prototyypin SessionOverlay-tyyli. Muut tilat
  // (valmis/korjaus/aloitus/synkkaus) säilyttävät vanhan rakenteen.
  const activeLoggingView = status === "in_progress" && !readOnly;
  // Pidä näyttö päällä aktiivisen kirjauksen ajan (laitekohtainen preferenssi).
  const [keepScreenOn] = useKeepScreenOnPreference();
  useWakeLock(keepScreenOn && !readOnly && status === "in_progress");
  const showCancelAction = status === "in_progress";
  const showResumeAction = status === "cancelled";
  const showDeleteAction = canDeleteWorkout;
  const showBottomBackToList = status !== "in_progress";
  const hasSecondaryActions = showResumeAction || showCancelAction || showDeleteAction;
  const initialScheduledDateDraft = scheduledDate ? formatWorkoutDateInput(scheduledDate) : "";
  const isDateDirty = scheduledDateDraft.trim() !== initialScheduledDateDraft;
  const isDurationDirty = durationDraft.trim() !== formatWorkoutDuration(elapsedSeconds);
  const roundToIncrement = (value: number, increment: number) => {
    const next = Math.round(value / increment) * increment;
    return Number(next.toFixed(increment % 1 === 0 ? 0 : 2));
  };

  const adjustActualReps = (log: WorkoutSession["setLogs"][number], delta: number) => {
    const nextValue = Math.max(0, (log.actualReps ?? 0) + delta);
    handleLogUpdate(log, { actualReps: nextValue });
  };

  const adjustActualLoad = (log: WorkoutSession["setLogs"][number], delta: number) => {
    const baseValue = log.actualLoad ?? 0;
    const nextValue = Math.max(0, roundToIncrement(baseValue + delta, loadIncrementKg));

    setLoadDrafts((previous) => ({
      ...previous,
      [log.id]: formatLoadDraftValue(nextValue),
    }));

    handleLogUpdate(log, { actualLoad: nextValue });
  };

  const beginFieldDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    log: WorkoutSession["setLogs"][number],
    field: DragField,
  ) => {
    if (readOnly) {
      return;
    }

    const currentValue = field === "reps" ? log.actualReps ?? 0 : log.actualLoad ?? 0;
    const increment = field === "reps" ? 1 : loadIncrementKg;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setHasSeenDragHint(true);

    setDragSession({
      logId: log.id,
      field,
      pointerId: event.pointerId,
      startY: event.clientY,
      lastStepOffset: 0,
      currentValue,
      increment,
    });
  };

  const updateDragSession = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!dragSession || event.pointerId !== dragSession.pointerId) {
      return;
    }

    event.preventDefault();

    const deltaY = dragSession.startY - event.clientY;
    const nextStepOffset = Math.trunc(deltaY / dragPixelsPerStep);
    if (nextStepOffset === dragSession.lastStepOffset) {
      return;
    }

    const stepDelta = nextStepOffset - dragSession.lastStepOffset;
    const nextValue = Math.max(0, roundToIncrement(dragSession.currentValue + stepDelta * dragSession.increment, dragSession.increment));

    if (dragSession.field === "reps") {
      handleLogUpdateById(dragSession.logId, { actualReps: nextValue });
    } else {
      setLoadDrafts((previous) => ({
        ...previous,
        [dragSession.logId]: formatLoadDraftValue(nextValue),
      }));

      handleLogUpdateById(dragSession.logId, { actualLoad: nextValue });
    }

    setDragSession((previous) =>
      previous && previous.pointerId === event.pointerId
        ? { ...previous, currentValue: nextValue, lastStepOffset: nextStepOffset }
        : previous,
    );
  };

  const endFieldDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!dragSession || event.pointerId !== dragSession.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    setDragSession(null);
  };

  const handleFieldDragKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    log: WorkoutSession["setLogs"][number],
    field: DragField,
  ) => {
    if (readOnly) {
      return;
    }

    if (event.key === "ArrowUp" || event.key === "ArrowRight") {
      event.preventDefault();
      if (field === "reps") {
        adjustActualReps(log, 1);
      } else {
        adjustActualLoad(log, loadIncrementKg);
      }
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
      event.preventDefault();
      if (field === "reps") {
        adjustActualReps(log, -1);
      } else {
        adjustActualLoad(log, -loadIncrementKg);
      }
    }
  };

  const focusWorkoutField = (logId: string, field: "reps" | "load") => {
    if (typeof window === "undefined") {
      return;
    }

    window.requestAnimationFrame(() => {
      const element = document.getElementById(getWorkoutFieldId(scheduledWorkoutId, logId, field));
      if (!(element instanceof HTMLInputElement)) {
        return;
      }

      element.focus();
      element.select();
    });
  };

  const handleWorkoutFieldEnter = (
    event: KeyboardEvent<HTMLInputElement>,
    logs: WorkoutSession["setLogs"],
    currentLog: WorkoutSession["setLogs"][number],
    field: "reps" | "load",
  ) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();

    if (field === "reps") {
      focusWorkoutField(currentLog.id, "load");
      return;
    }

    const currentIndex = logs.findIndex((entry) => entry.id === currentLog.id);
    const nextLog = currentIndex >= 0 ? logs[currentIndex + 1] : undefined;
    if (nextLog) {
      focusWorkoutField(nextLog.id, "reps");
    }
  };
  const toggleSecondaryActionsMenu = (anchor: HTMLButtonElement) => {
    if (isSecondaryActionsOpen) {
      setIsSecondaryActionsOpen(false);
      setSecondaryActionsAnchorRect(null);
      setSecondaryActionsMenuStyle(null);
      return;
    }

    setSecondaryActionsAnchorRect(toAnchorRect(anchor.getBoundingClientRect()));
    setIsSecondaryActionsOpen(true);
  };

  const renderActiveExerciseCard = (group: ExerciseGroup) => {
    const exerciseKey = group.key;
    const safeExerciseKey = exerciseKey.replace(/[^a-zA-Z0-9_-]/g, "-");
    const disclosureButtonId = `${scheduledWorkoutId}-${safeExerciseKey}-active-toggle`;
    const disclosurePanelId = `${scheduledWorkoutId}-${safeExerciseKey}-active-panel`;
    const logs = group.logs;
    const exerciseName = group.exerciseName;
    const supersetGroup = group.supersetGroup;
    const completedInExercise = logs.filter((log) => log.done).length;
    const allDone = logs.length > 0 && logs.every((log) => log.done);
    const isStarted = completedInExercise > 0 && !allDone;
    const isExpanded = getIsExpanded(group);
    const targetSummary = logs.length > 0 ? `${logs.length} × ${formatTargetReps(logs[0]!)}` : "";
    const liveOneRepMax = logs.reduce((best, log) => {
      const load = log.actualLoad ?? 0;
      const reps = log.actualReps ?? 0;
      if (load <= 0 || reps <= 0) {
        return best;
      }
      return Math.max(best, calculateEstimatedOneRepMax(load, reps));
    }, 0);
    const usesRepRange = logs.some(
      (log) =>
        log.targetRepsMin !== undefined &&
        log.targetRepsMax !== undefined &&
        log.targetRepsMax > log.targetRepsMin,
    );
    const shouldIncreaseLoad =
      usesRepRange &&
      allDone &&
      logs.every((log) => {
        const repMax = log.targetRepsMax ?? log.targetReps;
        return repMax !== undefined && log.actualReps !== undefined && log.actualReps !== null && log.actualReps >= repMax;
      });
    const previous = previousExerciseResults.get(logs[0]?.exerciseId ?? "");
    const previousOneRepMax =
      previous?.actualLoad !== undefined && previous?.actualReps !== undefined && previous.actualLoad > 0 && previous.actualReps > 0
        ? calculateEstimatedOneRepMax(previous.actualLoad, previous.actualReps)
        : 0;
    const isRecord = previousOneRepMax > 0 && liveOneRepMax > previousOneRepMax && logs.some((log) => log.done);
    const instruction = exerciseInstructions.get(group.key)?.trim();
    const activeCardToneClass = allDone
      ? "border-[color-mix(in_srgb,var(--success)_34%,var(--border-strong))] bg-[color-mix(in_srgb,var(--success)_7%,var(--surface))] shadow-[0_12px_28px_-22px_color-mix(in_srgb,var(--success)_40%,transparent)]"
      : isStarted
        ? "border-[color-mix(in_srgb,var(--warning)_30%,var(--border))] bg-[var(--surface)] shadow-[0_12px_28px_-24px_var(--warning)]"
        : "border-[var(--border)] bg-[var(--surface)] shadow-[0_12px_30px_-28px_var(--shadow)]";

    return (
      <div
        key={exerciseKey}
        className={`min-w-0 max-w-full overflow-hidden rounded-[18px] border p-4 ${activeCardToneClass}`}
      >
        <div className="flex items-start justify-between gap-3">
          <ExerciseThumbnail
            exercise={exerciseById.get(logs[0]?.exerciseId ?? "")}
            onOpen={instruction ? () => setOpenInstruction({ exerciseName, instruction, exerciseId: logs[0]?.exerciseId }) : undefined}
          />
          <button
            type="button"
            id={disclosureButtonId}
            aria-expanded={isExpanded}
            aria-controls={disclosurePanelId}
            className="min-w-0 flex-1 rounded-[1rem] text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]"
            onClick={() => setGroupExpansion(group)}
          >
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="font-[family-name:var(--font-display)] text-[1.05rem] font-bold leading-tight text-[var(--text)] [overflow-wrap:anywhere]">
                {exerciseName}
              </span>
              {supersetGroup ? (
                <span className="inline-flex items-center rounded-full border border-[color-mix(in_srgb,var(--accent)_28%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))] px-2 py-0.5 text-[11px] font-semibold text-[var(--accent)]">
                  Superset {supersetGroup}
                </span>
              ) : null}
              {shouldIncreaseLoad ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--accent)_14%,var(--surface))] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--accent)]">
                  Nosta painoa <span aria-hidden="true">↑</span>
                </span>
              ) : isRecord ? (
                <span className="inline-flex items-center rounded-full bg-[color-mix(in_srgb,var(--accent)_14%,var(--surface))] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--accent)]">
                  Uusi e1RM
                </span>
              ) : null}
            </div>
          </button>
          <div className="flex shrink-0 items-center gap-1.5">
            {instruction ? (
              <button
                type="button"
                aria-label={`${exerciseName} ohje`}
                title="Ohje"
                className="grid size-8 place-items-center rounded-full border border-[color-mix(in_srgb,var(--accent)_22%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_7%,var(--surface))] text-[var(--accent)] transition hover:bg-[color-mix(in_srgb,var(--accent)_12%,var(--surface))]"
                onClick={() => setOpenInstruction({ exerciseName, instruction, exerciseId: logs[0]?.exerciseId })}
              >
                <BookOpen className="size-3.5" aria-hidden="true" />
              </button>
            ) : null}
            <button
              type="button"
              aria-label={`${exerciseName} asetukset`}
              title="Liikkeen asetukset"
              className="grid size-8 place-items-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text-subtle)] transition hover:border-[var(--border-strong)] hover:text-[var(--text)]"
              onClick={() =>
                setOpenExerciseStructure({
                  mode: "edit",
                  templateExerciseId: logs[0]?.templateExerciseId ?? "",
                  exerciseName,
                  initialExerciseId: logs[0]?.exerciseId,
                  initialSetCount: logs.length,
                  initialTargetReps: logs[0]?.targetReps,
                  initialTargetRepsMin: logs[0]?.targetRepsMin,
                  initialTargetRepsMax: logs[0]?.targetRepsMax,
                  initialRestSeconds: logs[0]?.targetRestSeconds,
                })
              }
            >
              <Settings2 className="size-3.5" aria-hidden="true" />
            </button>
            {!supersetGroup ? (
              <button
                type="button"
                aria-label={isExpanded ? `Sulje ${exerciseName}` : `Avaa ${exerciseName}`}
                aria-expanded={isExpanded}
                aria-controls={disclosurePanelId}
                className="grid size-8 place-items-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-subtle)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-3)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                onClick={() => setGroupExpansion(group)}
              >
                {isExpanded ? (
                  <ChevronUp className="size-4" aria-hidden="true" />
                ) : (
                  <ChevronDown className="size-4" aria-hidden="true" />
                )}
              </button>
            ) : null}
          </div>
        </div>
        <p className="mt-1.5 min-w-0 text-xs tabular-nums text-[var(--text-subtle)] [overflow-wrap:anywhere]">
          {completedInExercise}/{logs.length} sarjaa · tavoite {targetSummary}
          {liveOneRepMax > 0 ? ` · e1RM nyt ${Math.round(liveOneRepMax)} kg` : ""}
        </p>
        {isExpanded ? (
          <div
            id={disclosurePanelId}
            role="region"
            aria-labelledby={disclosureButtonId}
            className="mt-3 space-y-2"
          >
            {/* Kevyt otsikkorivi: kertoo kumpi luku on kuorma ja kumpi toistot (kentät ovat
                kuorma × toistot). Sama sarakejako kuin sarjariveillä. aria-hidden, koska
                jokaisella DragNumberilla on jo oma kuvaava aria-label. */}
            <div
              aria-hidden="true"
              className="grid grid-cols-[1.25rem_1fr_0.75rem_1fr_2.75rem] items-center gap-2 px-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-[var(--text-subtle)]"
            >
              <span />
              <span className="text-center">Kuorma</span>
              <span />
              <span className="text-center">Toistot</span>
              <span />
            </div>
            {logs.map((log, index) => {
              const targetMinimum = log.targetRepsMin ?? log.targetReps;
              const missed =
                log.actualReps !== undefined && log.actualReps !== null && targetMinimum !== undefined && log.actualReps < targetMinimum;
              // Kuitatun sarjan sävy: vihreä kun tavoite täyttyi, amber kun toistot
              // jäi alle tavoitteen (sama logiikka kentissä ja kuittausnapissa).
              const rowTone = log.done ? (missed ? "warn" : "success") : undefined;
              return (
                <div key={log.id} className="grid grid-cols-[1.25rem_1fr_0.75rem_1fr_2.75rem] items-center gap-2">
                  <span className="text-center font-[family-name:var(--font-display)] text-sm font-semibold text-[var(--text-subtle)]">
                    {index + 1}
                  </span>
                  <DragNumber
                    value={log.actualLoad ?? 0}
                    step={loadIncrementKg}
                    tone={rowTone}
                    ariaLabel={`${exerciseName} sarja ${log.setLabel} paino`}
                    disabled={readOnly}
                    onChange={(next) => handleLogUpdate(log, { actualLoad: next })}
                  />
                  <span className="text-center text-sm text-[var(--text-subtle)]">×</span>
                  <DragNumber
                    value={log.actualReps ?? 0}
                    step={1}
                    tone={rowTone}
                    ariaLabel={`${exerciseName} sarja ${log.setLabel} toistot`}
                    disabled={readOnly}
                    onChange={(next) => handleLogUpdate(log, { actualReps: next })}
                  />
                  <button
                    type="button"
                    disabled={readOnly}
                    aria-pressed={log.done}
                    aria-label={log.done ? `Kumoa sarja ${log.setLabel}` : `Kuittaa sarja ${log.setLabel}${missed ? ", toistot alle tavoitteen" : ""}`}
                    className={`grid size-11 place-items-center rounded-full border transition ${
                      log.done
                        ? missed
                          ? "border-[var(--warning)] bg-[var(--warning)] text-white"
                          : "border-[var(--success)] bg-[var(--success)] text-white"
                        : "border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text-subtle)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                    }`}
                    onClick={() => handleDoneUpdate(log, !log.done)}
                  >
                    <Check className="size-5 stroke-[2.5]" aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  };

  const renderExerciseGroupCard = (group: ExerciseGroup) => {
    const exerciseKey = group.key;
    const safeExerciseKey = exerciseKey.replace(/[^a-zA-Z0-9_-]/g, "-");
    const disclosureButtonId = `${scheduledWorkoutId}-${safeExerciseKey}-toggle`;
    const disclosurePanelId = `${scheduledWorkoutId}-${safeExerciseKey}-panel`;
    const exerciseName = group.exerciseName;
    const logs = group.logs;
    const supersetGroup = group.supersetGroup;
    const completedInExercise = logs.filter((log) => log.done).length;
    const isComplete = completedInExercise === logs.length && logs.length > 0;
    const isStarted = completedInExercise > 0 && !isComplete;
    const targetSummary = formatExerciseTargetSummary(logs);
    // Progressiivinen ylikuormitus: jos liike käyttää toistohaarukoita ja kaikki sarjat
    // on kuitattu haarukan ylärajaan asti, ehdota painon nostoa (vain haarukoilla).
    const usesRepRange = logs.some(
      (log) =>
        log.targetRepsMin !== undefined &&
        log.targetRepsMax !== undefined &&
        log.targetRepsMax > log.targetRepsMin,
    );
    const shouldIncreaseLoad =
      usesRepRange &&
      isComplete &&
      logs.every((log) => {
        const repMax = log.targetRepsMax ?? log.targetReps;
        return (
          repMax !== undefined &&
          log.actualReps !== undefined &&
          log.actualReps !== null &&
          log.actualReps >= repMax
        );
      });
    const previous = previousExerciseResults.get(logs[0]?.exerciseId ?? "");
    const instruction = exerciseInstructions.get(exerciseKey)?.trim();
    const isExpanded = getIsExpanded(group);
    const cardToneClass = isComplete
      ? "border-[color-mix(in_srgb,var(--success)_34%,var(--border-strong))] bg-[color-mix(in_srgb,var(--success)_7%,var(--surface))] shadow-[0_10px_24px_-18px_color-mix(in_srgb,var(--success)_40%,transparent)]"
      : isStarted
        ? "border-[color-mix(in_srgb,var(--warning)_30%,var(--border))] bg-[var(--surface)] shadow-[0_10px_24px_-22px_var(--warning)]"
        : supersetGroup
          ? "border-[color-mix(in_srgb,var(--accent)_22%,var(--border))] bg-[var(--surface)]"
          : "border-[var(--border)] bg-[var(--surface)]";
    const progressBadgeClass = isComplete
      ? "border-[var(--success)] bg-[var(--surface)] text-[var(--success)]"
      : isStarted
        ? "border-[var(--warning)] bg-[var(--surface)] text-[var(--warning)]"
        : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-subtle)]";
    const indicatorClass = isComplete
      ? "bg-[var(--success)]"
      : isStarted
        ? "bg-[var(--warning)]"
        : "bg-[var(--border)]";
    const chevronClass = isComplete
      ? "border-[color-mix(in_srgb,var(--success)_35%,var(--border))] bg-[color-mix(in_srgb,var(--success)_12%,var(--surface))] text-[var(--success)] group-hover:border-[color-mix(in_srgb,var(--success)_45%,var(--border))] group-hover:bg-[color-mix(in_srgb,var(--success)_16%,var(--surface))]"
      : isStarted
        ? "border-[color-mix(in_srgb,var(--warning)_30%,var(--border))] bg-[color-mix(in_srgb,var(--warning)_10%,var(--surface))] text-[var(--warning)] group-hover:border-[color-mix(in_srgb,var(--warning)_40%,var(--border))] group-hover:bg-[color-mix(in_srgb,var(--warning)_14%,var(--surface))]"
        : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-subtle)] group-hover:border-[var(--border-strong)] group-hover:bg-[var(--surface-3)] group-hover:text-[var(--text)]";
    return (
      <div
        key={exerciseKey}
        className={`min-w-0 max-w-full overflow-hidden rounded-[18px] border p-3 md:p-3.5 ${cardToneClass}`}
      >
        <div className="flex min-w-0 items-start gap-2 px-1">
          <ExerciseThumbnail
            exercise={exerciseById.get(logs[0]?.exerciseId ?? "")}
            onOpen={instruction ? () => setOpenInstruction({ exerciseName, instruction, exerciseId: logs[0]?.exerciseId }) : undefined}
          />
          <button
            type="button"
            className="group min-w-0 flex-1 rounded-[1rem] py-0 text-left text-inherit transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
            id={disclosureButtonId}
            aria-expanded={isExpanded}
            aria-controls={disclosurePanelId}
            onClick={() => setGroupExpansion(group)}
          >
            <span className="block min-w-0">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className={`size-2.5 rounded-full ${indicatorClass}`} aria-hidden="true" />
                <span className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">
                  Liike
                </span>
              </span>
              <span className="mt-0.5 block min-w-0 [overflow-wrap:anywhere] font-[family-name:var(--font-display)] text-[0.97rem] font-semibold leading-tight text-[var(--text)] md:text-[1.02rem]">
                {exerciseName}
              </span>
            </span>
          </button>
          <div className="flex shrink-0 items-center gap-2 self-start">
            {instruction ? (
              <button
                type="button"
                aria-label={`${exerciseName} ohje`}
                title="Ohje"
                className="inline-flex size-8.5 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--accent)_22%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_7%,var(--surface))] text-[var(--accent)] shadow-[0_4px_12px_-14px_var(--accent)] transition hover:border-[color-mix(in_srgb,var(--accent)_36%,var(--border))] hover:bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))] hover:opacity-95"
                onClick={() => setOpenInstruction({ exerciseName, instruction, exerciseId: logs[0]?.exerciseId })}
              >
                <BookOpen className="size-3.5" aria-hidden="true" />
              </button>
            ) : null}
            <button
              type="button"
              aria-label={`${exerciseName} asetukset`}
              title="Liikkeen asetukset"
              className="inline-flex size-8.5 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--accent)_22%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_7%,var(--surface))] text-[var(--accent)] shadow-[0_4px_12px_-14px_var(--accent)] transition hover:border-[color-mix(in_srgb,var(--accent)_36%,var(--border))] hover:bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))] hover:opacity-95"
              onClick={() =>
                setOpenExerciseStructure({
                  mode: "edit",
                  templateExerciseId: logs[0]?.templateExerciseId ?? "",
                  exerciseName,
                  initialExerciseId: logs[0]?.exerciseId,
                  initialSetCount: logs.length,
                  initialTargetReps: logs[0]?.targetReps,
                  initialTargetRepsMin: logs[0]?.targetRepsMin,
                  initialTargetRepsMax: logs[0]?.targetRepsMax,
                  initialRestSeconds: logs[0]?.targetRestSeconds,
                })
              }
            >
              <Settings2 className="size-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              className={`grid size-8.5 place-items-center rounded-full border transition ${chevronClass}`}
              aria-label={isExpanded ? `Sulje ${exerciseName}` : `Avaa ${exerciseName}`}
              aria-expanded={isExpanded}
              aria-controls={disclosurePanelId}
              onClick={() => setGroupExpansion(group)}
            >
              {isExpanded ? (
                <ChevronUp className="size-4" aria-hidden="true" />
              ) : (
                <ChevronDown className="size-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
        <div className="mt-2 flex items-start gap-2 px-1">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <Badge className={`min-w-0 ${progressBadgeClass}`}>{completedInExercise}/{logs.length} tehty</Badge>
            {targetSummary ? (
              <span className="inline-flex max-w-full min-w-0 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--text-subtle)]">
                <span className="truncate">{targetSummary}</span>
              </span>
            ) : null}
            {shouldIncreaseLoad ? (
              <span className="inline-flex min-w-0 items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--accent)_14%,var(--surface))] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--accent)]">
                Nosta painoa <span aria-hidden="true">↑</span>
              </span>
            ) : null}
          </div>
        </div>
        {status === "completed" && previous ? (
          <p className="mt-2 px-1 text-xs text-[var(--text-subtle)]">
            Tehty {previous.timesCompleted} kertaa · viimeksi {formatDate(previous.completedAt)} · {formatPreviousExerciseResult(previous)}
          </p>
        ) : null}
        {isExpanded ? (
          <div
            id={disclosurePanelId}
            role="region"
            aria-labelledby={disclosureButtonId}
            className="mt-3 border-t border-[var(--border)] pt-3"
          >
            <div className="min-w-0 max-w-full overflow-hidden rounded-[1rem] bg-[color-mix(in_srgb,var(--surface-2)_68%,var(--surface))]">
              <table className="w-full table-fixed border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--surface-3)_82%,var(--surface))] text-[10px] font-semibold uppercase tracking-[0.05em] text-[var(--text-subtle)]">
                    <th scope="col" className="w-11 px-2 py-2.5 text-left md:w-12 md:px-3">Sarja</th>
                    <th scope="col" className="px-2 py-2.5 text-left md:px-3">
                      <span className="inline-flex items-center gap-1">
                        Toistot
                        <InfoTooltip text={repsTooltipText} />
                      </span>
                    </th>
                    <th scope="col" className="px-2 py-2.5 text-left md:px-3">
                      <span className="inline-flex items-center gap-1">
                        Kuorma
                        <InfoTooltip text={loadTooltipText} />
                      </span>
                    </th>
                    <th scope="col" className="w-11 px-2 py-2.5 text-center md:w-12 md:px-3 md:text-right">
                      <span className="inline-flex items-center justify-center gap-1 md:justify-end">Tila</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                {logs.map((log) => {
                   const isBelowTarget = log.done && isBelowTargetRepMinimum(log);
                   const rowToneClass = log.done
                     ? "bg-[color-mix(in_srgb,var(--success)_10%,var(--surface))]"
                     : "bg-transparent";
                   const inputToneClass = log.done
                     ? "border-[color-mix(in_srgb,var(--success)_40%,var(--border))] bg-[color-mix(in_srgb,var(--success)_12%,var(--surface))] text-[var(--text)]"
                    : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)]";
                  const repsInputToneClass = isBelowTarget
                    ? "border-[color-mix(in_srgb,var(--warning)_55%,var(--border))] bg-[color-mix(in_srgb,var(--warning)_14%,var(--surface))] text-[var(--text)]"
                    : inputToneClass;
                  const setLabelToneClass = log.done
                    ? "text-[var(--success)] md:border-[color-mix(in_srgb,var(--success)_35%,var(--border))] md:bg-[color-mix(in_srgb,var(--success)_12%,var(--surface))]"
                    : "text-[var(--text-subtle)] md:border-[var(--border)] md:bg-[var(--surface-2)]";

                   return (
                    <tr
                       key={log.id}
                       className={`border-b border-[var(--border)] last:border-b-0 ${rowToneClass}`}
                    >
                      <td className="px-1 py-2.5 text-center align-middle md:px-3">
                        <span
                          className={`inline-flex h-8 w-8 items-center justify-center text-xs font-semibold tabular-nums md:rounded-full md:border ${setLabelToneClass}`}
                        >
                          {log.setLabel}
                        </span>
                      </td>
                      <td className="px-1 py-2.5 align-middle md:px-3">
                        <div className="relative">
                          <Input
                            className={`h-9 min-w-0 rounded-xl px-2 py-1 pr-9 text-center text-sm font-medium shadow-[inset_0_1px_0_0_var(--shadow-soft)] md:h-10 md:px-3 md:pr-10 ${repsInputToneClass}`}
                            id={getWorkoutFieldId(scheduledWorkoutId, log.id, "reps")}
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            placeholder="0"
                            aria-label={`${exerciseName} sarja ${log.setLabel} toteutuneet toistot`}
                            value={log.actualReps ?? ""}
                            data-below-target={isBelowTarget ? "true" : undefined}
                            disabled={readOnly}
                            onChange={(event) => {
                              const trimmed = event.target.value.trim();
                              if (trimmed === "") {
                                handleLogUpdate(log, { actualReps: null });
                                return;
                              }

                              if (!/^\d+$/.test(trimmed)) {
                                return;
                              }

                              handleLogUpdate(log, { actualReps: Number(trimmed) });
                            }}
                            onKeyDown={(event) => handleWorkoutFieldEnter(event, logs, log, "reps")}
                          />
                          <div className="absolute inset-y-1 right-1 w-7 rounded-[0.6rem] bg-[color-mix(in_srgb,var(--border)_26%,transparent)] p-px">
                            <button
                              type="button"
                              className={`${inputDragHandleClass} ${dragSession?.logId === log.id && dragSession.field === "reps" ? inputDragHandleActiveClass : ""}`}
                              disabled={readOnly}
                              role="spinbutton"
                              aria-label={`${exerciseName} sarja ${log.setLabel} saata toistoja vetamalla ylos tai alas`}
                              aria-valuemin={0}
                              aria-valuenow={log.actualReps ?? 0}
                              aria-valuetext={`${log.actualReps ?? 0} toistoa`}
                              onPointerDown={(event) => beginFieldDrag(event, log, "reps")}
                              onPointerMove={updateDragSession}
                              onPointerUp={endFieldDrag}
                              onPointerCancel={endFieldDrag}
                              onKeyDown={(event) => handleFieldDragKeyDown(event, log, "reps")}
                              style={{ touchAction: "none" }}
                            >
                              <GripVertical className="size-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      </td>
                      <td className="px-1 py-2.5 align-middle md:px-3">
                        <div className="relative">
                          <Input
                            className={`h-9 min-w-0 rounded-xl px-2 py-1 pr-9 text-center text-sm font-medium shadow-[inset_0_1px_0_0_var(--shadow-soft)] md:h-10 md:px-3 md:pr-10 ${inputToneClass}`}
                            id={getWorkoutFieldId(scheduledWorkoutId, log.id, "load")}
                            type="text"
                            inputMode="decimal"
                            placeholder="0"
                            aria-label={`${exerciseName} sarja ${log.setLabel} toteutunut kuorma`}
                            value={loadDrafts[log.id] ?? (log.actualLoad !== undefined ? String(log.actualLoad).replace(".", ",") : "")}
                            disabled={readOnly}
                            onChange={(event) => handleLoadDraftChange(log, event.target.value)}
                            onBlur={() => handleLoadDraftBlur(log)}
                            onKeyDown={(event) => handleWorkoutFieldEnter(event, logs, log, "load")}
                          />
                          <div className="absolute inset-y-1 right-1 w-7 rounded-[0.6rem] bg-[color-mix(in_srgb,var(--border)_26%,transparent)] p-px">
                            <button
                              type="button"
                              className={`${inputDragHandleClass} ${dragSession?.logId === log.id && dragSession.field === "load" ? inputDragHandleActiveClass : ""}`}
                              disabled={readOnly}
                              role="spinbutton"
                              aria-label={`${exerciseName} sarja ${log.setLabel} saata kuormaa vetamalla ylos tai alas`}
                              aria-valuemin={0}
                              aria-valuenow={log.actualLoad ?? 0}
                              aria-valuetext={`${log.actualLoad ?? 0} kiloa`}
                              onPointerDown={(event) => beginFieldDrag(event, log, "load")}
                              onPointerMove={updateDragSession}
                              onPointerUp={endFieldDrag}
                              onPointerCancel={endFieldDrag}
                              onKeyDown={(event) => handleFieldDragKeyDown(event, log, "load")}
                              style={{ touchAction: "none" }}
                            >
                              <GripVertical className="size-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      </td>
                      <td className="px-1.5 py-2.5 text-center align-middle md:px-3 md:text-right">
                        <div className="flex justify-center md:justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          className={`size-8 shrink-0 rounded-full p-0 shadow-[0_6px_18px_-12px_var(--shadow)] md:size-8.5 ${
                            log.done
                              ? "border-[var(--success)] bg-[var(--success)] text-white hover:border-[var(--success)] hover:bg-[var(--success)] hover:text-white"
                              : "border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text-subtle)] hover:border-[var(--border-strong)] hover:bg-[var(--surface)] hover:text-[var(--text-subtle)]"
                          }`}
                          data-state={log.done ? "done" : "pending"}
                          disabled={readOnly}
                          aria-pressed={log.done}
                          aria-label={
                            log.done
                              ? "Kumoa kuittaus"
                              : "Merkitse tehdyksi"
                          }
                          title={
                            log.done
                              ? "Kumoa kuittaus"
                              : "Merkitse tehdyksi"
                          }
                          onClick={() => handleDoneUpdate(log, !log.done)}
                        >
                          <Check className="size-4 shrink-0 stroke-[2.5]" aria-hidden="true" />
                        </Button>
                        </div>
                      </td>
                    </tr>
                   );
                 })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  if (isSessionSyncing) {
    return (
      <div className="mt-6 space-y-4">
        <div className="rounded-[18px] border border-[var(--border-strong)] bg-[color:color-mix(in_srgb,var(--surface-2)_82%,var(--surface))] px-4 py-5 shadow-[0_12px_28px_-24px_var(--shadow)]">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent text-[var(--accent)]"
            />
            <div>
              <p className="text-sm font-semibold text-[var(--text)]">Synkronoidaan treeniä...</p>
              <p className="mt-1 text-xs text-[var(--text-subtle)]">
                Liikkeet, sarjat ja ohjeet avautuvat heti kun palvelimen tiedot ovat valmiina.
              </p>
            </div>
          </div>
        </div>
        <p aria-live="polite" className="sr-only">
          {workoutMessage}
        </p>
      </div>
    );
  }

  if (!selectedSession) {
    return (
      <div className="mt-5 rounded-2xl border border-dashed border-[var(--border)] bg-[color:color-mix(in_srgb,var(--surface-2)_82%,var(--surface))] p-6 shadow-[0_10px_24px_-22px_var(--shadow)]">
        <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
          Aloita treeni, niin sovellus luo sinulle sarjalokin automaattisesti ja tallentaa etenemisen jokaisen muutoksen jälkeen.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button onClick={onStart} type="button">
            Aloita treeni
          </Button>
          {canDeleteWorkout ? (
            <Button onClick={onDelete} type="button" variant="danger">
              Poista treeni
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  // Lepoajastin on fixed-elementti näkymän alareunassa, joten sivun sisällölle
  // varataan sen verran tyhjää ettei "Merkitse valmiiksi" jää ajastimen alle.
  const isRestTimerVisible = status !== "completed" && restTotalSeconds > 0 && Boolean(restExerciseKey);

  return (
    <div
      className={`${activeLoggingView ? "mt-0 space-y-3" : "mt-6 space-y-5"} min-w-0 max-w-full overflow-x-clip [contain:inline-size]${
        isRestTimerVisible ? " pb-[calc(env(safe-area-inset-bottom)+5rem)]" : ""
      }`}
    >
      {activeLoggingView ? (
        <>
          <div className="fixed inset-x-0 top-0 z-40 bg-[var(--background)] m-0">
            <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] sm:px-6 lg:px-8">
              <button
                type="button"
                onClick={onBackToList}
                aria-label="Takaisin treenilistaan"
                className="grid size-10 shrink-0 place-items-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] transition hover:border-[var(--border-strong)]"
              >
                <ChevronLeft className="size-5" aria-hidden="true" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-subtle)]">
                  Käynnissä · {formatWorkoutDuration(elapsedSeconds)}
                </p>
                <h2 className="truncate font-[family-name:var(--font-display)] text-2xl font-bold leading-tight text-[var(--text)]">
                  {scheduledWorkoutTitle}
                </h2>
              </div>
              {progress ? (
                <span className="shrink-0 rounded-full bg-[color-mix(in_srgb,var(--success)_18%,var(--surface))] px-3 py-1 text-sm font-semibold tabular-nums text-[var(--success)]">
                  {progress.completedSets}/{progress.totalSets}
                </span>
              ) : null}
            </div>
          </div>
          <div aria-hidden="true" className="h-[calc(env(safe-area-inset-top)+4.25rem)] m-0" />
        </>
      ) : (
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <Badge className={workoutStatusBadgeClass(status)}>{workoutStatusLabel(status)}</Badge>
          <p className="text-sm text-[var(--text-muted)]">Käynnistetty {formatDate(selectedSession.startedAt)}</p>
          <Badge className="border-[var(--accent)] bg-[var(--surface-3)] text-[var(--accent)]">
            Treeniaika {formatWorkoutDuration(elapsedSeconds)}
          </Badge>
          {readOnly ? <Badge className="border-[var(--accent-secondary)] bg-[var(--surface-3)] text-[var(--accent-secondary)]">Lukittu</Badge> : null}
        </div>
      )}
      {status === "completed" && correctionMode ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
          <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-[color-mix(in_srgb,var(--accent)_18%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_6%,var(--surface))] px-3 py-2 text-xs text-[var(--text-subtle)]">
            <span>Muokkaa valmiin treenin sarjoja, päivämäärää ja kestoa.</span>
            <InfoTooltip
              side="top"
              text="Sarjamuutokset tallentuvat heti. Päivämäärä ja kesto tallennetaan niiden omista painikkeista."
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="w-full sm:max-w-[15rem]">
                  <Label htmlFor={`${scheduledWorkoutId}-date`} className="mb-1.5 text-xs">
                    Päivämäärä
                  </Label>
                  <Input
                    id={`${scheduledWorkoutId}-date`}
                    type="date"
                    className="px-3 py-2.5 text-sm"
                    value={scheduledDateDraft}
                    onChange={(event) => {
                      setScheduledDateDraft(event.target.value);
                      setDateMessage("");
                      setDateMessageTone(null);
                    }}
                  />
                  <p className="mt-1.5 text-xs text-[var(--text-subtle)]">
                    Päivittää myös toteutuspäivän samaan päivään.
                  </p>
                </div>
                <Button
                  type="button"
                  variant={isDateDirty ? "secondary" : "ghost"}
                  disabled={!isDateDirty || !scheduledDateDraft}
                  loading={isSavingDate}
                  loadingText="Tallennetaan..."
                  className="w-full sm:w-auto"
                  onClick={async () => {
                    setIsSavingDate(true);
                    try {
                      const result = await withMinimumDelay(onUpdateDate(scheduledDateDraft));
                      setDateMessage(result.ok ? "Päivämäärä päivitetty." : result.message ?? "Päivämäärän päivitys epäonnistui.");
                      setDateMessageTone(result.ok ? "success" : "danger");
                    } finally {
                      setIsSavingDate(false);
                    }
                  }}
                >
                  Tallenna
                </Button>
              </div>
              <InlineFeedback
                message={dateMessage}
                tone={dateMessageTone}
                idleMessage="Siirrä treeni oikealle päivälle tarvittaessa."
                className="mt-2 text-sm"
              />
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="w-full sm:max-w-[15rem]">
                  <Label htmlFor={`${scheduledWorkoutId}-duration`} className="mb-1.5 text-xs">
                    Kesto
                  </Label>
                  <Input
                    id={`${scheduledWorkoutId}-duration`}
                    type="text"
                    inputMode="text"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="45:00 tai 01:15:00"
                    className="px-3 py-2.5 text-sm"
                    value={durationDraft}
                    onChange={(event) => {
                      setDurationDraft(event.target.value);
                      setDurationMessage("");
                      setDurationMessageTone(null);
                    }}
                  />
                  <p className="mt-1.5 text-xs text-[var(--text-subtle)]">Muodot `mm:ss` ja `hh:mm:ss`.</p>
                </div>
                <Button
                  type="button"
                  variant={isDurationDirty ? "secondary" : "ghost"}
                  disabled={!isDurationDirty}
                  loading={isSavingDuration}
                  loadingText="Tallennetaan..."
                  className="w-full sm:w-auto"
                  onClick={async () => {
                    const parsedDuration = parseDurationInput(durationDraft);
                    if (parsedDuration === null) {
                      setDurationMessage("Anna kesto muodossa mm:ss tai hh:mm:ss.");
                      setDurationMessageTone("danger");
                      return;
                    }

                    setIsSavingDuration(true);
                    try {
                      const result = await withMinimumDelay(onUpdateDuration(parsedDuration));
                      setDurationMessage(result.ok ? "Kesto päivitetty." : result.message ?? "Keston päivitys epäonnistui.");
                      setDurationMessageTone(result.ok ? "success" : "danger");
                    } finally {
                      setIsSavingDuration(false);
                    }
                  }}
                >
                  Tallenna
                </Button>
              </div>
              <InlineFeedback
                message={durationMessage}
                tone={durationMessageTone}
                idleMessage="Korjaa kesto, jos ajastin jäi vääräksi."
                className="mt-2 text-sm"
              />
            </div>
          </div>
        </div>
      ) : null}
      {isSessionSyncing ? (
        <div className="rounded-2xl border border-[var(--border-strong)] bg-[color:color-mix(in_srgb,var(--surface-2)_82%,var(--surface))] px-4 py-3">
          <p className="text-sm font-semibold text-[var(--text)]">Haetaan treenin tiedot...</p>
          <p className="mt-1 text-xs text-[var(--text-subtle)]">
            Treeni aukesi jo. Synkronoidaan palvelimelta sarjat ja viimeisimmät arvot.
          </p>
        </div>
      ) : null}
      <p aria-live="polite" className="sr-only">
        {workoutMessage}
      </p>
      {isSessionSyncing ? (
        <div className="rounded-[18px] border border-[var(--border-strong)] bg-[color:color-mix(in_srgb,var(--surface-2)_82%,var(--surface))] px-4 py-5 shadow-[0_12px_28px_-24px_var(--shadow)]">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent text-[var(--accent)]"
            />
            <div>
              <p className="text-sm font-semibold text-[var(--text)]">Synkronoidaan treeniä...</p>
              <p className="mt-1 text-xs text-[var(--text-subtle)]">
                Liikkeet ja sarjat avautuvat heti kun palvelimen tiedot ovat valmiina.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <>
      {activeLoggingView ? (
        <p className="px-0.5 text-xs text-[var(--text-subtle)] [text-wrap:pretty]">
          Vedä kahvasta ylös tai alas säätääksesi · napauta numeroa kirjoittaaksesi.
        </p>
      ) : !readOnly ? (
        <div className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-[color-mix(in_srgb,var(--accent)_18%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_6%,var(--surface))] px-3 py-2 text-xs text-[var(--text-subtle)]">
          <span className="min-w-0 [overflow-wrap:anywhere]">Toisto- ja kuormakentissä voit painaa oikean reunan kahvaa ja vetää ylös tai alas muuttaaksesi arvoa.</span>
          <GripVertical className="size-3.5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
        </div>
      ) : null}
          {activeLoggingView
            ? exerciseRenderBlocks.map((block) => {
                if (block.type === "single") {
                  return renderActiveExerciseCard(block.groups[0]!);
                }

                const firstGroup = block.groups[0];
                if (!firstGroup) {
                  return null;
                }

                const safeBlockKey = block.key.replace(/[^a-zA-Z0-9_-]/g, "-");
                const supersetButtonId = `${scheduledWorkoutId}-${safeBlockKey}-active-toggle`;
                const supersetPanelId = `${scheduledWorkoutId}-${safeBlockKey}-active-panel`;
                const allLogs = block.groups.flatMap((group) => group.logs);
                const completedInSuperset = allLogs.filter((log) => log.done).length;
                const supersetAllDone = allLogs.length > 0 && completedInSuperset === allLogs.length;
                const isExpanded = block.groups.some((group) => getIsExpanded(group));
                const exerciseNames = block.groups.map((group) => group.exerciseName).join(" + ");
                const supersetToneClass = supersetAllDone
                  ? "border-2 border-[color-mix(in_srgb,var(--success)_34%,var(--border-strong))] bg-[color-mix(in_srgb,var(--success)_7%,var(--surface))] shadow-[0_12px_28px_-22px_color-mix(in_srgb,var(--success)_40%,transparent)]"
                  : "border-2 border-dashed border-[var(--border-strong)] bg-[var(--surface-2)]";

                return (
                  <div
                    key={block.key}
                    className={`min-w-0 max-w-full overflow-hidden rounded-[18px] p-3 ${supersetToneClass}`}
                  >
                    <button
                      type="button"
                      id={supersetButtonId}
                      aria-expanded={isExpanded}
                      aria-controls={supersetPanelId}
                      className="group flex w-full min-w-0 items-center justify-between gap-3 rounded-[1.2rem] text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]"
                      onClick={() => setGroupExpansion(firstGroup)}
                    >
                      <span className="min-w-0">
                        <span className="flex min-w-0 flex-wrap items-center gap-2">
                          <span className="font-[family-name:var(--font-display)] text-[0.98rem] font-bold text-[var(--accent)]">
                            Superset {block.supersetGroup}
                          </span>
                          <span className="inline-flex rounded-full border border-[color-mix(in_srgb,var(--accent)_24%,var(--border))] bg-[var(--surface)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-subtle)]">
                            {block.groups.length} liikettä
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-[var(--text-subtle)]">
                          {exerciseNames}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="rounded-full bg-[var(--surface)] px-2.5 py-1 text-xs font-semibold tabular-nums text-[var(--text-subtle)]">
                          {completedInSuperset}/{allLogs.length}
                        </span>
                        <span className="grid size-8 place-items-center rounded-full border border-[color-mix(in_srgb,var(--accent)_26%,var(--border))] bg-[var(--surface)] text-[var(--accent)] transition group-hover:bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]">
                          {isExpanded ? (
                            <ChevronUp className="size-4" aria-hidden="true" />
                          ) : (
                            <ChevronDown className="size-4" aria-hidden="true" />
                          )}
                        </span>
                      </span>
                    </button>
                    {isExpanded ? (
                      <div
                        id={supersetPanelId}
                        role="region"
                        aria-labelledby={supersetButtonId}
                        className="mt-3 grid min-w-0 gap-2.5"
                      >
                        {block.groups.map((group) => renderActiveExerciseCard(group))}
                      </div>
                    ) : null}
                  </div>
                );
              })
            : exerciseRenderBlocks.map((block) => {
                if (block.type === "single") {
                  return renderExerciseGroupCard(block.groups[0]!);
                }

                return (
                  <div key={block.key} className="min-w-0 max-w-full overflow-x-clip rounded-[18px] border-2 border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] p-3 [contain:inline-size]">
                    <div className="mb-3 flex min-w-0 items-center justify-between gap-3">
                      <div className="inline-flex min-w-0 items-center gap-1.5">
                        <p className="text-sm font-semibold text-[var(--accent)]">
                          Superset {block.supersetGroup}
                        </p>
                        <InfoTooltip text="Supersetissä tämän ryhmän liikkeet tehdään vuorotellen. Saman sarjan kuittaus peilautuu ryhmän muihin liikkeisiin." />
                      </div>
                      <Badge className="border-[var(--accent)] bg-[var(--surface)] text-[var(--accent)]">
                        {block.groups.length} liikettä
                      </Badge>
                    </div>
                    <div className="grid min-w-0 gap-3">
                      {block.groups.map((group) => renderExerciseGroupCard(group))}
                    </div>
                  </div>
                );
              })}
          {!readOnly ? (
            <button
              type="button"
              onClick={() => setOpenExerciseStructure({ mode: "add_extra" })}
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface)] px-4 py-3 text-sm font-semibold text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              <Plus className="size-4" aria-hidden="true" />
              {activeLoggingView ? "Lisää liike" : "Lisää extra-liike"}
            </button>
          ) : null}
        </>
      )}
      {openInstruction ? (
        <CoachInstructionDialog
          exerciseName={openInstruction.exerciseName}
          instruction={openInstruction.instruction}
          exercise={availableExercises.find((candidate) => candidate.id === openInstruction.exerciseId)}
          onClose={() => setOpenInstruction(null)}
        />
      ) : null}
      {openExerciseStructure ? (
        <ExerciseStructureDialog
          mode={openExerciseStructure.mode}
          exerciseName={openExerciseStructure.mode === "edit" ? openExerciseStructure.exerciseName : undefined}
          templateExerciseId={openExerciseStructure.mode === "edit" ? openExerciseStructure.templateExerciseId : undefined}
          exercises={availableExercises}
          initialExerciseId={openExerciseStructure.mode === "edit" ? openExerciseStructure.initialExerciseId : undefined}
          initialSetCount={openExerciseStructure.mode === "edit" ? openExerciseStructure.initialSetCount : undefined}
          initialTargetReps={openExerciseStructure.mode === "edit" ? openExerciseStructure.initialTargetReps : undefined}
          initialTargetRepsMin={openExerciseStructure.mode === "edit" ? openExerciseStructure.initialTargetRepsMin : undefined}
          initialTargetRepsMax={openExerciseStructure.mode === "edit" ? openExerciseStructure.initialTargetRepsMax : undefined}
          initialRestSeconds={openExerciseStructure.mode === "edit" ? openExerciseStructure.initialRestSeconds : undefined}
          onClose={() => setOpenExerciseStructure(null)}
          onRemove={async (templateExerciseId) => {
            const confirmed = window.confirm("Poistetaanko liike tältä treeniltä ja ohjelmasta?");
            if (!confirmed) {
              return;
            }
            await onExerciseStructureUpdate({ type: "remove", templateExerciseId });
            setOpenExerciseStructure(null);
          }}
          onSubmit={async (payload) => {
            if (openExerciseStructure.mode === "edit") {
              if (!openExerciseStructure.templateExerciseId) {
                return;
              }
              await onExerciseStructureUpdate({
                type: "replace",
                templateExerciseId: openExerciseStructure.templateExerciseId,
                exerciseId: payload.exerciseId,
                customExerciseName: payload.customExerciseName,
                setCount: payload.setCount,
                targetReps: payload.targetReps,
                targetRepsMin: payload.targetRepsMin,
                targetRepsMax: payload.targetRepsMax,
                restSeconds: payload.restSeconds,
              });
            } else {
              await onExerciseStructureUpdate({
                type: "add_extra",
                exerciseId: payload.exerciseId,
                customExerciseName: payload.customExerciseName,
                setCount: payload.setCount,
                targetReps: payload.targetReps,
                targetRepsMin: payload.targetRepsMin,
                targetRepsMax: payload.targetRepsMax,
                restSeconds: payload.restSeconds,
              });
            }
            setOpenExerciseStructure(null);
          }}
        />
      ) : null}

      <div>
        <div className="mb-1 flex items-center gap-1">
          <Label className="mb-0" htmlFor={`${scheduledWorkoutId}-note`}>Treenin muistiinpanot</Label>
          <InfoTooltip text="Kirjoita tähän fiilis, kipu tai muu huomio. Muistiinpano näkyy treenin yhteenvedossa." />
        </div>
        <Textarea
          id={`${scheduledWorkoutId}-note`}
          // Fokusrengas sisään: panelin overflow-x-clip leikkaisi ulkorenkaan reunoilta.
          className="focus-visible:ring-inset focus-visible:ring-offset-0"
          value={localNote}
          disabled={readOnly}
          onChange={(event) => {
            const nextValue = event.target.value;
            setLocalNote(nextValue);
            if (noteSaveTimeoutRef.current !== null) {
              window.clearTimeout(noteSaveTimeoutRef.current);
            }
            noteSaveTimeoutRef.current = window.setTimeout(() => {
              onSaveNote(nextValue);
            }, 500);
          }}
          placeholder="Kirjaa treenin fiilis, mahdollinen kipu tai muu huomio. Jos treeni jäi kesken, kerro syy lyhyesti."
        />
        <p aria-live="polite" className="mt-2 text-xs text-[var(--text-subtle)]">
          Muistiinpano tallentuu automaattisesti.
        </p>
      </div>

      {status !== "completed" && restTotalSeconds > 0 && restExerciseKey ? (
        <div className="fixed bottom-[max(env(safe-area-inset-bottom),0.75rem)] left-1/2 z-30 mt-0 box-border w-[min(100%,calc(100dvw-2rem))] min-w-0 max-w-[calc(100dvw-2rem)] -translate-x-1/2 md:bottom-3 md:right-3 md:left-auto md:w-[min(20rem,calc(100dvw-1.5rem))] md:max-w-[calc(100dvw-1.5rem)] md:translate-x-0 lg:right-6 lg:w-[min(20rem,calc(100dvw-3rem))] lg:max-w-[calc(100dvw-3rem)]">
          <div
            role="status"
            aria-label={`Lepoajastin ${formatDuration(restSecondsLeft)}`}
            className="box-border flex w-full min-w-0 items-center gap-3 overflow-hidden rounded-full bg-[var(--text)] px-3 py-2.5 shadow-[0_16px_30px_-18px_var(--shadow)]"
          >
            <button
              type="button"
              aria-label="Käynnistä lepo uudelleen"
              title="Uudelleen"
              className="grid size-7 shrink-0 place-items-center rounded-full text-[color-mix(in_srgb,var(--background)_82%,var(--text))] transition hover:text-[var(--background)]"
              onClick={restartRestTimer}
            >
              <Clock3 className="size-5" aria-hidden="true" />
            </button>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--background)_28%,var(--text))]">
              <div
                className="h-full rounded-full bg-[var(--success)] transition-[width]"
                style={{
                  width: `${restTotalSeconds > 0 ? Math.round((restSecondsLeft / restTotalSeconds) * 100) : 0}%`,
                }}
              />
            </div>
            <span className="shrink-0 font-[family-name:var(--font-display)] text-base font-bold tabular-nums text-[var(--background)]">
              {formatDuration(restSecondsLeft)}
            </span>
            <button
              type="button"
              aria-label="Ohita lepo"
              title="Ohita"
              className="grid size-7 shrink-0 place-items-center rounded-full text-[color-mix(in_srgb,var(--background)_82%,var(--text))] transition hover:text-[var(--background)]"
              onClick={skipRestTimer}
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}

      <div className="rounded-none border-0 bg-transparent p-0 shadow-none">
        {(isCompleting || isCancellingWorkout || isDeletingWorkout) ? (
          <div className="mb-3 flex items-center gap-3 rounded-2xl border border-[var(--border-strong)] bg-[color:color-mix(in_srgb,var(--surface-2)_84%,var(--surface))] px-4 py-3 text-sm text-[var(--text)] shadow-[0_12px_28px_-24px_var(--shadow)]">
            <span
              aria-hidden="true"
              className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent text-[var(--accent)]"
            />
            <span>
              {isCompleting
                ? "Tallennetaan treeni..."
                : isCancellingWorkout
                  ? "Keskeytetään treeni..."
                  : "Poistetaan treeni..."}
            </span>
          </div>
        ) : null}
        {activeLoggingView ? (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              aria-label="Poista treeni"
              title="Poista treeni"
              className="size-12 shrink-0 rounded-2xl border border-[var(--border)] p-0 text-[var(--danger)]"
              loading={isDeletingWorkout}
              onClick={async () => {
                setIsDeletingWorkout(true);
                try {
                  await onDelete();
                } finally {
                  setIsDeletingWorkout(false);
                }
              }}
            >
              {isDeletingWorkout ? null : <Trash2 className="size-5" aria-hidden="true" />}
            </Button>
            <Button
              type="button"
              className="h-12 flex-1 text-base"
              disabled={!progress || progress.completedSets === 0}
              loading={isCompleting}
              loadingText="Tallennetaan..."
              onClick={onComplete}
            >
              Merkitse valmiiksi
            </Button>
          </div>
        ) : (
        <div className="flex flex-wrap gap-3 items-center">
          {status !== "completed" ? (
            <>
              {showResumeAction ? (
                 <Button
                   onClick={async () => {
                     setIsStartingWorkout(true);
                     try {
                       await onStart();
                     } finally {
                       setIsStartingWorkout(false);
                     }
                   }}
                    type="button"
                    className="flex-1 sm:flex-none"
                    loading={isStartingWorkout}
                    loadingText="Käynnistetään treeni..."
                  >
                    Jatka treeniä
                  </Button>
              ) : (
                !isCompleting ? (
                  <Button
                    onClick={onComplete}
                     type="button"
                    className="flex-1 sm:flex-none"
                      loading={isCompleting}
                      loadingText="Tallennetaan..."
                    >
                      Merkitse valmiiksi
                    </Button>
                ) : null
              )}
              {showBottomBackToList ? (
                <Button onClick={onBackToList} type="button" variant="ghost" className="flex-1 sm:flex-none">
                  Takaisin treenilistaan
                </Button>
              ) : null}
              {hasSecondaryActions ? (
                <div className="relative" data-session-actions-menu-root="true">
                  <Button
                    type="button"
                    variant="ghost"
                    className="size-10 rounded-full p-0"
                    data-session-actions-trigger="true"
                    aria-expanded={isSecondaryActionsOpen}
                    aria-haspopup="menu"
                    aria-label="Avaa treenin lisätoiminnot"
                    onClick={(event) => {
                      console.info("[workout-ui] secondary-actions-toggle", {
                        status,
                        scheduledWorkoutId,
                        open: !isSecondaryActionsOpen,
                      });
                      toggleSecondaryActionsMenu(event.currentTarget);
                    }}
                  >
                    <MoreHorizontal className="size-5" aria-hidden="true" />
                  </Button>
                  {isSecondaryActionsOpen ? (
                    <div
                      ref={secondaryActionsMenuRef}
                      role="menu"
                      className="z-20 min-w-40 max-w-[calc(100vw-1rem)] rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 shadow-[0_12px_30px_-20px_var(--shadow)]"
                      style={
                        secondaryActionsMenuStyle ??
                        (secondaryActionsAnchorRect
                          ? getHiddenFloatingMenuStyle(secondaryActionsAnchorRect)
                          : undefined)
                      }
                    >
                      {showResumeAction ? (
                        <button
                          type="button"
                          role="menuitem"
                          className="w-full rounded-lg px-3 py-2 text-left text-sm text-[var(--accent)] hover:bg-[var(--surface-3)]"
                          onClick={() => {
                            console.info("[workout-ui] resume-from-menu", { scheduledWorkoutId });
                            setIsSecondaryActionsOpen(false);
                            setSecondaryActionsAnchorRect(null);
                            setSecondaryActionsMenuStyle(null);
                            void onStart();
                          }}
                        >
                          Jatka treeniä
                        </button>
                      ) : null}
                      {showCancelAction ? (
                        <button
                          type="button"
                          role="menuitem"
                          disabled={isCancellingWorkout || isDeletingWorkout}
                          className="w-full rounded-lg px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-[var(--surface-3)]"
                          onClick={async () => {
                            console.info("[workout-ui] cancel-from-menu", { scheduledWorkoutId });
                            setIsSecondaryActionsOpen(false);
                            setSecondaryActionsAnchorRect(null);
                            setSecondaryActionsMenuStyle(null);
                            setIsCancellingWorkout(true);
                            try {
                              await onCancel();
                            } finally {
                              setIsCancellingWorkout(false);
                            }
                          }}
                        >
                          {isCancellingWorkout ? "Keskeytetään treeni..." : "Keskeytä treeni"}
                        </button>
                      ) : null}
                      {showDeleteAction ? (
                        <button
                          type="button"
                          role="menuitem"
                          disabled={isDeletingWorkout || isCancellingWorkout}
                          className="w-full rounded-lg px-3 py-2 text-left text-sm text-[var(--danger)] hover:bg-[var(--surface-3)]"
                          onClick={async () => {
                            console.info("[workout-ui] delete-from-menu", { scheduledWorkoutId });
                            setIsSecondaryActionsOpen(false);
                            setSecondaryActionsAnchorRect(null);
                            setSecondaryActionsMenuStyle(null);
                            setIsDeletingWorkout(true);
                            try {
                              await onDelete();
                            } finally {
                              setIsDeletingWorkout(false);
                            }
                          }}
                        >
                          {isDeletingWorkout ? "Poistetaan treeni..." : "Poista treeni"}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <div className="inline-flex items-center gap-1.5">
              {showBottomBackToList ? (
                <Button onClick={onBackToList} type="button" variant="ghost">
                  {correctionMode ? "Valmis" : "Takaisin treenilistaan"}
                </Button>
              ) : null}
              {showDeleteAction ? (
                <div className="relative" data-session-actions-menu-root="true">
                  <Button
                    type="button"
                    variant="ghost"
                    className="size-10 rounded-full p-0"
                    data-session-actions-trigger="true"
                    aria-expanded={isSecondaryActionsOpen}
                    aria-haspopup="menu"
                    aria-label="Avaa treenin lisätoiminnot"
                    onClick={(event) => {
                      console.info("[workout-ui] completed-secondary-actions-toggle", {
                        status,
                        scheduledWorkoutId,
                        open: !isSecondaryActionsOpen,
                      });
                      toggleSecondaryActionsMenu(event.currentTarget);
                    }}
                  >
                    <MoreHorizontal className="size-5" aria-hidden="true" />
                  </Button>
                  {isSecondaryActionsOpen ? (
                    <div
                      ref={secondaryActionsMenuRef}
                      role="menu"
                      className="z-20 min-w-40 max-w-[calc(100vw-1rem)] rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 shadow-[0_12px_30px_-20px_var(--shadow)]"
                      style={
                        secondaryActionsMenuStyle ??
                        (secondaryActionsAnchorRect
                          ? getHiddenFloatingMenuStyle(secondaryActionsAnchorRect)
                          : undefined)
                      }
                    >
                      <button
                        type="button"
                        role="menuitem"
                        className="w-full rounded-lg px-3 py-2 text-left text-sm text-[var(--danger)] hover:bg-[var(--surface-3)]"
                        onClick={() => {
                          console.info("[workout-ui] delete-completed-from-menu", { scheduledWorkoutId });
                          setIsSecondaryActionsOpen(false);
                          setSecondaryActionsAnchorRect(null);
                          setSecondaryActionsMenuStyle(null);
                          onDelete();
                        }}
                      >
                        Poista treeni
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </div>
        )}
      </div>
      {!activeLoggingView && status !== "completed" && progress && progress.percent < 100 ? (
        <p className="text-sm text-[var(--text-muted)]">
          Voit merkitä treenin valmiiksi myös osittain. Toteuma nyt {progress.completedSets}/{progress.totalSets} sarjaa ({progress.percent}%).
        </p>
      ) : null}
    </div>
  );
}
