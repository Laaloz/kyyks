"use client";

import { Plus } from "lucide-react";
import { useFieldArray, type Control, type UseFormRegister, type UseFormWatch } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/field";
import { InfoTooltip } from "@/components/ui/tooltip";
import { splitLabel } from "@/lib/domain";

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

export function ProgramWorkoutEditor({
  fieldId,
  index,
  control,
  register,
  watch,
  exerciseOptions,
  onRemove,
  removable,
  allowExerciseRemoval,
}: {
  fieldId: string;
  index: number;
  control: Control<ProgramComposerFormValues, unknown, ProgramComposerValues>;
  register: UseFormRegister<ProgramComposerFormValues>;
  watch: UseFormWatch<ProgramComposerFormValues>;
  exerciseOptions: Array<{ id: string; name: string; scope: string }>;
  onRemove: () => void;
  removable: boolean;
  allowExerciseRemoval: boolean;
}) {
  const exerciseFields = useFieldArray({
    control,
    name: `workouts.${index}.exercises` as const,
  });
  const defaultRestSeconds = watch(`workouts.${index}.defaultRestSeconds` as const);
  const selectedSplitType = watch(`workouts.${index}.splitType` as const);

  return (
    <fieldset
      className="space-y-4 rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] p-4"
      data-program-workout="true"
      id={`program-workout-${fieldId}`}
    >
      <legend className="px-2 text-sm font-semibold text-[var(--text-subtle)]">
        Treeni {index + 1}
      </legend>

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

      <div className="space-y-3">
        {exerciseFields.fields.map((exerciseField, exerciseIndex) => {
          const selectedExerciseId = watch(
            `workouts.${index}.exercises.${exerciseIndex}.exerciseId` as const,
          );
          const repMode = watch(
            `workouts.${index}.exercises.${exerciseIndex}.repMode` as const,
          );

          return (
            <div key={exerciseField.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface-3)] p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-[var(--text)]">Liike {exerciseIndex + 1}</p>
                {exerciseFields.fields.length > 1 && allowExerciseRemoval ? (
                  <Button type="button" variant="ghost" onClick={() => exerciseFields.remove(exerciseIndex)}>
                    Poista
                  </Button>
                ) : null}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor={`workout-${index}-exercise-${exerciseIndex}`}>Liike</Label>
                  <Select
                    id={`workout-${index}-exercise-${exerciseIndex}`}
                    {...register(`workouts.${index}.exercises.${exerciseIndex}.exerciseId` as const)}
                  >
                    <option value="">Valitse liike</option>
                    {exerciseOptions.map((exercise) => (
                      <option key={exercise.id} value={exercise.id}>
                        {exercise.name}
                      </option>
                    ))}
                    <option value={CUSTOM_EXERCISE_VALUE}>Muu liike</option>
                  </Select>
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

              <div className="mt-4">
                <Label htmlFor={`workout-${index}-instruction-${exerciseIndex}`}>Valmennusohje</Label>
                <Textarea
                  id={`workout-${index}-instruction-${exerciseIndex}`}
                  {...register(`workouts.${index}.exercises.${exerciseIndex}.instruction` as const)}
                  placeholder="Mitä treenaajan pitää muistaa tässä liikkeessä?"
                />
              </div>

              <div className="mt-4 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(13rem,1fr))]">
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
              <p className="mt-2 text-xs text-[var(--text-subtle)]">
                Aseta sama superset-kirjain liikkeille, jotka tehdään parina.
              </p>
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
        {removable ? (
          <Button type="button" variant="ghost" onClick={onRemove}>
            Poista treeni
          </Button>
        ) : null}
      </div>

      <p className="text-xs text-[var(--text-subtle)]">
        Valittu treenialue: {splitLabel(watch(`workouts.${index}.splitType` as const))}
      </p>
    </fieldset>
  );
}
