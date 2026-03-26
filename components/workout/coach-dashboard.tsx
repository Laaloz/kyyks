"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Activity,
  ChevronDown,
  ChevronUp,
  CircleCheckBig,
  ClipboardList,
  ClipboardPenLine,
  MoreHorizontal,
  Plus,
} from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { type Resolver, useFieldArray, useForm } from "react-hook-form";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/field";
import { InfoTooltip } from "@/components/ui/tooltip";
import { ConversationPanel } from "@/components/workout/conversation-panel";
import { MetricTrendChart } from "@/components/workout/metric-trend-chart";
import { CoachInvitePanel } from "@/components/workout/coach/invite-panel";
import { ProgramWorkoutEditor } from "@/components/workout/coach/program-workout-editor";
import {
  type ProgramComposerExerciseFormValues,
  type ProgramComposerFormValues,
  type ProgramComposerValues,
} from "@/components/workout/coach/program-composer";
import { estimateStrengthCalories, getLatestMeasurement, getMeasurementsForUser, getWeightAtMoment } from "@/lib/body-metrics";
import { calculateSessionDurationSeconds, getCoachConversationAthletes } from "@/lib/domain";
import { withMinimumDelay } from "@/lib/min-delay";
import { buildScheduledWorkoutExerciseOrder } from "@/lib/workout-exercise-order";
import { buildWorkoutConversationContextOptions } from "@/lib/workout-conversation-context";
import { buildWorkoutHistoryTitleMap } from "@/lib/workout-history-title";
import { isProgramActive } from "@/lib/program-status";
import { isAdminRole } from "@/lib/role-access";
import type { AppState, ConversationEntry, Role, ScheduledWorkoutStatus, WorkoutSession } from "@/lib/types";
import { formatDate, formatDateWithWeekday } from "@/lib/utils";
import { canDeleteProgramFromState, useAppState } from "@/providers/app-state-provider";

import {
  CUSTOM_EXERCISE_VALUE,
  emptyProgramWorkoutExercise,
  emptyProgramWorkout,
  programComposerSchema,
} from "@/components/workout/schemas";
import { PROGRAMS_WORKSPACE_VIEW, workoutStatusLabel, type WorkspaceView } from "@/components/workout/shared";

type CoachHistoryMuscleGroupKey = "shoulders" | "arms" | "chest" | "abs" | "back" | "legs" | "other";

type CoachWorkoutInsight = {
  exerciseCount: number;
  setCount: number;
  completedSetCount: number;
  completionPercent: number;
  totalLoadKg: number;
  liftedKg: number;
  durationSeconds: number;
  estimatedCalories: number;
  muscleGroupLiftedKg: Record<CoachHistoryMuscleGroupKey, number>;
};

type CoachExerciseSetGroup = {
  key: string;
  exerciseName: string;
  supersetGroup?: string;
  logs: WorkoutSession["setLogs"];
};

function compareCoachSetLabels(left: string, right: string) {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

function getCoachWorkoutCompletedAt(
  workout: AppState["scheduledWorkouts"][number],
  session?: WorkoutSession,
) {
  return workout.completedAt ?? session?.completedAt ?? session?.startedAt ?? workout.scheduledDate;
}

const coachHistoryMuscleGroups: Array<{ key: CoachHistoryMuscleGroupKey; label: string }> = [
  { key: "shoulders", label: "Olkapää" },
  { key: "arms", label: "Kädet" },
  { key: "chest", label: "Rinta" },
  { key: "abs", label: "Vatsalihakset" },
  { key: "back", label: "Selkä" },
  { key: "legs", label: "Jalat" },
  { key: "other", label: "Muu" },
];

export function CoachDashboard({
  view,
  onOpenConversation,
}: {
  view: WorkspaceView;
  onOpenConversation?: () => void;
}) {
  const {
    currentUser,
    state,
    createProgram,
    updateProgram,
    setProgramStatus,
    deleteProgram,
    addConversationComment,
    getCoachAthletes,
  } = useAppState();
  const formId = useId();
  const [programMessage, setProgramMessage] = useState<string>("");
  const [editingProgramId, setEditingProgramId] = useState<string | null>(null);
  const [selectedAthleteId, setSelectedAthleteId] = useState<string>("");

  const athletes = currentUser
    ? isAdminRole(currentUser.role)
      ? getCoachConversationAthletes(state, currentUser.id)
      : getCoachAthletes(currentUser.id)
    : [];
  const programTargets = useMemo(() => {
    if (!currentUser) {
      return [];
    }

    const selfTarget = {
      id: currentUser.id,
      fullName: `${currentUser.fullName} (sinä)`,
      email: currentUser.email,
    };

    return [selfTarget, ...athletes.filter((athlete) => athlete.id !== currentUser.id)];
  }, [athletes, currentUser]);
  const coachPrograms = useMemo(
    () =>
      state.plans
        .filter(
          (plan) => Boolean(plan.workouts?.length) && (isAdminRole(currentUser?.role) || plan.coachId === currentUser?.id),
        )
        .sort((left, right) => {
          const leftActive = isProgramActive(left) ? 1 : 0;
          const rightActive = isProgramActive(right) ? 1 : 0;
          if (leftActive !== rightActive) {
            return rightActive - leftActive;
          }

          return left.title.localeCompare(right.title, "fi");
        }),
    [currentUser?.id, currentUser?.role, state.plans],
  );
  const activeCoachPrograms = useMemo(
    () => coachPrograms.filter((program) => isProgramActive(program)),
    [coachPrograms],
  );
  const archivedCoachPrograms = useMemo(
    () => coachPrograms.filter((program) => !isProgramActive(program)),
    [coachPrograms],
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
        (exercise) => exercise.scope === "global" || isAdminRole(currentUser?.role) || exercise.coachId === currentUser?.id,
      ).sort((a, b) => a.name.localeCompare(b.name, "fi")),
    [state.exercises, currentUser],
  );

  const form = useForm<ProgramComposerFormValues, unknown, ProgramComposerValues>({
    resolver: zodResolver(programComposerSchema) as Resolver<
      ProgramComposerFormValues,
      unknown,
      ProgramComposerValues
    >,
    defaultValues: {
      title: "",
      description: "",
      athleteId: programTargets[0]?.id ?? "",
      workouts: [emptyProgramWorkout("custom")],
    },
  });

  useEffect(() => {
    const currentTargetId = form.getValues("athleteId");
    if (!programTargets.length) {
      if (currentTargetId) {
        form.setValue("athleteId", "");
      }
      return;
    }

    if (!programTargets.some((target) => target.id === currentTargetId)) {
      form.setValue("athleteId", programTargets[0]?.id ?? "", { shouldDirty: false });
    }
  }, [form, programTargets]);

  const workoutFields = useFieldArray({
    control: form.control,
    name: "workouts",
  });

  const isEditingProgram = Boolean(editingProgramId);
  const isSavingProgram = form.formState.isSubmitting;
  const canEditProgramAthlete = !editingProgramId
    || !state.scheduledWorkouts.some((workout) => workout.trainingPlanId === editingProgramId);
  const editorTitle = isEditingProgram ? "Muokkaa treeniohjelmaa" : "Uusi treeniohjelma";
  const editorDescription = isEditingProgram
    ? "Päivitä ohjelman harjoitukset, liikkeet ja kuormitus. Treenaajan voi vaihtaa vain ennen kuin ohjelmasta on käynnistetty treenejä."
    : "Luo uusi ohjelma itsellesi tai valmennettavalle. Lisää harjoitukset ja valitse liikkeet valmiista pankista tai omina liikkeinä.";

  const resetComposer = (athleteId: string) => {
    form.reset({
      title: "",
      description: "",
      athleteId,
      workouts: [emptyProgramWorkout("custom")],
    });
    setEditingProgramId(null);
  };

  const closeProgramEditing = (message?: string) => {
    resetComposer(form.getValues("athleteId"));
    setProgramMessage(message ?? "");
  };

  return (
    <div className="grid gap-6">
      {view === "overview" || view === "athletes" ? (
        <CoachAthleteInsights
          athletes={athletes}
          coachId={undefined}
          selectedAthleteId={selectedAthleteId}
          onSelectAthlete={setSelectedAthleteId}
          state={state}
          onOpenConversation={onOpenConversation}
        />
      ) : null}

      {view === "conversation" && currentUser ? (
        <CoachConversationView
          athletes={athletes}
          currentRole={currentUser.role}
          currentUserId={currentUser.id}
          entries={state.conversationEntries}
          onSend={addConversationComment}
          selectedAthleteId={selectedAthleteId}
          onSelectAthlete={setSelectedAthleteId}
          plans={state.plans}
          scheduledWorkouts={state.scheduledWorkouts}
          templates={state.templates}
          users={state.users}
        />
      ) : null}

      {view === PROGRAMS_WORKSPACE_VIEW && (
        <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
          <Card className="border-[var(--border-strong)]" id="coach-program-composer">
              <p className="text-xs font-semibold text-[var(--text-subtle)]">Ohjelman rakentaja</p>
              <CardTitle className="text-2xl">{editorTitle}</CardTitle>
              <CardDescription className="mt-2">{editorDescription}</CardDescription>
              <p className="mt-3 text-xs text-[var(--text-subtle)]">
                Ohjelmat tallennetaan suoraan ohjelmina. Erillisiä treenipohjia ei käytetä tässä näkymässä.
              </p>
            {isEditingProgram ? (
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
                <Badge>Muokkaustila</Badge>
                <p className="text-sm text-[var(--text-muted)]">
                  Muokkaat olemassa olevaa ohjelmaa. Sulje muokkaus, jos haluat palata uuden ohjelman tekoon.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    closeProgramEditing("Muokkaustila suljettiin.");
                  }}
                >
                  Sulje muokkaus
                </Button>
              </div>
            ) : null}

            <form
              className="mt-6 space-y-5"
              onSubmit={form.handleSubmit(async (values) => {
                const payloadWorkouts = mapComposerWorkouts(values.workouts);
                const result = isEditingProgram && editingProgramId
                  ? await withMinimumDelay(
                      updateProgram(editingProgramId, {
                        title: values.title,
                        description: values.description,
                        athleteId: values.athleteId,
                        workouts: payloadWorkouts,
                      }),
                    )
                  : await withMinimumDelay(
                      createProgram({
                        title: values.title,
                        description: values.description,
                        athleteId: values.athleteId,
                        workouts: payloadWorkouts,
                      }),
                    );

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
                    <Input id={`${formId}-title`} {...form.register("title")} placeholder="Esim. Ylä-ala-koko kroppa" />
                  </div>
                  <div>
                    <Label htmlFor={`${formId}-athlete`}>Käyttäjä</Label>
                    <Select id={`${formId}-athlete`} {...form.register("athleteId")} disabled={!canEditProgramAthlete}>
                      <option value="">Valitse käyttäjä</option>
                      {programTargets.map((target) => (
                        <option key={target.id} value={target.id}>
                          {target.fullName}
                        </option>
                      ))}
                    </Select>
                    {isEditingProgram ? (
                      <p className="mt-1 text-xs text-[var(--text-subtle)]">
                        {canEditProgramAthlete
                          ? "Voit vielä vaihtaa käyttäjän, koska ohjelmasta ei ole käynnistetty treenejä."
                          : "Käyttäjää ei voi enää vaihtaa, koska ohjelmasta on jo käynnistetty treenejä tai historiaa."}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div>
                  <Label htmlFor={`${formId}-description`}>Kuvaus ja lisätiedot</Label>
                  <Textarea
                    id={`${formId}-description`}
                    {...form.register("description")}
                    placeholder="Esim. Pidä treenin lisäksi huoli, että saat viikossa keskimäärin 8000 askelta päivässä."
                    className="min-h-24"
                  />
                  <p className="mt-1 text-xs text-[var(--text-subtle)]">
                     Tähän voit kirjoittaa ohjelman tavoitteen, arjen muistutukset tai muut tarkentavat huomiot treenaajalle.
                  </p>
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
                  Lisää uusi treeni ohjelman loppuun. Uusi treeni avautuu automaattisesti näkyviin.
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
                  Lisää treeni loppuun
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
                <Button
                  type="submit"
                  className="w-full sm:w-auto"
                  loading={isSavingProgram}
                  loadingText={isEditingProgram ? "Tallennetaan muutoksia..." : "Tallennetaan ohjelmaa..."}
                >
                  {isEditingProgram ? "Tallenna muutokset" : "Tallenna ohjelma"}
                </Button>
                {isEditingProgram ? (
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full sm:w-auto"
                    onClick={() => {
                      closeProgramEditing("Muokkaustila suljettiin.");
                    }}
                  >
                    Sulje muokkaus
                  </Button>
                ) : null}
              </div>
            </form>
          </Card>

          <div className="grid gap-6">
            <Card>
              <p className="text-xs font-semibold text-[var(--text-subtle)]">Ohjelmakirjasto</p>
              <CardTitle className="text-2xl">Luodut ohjelmat</CardTitle>
              <CardDescription className="mt-2">
                Pidä käytössä oleva ohjelma selvästi esillä ja siirrä aiemmat versiot talteen vertailua varten.
              </CardDescription>
              <div className="mt-5 space-y-6">
                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[var(--text)]">Käytössä nyt</p>
                      <p className="mt-1 text-sm text-[var(--text-muted)]">
                        Nämä näkyvät treenaajalle tällä hetkellä käytössä olevina ohjelmina.
                      </p>
                    </div>
                    <Badge>{activeCoachPrograms.length}</Badge>
                  </div>
                  {activeCoachPrograms.length ? (
                    <div className="grid gap-4">
                      {activeCoachPrograms.map((program) => {
                        const athleteName =
                          program.athleteId === currentUser?.id
                            ? "Sinä"
                            : (state.users.find((user) => user.id === program.athleteId)?.fullName ?? "Käyttäjä");
                        const isActiveEditorTarget = editingProgramId === program.id;
                        const canDeleteProgram = canDeleteProgramFromState(state, program.id);

                        return (
                          <div key={program.id} className="rounded-2xl border-2 border-[var(--accent-strong)] bg-[color:color-mix(in_oklab,var(--accent)_10%,var(--surface))] p-5 shadow-[0_1px_0_0_var(--shadow-soft),0_10px_26px_-20px_var(--accent)]">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-lg font-semibold text-[var(--text)]">{program.title}</p>
                                  <Badge className="border-[var(--accent-strong)] bg-[var(--surface)] text-[var(--accent-strong)]">
                                    Käytössä nyt
                                  </Badge>
                                  <Badge>{program.workouts?.length ?? 0} treeniä</Badge>
                                  {isActiveEditorTarget ? <Badge>Aktiivinen muokkaus</Badge> : null}
                                </div>
                                <p className="mt-1 text-sm text-[var(--text-muted)]">Treenaaja: {athleteName}</p>
                                {program.description ? (
                                  <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-muted)]">{program.description}</p>
                                ) : null}
                              </div>
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2">
                              {(program.workouts ?? []).map((workout) => (
                                <Badge key={workout.id}>{workout.name}</Badge>
                              ))}
                            </div>

                            <div className="mt-4 flex flex-wrap items-center gap-3">
                              <Button
                                type="button"
                                variant={isActiveEditorTarget ? "secondary" : "secondary"}
                                onClick={() => {
                                  if (isActiveEditorTarget) {
                                    closeProgramEditing("Muokkaustila suljettiin.");
                                    return;
                                  }
                                  form.reset(buildProgramComposerValues(program, state.exercises));
                                  setEditingProgramId(program.id);
                                  setProgramMessage("");
                                  window.requestAnimationFrame(() => {
                                    const composer = document.getElementById("coach-program-composer");
                                    composer?.scrollIntoView({ behavior: "smooth", block: "start" });
                                  });
                                }}
                              >
                                {isActiveEditorTarget ? "Sulje muokkaus" : "Muokkaa ohjelmaa"}
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                onClick={async () => {
                                  const result = await setProgramStatus(program.id, "archived");
                                  if (!result.ok) {
                                    setProgramMessage(result.message);
                                    return;
                                  }

                                  setProgramMessage(`Ohjelma "${program.title}" siirrettiin aiempiin ohjelmiin.`);
                                }}
                              >
                                Poista käytöstä
                              </Button>
                              <details className="relative">
                                <summary className="inline-flex list-none items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--text-muted)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]">
                                  <MoreHorizontal className="size-4" aria-hidden="true" />
                                  <span className="sr-only">Avaa ohjelman lisätoiminnot</span>
                                </summary>
                                <div className="absolute right-0 top-[calc(100%+0.5rem)] z-10 min-w-48 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2 shadow-[0_18px_45px_-24px_var(--shadow)]">
                                  <button
                                    type="button"
                                    disabled={!canDeleteProgram}
                                    className="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-semibold text-[var(--danger)] transition hover:bg-[var(--surface-2)] disabled:cursor-not-allowed disabled:text-[var(--text-subtle)] disabled:hover:bg-transparent"
                                    onClick={async () => {
                                      if (!canDeleteProgram) {
                                        return;
                                      }
                                      const confirmDelete = window.confirm(
                                        `Poistetaanko ohjelma "${program.title}"?`,
                                      );
                                      if (!confirmDelete) {
                                        return;
                                      }

                                      const result = await deleteProgram(program.id);
                                      if (!result.ok) {
                                        setProgramMessage(result.message);
                                        return;
                                      }

                                      if (isActiveEditorTarget) {
                                        resetComposer(form.getValues("athleteId"));
                                      }
                                      setProgramMessage(`Ohjelma "${program.title}" poistettiin.`);
                                    }}
                                  >
                                    Poista ohjelma
                                  </button>
                                  {!canDeleteProgram ? (
                                    <p className="px-3 pb-1 pt-2 text-xs leading-5 text-[var(--text-subtle)]">
                                      Poisto ei ole enää mahdollinen, koska ohjelmasta on jo käynnistetty treenejä tai historiaa.
                                    </p>
                                  ) : null}
                                </div>
                              </details>
                            </div>
                            <p className="mt-3 text-xs text-[var(--text-subtle)]">
                              {canDeleteProgram
                                ? "Voit vielä poistaa ohjelman, koska siitä ei ole käynnistetty treenejä."
                                : "Ohjelma säilyy lukittuna historiassa, koska siitä on jo käynnistetty treenejä."}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-2)] p-4">
                      <p className="text-sm font-medium text-[var(--text)]">Ei aktiivisia ohjelmia.</p>
                      <p className="mt-1 text-sm text-[var(--text-muted)]">
                        Luo uusi ohjelma tai ota aiempi ohjelma takaisin käyttöön.
                      </p>
                    </div>
                  )}
                </section>

                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[var(--text)]">Aiemmat ohjelmat</p>
                      <p className="mt-1 text-sm text-[var(--text-muted)]">
                        Vanhat ohjelmat säilyvät tallessa, mutta eivät näy treenaajalle aktiivisina.
                      </p>
                    </div>
                    <Badge>{archivedCoachPrograms.length}</Badge>
                  </div>
                  {archivedCoachPrograms.length ? (
                    <div className="grid gap-4">
                      {archivedCoachPrograms.map((program) => {
                        const athleteName =
                          program.athleteId === currentUser?.id
                            ? "Sinä"
                            : (state.users.find((user) => user.id === program.athleteId)?.fullName ?? "Käyttäjä");
                        const isActiveEditorTarget = editingProgramId === program.id;
                        const canDeleteProgram = canDeleteProgramFromState(state, program.id);

                        return (
                          <div key={program.id} className="rounded-2xl border-2 border-[var(--border)] bg-[var(--surface-2)] p-5">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-lg font-semibold text-[var(--text)]">{program.title}</p>
                                  <Badge>Aiempi ohjelma</Badge>
                                  <Badge>{program.workouts?.length ?? 0} treeniä</Badge>
                                  {isActiveEditorTarget ? <Badge>Aktiivinen muokkaus</Badge> : null}
                                </div>
                                <p className="mt-1 text-sm text-[var(--text-muted)]">Treenaaja: {athleteName}</p>
                                {program.description ? (
                                  <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-muted)]">{program.description}</p>
                                ) : null}
                              </div>
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2">
                              {(program.workouts ?? []).map((workout) => (
                                <Badge key={workout.id}>{workout.name}</Badge>
                              ))}
                            </div>

                            <div className="mt-4 flex flex-wrap items-center gap-3">
                              <Button
                                type="button"
                                variant="secondary"
                                onClick={async () => {
                                  const result = await setProgramStatus(program.id, "active");
                                  if (!result.ok) {
                                    setProgramMessage(result.message);
                                    return;
                                  }

                                  setProgramMessage(
                                    `Ohjelma "${program.title}" aktivoitiin. Muut saman treenaajan ohjelmat arkistoitiin.`,
                                  );
                                }}
                              >
                                Ota käyttöön
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                onClick={() => {
                                  if (isActiveEditorTarget) {
                                    closeProgramEditing("Muokkaustila suljettiin.");
                                    return;
                                  }
                                  form.reset(buildProgramComposerValues(program, state.exercises));
                                  setEditingProgramId(program.id);
                                  setProgramMessage("");
                                  window.requestAnimationFrame(() => {
                                    const composer = document.getElementById("coach-program-composer");
                                    composer?.scrollIntoView({ behavior: "smooth", block: "start" });
                                  });
                                }}
                              >
                                {isActiveEditorTarget ? "Sulje muokkaus" : "Muokkaa sisältöä"}
                              </Button>
                              <details className="relative">
                                <summary className="inline-flex list-none items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--text-muted)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]">
                                  <MoreHorizontal className="size-4" aria-hidden="true" />
                                  <span className="sr-only">Avaa ohjelman lisätoiminnot</span>
                                </summary>
                                <div className="absolute right-0 top-[calc(100%+0.5rem)] z-10 min-w-48 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2 shadow-[0_18px_45px_-24px_var(--shadow)]">
                                  <button
                                    type="button"
                                    disabled={!canDeleteProgram}
                                    className="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-semibold text-[var(--danger)] transition hover:bg-[var(--surface-2)] disabled:cursor-not-allowed disabled:text-[var(--text-subtle)] disabled:hover:bg-transparent"
                                    onClick={async () => {
                                      if (!canDeleteProgram) {
                                        return;
                                      }
                                      const confirmDelete = window.confirm(
                                        `Poistetaanko ohjelma "${program.title}"?`,
                                      );
                                      if (!confirmDelete) {
                                        return;
                                      }

                                      const result = await deleteProgram(program.id);
                                      if (!result.ok) {
                                        setProgramMessage(result.message);
                                        return;
                                      }

                                      if (isActiveEditorTarget) {
                                        resetComposer(form.getValues("athleteId"));
                                      }
                                      setProgramMessage(`Ohjelma "${program.title}" poistettiin.`);
                                    }}
                                  >
                                    Poista ohjelma
                                  </button>
                                  {!canDeleteProgram ? (
                                    <p className="px-3 pb-1 pt-2 text-xs leading-5 text-[var(--text-subtle)]">
                                      Poisto ei ole enää mahdollinen, koska ohjelmasta on jo käynnistetty treenejä tai historiaa.
                                    </p>
                                  ) : null}
                                </div>
                              </details>
                            </div>
                            <p className="mt-3 text-xs text-[var(--text-subtle)]">
                              {canDeleteProgram
                                ? "Arkistoidun ohjelman voi vielä poistaa, jos siitä ei ole käynnistetty treenejä."
                                : "Arkistoitu ohjelma säilyy historiassa, koska siitä on jo käynnistetty treenejä."}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-2)] p-4">
                      <p className="text-sm font-medium text-[var(--text)]">Ei aiempia ohjelmia.</p>
                      <p className="mt-1 text-sm text-[var(--text-muted)]">
                        Kun ohjelma jää pois käytöstä, voit siirtää sen tänne talteen.
                      </p>
                    </div>
                  )}
                </section>
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
      customMuscleGroup:
        exercise.exerciseId === CUSTOM_EXERCISE_VALUE
          ? (exercise.customMuscleGroup || undefined)
          : undefined,
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
): ProgramComposerFormValues {
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));

  return {
    title: program.title,
    description: program.description ?? "",
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
          customMuscleGroup: isCustomExercise ? (exerciseItem.muscleGroup ?? "other") : "",
          supersetGroup: (exerciseItem.supersetGroup ?? "") as ProgramComposerExerciseFormValues["supersetGroup"],
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

function CoachAthleteInsights({
  athletes,
  coachId,
  selectedAthleteId,
  onSelectAthlete,
  state,
  onOpenConversation,
}: {
  athletes: Array<{ id: string; fullName: string }>;
  coachId?: string;
  selectedAthleteId: string;
  onSelectAthlete: (athleteId: string) => void;
  state: AppState;
  onOpenConversation?: () => void;
}) {
  const [expandedWorkoutDetailsId, setExpandedWorkoutDetailsId] = useState<string | null>(null);
  const [selectedWorkoutByGroup, setSelectedWorkoutByGroup] = useState<Record<string, string>>({});
  const selectedAthlete = athletes.find((athlete) => athlete.id === selectedAthleteId) ?? null;
  const selectedAthleteProfile = useMemo(
    () => state.users.find((user) => user.id === selectedAthleteId) ?? null,
    [selectedAthleteId, state.users],
  );
  const now = new Date();
  const lastThirtyDays = new Date(now);
  lastThirtyDays.setDate(lastThirtyDays.getDate() - 30);

  useEffect(() => {
    setExpandedWorkoutDetailsId(null);
    setSelectedWorkoutByGroup({});
  }, [selectedAthleteId]);

  const athleteWorkouts = useMemo(() => {
    if (!selectedAthleteId) {
      return [];
    }

    return state.scheduledWorkouts
      .filter(
        (workout) => workout.athleteId === selectedAthleteId && (!coachId || workout.coachId === coachId),
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
  const athleteWorkoutHistory = useMemo(() => {
    return athleteWorkouts
      .filter(
        (workout) =>
          Boolean(workout.programWorkoutId) &&
          (sessionByWorkoutId.has(workout.id) || workout.status === "completed"),
      )
      .sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate));
  }, [athleteWorkouts, sessionByWorkoutId]);

  const workoutInsights = useMemo(
    () => buildCoachWorkoutInsights(state, athleteWorkouts, sessionByWorkoutId),
    [athleteWorkouts, sessionByWorkoutId, state],
  );

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
  const workoutHistoryTitles = useMemo(
    () => buildWorkoutHistoryTitleMap(athleteWorkoutHistory),
    [athleteWorkoutHistory],
  );
  const conversationEntriesByWorkoutId = useMemo(() => {
    const map = new Map<string, ConversationEntry[]>();
    state.conversationEntries
      .filter(
        (entry) =>
          entry.athleteId === selectedAthleteId &&
          (!coachId || entry.coachId === coachId) &&
          entry.contextType === "workout" &&
          Boolean(entry.contextId),
      )
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .forEach((entry) => {
        if (!entry.contextId) {
          return;
        }
        map.set(entry.contextId, [...(map.get(entry.contextId) ?? []), entry]);
      });
    return map;
  }, [coachId, selectedAthleteId, state.conversationEntries]);

  const workoutRows = useMemo(() => {
    return athleteWorkoutHistory.map((workout) => {
      const session = sessionByWorkoutId.get(workout.id);
      const insight = workoutInsights.get(workout.id) ?? createEmptyCoachWorkoutInsight();
      const historyTitle = workoutHistoryTitles.get(workout.id);
      const completedSets = insight.completedSetCount;
      const totalSets = insight.setCount;
      const volume = insight.liftedKg;
        const completedAt = getCoachWorkoutCompletedAt(workout, session);
      const note = session ? noteBySessionId.get(session.id) : undefined;
      const setGroups = buildCoachExerciseSetGroups(
        session,
        buildScheduledWorkoutExerciseOrder(state, workout),
      );
      const pendingSetCount = Math.max(0, totalSets - completedSets);
      const conversationEntries = conversationEntriesByWorkoutId.get(workout.id) ?? [];

      return {
        id: workout.id,
        title: historyTitle?.title ?? workout.title,
        occurrenceLabel: historyTitle?.occurrenceLabel ?? "Treeni 1",
        status: workout.status,
        completedSets,
        totalSets,
        volume,
        completedAt,
        note,
        conversationEntries,
        insight,
        setGroups,
        pendingSetCount,
      };
    });
  }, [athleteWorkoutHistory, conversationEntriesByWorkoutId, noteBySessionId, sessionByWorkoutId, state, workoutHistoryTitles, workoutInsights]);

  const groupedWorkoutRows = useMemo(() => {
    const grouped = new Map<
      string,
      {
        key: string;
        title: string;
        rows: typeof workoutRows;
      }
    >();

    workoutRows.forEach((row) => {
      const groupKey = row.title.toLowerCase();
      const existing = grouped.get(groupKey);
      if (existing) {
        existing.rows.push(row);
        return;
      }

      grouped.set(groupKey, {
        key: groupKey,
        title: row.title,
        rows: [row],
      });
    });

    return Array.from(grouped.values())
      .map((group) => {
        const rows = [...group.rows].sort(
          (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime(),
        );
        const noteEntries = rows
          .filter((row) => Boolean(row.note))
          .map((row) => ({
            id: `note-${row.id}`,
            body: row.note ?? "",
            completedAt: row.completedAt,
            occurrenceLabel: row.occurrenceLabel,
          }));
        const conversationEntries = rows
          .flatMap((row) =>
            row.conversationEntries
              .map((entry) => ({
                ...entry,
                workoutId: row.id,
                workoutCompletedAt: row.completedAt,
                occurrenceLabel: row.occurrenceLabel,
              })),
          )
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        return {
          key: group.key,
          title: group.title,
          rows,
          noteEntries,
          conversationEntries,
        };
      })
      .sort(
        (a, b) =>
          new Date(b.rows[0]?.completedAt ?? 0).getTime() - new Date(a.rows[0]?.completedAt ?? 0).getTime(),
      );
  }, [workoutRows]);

  const completedRows = useMemo(() => {
    return athleteWorkoutHistory
      .map((workout) => {
        const session = sessionByWorkoutId.get(workout.id);
        if (!session || workout.status !== "completed") {
          return null;
        }

        const completedAt = getCoachWorkoutCompletedAt(workout, session);
        return {
          id: workout.id,
          completedAt,
          volume: getSessionVolume(session),
        };
      })
      .filter((item): item is { id: string; completedAt: string; volume: number } => Boolean(item))
      .sort((a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime());
  }, [athleteWorkoutHistory, sessionByWorkoutId]);

  const completedLastThirtyDays = athleteWorkoutHistory.filter(
    (workout) =>
      workout.status === "completed" &&
      new Date(workout.scheduledDate).getTime() >= lastThirtyDays.getTime(),
  ).length;
  const scheduledLastThirtyDays = athleteWorkoutHistory.filter(
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
    date: row.completedAt,
    value: row.volume,
  }));
  const bodyMeasurements = useMemo(
    () => (selectedAthleteId ? getMeasurementsForUser(state, selectedAthleteId) : []),
    [selectedAthleteId, state],
  );
  const latestBodyMeasurement = useMemo(
    () => (selectedAthleteId ? getLatestMeasurement(state, selectedAthleteId) : undefined),
    [selectedAthleteId, state],
  );
  const weightTrendPoints = useMemo(
    () =>
      bodyMeasurements
        .filter((entry) => entry.weightKg !== undefined)
        .slice(0, 12)
        .reverse()
        .map((entry) => ({
          date: entry.measuredAt,
          value: entry.weightKg as number,
        })),
    [bodyMeasurements],
  );
  const waistTrendPoints = useMemo(
    () =>
      bodyMeasurements
        .filter((entry) => entry.waistCm !== undefined)
        .slice(0, 12)
        .reverse()
        .map((entry) => ({
          date: entry.measuredAt,
          value: entry.waistCm as number,
        })),
    [bodyMeasurements],
  );

  const phaseBars = buildPhaseBars(athleteWorkoutHistory, 8);

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
          <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Treenaajan seuranta</p>
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
              label="Valmistumisaste 30 pv"
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

          <div className="mt-5 grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
              <p className="text-sm font-semibold text-[var(--text)]">Kehitysgraafi (volyymi)</p>
              <p className="mt-1 text-xs text-[var(--text-subtle)]">Viimeiset 10 valmista treeniä</p>
              <MetricTrendChart
                points={volumeTrendPoints}
                ariaLabel="Volyymin kehitystrendi"
                emptyMessage="Ei valmiita treenejä graafiin vielä."
                helperText="Alarivillä näkyy kuukausi ja vuosi, oikealla volyymin asteikko."
                valueLabel="Volyymi"
                unit="kg"
                decimals={0}
                useZeroBaseline
              />
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
              <p className="text-sm font-semibold text-[var(--text)]">Vaihejakauma 8 viikolta</p>
              <p className="mt-1 text-xs text-[var(--text-subtle)]">
                Kuinka paljon treenejä ollut vaiheissa keskeytetty, kesken ja valmis.
              </p>
              <PhaseBars bars={phaseBars} />
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div className="max-w-2xl">
                <p className="text-sm font-semibold text-[var(--text)]">Kehon seuranta</p>
                <p className="mt-1 text-xs text-[var(--text-subtle)]">
                  Pituus, paino ja vyötärö auttavat hahmottamaan, mihin suuntaan treenaajan arki ja palautuminen liikkuvat.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[36rem] xl:grid-cols-4">
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                  <p className="text-[11px] font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Pituus</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--text)]">
                    {selectedAthleteProfile?.heightCm !== undefined
                      ? `${formatTrendNumber(selectedAthleteProfile.heightCm)} cm`
                      : "Ei asetettu"}
                  </p>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                  <p className="text-[11px] font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Paino</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--text)]">
                    {selectedAthleteProfile?.weightKg !== undefined
                      ? `${formatTrendNumber(selectedAthleteProfile.weightKg)} kg`
                      : "Ei asetettu"}
                  </p>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                  <p className="text-[11px] font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Vyötärö</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--text)]">
                    {selectedAthleteProfile?.waistCm !== undefined
                      ? `${formatTrendNumber(selectedAthleteProfile.waistCm)} cm`
                      : "Ei asetettu"}
                  </p>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                  <p className="text-[11px] font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Viimeisin mittaus</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--text)]">
                    {latestBodyMeasurement ? shortDate(latestBodyMeasurement.measuredAt) : "Ei vielä"}
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              <div>
                <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Painotrendi</p>
                <MetricTrendChart
                  points={weightTrendPoints}
                  ariaLabel="Painon kehitystrendi"
                  emptyMessage="Painomittauksia ei ole vielä kirjattu."
                  helperText="Alarivillä näkyy kuukausi ja vuosi, oikealla painon asteikko."
                  valueLabel="Paino"
                  unit="kg"
                />
              </div>
              <div>
                <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Vyötärötrendi</p>
                <MetricTrendChart
                  points={waistTrendPoints}
                  ariaLabel="Vyötärön kehitystrendi"
                  emptyMessage="Vyötärömittauksia ei ole vielä kirjattu."
                  helperText="Alarivillä näkyy kuukausi ja vuosi, oikealla vyötärön asteikko."
                  valueLabel="Vyötärö"
                  unit="cm"
                />
              </div>
            </div>
          </div>

          <div className="mt-5">
            <p className="text-sm font-semibold text-[var(--text)]">Treeniarkisto, toteumat ja keskustelu</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Jokainen treenialue näkyy omana korttinaan. Valitse toteutus päivämäärän mukaan ja näe muistiinpanot, suoritukset ja keskustelu samasta näkymästä.
            </p>
            <div className="mx-auto mt-3 grid max-w-[84rem] gap-4 xl:grid-cols-2">
              {groupedWorkoutRows.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)] xl:col-span-2">Treenejä ei vielä löytynyt valitulle treenaajalle.</p>
              ) : (
                groupedWorkoutRows.map((group) => {
                  const selectedRow =
                    group.rows.find((row) => row.id === selectedWorkoutByGroup[group.key]) ?? group.rows[0];
                  if (!selectedRow) {
                    return null;
                  }

                  const isDetailsOpen = expandedWorkoutDetailsId === selectedRow.id;
                  const dateLabel =
                    selectedRow.status === "completed"
                      ? formatDateWithWeekday(selectedRow.completedAt)
                      : formatDate(selectedRow.completedAt);
                  return (
                    <div key={group.key} className="rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-5">
                      <div className="flex flex-col gap-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Treenialue</p>
                            <p className="mt-1 font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--text)]">
                              {group.title}
                            </p>
                            <p className="mt-1 text-sm text-[var(--text-muted)]">
                              {dateLabel} · {selectedRow.insight.exerciseCount} liikettä · {selectedRow.occurrenceLabel}
                            </p>
                          </div>
                          <div className="grid w-full min-w-0 gap-2 sm:w-72 sm:max-w-full">
                            <div>
                              <Label htmlFor={`coach-group-${group.key}-date`} className="text-xs">
                                Näytä toteutus
                              </Label>
                              <Select
                                id={`coach-group-${group.key}-date`}
                                value={selectedRow.id}
                                onChange={(event) =>
                                  setSelectedWorkoutByGroup((current) => ({
                                    ...current,
                                    [group.key]: event.target.value,
                                  }))
                                }
                              >
                                {group.rows.map((row) => (
                                  <option key={row.id} value={row.id}>
                                    {formatDateWithWeekday(row.completedAt)} · {row.occurrenceLabel}
                                  </option>
                                ))}
                              </Select>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Badge className={coachStatusTone(selectedRow.status)}>
                                {workoutStatusLabel(selectedRow.status)}
                              </Badge>
                              <Badge>{Math.round(selectedRow.volume)} kg</Badge>
                              <Badge className="border-[var(--border)] bg-[var(--surface-3)] text-[var(--text)]">
                                Toteuma {selectedRow.insight.completionPercent}%
                              </Badge>
                            </div>
                          </div>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-4">
                          <CoachOverviewStat
                            label="Sarjat valmiina"
                            value={`${selectedRow.completedSets}/${selectedRow.totalSets || 0}`}
                            tone={selectedRow.pendingSetCount > 0 ? "warning" : "success"}
                          />
                          <CoachOverviewStat
                            label="Kesto"
                            value={formatCoachWorkoutDuration(selectedRow.insight.durationSeconds)}
                          />
                          <CoachOverviewStat
                            label="Kalorit"
                            value={`${selectedRow.insight.estimatedCalories} kcal`}
                          />
                        </div>

                        <div className="grid gap-4">
                          <div className="space-y-4">
                            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                              <div className="flex items-center justify-between gap-2">
                                <div>
                                  <p className="text-sm font-semibold text-[var(--text)]">Toteuma</p>
                                  <p className="mt-1 text-xs text-[var(--text-subtle)]">
                                    Valitun toteutuksen keskeiset mittarit yhdellä silmäyksellä.
                                  </p>
                                </div>
                                {selectedRow.pendingSetCount > 0 ? (
                                  <Badge className="border-[var(--danger)] bg-[var(--surface)] text-[var(--danger)]">
                                    Kesken {selectedRow.pendingSetCount} sarjaa
                                  </Badge>
                                ) : (
                                  <Badge className="border-[var(--accent-tertiary)] bg-[var(--surface)] text-[var(--accent-tertiary)]">
                                    Kaikki sarjat valmiina
                                  </Badge>
                                )}
                              </div>
                              <div className="mt-3 grid grid-cols-2 gap-2 2xl:grid-cols-3">
                                <CoachHistoryMetric label="Kuorma yht." value={`${Math.round(selectedRow.insight.totalLoadKg)} kg`} />
                                <CoachHistoryMetric
                                  label="Volyymi (kg x toistot)"
                                  value={`${Math.round(selectedRow.insight.liftedKg)} kg`}
                                />
                                <CoachHistoryMetric label="Suoritus" value={`${selectedRow.insight.completionPercent}%`} />
                                <CoachHistoryMetric label="Harjoitteet" value={`${selectedRow.insight.exerciseCount}`} />
                              </div>
                              <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
                                <p className="text-[11px] font-semibold tracking-[0.04em] text-[var(--text-subtle)]">
                                  Lihasryhmäyleiskatsaus
                                </p>
                                <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                                  {coachHistoryMuscleGroups.map((group) => (
                                    <p key={group.key} className="text-[11px] text-[var(--text-muted)]">
                                      {group.label}: {Math.round(selectedRow.insight.muscleGroupLiftedKg[group.key])} kg
                                    </p>
                                  ))}
                                </div>
                              </div>
                            </div>

                            <div>
                              <Button
                                type="button"
                                variant="ghost"
                                className="w-full justify-between"
                                aria-expanded={isDetailsOpen}
                                onClick={() =>
                                  setExpandedWorkoutDetailsId((current) => (current === selectedRow.id ? null : selectedRow.id))
                                }
                              >
                                <span>Sarjat ja toistot</span>
                                {isDetailsOpen ? (
                                  <ChevronUp className="size-4" aria-hidden="true" />
                                ) : (
                                  <ChevronDown className="size-4" aria-hidden="true" />
                                )}
                              </Button>
                              {isDetailsOpen ? (
                                <div className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                                  {selectedRow.setGroups.length === 0 ? (
                                    <p className="text-sm text-[var(--text-subtle)]">Sarjadataa ei löytynyt tästä treenistä.</p>
                                  ) : (
                                    <div className="grid gap-2">
                                      {selectedRow.setGroups.map((group) => (
                                        <div
                                          key={group.key}
                                          className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                                        >
                                          <div className="flex flex-wrap items-start justify-between gap-2">
                                            <div>
                                              <p className="text-xs font-semibold text-[var(--text)]">
                                                {group.exerciseName}
                                                {group.supersetGroup ? ` · Superset ${group.supersetGroup}` : ""}
                                              </p>
                                              <p className="mt-1 text-[11px] text-[var(--text-subtle)]">
                                                Tavoite: {formatCoachTargetReps(group.logs[0])} toistoa
                                              </p>
                                            </div>
                                          </div>
                                          <div className="mt-2 space-y-2">
                                            {group.logs.map((log) => (
                                              <div
                                                key={log.id}
                                                className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
                                              >
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                  <p className="text-xs font-semibold text-[var(--text)]">Sarja {log.setLabel}</p>
                                                  <span
                                                    className={
                                                      log.done
                                                        ? "inline-flex items-center rounded-full border border-[var(--accent-tertiary)] px-2 py-0.5 text-[11px] font-semibold text-[var(--accent-tertiary)]"
                                                        : "inline-flex items-center rounded-full border border-[var(--danger)] px-2 py-0.5 text-[11px] font-semibold text-[var(--danger)]"
                                                    }
                                                  >
                                                    {log.done ? "Valmis" : "Kesken"}
                                                  </span>
                                                </div>
                                                <p className="mt-1 text-xs leading-5 text-[var(--text-subtle)]">
                                                  {formatCoachSetActual(log)}
                                                </p>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ) : null}
                            </div>
                          </div>

                          <div className="space-y-4">
                            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                              <div className="flex items-center gap-1">
                                <p className="text-sm font-semibold text-[var(--text)]">Muistiinpanot</p>
                                <InfoTooltip text="Treenaajan muistiinpanot kootaan tähän kohteen mukaan, jotta löydät saman treenialueen huomiot yhdestä paikasta." />
                              </div>
                              <p className="mt-1 text-xs text-[var(--text-subtle)]">
                                Kaikki saman treenialueen kirjaukset ilman että päivämäärää tarvitsee vaihtaa edestakaisin.
                              </p>
                              <div className="mt-3 max-h-56 space-y-3 overflow-y-auto pr-1">
                                {group.noteEntries.length ? (
                                  group.noteEntries.map((noteEntry) => (
                                    <div
                                      key={noteEntry.id}
                                      className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-3"
                                    >
                                      <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">
                                        {formatDateWithWeekday(noteEntry.completedAt)} · {noteEntry.occurrenceLabel}
                                      </p>
                                      <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">{noteEntry.body}</p>
                                    </div>
                                  ))
                                ) : (
                                  <p className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text-subtle)]">
                                    Tälle treenialueelle ei ole vielä kirjattu muistiinpanoja.
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                              <div className="flex items-center gap-1">
                                <p className="text-sm font-semibold text-[var(--text)]">Kommentit</p>
                                <InfoTooltip text="Kaikki tämän treenialueen viestit näkyvät yhdessä listassa riippumatta valitusta toteutuspäivästä." />
                              </div>
                              <p className="mt-1 text-xs text-[var(--text-subtle)]">
                                Näet valmentajan ja treenaajan kommunikoinnin samassa paikassa kuin toteuman.
                              </p>
                              <div className="mt-3 max-h-64 space-y-3 overflow-y-auto pr-1">
                                {group.conversationEntries.length ? (
                                  group.conversationEntries.map((entry) => (
                                    <div
                                      key={entry.id}
                                      className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                                    >
                                      <div className="flex flex-wrap items-center gap-2">
                                        <Badge className={coachConversationEntryTone(entry.type)}>
                                          {coachConversationEntryLabel(entry.type)}
                                        </Badge>
                                        <p className="text-xs text-[var(--text-subtle)]">
                                          {formatDateWithWeekday(entry.workoutCompletedAt)} · {entry.occurrenceLabel}
                                        </p>
                                      </div>
                                      <p className="mt-1 text-sm text-[var(--text-muted)]">{entry.body}</p>
                                      <p className="mt-1 text-xs text-[var(--text-subtle)]">{formatDateWithWeekday(entry.createdAt)}</p>
                                    </div>
                                  ))
                                ) : (
                                  <p className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text-subtle)]">
                                    Tälle treenialueelle ei ole vielä kertynyt kommentteja keskusteluvirtaan.
                                  </p>
                                )}
                              </div>
                              <div className="mt-3">
                                <Button type="button" variant="secondary" onClick={() => onOpenConversation?.()}>
                                  Avaa keskustelu
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
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

function CoachHistoryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
      <p className="text-[11px] font-semibold tracking-[0.04em] text-[var(--text-subtle)]">{label}</p>
      <p className="mt-1 text-sm font-medium text-[var(--text)]">{value}</p>
    </div>
  );
}

function CoachOverviewStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning";
}) {
  const toneClass =
    tone === "success"
      ? "border-[var(--accent-tertiary)] bg-[var(--surface)]"
      : tone === "warning"
        ? "border-[var(--danger)] bg-[var(--surface)]"
        : "border-[var(--border)] bg-[var(--surface)]";

  return (
    <div className={`rounded-xl border px-3 py-2 ${toneClass}`}>
      <p className="text-[11px] font-semibold tracking-[0.04em] text-[var(--text-subtle)]">{label}</p>
      <p className="mt-1 text-sm font-medium text-[var(--text)]">{value}</p>
    </div>
  );
}

function coachConversationEntryLabel(type: ConversationEntry["type"]) {
  return type === "comment" ? "Kommentti" : type;
}

function coachConversationEntryTone(type: ConversationEntry["type"]) {
  return type === "comment"
    ? "border-[var(--accent)] bg-[var(--surface)] text-[var(--accent)]"
    : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-subtle)]";
}

function formatCoachDuration(seconds: number) {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function formatCoachWorkoutDuration(seconds: number) {
  const safe = Math.max(0, seconds);
  if (safe < 3600) {
    return formatCoachDuration(safe);
  }

  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remainder = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function buildCoachExerciseSetGroups(
  session?: WorkoutSession,
  exerciseOrder?: Map<string, number>,
): CoachExerciseSetGroup[] {
  if (!session) {
    return [];
  }

  const grouped = new Map<string, CoachExerciseSetGroup>();
  const sortLogs = (logs: WorkoutSession["setLogs"]) =>
    [...logs].sort((left, right) => {
      const byLabel = compareCoachSetLabels(left.setLabel, right.setLabel);
      if (byLabel !== 0) {
        return byLabel;
      }

      return left.id.localeCompare(right.id);
    });

  session.setLogs.forEach((log) => {
    const key = log.templateExerciseId;
    const current = grouped.get(key);
    if (current) {
      grouped.set(key, {
        ...current,
        logs: sortLogs([...current.logs, log]),
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

  return Array.from(grouped.values()).sort((left, right) => {
    const leftOrder = exerciseOrder?.get(left.key) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = exerciseOrder?.get(right.key) ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return left.exerciseName.localeCompare(right.exerciseName, undefined, { sensitivity: "base" });
  });
}

function formatCoachSetTarget(log: WorkoutSession["setLogs"][number]) {
  const repsText = `${formatCoachTargetReps(log)} toistoa`;
  const loadText = log.targetLoad !== undefined ? `${log.targetLoad} kg` : "kuorma ei määritetty";
  return `${repsText} · ${loadText}`;
}

function formatCoachSetActual(log: WorkoutSession["setLogs"][number]) {
  const hasActualReps = log.actualReps !== undefined;
  const hasActualLoad = log.actualLoad !== undefined;
  if (!hasActualReps && !hasActualLoad) {
    return "ei toteumaa kirjattu";
  }

  const repsText = hasActualReps ? `${log.actualReps} toistoa` : "toistoja ei kirjattu";
  const loadText = hasActualLoad ? `${log.actualLoad} kg` : "kuormaa ei kirjattu";
  return `${repsText} · ${loadText}`;
}

function formatCoachTargetReps(log: WorkoutSession["setLogs"][number]) {
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

function formatTrendNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function PhaseBars({
  bars,
}: {
  bars: Array<{ label: string; cancelled: number; inProgress: number; completed: number }>;
}) {
  if (bars.length === 0) {
    return <p className="mt-3 text-sm text-[var(--text-muted)]">Ei vaihedataa vielä.</p>;
  }

  return (
    <div className="mt-3 grid gap-2">
      {bars.map((bar) => {
        const total = bar.cancelled + bar.inProgress + bar.completed;
        const cancelledWidth = total ? (bar.cancelled / total) * 100 : 0;
        const inProgressWidth = total ? (bar.inProgress / total) * 100 : 0;
        const completedWidth = total ? (bar.completed / total) * 100 : 0;

        return (
          <div key={bar.label} className="grid gap-1">
            <div className="flex items-center justify-between text-xs text-[var(--text-subtle)]">
              <span>{bar.label}</span>
              <span>{total} treeniä</span>
            </div>
            <div className="flex h-3 overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface)]">
              <div className="bg-[var(--danger)]/80" style={{ width: `${cancelledWidth}%` }} />
              <div className="bg-[var(--accent)]" style={{ width: `${inProgressWidth}%` }} />
              <div className="bg-[var(--accent-tertiary)]" style={{ width: `${completedWidth}%` }} />
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] text-[var(--text-subtle)]">
              <span>Keskeytetty {bar.cancelled}</span>
              <span>Kesken {bar.inProgress}</span>
              <span>Valmis {bar.completed}</span>
            </div>
          </div>
        );
      })}
      <div className="mt-1 flex flex-wrap gap-2 text-xs text-[var(--text-subtle)]">
        <Badge className="border-[var(--danger)] bg-[var(--surface)] text-[var(--danger)]">Keskeytetty</Badge>
        <Badge className="border-[var(--accent)] bg-[var(--surface)] text-[var(--accent)]">Kesken</Badge>
        <Badge className="border-[var(--accent-tertiary)] bg-[var(--surface)] text-[var(--accent-tertiary)]">Valmis</Badge>
      </div>
    </div>
  );
}

function createEmptyCoachMuscleGroupLiftedKg(): Record<CoachHistoryMuscleGroupKey, number> {
  return {
    shoulders: 0,
    arms: 0,
    chest: 0,
    abs: 0,
    back: 0,
    legs: 0,
    other: 0,
  };
}

function createEmptyCoachWorkoutInsight(): CoachWorkoutInsight {
  return {
    exerciseCount: 0,
    setCount: 0,
    completedSetCount: 0,
    completionPercent: 0,
    totalLoadKg: 0,
    liftedKg: 0,
    durationSeconds: 0,
    estimatedCalories: 0,
    muscleGroupLiftedKg: createEmptyCoachMuscleGroupLiftedKg(),
  };
}

function ensureCoachMuscleGroups(groups: CoachHistoryMuscleGroupKey[]): CoachHistoryMuscleGroupKey[] {
  return groups.length ? groups : ["other"];
}

function mapCoachCategoryToMuscleGroups(category?: string): CoachHistoryMuscleGroupKey[] {
  if (!category) {
    return [];
  }

  const normalized = category.toLowerCase();
  if (
    normalized.includes("koko kroppa") ||
    normalized.includes("full body") ||
    normalized.includes("whole body")
  ) {
    return [];
  }
  const groups = new Set<CoachHistoryMuscleGroupKey>();

  if (normalized.includes("hartia") || normalized.includes("shoulder")) groups.add("shoulders");
  if (normalized.includes("hauis") || normalized.includes("ojent") || normalized.includes("arm")) groups.add("arms");
  if (normalized.includes("rinta") || normalized.includes("chest")) groups.add("chest");
  if (normalized.includes("core") || normalized.includes("vatsa") || normalized.includes("abs")) groups.add("abs");
  if (normalized.includes("selkä") || normalized.includes("back")) groups.add("back");
  if (
    normalized.includes("alavartalo") ||
    normalized.includes("takaketju") ||
    normalized.includes("pakara") ||
    normalized.includes("leg") ||
    normalized.includes("glute") ||
    normalized.includes("hamstring") ||
    normalized.includes("quad")
  ) {
    groups.add("legs");
  }

  return Array.from(groups);
}

function mapCoachExerciseToMuscleGroups(
  category: string | undefined,
  exerciseName: string,
  explicitGroup?: string,
): CoachHistoryMuscleGroupKey[] {
  const mappedFromExplicit = parseCoachMuscleGroup(explicitGroup);
  if (mappedFromExplicit) {
    return [mappedFromExplicit];
  }

  const mappedFromCategory = mapCoachCategoryToMuscleGroups(category);
  if (mappedFromCategory.length > 0) {
    return mappedFromCategory;
  }

  const normalized = exerciseName.toLowerCase();
  const groups = new Set<CoachHistoryMuscleGroupKey>();

  if (normalized.includes("olkap") || normalized.includes("pystypunn") || normalized.includes("shoulder") || normalized.includes("overhead press") || normalized.includes("shoulder press")) groups.add("shoulders");
  if (normalized.includes("hauis") || normalized.includes("ojent") || normalized.includes("curl") || normalized.includes("tricep") || normalized.includes("bicep")) groups.add("arms");
  if (normalized.includes("penkki") || normalized.includes("rinta") || normalized.includes("punnerrus") || normalized.includes("chest") || normalized.includes("bench")) groups.add("chest");
  if (normalized.includes("vatsa") || normalized.includes("core") || normalized.includes("plank") || normalized.includes("abs")) groups.add("abs");
  if (normalized.includes("soutu") || normalized.includes("ylätalja") || normalized.includes("selkä") || normalized.includes("veto") || normalized.includes("row") || normalized.includes("pulldown") || normalized.includes("deadlift")) groups.add("back");
  if (normalized.includes("kyykky") || normalized.includes("jalka") || normalized.includes("askel") || normalized.includes("pakara") || normalized.includes("squat") || normalized.includes("leg") || normalized.includes("lunge") || normalized.includes("hip thrust")) groups.add("legs");

  return Array.from(groups);
}

function parseCoachMuscleGroup(value?: string): CoachHistoryMuscleGroupKey | undefined {
  if (!value) {
    return undefined;
  }

  switch (value) {
    case "shoulders":
    case "arms":
    case "chest":
    case "abs":
    case "back":
    case "legs":
    case "other":
      return value;
    default:
      return undefined;
  }
}

function buildCoachWorkoutInsights(
  state: AppState,
  athleteWorkouts: AppState["scheduledWorkouts"],
  sessionByWorkoutId: Map<string, WorkoutSession>,
) {
  const planById = new Map(state.plans.map((plan) => [plan.id, plan]));
  const exerciseById = new Map(state.exercises.map((exercise) => [exercise.id, exercise]));
  const userById = new Map(state.users.map((user) => [user.id, user]));
  const bodyMeasurementsByUserId = new Map(
    state.users.map((user) => [user.id, getMeasurementsForUser(state, user.id)]),
  );
  const insights = new Map<string, CoachWorkoutInsight>();

  athleteWorkouts.forEach((workout) => {
    const session = sessionByWorkoutId.get(workout.id);
    const insight = createEmptyCoachWorkoutInsight();

    if (session) {
      insight.exerciseCount = new Set(session.setLogs.map((log) => log.templateExerciseId)).size;
      insight.setCount = session.setLogs.length;
      insight.completedSetCount = session.setLogs.filter((log) => log.done).length;
      insight.completionPercent =
        insight.setCount > 0 ? Math.round((insight.completedSetCount / insight.setCount) * 100) : 0;
      insight.totalLoadKg = session.setLogs.reduce((sum, log) => {
        if (!log.done) {
          return sum;
        }
        return sum + (log.actualLoad ?? log.targetLoad ?? 0);
      }, 0);
      insight.liftedKg = session.setLogs.reduce((sum, log) => {
        if (!log.done) {
          return sum;
        }

        const reps = log.actualReps ?? log.targetReps;
        const load = log.actualLoad ?? log.targetLoad ?? 0;
        return sum + reps * load;
      }, 0);

      insight.durationSeconds = calculateSessionDurationSeconds(session);
      insight.estimatedCalories = estimateStrengthCalories({
        durationSeconds: insight.durationSeconds,
        completionPercent: insight.completionPercent,
        completedSetCount: insight.completedSetCount,
        weightKg: getWeightAtMoment(
          userById.get(workout.athleteId),
          bodyMeasurementsByUserId.get(workout.athleteId) ?? [],
          session.completedAt ?? session.updatedAt,
        ),
      });

      session.setLogs
        .filter((log) => log.done)
        .forEach((log) => {
          const category = exerciseById.get(log.exerciseId)?.category;
          const groups = ensureCoachMuscleGroups(
            mapCoachExerciseToMuscleGroups(category, log.exerciseName, log.muscleGroup),
          );
          const reps = log.actualReps ?? log.targetReps;
          const load = log.actualLoad ?? log.targetLoad ?? 0;
          const liftedForLog = reps * load;
          const distributedLiftedForLog = groups.length > 0 ? liftedForLog / groups.length : liftedForLog;
          groups.forEach((groupKey) => {
            insight.muscleGroupLiftedKg[groupKey] += distributedLiftedForLog;
          });
        });
    } else if (workout.trainingPlanId && workout.programWorkoutId) {
      const plan = planById.get(workout.trainingPlanId);
      const programWorkout = plan?.workouts?.find((item) => item.id === workout.programWorkoutId);
      if (programWorkout) {
        insight.exerciseCount = programWorkout.exercises.length;
        insight.setCount = programWorkout.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
      }
    }

    insights.set(workout.id, insight);
  });

  return insights;
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
        cancelled: 0,
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

    if (workout.status === "cancelled") {
      bucket.cancelled += 1;
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

  if (status === "cancelled") {
    return "border-[var(--danger)] bg-[var(--surface)] text-[var(--danger)]";
  }

  return "border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text-subtle)]";
}

function truncateText(value: string, length: number) {
  if (value.length <= length) {
    return value;
  }
  return `${value.slice(0, length).trimEnd()}...`;
}

function CoachConversationView({
  athletes,
  currentRole,
  currentUserId,
  entries,
  onSend,
  selectedAthleteId,
  onSelectAthlete,
  plans,
  scheduledWorkouts,
  templates,
  users,
}: {
  athletes: Array<{ id: string; fullName: string; email: string }>;
  currentRole: Role;
  currentUserId: string;
  entries: AppState["conversationEntries"];
  onSend: (
    body: string,
    options?: { scheduledWorkoutId?: string; trainingPlanId?: string; athleteId?: string; contextLabel?: string },
  ) => Promise<{ ok: true; scheduledWorkoutId?: string } | { ok: false; message: string }>;
  selectedAthleteId: string;
  onSelectAthlete: (athleteId: string) => void;
  plans: AppState["plans"];
  scheduledWorkouts: AppState["scheduledWorkouts"];
  templates: AppState["templates"];
  users: AppState["users"];
}) {
  const filteredEntries = useMemo(
    () =>
      entries
        .filter(
          (entry) => !selectedAthleteId || entry.athleteId === selectedAthleteId,
        )
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [entries, selectedAthleteId],
  );
  const contextOptions = useMemo(() => {
    const selectedAthletePlans = plans.filter((plan) => plan.athleteId === selectedAthleteId && isProgramActive(plan));
    const selectedAthleteWorkouts = scheduledWorkouts.filter(
      (workout) => workout.athleteId === selectedAthleteId,
    );

    return [
      { id: "general", label: "Yleinen keskustelu", contextType: "general" as const },
      ...buildWorkoutConversationContextOptions({
        workouts: selectedAthleteWorkouts,
        plans: selectedAthletePlans,
        templates,
      }),
      ...selectedAthletePlans.map((plan) => ({
        id: `program-${plan.id}`,
        label: `Ohjelma: ${plan.title}`,
        contextType: "program" as const,
        contextId: plan.id,
        contextLabel: plan.title,
      })),
    ];
  }, [plans, scheduledWorkouts, selectedAthleteId, templates]);
  const workoutOccurrenceLabelById = useMemo(() => {
    const selectedAthleteWorkouts = scheduledWorkouts.filter((workout) => workout.athleteId === selectedAthleteId);
    const titleMap = buildWorkoutHistoryTitleMap(selectedAthleteWorkouts);
    return new Map(
      Array.from(titleMap.entries()).map(([workoutId, info]) => [workoutId, info.occurrenceLabel]),
    );
  }, [scheduledWorkouts, selectedAthleteId]);

  if (!athletes.length) {
    return (
      <Card>
        <CardTitle className="text-2xl">Keskustelu</CardTitle>
        <CardDescription className="mt-2">
          Lisää ensin treenaaja rosteriin, niin yhteinen keskustelu alkaa kertyä tähän.
        </CardDescription>
      </Card>
    );
  }

  return (
    <ConversationPanel
      heading="Treenaajan keskusteluvirta"
      description="Seuraa yhdestä paikasta treenaajan ja valmentajan viestejä."
      entries={filteredEntries}
      users={users}
      currentRole={currentRole}
      currentUserId={currentUserId}
      emptyMessage="Valitulle treenaajalle ei ole vielä viestejä keskusteluvirrassa."
      contextOptions={contextOptions}
      occurrenceLabelByWorkoutId={workoutOccurrenceLabelById}
      onSend={(body, option) =>
        onSend(body, {
          scheduledWorkoutId: option.contextType === "workout" ? option.contextId : undefined,
          trainingPlanId: option.contextType === "program" ? option.contextId : undefined,
          athleteId: option.contextType === "general" ? selectedAthleteId : undefined,
          contextLabel: option.contextLabel,
        })
      }
      headerSlot={
        <div className="w-full lg:w-72">
          <Label htmlFor="coach-conversation-athlete-select">Treenaaja</Label>
          <Select
            id="coach-conversation-athlete-select"
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
      }
    />
  );
}
