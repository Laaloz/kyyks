"use client";

import { BookOpen, ChevronLeft, Plus, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import { DragNumber } from "@/components/ui/drag-number";
import { Select } from "@/components/ui/field";
import { customMuscleGroupLabels } from "@/components/workout/coach/program-composer";
import { CUSTOM_EXERCISE_VALUE, CUSTOM_MUSCLE_GROUP_OPTIONS } from "@/components/workout/schemas";
import { cn } from "@/lib/utils";
import type { Exercise, MuscleGroupKey, ProgramWorkoutInput, TrainingPlan } from "@/lib/types";

type DraftExercise = {
  uid: string;
  exerciseId?: string;
  name: string;
  sets: number;
  repsMin: number;
  repsMax: number;
  /** Liikkeen ohje (cue) urheilijalle — näkyy treenissä. */
  instruction?: string;
  /** Pankista puuttuva oma liike — luodaan coach_custom-liikkeeksi tallennettaessa. */
  isCustom?: boolean;
  muscleGroup?: MuscleGroupKey;
};

type DraftWorkout = {
  uid: string;
  title: string;
  exercises: DraftExercise[];
};

function makeUid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

function makeGroupId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return makeUid("group");
}

const clampInt = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(value)));

// Olemassa olevan ohjelman treenipäivät → editorin luonnos (sarjat + toistohaarukka).
// Ohje haetaan ensisijaisesti ohjelmaan tallennetusta, muuten liikkeen omasta cuesta.
function planWorkoutsToDraft(plan: TrainingPlan | null, exercises: Exercise[]): DraftWorkout[] {
  if (!plan?.workouts?.length) {
    return [];
  }
  const cueById = new Map(exercises.map((exercise) => [exercise.id, exercise.cue]));
  return plan.workouts.map((workout) => ({
    uid: makeUid("w"),
    title: workout.name,
    exercises: workout.exercises.map((exercise) => {
      const firstSet = exercise.sets[0];
      const min = firstSet?.targetRepsMin ?? firstSet?.targetReps ?? 8;
      const max = firstSet?.targetRepsMax ?? firstSet?.targetReps ?? min;
      return {
        uid: makeUid("e"),
        exerciseId: exercise.exerciseId,
        name: exercise.exerciseName,
        instruction: exercise.instruction?.trim() || (exercise.exerciseId ? cueById.get(exercise.exerciseId) : undefined),
        sets: Math.max(1, exercise.sets.length || 3),
        repsMin: min,
        repsMax: Math.max(min, max),
      };
    }),
  }));
}

// Editorin luonnos → ohjelman tallennusmuoto (ProgramWorkoutInput[]).
function draftToWorkoutInputs(workouts: DraftWorkout[]): ProgramWorkoutInput[] {
  return workouts.map((workout) => ({
    splitType: "custom",
    nameOverride: workout.title.trim() || "Treeni",
    defaultRestSeconds: 90,
    exercises: workout.exercises.map((exercise) => {
      const base = {
        exerciseName: exercise.name,
        instruction: exercise.instruction?.trim() ?? "",
        repMode: "range" as const,
        setCount: exercise.sets,
        targetReps: exercise.repsMin,
        targetRepsMin: exercise.repsMin,
        targetRepsMax: exercise.repsMax,
      };
      // Oma liike: ei exerciseId:tä → provider (resolveProgramWorkouts) luo coach_custom.
      if (exercise.isCustom || !exercise.exerciseId) {
        return {
          ...base,
          exerciseId: CUSTOM_EXERCISE_VALUE,
          customExerciseName: exercise.name,
          customMuscleGroup: exercise.muscleGroup,
        };
      }
      return { ...base, exerciseId: exercise.exerciseId };
    }),
  }));
}

// Arvioitu kesto vain näyttöön (ei tallenneta) — sarjat × ~4 min + 8 min lämmittely.
function estimatedMinutes(workout: DraftWorkout): number {
  const setCount = workout.exercises.reduce((sum, exercise) => sum + exercise.sets, 0);
  return Math.max(20, setCount * 4 + 8);
}

export function ProgramEditorOverlay({
  groupPlans,
  athletes,
  exercises,
  currentUserId,
  onClose,
  onSave,
}: {
  /** Saman program_group_id:n (tai yksittäisen ohjelman) aktiiviset rivit; tyhjä = uusi ohjelma. */
  groupPlans: TrainingPlan[];
  athletes: Array<{ id: string; fullName: string }>;
  exercises: Exercise[];
  currentUserId: string;
  onClose: () => void;
  onSave: (input: {
    groupId: string;
    title: string;
    weekCount: number;
    workouts: ProgramWorkoutInput[];
    assignedAthleteIds: string[];
    groupPlans: TrainingPlan[];
  }) => Promise<{ ok: boolean; message?: string }>;
}) {
  const isNew = groupPlans.length === 0;
  const basePlan = groupPlans[0] ?? null;
  const groupId = useMemo(() => basePlan?.programGroupId ?? basePlan?.id ?? makeGroupId(), [basePlan]);

  const [name, setName] = useState(basePlan?.title ?? "");
  const [assigned, setAssigned] = useState<string[]>(() => groupPlans.map((plan) => plan.athleteId));
  const [workouts, setWorkouts] = useState<DraftWorkout[]>(() => planWorkoutsToDraft(basePlan, exercises));
  const [pickerForWorkout, setPickerForWorkout] = useState<string | null>(null);
  const [pickerQuery, setPickerQuery] = useState("");
  const [newMuscle, setNewMuscle] = useState<MuscleGroupKey | "">("");
  const [openInstructionUid, setOpenInstructionUid] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Lukitse taustan vieritys, ettei se vuoda overscrollissa overlayn taakse.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const weekCount = basePlan?.weekCount ?? 8;

  const updateWorkout = (uid: string, patch: Partial<DraftWorkout>) =>
    setWorkouts((current) => current.map((workout) => (workout.uid === uid ? { ...workout, ...patch } : workout)));
  const updateExercise = (workoutUid: string, exerciseUid: string, patch: Partial<DraftExercise>) =>
    setWorkouts((current) =>
      current.map((workout) =>
        workout.uid === workoutUid
          ? {
              ...workout,
              exercises: workout.exercises.map((exercise) =>
                exercise.uid === exerciseUid ? { ...exercise, ...patch } : exercise,
              ),
            }
          : workout,
      ),
    );
  const removeExercise = (workoutUid: string, exerciseUid: string) =>
    setWorkouts((current) =>
      current.map((workout) =>
        workout.uid === workoutUid
          ? { ...workout, exercises: workout.exercises.filter((exercise) => exercise.uid !== exerciseUid) }
          : workout,
      ),
    );
  const addWorkout = () =>
    setWorkouts((current) => [
      ...current,
      { uid: makeUid("w"), title: `Treeni ${String.fromCharCode(65 + current.length)}`, exercises: [] },
    ]);
  const removeWorkout = (uid: string) => {
    const target = workouts.find((workout) => workout.uid === uid);
    if (target && target.exercises.length > 0 && !window.confirm(`Poistetaanko ${target.title || "treenipäivä"}?`)) {
      return;
    }
    setWorkouts((current) => current.filter((workout) => workout.uid !== uid));
  };
  const setWeeklyTarget = (next: number) => {
    const target = clampInt(next, 1, 7);
    setWorkouts((current) => {
      if (target > current.length) {
        const additions = Array.from({ length: target - current.length }, (_, index) => ({
          uid: makeUid("w"),
          title: `Treeni ${String.fromCharCode(65 + current.length + index)}`,
          exercises: [] as DraftExercise[],
        }));
        return [...current, ...additions];
      }
      if (target < current.length) {
        return current.slice(0, target);
      }
      return current;
    });
  };

  const closePicker = () => {
    setPickerForWorkout(null);
    setPickerQuery("");
    setNewMuscle("");
  };

  const appendExercise = (draft: Omit<DraftExercise, "uid">) => {
    if (!pickerForWorkout) {
      return;
    }
    setWorkouts((current) =>
      current.map((workout) =>
        workout.uid === pickerForWorkout
          ? { ...workout, exercises: [...workout.exercises, { uid: makeUid("e"), ...draft }] }
          : workout,
      ),
    );
    closePicker();
  };

  const addExerciseFromBank = (exercise: Exercise) =>
    // Tuo liikkeen oma vakio-ohje (cue) valmiiksi kenttään — muokattavissa.
    appendExercise({ exerciseId: exercise.id, name: exercise.name, instruction: exercise.cue, sets: 3, repsMin: 8, repsMax: 8 });

  const addCustomExercise = () => {
    const name = pickerQuery.trim();
    if (!name) {
      return;
    }
    appendExercise({
      name,
      sets: 3,
      repsMin: 8,
      repsMax: 8,
      isCustom: true,
      muscleGroup: newMuscle || undefined,
    });
  };

  const bankResults = useMemo(() => {
    if (!pickerForWorkout) {
      return [];
    }
    const used = new Set(
      (workouts.find((workout) => workout.uid === pickerForWorkout)?.exercises ?? []).map((exercise) => exercise.name),
    );
    const query = pickerQuery.trim().toLowerCase();
    return exercises
      .filter((exercise) => !used.has(exercise.name))
      .filter((exercise) => !query || exercise.name.toLowerCase().includes(query))
      .sort((a, b) => a.name.localeCompare(b.name, "fi"));
  }, [exercises, pickerForWorkout, pickerQuery, workouts]);

  const handleSave = async () => {
    if (!assigned.length) {
      setError("Valitse vähintään yksi urheilija.");
      return;
    }
    if (!workouts.length) {
      setError("Lisää vähintään yksi treenipäivä.");
      return;
    }
    setIsSaving(true);
    setError(null);
    const result = await onSave({
      groupId,
      title: name.trim() || "Nimetön ohjelma",
      weekCount,
      workouts: draftToWorkoutInputs(workouts),
      assignedAthleteIds: assigned,
      groupPlans,
    });
    setIsSaving(false);
    if (!result.ok) {
      setError(result.message ?? "Ohjelman tallennus epäonnistui.");
      return;
    }
    onClose();
  };

  if (!mounted) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--background)]">
      <div className="flex items-center gap-3 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-2">
        <button
          type="button"
          className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--surface)] text-[var(--text)] transition hover:bg-[var(--surface-2)]"
          aria-label="Takaisin"
          onClick={onClose}
        >
          <ChevronLeft className="size-5" aria-hidden="true" />
        </button>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-subtle)]">
            {isNew ? "Uusi ohjelma" : "Ohjelman muokkaus"}
          </p>
          <h1 className="truncate font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--text)]">
            {name || "Nimetön ohjelma"}
          </h1>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-36">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <label
            htmlFor="program-editor-name"
            className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-subtle)]"
          >
            Ohjelman nimi
          </label>
          <input
            id="program-editor-name"
            className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-[15px] text-[var(--text)] outline-none focus-visible:border-[var(--accent)]"
            placeholder="esim. Voima 3"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />

          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="text-sm font-bold text-[var(--text)]">Treeniä viikossa</span>
            <div className="flex items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-1">
              <button
                type="button"
                className="grid size-9 place-items-center rounded-lg text-[var(--text)] transition hover:bg-[var(--surface-3)] disabled:opacity-40"
                aria-label="Vähennä treenipäiviä"
                disabled={workouts.length <= 1}
                onClick={() => setWeeklyTarget(workouts.length - 1)}
              >
                −
              </button>
              <span className="min-w-8 text-center font-[family-name:var(--font-display)] text-lg font-bold tabular-nums text-[var(--text)]">
                {workouts.length}
              </span>
              <button
                type="button"
                className="grid size-9 place-items-center rounded-lg text-[var(--text)] transition hover:bg-[var(--surface-3)] disabled:opacity-40"
                aria-label="Lisää treenipäiviä"
                disabled={workouts.length >= 7}
                onClick={() => setWeeklyTarget(workouts.length + 1)}
              >
                +
              </button>
            </div>
          </div>

          <p className="mt-4 text-sm font-bold text-[var(--text)]">Käytössä urheilijoilla</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {athletes.map((athlete) => {
              const isOn = assigned.includes(athlete.id);
              return (
                <button
                  key={athlete.id}
                  type="button"
                  aria-pressed={isOn}
                  className={cn(
                    "rounded-full px-3.5 py-1.5 text-sm font-semibold transition",
                    isOn
                      ? "bg-[var(--text)] text-[var(--background)]"
                      : "bg-[var(--surface-2)] text-[var(--text-muted)] hover:bg-[var(--surface-3)]",
                  )}
                  onClick={() =>
                    setAssigned((current) =>
                      current.includes(athlete.id)
                        ? current.filter((id) => id !== athlete.id)
                        : [...current, athlete.id],
                    )
                  }
                >
                  {athlete.id === currentUserId ? `${athlete.fullName} (sinä)` : athlete.fullName}
                </button>
              );
            })}
          </div>
          <p className="mt-2.5 text-[12.5px] text-pretty text-[var(--text-subtle)]">
            Urheilijalla voi olla yksi aktiivinen ohjelma — valinta siirtää hänet tähän ohjelmaan.
          </p>
        </div>

        {workouts.map((workout) => (
          <div key={workout.uid} className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="flex items-center gap-2">
              <input
                className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-[15px] font-bold text-[var(--text)] outline-none focus-visible:border-[var(--accent)]"
                aria-label="Treenipäivän nimi"
                value={workout.title}
                onChange={(event) => updateWorkout(workout.uid, { title: event.target.value })}
              />
              <button
                type="button"
                className="grid size-10 shrink-0 place-items-center rounded-full text-[var(--danger)] transition hover:bg-[color:color-mix(in_oklab,var(--danger)_12%,var(--surface))]"
                aria-label={`Poista ${workout.title}`}
                onClick={() => removeWorkout(workout.uid)}
              >
                <Trash2 className="size-[18px]" aria-hidden="true" />
              </button>
            </div>

            {workout.exercises.length ? (
              <p className="mt-2.5 px-0.5 text-[11.5px] text-[var(--text-subtle)]">
                Sarjat × toistohaarukka — vedä numerosta tai napauta. · ~{estimatedMinutes(workout)} min
              </p>
            ) : (
              <p className="mt-3 px-0.5 text-[13px] text-[var(--text-subtle)]">Ei vielä liikkeitä.</p>
            )}

            {workout.exercises.map((exercise, index) => (
              <div
                key={exercise.uid}
                className={cn("py-2.5", index < workout.exercises.length - 1 ? "border-b border-[var(--border)]" : null)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    <span className="truncate text-sm font-bold text-[var(--text)]">{exercise.name}</span>
                    {exercise.isCustom ? (
                      <span className="shrink-0 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--accent)]">
                        Oma
                      </span>
                    ) : null}
                  </span>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      className={cn(
                        "grid size-8 place-items-center rounded-full transition",
                        openInstructionUid === exercise.uid || exercise.instruction?.trim()
                          ? "text-[var(--accent)]"
                          : "text-[var(--text-subtle)] hover:text-[var(--text)]",
                      )}
                      aria-label={`Ohje: ${exercise.name}`}
                      aria-expanded={openInstructionUid === exercise.uid}
                      onClick={() => setOpenInstructionUid((current) => (current === exercise.uid ? null : exercise.uid))}
                    >
                      <BookOpen className="size-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="grid size-8 place-items-center rounded-full text-[var(--text-subtle)] transition hover:text-[var(--danger)]"
                      aria-label={`Poista ${exercise.name}`}
                      onClick={() => removeExercise(workout.uid, exercise.uid)}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
                {openInstructionUid === exercise.uid ? (
                  <textarea
                    className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text)] outline-none focus-visible:border-[var(--accent)]"
                    rows={2}
                    placeholder="Ohje urheilijalle — esim. tekniikkavinkki tai tempo."
                    value={exercise.instruction ?? ""}
                    onChange={(event) => updateExercise(workout.uid, exercise.uid, { instruction: event.target.value })}
                  />
                ) : null}
                <div className="mt-1 grid grid-cols-[1fr_16px_1fr_16px_1fr] items-center gap-2">
                  <DragNumber
                    value={exercise.sets}
                    min={1}
                    ariaLabel={`${exercise.name} sarjat`}
                    onChange={(value) => updateExercise(workout.uid, exercise.uid, { sets: clampInt(value, 1, 10) })}
                  />
                  <span className="text-center text-sm text-[var(--text-subtle)]">×</span>
                  <DragNumber
                    value={exercise.repsMin}
                    min={1}
                    ariaLabel={`${exercise.name} toistot vähintään`}
                    onChange={(value) => {
                      const min = clampInt(value, 1, 30);
                      updateExercise(workout.uid, exercise.uid, { repsMin: min, repsMax: Math.max(min, exercise.repsMax) });
                    }}
                  />
                  <span className="text-center text-sm text-[var(--text-subtle)]">–</span>
                  <DragNumber
                    value={exercise.repsMax}
                    min={1}
                    ariaLabel={`${exercise.name} toistot enintään`}
                    onChange={(value) => {
                      const max = clampInt(value, 1, 30);
                      updateExercise(workout.uid, exercise.uid, { repsMax: max, repsMin: Math.min(max, exercise.repsMin) });
                    }}
                  />
                </div>
              </div>
            ))}

            <Button
              type="button"
              variant="secondary"
              className="mt-3 h-9 gap-2"
              onClick={() => {
                setPickerForWorkout(workout.uid);
                setPickerQuery("");
              }}
            >
              <Plus className="size-4" aria-hidden="true" />
              Lisää liike
            </Button>
          </div>
        ))}

        <Button type="button" variant="secondary" className="mt-3 w-full gap-2" onClick={addWorkout}>
          <Plus className="size-4" aria-hidden="true" />
          Lisää treenipäivä
        </Button>

        {error ? <p className="mt-3 text-sm font-semibold text-[var(--danger)]">{error}</p> : null}
      </div>

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[var(--background)] from-40% to-transparent px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-5">
        <Button type="button" variant="primary" className="w-full" loading={isSaving} loadingText="Tallennetaan…" onClick={handleSave}>
          {isNew ? "Luo ohjelma" : "Tallenna ohjelma"}
        </Button>
      </div>

      {pickerForWorkout ? (
        <div className="absolute inset-0 z-10 flex flex-col justify-end bg-[color:color-mix(in_srgb,var(--text)_45%,transparent)]">
          <button type="button" className="flex-1" aria-label="Sulje" onClick={closePicker} />
          <div className="max-h-[70%] overflow-y-auto rounded-t-3xl bg-[var(--surface)] p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-[var(--text)]">Lisää liike</h2>
              <button
                type="button"
                className="grid size-9 place-items-center rounded-full text-[var(--text-subtle)] transition hover:bg-[var(--surface-2)]"
                aria-label="Sulje"
                onClick={closePicker}
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <div className="relative mt-2">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-[var(--text-subtle)]" aria-hidden="true" />
              <input
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] py-2.5 pl-10 pr-3 text-[15px] text-[var(--text)] outline-none focus-visible:border-[var(--accent)]"
                placeholder="Hae tai nimeä uusi liike…"
                value={pickerQuery}
                onChange={(event) => setPickerQuery(event.target.value)}
              />
            </div>

            {/* Luo oma liike — kompakti rivi ilmestyy heti kun hakukenttään on kirjoitettu nimi. */}
            {pickerQuery.trim() ? (
              <div className="mt-2 flex items-center gap-2">
                <Select
                  aria-label="Oman liikkeen lihasryhmä"
                  className="h-10 min-w-0 flex-1"
                  value={newMuscle}
                  onChange={(event) => setNewMuscle(event.target.value as MuscleGroupKey | "")}
                >
                  <option value="">Lihasryhmä…</option>
                  {CUSTOM_MUSCLE_GROUP_OPTIONS.map((group) => (
                    <option key={group} value={group}>
                      {customMuscleGroupLabels[group]}
                    </option>
                  ))}
                </Select>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-10 shrink-0 gap-1.5 !border-[var(--accent)] !bg-[color-mix(in_srgb,var(--accent)_12%,var(--surface))] !text-[var(--accent)]"
                  onClick={addCustomExercise}
                >
                  <Plus className="size-4" aria-hidden="true" />
                  Luo liike
                </Button>
              </div>
            ) : null}

            <div className="mt-2 divide-y divide-[var(--border)]">
              {bankResults.map((exercise) => (
                <button
                  key={exercise.id}
                  type="button"
                  className="flex w-full items-center justify-between gap-3 py-3 text-left transition hover:opacity-80"
                  onClick={() => addExerciseFromBank(exercise)}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[var(--text)]">{exercise.name}</p>
                    <p className="truncate text-[12.5px] text-[var(--text-subtle)]">{exercise.category}</p>
                  </div>
                  <Plus className="size-5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
                </button>
              ))}
              {bankResults.length === 0 ? (
                <p className="py-3 text-[13.5px] text-[var(--text-subtle)]">Ei liikkeitä tällä haulla.</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
