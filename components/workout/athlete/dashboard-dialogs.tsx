import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { extraActivityCatalog } from "@/lib/extra-activities";
import type { ExtraActivityType, ProgramWorkout, ProgramWorkoutSet } from "@/lib/types";
import { cn } from "@/lib/utils";

export function CoachInstructionDialog({
  exerciseName,
  instruction,
  onClose,
}: {
  exerciseName: string;
  instruction: string;
  onClose: () => void;
}) {
  return (
    <Sheet onClose={onClose} ariaLabelledby="coach-instruction-title" ariaDescribedby="coach-instruction-description">
        <p className="text-sm font-semibold text-[var(--accent)]">Valmentajan ohje</p>
        <h3
          id="coach-instruction-title"
          className="mt-2 font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--text)]"
        >
          {exerciseName}
        </h3>
        <p
          id="coach-instruction-description"
          className="mt-3 max-h-[60vh] overflow-y-auto whitespace-pre-line text-sm leading-6 text-[var(--text-muted)]"
        >
          {instruction}
        </p>
    </Sheet>
  );
}

function formatProgramWorkoutSetReps(set: ProgramWorkoutSet) {
  if (
    set.targetRepsMin !== undefined &&
    set.targetRepsMax !== undefined &&
    set.targetRepsMax > set.targetRepsMin
  ) {
    return `${set.targetRepsMin}-${set.targetRepsMax}`;
  }

  return String(set.targetReps);
}

function formatProgramWorkoutExerciseTarget(sets: ProgramWorkoutSet[]) {
  if (!sets.length) {
    return "Ei sarjoja";
  }

  const repTargets = Array.from(new Set(sets.map((set) => formatProgramWorkoutSetReps(set))));
  return `${sets.length} × ${repTargets.length === 1 ? repTargets[0] : repTargets.join("/")}`;
}

export function ProgramWorkoutPreviewDialog({
  workout,
  onClose,
}: {
  workout: ProgramWorkout;
  onClose: () => void;
}) {
  const setCount = workout.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);

  return (
    <Sheet onClose={onClose} ariaLabelledby="program-workout-preview-title">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3
              id="program-workout-preview-title"
              className="font-[family-name:var(--font-display)] text-2xl font-bold leading-tight text-[var(--text)]"
            >
              {workout.name}
            </h3>
            <p className="mt-1 text-sm text-[var(--text-subtle)]">
              {workout.exercises.length} liikettä · {setCount} sarjaa
            </p>
          </div>
        </div>

        <div className="mt-4 max-h-[60vh] overflow-y-auto">
          <div className="grid gap-2">
            {workout.exercises.map((exercise, index) => (
              <div
                key={exercise.id}
                className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-3"
              >
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-subtle)]">
                      Liike {index + 1}
                    </p>
                    <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-2">
                      <p className="min-w-0 font-semibold text-[var(--text)] [overflow-wrap:anywhere]">
                        {exercise.exerciseName}
                      </p>
                      {exercise.supersetGroup ? (
                        <span className="shrink-0 rounded-full border border-[color-mix(in_srgb,var(--accent)_28%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent)]">
                          Superset {exercise.supersetGroup}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="shrink-0 rounded-full bg-[var(--surface)] px-2.5 py-1 text-xs font-semibold tabular-nums text-[var(--text-subtle)]">
                    {formatProgramWorkoutExerciseTarget(exercise.sets)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
    </Sheet>
  );
}

export function ExtraActivityDialog({
  activityType,
  durationMinutes,
  occurredDate,
  notes,
  estimatedKcal,
  isManualKcalEnabled,
  manualKcal,
  saving = false,
  onChangeActivityType,
  onChangeDurationMinutes,
  onChangeOccurredDate,
  onChangeNotes,
  onToggleManualKcal,
  onChangeManualKcal,
  onClose,
  onSave,
}: {
  activityType: ExtraActivityType;
  durationMinutes: string;
  occurredDate: string;
  notes: string;
  estimatedKcal: number;
  isManualKcalEnabled: boolean;
  manualKcal: string;
  saving?: boolean;
  onChangeActivityType: (value: ExtraActivityType) => void;
  onChangeDurationMinutes: (value: string) => void;
  onChangeOccurredDate: (value: string) => void;
  onChangeNotes: (value: string) => void;
  onToggleManualKcal: (value: boolean) => void;
  onChangeManualKcal: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const totalMinutes = Math.max(0, Number(durationMinutes) || 0);
  const [showAllActivityTypes, setShowAllActivityTypes] = useState(false);
  const primaryActivityTypes: ExtraActivityType[] = ["run", "cycle", "walk", "swim", "hiit", "mobility"];
  const restActivityTypes = (Object.keys(extraActivityCatalog) as ExtraActivityType[])
    .filter((type) => !primaryActivityTypes.includes(type))
    .sort((left, right) => extraActivityCatalog[left].label.localeCompare(extraActivityCatalog[right].label, "fi"));
  const activityTypes = showAllActivityTypes
    ? [...primaryActivityTypes, ...restActivityTypes]
    : primaryActivityTypes.includes(activityType)
      ? primaryActivityTypes
      : [...primaryActivityTypes, activityType];
  const updateDurationBy = (delta: number) => {
    onChangeDurationMinutes(String(Math.max(5, totalMinutes + delta)));
  };

  return (
    <Sheet
      onClose={onClose}
      ariaLabelledby="extra-activity-title"
      ariaDescribedby="extra-activity-description"
    >
      <h3 id="extra-activity-title" className="font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--text)]">
        Extra-treeni
      </h3>
      <p id="extra-activity-description" className="mt-1 text-sm text-[var(--text-muted)]">
        Cardio ja muu liikunta ohjelman rinnalle — näkyy historiassa.
      </p>

      <div className="mt-5 min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <div className="flex flex-wrap gap-3" role="group" aria-label="Extra-treenin laji">
          {activityTypes.map((type) => {
            const active = activityType === type;
            return (
              <button
                key={type}
                type="button"
                aria-pressed={active}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
                  active
                    ? "bg-[var(--text)] text-[var(--background)]"
                    : "bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
                )}
                onClick={() => onChangeActivityType(type)}
              >
                {extraActivityCatalog[type].label}
              </button>
            );
          })}
          <button
            type="button"
            aria-expanded={showAllActivityTypes}
            className="rounded-full px-4 py-2 text-sm font-semibold text-[var(--accent)] transition hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
            onClick={() => setShowAllActivityTypes((previous) => !previous)}
          >
            {showAllActivityTypes ? "Näytä vähemmän" : "Lisää lajeja"}
          </button>
        </div>

        <div className="mt-6 flex items-center justify-between gap-4">
          <p className="text-sm font-semibold tracking-[0.02em] text-[var(--text-subtle)]">Kesto (min)</p>
          <div className="flex h-12 shrink-0 items-center gap-2 rounded-xl bg-[var(--surface-2)] px-3">
            <button
              type="button"
              aria-label="Vähennä kestoa"
              className="grid size-8 place-items-center rounded-full text-xl leading-none text-[var(--text)] transition hover:bg-[var(--surface)]"
              onClick={() => updateDurationBy(-5)}
            >
              -
            </button>
            <output
              aria-live="polite"
              className="min-w-9 text-center font-[family-name:var(--font-display)] text-base font-bold tabular-nums text-[var(--text)]"
            >
              {totalMinutes}
            </output>
            <button
              type="button"
              aria-label="Lisää kestoa"
              className="grid size-8 place-items-center rounded-full text-xl leading-none text-[var(--text)] transition hover:bg-[var(--surface)]"
              onClick={() => updateDurationBy(5)}
            >
              +
            </button>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between gap-4">
          <p className="text-sm font-semibold tracking-[0.02em] text-[var(--text-subtle)]">Kulutus (kcal)</p>
          {isManualKcalEnabled ? (
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={manualKcal}
              onChange={(event) => onChangeManualKcal(event.target.value)}
              placeholder={String(estimatedKcal)}
              aria-label="Kulutus kcal"
              className="h-12 w-28 rounded-xl bg-[var(--surface-2)] px-3 text-right font-[family-name:var(--font-display)] text-base font-bold tabular-nums text-[var(--text)] outline-none"
            />
          ) : (
            <output className="font-[family-name:var(--font-display)] text-base font-bold tabular-nums text-[var(--text)]">
              {estimatedKcal}
            </output>
          )}
        </div>
        <label className="mt-2 flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <input
            type="checkbox"
            checked={isManualKcalEnabled}
            onChange={(event) => onToggleManualKcal(event.target.checked)}
            className="size-4"
          />
          Syötä kulutus itse (muuten arvio painon ja keston mukaan)
        </label>

        <label className="mt-6 flex items-center justify-between gap-4">
          <span className="text-sm font-semibold tracking-[0.02em] text-[var(--text-subtle)]">Päivä</span>
          <input
            type="date"
            value={occurredDate}
            onChange={(event) => onChangeOccurredDate(event.target.value)}
            className="h-12 rounded-xl bg-[var(--surface-2)] px-3 text-sm text-[var(--text)] outline-none"
          />
        </label>

        <label className="mt-6 flex flex-col gap-1">
          <span className="text-sm font-semibold tracking-[0.02em] text-[var(--text-subtle)]">Muistiinpano</span>
          <input
            type="text"
            value={notes}
            onChange={(event) => onChangeNotes(event.target.value)}
            placeholder="valinnainen"
            className="rounded-xl bg-[var(--surface-2)] px-3 py-2.5 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-subtle)]"
          />
        </label>
      </div>

      <div className="mt-5 shrink-0">
        <Button type="button" className="w-full" loading={saving} disabled={saving} onClick={onSave}>
          Tallenna
        </Button>
      </div>
    </Sheet>
  );
}
