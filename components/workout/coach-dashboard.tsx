"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Activity,
  CircleCheckBig,
  ClipboardList,
  ClipboardPenLine,
  Plus,
} from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { useFieldArray, useForm, type Control, type UseFormRegister, type UseFormWatch } from "react-hook-form";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/field";
import { InfoTooltip } from "@/components/ui/tooltip";
import { splitLabel } from "@/lib/domain";
import type { AppState, ScheduledWorkoutStatus, WorkoutSession } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { useAppState } from "@/providers/app-state-provider";

import {
  CUSTOM_EXERCISE_VALUE,
  emptyProgramWorkout,
  emptyProgramWorkoutExercise,
  inviteSchema,
  programComposerSchema,
  SUPERSET_GROUP_OPTIONS,
} from "@/components/workout/schemas";
import { scheduledStatusLabel, type WorkspaceView } from "@/components/workout/shared";

type ProgramComposerValues = z.infer<typeof programComposerSchema>;

export function CoachDashboard({ view }: { view: WorkspaceView }) {
  const {
    currentUser,
    state,
    createProgram,
    updateProgram,
    getCoachAthletes,
  } = useAppState();
  const formId = useId();
  const [programMessage, setProgramMessage] = useState<string>("");
  const [editingProgramId, setEditingProgramId] = useState<string | null>(null);
  const [selectedAthleteId, setSelectedAthleteId] = useState<string>("");

  const athletes = currentUser ? getCoachAthletes(currentUser.id) : [];
  const coachPrograms = state.plans.filter(
    (plan) => plan.coachId === currentUser?.id && Boolean(plan.workouts?.length),
  );

  useEffect(() => {
    if (!athletes.length) {
      setSelectedAthleteId("");
      return;
    }

    if (!athletes.some((athlete) => athlete.id === selectedAthleteId)) {
      setSelectedAthleteId(athletes[0]?.id ?? "");
    }
  }, [athletes, selectedAthleteId]);

  const exerciseOptions = useMemo(
    () =>
      state.exercises.filter(
        (exercise) => exercise.scope === "global" || exercise.coachId === currentUser?.id,
      ).sort((a, b) => a.name.localeCompare(b.name, "fi")),
    [state.exercises, currentUser],
  );

  const form = useForm<ProgramComposerValues>({
    resolver: zodResolver(programComposerSchema),
    defaultValues: {
      title: "",
      athleteId: athletes[0]?.id ?? "",
      workouts: [emptyProgramWorkout("custom")],
    },
  });

  const workoutFields = useFieldArray({
    control: form.control,
    name: "workouts",
  });

  const isEditingProgram = Boolean(editingProgramId);
  const editorTitle = isEditingProgram ? "Muokkaa treeniohjelmaa" : "Uusi treeniohjelma";
  const editorDescription = isEditingProgram
    ? "Päivitä ohjelman harjoitukset, liikkeet ja kuormitus. Treenaajaa ei voi vaihtaa muokkaustilassa."
    : "Luo ohjelma kokonaisuutena: lisää harjoitukset ja valitse liikkeet valmiista pankista tai customina.";

  const resetComposer = (athleteId: string) => {
    form.reset({
      title: "",
      athleteId,
      workouts: [emptyProgramWorkout("custom")],
    });
    setEditingProgramId(null);
  };

  return (
    <div className="grid gap-6">
      {view === "overview" ? (
        <CoachAthleteInsights
          athletes={athletes}
          coachId={currentUser?.id}
          selectedAthleteId={selectedAthleteId}
          onSelectAthlete={setSelectedAthleteId}
          state={state}
        />
      ) : null}

      {view === "templates" && (
        <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
          <Card className="border-[var(--border-strong)]" id="coach-program-composer">
            <p className="text-xs font-semibold text-[var(--text-subtle)]">Program composer</p>
            <CardTitle className="text-2xl">{editorTitle}</CardTitle>
            <CardDescription className="mt-2">{editorDescription}</CardDescription>
            {isEditingProgram ? (
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
                <Badge>Muokkaustila</Badge>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    resetComposer(form.getValues("athleteId"));
                    setProgramMessage("Palasit uuden ohjelman luontiin.");
                  }}
                >
                  Luo uusi ohjelma
                </Button>
              </div>
            ) : null}

            <form
              className="mt-6 space-y-5"
              onSubmit={form.handleSubmit((values) => {
                const payloadWorkouts = mapComposerWorkouts(values.workouts);
                const result = isEditingProgram && editingProgramId
                  ? updateProgram(editingProgramId, {
                      title: values.title,
                      workouts: payloadWorkouts,
                    })
                  : createProgram({
                      title: values.title,
                      athleteId: values.athleteId,
                      workouts: payloadWorkouts,
                    });

                if (!result.ok) {
                  setProgramMessage(result.message);
                  return;
                }

                if (isEditingProgram) {
                  setProgramMessage(
                    `Ohjelma "${values.title}" päivitettiin. Lomake palautettiin uuden ohjelman luontiin.`,
                  );
                  resetComposer(values.athleteId);
                  return;
                }

                setProgramMessage(`Ohjelma "${values.title}" tallennettiin.`);
                resetComposer(values.athleteId);
              })}
            >
              <fieldset className="space-y-4 rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] p-4">
                <legend className="px-2 text-sm font-medium text-[var(--text-subtle)]">
                  Ohjelman tiedot
                </legend>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label htmlFor={`${formId}-title`}>Ohjelman nimi</Label>
                    <Input id={`${formId}-title`} {...form.register("title")} placeholder="Esim. Ylä-ala-kokokroppa ohjelma" />
                  </div>
                  <div>
                    <Label htmlFor={`${formId}-athlete`}>Treenaaja</Label>
                    <Select id={`${formId}-athlete`} {...form.register("athleteId")} disabled={isEditingProgram}>
                      <option value="">Valitse treenaaja</option>
                      {athletes.map((athlete) => (
                        <option key={athlete.id} value={athlete.id}>
                          {athlete.fullName}
                        </option>
                      ))}
                    </Select>
                    {isEditingProgram ? (
                      <p className="mt-1 text-xs text-[var(--text-subtle)]">
                        Treenaajaa ei voi vaihtaa olemassa olevalle ohjelmalle.
                      </p>
                    ) : null}
                  </div>
                </div>
              </fieldset>

              <div className="space-y-4">
                {workoutFields.fields.map((field, index) => (
                  <ProgramWorkoutEditor
                    key={field.id}
                    fieldId={field.id}
                    index={index}
                    control={form.control}
                    register={form.register}
                    watch={form.watch}
                    exerciseOptions={exerciseOptions}
                    onRemove={() => workoutFields.remove(index)}
                    removable={workoutFields.fields.length > 1 && !isEditingProgram}
                    allowExerciseRemoval={!isEditingProgram}
                  />
                ))}
              </div>

              <div className="rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--surface-2)] p-4">
                <p className="text-sm text-[var(--text-muted)]">
                  Lisää uusi harjoitus ohjelman loppuun. Uusi harjoitus avautuu automaattisesti näkyviin.
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  className="mt-3"
                  onClick={() => {
                    workoutFields.append(emptyProgramWorkout("custom"));
                    window.requestAnimationFrame(() => {
                      const cards = document.querySelectorAll<HTMLElement>("[data-program-workout='true']");
                      const latest = cards[cards.length - 1];
                      if (!latest) {
                        return;
                      }
                      latest.scrollIntoView({ behavior: "smooth", block: "start" });
                      const firstField = latest.querySelector<HTMLElement>("select, input, textarea, button");
                      firstField?.focus();
                    });
                  }}
                >
                  <Plus className="mr-2 size-4" />
                  Lisää harjoitus loppuun
                </Button>
                {isEditingProgram ? (
                  <p className="mt-2 text-xs text-[var(--text-subtle)]">
                    Muokkaustilassa poistot ovat pois päältä, jotta aiemmat treeniviittaukset säilyvät ehjinä.
                  </p>
                ) : null}
              </div>

              <p
                aria-live="polite"
                className={`min-h-5 text-sm ${
                  !programMessage
                    ? "text-[var(--text-subtle)]"
                    : programMessage.includes("tallennettiin") ||
                      programMessage.includes("päivitettiin") ||
                      programMessage.includes("Palasit")
                    ? "text-[var(--success)]"
                    : "text-[var(--danger)]"
                }`}
              >
                {programMessage}
              </p>
              <div className="flex flex-wrap gap-3">
                <Button type="submit" className="w-full sm:w-auto">
                  {isEditingProgram ? "Tallenna muutokset" : "Tallenna ohjelma"}
                </Button>
                {isEditingProgram ? (
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full sm:w-auto"
                    onClick={() => {
                      resetComposer(form.getValues("athleteId"));
                      setProgramMessage("");
                    }}
                  >
                    Peru muokkaus
                  </Button>
                ) : null}
              </div>
            </form>
          </Card>

          <div className="grid gap-6">
            <Card>
              <p className="text-xs font-semibold text-[var(--text-subtle)]">Program library</p>
              <CardTitle className="text-2xl">Luodut ohjelmat</CardTitle>
              <CardDescription className="mt-2">
                Avaa ohjelma muokattavaksi ja päivitä rakenne yhdestä paikasta.
              </CardDescription>
              <div className="mt-5 grid gap-4">
                {coachPrograms.map((program) => {
                  const athleteName =
                    state.users.find((user) => user.id === program.athleteId)?.fullName ?? "Treenaaja";
                  const isActiveEditorTarget = editingProgramId === program.id;

                  return (
                    <div key={program.id} className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-[var(--text)]">{program.title}</p>
                          <p className="text-sm text-[var(--text-muted)]">{athleteName}</p>
                        </div>
                        <Badge>{program.workouts?.length ?? 0} harjoitusta</Badge>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {(program.workouts ?? []).map((workout) => (
                          <Badge key={workout.id}>{workout.name}</Badge>
                        ))}
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <Button
                          type="button"
                          variant={isActiveEditorTarget ? "secondary" : "ghost"}
                          onClick={() => {
                            form.reset(buildProgramComposerValues(program, state.exercises));
                            setEditingProgramId(program.id);
                            setProgramMessage("");
                            window.requestAnimationFrame(() => {
                              const composer = document.getElementById("coach-program-composer");
                              composer?.scrollIntoView({ behavior: "smooth", block: "start" });
                            });
                          }}
                        >
                          {isActiveEditorTarget ? "Muokkaus auki" : "Muokkaa ohjelmaa"}
                        </Button>
                        {isActiveEditorTarget ? <Badge>Aktiivinen</Badge> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        </div>
      )}

      {view === "invites" ? <CoachInvitePanel /> : null}
    </div>
  );
}

function mapComposerWorkouts(workouts: ProgramComposerValues["workouts"]) {
  return workouts.map((workout) => ({
    splitType: workout.splitType,
    nameOverride: workout.nameOverride,
    defaultRestSeconds: workout.defaultRestSeconds,
    exercises: workout.exercises.map((exercise) => ({
      repMode: exercise.repMode,
      exerciseId: exercise.exerciseId,
      exerciseNameOverride: exercise.exerciseNameOverride,
      customExerciseName: exercise.customExerciseName,
      supersetGroup: exercise.supersetGroup || undefined,
      instruction: exercise.instruction,
      setCount: exercise.setCount,
      targetReps:
        exercise.repMode === "range"
          ? (exercise.targetRepsMin ?? exercise.targetReps)
          : exercise.targetReps,
      targetRepsMin:
        exercise.repMode === "range" ? exercise.targetRepsMin : undefined,
      targetRepsMax:
        exercise.repMode === "range" ? exercise.targetRepsMax : undefined,
      targetLoad: exercise.targetLoad,
      restSeconds: exercise.restSeconds,
      notes: exercise.notes,
    })),
  }));
}

function buildProgramComposerValues(
  program: AppState["plans"][number],
  exercises: AppState["exercises"],
): ProgramComposerValues {
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));

  return {
    title: program.title,
    athleteId: program.athleteId,
    workouts: (program.workouts ?? []).map((workout) => ({
      splitType: workout.splitType,
      nameOverride: workout.name,
      defaultRestSeconds: workout.defaultRestSeconds,
      exercises: (workout.exercises.length ? workout.exercises : [null]).map((exerciseItem) => {
        if (!exerciseItem) {
          return emptyProgramWorkoutExercise(workout.defaultRestSeconds);
        }

        const sourceExercise = exerciseItem.exerciseId
          ? exerciseById.get(exerciseItem.exerciseId)
          : undefined;
        const isCustomExercise = !exerciseItem.exerciseId || !sourceExercise;
        const exerciseNameOverride =
          !isCustomExercise && sourceExercise && sourceExercise.name !== exerciseItem.exerciseName
            ? exerciseItem.exerciseName
            : "";
        const firstSet = exerciseItem.sets[0];
        const targetReps = firstSet?.targetReps ?? 8;
        const hasRangeTarget =
          firstSet?.targetRepsMin !== undefined &&
          firstSet?.targetRepsMax !== undefined;

        return {
          exerciseId: isCustomExercise
            ? CUSTOM_EXERCISE_VALUE
            : (exerciseItem.exerciseId ?? CUSTOM_EXERCISE_VALUE),
          exerciseNameOverride,
          customExerciseName: isCustomExercise ? exerciseItem.exerciseName : "",
          supersetGroup: exerciseItem.supersetGroup ?? "",
          instruction: exerciseItem.instruction,
          repMode: hasRangeTarget ? "range" : "exact",
          setCount: Math.max(exerciseItem.sets.length, 1),
          targetReps,
          targetRepsMin: hasRangeTarget
            ? (firstSet?.targetRepsMin ?? targetReps)
            : targetReps,
          targetRepsMax: hasRangeTarget
            ? (firstSet?.targetRepsMax ?? targetReps)
            : targetReps,
          targetLoad: firstSet?.targetLoad,
          restSeconds: firstSet?.restSeconds ?? workout.defaultRestSeconds,
          notes: firstSet?.notes ?? "",
        };
      }),
    })),
  };
}

function ProgramWorkoutEditor({
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
  control: Control<ProgramComposerValues>;
  register: UseFormRegister<ProgramComposerValues>;
  watch: UseFormWatch<ProgramComposerValues>;
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

  return (
    <fieldset
      className="space-y-4 rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] p-4"
      data-program-workout="true"
      id={`program-workout-${fieldId}`}
    >
      <legend className="px-2 text-sm font-semibold text-[var(--text-subtle)]">
        Harjoitus {index + 1}
      </legend>

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(15rem,1fr))]">
        <div>
          <Label htmlFor={`workout-${index}-split`}>Jako</Label>
          <Select id={`workout-${index}-split`} {...register(`workouts.${index}.splitType` as const)}>
            <option value="upper">Yläkroppa</option>
            <option value="lower">Alakroppa</option>
            <option value="full_body">Koko kroppa</option>
            <option value="custom">Custom</option>
          </Select>
        </div>
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
                    <option value={CUSTOM_EXERCISE_VALUE}>Muu (custom)</option>
                  </Select>
                </div>

                {selectedExerciseId === CUSTOM_EXERCISE_VALUE ? (
                  <div>
                    <Label htmlFor={`workout-${index}-custom-${exerciseIndex}`}>Custom-liikkeen nimi</Label>
                    <Input
                      id={`workout-${index}-custom-${exerciseIndex}`}
                      {...register(`workouts.${index}.exercises.${exerciseIndex}.customExerciseName` as const)}
                      placeholder="Esim. Landmine press"
                    />
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
                        <Label className="mb-0" htmlFor={`workout-${index}-reps-min-${exerciseIndex}`}>Min toistot</Label>
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
                        <Label className="mb-0" htmlFor={`workout-${index}-reps-max-${exerciseIndex}`}>Max toistot</Label>
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
              emptyProgramWorkoutExercise(Number(defaultRestSeconds) || 90),
            )
          }
        >
          <Plus className="mr-2 size-4" />
          Lisää liike
        </Button>
        {removable ? (
          <Button type="button" variant="ghost" onClick={onRemove}>
            Poista harjoitus
          </Button>
        ) : null}
      </div>

      <p className="text-xs text-[var(--text-subtle)]">
        Oletusjako: {splitLabel(watch(`workouts.${index}.splitType` as const))}
      </p>
    </fieldset>
  );
}

function CoachAthleteInsights({
  athletes,
  coachId,
  selectedAthleteId,
  onSelectAthlete,
  state,
}: {
  athletes: Array<{ id: string; fullName: string }>;
  coachId?: string;
  selectedAthleteId: string;
  onSelectAthlete: (athleteId: string) => void;
  state: AppState;
}) {
  const selectedAthlete = athletes.find((athlete) => athlete.id === selectedAthleteId) ?? null;
  const now = new Date();
  const lastThirtyDays = new Date(now);
  lastThirtyDays.setDate(lastThirtyDays.getDate() - 30);

  const athleteWorkouts = useMemo(() => {
    if (!coachId || !selectedAthleteId) {
      return [];
    }

    return state.scheduledWorkouts
      .filter(
        (workout) => workout.coachId === coachId && workout.athleteId === selectedAthleteId,
      )
      .sort(
        (a, b) =>
          new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime(),
      );
  }, [coachId, selectedAthleteId, state.scheduledWorkouts]);

  const sessionByWorkoutId = useMemo(() => {
    const map = new Map<string, WorkoutSession>();
    state.sessions
      .filter((session) => session.athleteId === selectedAthleteId)
      .forEach((session) => {
        map.set(session.scheduledWorkoutId, session);
      });
    return map;
  }, [selectedAthleteId, state.sessions]);

  const noteBySessionId = useMemo(() => {
    const map = new Map<string, string>();
    state.notes
      .filter(
        (note) =>
          note.athleteId === selectedAthleteId &&
          (!coachId || note.coachId === coachId),
      )
      .forEach((note) => {
        map.set(note.sessionId, note.body);
      });
    return map;
  }, [coachId, selectedAthleteId, state.notes]);

  const recentRows = useMemo(() => {
    return athleteWorkouts.slice(0, 8).map((workout) => {
      const session = sessionByWorkoutId.get(workout.id);
      const completedSets = session
        ? session.setLogs.filter((log) => log.done).length
        : 0;
      const totalSets = session?.setLogs.length ?? 0;
      const volume = session ? getSessionVolume(session) : 0;
      const completedAt =
        workout.completedAt ??
        session?.completedAt ??
        workout.updatedAt ??
        workout.scheduledDate;
      const note = session ? noteBySessionId.get(session.id) : undefined;

      return {
        id: workout.id,
        title: workout.title,
        status: workout.status,
        completedSets,
        totalSets,
        volume,
        completedAt,
        note,
      };
    });
  }, [athleteWorkouts, noteBySessionId, sessionByWorkoutId]);

  const completedRows = useMemo(() => {
    return athleteWorkouts
      .map((workout) => {
        const session = sessionByWorkoutId.get(workout.id);
        if (!session || workout.status !== "completed") {
          return null;
        }

        const completedAt = workout.completedAt ?? session.completedAt ?? workout.updatedAt;
        return {
          id: workout.id,
          completedAt,
          volume: getSessionVolume(session),
        };
      })
      .filter((item): item is { id: string; completedAt: string; volume: number } => Boolean(item))
      .sort((a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime());
  }, [athleteWorkouts, sessionByWorkoutId]);

  const completedLastThirtyDays = athleteWorkouts.filter(
    (workout) =>
      workout.status === "completed" &&
      new Date(workout.scheduledDate).getTime() >= lastThirtyDays.getTime(),
  ).length;
  const scheduledLastThirtyDays = athleteWorkouts.filter(
    (workout) => new Date(workout.scheduledDate).getTime() >= lastThirtyDays.getTime(),
  ).length;
  const completionRateLastThirtyDays = scheduledLastThirtyDays
    ? Math.round((completedLastThirtyDays / scheduledLastThirtyDays) * 100)
    : 0;

  const averageVolume = completedRows.length
    ? Math.round(
        completedRows.reduce((sum, row) => sum + row.volume, 0) / completedRows.length,
      )
    : 0;
  const lastNoteDate = state.notes
    .filter(
      (note) =>
        note.athleteId === selectedAthleteId &&
        (!coachId || note.coachId === coachId),
    )
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0]?.updatedAt;

  const volumeTrendPoints = completedRows.slice(-10).map((row) => ({
    label: shortDate(row.completedAt),
    value: row.volume,
  }));

  const phaseBars = buildPhaseBars(athleteWorkouts, 8);

  if (!athletes.length) {
    return (
      <Card>
        <CardTitle className="text-2xl">Treenaajan seuranta</CardTitle>
        <CardDescription className="mt-2">
          Lisää ensin treenaajia rosteriin, niin näet treenien tarkat suoritus- ja kehitystiedot.
        </CardDescription>
      </Card>
    );
  }

  return (
    <Card className="border-[var(--border-strong)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Athlete analytics</p>
          <CardTitle className="text-2xl">Treenaajan kehitys ja toteuma</CardTitle>
          <CardDescription className="mt-2">
            Seuraa toteumaa, valmennusmuistiinpanoja ja kehityksen suuntaa yhdestä paikasta.
          </CardDescription>
        </div>
        <div className="w-full lg:w-72">
          <Label htmlFor="coach-athlete-insight-select">Treenaaja</Label>
          <Select
            id="coach-athlete-insight-select"
            value={selectedAthleteId}
            onChange={(event) => onSelectAthlete(event.target.value)}
          >
            {athletes.map((athlete) => (
              <option key={athlete.id} value={athlete.id}>
                {athlete.fullName}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {selectedAthlete ? (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <InsightMetric
              label="30 pv completion"
              value={`${completionRateLastThirtyDays}%`}
              hint={`${completedLastThirtyDays}/${scheduledLastThirtyDays} treeniä`}
              icon={CircleCheckBig}
            />
            <InsightMetric
              label="Valmiit treenit"
              value={completedRows.length}
              hint="Koko historian valmiit"
              icon={ClipboardList}
            />
            <InsightMetric
              label="Keskivolyymi"
              value={averageVolume}
              hint="kg x toistot / valmis treeni"
              icon={Activity}
            />
            <InsightMetric
              label="Viimeisin muistiinpano"
              value={lastNoteDate ? formatDate(lastNoteDate) : "Ei vielä"}
              hint="Valmentajan ja treenaajan kirjaama"
              icon={ClipboardPenLine}
            />
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
              <p className="text-sm font-semibold text-[var(--text)]">Kehitysgraafi (volyymi)</p>
              <p className="mt-1 text-xs text-[var(--text-subtle)]">Viimeiset 10 valmista treeniä</p>
              <TrendChart points={volumeTrendPoints} />
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
              <p className="text-sm font-semibold text-[var(--text)]">Vaihejakauma 8 viikolta</p>
              <p className="mt-1 text-xs text-[var(--text-subtle)]">
                Kuinka paljon treenejä ollut vaiheissa ajastettu, kesken ja valmis.
              </p>
              <PhaseBars bars={phaseBars} />
            </div>
          </div>

          <div className="mt-5">
            <p className="text-sm font-semibold text-[var(--text)]">Viimeisimmät treenit ja muistiinpanot</p>
            <div className="mt-3 grid gap-3">
              {recentRows.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">Treenejä ei vielä löytynyt valitulle treenaajalle.</p>
              ) : (
                recentRows.map((row) => (
                  <div key={row.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-[var(--text)]">{row.title}</p>
                        <p className="text-sm text-[var(--text-muted)]">
                          {formatDate(row.completedAt)} · {row.completedSets}/{row.totalSets || 0} sarjaa
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={coachStatusTone(row.status)}>
                          {scheduledStatusLabel(row.status)}
                        </Badge>
                        <Badge>{Math.round(row.volume)} volyymi</Badge>
                      </div>
                    </div>
                    {row.note ? (
                      <p className="mt-2 text-sm text-[var(--text-subtle)]">
                        Muistiinpano: {truncateText(row.note, 200)}
                      </p>
                    ) : (
                      <p className="mt-2 text-sm text-[var(--text-subtle)]">
                        Ei muistiinpanoa tästä treenistä.
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      ) : null}
    </Card>
  );
}

function InsightMetric({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  hint: string;
  icon: typeof Activity;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.03em] text-[var(--text-subtle)]">{label}</p>
          <p className="mt-2 font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--text)]">
            {value}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2.5">
          <Icon className="size-4 text-[var(--accent)]" />
        </div>
      </div>
      <p className="mt-2 text-xs text-[var(--text-subtle)]">{hint}</p>
    </div>
  );
}

function TrendChart({ points }: { points: Array<{ label: string; value: number }> }) {
  if (points.length === 0) {
    return <p className="mt-3 text-sm text-[var(--text-muted)]">Ei valmiita treenejä graafiin vielä.</p>;
  }

  const maxValue = Math.max(...points.map((point) => point.value), 1);
  const mapped = points.map((point, index) => {
    const x = points.length === 1 ? 50 : (index / (points.length - 1)) * 100;
    const y = 46 - (point.value / maxValue) * 40;
    return { ...point, x, y };
  });
  const polyline = mapped.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <div className="mt-3">
      <svg className="h-40 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2" viewBox="0 0 100 50" preserveAspectRatio="none" role="img" aria-label="Kehitystrendi">
        <polyline
          points={polyline}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1.8"
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {mapped.map((point) => (
          <circle
            key={`${point.label}-${point.x}`}
            cx={point.x}
            cy={point.y}
            r="1.6"
            fill="var(--surface)"
            stroke="var(--accent)"
            strokeWidth="1.2"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <div className="mt-2 grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(4.2rem,1fr))]">
        {points.map((point) => (
          <div key={`${point.label}-${point.value}`} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-center">
            <p className="text-[11px] text-[var(--text-subtle)]">{point.label}</p>
            <p className="text-xs font-semibold text-[var(--text)]">{Math.round(point.value)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function PhaseBars({
  bars,
}: {
  bars: Array<{ label: string; scheduled: number; inProgress: number; completed: number }>;
}) {
  if (bars.length === 0) {
    return <p className="mt-3 text-sm text-[var(--text-muted)]">Ei vaihedataa vielä.</p>;
  }

  return (
    <div className="mt-3 grid gap-2">
      {bars.map((bar) => {
        const total = bar.scheduled + bar.inProgress + bar.completed;
        const scheduledWidth = total ? (bar.scheduled / total) * 100 : 0;
        const inProgressWidth = total ? (bar.inProgress / total) * 100 : 0;
        const completedWidth = total ? (bar.completed / total) * 100 : 0;

        return (
          <div key={bar.label} className="grid gap-1">
            <div className="flex items-center justify-between text-xs text-[var(--text-subtle)]">
              <span>{bar.label}</span>
              <span>{total} treeniä</span>
            </div>
            <div className="flex h-3 overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface)]">
              <div className="bg-[var(--border-strong)]" style={{ width: `${scheduledWidth}%` }} />
              <div className="bg-[var(--accent)]" style={{ width: `${inProgressWidth}%` }} />
              <div className="bg-[var(--accent-tertiary)]" style={{ width: `${completedWidth}%` }} />
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] text-[var(--text-subtle)]">
              <span>Ajastettu {bar.scheduled}</span>
              <span>Kesken {bar.inProgress}</span>
              <span>Valmis {bar.completed}</span>
            </div>
          </div>
        );
      })}
      <div className="mt-1 flex flex-wrap gap-2 text-xs text-[var(--text-subtle)]">
        <Badge className="border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text-subtle)]">Ajastettu</Badge>
        <Badge className="border-[var(--accent)] bg-[var(--surface)] text-[var(--accent)]">Kesken</Badge>
        <Badge className="border-[var(--accent-tertiary)] bg-[var(--surface)] text-[var(--accent-tertiary)]">Valmis</Badge>
      </div>
    </div>
  );
}

function getSessionVolume(session: WorkoutSession) {
  return session.setLogs.reduce((sum, log) => {
    if (!log.done) {
      return sum;
    }
    const reps = log.actualReps ?? 0;
    const load = log.actualLoad ?? log.targetLoad ?? 0;
    return sum + reps * load;
  }, 0);
}

function buildPhaseBars(workouts: AppState["scheduledWorkouts"], weeks: number) {
  const thisWeekStart = startOfWeek(new Date());
  const weekStarts = Array.from({ length: weeks }, (_, index) => {
    const weekStart = addDays(thisWeekStart, (index - (weeks - 1)) * 7);
    return weekStart;
  });
  const byWeek = new Map(
    weekStarts.map((weekStart) => [
      localDateKey(weekStart),
      {
        label: shortDate(weekStart),
        scheduled: 0,
        inProgress: 0,
        completed: 0,
      },
    ]),
  );

  workouts.forEach((workout) => {
    const key = localDateKey(startOfWeek(new Date(workout.scheduledDate)));
    const bucket = byWeek.get(key);
    if (!bucket) {
      return;
    }

    if (workout.status === "scheduled") {
      bucket.scheduled += 1;
      return;
    }
    if (workout.status === "in_progress") {
      bucket.inProgress += 1;
      return;
    }
    bucket.completed += 1;
  });

  return Array.from(byWeek.values());
}

function shortDate(value: string | Date) {
  return new Intl.DateTimeFormat("fi-FI", {
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(value));
}

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfWeek(date: Date) {
  const next = new Date(date);
  const day = (next.getDay() + 6) % 7;
  next.setDate(next.getDate() - day);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function coachStatusTone(status: ScheduledWorkoutStatus) {
  if (status === "completed") {
    return "border-[var(--accent-tertiary)] bg-[var(--surface)] text-[var(--accent-tertiary)]";
  }

  if (status === "in_progress") {
    return "border-[var(--accent)] bg-[var(--surface)] text-[var(--accent)]";
  }

  return "border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text-subtle)]";
}

function truncateText(value: string, length: number) {
  if (value.length <= length) {
    return value;
  }
  return `${value.slice(0, length).trimEnd()}...`;
}

function CoachInvitePanel() {
  const { currentUser, createInvite, getCoachAthletes, state } = useAppState();
  const formId = useId();
  const [inviteMessage, setInviteMessage] = useState<string>("");
  const athletes = currentUser ? getCoachAthletes(currentUser.id) : [];
  const form = useForm<z.infer<typeof inviteSchema>>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      email: "",
      role: "athlete",
      coachId: currentUser?.id ?? "",
    },
  });

  return (
    <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
      <Card>
        <CardTitle>Kutsu uusi treenaaja</CardTitle>
        <CardDescription className="mt-2">
          Coach voi lisätä oman asiakkaansa suoraan palveluun. Kutsu muodostaa samalla valmentaja-treenaaja-suhteen.
        </CardDescription>
        <form
          className="mt-6 space-y-4"
          onSubmit={form.handleSubmit((values) => {
            const result = createInvite({
              email: values.email,
              role: "athlete",
              coachId: currentUser?.id,
            });
            setInviteMessage(result.ok ? `Kutsu lähetettiin osoitteeseen ${values.email}.` : result.message);
            if (result.ok) {
              form.reset({ email: "", role: "athlete", coachId: currentUser?.id });
            }
          })}
        >
          <div>
            <Label htmlFor={`${formId}-coach-athlete-email`}>Treenaajan sähköposti</Label>
            <Input
              id={`${formId}-coach-athlete-email`}
              autoComplete="email"
              {...form.register("email")}
              placeholder="asiakas@example.com"
            />
          </div>
          <p
            aria-live="polite"
            className={`min-h-5 text-sm ${inviteMessage.includes("lähetettiin") ? "text-[var(--success)]" : "text-[var(--danger)]"}`}
          >
            {inviteMessage}
          </p>
          <Button type="submit" className="w-full">
            Lähetä kutsu treenaajalle
          </Button>
        </form>
      </Card>

      <Card>
        <CardTitle>Rosteri</CardTitle>
        <div className="mt-5 grid gap-3">
          {athletes.map((athlete) => (
            <div key={athlete.id} className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-[var(--text)]">{athlete.fullName}</p>
                  <p className="text-sm text-[var(--text-muted)]">{athlete.email}</p>
                </div>
                <Badge>
                  {
                    state.scheduledWorkouts.filter(
                      (workout) => workout.athleteId === athlete.id && workout.status !== "completed",
                    ).length
                  }{" "}
                  avointa
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
