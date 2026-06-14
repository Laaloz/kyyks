"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  Carrot,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Eye,
  MoreHorizontal,
  Plus,
  Search,
  UserPlus,
  X,
} from "lucide-react";
import { createPortal } from "react-dom";
import { type CSSProperties, type ReactNode, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { type Resolver, useFieldArray, useForm } from "react-hook-form";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { ConversationPanel } from "@/components/workout/conversation-panel";
import { InlineFeedback } from "@/components/workout/inline-feedback";
import { CoachInvitePanel } from "@/components/workout/coach/invite-panel";
import { ProgramWorkoutEditor } from "@/components/workout/coach/program-workout-editor";
import { ProgramEditorOverlay } from "@/components/workout/coach/program-editor-overlay";
import { AdminUserManagementPanel } from "@/components/workout/admin-user-management-panel";
import {
  type ProgramComposerExerciseFormValues,
  type ProgramComposerFormValues,
  type ProgramComposerValues,
} from "@/components/workout/coach/program-composer";
import { isConversationEntryNotifiable } from "@/lib/conversation";
import { splitLabel } from "@/lib/domain";
import { buildAthleteRosterSummary } from "@/lib/coach-roster";
import { withMinimumDelay } from "@/lib/min-delay";
import { deriveProgramWorkoutGuidance } from "@/lib/program-workout-guidance";
import { getProgramStatus, isProgramActive } from "@/lib/program-status";
import { isAdminRole } from "@/lib/role-access";
import type { AppState, Exercise, ProgramWorkoutInput, Role, TrainingPlan, UserProfile } from "@/lib/types";
import { cn } from "@/lib/utils";
import { canDeleteProgramFromState, useAppState } from "@/providers/app-state-provider";

import {
  CUSTOM_EXERCISE_VALUE,
  emptyProgramWorkoutExercise,
  emptyProgramWorkout,
  programComposerSchema,
} from "@/components/workout/schemas";
import { PROGRAMS_WORKSPACE_VIEW, workoutStatusBadgeClass, workoutStatusLabel, type WorkspaceView } from "@/components/workout/shared";

type ProgramWorkspaceTab = "library" | "builder";

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
  onOpenInvites,
  onOpenIngredients,
}: {
  view: WorkspaceView;
  onOpenConversation?: () => void;
  onOpenWorkoutLog?: () => void;
  onOpenSettings?: () => void;
  onOpenInvites?: () => void;
  onOpenIngredients?: () => void;
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
    <div className="flex w-full min-w-0 flex-col gap-6">
      {view === "athletes" && currentUser ? (
        <CoachTeamView
          athletes={athletes}
          programs={coachPrograms}
          exercises={exerciseOptions}
          state={state}
          currentUser={currentUser}
          onOpenInvites={onOpenInvites}
          onOpenIngredients={onOpenIngredients}
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
          <Segmented
            ariaLabel="Ohjelmakirjasto tai rakenna"
            value={programWorkspaceTab}
            onChange={setProgramWorkspaceTab}
            options={[
              { value: "library", label: "Ohjelmakirjasto" },
              { value: "builder", label: "Rakenna ohjelma" },
            ]}
          />

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

function rosterInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return "?";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function programWeekLabel(plan: TrainingPlan, reference: Date = new Date()): string | null {
  if (!plan.weekCount || plan.weekCount < 1) {
    return null;
  }
  const start = new Date(plan.startDate);
  start.setHours(0, 0, 0, 0);
  const today = new Date(reference);
  today.setHours(0, 0, 0, 0);
  const elapsedWeeks = Math.floor((today.getTime() - start.getTime()) / (7 * 86_400_000)) + 1;
  const current = Math.min(Math.max(1, elapsedWeeks), plan.weekCount);
  return `viikko ${current}/${plan.weekCount}`;
}

const ROSTER_PILL_TONE: Record<"good" | "warn" | "neutral", string> = {
  good: "border-[color:color-mix(in_oklab,var(--accent)_30%,var(--border))] bg-[var(--accent-soft)] text-[var(--accent)]",
  warn: "border-[color:color-mix(in_oklab,var(--accent-secondary)_40%,var(--border))] bg-[color:color-mix(in_oklab,var(--accent-secondary)_14%,var(--surface))] text-[var(--accent-secondary)]",
  neutral: "border-[var(--border)] bg-[var(--surface-3)] text-[var(--text-subtle)]",
};

function RosterMiniWeek({ cells }: { cells: ReturnType<typeof buildAthleteRosterSummary>["cells"] }) {
  return (
    <div className="mt-3 grid grid-cols-7 gap-1.5">
      {cells.map((cell) => (
        <div key={cell.key} className="flex min-w-0 flex-col items-center gap-1.5">
          <span
            className={cn(
              "flex w-full flex-col gap-1 rounded-lg",
              cell.isToday ? "outline outline-2 outline-offset-2 outline-[var(--text)]" : null,
            )}
          >
            <span
              className={cn(
                "block h-4 rounded-md",
                cell.training === "done"
                  ? "bg-[var(--accent)]"
                  : cell.training === "plan"
                    ? "bg-[color:color-mix(in_srgb,var(--accent)_14%,var(--surface))] shadow-[inset_0_0_0_1.5px_var(--accent)]"
                    : "bg-[var(--surface-2)]",
              )}
              aria-hidden="true"
            />
            <span
              className={cn(
                "block h-4 rounded-md",
                cell.nutrition === "ok"
                  ? "bg-[var(--accent-secondary)]"
                  : cell.nutrition === "part"
                    ? "bg-[color:color-mix(in_srgb,var(--accent-secondary)_35%,var(--surface-2))]"
                    : "bg-[var(--surface-2)]",
              )}
              aria-hidden="true"
            />
          </span>
          <span
            className={cn(
              "text-[11px] font-semibold",
              cell.isToday ? "text-[var(--accent)]" : "text-[var(--text-subtle)]",
            )}
          >
            {cell.weekdayLabel}
          </span>
        </div>
      ))}
    </div>
  );
}

function SectionLabel({ label, meta }: { label: string; meta?: string }) {
  return (
    <div className="mb-2 mt-6 flex items-baseline justify-between gap-3 px-1 first:mt-0">
      <span className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-subtle)]">{label}</span>
      {meta ? <span className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-subtle)]">{meta}</span> : null}
    </div>
  );
}

/**
 * Valmentajan/adminin Tiimi-näkymä prototyypin mukaisena: [Tiimi | Ohjelmat]
 * -segmentti. Tiimi = urheilijakortit (viikkorytmi + tila-pilleri, napautus →
 * read-only-esikatselu) + adminille Valmentajat. Ohjelmat = aktiiviset ohjelmat
 * + Uusi ohjelma.
 */
function CoachTeamView({
  athletes,
  programs,
  exercises,
  state,
  currentUser,
  onOpenInvites,
  onOpenIngredients,
}: {
  athletes: Array<{ id: string; fullName: string }>;
  programs: TrainingPlan[];
  exercises: Exercise[];
  state: AppState;
  currentUser: UserProfile;
  onOpenInvites?: () => void;
  onOpenIngredients?: () => void;
}) {
  const { startAthletePreview, notify, createProgram, updateProgram, setProgramStatus } = useAppState();
  const [segment, setSegment] = useState<"tiimi" | "ohjelmat">("tiimi");
  const [editorGroup, setEditorGroup] = useState<TrainingPlan[] | null>(null);
  const [manageUserId, setManageUserId] = useState<string | null>(null);
  const [manageMounted, setManageMounted] = useState(false);
  useEffect(() => setManageMounted(true), []);
  const isAdmin = isAdminRole(currentUser.role);
  const manageUser = manageUserId ? state.users.find((user) => user.id === manageUserId) ?? null : null;

  // Editorin urheilijavalinnat: itse + valmennettavat.
  const programTargets = useMemo(
    () => [{ id: currentUser.id, fullName: currentUser.fullName }, ...athletes.filter((a) => a.id !== currentUser.id)],
    [athletes, currentUser.fullName, currentUser.id],
  );

  const handleSaveProgram = async ({
    groupId,
    title,
    weekCount,
    workouts,
    assignedAthleteIds,
    groupPlans,
  }: {
    groupId: string;
    title: string;
    weekCount: number;
    workouts: ProgramWorkoutInput[];
    assignedAthleteIds: string[];
    groupPlans: TrainingPlan[];
  }): Promise<{ ok: boolean; message?: string }> => {
    const selected = new Set(assignedAthleteIds);
    const planByAthlete = new Map(groupPlans.map((plan) => [plan.athleteId, plan]));

    for (const athleteId of assignedAthleteIds) {
      const existing = planByAthlete.get(athleteId);
      const result = existing
        ? await updateProgram(existing.id, { title, workouts, programGroupId: groupId })
        : await createProgram({ title, athleteId, workouts, programGroupId: groupId, weekCount });
      if (!result.ok) {
        return result;
      }
    }

    for (const plan of groupPlans) {
      if (!selected.has(plan.athleteId)) {
        const result = await setProgramStatus(plan.id, "removed");
        if (!result.ok) {
          return result;
        }
      }
    }

    notify({ tone: "success", message: `Ohjelma "${title}" tallennettiin.` });
    return { ok: true };
  };

  const statusById = useMemo(
    () => new Map(state.users.map((user) => [user.id, user.status])),
    [state.users],
  );
  const rosterAthletes = useMemo(
    () =>
      athletes.filter(
        (athlete) => athlete.id !== currentUser.id && statusById.get(athlete.id) === "active",
      ),
    [athletes, currentUser.id, statusById],
  );
  const rosterEntries = useMemo(
    () => rosterAthletes.map((athlete) => ({ athlete, summary: buildAthleteRosterSummary(state, athlete.id) })),
    [rosterAthletes, state],
  );

  const otherCoaches = useMemo(() => {
    if (!isAdmin) {
      return [];
    }
    return state.users
      .filter((user) => (user.role === "coach" || user.role === "admin") && user.id !== currentUser.id && user.status === "active")
      .map((coach) => {
        const coachPlans = state.plans.filter((plan) => plan.coachId === coach.id && getProgramStatus(plan) !== "removed");
        const athleteIds = new Set(coachPlans.map((plan) => plan.athleteId));
        const activePrograms = coachPlans.filter((plan) => isProgramActive(plan)).length;
        return { coach, athleteCount: athleteIds.size, activePrograms };
      });
  }, [currentUser.id, isAdmin, state.plans, state.users]);

  const userNameById = useMemo(() => new Map(state.users.map((user) => [user.id, user.fullName])), [state.users]);
  // Saman program_group_id:n rivit = yksi ohjelma monelle urheilijalle.
  const programRows = useMemo(() => {
    const activePlans = programs.filter((plan) => isProgramActive(plan));
    const groups = new Map<string, TrainingPlan[]>();
    activePlans.forEach((plan) => {
      const key = plan.programGroupId ?? plan.id;
      groups.set(key, [...(groups.get(key) ?? []), plan]);
    });

    return Array.from(groups.values()).map((groupPlans) => {
      const base = groupPlans[0];
      const assignedNames = groupPlans.map((plan) =>
        plan.athleteId === currentUser.id ? "Sinä" : (userNameById.get(plan.athleteId) ?? "?").split(/\s+/)[0],
      );
      return {
        key: base.programGroupId ?? base.id,
        groupPlans,
        title: base.title,
        weekLabel: programWeekLabel(base),
        workoutCount: base.workouts?.length ?? 0,
        assignedLabel: assignedNames.length ? assignedNames.join(", ") : "Ei urheilijoita",
      };
    });
  }, [currentUser.id, programs, userNameById]);

  const handlePreview = (athleteId: string) => {
    const result = startAthletePreview(athleteId);
    if (!result.ok) {
      notify({ tone: "danger", message: result.message });
    }
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <Segmented
        ariaLabel="Tiimi tai ohjelmat"
        value={segment}
        onChange={setSegment}
        options={[
          { value: "tiimi", label: "Tiimi" },
          { value: "ohjelmat", label: "Ohjelmat" },
        ]}
      />

      {segment === "tiimi" ? (
        <div>
          <SectionLabel label="Urheilijat" meta={`${rosterEntries.length} aktiivista`} />
          {rosterEntries.length ? (
            <div className="flex flex-col gap-3">
              {rosterEntries.map(({ athlete, summary }) => (
                <button
                  key={athlete.id}
                  type="button"
                  className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left transition hover:border-[var(--border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
                  aria-label={`${isAdmin ? "Hallitse" : "Esikatsele"}: ${athlete.fullName}`}
                  onClick={() => (isAdmin ? setManageUserId(athlete.id) : handlePreview(athlete.id))}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--accent-soft)] font-[family-name:var(--font-display)] text-sm font-bold text-[var(--accent)]">
                        {rosterInitials(athlete.fullName)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-[family-name:var(--font-display)] text-[15.5px] font-bold text-[var(--text)]">
                          {athlete.fullName}
                        </p>
                        <p className="text-[12.5px] text-[var(--text-subtle)]">
                          {summary.weeklyTarget > 0
                            ? `Viikko ${summary.doneThisWeek}/${summary.weeklyTarget}`
                            : "Ei ohjelmaa"}
                          {summary.lastSeenLabel !== "—" ? ` · ${summary.lastSeenLabel}` : ""}
                        </p>
                      </div>
                    </div>
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center rounded-full border px-3 py-1 text-xs font-semibold",
                        ROSTER_PILL_TONE[summary.statusTone],
                      )}
                    >
                      {summary.statusLabel}
                    </span>
                  </div>
                  <RosterMiniWeek cells={summary.cells} />
                </button>
              ))}
            </div>
          ) : (
            <Card>
              <CardDescription>
                Lisää ensin treenaajia, niin näet heidän viikkorytminsä ja voit esikatsella heidän näkymäänsä.
              </CardDescription>
            </Card>
          )}

          {rosterEntries.length ? (
            <p className="mx-1 mt-3 text-[13px] text-pretty text-[var(--text-subtle)]">
              {isAdmin
                ? "Napauta urheilijaa — hallitset roolia, vastuuhenkilöitä ja esikatselet hänen näkymäänsä."
                : "Napauta urheilijaa — esikatselet hänen omaa näkymäänsä vain luku -tilassa."}
            </p>
          ) : null}

          {isAdmin && otherCoaches.length ? (
            <>
              <SectionLabel label="Valmentajat" meta={`${otherCoaches.length} aktiivinen`} />
              <Card className="divide-y divide-[var(--border)] p-0">
                {otherCoaches.map(({ coach, athleteCount, activePrograms }) => (
                  <button
                    key={coach.id}
                    type="button"
                    className="flex w-full items-center justify-between gap-3 p-4 text-left transition hover:bg-[var(--surface-2)]"
                    aria-label={`Hallitse: ${coach.fullName}`}
                    onClick={() => setManageUserId(coach.id)}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--accent-soft)] font-[family-name:var(--font-display)] text-sm font-bold text-[var(--accent)]">
                        {rosterInitials(coach.fullName)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-[family-name:var(--font-display)] text-[15.5px] font-bold text-[var(--text)]">
                          {coach.fullName}
                        </p>
                        <p className="text-[12.5px] text-[var(--text-subtle)]">
                          {athleteCount} {athleteCount === 1 ? "urheilija" : "urheilijaa"} · {activePrograms}{" "}
                          {activePrograms === 1 ? "ohjelma" : "ohjelmaa"}
                        </p>
                      </div>
                    </div>
                    <Badge>{coach.role === "admin" ? "Admin" : "Valmentaja"}</Badge>
                  </button>
                ))}
              </Card>
            </>
          ) : null}

          {isAdmin && (onOpenInvites || onOpenIngredients) ? (
            <>
              <SectionLabel label="Hallinta" />
              <div className="grid gap-2 sm:grid-cols-2">
                {onOpenInvites ? (
                  <Button type="button" variant="secondary" className="justify-start gap-2" onClick={onOpenInvites}>
                    <UserPlus className="size-4" aria-hidden="true" />
                    Kutsut
                  </Button>
                ) : null}
                {onOpenIngredients ? (
                  <Button type="button" variant="secondary" className="justify-start gap-2" onClick={onOpenIngredients}>
                    <Carrot className="size-4" aria-hidden="true" />
                    Raaka-ainekatalogi
                  </Button>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      ) : (
        <div>
          <SectionLabel label="Aktiiviset ohjelmat" />
          {programRows.length ? (
            <Card className="divide-y divide-[var(--border)] p-0">
              {programRows.map(({ key, groupPlans, title, weekLabel, workoutCount, assignedLabel }) => (
                <button
                  key={key}
                  type="button"
                  className="flex w-full items-center justify-between gap-3 p-4 text-left transition hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]"
                  aria-label={`Muokkaa: ${title}`}
                  onClick={() => setEditorGroup(groupPlans)}
                >
                  <div className="min-w-0">
                    <p className="truncate font-[family-name:var(--font-display)] text-[15.5px] font-bold text-[var(--text)]">
                      {title}
                      {weekLabel ? <span className="text-[var(--text-subtle)]"> · {weekLabel}</span> : null}
                    </p>
                    <p className="truncate text-[12.5px] text-[var(--text-subtle)]">
                      {workoutCount} treeniä/vko · {assignedLabel}
                    </p>
                  </div>
                  <Badge className="shrink-0">Muokkaa</Badge>
                </button>
              ))}
            </Card>
          ) : (
            <Card>
              <CardDescription>Ei vielä aktiivisia ohjelmia. Luo ensimmäinen ohjelma alta.</CardDescription>
            </Card>
          )}
          <Button type="button" variant="secondary" className="mt-3 w-full gap-2" onClick={() => setEditorGroup([])}>
            <Plus className="size-4" aria-hidden="true" />
            Uusi ohjelma
          </Button>
          <p className="mx-1 mt-3 text-[13px] text-pretty text-[var(--text-subtle)]">
            Ohjelmia voi luoda ja muokata suoraan mobiilissa — muutokset näkyvät urheilijoille heti.
          </p>
        </div>
      )}

      {editorGroup ? (
        <ProgramEditorOverlay
          groupPlans={editorGroup}
          athletes={programTargets}
          exercises={exercises}
          currentUserId={currentUser.id}
          onClose={() => setEditorGroup(null)}
          onSave={handleSaveProgram}
        />
      ) : null}

      {manageMounted && manageUser
        ? createPortal(
            <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto overscroll-contain bg-[var(--background)] px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-[calc(env(safe-area-inset-top)+0.75rem)]">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--surface)] text-[var(--text)] shadow-[0_1px_2px_var(--shadow-soft)] transition hover:bg-[var(--surface-2)]"
                  aria-label="Takaisin"
                  onClick={() => setManageUserId(null)}
                >
                  <ChevronLeft className="size-5" aria-hidden="true" />
                </button>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.05em] text-[var(--text-subtle)]">Käyttäjän hallinta</p>
                  <h2 className="truncate font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--text)]">
                    {manageUser.fullName}
                  </h2>
                </div>
              </div>

              {(manageUser.role === "athlete" || manageUser.role === "independent_athlete") && manageUser.status === "active" ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="mt-4 w-full gap-2"
                  onClick={() => {
                    const target = manageUser.id;
                    setManageUserId(null);
                    handlePreview(target);
                  }}
                >
                  <Eye className="size-4" aria-hidden="true" />
                  Esikatsele urheilijan näkymä
                </Button>
              ) : null}

              <div className="mt-4">
                <AdminUserManagementPanel focusUserId={manageUser.id} />
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
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
