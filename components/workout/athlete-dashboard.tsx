"use client";

import { Check, Flame, X } from "lucide-react";
import { startTransition, useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/field";
import { InfoTooltip } from "@/components/ui/tooltip";
import { canCompleteSession, getSessionProgress } from "@/lib/domain";
import type { AppState, WorkoutSession } from "@/lib/types";
import { formatDate, formatRelativeDate } from "@/lib/utils";
import { useAppState } from "@/providers/app-state-provider";

import { numberOrUndefined } from "@/components/workout/schemas";
import { scheduledStatusLabel, type WorkspaceView } from "@/components/workout/shared";

type PreviousExerciseResult = {
  actualReps?: number;
  actualLoad?: number;
  rpe?: number;
  completedAt: string;
  timesCompleted: number;
};

type WorkoutInsight = {
  exerciseCount: number;
  setCount: number;
  liftedKg: number;
};

type AthleteLogMode = "library" | "workout";

type ExerciseGroup = {
  key: string;
  exerciseName: string;
  supersetGroup?: string;
  logs: WorkoutSession["setLogs"];
};

export function AthleteDashboard({
  view,
  onOpenWorkoutLog,
}: {
  view: WorkspaceView;
  onOpenWorkoutLog?: () => void;
}) {
  const {
    currentUser,
    state,
    startWorkout,
    startProgramWorkout,
    updateWorkoutSet,
    saveWorkoutNote,
    completeWorkout,
    cancelWorkout,
    deleteWorkout,
  } = useAppState();
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(null);
  const [workoutMessage, setWorkoutMessage] = useState<string>("");
  const [athleteLogMode, setAthleteLogMode] = useState<AthleteLogMode>("library");
  const [historyFocusWorkoutId, setHistoryFocusWorkoutId] = useState<string | null>(null);
  const historySectionRef = useRef<HTMLDivElement | null>(null);
  const closeWorkoutView = () => {
    setHistoryFocusWorkoutId(null);
    setAthleteLogMode("library");
  };
  const athletePrograms = state.plans.filter(
    (plan) => plan.athleteId === currentUser?.id && Boolean(plan.workouts?.length),
  );

  const workouts = state.scheduledWorkouts
    .filter((item) => item.athleteId === currentUser?.id)
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));

  const selectedWorkout =
    workouts.find((item) => item.id === selectedWorkoutId) ??
    workouts.find((item) => item.status === "in_progress") ??
    workouts[workouts.length - 1];

  const selectedSession = state.sessions.find((session) => session.scheduledWorkoutId === selectedWorkout?.id);
  const existingNote = selectedSession ? state.notes.find((note) => note.sessionId === selectedSession.id)?.body ?? "" : "";
  const progress = selectedWorkout ? getSessionProgress(state, selectedWorkout.id) : null;
  const inProgressCount = workouts.filter((item) => item.status === "in_progress").length;
  const activeWorkout = workouts.find((item) => item.status === "in_progress");
  const selectedWorkoutCompletionCount =
    currentUser && selectedWorkout
      ? countWorkoutCompletions(state, currentUser.id, {
          templateId: selectedWorkout.templateId,
          programWorkoutId: selectedWorkout.programWorkoutId,
        })
      : 0;
  const previousExerciseResults = useMemo(
    () =>
      currentUser && selectedWorkout
        ? buildPreviousExerciseResults(
            state,
            currentUser.id,
            {
              templateId: selectedWorkout.templateId,
              programWorkoutId: selectedWorkout.programWorkoutId,
            },
            selectedWorkout.id,
          )
        : new Map<string, PreviousExerciseResult>(),
    [currentUser, selectedWorkout, state],
  );
  const workoutInsights = useMemo(() => buildWorkoutInsights(state), [state]);
  const selectedWorkoutInsight = selectedWorkout ? workoutInsights.get(selectedWorkout.id) : undefined;
  const openWorkoutView = (scheduledWorkoutId: string) => {
    setHistoryFocusWorkoutId(null);
    setSelectedWorkoutId(scheduledWorkoutId);
    setAthleteLogMode("workout");
  };
  const startWorkoutFromProgram = (programId: string, workoutId: string, workoutName: string) => {
    const result = startProgramWorkout(programId, workoutId);
    if (result.ok && result.scheduledWorkoutId) {
      openWorkoutView(result.scheduledWorkoutId);
      setWorkoutMessage(`Harjoitus "${workoutName}" käynnistetty.`);
      onOpenWorkoutLog?.();
      return;
    }

    setWorkoutMessage(result.ok ? "Harjoitus käynnistetty." : result.message);
  };
  const activeScheduledByProgramWorkoutId = useMemo(() => {
    const activeById = new Map<string, (typeof workouts)[number]>();

    workouts
      .filter((workout) => workout.programWorkoutId && workout.status !== "completed")
      .forEach((workout) => {
        if (!workout.programWorkoutId) {
          return;
        }

        const existing = activeById.get(workout.programWorkoutId);
        if (!existing || workout.updatedAt > existing.updatedAt) {
          activeById.set(workout.programWorkoutId, workout);
        }
      });

    return activeById;
  }, [workouts]);
  const workoutHistory = useMemo(
    () =>
      workouts
        .filter((workout) => Boolean(workout.programWorkoutId))
        .sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate)),
    [workouts],
  );
  const latestNoteByWorkoutId = useMemo(() => {
    const sessionById = new Map(state.sessions.map((session) => [session.id, session]));
    const notesByWorkoutId = new Map<string, { body: string; updatedAt: string }>();

    state.notes.forEach((note) => {
      const body = note.body.trim();
      if (!body) {
        return;
      }

      const session = sessionById.get(note.sessionId);
      if (!session) {
        return;
      }

      const existing = notesByWorkoutId.get(session.scheduledWorkoutId);
      if (!existing || note.updatedAt > existing.updatedAt) {
        notesByWorkoutId.set(session.scheduledWorkoutId, {
          body,
          updatedAt: note.updatedAt,
        });
      }
    });

    return notesByWorkoutId;
  }, [state.notes, state.sessions]);
  const weeklyInsights = useMemo(() => {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setHours(0, 0, 0, 0);
    const day = weekStart.getDay();
    const daysSinceMonday = (day + 6) % 7;
    weekStart.setDate(weekStart.getDate() - daysSinceMonday);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const toLocalDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate());
    const isWithinCurrentWeek = (value?: string) => {
      if (!value) {
        return false;
      }

      const parsed = new Date(value);
      const parsedDay = toLocalDay(parsed);
      return parsedDay >= weekStart && parsedDay < weekEnd;
    };
    const sessionByWorkoutId = new Map(
      state.sessions.map((session) => [session.scheduledWorkoutId, session]),
    );
    const trackedThisWeek = workouts.filter((workout) => {
      const session = sessionByWorkoutId.get(workout.id);
      if (!session) {
        return false;
      }

      return isWithinCurrentWeek(session.startedAt);
    });
    const completedThisWeek = trackedThisWeek.filter((workout) => workout.status === "completed");
    const completionRate = trackedThisWeek.length
      ? Math.round((completedThisWeek.length / trackedThisWeek.length) * 100)
      : 0;

    const weeklyVolume = trackedThisWeek
      .filter((workout) => workout.status === "completed")
      .reduce((sum, workout) => sum + (workoutInsights.get(workout.id)?.liftedKg ?? 0), 0);

    const latestCompleted = [...workouts]
      .filter((workout) => workout.status === "completed")
      .sort((a, b) => (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt))[0];
    const latestCompletedVolume = latestCompleted
      ? workoutInsights.get(latestCompleted.id)?.liftedKg ?? 0
      : 0;

    return {
      trackedCount: trackedThisWeek.length,
      completedCount: completedThisWeek.length,
      completionRate,
      weeklyVolume,
      latestCompleted,
      latestCompletedVolume,
    };
  }, [state.sessions, workoutInsights, workouts]);

  useEffect(() => {
    if (view !== "athlete-log" || athleteLogMode !== "library" || !historyFocusWorkoutId) {
      return;
    }

    const scrollTimer = window.setTimeout(() => {
      historySectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);

    return () => window.clearTimeout(scrollTimer);
  }, [athleteLogMode, historyFocusWorkoutId, view]);

  useEffect(() => {
    if (!historyFocusWorkoutId) {
      return;
    }

    const resetTimer = window.setTimeout(() => {
      setHistoryFocusWorkoutId(null);
    }, 5000);

    return () => window.clearTimeout(resetTimer);
  }, [historyFocusWorkoutId]);

  return (
    <div className="grid gap-6">
      {view === "overview" && (
        <Card className="border-[var(--border-strong)]">
          <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr] lg:items-center">
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Workout intelligence</p>
                <CardTitle className="mt-2 text-2xl">Tämän viikon treenipulssi</CardTitle>
                <CardDescription className="mt-2 max-w-3xl leading-7">
                  Näe yhdellä silmäyksellä mitä kannattaa tehdä seuraavaksi, miten viikko etenee ja mitä olet jo saanut aikaan.
                </CardDescription>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4">
                  <div className="flex items-center gap-1">
                    <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Viikon eteneminen</p>
                    <InfoTooltip text="Kuinka moni tällä viikolla käynnistetty treeni on jo merkitty valmiiksi." />
                  </div>
                  <p className="mt-2 text-lg font-semibold text-[var(--text)]">
                    {weeklyInsights.completedCount}/{weeklyInsights.trackedCount} treeniä valmiina
                  </p>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    {weeklyInsights.trackedCount > 0
                      ? "Tasainen eteneminen vie pitkälle. Jatkuvuus rakentaa tuloksia."
                      : "Tällä viikolla ei ole vielä käynnistettyjä treenejä."}
                  </p>
                </div>
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4">
                  <div className="flex items-center gap-1">
                    <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Nostettu tällä viikolla</p>
                    <InfoTooltip text="Luku lasketaan valmiista sarjoista kaavalla kuorma x toistot." />
                  </div>
                  <p className="mt-2 text-lg font-semibold text-[var(--text)]">{Math.round(weeklyInsights.weeklyVolume)} kg</p>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    Jokainen valmis sarja kasvattaa kokonaistyömäärää ja rakentaa progressiota.
                  </p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4">
                  <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">
                    {inProgressCount > 0 ? "Aktiivinen treeni" : "Päivän valinta"}
                  </p>
                  <p className="mt-2 text-lg font-semibold text-[var(--text)]">
                    {activeWorkout?.title ?? (athletePrograms.length ? "Valitse harjoitus ohjelmasta" : "Ei ajastettuja treenejä")}
                  </p>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    {activeWorkout
                      ? "Jatka siitä mihin jäit ja viimeistele sarjat."
                      : athletePrograms.length
                        ? "Voit valita vapaasti minkä tahansa ohjelmasi harjoituksen."
                        : "Luo valmentajan kanssa uusi treenikaari"}
                  </p>
                </div>
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4">
                  <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Viimeisin valmis treeni</p>
                  <p className="mt-2 text-lg font-semibold text-[var(--text)]">
                    {weeklyInsights.latestCompleted?.title ?? "Ei vielä valmiita treenejä"}
                  </p>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    {weeklyInsights.latestCompleted
                      ? `${formatRelativeDate(weeklyInsights.latestCompleted.completedAt ?? weeklyInsights.latestCompleted.updatedAt)} · ${Math.round(weeklyInsights.latestCompletedVolume)} kg`
                      : "Ensimmäinen valmis treeni näkyy tässä automaattisesti."}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid place-items-center rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-6">
              <ProgressRing label="Viikon eteneminen" percent={weeklyInsights.completionRate} />
            </div>
          </div>
        </Card>
      )}

      {view === "overview" && (
        <Card className="border-[var(--border-strong)]">
          <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Program explorer</p>
          <CardTitle className="text-2xl">Treeniohjelmat</CardTitle>
          <CardDescription className="mt-2">
            Näe ohjelmasi rakenne ja eteneminen. Treenin käynnistys tapahtuu Treeniloki-näkymässä.
          </CardDescription>
          <div className="mt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setAthleteLogMode("library");
                onOpenWorkoutLog?.();
              }}
            >
              Avaa Treeniloki
            </Button>
          </div>
          <div className="mt-5 grid gap-4">
            {athletePrograms.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">Sinulle ei ole vielä luotu ohjelmia.</p>
            ) : (
              athletePrograms.map((program) => (
                <div key={program.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                  <p className="font-semibold text-[var(--text)]">{program.title}</p>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {(program.workouts ?? []).map((workout) => {
                      const setCount = workout.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
                      const completionCount =
                        currentUser
                          ? countWorkoutCompletions(state, currentUser.id, {
                              programWorkoutId: workout.id,
                            })
                          : 0;
                      const activeScheduled = activeScheduledByProgramWorkoutId.get(workout.id);

                      return (
                        <div key={workout.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface-3)] p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium text-[var(--text)]">{workout.name}</p>
                              <p className="text-xs text-[var(--text-subtle)]">
                                {workout.exercises.length} liikettä · {setCount} sarjaa · oletuslepo {workout.defaultRestSeconds}s
                              </p>
                              <p className="mt-1 text-xs text-[var(--text-subtle)]">Tehty {completionCount} kertaa</p>
                            </div>
                            {activeScheduled ? (
                              <Badge className={statusTone(activeScheduled.status)}>
                                {scheduledStatusLabel(activeScheduled.status)}
                              </Badge>
                            ) : (
                              <Badge className="border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-subtle)]">
                                Ei aktiivinen
                              </Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      )}

      {view === "athlete-log" && (
        athleteLogMode === "workout" ? (
          <Card className="border-[var(--border-strong)] max-md:rounded-none max-md:border-0 max-md:bg-transparent max-md:p-0 max-md:shadow-none">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Treeni</p>
                <CardTitle className="text-2xl">{selectedWorkout?.title ?? "Aktiivinen treeni"}</CardTitle>
                <CardDescription className="mt-2">
                  {selectedWorkout
                    ? `${formatRelativeDate(selectedWorkout.scheduledDate)} · ${scheduledStatusLabel(selectedWorkout.status)}`
                    : "Valitse treeni listalta ja avaa se tähän näkymään."}
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="ghost"
                onClick={closeWorkoutView}
              >
                Takaisin treenilistaan
              </Button>
            </div>
            {progress ? (
              <div className="mt-4 rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-2)] p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="inline-flex items-center gap-1">
                      <p className="text-sm font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Progress</p>
                      <InfoTooltip text="Näyttää tämän treenin valmiit sarjat suhteessa kaikkiin sarjoihin." />
                    </div>
                    <p className="mt-1 font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--text)]">
                      {progress.completedSets}/{progress.totalSets} sarjaa
                    </p>
                  </div>
                  <Badge>{progress.percent}%</Badge>
                </div>
                {selectedWorkout?.status === "completed" ? (
                  <p className="mt-2 text-xs text-[var(--text-subtle)]">
                    Tässä treenissä nostettu yhteensä {Math.round(selectedWorkoutInsight?.liftedKg ?? 0)} kg.
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-[var(--text-subtle)]">
                    Tämä treeni tehty aiemmin {selectedWorkoutCompletionCount} kertaa ·{" "}
                    {selectedWorkoutInsight?.exerciseCount ?? 0} liikettä / {selectedWorkoutInsight?.setCount ?? 0} sarjaa.
                  </p>
                )}
                <div className="mt-4 h-3 overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface-3)]">
                  <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${progress.percent}%` }} />
                </div>
              </div>
            ) : null}
            {selectedWorkout ? (
              <AthleteSessionPanel
                note={existingNote}
                selectedSession={selectedSession}
                scheduledWorkoutId={selectedWorkout.id}
                scheduledWorkoutTitle={selectedWorkout.title}
                onStart={() => {
                  startWorkout(selectedWorkout.id);
                  setSelectedWorkoutId(selectedWorkout.id);
                  setWorkoutMessage("Treeni käynnistetty. Sarjaloki luotiin automaattisesti.");
                }}
                onUpdate={(logId, patch) => startTransition(() => updateWorkoutSet(selectedWorkout.id, logId, patch))}
                onSaveNote={(body) => saveWorkoutNote(selectedWorkout.id, body)}
                onComplete={() => {
                  const completedWorkoutId = selectedWorkout.id;
                  const result = completeWorkout(completedWorkoutId);
                  if (result.ok) {
                    setWorkoutMessage("Treeni merkittiin valmiiksi.");
                    setHistoryFocusWorkoutId(completedWorkoutId);
                    setAthleteLogMode("library");
                    return;
                  }

                  setWorkoutMessage(result.message);
                }}
                onCancel={() => {
                  const confirmed = window.confirm(
                    "Keskeytetäänkö treeni? Nykyiset sarjamerkinnät ja muistiinpanot poistetaan.",
                  );
                  if (!confirmed) {
                    return;
                  }

                  const result = cancelWorkout(selectedWorkout.id);
                  setWorkoutMessage(
                    result.ok
                      ? "Treeni keskeytettiin. Sarjamerkinnät ja muistiinpanot poistettiin."
                      : result.message,
                  );
                }}
                onDelete={() => {
                  const confirmed = window.confirm(
                    "Poistetaanko treeni kokonaan? Toimintoa ei voi kumota.",
                  );
                  if (!confirmed) {
                    return;
                  }

                  const result = deleteWorkout(selectedWorkout.id);
                  setWorkoutMessage(result.ok ? "Treeni poistettiin." : result.message);

                  if (result.ok) {
                    setSelectedWorkoutId(null);
                    setAthleteLogMode("library");
                  }
                }}
                canDeleteWorkout={Boolean(selectedWorkout.programWorkoutId)}
                status={selectedWorkout.status}
                onBackToList={closeWorkoutView}
                completionAllowed={canCompleteSession(state, selectedWorkout.id)}
                progress={progress}
                previousExerciseResults={previousExerciseResults}
                workoutMessage={workoutMessage}
              />
            ) : (
              <CardDescription className="mt-4">Ei vielä ajastettuja treenejä.</CardDescription>
            )}
          </Card>
        ) : (
          <div className="grid gap-6">
            <Card>
              <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Ohjelman harjoitukset</p>
              <CardTitle className="text-2xl">Valitse harjoitus</CardTitle>
              <CardDescription className="mt-2">
                Käynnistä treeni suoraan ohjelmasta. Historia löytyy omasta osiostaan alempaa.
              </CardDescription>
              {athletePrograms.length ? (
                <div className="mt-5 grid gap-4">
                  {athletePrograms.map((program) => (
                    <div key={program.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                      <p className="text-sm font-semibold text-[var(--text)]">{program.title}</p>
                      <div className="mt-3 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                        {(program.workouts ?? []).map((workout) => {
                          const setCount = workout.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
                          const completionCount =
                            currentUser
                              ? countWorkoutCompletions(state, currentUser.id, {
                                  programWorkoutId: workout.id,
                                })
                              : 0;
                          const activeScheduled = activeScheduledByProgramWorkoutId.get(workout.id);

                          return (
                            <div key={workout.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface-3)] p-3">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-medium text-[var(--text)]">{workout.name}</p>
                                  <p className="text-xs text-[var(--text-subtle)]">
                                    {workout.exercises.length} liikettä · {setCount} sarjaa · oletuslepo {workout.defaultRestSeconds}s
                                  </p>
                                  <p className="mt-1 text-xs text-[var(--text-subtle)]">Tehty {completionCount} kertaa</p>
                                </div>
                                {activeScheduled ? (
                                  <Badge className={statusTone(activeScheduled.status)}>
                                    {scheduledStatusLabel(activeScheduled.status)}
                                  </Badge>
                                ) : null}
                              </div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                <Button
                                  type="button"
                                  variant="secondary"
                                  onClick={() => startWorkoutFromProgram(program.id, workout.id, workout.name)}
                                >
                                  Aloita treeni
                                </Button>
                                {activeScheduled ? (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => openWorkoutView(activeScheduled.id)}
                                  >
                                    Avaa aktiivinen
                                  </Button>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--text-muted)]">
                  Sinulle ei ole vielä luotu ohjelmia. Pyydä valmentajaa lisäämään ohjelma.
                </p>
              )}
            </Card>
            <div ref={historySectionRef}>
              <Card>
                <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Treenihistoria</p>
                <CardTitle className="text-2xl">Historia</CardTitle>
                <CardDescription className="mt-2">
                  Valitse aiempi treeni tarkasteluun tai korjaukseen. Aktiiviset treenit löytyvät myös historiasta.
                </CardDescription>
                {workoutHistory.length === 0 ? (
                  <p className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--text-muted)]">
                    Historia on vielä tyhjä. Käynnistä ensimmäinen treeni ohjelmakorteista.
                  </p>
                ) : (
                  <div className="mt-5 grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                    {workoutHistory.map((workout) => {
                      const insight = workoutInsights.get(workout.id);
                      const isFocusedHistoryItem = historyFocusWorkoutId === workout.id;
                      const notePreview = createNotePreview(latestNoteByWorkoutId.get(workout.id)?.body);
                      return (
                        <button
                          key={workout.id}
                          className={`rounded-3xl border bg-[var(--surface-2)] p-5 text-left transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-3)] ${
                            isFocusedHistoryItem
                              ? "border-[var(--accent)] shadow-[0_0_0_1px_var(--accent)]"
                              : "border-[var(--border)]"
                          }`}
                          onClick={() => openWorkoutView(workout.id)}
                          type="button"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="font-medium text-[var(--text)]">{workout.title}</p>
                              <p className="text-sm text-[var(--text-muted)]">{formatRelativeDate(workout.scheduledDate)}</p>
                              <p className="mt-1 text-xs text-[var(--text-subtle)]">
                                {insight ? `${insight.exerciseCount} liikettä · ${insight.setCount} sarjaa` : "Liike- ja sarjamäärä päivittyy aloituksen jälkeen"}
                                {workout.status === "completed" && insight
                                  ? ` · nostettu ${Math.round(insight.liftedKg)} kg`
                                  : ""}
                              </p>
                              {currentUser ? (
                                <p className="mt-1 text-xs text-[var(--text-subtle)]">
                                  Tehty{" "}
                                  {countWorkoutCompletions(state, currentUser.id, {
                                    templateId: workout.templateId,
                                    programWorkoutId: workout.programWorkoutId,
                                  })}{" "}
                                  kertaa
                                </p>
                              ) : null}
                              {notePreview ? (
                                <div className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
                                  <p className="text-[11px] font-semibold tracking-[0.04em] text-[var(--text-subtle)]">
                                    Oma muistiinpano
                                  </p>
                                  <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{notePreview}</p>
                                </div>
                              ) : (
                                <p className="mt-2 text-xs text-[var(--text-subtle)]">Ei muistiinpanoa tästä treenistä.</p>
                              )}
                            </div>
                            <Badge className={`shrink-0 ${statusTone(workout.status)}`}>{scheduledStatusLabel(workout.status)}</Badge>
                          </div>
                          <WorkoutMiniProgress workoutId={workout.id} />
                        </button>
                      );
                    })}
                  </div>
                )}
              </Card>
            </div>
          </div>
        )
      )}
    </div>
  );
}

function AthleteSessionPanel({
  scheduledWorkoutId,
  scheduledWorkoutTitle,
  selectedSession,
  note,
  status,
  onStart,
  onUpdate,
  onSaveNote,
  onComplete,
  onCancel,
  onDelete,
  onBackToList,
  canDeleteWorkout,
  completionAllowed,
  progress,
  previousExerciseResults,
  workoutMessage,
}: {
  scheduledWorkoutId: string;
  scheduledWorkoutTitle: string;
  selectedSession?: WorkoutSession;
  note: string;
  status: string;
  onStart: () => void;
  onUpdate: (logId: string, patch: { actualReps?: number; actualLoad?: number; rpe?: number; done?: boolean }) => void;
  onSaveNote: (body: string) => void;
  onComplete: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onBackToList: () => void;
  canDeleteWorkout: boolean;
  completionAllowed: boolean;
  progress: { totalSets: number; completedSets: number; percent: number; allDone: boolean } | null;
  previousExerciseResults: Map<string, PreviousExerciseResult>;
  workoutMessage: string;
}) {
  const [localNote, setLocalNote] = useState(note);
  const [correctionMode, setCorrectionMode] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [restTotalSeconds, setRestTotalSeconds] = useState(0);
  const [restSecondsLeft, setRestSecondsLeft] = useState(0);
  const [restRunning, setRestRunning] = useState(false);
  const [restExerciseKey, setRestExerciseKey] = useState<string | null>(null);
  const [restExerciseName, setRestExerciseName] = useState<string | null>(null);
  const [expandedExerciseKeys, setExpandedExerciseKeys] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setLocalNote(note);
  }, [note, scheduledWorkoutId]);

  useEffect(() => {
    setCorrectionMode(false);
    setRestTotalSeconds(0);
    setRestSecondsLeft(0);
    setRestRunning(false);
    setRestExerciseKey(null);
    setRestExerciseName(null);
    setExpandedExerciseKeys({});
  }, [scheduledWorkoutId]);

  useEffect(() => {
    if (!selectedSession) {
      setElapsedSeconds(0);
      return;
    }

    const startedAt = new Date(selectedSession.startedAt).getTime();
    const getElapsed = () => {
      const finishedAt = selectedSession.completedAt
        ? new Date(selectedSession.completedAt).getTime()
        : Date.now();
      return Math.max(0, Math.round((finishedAt - startedAt) / 1000));
    };

    setElapsedSeconds(getElapsed());

    if (selectedSession.completedAt) {
      return;
    }

    const interval = window.setInterval(() => {
      setElapsedSeconds(getElapsed());
    }, 1000);

    return () => window.clearInterval(interval);
  }, [selectedSession]);

  useEffect(() => {
    if (!restRunning || restSecondsLeft <= 0) {
      return;
    }

    const interval = window.setInterval(() => {
      setRestSecondsLeft((value) => {
        const next = value - 1;
        if (next <= 0) {
          setRestRunning(false);
          setRestTotalSeconds(0);
          setRestExerciseKey(null);
          setRestExerciseName(null);
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [restRunning, restSecondsLeft]);

  const exerciseGroups = useMemo(() => {
    if (!selectedSession) {
      return [] as ExerciseGroup[];
    }

    const grouped = new Map<string, ExerciseGroup>();
    selectedSession.setLogs.forEach((log) => {
      const key = log.templateExerciseId;
      const current = grouped.get(key);
      if (current) {
        grouped.set(key, {
          ...current,
          logs: [...current.logs, log],
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
    return Array.from(grouped.values());
  }, [selectedSession]);

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
      const current = previous[group.key] ?? defaultExpandedKeys.has(group.key);
      const target = nextExpanded ?? !current;
      const next = { ...previous };
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
    setRestExerciseKey(exerciseKey);
    setRestExerciseName(exerciseName);
    setExpandedExerciseKeys((previous) => {
      const keys = supersetGroup
        ? (supersetMembersByGroup.get(supersetGroup) ?? [exerciseKey])
        : [exerciseKey];
      const next = { ...previous };
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
    setRestExerciseKey(null);
    setRestExerciseName(null);
  };

  const restartRestTimer = () => {
    if (restTotalSeconds < 1) {
      return;
    }

    setRestSecondsLeft(restTotalSeconds);
    setRestRunning(true);
  };

  const handleLogUpdate = (
    log: WorkoutSession["setLogs"][number],
    patch: { actualReps?: number; actualLoad?: number; rpe?: number; done?: boolean },
  ) => {
    onUpdate(log.id, patch);

    if (patch.done === true && !log.done && log.supersetGroup) {
      selectedSession?.setLogs.forEach((candidate) => {
        if (
          candidate.id !== log.id &&
          candidate.supersetGroup === log.supersetGroup &&
          candidate.setLabel === log.setLabel &&
          !candidate.done
        ) {
          onUpdate(candidate.id, { done: true });
        }
      });
    }

    if (patch.done === true && !log.done) {
      startRestTimer(log.targetRestSeconds ?? 90, log.templateExerciseId, log.exerciseName, log.supersetGroup);
    }
  };

  const readOnly = status === "completed" && !correctionMode;
  const renderExerciseGroupCard = (group: ExerciseGroup) => {
    const exerciseKey = group.key;
    const exerciseName = group.exerciseName;
    const logs = group.logs;
    const supersetGroup = group.supersetGroup;
    const completedInExercise = logs.filter((log) => log.done).length;
    const previous = previousExerciseResults.get(logs[0]?.exerciseId ?? "");
    const isExpanded = getIsExpanded(group);

    return (
      <div
        key={exerciseKey}
        className={`rounded-2xl border bg-[var(--surface-2)] p-4 ${
          supersetGroup
            ? "border-[var(--accent)]/60 shadow-[0_10px_26px_-20px_var(--accent)]"
            : "border-[var(--border)]"
        }`}
      >
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-1">
              <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">
                {supersetGroup ? `Superset ${supersetGroup}` : "Liike"}
              </p>
              {supersetGroup ? (
                <InfoTooltip text="Supersetissä tämän ryhmän liikkeet tehdään vuorotellen. Saman sarjan kuittaus peilautuu ryhmän muihin liikkeisiin." />
              ) : null}
            </div>
            <p className="font-medium text-[var(--text)]">{exerciseName}</p>
            {status === "completed" && previous ? (
              <p className="mt-1 text-xs text-[var(--text-subtle)]">
                Tehty {previous.timesCompleted} kertaa · viimeksi {formatDate(previous.completedAt)} · {formatPreviousExerciseResult(previous)}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{completedInExercise}/{logs.length} sarjaa tehty</Badge>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setGroupExpansion(group)}
            >
              {isExpanded ? "Piilota" : `Avaa${supersetGroup ? " supersetti" : ""}`}
            </Button>
          </div>
        </div>
        {isExpanded ? (
          <>
            <div className="hidden md:grid md:grid-cols-[1fr_1fr_0.9fr_auto] md:gap-3 md:px-3 md:text-[11px] md:font-semibold md:tracking-[0.04em] md:text-[var(--text-subtle)]">
              <span>Toistot</span>
              <span>Kuorma (kg)</span>
              <span className="inline-flex items-center gap-1">
                RPE
                <InfoTooltip text="RPE kertoo, kuinka raskaalta sarja tuntui asteikolla 1-10. Lisätoistot tarkoittavat arviota siitä, montako toistoa olisi vielä ollut varaa tehdä hyvällä tekniikalla (ei tehdä niitä heti). 10 = 0 toistoa varaa, 9 = noin 1 toisto varaa, 8 = noin 2 toistoa varaa." />
              </span>
              <span className="inline-flex items-center gap-1">
                Tila
                <InfoTooltip text="Merkitse sarja tehdyksi kun sarja on valmis. Voit myös kumota kuittauksen tarvittaessa." />
              </span>
            </div>
            <div className="mt-3 grid gap-3">
              {logs.map((log) => (
                <div key={log.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-3)] p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--text)]">Sarja {log.setLabel}</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      tavoite {formatTargetReps(log)} toistoa {log.targetLoad ? `· ${log.targetLoad} kg` : ""}
                    </p>
                  </div>
                  <div className="mt-2 grid grid-cols-[1fr_1fr_0.9fr] items-start gap-2">
                    <div className="min-w-0 space-y-1">
                      <Label
                        className="mb-0 inline-flex h-5 items-center text-[10px] font-semibold tracking-[0.03em] text-[var(--text-subtle)]"
                        htmlFor={`${scheduledWorkoutId}-${log.id}-reps`}
                      >
                        Toistot
                      </Label>
                      <Input
                        id={`${scheduledWorkoutId}-${log.id}-reps`}
                        type="number"
                        min={0}
                        placeholder="Toistot"
                        aria-label={`${exerciseName} sarja ${log.setLabel} toteutuneet toistot`}
                        value={log.actualReps ?? ""}
                        disabled={readOnly}
                        onChange={(event) => handleLogUpdate(log, { actualReps: numberOrUndefined(event.target.value) })}
                      />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <Label
                        className="mb-0 inline-flex h-5 items-center text-[10px] font-semibold tracking-[0.03em] text-[var(--text-subtle)]"
                        htmlFor={`${scheduledWorkoutId}-${log.id}-load`}
                      >
                        Kuorma (kg)
                      </Label>
                      <Input
                        id={`${scheduledWorkoutId}-${log.id}-load`}
                        type="number"
                        min={0}
                        step="0.5"
                        placeholder="Kuorma"
                        aria-label={`${exerciseName} sarja ${log.setLabel} toteutunut kuorma`}
                        value={log.actualLoad ?? ""}
                        disabled={readOnly}
                        onChange={(event) => handleLogUpdate(log, { actualLoad: numberOrUndefined(event.target.value) })}
                      />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <Label
                        className="mb-0 inline-flex h-5 items-center gap-1 text-[10px] font-semibold tracking-[0.03em] text-[var(--text-subtle)]"
                        htmlFor={`${scheduledWorkoutId}-${log.id}-rpe`}
                      >
                        RPE
                        <InfoTooltip
                          className="align-middle"
                          text="RPE kertoo, kuinka raskaalta sarja tuntui asteikolla 1-10. Lisätoistot tarkoittavat arviota siitä, montako toistoa olisi vielä ollut varaa tehdä hyvällä tekniikalla (ei tehdä niitä heti). 10 = 0 toistoa varaa, 9 = noin 1 toisto varaa, 8 = noin 2 toistoa varaa."
                        />
                      </Label>
                      <Input
                        id={`${scheduledWorkoutId}-${log.id}-rpe`}
                        type="number"
                        min={1}
                        max={10}
                        step={1}
                        placeholder="RPE"
                        aria-label={`${exerciseName} sarja ${log.setLabel} RPE`}
                        value={log.rpe ?? ""}
                        disabled={readOnly}
                        onChange={(event) => handleLogUpdate(log, { rpe: numberOrUndefined(event.target.value) })}
                      />
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-end gap-2">
                    <p className="inline-flex items-center gap-1 text-[10px] font-semibold tracking-[0.03em] text-[var(--text-subtle)]">
                      Tila
                      <InfoTooltip
                        className="align-middle"
                        text="Merkitse sarja tehdyksi kun sarja on valmis. Voit myös kumota kuittauksen tarvittaessa."
                      />
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      className={`size-9 rounded-full p-0 ${
                        log.done
                          ? "border-[#9c2217] bg-[var(--danger)] text-white hover:brightness-105"
                          : "border-[var(--success)] bg-[var(--success)] text-white hover:brightness-105"
                      }`}
                      disabled={readOnly}
                      aria-pressed={log.done}
                      aria-label={log.done ? "Kumoa kuittaus" : "Merkitse tehdyksi"}
                      title={log.done ? "Kumoa kuittaus" : "Merkitse tehdyksi"}
                      onClick={() => handleLogUpdate(log, { done: !log.done })}
                    >
                      {log.done ? <X className="size-5" aria-hidden="true" /> : <Check className="size-5" aria-hidden="true" />}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-xs text-[var(--text-subtle)]">
            Liike piilotettu. Avaa haitari nähdäksesi sarjat.
          </p>
        )}
      </div>
    );
  };

  if (!selectedSession && status === "scheduled") {
    return (
      <div className="mt-5 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-2)] p-6">
        <p className="font-medium text-[var(--text)]">{scheduledWorkoutTitle}</p>
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

  if (!selectedSession) {
    return (
      <div className="mt-5">
        <Button onClick={onStart} type="button">
          Jatka treeniä
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Badge>{scheduledStatusLabel(status)}</Badge>
        <p className="text-sm text-[var(--text-muted)]">Käynnistetty {formatDate(selectedSession.startedAt)}</p>
        <Badge className="border-[var(--accent)] bg-[var(--surface-3)] text-[var(--accent)]">
          Treeniaika {formatDuration(elapsedSeconds)}
        </Badge>
        {readOnly ? <Badge className="border-[var(--accent-secondary)] bg-[var(--surface-3)] text-[var(--accent-secondary)]">Lukittu</Badge> : null}
      </div>
      <p aria-live="polite" className="sr-only">
        {workoutMessage}
      </p>
      {exerciseRenderBlocks.map((block) => {
        if (block.type === "single") {
          return renderExerciseGroupCard(block.groups[0]!);
        }

        return (
          <div key={block.key} className="rounded-3xl border border-[var(--accent)] bg-[var(--surface-3)]/60 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[var(--accent)]">
                Superset {block.supersetGroup}
              </p>
              <Badge className="border-[var(--accent)] bg-[var(--surface)] text-[var(--accent)]">
                {block.groups.length} liikettä
              </Badge>
            </div>
            <div className="grid gap-3">
              {block.groups.map((group) => renderExerciseGroupCard(group))}
            </div>
          </div>
        );
      })}

      <div>
        <div className="mb-1 flex items-center gap-1">
          <Label className="mb-0" htmlFor={`${scheduledWorkoutId}-note`}>Treenin muistiinpanot</Label>
          <InfoTooltip text="Kirjoita tähän fiilis, kipu tai muu huomio. Valmentaja näkee tämän treenin yhteenvedossa." />
        </div>
        <Textarea
          id={`${scheduledWorkoutId}-note`}
          value={localNote}
          disabled={readOnly}
          onChange={(event) => {
            setLocalNote(event.target.value);
            onSaveNote(event.target.value);
          }}
          placeholder="Miltä treeni tuntui? Oliko kipua, erityisiä huomioita tai jotain mitä valmentajan pitää nähdä heti?"
        />
      </div>

      {status !== "completed" && restTotalSeconds > 0 && restExerciseKey ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-end px-4 pb-[max(env(safe-area-inset-bottom),0px)] md:px-6">
          <div className="pointer-events-auto w-full max-w-sm rounded-2xl border border-[var(--accent)] bg-[var(--surface)] p-4 shadow-[0_14px_30px_-18px_var(--shadow)]">
            <div className="flex items-center gap-4">
              <div
                className="grid size-20 place-items-center rounded-full"
                style={{
                  background: `conic-gradient(var(--accent) ${
                    restTotalSeconds > 0 ? Math.round((restSecondsLeft / restTotalSeconds) * 100) : 0
                  }%, var(--surface-4) ${
                    restTotalSeconds > 0 ? Math.round((restSecondsLeft / restTotalSeconds) * 100) : 0
                  }% 100%)`,
                }}
              >
                <div className="grid size-16 place-items-center rounded-full border border-[var(--border)] bg-[var(--surface)]">
                  <p className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--text)]">
                    {formatDuration(restSecondsLeft)}
                  </p>
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="inline-flex items-center gap-1">
                  <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">
                    Lepoajastin
                  </p>
                  <InfoTooltip
                    side="top"
                    text="Ajastin käynnistyy, kun sarja merkitään tehdyksi. Ohita lopettaa nykyisen levon."
                  />
                </div>
                <p className="truncate text-sm font-medium text-[var(--text)]">{restExerciseName ?? "Liike"}</p>
                <p className="text-xs text-[var(--text-muted)]">Aloitus {formatDuration(restTotalSeconds)}</p>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <Button type="button" variant="ghost" className="flex-1 py-2 text-sm" onClick={skipRestTimer}>
                Ohita
              </Button>
              <Button type="button" variant="secondary" className="flex-1 py-2 text-sm" onClick={restartRestTimer}>
                Uudelleen
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="rounded-none border-0 bg-transparent p-0 shadow-none md:sticky md:bottom-3 md:z-10 md:rounded-2xl md:border md:border-[var(--border-strong)] md:bg-[var(--surface)] md:p-3 md:shadow-[0_12px_30px_-18px_var(--shadow)]">
        <div className="flex flex-wrap gap-3">
          <Button onClick={onBackToList} type="button" variant="ghost" className="w-full sm:w-auto">
            Takaisin treenilistaan
          </Button>
          {status !== "completed" ? (
            <>
              <Button onClick={onComplete} type="button" className="w-full sm:w-auto" disabled={!completionAllowed}>
                Merkitse treeni valmiiksi
              </Button>
              {status === "in_progress" ? (
                <Button onClick={onCancel} type="button" variant="secondary">
                  Keskeytä treeni
                </Button>
              ) : null}
              {canDeleteWorkout ? (
                <Button onClick={onDelete} type="button" variant="danger">
                  Poista treeni
                </Button>
              ) : null}
            </>
          ) : (
            <div className="inline-flex items-center gap-1">
              <Button onClick={() => setCorrectionMode((value) => !value)} type="button" variant={correctionMode ? "secondary" : "ghost"}>
                {correctionMode ? "Sulje korjaustila" : "Avaa korjaustila"}
              </Button>
              <InfoTooltip
                side="top"
                text="Korjaustilassa voit muokata valmiin treenin sarjamerkintöjä ja muistiinpanoja."
              />
            </div>
          )}
        </div>
      </div>
      {!completionAllowed && status !== "completed" && progress ? (
        <p className="text-sm text-[var(--text-muted)]">
          Merkitse kaikki sarjat tehdyiksi ennen valmistumista. Nyt valmiina {progress.completedSets}/{progress.totalSets}.
        </p>
      ) : null}
    </div>
  );
}

function buildWorkoutInsights(state: AppState) {
  const sessionByWorkoutId = new Map(
    state.sessions.map((session) => [session.scheduledWorkoutId, session]),
  );
  const templateById = new Map(state.templates.map((template) => [template.id, template]));
  const planById = new Map(state.plans.map((plan) => [plan.id, plan]));
  const insights = new Map<string, WorkoutInsight>();

  state.scheduledWorkouts.forEach((workout) => {
    const session = sessionByWorkoutId.get(workout.id);
    let exerciseCount = 0;
    let setCount = 0;

    if (session) {
      exerciseCount = new Set(session.setLogs.map((log) => log.templateExerciseId)).size;
      setCount = session.setLogs.length;
    } else if (workout.templateId) {
      const template = templateById.get(workout.templateId);
      if (template) {
        exerciseCount = template.blocks.reduce((sum, block) => sum + block.exercises.length, 0);
        setCount = template.blocks.reduce(
          (sum, block) => sum + block.exercises.reduce((exerciseSum, exercise) => exerciseSum + exercise.sets.length, 0),
          0,
        );
      }
    } else if (workout.trainingPlanId && workout.programWorkoutId) {
      const plan = planById.get(workout.trainingPlanId);
      const programWorkout = plan?.workouts?.find((item) => item.id === workout.programWorkoutId);
      if (programWorkout) {
        exerciseCount = programWorkout.exercises.length;
        setCount = programWorkout.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
      }
    }

    const liftedKg = session
      ? session.setLogs.reduce((sum, log) => {
          if (!log.done || log.actualLoad === undefined || log.actualReps === undefined) {
            return sum;
          }

          return sum + log.actualLoad * log.actualReps;
        }, 0)
      : 0;

    insights.set(workout.id, {
      exerciseCount,
      setCount,
      liftedKg,
    });
  });

  return insights;
}

function countWorkoutCompletions(
  state: AppState,
  athleteId: string,
  workoutRef: { templateId?: string; programWorkoutId?: string },
) {
  if (!workoutRef.templateId && !workoutRef.programWorkoutId) {
    return 0;
  }

  return state.scheduledWorkouts.filter(
    (workout) =>
      workout.athleteId === athleteId &&
      (workoutRef.programWorkoutId
        ? workout.programWorkoutId === workoutRef.programWorkoutId
        : workout.templateId === workoutRef.templateId) &&
      workout.status === "completed",
  ).length;
}

function buildPreviousExerciseResults(
  state: AppState,
  athleteId: string,
  workoutRef: { templateId?: string; programWorkoutId?: string },
  currentScheduledWorkoutId: string,
) {
  if (!workoutRef.templateId && !workoutRef.programWorkoutId) {
    return new Map<string, PreviousExerciseResult>();
  }

  const previousWorkouts = state.scheduledWorkouts
    .filter(
      (workout) =>
        workout.athleteId === athleteId &&
        (workoutRef.programWorkoutId
          ? workout.programWorkoutId === workoutRef.programWorkoutId
          : workout.templateId === workoutRef.templateId) &&
        workout.id !== currentScheduledWorkoutId &&
        workout.status === "completed",
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const previousWorkoutIds = new Set(previousWorkouts.map((workout) => workout.id));
  const exerciseCompletionCount = new Map<string, number>();

  state.sessions
    .filter((session) => previousWorkoutIds.has(session.scheduledWorkoutId))
    .forEach((session) => {
      const exercisesInSession = new Set(
        session.setLogs.filter((log) => log.done).map((log) => log.exerciseId),
      );
      exercisesInSession.forEach((exerciseId) => {
        exerciseCompletionCount.set(exerciseId, (exerciseCompletionCount.get(exerciseId) ?? 0) + 1);
      });
    });

  const result = new Map<string, PreviousExerciseResult>();

  state.sessions
    .filter((session) => previousWorkoutIds.has(session.scheduledWorkoutId))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .forEach((session) => {
      session.setLogs.forEach((log) => {
        if (result.has(log.exerciseId)) {
          return;
        }

        if (!log.done && log.actualReps === undefined && log.actualLoad === undefined && log.rpe === undefined) {
          return;
        }

        result.set(log.exerciseId, {
          actualReps: log.actualReps,
          actualLoad: log.actualLoad,
          rpe: log.rpe,
          completedAt: session.completedAt ?? session.updatedAt,
          timesCompleted: exerciseCompletionCount.get(log.exerciseId) ?? 0,
        });
      });
    });

  return result;
}

function formatPreviousExerciseResult(previous: PreviousExerciseResult) {
  const parts: string[] = [];

  if (previous.actualReps !== undefined) {
    parts.push(`${previous.actualReps} toistoa`);
  }
  if (previous.actualLoad !== undefined) {
    parts.push(`${previous.actualLoad} kg`);
  }
  if (previous.rpe !== undefined) {
    parts.push(`RPE ${previous.rpe}`);
  }

  return parts.length ? parts.join(" · ") : "ei tallennettua dataa";
}

function formatDuration(seconds: number) {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function createNotePreview(note?: string, maxLength = 160) {
  if (!note) {
    return "";
  }

  if (note.length <= maxLength) {
    return note;
  }

  return `${note.slice(0, maxLength - 1).trimEnd()}…`;
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

function statusTone(status: string) {
  switch (status) {
    case "completed":
      return "border-[var(--accent-tertiary)] bg-[var(--surface-3)] text-[var(--accent-tertiary)]";
    case "in_progress":
      return "border-[var(--accent)] bg-[var(--surface-3)] text-[var(--accent)]";
    default:
      return "border-[var(--border-strong)] bg-[var(--surface-3)] text-[var(--text-subtle)]";
  }
}

function ProgressRing({ percent, label }: { percent: number; label: string }) {
  return (
    <div className="flex flex-col items-center text-center">
      <div
        aria-label={`${label} ${percent}%`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={percent}
        className="grid size-36 place-items-center rounded-full"
        role="progressbar"
        style={{
          background: `conic-gradient(var(--accent) ${percent}%, var(--surface-4) ${percent}% 100%)`,
        }}
      >
        <div className="grid size-28 place-items-center rounded-full border border-[var(--border)] bg-[var(--surface)]">
          <Flame className="mb-1 size-4 text-[var(--accent)]" />
          <p className="font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--text)]">{percent}%</p>
        </div>
      </div>
      <p className="mt-3 text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">{label}</p>
    </div>
  );
}

function WorkoutMiniProgress({ workoutId }: { workoutId: string }) {
  const { state } = useAppState();
  const progress = getSessionProgress(state, workoutId);

  if (!progress || progress.totalSets === 0) {
    return (
      <p className="mt-3 text-xs text-[var(--text-subtle)]">Sessiota ei vielä käynnistetty.</p>
    );
  }

  return (
    <div className="mt-3">
      <div className="h-2 overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface)]">
        <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${progress.percent}%` }} />
      </div>
      <p className="mt-1 text-xs text-[var(--text-subtle)]">
        {progress.completedSets}/{progress.totalSets} sarjaa valmiina
      </p>
    </div>
  );
}
