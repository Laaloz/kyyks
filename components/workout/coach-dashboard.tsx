"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  CircleCheckBig,
  ClipboardList,
  ClipboardPenLine,
  type LucideIcon,
  MoreHorizontal,
  Plus,
  Search,
  X,
} from "lucide-react";
import { type CSSProperties, type ReactNode, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { type Resolver, useFieldArray, useForm } from "react-hook-form";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/field";
import { InfoTooltip } from "@/components/ui/tooltip";
import { ConversationPanel } from "@/components/workout/conversation-panel";
import { InlineFeedback } from "@/components/workout/inline-feedback";
import { MetricTrendChart } from "@/components/workout/metric-trend-chart";
import { OwnMeasurementsCard } from "@/components/workout/own-measurements-card";
import { CoachInvitePanel } from "@/components/workout/coach/invite-panel";
import { ProgramWorkoutEditor } from "@/components/workout/coach/program-workout-editor";
import {
  type ProgramComposerExerciseFormValues,
  type ProgramComposerFormValues,
  type ProgramComposerValues,
} from "@/components/workout/coach/program-composer";
import { estimateStrengthCalories, getLatestMeasurement, getMeasurementsForUser, getWeightAtMoment } from "@/lib/body-metrics";
import { isConversationEntryNotifiable } from "@/lib/conversation";
import { calculateSessionDurationSeconds, getCoachConversationAthletes, splitLabel } from "@/lib/domain";
import { buildExerciseProgressCatalog } from "@/lib/exercise-progress";
import { withMinimumDelay } from "@/lib/min-delay";
import { deriveProgramWorkoutGuidance } from "@/lib/program-workout-guidance";
import { buildScheduledWorkoutExerciseOrder } from "@/lib/workout-exercise-order";
import { buildWorkoutHistoryTitleMap } from "@/lib/workout-history-title";
import { getProgramStatus, isProgramActive } from "@/lib/program-status";
import { isAdminRole } from "@/lib/role-access";
import type { AppState, ConversationEntry, Role, ScheduledWorkoutStatus, WorkoutSession } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatDate, formatDateWithWeekday } from "@/lib/utils";
import { canDeleteProgramFromState, useAppState } from "@/providers/app-state-provider";

import {
  CUSTOM_EXERCISE_VALUE,
  emptyProgramWorkoutExercise,
  emptyProgramWorkout,
  programComposerSchema,
} from "@/components/workout/schemas";
import { OwnTrainingOverviewCard, PROGRAMS_WORKSPACE_VIEW, workoutStatusBadgeClass, workoutStatusLabel, type WorkspaceView } from "@/components/workout/shared";

type CoachHistoryMuscleGroupKey = "shoulders" | "arms" | "chest" | "abs" | "back" | "legs" | "other";
type ProgramWorkspaceTab = "library" | "builder";

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

type ComposerIssue = {
  id: string;
  severity: "error";
  label: string;
  fieldPath: string;
  workoutIndex?: number;
  exerciseIndex?: number;
};

type ComposerView = "details" | "workouts" | "review";
type ProgramCopyTargetState = {
  programId: string;
  targetAthleteId: string;
};
type ProgramMenuAnchorRect = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

const programMenuPadding = 8;
const programMenuOffset = 6;

function toProgramMenuAnchorRect(rect: DOMRect): ProgramMenuAnchorRect {
  return {
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    left: rect.left,
  };
}

function getHiddenProgramMenuStyle(anchor: ProgramMenuAnchorRect): CSSProperties {
  return {
    position: "fixed",
    top: anchor.bottom + programMenuOffset,
    left: Math.max(programMenuPadding, anchor.right - 240),
    maxWidth: `calc(100vw - ${programMenuPadding * 2}px)`,
    visibility: "hidden",
  };
}

function getProgramMenuStyle(anchor: ProgramMenuAnchorRect, menuElement: HTMLElement): CSSProperties {
  const menuRect = menuElement.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  const preferredLeft = anchor.right - menuRect.width;
  const maxLeft = viewportWidth - menuRect.width - programMenuPadding;
  const left = Math.max(programMenuPadding, Math.min(preferredLeft, maxLeft));

  const spaceBelow = viewportHeight - anchor.bottom - programMenuPadding;
  const spaceAbove = anchor.top - programMenuPadding;
  const placeAbove = spaceBelow < menuRect.height && spaceAbove > spaceBelow;
  const preferredTop = placeAbove
    ? anchor.top - menuRect.height - programMenuOffset
    : anchor.bottom + programMenuOffset;
  const maxTop = viewportHeight - menuRect.height - programMenuPadding;
  const top = Math.max(programMenuPadding, Math.min(preferredTop, maxTop));

  return {
    position: "fixed",
    top,
    left,
    maxWidth: viewportWidth - programMenuPadding * 2,
    maxHeight: viewportHeight - programMenuPadding * 2,
    overflowX: "hidden",
    overflowY: "auto",
  };
}

function getComposerWorkoutLabel(
  workout: ProgramComposerFormValues["workouts"][number] | null | undefined,
  index?: number,
) {
  const derivedName = workout?.nameOverride?.trim() || splitLabel(workout?.splitType);
  if (derivedName) {
    return derivedName;
  }

  return typeof index === "number" ? `Päivä ${index + 1}` : "Nimeämätön päivä";
}

function getWorkoutExercisePreview(
  workout: ProgramComposerFormValues["workouts"][number] | null | undefined,
  exerciseNameById: Map<string, string>,
  limit = 3,
) {
  const exercises = workout?.exercises ?? [];
  const names = exercises
    .map((exercise, index) => {
      const isCustom = exercise.exerciseId === CUSTOM_EXERCISE_VALUE;
      const customName = exercise.customExerciseName?.trim();
      const overrideName = exercise.exerciseNameOverride?.trim();
      if (overrideName) {
        return overrideName;
      }
      if (isCustom) {
        return customName || `Oma liike ${index + 1}`;
      }
      return exerciseNameById.get(exercise.exerciseId) || customName || `Liike ${index + 1}`;
    })
    .filter(Boolean);

  if (!names.length) {
    return { names: [], extraCount: 0 };
  }

  return {
    names: names.slice(0, limit),
    extraCount: Math.max(0, names.length - limit),
  };
}

function RequiredLabel({
  htmlFor,
  children,
  optional = false,
  className,
}: {
  htmlFor?: string;
  children: string;
  optional?: boolean;
  className?: string;
}) {
  return (
    <Label htmlFor={htmlFor} className={className}>
      {children}
      {optional ? " (valinnainen)" : " *"}
    </Label>
  );
}

function FieldError({
  id,
  message,
}: {
  id: string;
  message?: string;
}) {
  if (!message) {
    return null;
  }

  return (
    <p id={id} className="mt-1 text-sm text-[var(--danger)]">
      {message}
    </p>
  );
}

function mapComposerIssueLabel(path: string, message: string) {
  if (path === "title") {
    return "Anna ohjelmalle nimi.";
  }

  if (path === "athleteId") {
    return "Valitse käyttäjä ohjelmalle.";
  }

  const workoutMatch = path.match(/^workouts\.(\d+)(?:\.(.*))?$/);
  if (!workoutMatch) {
    return message;
  }

  const workoutIndex = Number(workoutMatch[1]);
  const restPath = workoutMatch[2] ?? "";
  const workoutPrefix = `Päivä ${workoutIndex + 1}`;

  if (restPath === "nameOverride") {
    return `${workoutPrefix}: anna päivälle nimi.`;
  }

  if (restPath === "defaultRestSeconds") {
    return `${workoutPrefix}: lisää päivälle oletuslepo.`;
  }

  if (restPath === "exercises") {
    return `${workoutPrefix}: lisää vähintään yksi liike.`;
  }

  const exerciseMatch = restPath.match(/^exercises\.(\d+)\.(.*)$/);
  if (!exerciseMatch) {
    return `${workoutPrefix}: ${message}`;
  }

  const exerciseIndex = Number(exerciseMatch[1]);
  const field = exerciseMatch[2];
  const prefix = `${workoutPrefix} / liike ${exerciseIndex + 1}`;

  const fieldLabels: Record<string, string> = {
    exerciseId: "valitse liike",
    customExerciseName: "anna custom-liikkeelle nimi",
    customMuscleGroup: "valitse custom-liikkeelle lihasryhmä",
    instruction: "anna valmennusohje",
    setCount: "anna sarjamäärä",
    repMode: "valitse toistotyyli",
    targetReps: "anna toistot",
    targetRepsMin: "anna min. toistot",
    targetRepsMax: "anna max. toistot",
    restSeconds: "anna lepo",
  };

  return fieldLabels[field]
    ? `${prefix}: ${fieldLabels[field]}.`
    : `${prefix}: ${message}`;
}

function buildComposerIssues(values: ProgramComposerFormValues): ComposerIssue[] {
  const seen = new Set<string>();
  const issues: ComposerIssue[] = [];

  function pushIssue(
    fieldPath: string,
    message: string,
    workoutIndex?: number,
    exerciseIndex?: number,
  ) {
    const dedupeKey = `${fieldPath}:${message}`;
    if (seen.has(dedupeKey)) {
      return;
    }
    seen.add(dedupeKey);

    issues.push({
      id: dedupeKey,
      severity: "error",
      label: mapComposerIssueLabel(fieldPath, message),
      fieldPath,
      workoutIndex,
      exerciseIndex,
    });
  }

  if (values.title.trim().length < 3) {
    pushIssue("title", "Anna ohjelmalle nimi.");
  }

  if (!values.athleteId) {
    pushIssue("athleteId", "Valitse käyttäjä ohjelmalle.");
  }

  if (!values.workouts.length) {
    pushIssue("workouts", "Lisää vähintään yksi päivä ohjelmaan.");
  }

  values.workouts.forEach((workout, workoutIndex) => {
    if (workout.splitType === "custom" && !workout.nameOverride?.trim()) {
      pushIssue(`workouts.${workoutIndex}.nameOverride`, "Anna custom-treenille nimi.", workoutIndex);
    }

    if (!Number.isFinite(Number(workout.defaultRestSeconds)) || Number(workout.defaultRestSeconds) < 15) {
      pushIssue(`workouts.${workoutIndex}.defaultRestSeconds`, "Lisää päivälle oletuslepo.", workoutIndex);
    }

    if (!workout.exercises.length) {
      pushIssue(`workouts.${workoutIndex}.exercises`, "Lisää vähintään yksi liike harjoitukseen.", workoutIndex);
    }

    workout.exercises.forEach((exercise, exerciseIndex) => {
      const issueBase = `workouts.${workoutIndex}.exercises.${exerciseIndex}`;

      if (!exercise.exerciseId) {
        pushIssue(`${issueBase}.exerciseId`, "Valitse liike tai lisää custom-liike.", workoutIndex, exerciseIndex);
      }

      if (!exercise.instruction.trim()) {
        pushIssue(`${issueBase}.instruction`, "Anna lyhyt valmennusohje.", workoutIndex, exerciseIndex);
      }

      if (Number(exercise.setCount) < 1) {
        pushIssue(`${issueBase}.setCount`, "Anna sarjamäärä.", workoutIndex, exerciseIndex);
      }

      if (!Number.isFinite(Number(exercise.restSeconds)) || Number(exercise.restSeconds) < 15) {
        pushIssue(`${issueBase}.restSeconds`, "Anna lepo.", workoutIndex, exerciseIndex);
      }

      if (exercise.repMode === "range") {
        if (Number(exercise.targetRepsMin) < 1) {
          pushIssue(`${issueBase}.targetRepsMin`, "Anna min toistot toistoalueelle.", workoutIndex, exerciseIndex);
        }
        if (Number(exercise.targetRepsMax) < 1) {
          pushIssue(`${issueBase}.targetRepsMax`, "Anna max toistot toistoalueelle.", workoutIndex, exerciseIndex);
        }
        if (
          Number(exercise.targetRepsMin) >= 1 &&
          Number(exercise.targetRepsMax) >= 1 &&
          Number(exercise.targetRepsMin) > Number(exercise.targetRepsMax)
        ) {
          pushIssue(`${issueBase}.targetRepsMax`, "Min toistot ei voi olla suurempi kuin max toistot.", workoutIndex, exerciseIndex);
        }
      } else if (Number(exercise.targetReps) < 1) {
        pushIssue(`${issueBase}.targetReps`, "Anna toistot.", workoutIndex, exerciseIndex);
      }

      if (exercise.exerciseId === CUSTOM_EXERCISE_VALUE) {
        if (!exercise.customExerciseName.trim()) {
          pushIssue(`${issueBase}.customExerciseName`, "Kirjoita custom-liikkeelle nimi.", workoutIndex, exerciseIndex);
        }
        if (!exercise.customMuscleGroup) {
          pushIssue(`${issueBase}.customMuscleGroup`, "Valitse custom-liikkeelle lihasryhmä.", workoutIndex, exerciseIndex);
        }
      }
    });
  });

  return issues;
}

function buildComposerRequiredStats(values: ProgramComposerFormValues) {
  let total = 2;
  let completed = 0;

  if (values.title.trim().length >= 3) {
    completed += 1;
  }

  if (Boolean(values.athleteId)) {
    completed += 1;
  }

  values.workouts.forEach((workout) => {
    total += 2;
    if (Number.isFinite(Number(workout.defaultRestSeconds)) && Number(workout.defaultRestSeconds) >= 15) {
      completed += 1;
    }

    if (workout.exercises.length > 0) {
      completed += 1;
    }

    if (workout.splitType === "custom") {
      total += 1;
      if (Boolean(workout.nameOverride?.trim())) {
        completed += 1;
      }
    }

    workout.exercises.forEach((exercise) => {
      total += 5;
      if (Boolean(exercise.exerciseId)) {
        completed += 1;
      }
      if (Boolean(exercise.instruction.trim())) {
        completed += 1;
      }
      if (Number(exercise.setCount) >= 1) {
        completed += 1;
      }
      if (Number(exercise.restSeconds) >= 15) {
        completed += 1;
      }
      if (exercise.repMode === "range") {
        total += 1;
        if (Number(exercise.targetRepsMin) >= 1) {
          completed += 1;
        }
        if (Number(exercise.targetRepsMax) >= 1) {
          completed += 1;
        }
      } else if (Number(exercise.targetReps) >= 1) {
        completed += 1;
      }

      if (exercise.exerciseId === CUSTOM_EXERCISE_VALUE) {
        total += 2;
        if (Boolean(exercise.customExerciseName.trim())) {
          completed += 1;
        }
        if (Boolean(exercise.customMuscleGroup)) {
          completed += 1;
        }
      }
    });
  });

  return { total, completed };
}

function getComposerFieldElementId(fieldPath: string) {
  if (fieldPath === "title") {
    return "program-composer-title";
  }

  if (fieldPath === "athleteId") {
    return "program-composer-athlete";
  }

  const workoutMatch = fieldPath.match(/^workouts\.(\d+)(?:\.(.*))?$/);
  if (!workoutMatch) {
    return null;
  }

  const workoutIndex = Number(workoutMatch[1]);
  const restPath = workoutMatch[2] ?? "";

  if (restPath === "nameOverride") {
    return `workout-${workoutIndex}-name`;
  }

  if (restPath === "defaultRestSeconds") {
    return `workout-${workoutIndex}-default-rest`;
  }

  if (restPath === "exercises") {
    return `program-workout-${workoutIndex}`;
  }

  const exerciseMatch = restPath.match(/^exercises\.(\d+)\.(.*)$/);
  if (!exerciseMatch) {
    return `program-workout-${workoutIndex}`;
  }

  const exerciseIndex = Number(exerciseMatch[1]);
  const field = exerciseMatch[2];
  const prefix = `workout-${workoutIndex}`;

  const ids: Record<string, string> = {
    exerciseId: `${prefix}-exercise-${exerciseIndex}`,
    customExerciseName: `${prefix}-custom-${exerciseIndex}`,
    customMuscleGroup: `${prefix}-custom-muscle-${exerciseIndex}`,
    instruction: `${prefix}-instruction-${exerciseIndex}`,
    setCount: `${prefix}-sets-${exerciseIndex}`,
    repMode: `${prefix}-rep-mode-${exerciseIndex}`,
    targetReps: `${prefix}-reps-${exerciseIndex}`,
    targetRepsMin: `${prefix}-reps-min-${exerciseIndex}`,
    targetRepsMax: `${prefix}-reps-max-${exerciseIndex}`,
    restSeconds: `${prefix}-rest-${exerciseIndex}`,
  };

  return ids[field] ?? `program-workout-${workoutIndex}`;
}

function getComposerViewForIssue(issue: ComposerIssue): ComposerView {
  if (issue.fieldPath === "title" || issue.fieldPath === "athleteId" || issue.fieldPath === "description") {
    return "details";
  }

  return "workouts";
}

function compareCoachSetLabels(left: string, right: string) {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

function getCoachWorkoutCompletedAt(
  workout: AppState["scheduledWorkouts"][number],
  session?: WorkoutSession,
) {
  return workout.completedAt ?? session?.completedAt ?? session?.startedAt ?? workout.scheduledDate;
}

function SearchableAthleteConversationSelect({
  id,
  selectedAthleteId,
  athleteOptions,
  onSelect,
}: {
  id: string;
  selectedAthleteId: string;
  athleteOptions: Array<{ id: string; fullName: string; unreadCount: number }>;
  onSelect: (athleteId: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectedAthlete = athleteOptions.find((athlete) => athlete.id === selectedAthleteId);

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
  }, [isOpen, rootRef]);

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
    }
  }, [isOpen]);

  const filteredAthletes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return athleteOptions;
    }

    return athleteOptions.filter((athlete) => athlete.fullName.toLowerCase().includes(normalizedQuery));
  }, [athleteOptions, query]);

  const triggerLabel = selectedAthlete
    ? selectedAthlete.unreadCount > 0
      ? `${selectedAthlete.fullName} (${selectedAthlete.unreadCount})`
      : selectedAthlete.fullName
    : "Valitse treenaaja";

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
        <span className={cn("truncate", !selectedAthlete ? "text-[var(--text-subtle)]" : "")}>
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
                placeholder="Hae treenaajaa"
                className="pl-10"
              />
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto p-2">
            {filteredAthletes.length ? (
              filteredAthletes.map((athlete) => (
                <button
                  key={athlete.id}
                  type="button"
                  className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] hover:bg-[var(--surface-2)]"
                  onClick={() => {
                    onSelect(athlete.id);
                    setIsOpen(false);
                  }}
                >
                  <span className="block min-w-0">
                    <span className="block truncate text-sm font-semibold text-[var(--text)]">{athlete.fullName}</span>
                    <span className="mt-1 block text-xs text-[var(--text-subtle)]">
                      {athlete.unreadCount > 0
                        ? `${athlete.unreadCount} uutta viestiä`
                        : "Ei uusia viestejä"}
                    </span>
                  </span>
                  <span className="ml-3 flex items-center gap-2">
                    {athlete.unreadCount > 0 ? (
                      <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-[var(--accent)] px-2 py-1 text-xs font-semibold text-[var(--accent-contrast)]">
                        {athlete.unreadCount}
                      </span>
                    ) : null}
                    {selectedAthleteId === athlete.id ? (
                      <Check className="size-4 shrink-0 text-[var(--accent-strong)]" aria-hidden="true" />
                    ) : null}
                  </span>
                </button>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-2)] px-3 py-4 text-sm text-[var(--text-muted)]">
                Hakusanalla ei löytynyt treenaajaa.
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SearchableAthleteTargetSelect({
  id,
  selectedAthleteId,
  athleteOptions,
  onSelect,
}: {
  id: string;
  selectedAthleteId: string;
  athleteOptions: Array<{ id: string; fullName: string }>;
  onSelect: (athleteId: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectedAthlete = athleteOptions.find((athlete) => athlete.id === selectedAthleteId);

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

  const filteredAthletes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return athleteOptions;
    }

    return athleteOptions.filter((athlete) => athlete.fullName.toLowerCase().includes(normalizedQuery));
  }, [athleteOptions, query]);

  return (
    <div ref={rootRef} className="relative">
      <button
        id={id}
        type="button"
        className="flex w-full items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-left text-sm text-[var(--text)] outline-none transition focus:border-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className={cn("truncate", !selectedAthlete ? "text-[var(--text-subtle)]" : "")}>
          {selectedAthlete?.fullName ?? "Valitse käyttäjä"}
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
                placeholder="Hae käyttäjää"
                className="pl-10"
              />
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto p-2">
            {filteredAthletes.length ? (
              filteredAthletes.map((athlete) => (
                <button
                  key={athlete.id}
                  type="button"
                  className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] hover:bg-[var(--surface-2)]"
                  onClick={() => {
                    onSelect(athlete.id);
                    setIsOpen(false);
                  }}
                >
                  <span className="block min-w-0 truncate text-sm font-semibold text-[var(--text)]">
                    {athlete.fullName}
                  </span>
                  {selectedAthleteId === athlete.id ? (
                    <Check className="ml-3 size-4 shrink-0 text-[var(--accent-strong)]" aria-hidden="true" />
                  ) : null}
                </button>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-2)] px-3 py-4 text-sm text-[var(--text-muted)]">
                Hakusanalla ei löytynyt käyttäjää.
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
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

function ProgramWorkoutEditorModal({
  title,
  subtitle,
  children,
  onClose,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-[color:color-mix(in_srgb,var(--background)_56%,transparent)] p-3 sm:items-center sm:p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="program-workout-editor-modal-title"
        aria-describedby="program-workout-editor-modal-description"
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-[var(--border-strong)] bg-[var(--surface)] shadow-[0_24px_60px_-24px_var(--shadow)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-[var(--border)] px-4 py-4 sm:px-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold tracking-[0.06em] text-[var(--accent)]">Liikkeet</p>
              <h3 id="program-workout-editor-modal-title" className="mt-2 text-2xl font-semibold text-[var(--text)]">
                {title}
              </h3>
              <p id="program-workout-editor-modal-description" className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                {subtitle}
              </p>
            </div>
            <Button type="button" variant="ghost" className="shrink-0" onClick={onClose}>
              Sulje
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
      </div>
    </div>
  );
}

export function CoachDashboard({
  view,
  onOpenConversation,
  onOpenWorkoutLog,
  onOpenSettings,
}: {
  view: WorkspaceView;
  onOpenConversation?: () => void;
  onOpenWorkoutLog?: () => void;
  onOpenSettings?: () => void;
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
    markConversationRead,
  } = useAppState();
  const formId = useId();
  const [programMessage, setProgramMessage] = useState<string>("");
  const [programMessageTone, setProgramMessageTone] = useState<"success" | "danger" | null>(null);
  const [editingProgramId, setEditingProgramId] = useState<string | null>(null);
  const [copyProgramState, setCopyProgramState] = useState<ProgramCopyTargetState | null>(null);
  const [openProgramMenuId, setOpenProgramMenuId] = useState<string | null>(null);
  const [programMenuAnchorRect, setProgramMenuAnchorRect] = useState<ProgramMenuAnchorRect | null>(null);
  const [programMenuStyle, setProgramMenuStyle] = useState<CSSProperties | null>(null);
  const [selectedAthleteId, setSelectedAthleteId] = useState<string>("");
  const programMenuRef = useRef<HTMLDivElement | null>(null);

  const athletes = currentUser
    ? isAdminRole(currentUser.role)
      ? getCoachAthletes(currentUser.id)
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
          (plan) =>
            Boolean(plan.workouts?.length) &&
            getProgramStatus(plan) !== "removed" &&
            (isAdminRole(currentUser?.role) || plan.coachId === currentUser?.id),
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
    () => coachPrograms.filter((program) => getProgramStatus(program) === "archived"),
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
  const exerciseNameById = useMemo(
    () => new Map(exerciseOptions.map((exercise) => [exercise.id, exercise.name])),
    [exerciseOptions],
  );

  const form = useForm<ProgramComposerFormValues, unknown, ProgramComposerValues>({
    resolver: zodResolver(programComposerSchema) as Resolver<
      ProgramComposerFormValues,
      unknown,
      ProgramComposerValues
    >,
    mode: "onChange",
    defaultValues: {
      title: "",
      description: "",
      athleteId: programTargets[0]?.id ?? "",
      workouts: [],
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
  const [composerView, setComposerView] = useState<ComposerView>("details");
  const [programWorkspaceTab, setProgramWorkspaceTab] = useState<ProgramWorkspaceTab>("library");
  const [activeWorkoutIndex, setActiveWorkoutIndex] = useState(0);
  const [activeExerciseIndex, setActiveExerciseIndex] = useState(0);
  const [workoutEditorModalIndex, setWorkoutEditorModalIndex] = useState<number | null>(null);
  const canEditProgramAthlete = !editingProgramId
    || !state.scheduledWorkouts.some((workout) => workout.trainingPlanId === editingProgramId);
  const editorTitle = isEditingProgram ? "Muokkaa treeniohjelmaa" : "Uusi treeniohjelma";
  const watchedWorkouts = form.watch("workouts");
  const watchedProgramTitle = form.watch("title");
  const watchedAthleteId = form.watch("athleteId");
  const totalExerciseCount = watchedWorkouts.reduce((sum, workout) => sum + workout.exercises.length, 0);
  const totalSetCount = watchedWorkouts.reduce(
    (sum, workout) => sum + workout.exercises.reduce((exerciseSum, exercise) => exerciseSum + Number(exercise.setCount || 0), 0),
    0,
  );
  const activeWorkout = watchedWorkouts[activeWorkoutIndex] ?? watchedWorkouts[0] ?? null;
  const modalWorkout = workoutEditorModalIndex !== null ? watchedWorkouts[workoutEditorModalIndex] ?? null : null;
  const activeAthleteName = programTargets.find((target) => target.id === watchedAthleteId)?.fullName ?? "Ei valittu";
  const composerValues = {
    title: watchedProgramTitle,
    description: form.watch("description"),
    athleteId: watchedAthleteId,
    workouts: watchedWorkouts,
  };
  const composerIssues = useMemo(() => buildComposerIssues(composerValues), [composerValues]);
  const composerRequiredStats = useMemo(() => buildComposerRequiredStats(composerValues), [composerValues]);
  const canSaveProgram = form.formState.isValid;

  const resetComposer = (athleteId: string) => {
    form.reset({
      title: "",
      description: "",
      athleteId,
      workouts: [],
    });
    setComposerView("details");
    setActiveWorkoutIndex(0);
    setActiveExerciseIndex(0);
    setWorkoutEditorModalIndex(null);
    setEditingProgramId(null);
  };

  const closeProgramEditing = (message?: string) => {
    resetComposer(form.getValues("athleteId"));
    setProgramWorkspaceTab("library");
    setCopyProgramState(null);
    setOpenProgramMenuId(null);
    setProgramMenuAnchorRect(null);
    setProgramMenuStyle(null);
    setProgramMessage(message ?? "");
    setProgramMessageTone(message ? "success" : null);
  };

  useEffect(() => {
    if (!watchedWorkouts.length) {
      setActiveWorkoutIndex(0);
      setActiveExerciseIndex(0);
      return;
    }

    if (activeWorkoutIndex > watchedWorkouts.length - 1) {
      setActiveWorkoutIndex(watchedWorkouts.length - 1);
    }
  }, [activeWorkoutIndex, watchedWorkouts.length]);
  useEffect(() => {
    const exerciseCount = activeWorkout?.exercises.length ?? 0;
    if (!exerciseCount) {
      setActiveExerciseIndex(0);
      return;
    }

    if (activeExerciseIndex > exerciseCount - 1) {
      setActiveExerciseIndex(exerciseCount - 1);
    }
  }, [activeExerciseIndex, activeWorkout]);

  const composerSteps: Array<{ view: ComposerView; step: string; title: string; description: string }> = [
    { view: "details", step: "1/3", title: "Perustiedot", description: "Määritä viikon treeniohjelman nimi ja kenelle se tehdään." },
    { view: "workouts", step: "2/3", title: "Päivät", description: "Luo päivät ja lisää liikkeet." },
    { view: "review", step: "3/3", title: "Tarkistus", description: "Varmista sisältö ja tallenna." },
  ];
  const activeComposerStep = composerSteps.find((step) => step.view === composerView) ?? composerSteps[0];
  const composerCardRef = useRef<HTMLDivElement | null>(null);
  const previousComposerViewRef = useRef<ComposerView>(composerView);
  const previousWorkoutCountRef = useRef(watchedWorkouts.length);

  const scrollComposerIntoView = (behavior: ScrollBehavior = "smooth") => {
    window.requestAnimationFrame(() => {
      composerCardRef.current?.scrollIntoView({ behavior, block: "start" });
    });
  };

  const scrollBuilderIntoView = () => {
    window.requestAnimationFrame(() => {
      const composer = document.getElementById("coach-program-composer");
      composer?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const openProgramForEditing = (program: AppState["plans"][number]) => {
    if (editingProgramId === program.id) {
      closeProgramEditing("Muokkaustila suljettiin.");
      return;
    }

    form.reset(buildProgramComposerValues(program, state.exercises));
    setProgramWorkspaceTab("builder");
    setEditingProgramId(program.id);
    setComposerView("details");
    setActiveWorkoutIndex(0);
    setActiveExerciseIndex(0);
    setCopyProgramState(null);
    setProgramMessage("");
    setProgramMessageTone(null);
    scrollBuilderIntoView();
  };

  const getProgramCopyTargets = (program: AppState["plans"][number]) =>
    programTargets.filter((target) => target.id !== program.athleteId);

  const openProgramCopyPane = (program: AppState["plans"][number]) => {
    const copyTargets = getProgramCopyTargets(program);
    if (!copyTargets.length) {
      return;
    }

    setCopyProgramState({
      programId: program.id,
      targetAthleteId: copyTargets[0].id,
    });
  };

  const copyProgramToBuilder = (program: AppState["plans"][number]) => {
    if (copyProgramState?.programId !== program.id) {
      return;
    }

    const target = getProgramCopyTargets(program).find((item) => item.id === copyProgramState.targetAthleteId);
    if (!target) {
      return;
    }

    form.reset(buildProgramDraftFromProgram(program, state.exercises, target.id));
    setEditingProgramId(null);
    setProgramWorkspaceTab("builder");
    setComposerView("details");
    setActiveWorkoutIndex(0);
    setActiveExerciseIndex(0);
    setCopyProgramState(null);
    setOpenProgramMenuId(null);
    setProgramMenuAnchorRect(null);
    setProgramMenuStyle(null);
    setProgramMessage(`Ohjelma "${program.title}" kopioitiin käyttäjälle "${target.fullName}" uuden ohjelman pohjaksi.`);
    setProgramMessageTone("success");
    scrollBuilderIntoView();
  };

  useEffect(() => {
    if (!openProgramMenuId) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-program-menu-root='true']")) {
        return;
      }

      setOpenProgramMenuId(null);
      setProgramMenuAnchorRect(null);
      setProgramMenuStyle(null);
      setCopyProgramState(null);
    };

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [openProgramMenuId]);

  useLayoutEffect(() => {
    if (!openProgramMenuId || !programMenuAnchorRect || !programMenuRef.current) {
      return;
    }

    setProgramMenuStyle(getProgramMenuStyle(programMenuAnchorRect, programMenuRef.current));
  }, [openProgramMenuId, programMenuAnchorRect]);

  useEffect(() => {
    if (!openProgramMenuId) {
      return;
    }

    const syncProgramMenuPosition = () => {
      const trigger = document.querySelector<HTMLElement>(
        `[data-program-menu-trigger-id="${openProgramMenuId}"]`,
      );
      if (!trigger) {
        return;
      }

      setProgramMenuAnchorRect(toProgramMenuAnchorRect(trigger.getBoundingClientRect()));
    };

    syncProgramMenuPosition();
    window.addEventListener("resize", syncProgramMenuPosition);
    window.addEventListener("scroll", syncProgramMenuPosition, true);
    return () => {
      window.removeEventListener("resize", syncProgramMenuPosition);
      window.removeEventListener("scroll", syncProgramMenuPosition, true);
    };
  }, [openProgramMenuId]);

  const scrollWorkoutCardIntoView = (workoutIndex: number) => {
    window.requestAnimationFrame(() => {
      const element = document.getElementById(`program-workout-${workoutIndex}`);
      element?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  function openIssueLocation(issue: ComposerIssue) {
    if (typeof issue.workoutIndex === "number") {
      setActiveWorkoutIndex(issue.workoutIndex);
    }
    if (typeof issue.exerciseIndex === "number") {
      setActiveExerciseIndex(issue.exerciseIndex);
    }
    setComposerView(getComposerViewForIssue(issue));
    if (typeof issue.workoutIndex === "number" && (typeof issue.exerciseIndex === "number" || issue.fieldPath.includes(".exercise"))) {
      setWorkoutEditorModalIndex(issue.workoutIndex);
    } else {
      setWorkoutEditorModalIndex(null);
    }

    window.setTimeout(() => {
      const elementId = getComposerFieldElementId(issue.fieldPath);
      const element = elementId ? document.getElementById(elementId) : null;
      element?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (element instanceof HTMLElement) {
        element.focus();
      }
    }, 60);
  }

  useEffect(() => {
    if (previousComposerViewRef.current !== composerView) {
      scrollComposerIntoView();
    }

    previousComposerViewRef.current = composerView;
  }, [composerView]);

  useEffect(() => {
    const previousWorkoutCount = previousWorkoutCountRef.current;
    const currentWorkoutCount = watchedWorkouts.length;

    if (composerView === "workouts" && currentWorkoutCount > previousWorkoutCount) {
      window.requestAnimationFrame(() => {
        const element = document.getElementById(`program-workout-${currentWorkoutCount - 1}`);
        element?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }

    previousWorkoutCountRef.current = currentWorkoutCount;
  }, [composerView, watchedWorkouts.length]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (view !== PROGRAMS_WORKSPACE_VIEW) {
      return;
    }

    window.scrollTo({ top: 0, behavior: "auto" });
  }, [view]);

  useEffect(() => {
    if (workoutEditorModalIndex === null) {
      return;
    }

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setWorkoutEditorModalIndex(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [workoutEditorModalIndex]);

  useEffect(() => {
    if (workoutEditorModalIndex === null) {
      return;
    }

    const { body, documentElement } = document;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyOverscrollBehavior = body.style.overscrollBehavior;
    const previousDocumentOverflow = documentElement.style.overflow;
    const previousDocumentOverscrollBehavior = documentElement.style.overscrollBehavior;

    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    documentElement.style.overflow = "hidden";
    documentElement.style.overscrollBehavior = "none";

    return () => {
      body.style.overflow = previousBodyOverflow;
      body.style.overscrollBehavior = previousBodyOverscrollBehavior;
      documentElement.style.overflow = previousDocumentOverflow;
      documentElement.style.overscrollBehavior = previousDocumentOverscrollBehavior;
    };
  }, [workoutEditorModalIndex]);

  useEffect(() => {
    if (workoutEditorModalIndex === null) {
      return;
    }

    if (!watchedWorkouts[workoutEditorModalIndex]) {
      setWorkoutEditorModalIndex(null);
    }
  }, [watchedWorkouts, workoutEditorModalIndex]);

  return (
    <div className="grid w-full min-w-0 gap-6">
      {view === "overview" && currentUser ? (
        <OwnTrainingOverviewCard
          currentUser={currentUser}
          state={state}
          onOpenWorkoutLog={onOpenWorkoutLog}
        />
      ) : null}

      {view === "overview" ? <OwnMeasurementsCard sectionId="overview-measurements" /> : null}

      {view === "athletes" ? (
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
          markConversationRead={markConversationRead}
          onSend={addConversationComment}
          selectedAthleteId={selectedAthleteId}
          onSelectAthlete={setSelectedAthleteId}
          users={state.users}
        />
      ) : null}

      {view === PROGRAMS_WORKSPACE_VIEW && (
        <div className="grid gap-4">
          <div className="grid w-full grid-cols-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-1">
            <button
              type="button"
              className={cn(
                "min-w-0 rounded-xl px-4 py-2.5 text-sm font-semibold transition",
                programWorkspaceTab === "library"
                  ? "border border-[color:color-mix(in_srgb,var(--accent)_18%,var(--border))] bg-[color:color-mix(in_srgb,var(--accent)_10%,var(--surface))] text-[var(--accent)] shadow-[0_8px_18px_-20px_var(--accent)]"
                  : "border border-transparent text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]",
              )}
              aria-pressed={programWorkspaceTab === "library"}
              onClick={() => setProgramWorkspaceTab("library")}
            >
              Ohjelmakirjasto
            </button>
            <button
              type="button"
              className={cn(
                "min-w-0 rounded-xl px-4 py-2.5 text-sm font-semibold transition",
                programWorkspaceTab === "builder"
                  ? "border border-[color:color-mix(in_srgb,var(--accent)_18%,var(--border))] bg-[color:color-mix(in_srgb,var(--accent)_10%,var(--surface))] text-[var(--accent)] shadow-[0_8px_18px_-20px_var(--accent)]"
                  : "border border-transparent text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]",
              )}
              aria-pressed={programWorkspaceTab === "builder"}
              onClick={() => setProgramWorkspaceTab("builder")}
            >
              Rakenna ohjelma
            </button>
          </div>

          {programWorkspaceTab === "builder" ? (
          <div ref={composerCardRef}>
            <Card className="border-[var(--border-strong)] p-3 sm:p-4" id="coach-program-composer">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-[var(--text-subtle)]">Ohjelman rakentaja</p>
                  <CardTitle className="text-2xl">{editorTitle}</CardTitle>
                </div>
                {composerView !== "details" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="size-10 shrink-0 rounded-full p-0"
                    aria-label="Takaisin"
                    onClick={() => {
                      if (composerView === "workouts") {
                        setComposerView("details");
                        return;
                      }
                      setComposerView("workouts");
                    }}
                  >
                    <ArrowLeft className="size-4" aria-hidden="true" />
                  </Button>
                ) : null}
              </div>
            <form
              className="mt-4 space-y-3"
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
                  setProgramMessageTone("danger");
                  return;
                }

                if (isEditingProgram) {
                  setProgramMessage(
                    `Ohjelma "${values.title}" päivitettiin. Lomake palautettiin uuden ohjelman luontiin.`,
                  );
                  setProgramMessageTone("success");
                  resetComposer(values.athleteId);
                  setProgramWorkspaceTab("library");
                  return;
                }

                setProgramMessage(`Ohjelma "${values.title}" tallennettiin aktiiviseksi.`);
                setProgramMessageTone("success");
                resetComposer(values.athleteId);
                setProgramWorkspaceTab("library");
              }, async () => {
                setProgramMessage(`Täydennä ${composerIssues.length} pakollista kohtaa ennen tallennusta.`);
                setProgramMessageTone("danger");
                const firstIssue = composerIssues[0];
                if (!firstIssue) {
                  return;
                }
                openIssueLocation(firstIssue);
              })}
            >
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge>{activeComposerStep.step}</Badge>
                      <p className="text-sm font-semibold text-[var(--text)]">{activeComposerStep.title}</p>
                    </div>
                    <p className="mt-0.5 text-sm text-[var(--text-muted)]">{activeComposerStep.description}</p>
                  </div>
                </div>
              </div>

                  {composerView === "details" ? (
                <div className="space-y-3">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <RequiredLabel htmlFor="program-composer-title">Ohjelman nimi</RequiredLabel>
                        <Input
                          id="program-composer-title"
                          aria-invalid={Boolean(form.formState.errors.title)}
                          aria-describedby={form.formState.errors.title ? "program-composer-title-error" : undefined}
                          {...form.register("title")}
                          placeholder="Esim. Ylä-ala-koko kroppa"
                        />
                        <FieldError id="program-composer-title-error" message={form.formState.errors.title?.message?.toString()} />
                      </div>
                      <div>
                        <RequiredLabel htmlFor="program-composer-athlete">Käyttäjä</RequiredLabel>
                        <Select
                          id="program-composer-athlete"
                          aria-invalid={Boolean(form.formState.errors.athleteId)}
                          aria-describedby={form.formState.errors.athleteId ? "program-composer-athlete-error" : undefined}
                          {...form.register("athleteId")}
                          disabled={!canEditProgramAthlete}
                        >
                          <option value="">Valitse käyttäjä</option>
                          {programTargets.map((target) => (
                            <option key={target.id} value={target.id}>
                              {target.fullName}
                            </option>
                          ))}
                        </Select>
                        <FieldError id="program-composer-athlete-error" message={form.formState.errors.athleteId?.message?.toString()} />
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
                      <RequiredLabel htmlFor={`${formId}-description`} optional>Kuvaus</RequiredLabel>
                      <Textarea
                        id={`${formId}-description`}
                        aria-invalid={Boolean(form.formState.errors.description)}
                        aria-describedby={form.formState.errors.description ? `${formId}-description-error` : undefined}
                        {...form.register("description")}
                        placeholder="Esim. Pidä treenin lisäksi huoli, että saat viikossa keskimäärin 8000 askelta päivässä."
                        className="min-h-24"
                      />
                      <FieldError id={`${formId}-description-error`} message={form.formState.errors.description?.message?.toString()} />
                    </div>
                  </div>
              ) : null}

              {composerView === "workouts" ? (
                <div className="space-y-3">
                  <div className="grid gap-3">
                    {workoutFields.fields.map((field, index) => {
                      const workout = watchedWorkouts[index];
                      const workoutName = getComposerWorkoutLabel(workout, index);
                      const workoutSplit = workout?.splitType ?? "custom";
                      const workoutIssues = composerIssues.filter((issue) => issue.workoutIndex === index);
                      const workoutIssueCount = workoutIssues.length;
                      const isWorkoutReady = workoutIssueCount === 0;
                      const workoutExerciseIssueCount = composerIssues.filter(
                        (issue) => issue.workoutIndex === index && typeof issue.exerciseIndex === "number",
                      ).length;
                      const workoutBasicIssueCount = workoutIssues.filter(
                        (issue) =>
                          typeof issue.exerciseIndex !== "number" &&
                          issue.fieldPath !== `workouts.${index}.exercises`,
                      ).length;
                      const hasNoExercises = !workout?.exercises.length;
                      const exercisePreview = getWorkoutExercisePreview(workout, exerciseNameById);
                      const isExpanded = activeWorkoutIndex === index;

                      return (
                        <div
                          key={field.id}
                          id={`program-workout-${index}`}
                          className={cn(
                            "overflow-hidden rounded-2xl border bg-[var(--surface)] shadow-[0_1px_0_0_var(--shadow-soft),0_8px_24px_-20px_var(--shadow)] transition",
                            isExpanded
                              ? "border-[var(--accent-strong)]"
                              : isWorkoutReady
                                ? "border-[color:color-mix(in_oklab,var(--success)_40%,var(--border))] bg-[color:color-mix(in_oklab,var(--success)_4%,var(--surface))]"
                                : "border-[var(--border)]",
                          )}
                        >
                          <div
                            className={cn(
                              "relative flex items-start gap-3 px-3 pt-3",
                              isExpanded ? "bg-[color:color-mix(in_oklab,var(--accent)_10%,var(--surface))]" : "bg-[var(--surface)]",
                            )}
                          >
                            <button
                              type="button"
                              className="absolute inset-2 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-inset"
                              aria-expanded={isExpanded}
                              aria-controls={`program-workout-panel-${index}`}
                              onClick={() => {
                                setActiveWorkoutIndex((current) => {
                                  const nextIndex = current === index ? -1 : index;
                                  if (nextIndex === index) {
                                    scrollWorkoutCardIntoView(index);
                                  }
                                  return nextIndex;
                                });
                              }}
                            />
                            <div className="pointer-events-none relative z-10 min-w-0 flex-1">
                              <p className="text-sm font-semibold text-[var(--text)]">Päivä {index + 1}</p>
                              <p className="mt-1 text-sm text-[var(--text-muted)]">{workoutName}</p>
                            </div>
                            <div className="relative z-10 flex shrink-0 items-start gap-2">
                                <button
                                  type="button"
                                  className="grid size-8.5 shrink-0 place-items-center rounded-full border border-[color:color-mix(in_oklab,var(--danger)_35%,var(--border))] bg-[color:color-mix(in_oklab,var(--danger)_10%,var(--surface))] text-[var(--danger)] transition hover:border-[color:color-mix(in_oklab,var(--danger)_45%,var(--border))] hover:bg-[color:color-mix(in_oklab,var(--danger)_14%,var(--surface))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--danger)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]"
                                  aria-label={`Poista päivä ${index + 1}`}
                                  title={`Poista päivä ${index + 1}`}
                                  onClick={() => {
                                    if (!window.confirm(`Poistetaanko päivä ${index + 1}?`)) {
                                      return;
                                    }
                                    workoutFields.remove(index);
                                    if (activeWorkoutIndex >= index) {
                                      setActiveWorkoutIndex((current) => Math.max(0, current - 1));
                                    }
                                    setActiveExerciseIndex(0);
                                  }}
                                >
                                  <X className="size-4" aria-hidden="true" />
                                </button>
                              <button
                                type="button"
                                className="grid size-8.5 shrink-0 place-items-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text-subtle)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-3)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]"
                                aria-expanded={isExpanded}
                                aria-controls={`program-workout-panel-${index}`}
                                onClick={() => {
                                  setActiveWorkoutIndex((current) => {
                                    const nextIndex = current === index ? -1 : index;
                                    if (nextIndex === index) {
                                      scrollWorkoutCardIntoView(index);
                                    }
                                    return nextIndex;
                                  });
                                }}
                              >
                                {isExpanded ? <ChevronUp className="size-4" aria-hidden="true" /> : <ChevronDown className="size-4" aria-hidden="true" />}
                                <span className="sr-only">{isExpanded ? `Sulje päivä ${index + 1}` : `Avaa päivä ${index + 1}`}</span>
                              </button>
                            </div>
                          </div>
                          <div
                            className={cn(
                              "px-3 pb-3 pt-2",
                              isExpanded ? "border-b border-[var(--border)] bg-[color:color-mix(in_oklab,var(--accent)_10%,var(--surface))]" : "bg-[var(--surface)]",
                            )}
                          >
                            <div className="flex w-full flex-wrap gap-1.5">
                              {isWorkoutReady ? (
                                <Badge className="border-[color:color-mix(in_oklab,var(--success)_40%,var(--border))] bg-[color:color-mix(in_oklab,var(--success)_12%,var(--surface))] text-[var(--success)]">
                                  Kunnossa
                                </Badge>
                              ) : null}
                              {hasNoExercises ? (
                                <Badge className="border-[color:color-mix(in_oklab,var(--danger)_35%,var(--border))] bg-[color:color-mix(in_oklab,var(--danger)_10%,var(--surface))] text-[var(--danger)]">
                                  Ei liikkeitä vielä
                                </Badge>
                              ) : null}
                              {exercisePreview.names.length ? (
                                <>
                                  {exercisePreview.names.map((exerciseName) => (
                                    <span
                                      key={`${field.id}-${exerciseName}`}
                                      className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 text-xs font-medium text-[var(--text)]"
                                    >
                                      {exerciseName}
                                    </span>
                                  ))}
                                  {exercisePreview.extraCount > 0 ? (
                                    <span className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 text-xs font-medium text-[var(--text-subtle)]">
                                      +{exercisePreview.extraCount}
                                    </span>
                                  ) : null}
                                </>
                              ) : !hasNoExercises ? (
                                <p className="text-xs text-[var(--text-muted)]">Ei liikkeitä vielä</p>
                              ) : null}
                            </div>
                          </div>

                          {isExpanded ? (
                            <div id={`program-workout-panel-${index}`} className="space-y-3 px-3 pb-3 pt-3">
                              <div className="grid gap-3 md:grid-cols-3">
                                <div>
                                  <RequiredLabel htmlFor={`workout-${index}-split`}>Treenialue</RequiredLabel>
                                  <Select
                                    id={`workout-${index}-split`}
                                    aria-invalid={Boolean(form.formState.errors.workouts?.[index]?.splitType)}
                                    aria-describedby={form.formState.errors.workouts?.[index]?.splitType ? `workout-${index}-split-error` : undefined}
                                    value={workoutSplit}
                                    onChange={(event) => {
                                      const nextSplit = event.target.value as ProgramComposerFormValues["workouts"][number]["splitType"];
                                      form.setValue(`workouts.${index}.splitType`, nextSplit, {
                                        shouldDirty: true,
                                        shouldValidate: true,
                                      });
                                      if (nextSplit !== "custom") {
                                        form.setValue(`workouts.${index}.nameOverride`, "", {
                                          shouldDirty: true,
                                          shouldValidate: true,
                                        });
                                      }
                                    }}
                                  >
                                    <option value="upper">Yläkroppa</option>
                                    <option value="lower">Alakroppa</option>
                                    <option value="full_body">Koko kroppa</option>
                                    <option value="custom">Muu</option>
                                  </Select>
                                  <FieldError
                                    id={`workout-${index}-split-error`}
                                    message={form.formState.errors.workouts?.[index]?.splitType?.message?.toString()}
                                  />
                                </div>
                                {workoutSplit === "custom" ? (
                                  <div>
                                    <RequiredLabel htmlFor={`workout-${index}-name`}>Nimi</RequiredLabel>
                                    <Input
                                      id={`workout-${index}-name`}
                                      aria-invalid={Boolean(form.formState.errors.workouts?.[index]?.nameOverride)}
                                      aria-describedby={form.formState.errors.workouts?.[index]?.nameOverride ? `workout-${index}-name-error` : undefined}
                                      value={workout?.nameOverride ?? ""}
                                      onChange={(event) => {
                                        form.setValue(`workouts.${index}.nameOverride`, event.target.value, {
                                          shouldDirty: true,
                                          shouldValidate: true,
                                        });
                                      }}
                                      placeholder="Esim. Työntö"
                                    />
                                    <FieldError
                                      id={`workout-${index}-name-error`}
                                      message={form.formState.errors.workouts?.[index]?.nameOverride?.message?.toString()}
                                    />
                                  </div>
                                ) : null}
                              </div>

                              <div className="space-y-2 sm:ml-auto sm:w-auto">
                                {workoutExerciseIssueCount ? (
                                  <div className="flex sm:justify-end">
                                    <span className="inline-flex items-center rounded-full border border-[color:color-mix(in_oklab,var(--danger)_35%,var(--border))] bg-[color:color-mix(in_oklab,var(--danger)_10%,var(--surface))] px-3 py-1 text-xs font-semibold tracking-[0.03em] text-[var(--danger)]">
                                      Liikkeissä {workoutExerciseIssueCount} puutetta
                                    </span>
                                  </div>
                                ) : null}
                                <div className="flex sm:justify-end">
                                <Button
                                  type="button"
                                  variant="secondary"
                                  className={cn(
                                    "h-10 w-full px-4 py-0 sm:w-auto",
                                    workoutExerciseIssueCount
                                      ? "border-[color:color-mix(in_oklab,var(--danger)_35%,var(--border))] text-[var(--danger)] hover:border-[color:color-mix(in_oklab,var(--danger)_45%,var(--border))] hover:bg-[color:color-mix(in_oklab,var(--danger)_8%,var(--surface))]"
                                      : "",
                                  )}
                                  onClick={async () => {
                                    setActiveWorkoutIndex(index);
                                    setActiveExerciseIndex(0);

                                    if (workoutBasicIssueCount) {
                                      await form.trigger(`workouts.${index}`);
                                      return;
                                    }

                                    setWorkoutEditorModalIndex(index);
                                  }}
                                >
                                  {hasNoExercises ? "Lisää liikkeet" : `Muokkaa liikkeitä (${workout.exercises.length})`}
                                </Button>
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="secondary"
                      className="w-full sm:w-auto"
                      onClick={() => {
                        workoutFields.append(emptyProgramWorkout("custom"));
                        setActiveWorkoutIndex(workoutFields.fields.length);
                        setActiveExerciseIndex(0);
                      }}
                    >
                      <Plus className="mr-2 size-4" />
                      Lisää päivä
                    </Button>
                  </div>
                </div>
              ) : null}

              {composerView === "review" ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
                    <p className="text-sm font-semibold text-[var(--text)]">Yhteenveto</p>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">
                      {watchedProgramTitle?.trim() || "Nimeämätön ohjelma"} · {activeAthleteName} · {watchedWorkouts.length} päivää · {totalExerciseCount} liikettä · {totalSetCount} sarjaa
                    </p>
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-[var(--text)]">Päivien sisältö</p>
                    <div className="mt-3 space-y-3">
                      {watchedWorkouts.map((workout, index) => {
                        const workoutIssues = composerIssues.filter((issue) => issue.workoutIndex === index).length;

                        return (
                          <div
                            key={`review-workout-${index}`}
                            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-[var(--text)]">
                                Päivä {index + 1}: {getComposerWorkoutLabel(workout, index)}
                              </p>
                              {workoutIssues ? (
                                <Badge className="border-[color:color-mix(in_oklab,var(--danger)_35%,var(--border))] bg-[color:color-mix(in_oklab,var(--danger)_10%,var(--surface))] text-[var(--danger)]">
                                  Puuttuu {workoutIssues} kohtaa
                                </Badge>
                              ) : null}
                            </div>
                            {workout?.exercises.length ? (
                              <div className="mt-2.5 space-y-2">
                                {workout.exercises.map((exercise, exerciseIndex) => {
                                  const isCustom = exercise.exerciseId === CUSTOM_EXERCISE_VALUE;
                                  const exerciseName =
                                    exercise.exerciseNameOverride?.trim() ||
                                    (isCustom
                                      ? exercise.customExerciseName?.trim()
                                      : exerciseNameById.get(exercise.exerciseId)) ||
                                    `Liike ${exerciseIndex + 1}`;
                                  const repsLabel = exercise.repMode === "range"
                                    ? `${exercise.targetRepsMin || "?"}-${exercise.targetRepsMax || "?"}`
                                    : `${exercise.targetReps || "?"}`;

                                  return (
                                    <div
                                      key={`review-workout-${index}-exercise-${exerciseIndex}`}
                                      className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5"
                                    >
                                      <div className="flex flex-wrap items-center gap-2">
                                        <p className="text-sm font-medium text-[var(--text)]">
                                          {exerciseIndex + 1}. {exerciseName}
                                        </p>
                                        <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs font-semibold text-[var(--text-subtle)]">
                                          {exercise.setCount || "?"} sarjaa
                                        </span>
                                        <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs font-semibold text-[var(--text-subtle)]">
                                          {repsLabel} toistoa
                                        </span>
                                        <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs font-semibold text-[var(--text-subtle)]">
                                          {exercise.restSeconds || "?"} s lepo
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <p className="mt-3 text-sm text-[var(--text-muted)]">Ei liikkeitä vielä.</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : null}

              {programMessage ? (
                <InlineFeedback message={programMessage} tone={programMessageTone} className="text-sm" />
              ) : null}
              <div className="rounded-2xl bg-[color:color-mix(in_oklab,var(--surface)_92%,var(--background))] shadow-[0_16px_40px_-28px_var(--shadow)] backdrop-blur">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-[var(--text-subtle)]">
                    {composerView === "details"
                      ? "Täytä ohjelman perustiedot."
                      : composerView === "workouts"
                        ? "Täytä päivien perustiedot."
                        : canSaveProgram
                            ? "Ohjelma voidaan tallentaa."
                            : `Täydennä ${composerIssues.length} pakollista kohtaa ennen tallennusta.`}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {composerView === "details" ? (
                      <Button
                        type="button"
                        className="w-full sm:w-auto"
                        onClick={async () => {
                          const valid = await form.trigger(["title", "athleteId", "description"]);
                          if (!valid) {
                            const firstIssue = composerIssues[0];
                            if (firstIssue) {
                              openIssueLocation(firstIssue);
                            }
                            return;
                          }
                          setComposerView("workouts");
                        }}
                      >
                        Siirry lisäämään treenit
                      </Button>
                    ) : null}
                    {composerView === "workouts" ? (
                      <Button
                        type="button"
                        className="w-full sm:w-auto"
                        onClick={() => {
                          if (!watchedWorkouts.length) {
                            setProgramMessage("Lisää vähintään yksi treeni ennen tarkistusta.");
                            setProgramMessageTone("danger");
                            return;
                          }
                          setComposerView("review");
                        }}
                      >
                        Siirry tarkistukseen
                      </Button>
                    ) : null}
                    {composerView === "review" ? (
                      <Button
                        type="submit"
                        className="w-full sm:w-auto"
                        loading={isSavingProgram}
                        loadingText={isEditingProgram ? "Tallennetaan muutoksia..." : "Tallennetaan ohjelmaa..."}
                      >
                        {isEditingProgram ? "Tallenna muutokset" : "Tallenna ohjelma"}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            </form>
            </Card>
          </div>
          ) : null}

          {programWorkspaceTab === "builder" && workoutEditorModalIndex !== null && modalWorkout && workoutFields.fields[workoutEditorModalIndex] ? (
            <ProgramWorkoutEditorModal
              title={`Päivä ${workoutEditorModalIndex + 1}: ${getComposerWorkoutLabel(modalWorkout, workoutEditorModalIndex)}`}
              subtitle="Valitse liikkeet tälle päivälle."
              onClose={() => setWorkoutEditorModalIndex(null)}
            >
              <ProgramWorkoutEditor
                key={workoutFields.fields[workoutEditorModalIndex].id}
                fieldId={workoutFields.fields[workoutEditorModalIndex].id}
                index={workoutEditorModalIndex}
                control={form.control}
                errors={form.formState.errors.workouts}
                register={form.register}
                setValue={form.setValue}
                watch={form.watch}
                exerciseOptions={exerciseOptions}
                onRemove={() => {
                  workoutFields.remove(workoutEditorModalIndex);
                  setActiveWorkoutIndex((current) => Math.max(0, current - 1));
                  setActiveExerciseIndex(0);
                  setWorkoutEditorModalIndex(null);
                }}
                removable
                allowExerciseRemoval
                showWorkoutMeta={false}
                activeExerciseIndex={activeExerciseIndex}
                onActiveExerciseIndexChange={setActiveExerciseIndex}
              />
            </ProgramWorkoutEditorModal>
          ) : null}

          {programWorkspaceTab === "library" ? (
          <div className="grid gap-6">
            <Card>
              <p className="text-xs font-semibold text-[var(--text-subtle)]">Ohjelmakirjasto</p>
              <CardTitle className="text-2xl">Luodut ohjelmat</CardTitle>
              <CardDescription className="mt-2">
                Pidä käytössä oleva ohjelma selvästi esillä ja siirrä aiemmat versiot talteen vertailua varten.
              </CardDescription>
              <div className="mt-5 space-y-5">
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
                    <div className="grid gap-3">
                      {activeCoachPrograms.map((program) => {
                        const athleteName =
                          program.athleteId === currentUser?.id
                            ? "Sinä"
                            : (state.users.find((user) => user.id === program.athleteId)?.fullName ?? "Käyttäjä");
                        const isActiveEditorTarget = editingProgramId === program.id;
                        const canDeleteProgram = canDeleteProgramFromState(state, program.id);

                        return (
                          <div key={program.id} className="rounded-2xl border border-[color:color-mix(in_oklab,var(--accent)_32%,var(--border))] bg-[color:color-mix(in_oklab,var(--accent)_10%,var(--surface))] p-3 shadow-[0_1px_0_0_var(--shadow-soft),0_10px_26px_-20px_var(--accent)]">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-base font-semibold text-[var(--text)]">{program.title}</p>
                                  <Badge className="border-[var(--accent-strong)] bg-[var(--surface)] text-[var(--accent-strong)]">
                                    Käytössä nyt
                                  </Badge>
                                  {isActiveEditorTarget ? <Badge>Aktiivinen muokkaus</Badge> : null}
                                </div>
                                <p className="mt-1 text-xs text-[var(--text-subtle)]">
                                  Treenaaja: {athleteName} · {program.workouts?.length ?? 0} treeniä
                                </p>
                                {program.description ? (
                                  <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{program.description}</p>
                                ) : null}
                              </div>
                            </div>

                            <div className="mt-2.5 flex flex-wrap gap-1.5">
                              {(program.workouts ?? []).map((workout) => (
                                <Badge key={workout.id}>{workout.name}</Badge>
                              ))}
                            </div>

                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <Button
                                type="button"
                                variant="secondary"
                                onClick={() => {
                                  openProgramForEditing(program);
                                }}
                              >
                                {isActiveEditorTarget ? "Sulje muokkaus" : "Muokkaa ohjelmaa"}
                              </Button>
                              <div className="relative" data-program-menu-root="true">
                                <button
                                  type="button"
                                  className="inline-flex size-10 list-none items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] p-0 text-[var(--text-muted)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]"
                                  data-program-menu-trigger-id={program.id}
                                  aria-expanded={openProgramMenuId === program.id}
                                  aria-haspopup="menu"
                                  aria-label="Avaa ohjelman lisätoiminnot"
                                  onClick={(event) => {
                                    if (openProgramMenuId === program.id) {
                                      setOpenProgramMenuId(null);
                                      setProgramMenuAnchorRect(null);
                                      setProgramMenuStyle(null);
                                      setCopyProgramState(null);
                                      return;
                                    }

                                    setProgramMenuAnchorRect(toProgramMenuAnchorRect(event.currentTarget.getBoundingClientRect()));
                                    setOpenProgramMenuId(program.id);
                                    setCopyProgramState(null);
                                  }}
                                >
                                  <MoreHorizontal className="size-4" aria-hidden="true" />
                                </button>
                                {openProgramMenuId === program.id ? (
                                  <div
                                    ref={programMenuRef}
                                    role="menu"
                                    className="z-50 min-w-60 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2 shadow-[0_18px_45px_-24px_var(--shadow)]"
                                    style={
                                      programMenuStyle ??
                                      (programMenuAnchorRect
                                        ? getHiddenProgramMenuStyle(programMenuAnchorRect)
                                        : undefined)
                                    }
                                  >
                                  {(() => {
                                    const copyTargets = getProgramCopyTargets(program);
                                    const isCopyPaneOpen = copyProgramState?.programId === program.id;
                                    const selectedCopyTargetId = isCopyPaneOpen ? copyProgramState.targetAthleteId : "";

                                    return (
                                      <>
                                        <button
                                          type="button"
                                          disabled={!copyTargets.length}
                                          className="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--surface-2)] disabled:cursor-not-allowed disabled:text-[var(--text-subtle)] disabled:hover:bg-transparent"
                                          onClick={() => {
                                            if (!copyTargets.length) {
                                              return;
                                            }
                                            openProgramCopyPane(program);
                                          }}
                                        >
                                          Kopioi toiselle käyttäjälle
                                        </button>
                                        {!copyTargets.length ? (
                                          <p className="px-3 pb-2 text-xs text-[var(--text-subtle)]">
                                            Ei muita käyttäjiä kopiointia varten.
                                          </p>
                                        ) : null}
                                        {isCopyPaneOpen ? (
                                          <div className="mb-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
                                            <p className="text-sm font-semibold text-[var(--text)]">Kopioi ohjelma toiselle käyttäjälle</p>
                                            <p className="mt-1 text-xs text-[var(--text-subtle)]">
                                              Kaikki päivät ja liikkeet kopioidaan uuden ohjelman pohjaksi.
                                            </p>
                                            <div className="mt-3">
                                              <SearchableAthleteTargetSelect
                                                id={`copy-program-target-${program.id}`}
                                                selectedAthleteId={selectedCopyTargetId}
                                                athleteOptions={copyTargets}
                                                onSelect={(athleteId) =>
                                                  setCopyProgramState((current) =>
                                                    current && current.programId === program.id
                                                      ? { ...current, targetAthleteId: athleteId }
                                                      : current,
                                                  )
                                                }
                                              />
                                            </div>
                                            <div className="mt-3 flex flex-wrap gap-2">
                                              <Button
                                                type="button"
                                                variant="secondary"
                                                onClick={() => copyProgramToBuilder(program)}
                                              >
                                                Kopioi pohjaksi
                                              </Button>
                                              <Button
                                                type="button"
                                                variant="ghost"
                                                onClick={() => setCopyProgramState(null)}
                                              >
                                                Peruuta
                                              </Button>
                                            </div>
                                          </div>
                                        ) : null}
                                      </>
                                    );
                                  })()}
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--surface-2)]"
                                    onClick={async () => {
                                      setOpenProgramMenuId(null);
                                      setProgramMenuAnchorRect(null);
                                      setProgramMenuStyle(null);
                                      setCopyProgramState(null);
                                      const result = await setProgramStatus(program.id, "archived");
                                      if (!result.ok) {
                                        setProgramMessage(result.message);
                                        setProgramMessageTone("danger");
                                        return;
                                      }

                                      setProgramMessage(`Ohjelma "${program.title}" siirrettiin aiempiin ohjelmiin.`);
                                      setProgramMessageTone("success");
                                    }}
                                  >
                                    Poista käytöstä
                                  </button>
                                  <button
                                    type="button"
                                    role="menuitem"
                                    disabled={!canDeleteProgram}
                                    className="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-semibold text-[var(--danger)] transition hover:bg-[var(--surface-2)] disabled:cursor-not-allowed disabled:text-[var(--text-subtle)] disabled:hover:bg-transparent"
                                    onClick={async () => {
                                      if (!canDeleteProgram) {
                                        return;
                                      }
                                      const confirmDelete = window.confirm(
                                        `Poistetaanko ohjelma "${program.title}" näkyvistä? Historia säilyy edelleen autofillia ja aiempia treenitietoja varten.`,
                                      );
                                      if (!confirmDelete) {
                                        return;
                                      }

                                      const result = await deleteProgram(program.id);
                                      if (!result.ok) {
                                        setProgramMessage(result.message);
                                        setProgramMessageTone("danger");
                                        return;
                                      }

                                      if (isActiveEditorTarget) {
                                        resetComposer(form.getValues("athleteId"));
                                      }
                                      setOpenProgramMenuId(null);
                                      setProgramMenuAnchorRect(null);
                                      setProgramMenuStyle(null);
                                      setCopyProgramState(null);
                                      setProgramMessage(
                                        `Ohjelma "${program.title}" poistettiin näkyvistä. Historia säilyy edelleen uusien ohjelmien taustalla.`,
                                      );
                                      setProgramMessageTone("success");
                                    }}
                                  >
                                    Poista
                                  </button>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                            <p className="mt-2.5 text-xs text-[var(--text-subtle)]">
                              Poista piilottaa ohjelman listoilta, mutta säilyttää treenihistorian uusien ohjelmien autofillia varten.
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
                    <div className="grid gap-3">
                      {archivedCoachPrograms.map((program) => {
                        const athleteName =
                          program.athleteId === currentUser?.id
                            ? "Sinä"
                            : (state.users.find((user) => user.id === program.athleteId)?.fullName ?? "Käyttäjä");
                        const isActiveEditorTarget = editingProgramId === program.id;
                        const canDeleteProgram = canDeleteProgramFromState(state, program.id);

                        return (
                          <div key={program.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-base font-semibold text-[var(--text)]">{program.title}</p>
                                  <Badge>Aiempi ohjelma</Badge>
                                  {isActiveEditorTarget ? <Badge>Aktiivinen muokkaus</Badge> : null}
                                </div>
                                <p className="mt-1 text-xs text-[var(--text-subtle)]">
                                  Treenaaja: {athleteName} · {program.workouts?.length ?? 0} treeniä
                                </p>
                                {program.description ? (
                                  <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{program.description}</p>
                                ) : null}
                              </div>
                            </div>

                            <div className="mt-2.5 flex flex-wrap gap-1.5">
                              {(program.workouts ?? []).map((workout) => (
                                <Badge key={workout.id}>{workout.name}</Badge>
                              ))}
                            </div>

                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <Button
                                type="button"
                                variant="secondary"
                                onClick={async () => {
                                  const result = await setProgramStatus(program.id, "active");
                                  if (!result.ok) {
                                    setProgramMessage(result.message);
                                    setProgramMessageTone("danger");
                                    return;
                                  }

                                  setProgramMessage(
                                    `Ohjelma "${program.title}" aktivoitiin. Muut saman treenaajan ohjelmat arkistoitiin.`,
                                  );
                                  setProgramMessageTone("success");
                                }}
                              >
                                Ota käyttöön
                              </Button>
                              <div className="relative" data-program-menu-root="true">
                                <button
                                  type="button"
                                  className="inline-flex size-10 list-none items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] p-0 text-[var(--text-muted)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]"
                                  data-program-menu-trigger-id={program.id}
                                  aria-expanded={openProgramMenuId === program.id}
                                  aria-haspopup="menu"
                                  aria-label="Avaa ohjelman lisätoiminnot"
                                  onClick={(event) => {
                                    if (openProgramMenuId === program.id) {
                                      setOpenProgramMenuId(null);
                                      setProgramMenuAnchorRect(null);
                                      setProgramMenuStyle(null);
                                      setCopyProgramState(null);
                                      return;
                                    }

                                    setProgramMenuAnchorRect(toProgramMenuAnchorRect(event.currentTarget.getBoundingClientRect()));
                                    setOpenProgramMenuId(program.id);
                                    setCopyProgramState(null);
                                  }}
                                >
                                  <MoreHorizontal className="size-4" aria-hidden="true" />
                                </button>
                                {openProgramMenuId === program.id ? (
                                  <div
                                    ref={programMenuRef}
                                    role="menu"
                                    className="z-50 min-w-60 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2 shadow-[0_18px_45px_-24px_var(--shadow)]"
                                    style={
                                      programMenuStyle ??
                                      (programMenuAnchorRect
                                        ? getHiddenProgramMenuStyle(programMenuAnchorRect)
                                        : undefined)
                                    }
                                  >
                                  {(() => {
                                    const copyTargets = getProgramCopyTargets(program);
                                    const isCopyPaneOpen = copyProgramState?.programId === program.id;
                                    const selectedCopyTargetId = isCopyPaneOpen ? copyProgramState.targetAthleteId : "";

                                    return (
                                      <>
                                        <button
                                          type="button"
                                          disabled={!copyTargets.length}
                                          className="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--surface-2)] disabled:cursor-not-allowed disabled:text-[var(--text-subtle)] disabled:hover:bg-transparent"
                                          onClick={() => {
                                            if (!copyTargets.length) {
                                              return;
                                            }
                                            openProgramCopyPane(program);
                                          }}
                                        >
                                          Kopioi toiselle käyttäjälle
                                        </button>
                                        {!copyTargets.length ? (
                                          <p className="px-3 pb-2 text-xs text-[var(--text-subtle)]">
                                            Ei muita käyttäjiä kopiointia varten.
                                          </p>
                                        ) : null}
                                        {isCopyPaneOpen ? (
                                          <div className="mb-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
                                            <p className="text-sm font-semibold text-[var(--text)]">Kopioi ohjelma toiselle käyttäjälle</p>
                                            <p className="mt-1 text-xs text-[var(--text-subtle)]">
                                              Kaikki päivät ja liikkeet kopioidaan uuden ohjelman pohjaksi.
                                            </p>
                                            <div className="mt-3">
                                              <SearchableAthleteTargetSelect
                                                id={`copy-program-target-${program.id}`}
                                                selectedAthleteId={selectedCopyTargetId}
                                                athleteOptions={copyTargets}
                                                onSelect={(athleteId) =>
                                                  setCopyProgramState((current) =>
                                                    current && current.programId === program.id
                                                      ? { ...current, targetAthleteId: athleteId }
                                                      : current,
                                                  )
                                                }
                                              />
                                            </div>
                                            <div className="mt-3 flex flex-wrap gap-2">
                                              <Button
                                                type="button"
                                                variant="secondary"
                                                onClick={() => copyProgramToBuilder(program)}
                                              >
                                                Kopioi pohjaksi
                                              </Button>
                                              <Button
                                                type="button"
                                                variant="ghost"
                                                onClick={() => setCopyProgramState(null)}
                                              >
                                                Peruuta
                                              </Button>
                                            </div>
                                          </div>
                                        ) : null}
                                      </>
                                    );
                                  })()}
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--surface-2)]"
                                    onClick={() => {
                                      setOpenProgramMenuId(null);
                                      setProgramMenuAnchorRect(null);
                                      setProgramMenuStyle(null);
                                      setCopyProgramState(null);
                                      openProgramForEditing(program);
                                    }}
                                  >
                                    {isActiveEditorTarget ? "Sulje muokkaus" : "Muokkaa ohjelmaa"}
                                  </button>
                                  <button
                                    type="button"
                                    role="menuitem"
                                    disabled={!canDeleteProgram}
                                    className="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-semibold text-[var(--danger)] transition hover:bg-[var(--surface-2)] disabled:cursor-not-allowed disabled:text-[var(--text-subtle)] disabled:hover:bg-transparent"
                                    onClick={async () => {
                                      if (!canDeleteProgram) {
                                        return;
                                      }
                                      const confirmDelete = window.confirm(
                                        `Poistetaanko ohjelma "${program.title}" näkyvistä? Historia säilyy edelleen autofillia ja aiempia treenitietoja varten.`,
                                      );
                                      if (!confirmDelete) {
                                        return;
                                      }

                                      const result = await deleteProgram(program.id);
                                      if (!result.ok) {
                                        setProgramMessage(result.message);
                                        setProgramMessageTone("danger");
                                        return;
                                      }

                                      if (isActiveEditorTarget) {
                                        resetComposer(form.getValues("athleteId"));
                                      }
                                      setOpenProgramMenuId(null);
                                      setProgramMenuAnchorRect(null);
                                      setProgramMenuStyle(null);
                                      setCopyProgramState(null);
                                      setProgramMessage(
                                        `Ohjelma "${program.title}" poistettiin näkyvistä. Historia säilyy edelleen uusien ohjelmien taustalla.`,
                                      );
                                      setProgramMessageTone("success");
                                    }}
                                  >
                                    Poista
                                  </button>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                            <p className="mt-2.5 text-xs text-[var(--text-subtle)]">
                              Poista piilottaa myös arkistoidun ohjelman listoilta, mutta säilyttää historian uusien ohjelmien autofillia varten.
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
          ) : null}
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
    guidance: workout.guidance,
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
      guidance: workout.guidance ?? deriveProgramWorkoutGuidance(workout),
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

export function buildProgramDraftFromProgram(
  program: AppState["plans"][number],
  exercises: AppState["exercises"],
  targetAthleteId: string,
): ProgramComposerFormValues {
  const draft = buildProgramComposerValues(program, exercises);

  return {
    ...draft,
    title: `${program.title} (kopio)`,
    athleteId: targetAthleteId,
    workouts: draft.workouts.map((workout) => ({
      ...workout,
      exercises: workout.exercises.map((exercise) => ({
        ...exercise,
        targetLoad: undefined,
      })),
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
  const [isArchiveExpanded, setIsArchiveExpanded] = useState(false);
  const [selectedExerciseProgressKey, setSelectedExerciseProgressKey] = useState("");
  const [isExerciseProgressExpanded, setIsExerciseProgressExpanded] = useState(false);
  const [activeMeasurementTrend, setActiveMeasurementTrend] = useState<"weight" | "waist">("weight");
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
    setIsArchiveExpanded(false);
    setSelectedExerciseProgressKey("");
    setIsExerciseProgressExpanded(false);
    setActiveMeasurementTrend("weight");
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
          (!coachId || entry.coachId === coachId || entry.authorUserId === coachId) &&
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
  const exerciseProgressCatalog = useMemo(
    () => (selectedAthleteId ? buildExerciseProgressCatalog(state, selectedAthleteId) : { exercises: [], summaries: new Map() }),
    [selectedAthleteId, state],
  );
  const exerciseProgressOptions = exerciseProgressCatalog.exercises;

  useEffect(() => {
    if (!exerciseProgressOptions.length) {
      if (selectedExerciseProgressKey) {
        setSelectedExerciseProgressKey("");
      }
      return;
    }
    const selectionExists = exerciseProgressOptions.some((exercise) => exercise.key === selectedExerciseProgressKey);
    if (!selectionExists) {
      setSelectedExerciseProgressKey(exerciseProgressOptions[0]?.key ?? "");
    }
  }, [exerciseProgressOptions, selectedExerciseProgressKey]);

  useEffect(() => {
    setIsExerciseProgressExpanded(false);
  }, [selectedExerciseProgressKey]);

  const selectedExerciseProgress =
    exerciseProgressCatalog.summaries.get(selectedExerciseProgressKey) ??
    (exerciseProgressOptions[0] ? exerciseProgressCatalog.summaries.get(exerciseProgressOptions[0].key) : undefined);

  if (!athletes.length) {
    return (
      <Card>
        <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Tiimi</p>
        <CardTitle className="text-2xl">Treenaajan kehitys</CardTitle>
        <CardDescription className="mt-2">
          Lisää ensin treenaajia, niin näet heidän toteumat, kehityksen ja kehon seurannan tästä näkymästä.
        </CardDescription>
      </Card>
    );
  }

  return (
    <Card className="border-[var(--border-strong)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Tiimi</p>
          <CardTitle className="text-2xl">Treenaajan kehitys</CardTitle>
          <CardDescription className="mt-2">
            Seuraa toteumaa, kehitystä ja kehon seurantaa yhdestä paikasta.
          </CardDescription>
        </div>
        <div className="w-full">
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
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
              label="Viimeisin muistiinpano"
              value={lastNoteDate ? formatDate(lastNoteDate) : "Ei vielä"}
              hint="Valmentajan ja treenaajan kirjaama"
              icon={ClipboardPenLine}
            />
          </div>

          <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
            <p className="text-sm font-semibold text-[var(--text)]">Vaihejakauma 8 viikolta</p>
            <p className="mt-1 text-xs text-[var(--text-subtle)]">
              Kuinka paljon treenejä on ollut vaiheissa keskeytetty, kesken ja valmis.
            </p>
            <PhaseBars bars={phaseBars} />
          </div>

          <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <p className="text-sm font-semibold text-[var(--text)]">Kehon seuranta</p>
                <p className="mt-1 text-xs text-[var(--text-subtle)]">
                  Viimeisimmät mitat ja niiden kehitys.
                </p>
              </div>
              <div className="grid w-full gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
                  <p className="text-[11px] font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Pituus</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--text)]">
                    {selectedAthleteProfile?.heightCm !== undefined
                      ? `${formatTrendNumber(selectedAthleteProfile.heightCm)} cm`
                      : "Ei asetettu"}
                  </p>
                </div>
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
                  <p className="text-[11px] font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Paino</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--text)]">
                    {selectedAthleteProfile?.weightKg !== undefined
                      ? `${formatTrendNumber(selectedAthleteProfile.weightKg)} kg`
                      : "Ei asetettu"}
                  </p>
                </div>
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
                  <p className="text-[11px] font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Vyötärö</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--text)]">
                    {selectedAthleteProfile?.waistCm !== undefined
                      ? `${formatTrendNumber(selectedAthleteProfile.waistCm)} cm`
                      : "Ei asetettu"}
                  </p>
                </div>
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
                  <p className="text-[11px] font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Viimeisin mittaus</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--text)]">
                    {latestBodyMeasurement ? shortDate(latestBodyMeasurement.measuredAt) : "Ei vielä"}
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-[var(--text)]">Kehitystrendi</p>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">Valitse paino tai vyötärö.</p>
                </div>
                <div className="grid w-full grid-cols-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 sm:w-auto">
                  <button
                    type="button"
                    className={`w-full rounded-lg px-3 py-2 text-sm font-medium transition ${
                      activeMeasurementTrend === "weight"
                        ? "bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))] text-[var(--accent)]"
                        : "text-[var(--text-muted)]"
                    }`}
                    aria-pressed={activeMeasurementTrend === "weight"}
                    onClick={() => setActiveMeasurementTrend("weight")}
                  >
                    Paino
                  </button>
                  <button
                    type="button"
                    className={`w-full rounded-lg px-3 py-2 text-sm font-medium transition ${
                      activeMeasurementTrend === "waist"
                        ? "bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))] text-[var(--accent)]"
                        : "text-[var(--text-muted)]"
                    }`}
                    aria-pressed={activeMeasurementTrend === "waist"}
                    onClick={() => setActiveMeasurementTrend("waist")}
                  >
                    Vyötärö
                  </button>
                </div>
              </div>
              <div className="mt-4">
                {activeMeasurementTrend === "weight" ? (
                  <>
                    <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Painotrendi</p>
                    <MetricTrendChart
                      points={weightTrendPoints}
                      ariaLabel="Painon kehitystrendi"
                      emptyMessage="Painomittauksia ei ole vielä kirjattu."
                      helperText="Alarivillä näkyy kuukausi ja vuosi, oikealla painon asteikko."
                      compactHelperText="Alarivillä näkyy kuukausi ja vuosi. Tarkka arvo näkyy pisteen kohdalla."
                      valueLabel="Paino"
                      unit="kg"
                    />
                  </>
                ) : activeMeasurementTrend === "waist" ? (
                  <>
                    <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Vyötärötrendi</p>
                    <MetricTrendChart
                      points={waistTrendPoints}
                      ariaLabel="Vyötärön kehitystrendi"
                      emptyMessage="Vyötärömittauksia ei ole vielä kirjattu."
                      helperText="Alarivillä näkyy kuukausi ja vuosi, oikealla vyötärön asteikko."
                      compactHelperText="Alarivillä näkyy kuukausi ja vuosi. Tarkka arvo näkyy pisteen kohdalla."
                      valueLabel="Vyötärö"
                      unit="cm"
                    />
                  </>
                ) : (
                  <>
                    <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Vyötärötrendi</p>
                    <MetricTrendChart
                      points={waistTrendPoints}
                      ariaLabel="Vyötärön kehitystrendi"
                      emptyMessage="Vyötärömittauksia ei ole vielä kirjattu."
                      helperText="Alarivillä näkyy kuukausi ja vuosi, oikealla vyötärön asteikko."
                      compactHelperText="Alarivillä näkyy kuukausi ja vuosi. Tarkka arvo näkyy pisteen kohdalla."
                      valueLabel="Vyötärö"
                      unit="cm"
                    />
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div>
              <p className="text-sm font-semibold text-[var(--text)]">Treenisuoritus</p>
            </div>
            <div className="mt-4">
              <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Volyymitrendi</p>
              <MetricTrendChart
                points={volumeTrendPoints}
                ariaLabel="Volyymin kehitystrendi"
                emptyMessage="Ei valmiita treenejä graafiin vielä."
                helperText="Alarivillä näkyy kuukausi ja vuosi, oikealla volyymin asteikko."
                compactHelperText="Alarivillä näkyy kuukausi ja vuosi. Tarkka arvo näkyy pisteen kohdalla."
                valueLabel="Volyymi"
                unit="kg"
                decimals={0}
                useZeroBaseline
              />
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-[var(--text)]">Liikekohtainen kehitys</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Sama nopea yhteenveto kuin treenaajalla: e1RM, paras sarja ja viimeisin toteuma.
                </p>
              </div>
              {exerciseProgressOptions.length > 0 ? (
                <div className="w-full sm:w-[18rem]">
                  <Label htmlFor="coach-history-exercise-progress" className="text-xs">
                    Valitse liike
                  </Label>
                  <Select
                    id="coach-history-exercise-progress"
                    className="mt-2"
                    value={selectedExerciseProgress?.exerciseKey ?? ""}
                    onChange={(event) => setSelectedExerciseProgressKey(event.target.value)}
                  >
                    {exerciseProgressOptions.map((exercise) => (
                      <option key={exercise.key} value={exercise.key}>
                        {exercise.exerciseName}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : null}
            </div>

            {exerciseProgressOptions.length === 0 ? (
              <p className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text-muted)]">
                Kun treeneistä tallentuu toteutuneet sarjat, tähän tulee automaattisesti liikekohtainen kehitys.
              </p>
            ) : selectedExerciseProgress ? (
              <>
                <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3">
                  <p className="text-[11px] font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Valittu liike</p>
                  <p className="mt-1 text-sm font-medium text-[var(--text)]">{selectedExerciseProgress.exerciseName}</p>
                  <p className="mt-3 text-[11px] font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Nykyinen e1RM</p>
                  <p className="mt-1 text-base font-semibold text-[var(--text)]">
                    {selectedExerciseProgress.currentEstimatedOneRepMax !== undefined
                      ? `${formatCoachLoadValue(selectedExerciseProgress.currentEstimatedOneRepMax)} kg`
                      : "Ei dataa"}
                  </p>
                </div>

                <div className="mt-3">
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-10 w-full justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm"
                    aria-expanded={isExerciseProgressExpanded}
                    onClick={() => setIsExerciseProgressExpanded((current) => !current)}
                  >
                    <span>{isExerciseProgressExpanded ? "Piilota tarkemmat tiedot" : "Avaa tarkemmat tiedot"}</span>
                    {isExerciseProgressExpanded ? (
                      <ChevronUp className="size-4" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="size-4" aria-hidden="true" />
                    )}
                  </Button>
                </div>

                {isExerciseProgressExpanded ? (
                  <div className="mt-3 space-y-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <CoachOverviewStat
                        label="Paras työsarja"
                        value={formatCoachExerciseSetValue(selectedExerciseProgress.bestSet)}
                      />
                      <CoachOverviewStat
                        label="Viimeisin toteuma"
                        value={formatCoachExerciseSetValue(selectedExerciseProgress.latestSet)}
                      />
                    </div>
                    <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">
                      e1RM-trendi · {selectedExerciseProgress.exerciseName}
                    </p>
                    <MetricTrendChart
                      points={selectedExerciseProgress.trendPoints}
                      ariaLabel={`${selectedExerciseProgress.exerciseName} e1RM kehitystrendi`}
                      emptyMessage="Valitulla liikkeellä ei ole vielä kuormallista toteumaa, josta e1RM voitaisiin arvioida."
                      helperText="Kaavio näyttää kunkin treenikerran korkeimman e1RM-arvion valitulle liikkeelle."
                      compactHelperText="Paina pistettä nähdäksesi treenikerran e1RM-arvion."
                      valueLabel="e1RM"
                      unit="kg"
                    />
                  </div>
                ) : null}
              </>
            ) : null}
          </div>

          <div className="mt-5 overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface-2)]">
            <div className="flex items-start gap-3 p-4">
              <button
                type="button"
                className="min-w-0 flex-1 rounded-[1rem] text-left text-inherit transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
                aria-expanded={isArchiveExpanded}
                aria-controls="coach-athlete-archive-panel"
                onClick={() => setIsArchiveExpanded((current) => !current)}
              >
                <p className="text-sm font-semibold text-[var(--text)]">Treeniarkisto, toteumat ja keskustelu</p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  Avaa tarkempi näkymä, kun haluat selata toteutuksia, sarjadataa, muistiinpanoja ja keskustelua.
                </p>
              </button>
              <button
                type="button"
                className="grid size-8.5 shrink-0 place-items-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text-subtle)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-3)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
                aria-label={isArchiveExpanded ? "Sulje treeniarkisto" : "Avaa treeniarkisto"}
                aria-expanded={isArchiveExpanded}
                aria-controls="coach-athlete-archive-panel"
                onClick={() => setIsArchiveExpanded((current) => !current)}
              >
                {isArchiveExpanded ? (
                  <ChevronUp className="size-4" aria-hidden="true" />
                ) : (
                  <ChevronDown className="size-4" aria-hidden="true" />
                )}
              </button>
            </div>

            {isArchiveExpanded ? (
              <div id="coach-athlete-archive-panel" className="border-t border-[var(--border)] px-4 pb-4 pt-4">
                <div className="mx-auto grid max-w-[84rem] gap-4 xl:grid-cols-2">
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
                        <div key={group.key} className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4">
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
                                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                                  <div className="flex items-center justify-between gap-2">
                                    <div>
                                      <p className="text-sm font-semibold text-[var(--text)]">Toteuma</p>
                                      <p className="mt-1 text-xs text-[var(--text-subtle)]">
                                        Valitun toteutuksen keskeiset mittarit yhdellä silmäyksellä.
                                      </p>
                                    </div>
                                    {selectedRow.pendingSetCount > 0 ? (
                                      <Badge className="border-[color-mix(in_srgb,var(--warning)_40%,var(--border))] bg-[color:color-mix(in_srgb,var(--warning)_14%,var(--surface))] text-[var(--warning)]">
                                        Kesken {selectedRow.pendingSetCount} sarjaa
                                      </Badge>
                                    ) : (
                                      <Badge className="border-[color-mix(in_srgb,var(--success)_40%,var(--border))] bg-[color:color-mix(in_srgb,var(--success)_14%,var(--surface))] text-[var(--success)]">
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
                                  <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
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
                                    <div className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
                                      {selectedRow.setGroups.length === 0 ? (
                                        <p className="text-sm text-[var(--text-subtle)]">Sarjadataa ei löytynyt tästä treenistä.</p>
                                      ) : (
                                        <div className="grid gap-2">
                                          {selectedRow.setGroups.map((group) => (
                                            <div
                                              key={group.key}
                                              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
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
                                                    className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                                                  >
                                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                                      <p className="text-xs font-semibold text-[var(--text)]">Sarja {log.setLabel}</p>
                                                      <span
                                                        className={
                                                          log.done
                                                            ? "inline-flex items-center rounded-full border border-[color-mix(in_srgb,var(--success)_40%,var(--border))] bg-[color:color-mix(in_srgb,var(--success)_14%,var(--surface))] px-2 py-0.5 text-[11px] font-semibold text-[var(--success)]"
                                                            : "inline-flex items-center rounded-full border border-[color-mix(in_srgb,var(--warning)_40%,var(--border))] bg-[color:color-mix(in_srgb,var(--warning)_14%,var(--surface))] px-2 py-0.5 text-[11px] font-semibold text-[var(--warning)]"
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
                                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
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
                                          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-3"
                                        >
                                          <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">
                                            {formatDateWithWeekday(noteEntry.completedAt)} · {noteEntry.occurrenceLabel}
                                          </p>
                                          <p className="mt-1 whitespace-pre-line text-sm leading-6 text-[var(--text-muted)]">
                                            {noteEntry.body}
                                          </p>
                                        </div>
                                      ))
                                    ) : (
                                      <p className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-subtle)]">
                                        Tälle treenialueelle ei ole vielä kirjattu muistiinpanoja.
                                      </p>
                                    )}
                                  </div>
                                </div>

                                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
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
                                          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
                                        >
                                          <div className="flex flex-wrap items-center gap-2">
                                            <Badge className={coachConversationEntryTone(entry.type)}>
                                              {coachConversationEntryLabel(entry.type)}
                                            </Badge>
                                            <p className="text-xs text-[var(--text-subtle)]">
                                              {formatDateWithWeekday(entry.workoutCompletedAt)} · {entry.occurrenceLabel}
                                            </p>
                                          </div>
                                          <p className="mt-1 whitespace-pre-line text-sm leading-6 text-[var(--text-muted)]">
                                            {entry.body}
                                          </p>
                                          <p className="mt-1 text-xs text-[var(--text-subtle)]">{formatDateWithWeekday(entry.createdAt)}</p>
                                        </div>
                                      ))
                                    ) : (
                                      <p className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-subtle)]">
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
            ) : null}
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
  icon: LucideIcon;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold tracking-[0.03em] text-[var(--text-subtle)]">{label}</p>
          <p className="mt-1 font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--text)]">
            {value}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2">
          <Icon className="size-3.5 text-[var(--accent)]" />
        </div>
      </div>
      <p className="mt-1 text-[11px] text-[var(--text-subtle)]">{hint}</p>
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
      ? "border-[var(--success)] bg-[var(--surface)]"
      : tone === "warning"
        ? "border-[var(--warning)] bg-[var(--surface)]"
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

  const groups = Array.from(grouped.values());
  const canUseExerciseOrder = Boolean(exerciseOrder?.size) && groups.every((group) => exerciseOrder?.has(group.key));
  if (!canUseExerciseOrder) {
    return groups;
  }

  return groups.sort((left, right) => {
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

function formatCoachLoadValue(value: number) {
  if (!Number.isFinite(value)) {
    return "0";
  }
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function formatCoachExerciseSetValue(
  setSummary:
    | {
      actualLoad: number;
      actualReps: number;
    }
    | undefined,
) {
  if (!setSummary) {
    return "Ei dataa";
  }

  return `${formatCoachLoadValue(setSummary.actualLoad)} kg × ${setSummary.actualReps}`;
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
              <div className="bg-[var(--warning)]" style={{ width: `${inProgressWidth}%` }} />
              <div className="bg-[var(--success)]" style={{ width: `${completedWidth}%` }} />
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
        <Badge className="border-[color-mix(in_srgb,var(--danger)_40%,var(--border))] bg-[color:color-mix(in_srgb,var(--danger)_12%,var(--surface))] text-[var(--danger)]">Keskeytetty</Badge>
        <Badge className="border-[color-mix(in_srgb,var(--warning)_40%,var(--border))] bg-[color:color-mix(in_srgb,var(--warning)_14%,var(--surface))] text-[var(--warning)]">Kesken</Badge>
        <Badge className="border-[color-mix(in_srgb,var(--success)_40%,var(--border))] bg-[color:color-mix(in_srgb,var(--success)_14%,var(--surface))] text-[var(--success)]">Valmis</Badge>
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
  return workoutStatusBadgeClass(status);
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
  markConversationRead,
  onSend,
  selectedAthleteId,
  onSelectAthlete,
  users,
}: {
  athletes: Array<{ id: string; fullName: string; email: string }>;
  currentRole: Role;
  currentUserId: string;
  entries: AppState["conversationEntries"];
  markConversationRead: (options?: { athleteId?: string }) => void;
  onSend: (
    body: string,
    options?: { scheduledWorkoutId?: string; trainingPlanId?: string; athleteId?: string; contextLabel?: string },
  ) => Promise<{ ok: true; scheduledWorkoutId?: string } | { ok: false; message: string }>;
  selectedAthleteId: string;
  onSelectAthlete: (athleteId: string) => void;
  users: AppState["users"];
}) {
  const athleteSelectOptions = useMemo(() => {
    const summaries = new Map<
      string,
      {
        unreadCount: number;
      }
    >();

    entries.forEach((entry) => {
      const existing = summaries.get(entry.athleteId);
      const unread =
        isConversationEntryNotifiable(entry) &&
        !entry.readByUserIds.includes(currentUserId) &&
        currentRole !== entry.authorRole;

      if (!existing) {
        summaries.set(entry.athleteId, {
          unreadCount: unread ? 1 : 0,
        });
        return;
      }

      if (unread) {
        existing.unreadCount += 1;
      }

    });

    return athletes.map((athlete) => {
      const summary = summaries.get(athlete.id);
      return {
        ...athlete,
        unreadCount: summary?.unreadCount ?? 0,
      };
    }).sort((left, right) => {
      if (left.unreadCount !== right.unreadCount) {
        return right.unreadCount - left.unreadCount;
      }

      return left.fullName.localeCompare(right.fullName, "fi");
    });
  }, [athletes, currentRole, currentUserId, entries]);
  const totalUnreadCount = useMemo(
    () => athleteSelectOptions.reduce((sum, athlete) => sum + athlete.unreadCount, 0),
    [athleteSelectOptions],
  );

  const filteredEntries = useMemo(
    () =>
      entries
        .filter(
          (entry) => !selectedAthleteId || entry.athleteId === selectedAthleteId,
        )
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [entries, selectedAthleteId],
  );
  useEffect(() => {
    if (!selectedAthleteId) {
      return;
    }

    markConversationRead({ athleteId: selectedAthleteId });
  }, [markConversationRead, selectedAthleteId]);

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
      className="w-full max-w-none"
      heading=""
      description=""
      entries={filteredEntries}
      users={users}
      currentRole={currentRole}
      currentUserId={currentUserId}
      emptyMessage="Ei viestejä vielä."
      onSend={(body) =>
        onSend(body, {
          athleteId: selectedAthleteId,
        })
      }
      headerSlot={
        <div className="w-full lg:w-72">
          <div className="mb-2 flex items-center justify-between gap-3">
            <Label className="mb-0" htmlFor="coach-conversation-athlete-select">Viestit treenaajittain</Label>
            {totalUnreadCount > 0 ? (
              <span className="inline-flex min-w-7 items-center justify-center rounded-full bg-[var(--accent)] px-2 py-1 text-xs font-semibold text-[var(--accent-contrast)]">
                {totalUnreadCount}
              </span>
            ) : null}
          </div>
          <SearchableAthleteConversationSelect
            id="coach-conversation-athlete-select"
            selectedAthleteId={selectedAthleteId}
            athleteOptions={athleteSelectOptions}
            onSelect={onSelectAthlete}
          />
        </div>
      }
    />
  );
}
