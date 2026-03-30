"use client";

import { Check, ChevronDown, ChevronUp, Plus, Search } from "lucide-react";
import { useFieldArray, type Control, type UseFormRegister, type UseFormSetValue, type UseFormWatch } from "react-hook-form";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/field";
import { InfoTooltip } from "@/components/ui/tooltip";
import { splitLabel } from "@/lib/domain";
import { cn } from "@/lib/utils";

import {
  CUSTOM_EXERCISE_VALUE,
  CUSTOM_MUSCLE_GROUP_OPTIONS,
  emptyProgramWorkoutExercise,
  SUPERSET_GROUP_OPTIONS,
} from "@/components/workout/schemas";
import {
  customMuscleGroupLabels,
  type ProgramComposerFormValues,
  type ProgramComposerValues,
} from "@/components/workout/coach/program-composer";

function SearchableExerciseSelect({
  id,
  selectedExerciseId,
  exerciseOptions,
  onSelect,
}: {
  id: string;
  selectedExerciseId: string;
  exerciseOptions: Array<{ id: string; name: string; scope: string }>;
  onSelect: (exerciseId: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectedExercise = exerciseOptions.find((exercise) => exercise.id === selectedExerciseId);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
    }
  }, [isOpen]);

  const filteredExercises = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return exerciseOptions;
    }

    return exerciseOptions.filter((exercise) => exercise.name.toLowerCase().includes(normalizedQuery));
  }, [exerciseOptions, query]);

  const triggerLabel = selectedExerciseId === CUSTOM_EXERCISE_VALUE
    ? "Luo oma liike"
    : selectedExercise?.name ?? "Valitse liike";

  return (
    <div ref={rootRef} className="relative">
      <button
        id={id}
        type="button"
        className="flex w-full items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-left text-base text-[var(--text)] outline-none transition focus:border-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className={cn("truncate", !selectedExerciseId ? "text-[var(--text-subtle)]" : "")}>
          {triggerLabel}
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-[var(--text-subtle)] transition", isOpen ? "rotate-180" : "")} />
      </button>

      {isOpen ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[0_18px_45px_-24px_var(--shadow)]">
          <div className="border-b border-[var(--border)] p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-subtle)]" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Hae liikettä"
                className="pl-10"
              />
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto p-2">
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-xl border border-[var(--border)] bg-[color:color-mix(in_oklab,var(--accent)_7%,var(--surface))] px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              onClick={() => {
                onSelect(CUSTOM_EXERCISE_VALUE);
                setIsOpen(false);
              }}
            >
              <span>
                <span className="block text-sm font-semibold text-[var(--text)]">Luo oma liike</span>
                <span className="mt-1 block text-xs text-[var(--text-subtle)]">Käytä tätä, jos valmista liikettä ei löydy listasta.</span>
              </span>
              {selectedExerciseId === CUSTOM_EXERCISE_VALUE ? (
                <Check className="size-4 text-[var(--accent-strong)]" aria-hidden="true" />
              ) : null}
            </button>

            <div className="mt-2">
              {filteredExercises.length ? (
                filteredExercises.map((exercise) => (
                  <button
                    key={exercise.id}
                    type="button"
                    className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] hover:bg-[var(--surface-2)]"
                    onClick={() => {
                      onSelect(exercise.id);
                      setIsOpen(false);
                    }}
                  >
                    <span className="block min-w-0">
                      <span className="block truncate text-sm font-semibold text-[var(--text)]">{exercise.name}</span>
                      <span className="mt-1 block text-xs text-[var(--text-subtle)]">
                        {exercise.scope === "global" ? "Yhteinen liikepankki" : "Oma liikepankki"}
                      </span>
                    </span>
                    {selectedExerciseId === exercise.id ? (
                      <Check className="size-4 shrink-0 text-[var(--accent-strong)]" aria-hidden="true" />
                    ) : null}
                  </button>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-2)] px-3 py-4 text-sm text-[var(--text-muted)]">
                  Hakusanalla ei löytynyt liikettä. Voit valita yläpuolelta `Luo oma liike`.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function ProgramWorkoutEditor({
  fieldId,
  index,
  control,
  register,
  setValue,
  watch,
  exerciseOptions,
  onRemove,
  removable,
  allowExerciseRemoval,
  showWorkoutMeta = true,
}: {
  fieldId: string;
  index: number;
  control: Control<ProgramComposerFormValues, unknown, ProgramComposerValues>;
  register: UseFormRegister<ProgramComposerFormValues>;
  setValue: UseFormSetValue<ProgramComposerFormValues>;
  watch: UseFormWatch<ProgramComposerFormValues>;
  exerciseOptions: Array<{ id: string; name: string; scope: string }>;
  onRemove: () => void;
  removable: boolean;
  allowExerciseRemoval: boolean;
  showWorkoutMeta?: boolean;
}) {
  const exerciseFields = useFieldArray({
    control,
    name: `workouts.${index}.exercises` as const,
  });
  const defaultRestSeconds = watch(`workouts.${index}.defaultRestSeconds` as const);
  const selectedSplitType = watch(`workouts.${index}.splitType` as const);
  const [expandedExerciseIndex, setExpandedExerciseIndex] = useState<number>(-1);
  const previousExerciseCountRef = useRef(exerciseFields.fields.length);

  useEffect(() => {
    if (exerciseFields.fields.length > previousExerciseCountRef.current) {
      setExpandedExerciseIndex(exerciseFields.fields.length - 1);
    } else if (expandedExerciseIndex >= exerciseFields.fields.length) {
      setExpandedExerciseIndex(Math.max(0, exerciseFields.fields.length - 1));
    }

    previousExerciseCountRef.current = exerciseFields.fields.length;
  }, [exerciseFields.fields.length, expandedExerciseIndex]);

  return (
    <fieldset
      className="space-y-4 rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] p-4"
      data-program-workout="true"
      id={`program-workout-${fieldId}`}
    >
      <legend className="px-2 text-sm font-semibold text-[var(--text-subtle)]">
        Treeni {index + 1}
      </legend>

      {showWorkoutMeta ? (
        <div className="space-y-4">
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(15rem,1fr))]">
            <div>
              <Label htmlFor={`workout-${index}-split`}>Treenialue</Label>
              <Select id={`workout-${index}-split`} {...register(`workouts.${index}.splitType` as const)}>
                <option value="upper">Yläkroppa</option>
                <option value="lower">Alakroppa</option>
                <option value="full_body">Koko kroppa</option>
                <option value="custom">Muu</option>
              </Select>
            </div>
            {selectedSplitType === "custom" ? (
              <div>
                <Label htmlFor={`workout-${index}-name`}>Treenin nimi</Label>
                <Input
                  id={`workout-${index}-name`}
                  {...register(`workouts.${index}.nameOverride` as const)}
                  placeholder="Esim. Penkki + yläselkä"
                />
              </div>
            ) : null}
            <div>
              <div className="mb-1 flex items-center gap-1">
                <Label className="mb-0" htmlFor={`workout-${index}-default-rest`}>Oletuslepo (s)</Label>
                <InfoTooltip text="Tätä lepoa käytetään uuden liikkeen oletuksena. Voit säätää lepoa myös liikekohtaisesti." />
              </div>
              <Input
                id={`workout-${index}-default-rest`}
                type="number"
                min={15}
                max={600}
                {...register(`workouts.${index}.defaultRestSeconds` as const)}
              />
            </div>
          </div>
          <div className="mt-4">
            <div className="mb-1 flex items-center gap-1">
              <Label className="mb-0" htmlFor={`workout-${index}-guidance`}>Lyhyt treeniohje</Label>
              <InfoTooltip text="Näkyy treenin yleisohjeena. Pidä tämä tiiviinä: fokus, tempo, varat tai tärkein muistettava asia." />
            </div>
            <Textarea
              id={`workout-${index}-guidance`}
              {...register(`workouts.${index}.guidance` as const)}
              placeholder="Esim. Tee pääliikkeet rauhassa ensin, pidä 1-2 toistoa varaa ja hae loppuun puhdas tuntuma."
              rows={3}
            />
          </div>
        </div>
      ) : null}

      <div className="space-y-3">
        {exerciseFields.fields.map((exerciseField, exerciseIndex) => {
          const selectedExerciseId = watch(
            `workouts.${index}.exercises.${exerciseIndex}.exerciseId` as const,
          );
          const repMode = watch(
            `workouts.${index}.exercises.${exerciseIndex}.repMode` as const,
          );
          const setCount = watch(
            `workouts.${index}.exercises.${exerciseIndex}.setCount` as const,
          );
          const targetReps = watch(
            `workouts.${index}.exercises.${exerciseIndex}.targetReps` as const,
          );
          const targetRepsMin = watch(
            `workouts.${index}.exercises.${exerciseIndex}.targetRepsMin` as const,
          );
          const targetRepsMax = watch(
            `workouts.${index}.exercises.${exerciseIndex}.targetRepsMax` as const,
          );
          const restSeconds = watch(
            `workouts.${index}.exercises.${exerciseIndex}.restSeconds` as const,
          );
          const targetLoad = watch(
            `workouts.${index}.exercises.${exerciseIndex}.targetLoad` as const,
          );
          const customExerciseName = watch(
            `workouts.${index}.exercises.${exerciseIndex}.customExerciseName` as const,
          );
          const exerciseNameOverride = watch(
            `workouts.${index}.exercises.${exerciseIndex}.exerciseNameOverride` as const,
          );
          const exerciseName = selectedExerciseId === CUSTOM_EXERCISE_VALUE
            ? customExerciseName?.trim() || "Oma liike"
            : exerciseOptions.find((exercise) => exercise.id === selectedExerciseId)?.name
              ?? "Valitse liike";
          const resolvedExerciseLabel = exerciseNameOverride?.trim() || exerciseName;
          const repsLabel = repMode === "range"
            ? `${targetRepsMin || "?"}-${targetRepsMax || "?"}`
            : `${targetReps || "?"}`;
          const isExpanded = expandedExerciseIndex === exerciseIndex;

          return (
            <div
              key={exerciseField.id}
              className={cn(
                "overflow-hidden rounded-2xl border bg-[var(--surface)] shadow-[0_1px_0_0_var(--shadow-soft),0_8px_24px_-20px_var(--shadow)]",
                isExpanded
                  ? "border-[var(--accent-strong)] bg-[color:color-mix(in_oklab,var(--accent)_8%,var(--surface))]"
                  : "border-[var(--border)]",
              )}
            >
              <div
                className={cn(
                  "relative flex items-start gap-2 p-2",
                  isExpanded ? "border-b border-[var(--border)] bg-[color:color-mix(in_oklab,var(--accent)_10%,var(--surface))]" : "bg-[var(--surface)]",
                )}
              >
                <button
                  type="button"
                  aria-expanded={isExpanded}
                  aria-controls={`workout-${index}-exercise-panel-${exerciseIndex}`}
                  className="absolute inset-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-inset"
                  onClick={() => setExpandedExerciseIndex(isExpanded ? -1 : exerciseIndex)}
                />
                <div className="pointer-events-none relative z-10 min-w-0 flex-1 px-4 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[var(--text)]">Liike {exerciseIndex + 1}</p>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">{resolvedExerciseLabel}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 text-xs font-semibold text-[var(--text-subtle)]">
                        {setCount || "?"} sarjaa
                      </span>
                      <span className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 text-xs font-semibold text-[var(--text-subtle)]">
                        {repsLabel} toistoa
                      </span>
                      <span className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 text-xs font-semibold text-[var(--text-subtle)]">
                        {restSeconds || "?"} s lepo
                      </span>
                      {targetLoad !== undefined && targetLoad !== "" ? (
                        <span className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 text-xs font-semibold text-[var(--text-subtle)]">
                          {targetLoad} kg
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
                {exerciseFields.fields.length > 1 && allowExerciseRemoval ? (
                  <button
                    type="button"
                    className="relative z-10 shrink-0 self-center rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm font-semibold text-[var(--text-muted)] shadow-[0_1px_0_0_var(--shadow-soft)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]"
                    onClick={() => {
                      exerciseFields.remove(exerciseIndex);
                    }}
                  >
                    Poista
                  </button>
                ) : null}
                <button
                  type="button"
                  className="relative z-10 ml-auto inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center self-center rounded-xl border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] shadow-[0_1px_0_0_var(--shadow-soft)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]"
                  aria-expanded={isExpanded}
                  aria-controls={`workout-${index}-exercise-panel-${exerciseIndex}`}
                  onClick={() => setExpandedExerciseIndex(isExpanded ? -1 : exerciseIndex)}
                >
                  {isExpanded ? (
                    <ChevronUp className="size-4" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="size-4" aria-hidden="true" />
                  )}
                  <span className="sr-only">{isExpanded ? "Sulje liike" : "Avaa liike"}</span>
                </button>
              </div>

              {isExpanded ? (
                <>
                  <div
                    id={`workout-${index}-exercise-panel-${exerciseIndex}`}
                    className="grid gap-4 p-4 md:grid-cols-2"
                  >
                    <div>
                      <Label htmlFor={`workout-${index}-exercise-${exerciseIndex}`}>Liike</Label>
                      <SearchableExerciseSelect
                        id={`workout-${index}-exercise-${exerciseIndex}`}
                        selectedExerciseId={selectedExerciseId}
                        exerciseOptions={exerciseOptions}
                        onSelect={(exerciseId) => {
                          setValue(`workouts.${index}.exercises.${exerciseIndex}.exerciseId`, exerciseId, {
                            shouldDirty: true,
                            shouldValidate: true,
                          });
                        }}
                      />
                    </div>

                    {selectedExerciseId === CUSTOM_EXERCISE_VALUE ? (
                      <div className="grid gap-4">
                        <div>
                          <Label htmlFor={`workout-${index}-custom-${exerciseIndex}`}>Oman liikkeen nimi</Label>
                          <Input
                            id={`workout-${index}-custom-${exerciseIndex}`}
                            {...register(`workouts.${index}.exercises.${exerciseIndex}.customExerciseName` as const)}
                            placeholder="Esim. Landmine-punnerrus"
                          />
                        </div>
                        <div>
                          <Label htmlFor={`workout-${index}-custom-muscle-${exerciseIndex}`}>Lihasryhmä</Label>
                          <Select
                            id={`workout-${index}-custom-muscle-${exerciseIndex}`}
                            {...register(`workouts.${index}.exercises.${exerciseIndex}.customMuscleGroup` as const)}
                          >
                            <option value="">Valitse lihasryhmä</option>
                            {CUSTOM_MUSCLE_GROUP_OPTIONS.map((group) => (
                              <option key={group} value={group}>
                                {customMuscleGroupLabels[group]}
                              </option>
                            ))}
                          </Select>
                        </div>
                      </div>
                    ) : selectedExerciseId ? (
                      <div>
                        <Label htmlFor={`workout-${index}-nickname-${exerciseIndex}`}>
                          Liikkeen lempinimi (valinnainen)
                        </Label>
                        <Input
                          id={`workout-${index}-nickname-${exerciseIndex}`}
                          {...register(
                            `workouts.${index}.exercises.${exerciseIndex}.exerciseNameOverride` as const,
                          )}
                          placeholder="Esim. Penkki kilpailuotteella"
                        />
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-4 px-4">
                    <Label htmlFor={`workout-${index}-instruction-${exerciseIndex}`}>Valmennusohje</Label>
                    <Textarea
                      id={`workout-${index}-instruction-${exerciseIndex}`}
                      {...register(`workouts.${index}.exercises.${exerciseIndex}.instruction` as const)}
                      placeholder="Mitä treenaajan pitää muistaa tässä liikkeessä?"
                    />
                  </div>

                  <div className="mt-4 grid gap-4 px-4 [grid-template-columns:repeat(auto-fit,minmax(13rem,1fr))]">
                    <div>
                      <Label htmlFor={`workout-${index}-sets-${exerciseIndex}`}>Sarjat</Label>
                      <Input
                        id={`workout-${index}-sets-${exerciseIndex}`}
                        type="number"
                        min={1}
                        max={10}
                        {...register(`workouts.${index}.exercises.${exerciseIndex}.setCount` as const)}
                      />
                    </div>
                    <div>
                      <div className="mb-1 flex items-center gap-1">
                        <Label className="mb-0" htmlFor={`workout-${index}-superset-${exerciseIndex}`}>Superset</Label>
                        <InfoTooltip text="Anna sama kirjain liikkeille, jotka tehdään putkeen ilman pitkää lepoa." />
                      </div>
                      <Select
                        id={`workout-${index}-superset-${exerciseIndex}`}
                        {...register(`workouts.${index}.exercises.${exerciseIndex}.supersetGroup` as const)}
                      >
                        <option value="">Ei supersettiä</option>
                        {SUPERSET_GROUP_OPTIONS.map((group) => (
                          <option key={group} value={group}>
                            Superset {group}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <div className="mb-1 flex items-center gap-1">
                        <Label className="mb-0" htmlFor={`workout-${index}-rep-mode-${exerciseIndex}`}>Toistotyyli</Label>
                        <InfoTooltip text="Tarkka määrä = esimerkiksi 8 toistoa. Toistoalue = esimerkiksi 6-8 toistoa." />
                      </div>
                      <Select
                        id={`workout-${index}-rep-mode-${exerciseIndex}`}
                        {...register(`workouts.${index}.exercises.${exerciseIndex}.repMode` as const)}
                      >
                        <option value="exact">Tarkka määrä</option>
                        <option value="range">Toistoalue</option>
                      </Select>
                    </div>
                    {repMode === "range" ? (
                      <>
                        <div>
                          <div className="mb-1 flex items-center gap-1">
                            <Label className="mb-0" htmlFor={`workout-${index}-reps-min-${exerciseIndex}`}>Min. toistot</Label>
                            <InfoTooltip text="Alaraja toistoalueelle. Esim. 6-8 tarkoittaa että minimi on 6." />
                          </div>
                          <Input
                            id={`workout-${index}-reps-min-${exerciseIndex}`}
                            type="number"
                            min={1}
                            max={50}
                            {...register(`workouts.${index}.exercises.${exerciseIndex}.targetRepsMin` as const)}
                          />
                        </div>
                        <div>
                          <div className="mb-1 flex items-center gap-1">
                            <Label className="mb-0" htmlFor={`workout-${index}-reps-max-${exerciseIndex}`}>Max. toistot</Label>
                            <InfoTooltip text="Yläraja toistoalueelle. Kun kaikki sarjat osuvat maksimiin, kuormaa voidaan nostaa." />
                          </div>
                          <Input
                            id={`workout-${index}-reps-max-${exerciseIndex}`}
                            type="number"
                            min={1}
                            max={50}
                            {...register(`workouts.${index}.exercises.${exerciseIndex}.targetRepsMax` as const)}
                          />
                        </div>
                      </>
                    ) : (
                      <div>
                        <Label htmlFor={`workout-${index}-reps-${exerciseIndex}`}>Toistot</Label>
                        <Input
                          id={`workout-${index}-reps-${exerciseIndex}`}
                          type="number"
                          min={1}
                          max={50}
                          {...register(`workouts.${index}.exercises.${exerciseIndex}.targetReps` as const)}
                        />
                      </div>
                    )}
                    <div>
                      <div className="mb-1 flex items-center gap-1">
                        <Label className="mb-0" htmlFor={`workout-${index}-load-${exerciseIndex}`}>Kuorma (kg)</Label>
                        <InfoTooltip text="Suosituslähtökuorma sarjalle. Treenaaja voi kirjata toteutuneen kuorman erikseen." />
                      </div>
                      <Input
                        id={`workout-${index}-load-${exerciseIndex}`}
                        type="number"
                        min={0}
                        step="0.5"
                        {...register(`workouts.${index}.exercises.${exerciseIndex}.targetLoad` as const)}
                      />
                    </div>
                    <div>
                      <div className="mb-1 flex items-center gap-1">
                        <Label className="mb-0" htmlFor={`workout-${index}-rest-${exerciseIndex}`}>Lepo (s)</Label>
                        <InfoTooltip text="Lepo sarjojen välissä sekunteina. Ajastin käynnistyy treenaajalla sarjan kuittauksen jälkeen." />
                      </div>
                      <Input
                        id={`workout-${index}-rest-${exerciseIndex}`}
                        type="number"
                        min={15}
                        max={600}
                        {...register(`workouts.${index}.exercises.${exerciseIndex}.restSeconds` as const)}
                      />
                    </div>
                  </div>
                  <p className="mt-2 px-4 pb-4 text-xs text-[var(--text-subtle)]">
                    Aseta sama superset-kirjain liikkeille, jotka tehdään parina.
                  </p>
                </>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="secondary"
          onClick={() =>
            exerciseFields.append(
              emptyProgramWorkoutExercise(Number(defaultRestSeconds) || 180),
            )
          }
        >
          <Plus className="mr-2 size-4" />
          Lisää liike
        </Button>
      </div>

      <p className="text-xs text-[var(--text-subtle)]">
        Valittu treenialue: {splitLabel(watch(`workouts.${index}.splitType` as const))}
      </p>
    </fieldset>
  );
}
