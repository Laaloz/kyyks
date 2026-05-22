"use client";

import {
  ArrowLeft,
  Bike,
  BookOpen,
  CircleDot,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Dumbbell,
  Flame,
  Footprints,
  HeartPulse,
  Info,
  Mountain,
  Music,
  MoreHorizontal,
  PersonStanding,
  Snowflake,
  Swords,
  Trash2,
  Waves,
  Activity,
  X,
  Clock3,
  Pencil,
} from "lucide-react";
import {
  startTransition,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/field";
import { bodyMeasurementSchema } from "@/components/workout/schemas";
import { InfoTooltip } from "@/components/ui/tooltip";
import { AthleteSessionPanel } from "@/components/workout/athlete/session-panel";
import { ConversationPanel } from "@/components/workout/conversation-panel";
import { MetricTrendChart } from "@/components/workout/metric-trend-chart";
import { NutritionAthleteCard } from "@/components/workout/nutrition-athlete-card";
import { PersonalNutritionSummaryCard } from "@/components/workout/personal-nutrition-summary-card";
import { estimateStrengthCalories, getMeasurementsForUser, getWeightAtMoment } from "@/lib/body-metrics";
import { calculateSessionDurationSeconds, getSessionProgress } from "@/lib/domain";
import { buildExerciseProgressCatalog, type ExerciseProgressCatalog } from "@/lib/exercise-progress";
import { withMinimumDelay } from "@/lib/min-delay";
import { deriveProgramWorkoutGuidance } from "@/lib/program-workout-guidance";
import { isProgramActive } from "@/lib/program-status";
import { canTrackOwnTraining } from "@/lib/role-access";
import { buildScheduledWorkoutExerciseOrder } from "@/lib/workout-exercise-order";
import { buildWorkoutHistoryTitleMap, normalizeWorkoutHistoryTitle } from "@/lib/workout-history-title";
import { cn } from "@/lib/utils";
import { estimateExtraActivityKcal, extraActivityCatalog } from "@/lib/extra-activities";
import type { AppState, ConversationEntry, ExtraActivityType, WorkoutSession } from "@/lib/types";
import { formatDate, formatDateWithWeekday, formatRelativeDate } from "@/lib/utils";
import { resolveBlockingWorkoutStart, useAppState } from "@/providers/app-state-provider";

import { ProgressRing, workoutStatusBadgeClass, workoutStatusLabel, type WorkspaceView } from "@/components/workout/shared";

type WorkoutSelectionPriority = 0 | 2 | 3;
type ProgramWorkoutPreview = NonNullable<AppState["plans"][number]["workouts"]>[number];
type ProgramWorkoutPreviewSet = ProgramWorkoutPreview["exercises"][number]["sets"][number];

type WorkoutOrderMetadata = {
  primaryTimestamp: string;
  secondaryTimestamp: string;
};

function CoachInstructionDialog({
  exerciseName,
  instruction,
  onClose,
}: {
  exerciseName: string;
  instruction: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-[color:color-mix(in_srgb,var(--background)_54%,transparent)] p-4 sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="coach-instruction-title"
        aria-describedby="coach-instruction-description"
        className="w-full max-w-lg rounded-3xl border border-[var(--border-strong)] bg-[var(--surface)] p-4 shadow-[0_24px_60px_-24px_var(--shadow)]"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-[11px] font-semibold tracking-[0.06em] text-[var(--accent)]">Valmentajan ohje</p>
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
        <div className="mt-5 flex justify-end">
          <Button type="button" variant="ghost" onClick={onClose}>
            Sulje
          </Button>
        </div>
      </div>
    </div>
  );
}

function WorkoutPreviewDialog({
  workout,
  onClose,
}: {
  workout: ProgramWorkoutPreview;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const formatRepText = (set: ProgramWorkoutPreviewSet) => {
    if (set.targetRepsMin && set.targetRepsMax) {
      return `${set.targetRepsMin}-${set.targetRepsMax} toistoa`;
    }
    return `${set.targetReps} toistoa`;
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-[color:color-mix(in_srgb,var(--background)_54%,transparent)] p-4 sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="workout-preview-title"
        className="w-full max-w-lg rounded-3xl border border-[var(--border-strong)] bg-[var(--surface)] p-4 shadow-[0_24px_60px_-24px_var(--shadow)]"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-[11px] font-semibold tracking-[0.06em] text-[var(--accent)]">Treenin esikatselu</p>
        <h3
          id="workout-preview-title"
          className="mt-2 font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--text)]"
        >
          {workout.name}
        </h3>
        <p className="mt-1 text-sm text-[var(--text-subtle)]">
          {workout.exercises.length} liikettä
        </p>
        <div className="mt-4 max-h-[60vh] space-y-2 overflow-y-auto pr-1">
          {workout.exercises.map((exercise, index) => {
            const firstSet = exercise.sets[0];
            const rest = firstSet?.restSeconds ?? workout.defaultRestSeconds;
            return (
              <div
                key={exercise.id}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5"
              >
                <p className="text-sm font-semibold text-[var(--text)]">
                  {index + 1}. {exercise.exerciseName}
                </p>
                <p className="mt-1 text-xs text-[var(--text-subtle)]">
                  {exercise.sets.length} sarjaa · {firstSet ? formatRepText(firstSet) : "Toistot puuttuvat"} · lepo {rest}s
                </p>
              </div>
            );
          })}
        </div>
        <div className="mt-5 flex justify-end">
          <Button type="button" variant="ghost" onClick={onClose}>
            Sulje
          </Button>
        </div>
      </div>
    </div>
  );
}

function ExtraActivityDialog({
  activityType,
  durationMinutes,
  occurredDate,
  notes,
  estimatedKcal,
  isManualKcalEnabled,
  manualKcal,
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
  const durationHours = Math.floor(totalMinutes / 60);
  const durationRemainderMinutes = totalMinutes % 60;
  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-[color:color-mix(in_srgb,var(--background)_54%,transparent)] p-4 sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="extra-activity-title"
        className="w-full max-w-lg overflow-x-hidden rounded-3xl border border-[var(--border-strong)] bg-[var(--surface)] p-4 shadow-[0_24px_60px_-24px_var(--shadow)]"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-[11px] font-semibold tracking-[0.06em] text-[var(--accent)]">Extra-treeni</p>
        <h3 id="extra-activity-title" className="mt-2 text-xl font-semibold text-[var(--text)]">
          Lisää extra-treeni historiaan
        </h3>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <div className="min-w-0">
            <Label htmlFor="extra-activity-type-modal" className="text-xs">Laji</Label>
            <Select
              id="extra-activity-type-modal"
              className="mt-1 w-full min-w-0"
              value={activityType}
              onChange={(event) => onChangeActivityType(event.target.value as ExtraActivityType)}
            >
              {Object.entries(extraActivityCatalog).map(([key, value]) => (
                <option key={key} value={key}>{value.label}</option>
              ))}
            </Select>
          </div>
          <div className="min-w-0">
            <Label className="text-xs">Kesto</Label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <div className="min-w-0">
                <Label htmlFor="extra-activity-duration-hours-modal" className="text-[11px] text-[var(--text-subtle)]">Tunnit</Label>
                <Input
                  id="extra-activity-duration-hours-modal"
                  className="mt-1 w-full min-w-0"
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  value={String(durationHours)}
                  onChange={(event) => {
                    const hours = Math.max(0, Number(event.target.value) || 0);
                    onChangeDurationMinutes(String(hours * 60 + durationRemainderMinutes));
                  }}
                />
              </div>
              <div className="min-w-0">
                <Label htmlFor="extra-activity-duration-minutes-modal" className="text-[11px] text-[var(--text-subtle)]">Minuutit</Label>
                <Input
                  id="extra-activity-duration-minutes-modal"
                  className="mt-1 w-full min-w-0"
                  type="number"
                  min={0}
                  max={59}
                  step={1}
                  inputMode="numeric"
                  value={String(durationRemainderMinutes)}
                  onChange={(event) => {
                    const minutes = Math.min(59, Math.max(0, Number(event.target.value) || 0));
                    onChangeDurationMinutes(String(durationHours * 60 + minutes));
                  }}
                />
              </div>
            </div>
          </div>
          <div className="min-w-0">
            <Label htmlFor="extra-activity-date-modal" className="text-xs">Päivä</Label>
            <div className="mt-1 min-w-0 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] transition focus-within:border-[var(--accent)] focus-within:shadow-[inset_0_0_0_1px_var(--accent)]">
              <input
                id="extra-activity-date-modal"
                className="block h-12 w-full min-w-0 max-w-full border-0 bg-transparent px-4 py-3 text-sm text-[var(--text)] outline-none ring-0 focus:outline-none focus:ring-0"
                type="date"
                inputMode="none"
                value={occurredDate}
                onChange={(event) => onChangeOccurredDate(event.target.value)}
              />
            </div>
          </div>
        </div>
        <p className="mt-2 text-xs text-[var(--text-subtle)]">
          Arvio kcal lasketaan automaattisesti: {estimatedKcal} kcal
        </p>
        <label className="mt-2 flex items-center gap-2 text-xs text-[var(--text)]">
          <input
            type="checkbox"
            checked={isManualKcalEnabled}
            onChange={(event) => onToggleManualKcal(event.target.checked)}
          />
          Tarkenna kcal manuaalisesti
        </label>
        {isManualKcalEnabled ? (
          <div className="mt-2">
            <Label htmlFor="extra-activity-manual-kcal-modal" className="text-xs">Manuaalinen kcal</Label>
            <Input
              id="extra-activity-manual-kcal-modal"
              className="mt-1"
              type="number"
              min={1}
              step={1}
              value={manualKcal}
              onChange={(event) => onChangeManualKcal(event.target.value)}
            />
          </div>
        ) : null}
        <div className="mt-2">
          <Label htmlFor="extra-activity-notes-modal" className="text-xs">Muistiinpano (valinnainen)</Label>
          <Textarea
            id="extra-activity-notes-modal"
            className="mt-1"
            value={notes}
            onChange={(event) => onChangeNotes(event.target.value)}
          />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Peruuta
          </Button>
          <Button type="button" onClick={onSave}>
            Tallenna
          </Button>
        </div>
      </div>
    </div>
  );
}

function CalendarWorkoutDetailDialog({
  title,
  occurredAt,
  rows,
  note,
  onClose,
}: {
  title: string;
  occurredAt: string;
  rows: Array<{
    key: string;
    exerciseName: string;
    completedSets: number;
    totalSets: number;
    bestLoad?: number;
    bestReps?: number;
  }>;
  note?: string | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-[color:color-mix(in_srgb,var(--background)_54%,transparent)] p-4 sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="calendar-workout-detail-title"
        className="w-full max-w-lg rounded-3xl border border-[var(--border-strong)] bg-[var(--surface)] p-4 shadow-[0_24px_60px_-24px_var(--shadow)]"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-[11px] font-semibold tracking-[0.06em] text-[var(--accent)]">Treenin tiedot</p>
        <h3 id="calendar-workout-detail-title" className="mt-2 text-xl font-semibold text-[var(--text)]">
          {title}
        </h3>
        <p className="mt-1 text-xs text-[var(--text-subtle)]">{formatDateWithWeekday(occurredAt)}</p>
        <div className="mt-4 max-h-[55vh] space-y-2 overflow-y-auto pr-1">
          {note ? (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5">
              <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Muistiinpano</p>
              <p className="mt-1 whitespace-pre-line text-sm text-[var(--text)]">{note}</p>
            </div>
          ) : null}
          {rows.map((row) => (
            <div key={row.key} className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5">
              <p className="text-sm font-medium text-[var(--text)]">{row.exerciseName}</p>
              <p className="mt-1 text-xs text-[var(--text-subtle)]">
                {row.completedSets}/{row.totalSets} sarjaa
                {row.bestLoad !== undefined && row.bestReps !== undefined
                  ? ` · paras ${formatLoadValue(row.bestLoad)} kg x ${row.bestReps}`
                  : ""}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-5 flex justify-end">
          <Button type="button" variant="ghost" onClick={onClose}>
            Sulje
          </Button>
        </div>
      </div>
    </div>
  );
}

function CalendarExtraActivityDetailDialog({
  title,
  occurredAt,
  durationMinutes,
  estimatedKcal,
  notes,
  onClose,
}: {
  title: string;
  occurredAt: string;
  durationMinutes: number;
  estimatedKcal: number;
  notes?: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-[color:color-mix(in_srgb,var(--background)_54%,transparent)] p-4 sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="calendar-extra-detail-title"
        className="w-full max-w-lg rounded-3xl border border-[var(--border-strong)] bg-[var(--surface)] p-4 shadow-[0_24px_60px_-24px_var(--shadow)]"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-[11px] font-semibold tracking-[0.06em] text-[var(--accent)]">Extra-treenin tiedot</p>
        <h3 id="calendar-extra-detail-title" className="mt-2 text-xl font-semibold text-[var(--text)]">
          {title}
        </h3>
        <p className="mt-1 text-xs text-[var(--text-subtle)]">{formatDateWithWeekday(occurredAt)}</p>
        <p className="mt-3 text-sm text-[var(--text)]">{durationMinutes} min · {estimatedKcal} kcal</p>
        {notes ? (
          <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5">
            <p className="text-[11px] font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Muistiinpano</p>
            <p className="mt-1 whitespace-pre-line text-sm text-[var(--text)]">{notes}</p>
          </div>
        ) : null}
        <div className="mt-5 flex justify-end">
          <Button type="button" variant="ghost" onClick={onClose}>
            Sulje
          </Button>
        </div>
      </div>
    </div>
  );
}

function getWorkoutOrderTimestamps(
  workout: AppState["scheduledWorkouts"][number],
  session?: WorkoutSession,
): WorkoutOrderMetadata {
  return {
    primaryTimestamp: session?.startedAt ?? workout.createdAt ?? workout.scheduledDate,
    secondaryTimestamp: workout.scheduledDate ?? workout.createdAt,
  };
}

function compareWorkoutOrderValues(left: WorkoutOrderMetadata, right: WorkoutOrderMetadata) {
  const primaryComparison = right.primaryTimestamp.localeCompare(left.primaryTimestamp);
  if (primaryComparison !== 0) {
    return primaryComparison;
  }

  const secondaryComparison = right.secondaryTimestamp.localeCompare(left.secondaryTimestamp);
  if (secondaryComparison !== 0) {
    return secondaryComparison;
  }

  return 0;
}

function getSessionDisplayCompletedAt(session: WorkoutSession) {
  return session.completedAt ?? session.startedAt ?? session.updatedAt;
}

type PreviousExerciseResult = {
  actualReps?: number;
  actualLoad?: number;
  completedAt: string;
  timesCompleted: number;
};

type WorkoutInsight = {
  exerciseCount: number;
  setCount: number;
  completedSetCount: number;
  completionPercent: number;
  totalLoadKg: number;
  liftedKg: number;
  durationSeconds: number;
  estimatedCalories: number;
  muscleGroupSetCounts: Record<HistoryMuscleGroupKey, number>;
  muscleGroupLiftedKg: Record<HistoryMuscleGroupKey, number>;
};

type AthleteLogMode = "overview" | "workout";
type AthleteLogTab = "training" | "history";
type AthleteOverviewFocusTarget = "measurements";
type MeasurementMessageTone = "info" | "success" | "error";
type HistoryCalendarCell = {
  key: string;
  date: Date;
  isCurrentMonth: boolean;
  activityCount: number;
  activityByType: Record<string, number>;
};
type CalendarDayActivityItem =
  | {
      kind: "strength";
      id: string;
      workoutId: string;
      title: string;
      occurredAt: string;
      durationSeconds: number;
      completedSets: number;
      totalSets: number;
      liftedKg: number;
    }
  | {
      kind: "extra";
      id: string;
      activityId: string;
      activityType: ExtraActivityType;
      label: string;
      occurredAt: string;
      durationMinutes: number;
      estimatedKcal: number;
      notes?: string;
    };

type HistoryMuscleGroupKey = "shoulders" | "arms" | "chest" | "abs" | "back" | "legs" | "other";

const historyMuscleGroups: Array<{ key: HistoryMuscleGroupKey; label: string }> = [
  { key: "shoulders", label: "Olkapää" },
  { key: "arms", label: "Kädet" },
  { key: "chest", label: "Rinta" },
  { key: "abs", label: "Vatsalihakset" },
  { key: "back", label: "Selkä" },
  { key: "legs", label: "Jalat" },
  { key: "other", label: "Muu" },
];

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

export function AthleteDashboard({
  view,
  onOpenWorkoutLog,
  onOpenSettings,
  onWorkoutDetailModeChange,
  overviewFocusTarget,
  onOverviewFocusHandled,
}: {
  view: WorkspaceView;
  onOpenWorkoutLog?: () => void;
  onOpenSettings?: () => void;
  onWorkoutDetailModeChange?: (isOpen: boolean) => void;
  overviewFocusTarget?: AthleteOverviewFocusTarget | null;
  onOverviewFocusHandled?: () => void;
}) {
  const {
    authenticatedUser,
    currentUser,
    state,
    notify,
    startWorkout,
    startProgramWorkout,
    updateCurrentUserMeasurements,
    updateWorkoutDate,
    updateWorkoutDuration,
    addExtraActivity,
    updateExtraActivity,
    deleteExtraActivity,
    updateWorkoutSet,
    updateWorkoutExerciseStructure,
    saveWorkoutNote,
    addConversationComment,
    completeWorkout,
    cancelWorkout,
    deleteWorkout,
  } = useAppState();
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(null);
  const [workoutMessage, setWorkoutMessage] = useState<string>("");
  const [openWorkoutInstruction, setOpenWorkoutInstruction] = useState<{ exerciseName: string; instruction: string } | null>(null);
  const [openWorkoutPreview, setOpenWorkoutPreview] = useState<ProgramWorkoutPreview | null>(null);
  const [athleteLogMode, setAthleteLogMode] = useState<AthleteLogMode>("overview");
  const [athleteLogTab, setAthleteLogTab] = useState<AthleteLogTab>("training");
  const [athleteLogReturnTab, setAthleteLogReturnTab] = useState<AthleteLogTab>("training");
  const [dismissedActiveWorkoutId, setDismissedActiveWorkoutId] = useState<string | null>(null);
  const [historyFocusWorkoutId, setHistoryFocusWorkoutId] = useState<string | null>(null);
  const [pendingStartWorkoutId, setPendingStartWorkoutId] = useState<string | null>(null);
  const [correctionModeWorkoutId, setCorrectionModeWorkoutId] = useState<string | null>(null);
  const [openHistoryMenuWorkoutId, setOpenHistoryMenuWorkoutId] = useState<string | null>(null);
  const [historyMenuAnchorRect, setHistoryMenuAnchorRect] = useState<AnchorRect | null>(null);
  const [historyMenuStyle, setHistoryMenuStyle] = useState<CSSProperties | null>(null);
  const [expandedHistoryGroups, setExpandedHistoryGroups] = useState<Record<string, boolean>>({});
  const sessionByWorkoutId = useMemo(
    () => new Map(state.sessions.map((session) => [session.scheduledWorkoutId, session])),
    [state.sessions],
  );
  const [selectedHistoryWorkoutByGroup, setSelectedHistoryWorkoutByGroup] = useState<Record<string, string>>({});
  const [measurementDraft, setMeasurementDraft] = useState({
    weightKg: "",
    waistCm: "",
  });
  const [measurementMessage, setMeasurementMessage] = useState("");
  const [measurementMessageTone, setMeasurementMessageTone] = useState<MeasurementMessageTone>("info");
  const [isSavingMeasurements, setIsSavingMeasurements] = useState(false);
  const [isMeasurementFormExpanded, setIsMeasurementFormExpanded] = useState(false);
  const [activeMeasurementTrend, setActiveMeasurementTrend] = useState<"weight" | "waist" | "volume">("weight");
  const [selectedExerciseProgressKey, setSelectedExerciseProgressKey] = useState("");
  const [isExerciseProgressExpanded, setIsExerciseProgressExpanded] = useState(false);
  const [historyCalendarMonth, setHistoryCalendarMonth] = useState(() => startOfCalendarMonth(new Date()));
  const [extraActivityType, setExtraActivityType] = useState<ExtraActivityType>("run");
  const [extraActivityDurationMinutes, setExtraActivityDurationMinutes] = useState("30");
  const [extraActivityDate, setExtraActivityDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [extraActivityNotes, setExtraActivityNotes] = useState("");
  const [isManualExtraActivityKcalEnabled, setIsManualExtraActivityKcalEnabled] = useState(false);
  const [manualExtraActivityKcal, setManualExtraActivityKcal] = useState("");
  const [isExtraActivityDialogOpen, setIsExtraActivityDialogOpen] = useState(false);
  const [editingExtraActivityId, setEditingExtraActivityId] = useState<string | null>(null);
  const [showAllExtraActivities, setShowAllExtraActivities] = useState(false);
  const [selectedCalendarDayKey, setSelectedCalendarDayKey] = useState<string | null>(null);
  const [selectedCalendarWorkoutId, setSelectedCalendarWorkoutId] = useState<string | null>(null);
  const [selectedCalendarExtraActivityId, setSelectedCalendarExtraActivityId] = useState<string | null>(null);
  const [isCompletingWorkout, setIsCompletingWorkout] = useState(false);
  const [keepWorkoutScreenOn, setKeepWorkoutScreenOn] = useState(false);
  const [workoutWakeLockSupported, setWorkoutWakeLockSupported] = useState(false);
  const [workoutWakeLockError, setWorkoutWakeLockError] = useState("");
  const [workoutWakeLockSentinel, setWorkoutWakeLockSentinel] = useState<{ release: () => Promise<void> } | null>(null);
  const [pendingWorkoutTransition, setPendingWorkoutTransition] = useState<
    | { type: "open"; scheduledWorkoutId: string; workoutName: string; sourceKey: string }
    | { type: "start"; workoutId: string; workoutName: string; sourceKey: string }
    | { type: "complete" }
    | { type: "cancel" }
    | { type: "delete" }
    | null
  >(null);
  const isDebugEnabled =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("debug_state") === "1";
  const historySectionRef = useRef<HTMLDivElement | null>(null);
  const historyMenuRef = useRef<HTMLDivElement | null>(null);
  const measurementsSectionRef = useRef<HTMLDivElement | null>(null);
  const closeWorkoutView = () => {
    setSelectedWorkoutId(null);
    setHistoryFocusWorkoutId(null);
    setCorrectionModeWorkoutId(null);
    setOpenHistoryMenuWorkoutId(null);
    setHistoryMenuAnchorRect(null);
    setHistoryMenuStyle(null);
    setAthleteLogMode("overview");
    setAthleteLogTab(athleteLogReturnTab);
  };
  useEffect(() => {
    setSelectedHistoryWorkoutByGroup({});
  }, [currentUser?.id]);
  useEffect(() => {
    setExpandedHistoryGroups({});
  }, [currentUser?.id]);
  useEffect(() => {
    setSelectedExerciseProgressKey("");
    setIsExerciseProgressExpanded(false);
  }, [currentUser?.id]);
  useEffect(() => {
    setHistoryCalendarMonth(startOfCalendarMonth(new Date()));
  }, [currentUser?.id]);
  useEffect(() => {
    setExtraActivityType("run");
    setExtraActivityDurationMinutes("30");
    setExtraActivityDate(new Date().toISOString().slice(0, 10));
    setExtraActivityNotes("");
    setIsManualExtraActivityKcalEnabled(false);
    setManualExtraActivityKcal("");
  }, [currentUser?.id]);
  useEffect(() => {
    const latestWaistValue =
      currentUser
        ? getMeasurementsForUser(state, currentUser.id).find((entry) => entry.waistCm !== undefined)?.waistCm
        : undefined;

    setMeasurementDraft({
      weightKg: currentUser?.weightKg !== undefined ? String(currentUser.weightKg) : "",
      waistCm: latestWaistValue !== undefined ? String(latestWaistValue) : "",
    });
  }, [currentUser?.id, currentUser?.weightKg, state.bodyMeasurements]);
  useEffect(() => {
    setMeasurementMessage("");
    setMeasurementMessageTone("info");
  }, [currentUser?.id]);
  useEffect(() => {
    setIsMeasurementFormExpanded(false);
    setActiveMeasurementTrend("weight");
  }, [currentUser?.id]);
  useEffect(() => {
    setWorkoutWakeLockSupported(typeof navigator !== "undefined" && "wakeLock" in navigator);
  }, []);
  useEffect(() => {
    const shouldKeepAwake = keepWorkoutScreenOn && athleteLogMode === "workout" && Boolean(selectedWorkoutId);
    if (!workoutWakeLockSupported || !shouldKeepAwake) {
      if (workoutWakeLockSentinel) {
        void workoutWakeLockSentinel.release().catch(() => undefined);
        setWorkoutWakeLockSentinel(null);
      }
      return;
    }
    if (workoutWakeLockSentinel) {
      return;
    }

    let cancelled = false;
    const requestWakeLock = async () => {
      try {
        const lock = await (navigator as Navigator & {
          wakeLock: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> };
        }).wakeLock.request("screen");
        if (cancelled) {
          await lock.release().catch(() => undefined);
          return;
        }
        setWorkoutWakeLockError("");
        setWorkoutWakeLockSentinel(lock);
      } catch {
        if (!cancelled) {
          setWorkoutWakeLockError("Näytön päälläpito ei onnistunut tällä laitteella.");
          setKeepWorkoutScreenOn(false);
        }
      }
    };
    void requestWakeLock();

    return () => {
      cancelled = true;
    };
  }, [athleteLogMode, keepWorkoutScreenOn, selectedWorkoutId, workoutWakeLockSentinel, workoutWakeLockSupported]);
  useEffect(() => {
    return () => {
      if (workoutWakeLockSentinel) {
        void workoutWakeLockSentinel.release().catch(() => undefined);
      }
    };
  }, [workoutWakeLockSentinel]);
  useEffect(() => {
    onWorkoutDetailModeChange?.(view === "athlete-log" && athleteLogMode === "workout");
  }, [athleteLogMode, onWorkoutDetailModeChange, view]);
  useEffect(() => {
    if (view !== "overview" || overviewFocusTarget !== "measurements") {
      return;
    }

    setIsMeasurementFormExpanded(true);

    const node = measurementsSectionRef.current;
    if (!node) {
      return;
    }

    node.scrollIntoView({ behavior: "smooth", block: "start" });
    onOverviewFocusHandled?.();
  }, [view, overviewFocusTarget, onOverviewFocusHandled]);
  const athletePrograms = state.plans.filter(
    (plan) => plan.athleteId === currentUser?.id && Boolean(plan.workouts?.length) && isProgramActive(plan),
  );
  const athleteProgramsByEmail = currentUser
    ? state.plans.filter((plan) => {
        const athlete = state.users.find((user) => user.id === plan.athleteId);
        return athlete?.email.toLowerCase() === currentUser.email.toLowerCase();
      })
    : [];

  const workouts = state.scheduledWorkouts
    .filter((item) => item.athleteId === currentUser?.id)
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));

  const scheduledWithSessionIds = useMemo(
    () => new Set(state.sessions.map((session) => session.scheduledWorkoutId)),
    [state.sessions],
  );
  const getWorkoutOrderMetadata = useMemo(
    () => (workout: (typeof workouts)[number]): WorkoutOrderMetadata =>
      getWorkoutOrderTimestamps(workout, sessionByWorkoutId.get(workout.id)),
    [sessionByWorkoutId],
  );
  const compareWorkoutOrder = useMemo(() => {
    return (left: (typeof workouts)[number], right: (typeof workouts)[number]) => {
      const leftOrder = getWorkoutOrderMetadata(left);
      const rightOrder = getWorkoutOrderMetadata(right);

      const metadataComparison = compareWorkoutOrderValues(leftOrder, rightOrder);
      return metadataComparison !== 0 ? metadataComparison : right.id.localeCompare(left.id);
    };
  }, [getWorkoutOrderMetadata]);
  const resolveWorkoutStatus = (workout: (typeof workouts)[number]) => {
    const session = sessionByWorkoutId.get(workout.id);
    if (session?.completedAt || workout.completedAt) {
      return "completed" as const;
    }

    return workout.status;
  };

  const activeWorkout = useMemo(
    () =>
      [...workouts]
        .filter((item) => resolveWorkoutStatus(item) === "in_progress")
        .sort(compareWorkoutOrder)[0],
    [compareWorkoutOrder, workouts],
  );
  const resumableWorkout = useMemo(
    () =>
      [...workouts]
        .filter((item) => resolveWorkoutStatus(item) === "cancelled" && scheduledWithSessionIds.has(item.id))
        .sort(compareWorkoutOrder)[0],
    [compareWorkoutOrder, scheduledWithSessionIds, workouts],
  );
  const highlightedWorkout = activeWorkout ?? resumableWorkout;
  const highlightedWorkoutState = activeWorkout ? "active" : resumableWorkout ? "resumable" : null;
  const fallbackSelectedWorkout = athleteLogMode === "workout" ? highlightedWorkout : undefined;
  const explicitlySelectedWorkout = selectedWorkoutId
    ? workouts.find((item) => item.id === selectedWorkoutId)
    : undefined;
  const selectedWorkout =
    explicitlySelectedWorkout ??
    fallbackSelectedWorkout;

  const selectedSession = state.sessions.find((session) => session.scheduledWorkoutId === selectedWorkout?.id);
  const existingNote = selectedSession ? state.notes.find((note) => note.sessionId === selectedSession.id)?.body ?? "" : "";
  const athleteConversationEntries = useMemo(
    () =>
      state.conversationEntries
        .filter((entry) => entry.athleteId === currentUser?.id)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [currentUser?.id, state.conversationEntries],
  );
  const progress = selectedWorkout ? getSessionProgress(state, selectedWorkout.id) : null;
  const inProgressCount = workouts.filter((item) => resolveWorkoutStatus(item) === "in_progress").length;
  useEffect(() => {
    if (!dismissedActiveWorkoutId) {
      return;
    }

    if (!activeWorkout || activeWorkout.id !== dismissedActiveWorkoutId) {
      setDismissedActiveWorkoutId(null);
    }
  }, [activeWorkout, dismissedActiveWorkoutId]);
  useEffect(() => {
    if (!selectedWorkoutId) {
      return;
    }

    const selectedStillExists = workouts.some((workout) => workout.id === selectedWorkoutId);
    if (selectedStillExists) {
      return;
    }

    if (
      pendingWorkoutTransition?.type === "start" ||
      pendingWorkoutTransition?.type === "open" ||
      pendingStartWorkoutId === selectedWorkoutId
    ) {
      return;
    }

    setCorrectionModeWorkoutId((current) => (current === selectedWorkoutId ? null : current));
    setOpenHistoryMenuWorkoutId((current) => (current === selectedWorkoutId ? null : current));
    setHistoryMenuAnchorRect(null);
    setHistoryMenuStyle(null);

    if (athleteLogMode === "workout" && highlightedWorkout) {
      setSelectedWorkoutId(highlightedWorkout.id);
      return;
    }

    setSelectedWorkoutId(null);
    setAthleteLogMode("overview");
  }, [athleteLogMode, highlightedWorkout, pendingStartWorkoutId, pendingWorkoutTransition, selectedWorkoutId, workouts]);

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
  const selectedWorkoutInstructions = useMemo(
    () =>
      selectedWorkout
        ? buildWorkoutExerciseInstructions(state, selectedWorkout)
        : new Map<string, string>(),
    [selectedWorkout, state.plans, state.templates],
  );
  const selectedWorkoutExerciseOrder = useMemo(
    () => {
      if (!selectedWorkout) {
        return new Map<string, number>();
      }

      const plannedOrder = buildScheduledWorkoutExerciseOrder(state, selectedWorkout);
      const sessionHasOnlyPlannedExercises =
        plannedOrder.size > 0 &&
        (!selectedSession?.setLogs.length ||
          selectedSession.setLogs.every((log) => plannedOrder.has(log.templateExerciseId)));
      if (sessionHasOnlyPlannedExercises) {
        return plannedOrder;
      }

      const sessionOrder = new Map<string, number>();
      selectedSession?.setLogs.forEach((log) => {
        if (!sessionOrder.has(log.templateExerciseId)) {
          sessionOrder.set(log.templateExerciseId, sessionOrder.size);
        }
      });
      return sessionOrder;
    },
    [selectedSession, selectedWorkout, state],
  );
  const selectedProgramWorkout = useMemo(
    () =>
      selectedWorkout
        ? resolveScheduledProgramWorkout(state, selectedWorkout)
        : undefined,
    [selectedWorkout, state.plans],
  );
  const workoutInsights = useMemo(() => buildWorkoutInsights(state), [state]);
  const selectedWorkoutStatus = selectedWorkout ? resolveWorkoutStatus(selectedWorkout) : undefined;
  const selectedWorkoutInsight = selectedWorkout ? workoutInsights.get(selectedWorkout.id) : undefined;
  const bodyMeasurements = useMemo(
    () => (currentUser ? getMeasurementsForUser(state, currentUser.id) : []),
    [currentUser, state],
  );
  const latestBodyMeasurement = bodyMeasurements[0];
  const latestWaistMeasurement = bodyMeasurements.find((entry) => entry.waistCm !== undefined);
  const latestWaistCm = latestWaistMeasurement?.waistCm;

  useEffect(() => {
    if (!pendingStartWorkoutId) {
      return;
    }

    const pendingWorkout = workouts.find((item) => item.id === pendingStartWorkoutId);
    const pendingSession = sessionByWorkoutId.get(pendingStartWorkoutId);
    if (!pendingWorkout || !pendingSession) {
      return;
    }

    if (pendingWorkout.id.startsWith("workout_") || pendingSession.id.startsWith("session_")) {
      return;
    }

    setPendingStartWorkoutId(null);
  }, [pendingStartWorkoutId, sessionByWorkoutId, workouts]);
  useEffect(() => {
    if (pendingWorkoutTransition?.type !== "start" || athleteLogMode !== "workout") {
      return;
    }

    const optimisticStartedWorkout = workouts.find(
      (item) =>
        item.programWorkoutId === pendingWorkoutTransition.workoutId &&
        resolveWorkoutStatus(item) === "in_progress",
    );
    if (!optimisticStartedWorkout) {
      return;
    }

    if (selectedWorkoutId !== optimisticStartedWorkout.id) {
      setSelectedWorkoutId(optimisticStartedWorkout.id);
    }
    if (pendingStartWorkoutId !== optimisticStartedWorkout.id) {
      setPendingStartWorkoutId(optimisticStartedWorkout.id);
    }
  }, [athleteLogMode, pendingStartWorkoutId, pendingWorkoutTransition, selectedWorkoutId, workouts]);
  const parseMeasurementField = (value: string) => {
    if (!value.trim()) {
      return undefined;
    }

    const nextValue = Number(value.replace(",", "."));
    return Number.isFinite(nextValue) ? nextValue : undefined;
  };
  const nextWeightKg = parseMeasurementField(measurementDraft.weightKg);
  const nextWaistCm = parseMeasurementField(measurementDraft.waistCm);
  const canTrackOwnMeasurements = canTrackOwnTraining(currentUser?.role);
  const isMeasurementDirty =
    canTrackOwnMeasurements &&
    (currentUser.weightKg !== nextWeightKg ||
      latestWaistCm !== nextWaistCm);
  const measurementDisclosureButtonId = "overview-measurements-disclosure";
  const measurementDisclosurePanelId = "overview-measurements-panel";
  const weightTrendPoints = useMemo(
    () =>
      currentUser
        ? bodyMeasurements
            .filter((entry) => entry.weightKg !== undefined)
            .slice(0, 12)
            .reverse()
            .map((entry) => ({
              date: entry.measuredAt,
              value: entry.weightKg as number,
            }))
        : [],
    [bodyMeasurements, currentUser],
  );
  const waistTrendPoints = useMemo(
    () =>
      currentUser
        ? bodyMeasurements
            .filter((entry) => entry.waistCm !== undefined)
            .slice(0, 12)
            .reverse()
            .map((entry) => ({
              date: entry.measuredAt,
              value: entry.waistCm as number,
            }))
        : [],
    [bodyMeasurements, currentUser],
  );
  const volumeTrendPoints = useMemo(
    () =>
      [...workouts]
        .filter((workout) => workout.status === "completed")
        .map((workout) => ({
          date: workout.completedAt ?? sessionByWorkoutId.get(workout.id)?.completedAt ?? getWorkoutOrderMetadata(workout).primaryTimestamp,
          value: workoutInsights.get(workout.id)?.liftedKg ?? 0,
        }))
        .sort((left, right) => left.date.localeCompare(right.date))
        .slice(-12),
    [getWorkoutOrderMetadata, sessionByWorkoutId, workoutInsights, workouts],
  );
  const openWorkoutView = (
    scheduledWorkoutId: string,
    options?: { correctionMode?: boolean; returnTab?: AthleteLogTab },
  ) => {
    setDismissedActiveWorkoutId(null);
    setHistoryFocusWorkoutId(null);
    setSelectedWorkoutId(scheduledWorkoutId);
    setCorrectionModeWorkoutId(options?.correctionMode ? scheduledWorkoutId : null);
    setOpenHistoryMenuWorkoutId(null);
    setHistoryMenuAnchorRect(null);
    setHistoryMenuStyle(null);
    setAthleteLogReturnTab(options?.returnTab ?? "training");
    setAthleteLogMode("workout");
  };
  const toggleHistoryGroup = (groupKey: string, nextExpanded: boolean) => {
    setExpandedHistoryGroups((current) => ({
      ...current,
      [groupKey]: nextExpanded,
    }));
    setHistoryFocusWorkoutId(null);
  };
  const startWorkoutFromProgram = async (programId: string, workoutId: string, workoutName: string, sourceKey: string) => {
    setPendingWorkoutTransition({ type: "start", workoutId, workoutName, sourceKey });
    setDismissedActiveWorkoutId(null);
    setHistoryFocusWorkoutId(null);
    setSelectedWorkoutId(null);
    setCorrectionModeWorkoutId(null);
    setOpenHistoryMenuWorkoutId(null);
    setHistoryMenuAnchorRect(null);
    setHistoryMenuStyle(null);
    setAthleteLogReturnTab("training");
    setAthleteLogMode("workout");
    onOpenWorkoutLog?.();

    const result = await startProgramWorkout(programId, workoutId);
    if (result.ok) {
      if (result.scheduledWorkoutId) {
        setSelectedWorkoutId(result.scheduledWorkoutId);
      }
      setWorkoutMessage(`Treeni "${workoutName}" käynnistyi.`);
      notify({ tone: "success", message: `Treeni "${workoutName}" käynnistyi.` });
      if (result.autoCancelledWorkoutTitle) {
        notify({
          tone: "info",
          message: `Aiempi kesken jäänyt treeni "${result.autoCancelledWorkoutTitle}" keskeytettiin automaattisesti (6 h).`,
        });
      }
      setPendingWorkoutTransition(null);
      return;
    }

    setPendingWorkoutTransition(null);
    setAthleteLogMode("overview");
    setSelectedWorkoutId(null);
    setWorkoutMessage(result.message);
    notify({ tone: "danger", message: result.message });
  };
  const openOrResumeWorkout = async (
    scheduledWorkoutId: string,
    sourceKey: string,
    options?: { returnTab?: AthleteLogTab },
  ) => {
    const workout = workouts.find((item) => item.id === scheduledWorkoutId);
    if (!workout) {
      setWorkoutMessage("Kesken olevaa treeniä ei löytynyt. Päivitä näkymä ja yritä uudelleen.");
      notify({ tone: "danger", message: "Kesken olevaa treeniä ei löytynyt. Päivitä näkymä ja yritä uudelleen." });
      return;
    }

    const workoutName = normalizeWorkoutHistoryTitle(workout.title);
    setPendingWorkoutTransition({ type: "open", scheduledWorkoutId, workoutName, sourceKey });

    try {
      if (resolveWorkoutStatus(workout) === "cancelled") {
        const result = await withMinimumDelay(startWorkout(scheduledWorkoutId));
        if (!result.ok) {
          if (result.message === "Treeniä ei löytynyt.") {
            setDismissedActiveWorkoutId(scheduledWorkoutId);
            setAthleteLogMode("overview");
            setSelectedWorkoutId(null);
            setWorkoutMessage("Kesken oleva treeni poistui näkymästä. Voit aloittaa uuden treenin.");
            notify({ tone: "info", message: "Kesken oleva treeni poistui näkymästä. Voit aloittaa uuden treenin." });
            return;
          }
          setWorkoutMessage(result.message);
          notify({ tone: "danger", message: result.message });
          return;
        }

        setWorkoutMessage("Treeniä jatketaan.");
        notify({ tone: "info", message: `Treeni "${workoutName}" avattiin uudelleen.` });
      } else {
        await withMinimumDelay(Promise.resolve());
      }

      openWorkoutView(scheduledWorkoutId, { returnTab: options?.returnTab });
      onOpenWorkoutLog?.();
    } finally {
      setPendingWorkoutTransition((current) =>
        current?.type === "open" && current.scheduledWorkoutId === scheduledWorkoutId ? null : current,
      );
    }
  };
  const isTransitionLoading = (sourceKey: string) =>
    pendingWorkoutTransition !== null && "sourceKey" in pendingWorkoutTransition && pendingWorkoutTransition.sourceKey === sourceKey;
  const selectionTransitionMessage =
    pendingWorkoutTransition?.type === "open" || pendingWorkoutTransition?.type === "start"
      ? `Avataan treeniä "${pendingWorkoutTransition.workoutName}"...`
      : null;
  const activeScheduledByProgramWorkoutKey = useMemo(() => {
    const activeById = new Map<string, (typeof workouts)[number]>();
    const getWorkoutPriority = (workout: (typeof workouts)[number]): WorkoutSelectionPriority => {
      const hasSession = scheduledWithSessionIds.has(workout.id);
      const workoutStatus = resolveWorkoutStatus(workout);
      if (workoutStatus === "in_progress") {
        return 3;
      }
      if (workoutStatus === "cancelled" && hasSession) {
        return 2;
      }
      return 0;
    };

    workouts
      .filter(
        (workout) =>
          workout.programWorkoutId &&
          workout.trainingPlanId &&
          resolveWorkoutStatus(workout) !== "completed",
      )
      .forEach((workout) => {
        if (!workout.programWorkoutId || !workout.trainingPlanId) {
          return;
        }

        const key = `${workout.trainingPlanId}::${workout.programWorkoutId}`;
        const existing = activeById.get(key);
        const candidatePriority = getWorkoutPriority(workout);
        if (candidatePriority === 0) {
          return;
        }

        if (!existing) {
          activeById.set(key, workout);
          return;
        }

        const existingPriority = getWorkoutPriority(existing);
        if (
          candidatePriority > existingPriority ||
          (candidatePriority === existingPriority && compareWorkoutOrder(workout, existing) < 0)
        ) {
          activeById.set(key, workout);
        }
      });

      return activeById;
  }, [compareWorkoutOrder, scheduledWithSessionIds, workouts]);
  const blockingWorkout = useMemo(() => {
    const resolved = currentUser ? resolveBlockingWorkoutStart(state, currentUser.id) : null;
    return resolved && dismissedActiveWorkoutId === resolved.id ? null : resolved;
  }, [currentUser, dismissedActiveWorkoutId, state]);
  const workoutHistory = useMemo(
    () =>
      workouts
        .filter(
          (workout) =>
            Boolean(workout.programWorkoutId) &&
            (scheduledWithSessionIds.has(workout.id) || workout.status === "completed"),
        )
        .sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate)),
    [scheduledWithSessionIds, workouts],
  );
  const workoutHistoryTitles = useMemo(
    () => buildWorkoutHistoryTitleMap(workoutHistory),
    [workoutHistory],
  );
  const exerciseProgressCatalog = useMemo<ExerciseProgressCatalog>(
    () => (currentUser ? buildExerciseProgressCatalog(state, currentUser.id) : { exercises: [], summaries: new Map() }),
    [currentUser?.id, state],
  );
  const exerciseProgressOptions = exerciseProgressCatalog.exercises;
  useEffect(() => {
    if (exerciseProgressOptions.length === 0) {
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
    const weeklyTargetCount = athletePrograms.reduce(
      (sum, program) => sum + (program.workouts?.length ?? 0),
      0,
    );
    const completedThisWeek = workouts.filter((workout) => {
      if (workout.status !== "completed") {
        return false;
      }

      const completedAt =
        workout.completedAt ??
        sessionByWorkoutId.get(workout.id)?.completedAt ??
        getWorkoutOrderMetadata(workout).primaryTimestamp;
      return isWithinCurrentWeek(completedAt);
    });
    const completionRateRaw = weeklyTargetCount
      ? Math.round((completedThisWeek.length / weeklyTargetCount) * 100)
      : 0;
    const completionRate = Math.min(completionRateRaw, 100);

    const weeklyVolume = completedThisWeek
      .reduce((sum, workout) => sum + (workoutInsights.get(workout.id)?.liftedKg ?? 0), 0);

    const latestCompleted = [...workouts]
      .filter((workout) => workout.status === "completed")
      .sort((a, b) => {
        const leftCompletedAt = a.completedAt ?? getWorkoutOrderMetadata(a).primaryTimestamp;
        const rightCompletedAt = b.completedAt ?? getWorkoutOrderMetadata(b).primaryTimestamp;
        return rightCompletedAt.localeCompare(leftCompletedAt);
      })[0];
    const latestCompletedVolume = latestCompleted
      ? workoutInsights.get(latestCompleted.id)?.liftedKg ?? 0
      : 0;

    return {
      targetCount: weeklyTargetCount,
      completedCount: completedThisWeek.length,
      completionRate,
      weeklyVolume,
      latestCompleted,
      latestCompletedVolume,
    };
  }, [athletePrograms, getWorkoutOrderMetadata, state.sessions, workoutInsights, workouts]);
  const groupedWorkoutHistory = useMemo(() => {
    const planTitleById = new Map(state.plans.map((plan) => [plan.id, plan.title.trim()]));
    const grouped = new Map<
      string,
      {
        key: string;
        title: string;
        programTitle?: string;
        workouts: Array<{
          workout: (typeof workoutHistory)[number];
          occurrenceLabel: string;
          insight: WorkoutInsight;
          noteBody: string | null;
          workoutStatus: string;
          completedAt: string;
          historyDateLabel: string;
          canResumeHistoryWorkout: boolean;
          canDeleteHistoryWorkout: boolean;
          programTitle?: string;
        }>;
      }
    >();

    workoutHistory.forEach((workout) => {
      const historyTitle = workoutHistoryTitles.get(workout.id);
      const insight = workoutInsights.get(workout.id) ?? {
        exerciseCount: 0,
        setCount: 0,
        completedSetCount: 0,
        completionPercent: 0,
        totalLoadKg: 0,
        liftedKg: 0,
        durationSeconds: 0,
        estimatedCalories: 0,
        muscleGroupSetCounts: createEmptyMuscleGroupSetCounts(),
        muscleGroupLiftedKg: createEmptyMuscleGroupLiftedKg(),
      };
      const noteBody = latestNoteByWorkoutId.get(workout.id)?.body ?? null;
      const canDeleteHistoryWorkout = Boolean(workout.programWorkoutId);
      const workoutStatus = resolveWorkoutStatus(workout);
      const completedAt =
        workout.completedAt ??
        sessionByWorkoutId.get(workout.id)?.completedAt ??
        getWorkoutOrderMetadata(workout).primaryTimestamp ??
        workout.scheduledDate;
      const historyDateLabel =
        workoutStatus === "completed"
          ? formatDateWithWeekday(completedAt)
          : formatRelativeDate(workout.scheduledDate);
      const canResumeHistoryWorkout =
        workoutStatus === "cancelled" && scheduledWithSessionIds.has(workout.id);
      const title = historyTitle?.title ?? normalizeWorkoutHistoryTitle(workout.title);
      const programTitle =
        workout.trainingPlanId && workout.programWorkoutId
          ? planTitleById.get(workout.trainingPlanId) || undefined
          : undefined;
      const groupKey = workout.programWorkoutId
        ? `program:${workout.programWorkoutId}`
        : workout.templateId
          ? `template:${workout.templateId}`
          : `title:${title.toLowerCase()}`;
      const current = grouped.get(groupKey);
      const row = {
        workout,
        occurrenceLabel: historyTitle?.occurrenceLabel ?? "Treeni 1",
        insight,
        noteBody,
        workoutStatus,
        completedAt,
        historyDateLabel,
        canResumeHistoryWorkout,
        canDeleteHistoryWorkout,
        programTitle,
      };

      if (current) {
        current.workouts.push(row);
        return;
      }

      grouped.set(groupKey, {
        key: groupKey,
        title,
        programTitle,
        workouts: [row],
      });
    });

    return Array.from(grouped.values())
      .map((group) => ({
        ...group,
        workouts: [...group.workouts].sort(
          (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime(),
        ),
      }))
      .sort(
        (a, b) =>
          new Date(b.workouts[0]?.completedAt ?? 0).getTime() - new Date(a.workouts[0]?.completedAt ?? 0).getTime(),
      );
  }, [
    latestNoteByWorkoutId,
    resolveWorkoutStatus,
    scheduledWithSessionIds,
    sessionByWorkoutId,
    state.plans,
    workoutHistory,
    workoutHistoryTitles,
    getWorkoutOrderMetadata,
    workoutInsights,
  ]);
  const historyActivityByDay = useMemo(() => {
    const activityByDay = new Map<string, Record<string, number>>();

    workoutHistory.forEach((workout) => {
      if (resolveWorkoutStatus(workout) !== "completed") {
        return;
      }

      const completedAt =
        workout.completedAt ??
        sessionByWorkoutId.get(workout.id)?.completedAt ??
        getWorkoutOrderMetadata(workout).primaryTimestamp ??
        workout.scheduledDate;
      const dayKey = toLocalDateKey(completedAt);
      const current = activityByDay.get(dayKey) ?? {};
      activityByDay.set(dayKey, { ...current, strength: (current.strength ?? 0) + 1 });
    });

    (state.extraActivities ?? [])
      .filter((activity) => activity.athleteId === currentUser?.id)
      .forEach((activity) => {
        const dayKey = toLocalDateKey(activity.occurredAt);
        const current = activityByDay.get(dayKey) ?? {};
        activityByDay.set(dayKey, {
          ...current,
          [activity.activityType]: (current[activity.activityType] ?? 0) + 1,
        });
      });

    return activityByDay;
  }, [currentUser?.id, getWorkoutOrderMetadata, resolveWorkoutStatus, sessionByWorkoutId, state.extraActivities, workoutHistory]);
  const historyCalendarCells = useMemo(
    () => buildHistoryCalendarCells(historyCalendarMonth, historyActivityByDay),
    [historyActivityByDay, historyCalendarMonth],
  );
  const historyCalendarMonthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat("fi-FI", {
        month: "long",
        year: "numeric",
      }).format(historyCalendarMonth),
    [historyCalendarMonth],
  );
  const historyCalendarStats = useMemo(() => {
    const monthYear = `${historyCalendarMonth.getFullYear()}-${historyCalendarMonth.getMonth()}`;
    const monthActiveDays = historyCalendarCells
      .filter(
        (cell) =>
          `${cell.date.getFullYear()}-${cell.date.getMonth()}` === monthYear && cell.activityCount > 0,
      )
      .length;

    return {
      monthActiveDays,
    };
  }, [historyCalendarCells, historyCalendarMonth]);
  const overviewWeekCells = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const day = start.getDay();
    const daysSinceMonday = (day + 6) % 7;
    start.setDate(start.getDate() - daysSinceMonday);

    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const key = toLocalDateKey(date);
      const activityByType = historyActivityByDay.get(key) ?? {};
      const activityCount = Object.values(activityByType).reduce((sum, count) => sum + count, 0);
      return { key, date, activityByType, activityCount };
    });
  }, [historyActivityByDay]);
  const todayCalendarKey = useMemo(() => toLocalDateKey(new Date()), []);
  const latestActivityDayKey = useMemo(() => {
    const activeKeys = Array.from(historyActivityByDay.entries())
      .filter(([, value]) => Object.values(value).reduce((sum, count) => sum + count, 0) > 0)
      .map(([key]) => key)
      .sort((a, b) => b.localeCompare(a));

    return activeKeys[0] ?? null;
  }, [historyActivityByDay]);
  const extraActivities = useMemo(
    () =>
      (state.extraActivities ?? [])
        .filter((activity) => activity.athleteId === currentUser?.id)
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
    [currentUser?.id, state.extraActivities],
  );
  const visibleExtraActivities = showAllExtraActivities ? extraActivities : extraActivities.slice(0, 5);
  const calendarDayDetails = useMemo(() => {
    const details = new Map<string, CalendarDayActivityItem[]>();

    workoutHistory.forEach((workout) => {
      if (resolveWorkoutStatus(workout) !== "completed") {
        return;
      }
      const session = sessionByWorkoutId.get(workout.id);
      const completedAt =
        workout.completedAt ??
        session?.completedAt ??
        getWorkoutOrderMetadata(workout).primaryTimestamp ??
        workout.scheduledDate;
      const dayKey = toLocalDateKey(completedAt);
      const insight = workoutInsights.get(workout.id);
      const row: CalendarDayActivityItem = {
        kind: "strength",
        id: `strength-${workout.id}`,
        workoutId: workout.id,
        title: workout.title,
        occurredAt: completedAt,
        durationSeconds: insight?.durationSeconds ?? 0,
        completedSets: insight?.completedSetCount ?? 0,
        totalSets: insight?.setCount ?? 0,
        liftedKg: insight?.liftedKg ?? 0,
      };
      const current = details.get(dayKey) ?? [];
      current.push(row);
      details.set(dayKey, current);
    });

    extraActivities.forEach((activity) => {
      const dayKey = toLocalDateKey(activity.occurredAt);
      const row: CalendarDayActivityItem = {
        kind: "extra",
        id: `extra-${activity.id}`,
        activityId: activity.id,
        activityType: activity.activityType,
        label: extraActivityCatalog[activity.activityType].label,
        occurredAt: activity.occurredAt,
        durationMinutes: activity.durationMinutes,
        estimatedKcal: activity.estimatedKcal,
        notes: activity.notes,
      };
      const current = details.get(dayKey) ?? [];
      current.push(row);
      details.set(dayKey, current);
    });

    details.forEach((items, key) => {
      details.set(
        key,
        [...items].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
      );
    });

    return details;
  }, [
    extraActivities,
    getWorkoutOrderMetadata,
    resolveWorkoutStatus,
    sessionByWorkoutId,
    workoutHistory,
    workoutInsights,
  ]);
  const extraActivityDurationValue = Number(extraActivityDurationMinutes);
  const extraActivityEstimatedKcalPreview = Number.isFinite(extraActivityDurationValue) && extraActivityDurationValue > 0
    ? estimateExtraActivityKcal({
        activityType: extraActivityType,
        durationMinutes: extraActivityDurationValue,
        weightKg: currentUser?.weightKg,
      })
    : 0;
  const selectedCalendarExtraActivity = useMemo(
    () => (state.extraActivities ?? []).find((activity) => activity.id === selectedCalendarExtraActivityId) ?? null,
    [selectedCalendarExtraActivityId, state.extraActivities],
  );
  const selectedCalendarWorkoutDetails = useMemo(() => {
    if (!selectedCalendarWorkoutId) {
      return null;
    }

    const workout = workouts.find((item) => item.id === selectedCalendarWorkoutId);
    if (!workout) {
      return null;
    }

    const session = sessionByWorkoutId.get(workout.id);
    const setLogs = session?.setLogs ?? [];
    const grouped = new Map<
      string,
      {
        exerciseName: string;
        completedSets: number;
        totalSets: number;
        bestLoad?: number;
        bestReps?: number;
      }
    >();
    setLogs.forEach((log) => {
      const key = log.templateExerciseId;
      const current = grouped.get(key) ?? {
        exerciseName: log.exerciseName,
        completedSets: 0,
        totalSets: 0,
      };
      current.totalSets += 1;
      if (log.done) {
        current.completedSets += 1;
        const load = log.actualLoad ?? log.targetLoad;
        const reps = log.actualReps ?? log.targetReps;
        if (
          load !== undefined &&
          reps !== undefined &&
          (current.bestLoad === undefined || load > current.bestLoad || (load === current.bestLoad && reps > (current.bestReps ?? 0)))
        ) {
          current.bestLoad = load;
          current.bestReps = reps;
        }
      }
      grouped.set(key, current);
    });

    return {
      title: workout.title,
      occurredAt:
        workout.completedAt ??
        session?.completedAt ??
        getWorkoutOrderMetadata(workout).primaryTimestamp ??
        workout.scheduledDate,
      note: latestNoteByWorkoutId.get(workout.id)?.body ?? null,
      rows: Array.from(grouped.entries()).map(([key, value]) => ({ key, ...value })),
    };
  }, [getWorkoutOrderMetadata, latestNoteByWorkoutId, selectedCalendarWorkoutId, sessionByWorkoutId, workouts]);
  const historyGroupByWorkoutId = useMemo(() => {
    const groupByWorkoutId = new Map<string, string>();

    groupedWorkoutHistory.forEach((group) => {
      group.workouts.forEach((item) => {
        groupByWorkoutId.set(item.workout.id, group.key);
      });
    });

    return groupByWorkoutId;
  }, [groupedWorkoutHistory]);
  useEffect(() => {
    if (view !== "athlete-log" || athleteLogMode !== "overview" || athleteLogTab !== "history" || !historyFocusWorkoutId) {
      return;
    }

    const scrollTimer = window.setTimeout(() => {
      historySectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);

    return () => window.clearTimeout(scrollTimer);
  }, [athleteLogMode, athleteLogTab, historyFocusWorkoutId, view]);

  useEffect(() => {
    if (!historyFocusWorkoutId) {
      return;
    }

    const focusedGroupKey = historyGroupByWorkoutId.get(historyFocusWorkoutId);
    if (focusedGroupKey) {
      setExpandedHistoryGroups((current) => {
        if (current[focusedGroupKey] !== undefined) {
          return current;
        }

        return {
          ...current,
          [focusedGroupKey]: true,
        };
      });
    }

    const resetTimer = window.setTimeout(() => {
      setHistoryFocusWorkoutId(null);
    }, 5000);

    return () => window.clearTimeout(resetTimer);
  }, [historyFocusWorkoutId, historyGroupByWorkoutId]);

  useEffect(() => {
    if (!openHistoryMenuWorkoutId) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-history-menu-root='true']")) {
        return;
      }

      setOpenHistoryMenuWorkoutId(null);
      setHistoryMenuAnchorRect(null);
      setHistoryMenuStyle(null);
    };

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [openHistoryMenuWorkoutId]);

  useLayoutEffect(() => {
    if (!openHistoryMenuWorkoutId || !historyMenuAnchorRect || !historyMenuRef.current) {
      return;
    }

    setHistoryMenuStyle(getFloatingMenuStyle(historyMenuAnchorRect, historyMenuRef.current));
  }, [historyMenuAnchorRect, openHistoryMenuWorkoutId]);

  useEffect(() => {
    if (!openHistoryMenuWorkoutId) {
      return;
    }

    const syncHistoryMenuPosition = () => {
      const trigger = document.querySelector<HTMLElement>(
        `[data-history-menu-trigger-id="${openHistoryMenuWorkoutId}"]`,
      );
      if (!trigger) {
        setOpenHistoryMenuWorkoutId(null);
        setHistoryMenuAnchorRect(null);
        setHistoryMenuStyle(null);
        return;
      }

      setHistoryMenuAnchorRect(toAnchorRect(trigger.getBoundingClientRect()));
    };

    window.addEventListener("resize", syncHistoryMenuPosition);
    window.addEventListener("scroll", syncHistoryMenuPosition, true);
    return () => {
      window.removeEventListener("resize", syncHistoryMenuPosition);
      window.removeEventListener("scroll", syncHistoryMenuPosition, true);
    };
  }, [openHistoryMenuWorkoutId]);

  return (
    <div className="grid min-w-0 max-w-full gap-6 overflow-x-clip [contain:inline-size]">
      {isDebugEnabled && currentUser ? (
        <Card className="border-[var(--danger)] bg-[var(--surface)]">
          <p className="text-xs font-semibold tracking-[0.04em] text-[var(--danger)]">Debug</p>
          <div className="mt-3 grid gap-2 text-xs text-[var(--text-muted)]">
            <p>authenticatedUser.id: {authenticatedUser?.id ?? "-"}</p>
            <p>currentUser.id: {currentUser.id}</p>
            <p>currentUser.email: {currentUser.email}</p>
            <p>athletePrograms.length: {athletePrograms.length}</p>
            <p>athleteProgramsByEmail.length: {athleteProgramsByEmail.length}</p>
            <p>
              athleteProgramIds:{" "}
              {athletePrograms.length ? athletePrograms.map((plan) => plan.id).join(", ") : "-"}
            </p>
            <p>
              athleteProgramIdsByEmail:{" "}
              {athleteProgramsByEmail.length
                ? athleteProgramsByEmail.map((plan) => `${plan.id}:${plan.athleteId}:${plan.status}`).join(", ")
                : "-"}
            </p>
          </div>
        </Card>
      ) : null}

      {view === "overview" && (
        <Card className="max-w-full overflow-x-clip border-[var(--border-strong)] [contain:inline-size]">
          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Yhteenveto</p>
              <CardTitle className="mt-1.5 text-xl sm:text-2xl">Tämä viikko</CardTitle>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-2.5 sm:p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-[var(--text)]">Viikkonäkymä</p>
                <p className="text-xs text-[var(--text-subtle)]">Ma–Su</p>
              </div>
              <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[10px] text-[var(--text-subtle)] sm:text-[11px]">
                {["Ma", "Ti", "Ke", "To", "Pe", "La", "Su"].map((label) => (
                  <p key={`overview-week-${label}`}>{label}</p>
                ))}
              </div>
              <div className="mt-1 grid grid-cols-7 gap-1.5">
                {overviewWeekCells.map((cell) => {
                  const iconKeys = Object.keys(cell.activityByType).filter((key) => (cell.activityByType[key] ?? 0) > 0);
                  const firstIcon = iconKeys[0];
                  const extraTypeCount = Math.max(0, iconKeys.length - 1);
                  const hasActivity = cell.activityCount > 0;
                  const isToday = cell.key === todayCalendarKey;

                  return (
                    <button
                      type="button"
                      key={`overview-week-cell-${cell.key}`}
                      className={cn(
                        "relative z-0 aspect-square w-full max-w-11 min-h-0 min-w-0 justify-self-center appearance-none overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface)] p-0",
                        isToday ? "border-[var(--accent)] bg-[var(--accent)]" : null,
                        hasActivity ? "cursor-pointer hover:border-[var(--accent)]" : "cursor-pointer hover:border-[var(--border-strong)]",
                      )}
                      aria-label={`${formatCalendarDate(cell.date)} avaa historian kalenteri`}
                      onClick={() => {
                        setSelectedCalendarDayKey(hasActivity ? cell.key : latestActivityDayKey ?? null);
                        setAthleteLogMode("overview");
                        setAthleteLogTab("history");
                        setAthleteLogReturnTab("history");
                        onOpenWorkoutLog?.();
                      }}
                    >
                      {hasActivity ? (
                        <div className="flex h-full w-full items-center justify-center">
                          <div
                            className={cn(
                              "flex h-full w-full items-center justify-center rounded-[50%]",
                              isToday
                                ? "bg-[var(--accent)] text-[var(--accent-contrast)]"
                                : "bg-[color:color-mix(in_srgb,var(--accent)_12%,var(--surface))] text-[var(--accent)]",
                            )}
                          >
                            <span className="grid size-8 place-items-center">
                              {firstIcon ? renderCalendarActivityIcon(firstIcon) : null}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <span className={cn("text-xs", isToday ? "text-[var(--accent-contrast)]" : "text-[var(--text-subtle)]")}>
                            {cell.date.getDate()}
                          </span>
                        </div>
                      )}
                      {extraTypeCount > 0 ? (
                        <span className="absolute -bottom-1 -right-1 grid min-h-4 min-w-4 place-items-center rounded-full border border-[color-mix(in_srgb,var(--accent)_35%,var(--border))] bg-[var(--surface)] px-1 text-[9px] font-semibold leading-4 text-[var(--accent)]">
                          +{extraTypeCount}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid min-w-0 gap-2.5 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="min-w-0 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
                <div className="grid min-w-0 gap-3 md:grid-cols-[auto_1fr] md:items-center">
                  <ProgressRing label="Viikon eteneminen" percent={weeklyInsights.completionRate} showLabel={false} />
                  <div className="min-w-0 space-y-3">
                    <div className="text-center">
                      <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Viikon eteneminen</p>
                      <p className="mt-1.5 text-xl font-semibold text-[var(--text)] sm:text-2xl">
                        {weeklyInsights.completedCount}{" "}
                        {weeklyInsights.completedCount === 1 ? "treeni" : "treeniä"} valmiina
                      </p>
                      <p className="mt-1 text-sm text-[var(--text-muted)]">
                        {weeklyInsights.targetCount > 0
                          ? `Tavoite tällä viikolla: ${weeklyInsights.targetCount} ${weeklyInsights.targetCount === 1 ? "treeni" : "treeniä"}`
                          : "Viikkotavoitetta ei ole vielä määritetty."}
                      </p>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
                        <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Volyymi tällä viikolla</p>
                        <p className="mt-1 text-base font-semibold text-[var(--text)]">
                          {formatLiftedKgValue(weeklyInsights.weeklyVolume)}
                        </p>
                      </div>
                      <div className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
                        <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Viimeisin valmis treeni</p>
                        <p className="mt-1 break-words text-base font-semibold text-[var(--text)]">
                          {weeklyInsights.latestCompleted
                            ? normalizeWorkoutHistoryTitle(weeklyInsights.latestCompleted.title)
                            : "Ei vielä valmiita treenejä"}
                        </p>
                        <p className="mt-1 text-xs text-[var(--text-muted)]">
                          {weeklyInsights.latestCompleted
                            ? formatDateWithWeekday(weeklyInsights.latestCompleted.completedAt ?? getWorkoutOrderMetadata(weeklyInsights.latestCompleted).primaryTimestamp)
                            : "Kun saat treenin valmiiksi, se näkyy tässä."}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="min-w-0 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
                <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">
                  {highlightedWorkoutState === "active"
                    ? "Aktiivinen treeni"
                    : highlightedWorkoutState === "resumable"
                      ? "Keskeytetty treeni"
                      : "Seuraava askel"}
                </p>
                <p className="mt-2 break-words text-lg font-semibold text-[var(--text)]">
                  {highlightedWorkout
                    ? normalizeWorkoutHistoryTitle(highlightedWorkout.title)
                    : athletePrograms.length
                      ? "Avaa treenit"
                      : "Ei treenejä vielä"}
                </p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  {highlightedWorkoutState === "active"
                    ? "Palaa suoraan käynnissä olevaan treeniin."
                    : highlightedWorkoutState === "resumable"
                      ? "Keskeytetty treeni odottaa jatkamista."
                      : athletePrograms.length
                        ? "Valitse seuraava treeni treenilistasta."
                        : "Pyydä valmentajaa rakentamaan ensimmäinen ohjelma."}
                </p>
                <div className="mt-3">
                  {highlightedWorkout ? (
                    <Button
                      type="button"
                      variant="primary"
                      className="w-full"
                      loading={isTransitionLoading("overview-highlight")}
                      loadingText="Avataan treeniä..."
                      onClick={() => {
                        void openOrResumeWorkout(highlightedWorkout.id, "overview-highlight");
                      }}
                    >
                      {highlightedWorkoutState === "active" ? "Siirry treeniin" : "Jatka treeniä"}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="primary"
                      className="w-full"
                      disabled={!athletePrograms.length}
                      onClick={() => {
                        setAthleteLogMode("overview");
                        setAthleteLogTab("training");
                        onOpenWorkoutLog?.();
                      }}
                    >
                      Avaa treenit
                    </Button>
                  )}
                </div>
                {weeklyInsights.latestCompleted ? (
                  <p className="mt-2 text-xs text-[var(--text-subtle)]">
                    Viimeisin valmis: {formatLiftedKgValue(weeklyInsights.latestCompletedVolume)}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </Card>
      )}

      {view === "overview" && canTrackOwnMeasurements ? (
        <div
          ref={measurementsSectionRef}
          id="overview-measurements"
        >
          <Card className="scroll-mt-24 border-[var(--border-strong)]">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Kehon seuranta</p>
                <CardTitle className="mt-1.5 text-xl sm:text-2xl">Omat mitat ja kehitys</CardTitle>
                <CardDescription className="mt-1.5 max-w-3xl">
                  Näet viimeisimmät mittasi ja niiden kehityksen.
                </CardDescription>
            </div>
            <div className="grid w-full gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-dashed border-[var(--border)] bg-[color-mix(in_srgb,var(--surface-2)_74%,var(--surface))] px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Pituus</p>
                  <Badge className="border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[9px] text-[var(--text-subtle)]">
                    Profiili
                  </Badge>
                </div>
                <p className="mt-1 text-base font-semibold text-[var(--text)]">
                  {currentUser.heightCm !== undefined ? `${currentUser.heightCm} cm` : "Ei asetettu"}
                </p>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-2">
                <p className="text-[11px] font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Paino</p>
                <p className="mt-1 text-base font-semibold text-[var(--text)]">
                  {currentUser.weightKg !== undefined ? `${currentUser.weightKg} kg` : "Ei asetettu"}
                </p>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-2">
                <p className="text-[11px] font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Vyötärö</p>
                <p className="mt-1 text-base font-semibold text-[var(--text)]">
                  {latestWaistCm !== undefined ? `${latestWaistCm} cm` : "Ei asetettu"}
                </p>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-2">
                <p className="text-[11px] font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Viimeisin mittaus</p>
                <p className="mt-1 text-base font-semibold text-[var(--text)]">
                  {latestBodyMeasurement ? formatDate(latestBodyMeasurement.measuredAt) : "Ei vielä"}
                </p>
              </div>
            </div>
          </div>
          <div className="mt-4 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-2)]">
            <div className="flex items-start gap-2 p-3">
              <button
                type="button"
                id={measurementDisclosureButtonId}
                aria-expanded={isMeasurementFormExpanded}
                aria-controls={measurementDisclosurePanelId}
                className="group min-w-0 flex-1 rounded-xl py-0 text-left text-inherit transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
                onClick={() => setIsMeasurementFormExpanded((current) => !current)}
              >
                <span className="block text-sm font-semibold text-[var(--text)]">Kirjaa uusi mittaus</span>
                  <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
                  Päivitä paino tai vyötärö. Voit täyttää vain muuttuneet kentät.
                </span>
              </button>
              <button
                type="button"
                className="grid size-8 shrink-0 place-items-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text-subtle)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-3)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
                aria-label={isMeasurementFormExpanded ? "Sulje uusi mittaus" : "Avaa uusi mittaus"}
                aria-expanded={isMeasurementFormExpanded}
                aria-controls={measurementDisclosurePanelId}
                onClick={() => setIsMeasurementFormExpanded((current) => !current)}
              >
                {isMeasurementFormExpanded ? (
                  <ChevronUp className="size-4" aria-hidden="true" />
                ) : (
                  <ChevronDown className="size-4" aria-hidden="true" />
                )}
              </button>
            </div>
            {isMeasurementFormExpanded ? (
              <div
                id={measurementDisclosurePanelId}
                role="region"
                aria-labelledby={measurementDisclosureButtonId}
                className="border-t border-[var(--border)] px-3 pb-3 pt-3"
              >
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label htmlFor="overview-weight-kg">Paino (kg, valinnainen)</Label>
                    <Input
                      id="overview-weight-kg"
                      type="number"
                      inputMode="decimal"
                      min={20}
                      max={350}
                      step="0.1"
                      placeholder="Esim. 72.4"
                      value={measurementDraft.weightKg}
                      onChange={(event) => {
                        setMeasurementDraft((previous) => ({ ...previous, weightKg: event.target.value }));
                        setMeasurementMessage("");
                        setMeasurementMessageTone("info");
                      }}
                    />
                  </div>
                  <div>
                    <Label htmlFor="overview-waist-cm">Vyötärö (cm, valinnainen)</Label>
                    <Input
                      id="overview-waist-cm"
                      type="number"
                      inputMode="decimal"
                      min={30}
                      max={250}
                      step="0.5"
                      placeholder="Esim. 81"
                      value={measurementDraft.waistCm}
                      onChange={(event) => {
                        setMeasurementDraft((previous) => ({ ...previous, waistCm: event.target.value }));
                        setMeasurementMessage("");
                        setMeasurementMessageTone("info");
                      }}
                    />
                  </div>
                </div>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p
                    aria-live="polite"
                    className={`min-h-5 text-sm ${
                      !measurementMessage
                        ? "text-[var(--text-subtle)]"
                        : measurementMessageTone === "success"
                          ? "text-[var(--success)]"
                          : measurementMessageTone === "error"
                            ? "text-[var(--danger)]"
                            : "text-[var(--text-subtle)]"
                    }`}
                  >
                    {measurementMessage ||
                      (isMeasurementDirty
                        ? "Tallennus päivittää mittauksen ja trendin."
                        : "Täytä paino tai vyötärö tallentaaksesi uuden mittauksen.")}
                  </p>
                  <Button
                    type="button"
                    variant={isMeasurementDirty ? "primary" : "secondary"}
                    disabled={!isMeasurementDirty}
                    loading={isSavingMeasurements}
                    loadingText="Tallennetaan mittatietoja..."
                    className="w-full sm:w-auto"
                    onClick={async () => {
                      const parsed = bodyMeasurementSchema.safeParse({
                        heightCm: "",
                        weightKg: measurementDraft.weightKg,
                        waistCm: measurementDraft.waistCm,
                      });
                      if (!parsed.success) {
                        setMeasurementMessage(parsed.error.issues[0]?.message ?? "Tarkista mittatiedot ja yritä uudelleen.");
                        setMeasurementMessageTone("error");
                        return;
                      }

                      setIsSavingMeasurements(true);
                      try {
                        const measurementInput: { heightCm?: number; weightKg?: number; waistCm?: number } = {};
                        if (parsed.data.heightCm !== undefined) {
                          measurementInput.heightCm = parsed.data.heightCm;
                        }
                        if (parsed.data.weightKg !== undefined) {
                          measurementInput.weightKg = parsed.data.weightKg;
                        }
                        if (parsed.data.waistCm !== undefined) {
                          measurementInput.waistCm = parsed.data.waistCm;
                        }

                        const result = await withMinimumDelay(updateCurrentUserMeasurements(measurementInput));
                        setMeasurementMessage(result.ok ? "Mittatiedot tallennettu." : result.message);
                        setMeasurementMessageTone(result.ok ? "success" : "error");
                      } finally {
                        setIsSavingMeasurements(false);
                      }
                    }}
                  >
                    Tallenna mittatiedot
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
          <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-[var(--text)]">Kehitystrendi</p>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">Valitse paino, vyötärö tai volyymi.</p>
              </div>
              <div className="grid w-full grid-cols-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 sm:w-auto">
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
                <button
                  type="button"
                  className={`w-full rounded-lg px-3 py-2 text-sm font-medium transition ${
                    activeMeasurementTrend === "volume"
                      ? "bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))] text-[var(--accent)]"
                      : "text-[var(--text-muted)]"
                  }`}
                  aria-pressed={activeMeasurementTrend === "volume"}
                  onClick={() => setActiveMeasurementTrend("volume")}
                >
                  Volyymi
                </button>
              </div>
            </div>
            <div className="mt-3">
              {activeMeasurementTrend === "weight" ? (
                <>
                  <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Painotrendi</p>
                  <MetricTrendChart
                    points={weightTrendPoints}
                    ariaLabel="Painon kehitystrendi"
                    emptyMessage="Lisää paino viimeisimpään mittaukseen, niin kehitystrendi alkaa piirtyä tähän."
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
                    emptyMessage="Lisää vyötärö viimeisimpään mittaukseen, niin kehitystrendi alkaa piirtyä tähän."
                    helperText="Alarivillä näkyy kuukausi ja vuosi, oikealla vyötärön asteikko."
                    compactHelperText="Alarivillä näkyy kuukausi ja vuosi. Tarkka arvo näkyy pisteen kohdalla."
                    valueLabel="Vyötärö"
                    unit="cm"
                  />
                </>
              ) : (
                <>
                  <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Volyymitrendi</p>
                  <MetricTrendChart
                    points={volumeTrendPoints}
                    ariaLabel="Volyymin kehitystrendi"
                    emptyMessage="Kun saat treenejä valmiiksi, volyymitrendi näkyy tässä."
                    helperText="Alarivillä näkyy kuukausi ja vuosi, oikealla volyymin asteikko."
                    compactHelperText="Alarivillä näkyy kuukausi ja vuosi. Tarkka arvo näkyy pisteen kohdalla."
                    valueLabel="Volyymi"
                    unit="kg"
                    decimals={0}
                    useZeroBaseline
                  />
                </>
              )}
            </div>
          </div>
          </Card>
        </div>
      ) : null}

      {view === "nutrition" && currentUser ? (
        <PersonalNutritionSummaryCard state={state} user={currentUser} onOpenSettings={onOpenSettings} />
      ) : null}

      {view === "nutrition" && currentUser ? <NutritionAthleteCard state={state} user={currentUser} /> : null}

      {view === "conversation" && currentUser ? (
        <ConversationPanel
          className="w-full max-w-none"
          heading=""
          description=""
          entries={athleteConversationEntries}
          users={state.users}
          currentRole={currentUser.role}
          currentUserId={currentUser.id}
          emptyMessage="Ei viestejä vielä."
          onSend={(body) =>
            addConversationComment(body, {
              type: "comment",
            })
          }
        />
      ) : null}

      {view === "athlete-log" && (
        athleteLogMode === "workout" ? (
          <Card className="border-[var(--border-strong)] max-md:rounded-none max-md:border-0 max-md:bg-transparent max-md:p-0 max-md:shadow-none">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Treeni</p>
                <CardTitle className="text-2xl">
                  {selectedWorkout ? normalizeWorkoutHistoryTitle(selectedWorkout.title) : "Aktiivinen treeni"}
                </CardTitle>
                {!selectedWorkout ? (
                  <CardDescription className="mt-2">
                    Valitse treeni listalta ja avaa se tähän näkymään.
                  </CardDescription>
                ) : null}
              </div>
              <Button
                type="button"
                variant="ghost"
                className="mt-0.5 size-10 shrink-0 rounded-full p-0"
                aria-label="Takaisin treenilistaan"
                onClick={closeWorkoutView}
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
              </Button>
            </div>
            {selectedWorkout ? (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1.5">
                <p className="text-xs font-medium text-[var(--text-muted)]">Pidä näyttö päällä</p>
                <button
                  type="button"
                  role="switch"
                  aria-checked={keepWorkoutScreenOn}
                  disabled={!workoutWakeLockSupported}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition ${
                    keepWorkoutScreenOn
                      ? "border-[var(--accent)] bg-[var(--accent)]"
                      : "border-[var(--border)] bg-[var(--surface-3)]"
                  } ${!workoutWakeLockSupported ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                  onClick={() => {
                    if (!workoutWakeLockSupported) {
                      return;
                    }
                    setWorkoutWakeLockError("");
                    setKeepWorkoutScreenOn((current) => !current);
                  }}
                >
                  <span
                    className={`pointer-events-none inline-block size-5 rounded-full bg-[var(--surface)] shadow-[0_1px_4px_-2px_var(--shadow)] transition-transform ${
                      keepWorkoutScreenOn ? "translate-x-5" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>
            ) : null}
            {selectedWorkout && !workoutWakeLockSupported ? (
              <p className="mt-1 text-xs text-[var(--text-subtle)]">Ei tuettu tällä selaimella/laitteella.</p>
            ) : null}
            {selectedWorkout && workoutWakeLockError ? (
              <p className="mt-1 text-xs text-[var(--danger)]">{workoutWakeLockError}</p>
            ) : null}
            {progress ? (
              <div className="mt-4 rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-2)] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="inline-flex items-center gap-1">
                      <p className="text-sm font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Edistyminen</p>
                      <InfoTooltip text="Näyttää tämän treenin valmiit sarjat suhteessa kaikkiin sarjoihin." />
                    </div>
                    <p className="mt-0.5 font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--text)]">
                      {progress.completedSets}/{progress.totalSets} sarjaa
                    </p>
                  </div>
                  <Badge>{progress.percent}%</Badge>
                </div>
                {selectedWorkout?.status === "completed" ? (
                  <p className="mt-1.5 text-xs text-[var(--text-subtle)]">
                    Nostettu yhteensä {formatLiftedKgValue(selectedWorkoutInsight?.liftedKg ?? 0)} ·{" "}
                    arvioitu kulutus {formatEstimatedCaloriesValue(selectedWorkoutInsight?.estimatedCalories ?? 0)}.
                  </p>
                ) : (
                  <p className="mt-1.5 text-xs text-[var(--text-subtle)]">
                    Tämä treeni tehty aiemmin {selectedWorkoutCompletionCount} kertaa ·{" "}
                    {selectedWorkoutInsight?.exerciseCount ?? 0} liikettä / {selectedWorkoutInsight?.setCount ?? 0} sarjaa.
                  </p>
                )}
                <div className="mt-3 h-2.5 overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface-3)]">
                  <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${progress.percent}%` }} />
                </div>
              </div>
            ) : null}
            {selectedWorkout ? (
              <AthleteSessionPanel
                note={existingNote}
                selectedSession={selectedSession}
                scheduledWorkoutId={selectedWorkout.id}
                scheduledWorkoutTitle={normalizeWorkoutHistoryTitle(selectedWorkout.title)}
                scheduledWorkoutDescription={undefined}
                scheduledWorkoutGuidance={selectedProgramWorkout ? deriveProgramWorkoutGuidance(selectedProgramWorkout) : undefined}
                scheduledDate={selectedWorkout.completedAt ?? selectedSession?.completedAt ?? selectedWorkout.scheduledDate}
                isSessionSyncing={pendingStartWorkoutId === selectedWorkout.id}
                onStart={async () => {
                  setSelectedWorkoutId(selectedWorkout.id);
                  setPendingStartWorkoutId(selectedWorkout.id);
                  const result =
                    selectedWorkoutStatus === "completed" &&
                    selectedWorkout.trainingPlanId &&
                    selectedWorkout.programWorkoutId
                      ? await startProgramWorkout(selectedWorkout.trainingPlanId, selectedWorkout.programWorkoutId)
                      : await startWorkout(selectedWorkout.id);
                  if (!result.ok) {
                    setPendingStartWorkoutId(null);
                    setSelectedWorkoutId(null);
                    setWorkoutMessage(result.message);
                    return;
                  }

                  const nextWorkoutId = result.scheduledWorkoutId ?? selectedWorkout.id;
                  setPendingStartWorkoutId(nextWorkoutId);
                  setSelectedWorkoutId(nextWorkoutId);
                  setWorkoutMessage("Treeni käynnistetty. Sarjaloki luotiin automaattisesti.");
                }}
                onUpdate={(logId, patch) => {
                  startTransition(() => {
                    void updateWorkoutSet(selectedWorkout.id, logId, patch);
                  });
                }}
                onUpdateDuration={async (durationSeconds) => {
                  const result = await updateWorkoutDuration(selectedWorkout.id, durationSeconds);
                  setWorkoutMessage(result.ok ? "Treeniaika päivitetty." : result.message);
                  return result;
                }}
                onUpdateDate={async (scheduledDate: string) => {
                  const result = await updateWorkoutDate(selectedWorkout.id, scheduledDate);
                  setWorkoutMessage(result.ok ? "Treenipäivä päivitetty." : result.message);
                  return result;
                }}
                onSaveNote={(body) => saveWorkoutNote(selectedWorkout.id, body)}
                onExerciseStructureUpdate={async (action) => {
                  const result = await updateWorkoutExerciseStructure(selectedWorkout.id, action);
                  setWorkoutMessage(result.ok ? "Treenin liikerakenne päivitettiin." : result.message);
                  if (result.ok) {
                    notify({ tone: "success", message: "Treenin liikerakenne päivitettiin." });
                  } else {
                    notify({ tone: "danger", message: result.message });
                  }
                  return result;
                }}
                onComplete={async () => {
                  const completedWorkoutId = selectedWorkout.id;
                  const completionPercent = progress?.percent ?? 0;
                  setIsCompletingWorkout(true);
                  setPendingWorkoutTransition({ type: "complete" });
                  console.info("[workout-ui] complete-click", { scheduledWorkoutId: completedWorkoutId });
                  try {
                    const result = await completeWorkout(completedWorkoutId);
                    console.info("[workout-ui] complete-result", {
                      scheduledWorkoutId: completedWorkoutId,
                      ok: result.ok,
                      message: result.ok ? undefined : result.message,
                    });
                    if (result.ok) {
                      setDismissedActiveWorkoutId(null);
                      setWorkoutMessage(
                        completionPercent < 100
                          ? `Treeni merkittiin valmiiksi (${completionPercent}% toteutui). Kirjaa muistiinpanoihin, miksi treeni jäi osittaiseksi.`
                          : "Treeni merkittiin valmiiksi.",
                      );
                      notify({ tone: "success", message: "Treeni merkittiin valmiiksi." });
                      setSelectedWorkoutId(null);
                      setHistoryFocusWorkoutId(completedWorkoutId);
                      setCorrectionModeWorkoutId(null);
                      setAthleteLogTab("history");
                      setAthleteLogReturnTab("history");
                      setAthleteLogMode("overview");
                      window.setTimeout(() => setPendingWorkoutTransition(null), 900);
                      return;
                    }

                    setPendingWorkoutTransition(null);
                    setWorkoutMessage(result.message);
                    notify({ tone: "danger", message: result.message });
                  } finally {
                    setIsCompletingWorkout(false);
                  }
                }}
                onCancel={async () => {
                  const confirmed = window.confirm(
                    "Keskeytetäänkö treeni? Voit jatkaa samaa treeniä myöhemmin.",
                  );
                  if (!confirmed) {
                    return;
                  }

                  const result = await cancelWorkout(selectedWorkout.id);
                  console.info("[workout-ui] cancel-result", {
                    scheduledWorkoutId: selectedWorkout.id,
                    ok: result.ok,
                    message: result.ok ? undefined : result.message,
                  });
                  setWorkoutMessage(
                    result.ok
                      ? "Treeni keskeytettiin. Voit jatkaa treeniä myöhemmin samasta kohdasta."
                      : result.message,
                  );
                  if (result.ok) {
                    setPendingWorkoutTransition({ type: "cancel" });
                    setDismissedActiveWorkoutId(selectedWorkout.id);
                    setSelectedWorkoutId(null);
                    setCorrectionModeWorkoutId(null);
                    setAthleteLogTab("training");
                    setAthleteLogReturnTab("training");
                    setAthleteLogMode("overview");
                    notify({ tone: "info", message: "Treeni keskeytettiin." });
                    window.setTimeout(() => setPendingWorkoutTransition(null), 900);
                  } else {
                    notify({ tone: "danger", message: result.message });
                  }
                }}
                onDelete={async () => {
                  const confirmed = window.confirm(
                    "Poistetaanko treeni kokonaan? Toimintoa ei voi kumota.",
                  );
                  if (!confirmed) {
                    return;
                  }

                  const deletedWorkoutId = selectedWorkout.id;
                  const wasInCorrectionMode = correctionModeWorkoutId === deletedWorkoutId;

                  setPendingWorkoutTransition({ type: "delete" });
                  setSelectedWorkoutId(null);
                  setCorrectionModeWorkoutId(null);
                  setAthleteLogTab(athleteLogReturnTab);
                  setAthleteLogMode("overview");

                  const result = await deleteWorkout(deletedWorkoutId);
                  console.info("[workout-ui] delete-result", {
                    scheduledWorkoutId: deletedWorkoutId,
                    ok: result.ok,
                    message: result.ok ? undefined : result.message,
                  });
                  setWorkoutMessage(result.ok ? "Treeni poistettiin." : result.message);

                  if (result.ok) {
                    setDismissedActiveWorkoutId(null);
                    notify({ tone: "success", message: "Treeni poistettiin." });
                    window.setTimeout(() => setPendingWorkoutTransition(null), 900);
                  } else {
                    setPendingWorkoutTransition(null);
                    setSelectedWorkoutId(deletedWorkoutId);
                    setCorrectionModeWorkoutId(wasInCorrectionMode ? deletedWorkoutId : null);
                    setAthleteLogMode("workout");
                    notify({ tone: "danger", message: result.message });
                  }
                }}
                canDeleteWorkout={Boolean(selectedWorkout.programWorkoutId)}
                status={selectedWorkoutStatus ?? selectedWorkout.status}
                onBackToList={closeWorkoutView}
                initialCorrectionMode={correctionModeWorkoutId === selectedWorkout.id}
                progress={progress}
                previousExerciseResults={previousExerciseResults}
                exerciseInstructions={selectedWorkoutInstructions}
                exerciseOrder={selectedWorkoutExerciseOrder}
                availableExercises={state.exercises}
                loadIncrementKg={currentUser?.settings?.loadIncrementKg ?? 2.5}
                activeWorkoutCount={inProgressCount}
                workoutMessage={workoutMessage}
                isCompleting={isCompletingWorkout}
              />
            ) : (
              <CardDescription className="mt-4">Ei vielä treenejä.</CardDescription>
            )}
          </Card>
        ) : (
          <div className="space-y-4">
            <div
              role="tablist"
              aria-label="Treeninäkymän välilehdet"
              className="grid grid-cols-2 gap-1 rounded-[1.1rem] border border-[color-mix(in_srgb,var(--border)_88%,var(--surface))] bg-[color-mix(in_srgb,var(--surface)_78%,var(--surface-2))] p-1"
            >
              <button
                type="button"
                role="tab"
                id="athlete-log-tab-training"
                aria-selected={athleteLogTab === "training"}
                aria-controls="athlete-log-panel-training"
                className={cn(
                  "inline-flex min-h-10 items-center justify-center rounded-xl px-3 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
                  athleteLogTab === "training"
                    ? "border border-[color-mix(in_srgb,var(--accent)_22%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))] text-[var(--accent)] shadow-[0_8px_18px_-20px_var(--accent)]"
                    : "border border-transparent bg-transparent text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:bg-[var(--surface)] hover:text-[var(--text)]",
                )}
                onClick={() => setAthleteLogTab("training")}
              >
                Treeni
              </button>
              <button
                type="button"
                role="tab"
                id="athlete-log-tab-history"
                aria-selected={athleteLogTab === "history"}
                aria-controls="athlete-log-panel-history"
                className={cn(
                  "inline-flex min-h-10 items-center justify-center rounded-xl px-3 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
                  athleteLogTab === "history"
                    ? "border border-[color-mix(in_srgb,var(--accent)_22%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))] text-[var(--accent)] shadow-[0_8px_18px_-20px_var(--accent)]"
                    : "border border-transparent bg-transparent text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:bg-[var(--surface)] hover:text-[var(--text)]",
                )}
                onClick={() => setAthleteLogTab("history")}
              >
                Historia
              </button>
            </div>

            {athleteLogTab === "training" ? (
            <div role="tabpanel" id="athlete-log-panel-training" aria-labelledby="athlete-log-tab-training">
            <Card>
              <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Ohjelman treenit</p>
              <CardTitle className="text-2xl">Valitse seuraava treeni</CardTitle>
              <CardDescription className="mt-2">
                 Aloita treeni ohjelmastasi. Aiempien toteutusten tiedot löydät historiasta.
              </CardDescription>
              {blockingWorkout && !selectionTransitionMessage ? (
                <div
                  className={`mt-4 rounded-2xl border px-4 py-4 text-sm text-[var(--text)] ${
                    blockingWorkout.status === "cancelled"
                      ? "border-[var(--danger)] bg-[color:color-mix(in_srgb,var(--danger)_10%,var(--surface))] shadow-[0_10px_24px_-22px_var(--danger)]"
                      : "border-[var(--warning)] bg-[color:color-mix(in_srgb,var(--warning)_10%,var(--surface))] shadow-[0_10px_24px_-22px_var(--warning)]"
                  }`}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div className="min-w-0">
                      <p
                        className={`text-xs font-semibold tracking-[0.04em] ${
                          blockingWorkout.status === "cancelled" ? "text-[var(--danger)]" : "text-[var(--warning)]"
                        }`}
                      >
                        {blockingWorkout.status === "cancelled" ? "Keskeytetty treeni" : "Aktiivinen treeni kesken"}
                      </p>
                      <p className="mt-1 max-w-2xl leading-6 text-[var(--text-muted)]">
                        {blockingWorkout.status === "cancelled"
                          ? "Jatka ensin keskeytetty treeni loppuun ennen uuden aloitusta. Sama treeni odottaa alempana valmiina jatkettavaksi."
                          : "Sinulla on jo treeni kesken. Palaa siihen ennen kuin aloitat uuden treenin."}
                      </p>
                      <p className="mt-2 text-base font-semibold text-[var(--text)]">
                        {normalizeWorkoutHistoryTitle(blockingWorkout.title)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3">
                    <Button
                      type="button"
                      variant="primary"
                      className="w-full sm:w-auto"
                      disabled={isTransitionLoading(`blocking-${blockingWorkout.id}`)}
                      onClick={() => {
                        void openOrResumeWorkout(blockingWorkout.id, `blocking-${blockingWorkout.id}`);
                      }}
                    >
                      {blockingWorkout.status === "cancelled" ? "Jatka treeniä" : "Siirry treeniin"}
                    </Button>
                  </div>
                </div>
              ) : null}
              {selectionTransitionMessage ? (
                <p className="mt-4 flex items-center gap-3 rounded-2xl border border-[var(--border-strong)] bg-[color:color-mix(in_srgb,var(--surface-2)_84%,var(--surface))] px-4 py-3 text-sm text-[var(--text)] shadow-[0_12px_28px_-24px_var(--shadow)]">
                  <span
                    aria-hidden="true"
                    className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent text-[var(--accent)]"
                  />
                  <span>{selectionTransitionMessage}</span>
                </p>
              ) : pendingWorkoutTransition ? (
                <p className="mt-4 flex items-center gap-3 rounded-2xl border border-[var(--border-strong)] bg-[color:color-mix(in_srgb,var(--surface-2)_84%,var(--surface))] px-4 py-3 text-sm text-[var(--text)] shadow-[0_12px_28px_-24px_var(--shadow)]">
                  <span
                    aria-hidden="true"
                    className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent text-[var(--accent)]"
                  />
                  <span>
                    {pendingWorkoutTransition.type === "complete"
                        ? "Tallennetaan treeni ja päivitetään näkymä..."
                      : pendingWorkoutTransition.type === "cancel"
                        ? "Palataan treenilistaan ja päivitetään keskeytetty tila..."
                        : "Poistetaan treeniä ja päivitetään näkymä..."}
                  </span>
                </p>
              ) : null}
              {athletePrograms.length ? (
                <div className="mt-5 grid gap-4">
                  {athletePrograms.map((program) => (
                    <div key={program.id} className="border-t border-[var(--border)] pt-4 first:border-t-0 first:pt-0">
                      <p className="text-[11px] font-semibold tracking-[0.08em] text-[var(--text-subtle)]">Aktiivinen ohjelma</p>
                      <p className="mt-1 text-lg font-semibold text-[var(--text)]">{program.title}</p>
                      {program.description ? (
                        <p className="mt-2 max-w-3xl text-sm text-[var(--text-muted)]">{program.description}</p>
                      ) : null}
                      <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                        {(program.workouts ?? []).map((workout) => {
                          const setCount = workout.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
                          const completionCount =
                            currentUser
                              ? countWorkoutCompletions(state, currentUser.id, {
                                  programWorkoutId: workout.id,
                                })
                              : 0;
                          const activeScheduled = activeScheduledByProgramWorkoutKey.get(`${program.id}::${workout.id}`);
                          const activeScheduledStatus =
                            activeScheduled ? resolveWorkoutStatus(activeScheduled) : undefined;
                          const activeScheduledId =
                            activeScheduledStatus === "in_progress" ? activeScheduled?.id : undefined;
                          const resumableScheduledId =
                            activeScheduled &&
                            activeScheduledStatus === "cancelled" &&
                            scheduledWithSessionIds.has(activeScheduled.id)
                              ? activeScheduled.id
                              : undefined;
                          const latestCompletionDate =
                            currentUser
                              ? getLatestWorkoutCompletionDate(state, currentUser.id, {
                                  programWorkoutId: workout.id,
                                })
                              : undefined;
                          const latestCompletionLabel = latestCompletionDate
                            ? formatRelativeDate(latestCompletionDate)
                            : undefined;
                          const showLatestCompletionBadge =
                            latestCompletionLabel !== undefined &&
                            !resumableScheduledId &&
                            !activeScheduledId &&
                            !["Tänään", "Eilen", "Huomenna"].includes(latestCompletionLabel);
                          const isLockedByAnotherWorkout = Boolean(
                            blockingWorkout && blockingWorkout.programWorkoutId !== workout.id,
                          );
                          const workoutSummary =
                            resumableScheduledId
                              ? "Kesken. Voit jatkaa samasta kohdasta."
                              : activeScheduledId
                                ? "Treeni on parhaillaan käynnissä."
                                : isLockedByAnotherWorkout
                                  ? "Jatka kesken oleva treeni ensin."
                                : latestCompletionLabel
                                  ? `Viimeksi ${latestCompletionLabel.toLowerCase()}`
                                  : "Ei vielä toteutuksia.";
                          const workoutGuidance = deriveProgramWorkoutGuidance(workout);

                          return (
                            <div
                              key={workout.id}
                              className="flex h-full w-full flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[0_1px_0_0_var(--shadow-soft),0_10px_24px_-20px_var(--shadow)]"
                            >
                              <div className="flex items-start justify-between gap-3.5">
                                <div className="min-w-0">
                                  <p className="text-base font-semibold text-[var(--text)]">{workout.name}</p>
                                  <p className="mt-1 text-xs text-[var(--text-subtle)]">
                                    {workout.exercises.length} liikettä · {setCount} sarjaa
                                  </p>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                  <button
                                    type="button"
                                    aria-label={`${workout.name} esikatselu`}
                                    title="Esikatselu"
                                    className="inline-flex size-8.5 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--accent)_22%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_7%,var(--surface))] text-[var(--accent)] shadow-[0_4px_12px_-14px_var(--accent)] transition hover:border-[color-mix(in_srgb,var(--accent)_36%,var(--border))] hover:bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))] hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
                                    onClick={() => setOpenWorkoutPreview(workout)}
                                  >
                                    <Info className="size-3.5" aria-hidden="true" />
                                  </button>
                                  <button
                                    type="button"
                                    aria-label={`${workout.name} ohje`}
                                    title="Ohje"
                                    className="inline-flex size-8.5 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--accent)_22%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_7%,var(--surface))] text-[var(--accent)] shadow-[0_4px_12px_-14px_var(--accent)] transition hover:border-[color-mix(in_srgb,var(--accent)_36%,var(--border))] hover:bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))] hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
                                    onClick={() => setOpenWorkoutInstruction({ exerciseName: workout.name, instruction: workoutGuidance })}
                                  >
                                    <BookOpen className="size-3.5" aria-hidden="true" />
                                  </button>
                                </div>
                              </div>
                              <p className="mt-3 text-sm text-[var(--text-muted)]">{workoutSummary}</p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {activeScheduled ? (
                                  <Badge className={statusTone(activeScheduledStatus ?? activeScheduled.status)}>
                                    {workoutStatusLabel(activeScheduledStatus ?? activeScheduled.status)}
                                  </Badge>
                                ) : null}
                                {completionCount > 0 ? (
                                  <Badge className="border-[var(--border)] bg-[var(--surface-2)] text-[11px] text-[var(--text-subtle)] sm:text-xs">
                                    {completionCount} toteutusta
                                  </Badge>
                                ) : (
                                  <Badge className="border-[var(--border)] bg-[var(--surface-2)] text-[11px] text-[var(--text-subtle)] sm:text-xs">
                                    Ensimmäinen kerta
                                  </Badge>
                                )}
                                {showLatestCompletionBadge ? (
                                  <Badge className="border-[var(--border)] bg-[var(--surface-2)] text-[11px] text-[var(--text-subtle)] sm:text-xs">
                                    {latestCompletionLabel}
                                  </Badge>
                                ) : null}
                              </div>
                              <div className="mt-auto flex flex-wrap gap-2 pt-4">
                                {activeScheduledId ? (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    className="w-full justify-center sm:w-auto"
                                    loading={false}
                                    onClick={() => openWorkoutView(activeScheduledId)}
                                  >
                                    Avaa aktiivinen
                                  </Button>
                                ) : (
                                  <Button
                                    type="button"
                                    variant="primary"
                                    className="w-full justify-center sm:w-auto"
                                    disabled={
                                      isLockedByAnotherWorkout ||
                                      isTransitionLoading(`program-${program.id}-workout-${workout.id}`) ||
                                      (!resumableScheduledId && pendingWorkoutTransition?.type === "start")
                                    }
                                    onClick={() => {
                                      if (resumableScheduledId) {
                                        void openOrResumeWorkout(resumableScheduledId, `program-${program.id}-workout-${workout.id}`);
                                        return;
                                      }

                                      void startWorkoutFromProgram(
                                        program.id,
                                        workout.id,
                                        workout.name,
                                        `program-${program.id}-workout-${workout.id}`,
                                      );
                                    }}
                                  >
                                    {resumableScheduledId ? "Jatka treeniä" : "Aloita treeni"}
                                  </Button>
                                )}
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
                  Sinulle ei ole vielä luotu ohjelmia. Pyydä valmentajaa lisäämään ensimmäinen ohjelma.
                </p>
              )}
              <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[0_1px_0_0_var(--shadow-soft),0_10px_24px_-20px_var(--shadow)]">
                <div>
                  <p className="text-base font-semibold text-[var(--text)]">Extra-treeni</p>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    Lisää esimerkiksi juoksu, kävely tai muu harjoitus historiaan.
                  </p>
                  <p className="mt-2 text-xs text-[var(--text-subtle)]">
                    {extraActivities.length > 0
                      ? `${extraActivities.length} extra-treeniä historiassa`
                      : "Ei extra-treenejä vielä"}
                  </p>
                  <div className="mt-3">
                    <Button
                      type="button"
                      className="w-full sm:w-auto"
                      onClick={() => {
                        setEditingExtraActivityId(null);
                        setIsExtraActivityDialogOpen(true);
                      }}
                    >
                      Lisää extra-treeni
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
            </div>
            ) : null}

            {athleteLogTab === "history" ? (
            <div ref={historySectionRef} role="tabpanel" id="athlete-log-panel-history" aria-labelledby="athlete-log-tab-history">
              <Card>
                <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Treenihistoria</p>
                <CardTitle className="text-2xl">Historia</CardTitle>
                <CardDescription className="mt-2">
                  Valitse päivä nähdäksesi tehdyt treenit.
                </CardDescription>
                <div className="mt-5 max-w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-3 sm:p-4">
                  <p className="text-sm font-semibold text-[var(--text)]">Treenikalenteri</p>
                  <div className="mt-2 flex items-center gap-1.5 text-[11px]">
                    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[var(--text-subtle)]">
                      <span>Viikko</span>
                      <span className="font-semibold text-[var(--text)]">
                        {weeklyInsights.completedCount}/{weeklyInsights.targetCount || 0}
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[var(--text-subtle)]">
                      <span>Aktiiviset (kk)</span>
                      <span className="font-semibold text-[var(--text)]">{historyCalendarStats.monthActiveDays}</span>
                    </span>
                  </div>
                  <div className="mt-3 grid w-full grid-cols-[1.75rem_minmax(0,1fr)_1.75rem] items-center gap-1 sm:w-auto sm:grid-cols-[2rem_auto_2rem] sm:gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      className="size-7 rounded-full p-0 sm:size-8"
                      aria-label="Edellinen kuukausi"
                      onClick={() => setHistoryCalendarMonth((current) => addMonthsToCalendarMonth(current, -1))}
                    >
                      <ChevronLeft className="size-4" aria-hidden="true" />
                    </Button>
                    <p className="truncate text-center text-sm text-[var(--text-muted)] sm:max-w-none">
                      {historyCalendarMonthLabel}
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      className="size-7 rounded-full p-0 sm:size-8"
                      aria-label="Seuraava kuukausi"
                      onClick={() => setHistoryCalendarMonth((current) => addMonthsToCalendarMonth(current, 1))}
                    >
                      <ChevronRight className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                  <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] text-[var(--text-subtle)] sm:text-[11px]">
                    {["Ma", "Ti", "Ke", "To", "Pe", "La", "Su"].map((label) => (
                      <p key={label}>{label}</p>
                    ))}
                  </div>
                  <div className="mt-1 grid grid-cols-7 gap-1.5">
                    {historyCalendarCells.map((cell) => {
                      const hasActivity = cell.activityCount > 0;
                      const isSelected = selectedCalendarDayKey === cell.key;
                      const isToday = cell.key === todayCalendarKey;
                      const iconKeys = Object.keys(cell.activityByType).filter(
                        (key) => (cell.activityByType[key] ?? 0) > 0,
                      );
                      const visibleIconKeys = iconKeys.slice(0, 1);
                      const extraTypeCount = Math.max(0, iconKeys.length - visibleIconKeys.length);

                      return (
                        <button
                          type="button"
                          key={cell.key}
                          disabled={!hasActivity}
                          className={cn(
                            "relative z-0 aspect-square w-full max-w-11 min-h-0 min-w-0 justify-self-center appearance-none overflow-hidden rounded-full border p-0 text-left transition",
                            cell.isCurrentMonth
                              ? "border-[var(--border)] bg-[var(--surface)]"
                              : "border-[var(--border)] bg-[color:color-mix(in_srgb,var(--surface-2)_86%,var(--surface))] opacity-70",
                            isToday ? "border-[var(--accent)] bg-[var(--accent)]" : null,
                            hasActivity ? "cursor-pointer hover:border-[var(--accent)]" : "cursor-default",
                            isSelected && isToday
                              ? "z-10 border-[var(--accent-contrast)] bg-[var(--accent)] shadow-[0_0_0_2px_var(--accent-contrast)]"
                              : isSelected
                                ? "z-10 border-[var(--accent)] bg-[color:color-mix(in_srgb,var(--accent)_10%,var(--surface))] shadow-[0_0_0_1.5px_var(--accent)]"
                                : null,
                          )}
                          onClick={() => {
                            if (!hasActivity) {
                              return;
                            }
                            setSelectedCalendarDayKey(cell.key);
                            setSelectedCalendarWorkoutId(null);
                            setSelectedCalendarExtraActivityId(null);
                          }}
                          aria-label={
                            hasActivity
                              ? `${formatCalendarDate(cell.date)}: ${cell.activityCount} treeni${cell.activityCount > 1 ? "ä" : ""}`
                              : `${formatCalendarDate(cell.date)}: ei treenejä`
                          }
                        >
                          {hasActivity ? (
                            <div className="flex h-full w-full flex-col items-center justify-center">
                              <div
                                className={cn(
                                  "flex h-full w-full min-h-0 flex-1 items-center justify-center gap-1 rounded-[50%]",
                                  isToday
                                    ? "bg-[var(--accent)] text-[var(--accent-contrast)]"
                                    : "bg-[color:color-mix(in_srgb,var(--accent)_16%,var(--surface))] text-[var(--accent-strong)]",
                                )}
                              >
                                {visibleIconKeys.map((iconKey) => (
                                  <span key={iconKey} className="grid size-8 place-items-center">
                                    {renderCalendarActivityIcon(iconKey)}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <span className={cn("text-xs", isToday ? "text-[var(--accent-contrast)]" : "text-[var(--text-subtle)]")}>
                                {cell.date.getDate()}
                              </span>
                            </div>
                          )}
                          {extraTypeCount > 0 ? (
                            <span className="absolute -bottom-1 -right-1 grid min-h-4 min-w-4 place-items-center rounded-full border border-[color-mix(in_srgb,var(--accent)_35%,var(--border))] bg-[var(--surface)] px-1 text-[9px] font-semibold leading-4 text-[var(--accent)] shadow-[0_2px_8px_-6px_var(--shadow)]">
                              +{extraTypeCount}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                  {selectedCalendarDayKey ? (
                    <div className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2 shadow-[0_12px_28px_-24px_var(--shadow)]">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-[var(--text)]">
                          {formatCalendarDate(parseLocalDateKey(selectedCalendarDayKey))}
                        </p>
                        <Button
                          type="button"
                          variant="ghost"
                          className="grid size-8 place-items-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] p-0 text-[var(--text-subtle)] hover:text-[var(--text)]"
                          onClick={() => {
                            setSelectedCalendarDayKey(null);
                            setSelectedCalendarWorkoutId(null);
                            setSelectedCalendarExtraActivityId(null);
                          }}
                          aria-label="Sulje päivän tiedot"
                        >
                          <X className="size-4" aria-hidden="true" />
                        </Button>
                      </div>
                      <div className="mt-2 space-y-2">
                        {(calendarDayDetails.get(selectedCalendarDayKey) ?? []).map((item) => (
                          <div key={item.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5">
                            {item.kind === "strength" ? (
                              <>
                                <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2">
                                  <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-[color:color-mix(in_srgb,var(--accent)_13%,var(--surface))] text-[var(--accent)]">
                                    <Dumbbell className="size-3.5" aria-hidden="true" />
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-[var(--text)]">{item.title}</p>
                                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text-subtle)]">
                                      <span className="inline-flex items-center gap-1"><Clock3 className="size-3" aria-hidden="true" />{formatWorkoutDuration(item.durationSeconds)}</span>
                                      <span>·</span>
                                      <span>{item.completedSets}/{item.totalSets} sarjaa</span>
                                      <span>·</span>
                                      <span>{formatLiftedKgValue(item.liftedKg)}</span>
                                    </p>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    className="size-8 shrink-0 self-center rounded-full p-0"
                                    aria-label="Avaa treenin tiedot"
                                    onClick={() => setSelectedCalendarWorkoutId(item.workoutId)}
                                  >
                                    <Info className="size-4" aria-hidden="true" />
                                  </Button>
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2">
                                  <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-[color:color-mix(in_srgb,var(--accent)_13%,var(--surface))] text-[var(--accent)]">
                                    {renderCalendarActivityIcon(item.activityType)}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-[var(--text)]">{item.label}</p>
                                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text-subtle)]">
                                      <span className="inline-flex items-center gap-1"><Clock3 className="size-3" aria-hidden="true" />{item.durationMinutes} min</span>
                                      <span>·</span>
                                      <span>{item.estimatedKcal} kcal</span>
                                    </p>
                                  </div>
                                  {item.notes ? (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      className="size-8 shrink-0 self-center rounded-full p-0"
                                      aria-label="Avaa extra-treenin tiedot"
                                      onClick={() => setSelectedCalendarExtraActivityId(item.activityId)}
                                    >
                                      <Info className="size-4" aria-hidden="true" />
                                    </Button>
                                  ) : null}
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-[var(--text)]">Liikekohtainen kehitys</p>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        Nopea yhteenveto valitusta liikkeestä. Avaa trendi tarvittaessa.
                      </p>
                    </div>
                    {exerciseProgressOptions.length > 0 ? (
                      <div className="w-full sm:w-[18rem]">
                        <Label htmlFor="athlete-history-exercise-progress" className="text-xs">
                          Valitse liike
                        </Label>
                        <Select
                          id="athlete-history-exercise-progress"
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
                      Kun saat ensimmäiset toteutuneet sarjat historiaan, tähän alkaa piirtyä liikekohtainen kehitys.
                    </p>
                  ) : selectedExerciseProgress ? (
                    <>
                      <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3">
                        <p className="text-[11px] font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Valittu liike</p>
                        <p className="mt-1 text-sm font-medium text-[var(--text)]">{selectedExerciseProgress.exerciseName}</p>
                        <p className="mt-3 text-[11px] font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Nykyinen e1RM</p>
                        <p className="mt-1 text-base font-semibold text-[var(--text)]">
                          {selectedExerciseProgress.currentEstimatedOneRepMax !== undefined
                            ? `${formatLoadValue(selectedExerciseProgress.currentEstimatedOneRepMax)} kg`
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
                            <ExerciseProgressMetric
                              label="Paras työsarja"
                              value={formatExerciseSetValue(selectedExerciseProgress.bestSet)}
                              helper={formatExerciseSetHelper(selectedExerciseProgress.bestSet)}
                            />
                            <ExerciseProgressMetric
                              label="Viimeisin toteuma"
                              value={formatExerciseSetValue(selectedExerciseProgress.latestSet)}
                              helper={formatExerciseSetHelper(selectedExerciseProgress.latestSet)}
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
                {workoutHistory.length === 0 ? (
                  <p className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--text-muted)]">
                    Historia on vielä tyhjä. Käynnistä ensimmäinen treeni ohjelmakorteista.
                  </p>
                ) : (
                  <>
                    <div className="mt-5 space-y-3">
                      {groupedWorkoutHistory.map((group, index) => {
                        const selectedHistoryWorkout =
                          group.workouts.find((item) => item.workout.id === selectedHistoryWorkoutByGroup[group.key]) ??
                          group.workouts[0];
                        if (!selectedHistoryWorkout) {
                          return null;
                        }

                        const {
                          workout,
                          insight,
                          noteBody,
                          workoutStatus,
                          historyDateLabel,
                          canResumeHistoryWorkout,
                          canDeleteHistoryWorkout,
                          occurrenceLabel,
                          programTitle,
                        } = selectedHistoryWorkout;
                        const isFocusedHistoryItem = historyFocusWorkoutId === workout.id;
                        const isActionMenuOpen = openHistoryMenuWorkoutId === workout.id;
                        const isGroupExpanded = expandedHistoryGroups[group.key] ?? false;

                        return (
                          <section
                            key={group.key}
                            className={cn(
                              "overflow-hidden rounded-3xl border bg-[var(--surface-2)] transition",
                              isFocusedHistoryItem
                                ? "border-[var(--accent)] shadow-[0_0_0_1px_var(--accent)]"
                                : "border-[var(--border)] hover:border-[var(--border-strong)]",
                            )}
                          >
                            <div
                              role="button"
                              tabIndex={0}
                              className="cursor-pointer p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-2)] sm:p-4"
                              aria-expanded={isGroupExpanded}
                              aria-controls={`athlete-history-panel-${group.key}`}
                              onClick={() => toggleHistoryGroup(group.key, !isGroupExpanded)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  toggleHistoryGroup(group.key, !isGroupExpanded);
                                }
                              }}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex min-w-0 flex-wrap items-center gap-2">
                                  <span className="text-sm font-semibold text-[var(--text)] sm:text-base">
                                    {group.title}
                                  </span>
                                  <Badge className={statusTone(workoutStatus)}>{workoutStatusLabel(workoutStatus)}</Badge>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                  <div className="relative" data-history-menu-root="true">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      className="size-9 rounded-full p-0"
                                      data-history-menu-trigger-id={workout.id}
                                      aria-expanded={isActionMenuOpen}
                                      aria-haspopup="menu"
                                      aria-label="Avaa treenin toiminnot"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        if (isActionMenuOpen) {
                                          setOpenHistoryMenuWorkoutId(null);
                                          setHistoryMenuAnchorRect(null);
                                          setHistoryMenuStyle(null);
                                          return;
                                        }

                                        setHistoryMenuAnchorRect(toAnchorRect(event.currentTarget.getBoundingClientRect()));
                                        setOpenHistoryMenuWorkoutId(workout.id);
                                      }}
                                      onKeyDown={(event) => event.stopPropagation()}
                                    >
                                      <MoreHorizontal className="size-4" aria-hidden="true" />
                                    </Button>
                                    {isActionMenuOpen ? (
                                      <div
                                        ref={historyMenuRef}
                                        role="menu"
                                        className="z-20 min-w-36 max-w-[calc(100vw-1rem)] rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 shadow-[0_12px_30px_-20px_var(--shadow)]"
                                        style={
                                          historyMenuStyle ??
                                          (historyMenuAnchorRect
                                            ? getHiddenFloatingMenuStyle(historyMenuAnchorRect)
                                            : undefined)
                                        }
                                      >
                                        {canResumeHistoryWorkout ? (
                                          <button
                                            type="button"
                                            role="menuitem"
                                            className="w-full rounded-lg px-3 py-2 text-left text-sm text-[var(--accent)] hover:bg-[var(--surface-3)]"
                                            onClick={async () => {
                                              setOpenHistoryMenuWorkoutId(null);
                                              setHistoryMenuAnchorRect(null);
                                              setHistoryMenuStyle(null);
                                              void openOrResumeWorkout(workout.id, `history-menu-${workout.id}`, {
                                                returnTab: "history",
                                              });
                                            }}
                                          >
                                            Jatka treeniä
                                          </button>
                                        ) : null}
                                        {!canResumeHistoryWorkout ? (
                                          <button
                                            type="button"
                                            role="menuitem"
                                            className="w-full rounded-lg px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-[var(--surface-3)]"
                                            onClick={async () => {
                                              setOpenHistoryMenuWorkoutId(null);
                                              setHistoryMenuAnchorRect(null);
                                              setHistoryMenuStyle(null);
                                              openWorkoutView(workout.id, {
                                                correctionMode: true,
                                                returnTab: "history",
                                              });
                                            }}
                                          >
                                            Muokkaa
                                          </button>
                                        ) : null}
                                        {canDeleteHistoryWorkout ? (
                                          <button
                                            type="button"
                                            role="menuitem"
                                            className="w-full rounded-lg px-3 py-2 text-left text-sm text-[var(--danger)] hover:bg-[var(--surface-3)]"
                                            onClick={async () => {
                                              setOpenHistoryMenuWorkoutId(null);
                                              setHistoryMenuAnchorRect(null);
                                              setHistoryMenuStyle(null);
                                              const confirmed = window.confirm(
                                                `Poistetaanko historiasta vain toteutus "${group.title} · ${historyDateLabel} · ${occurrenceLabel}"? Muut saman treenialueen toteutukset säilyvät. Toimintoa ei voi kumota.`,
                                              );
                                              if (!confirmed) {
                                                return;
                                              }

                                              const result = await deleteWorkout(workout.id);
                                              setWorkoutMessage(result.ok ? "Treeni poistettiin historiasta." : result.message);
                                              if (result.ok) {
                                                if (selectedWorkoutId === workout.id) {
                                                  setSelectedWorkoutId(null);
                                                }
                                                setHistoryFocusWorkoutId(null);
                                                setCorrectionModeWorkoutId(null);
                                              }
                                            }}
                                          >
                                            Poista
                                          </button>
                                        ) : null}
                                      </div>
                                    ) : null}
                                  </div>
                                  <span
                                    className="grid size-9 place-items-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text-subtle)]"
                                    aria-hidden="true"
                                  >
                                    {isGroupExpanded ? (
                                      <ChevronUp className="size-4" aria-hidden="true" />
                                    ) : (
                                      <ChevronDown className="size-4" aria-hidden="true" />
                                    )}
                                  </span>
                                </div>
                              </div>
                              <div className="mt-3 min-w-0">
                                {programTitle ? (
                                  <p className="text-xs text-[var(--text-subtle)]">Ohjelma: {programTitle}</p>
                                ) : null}
                                <p className="text-sm text-[var(--text-muted)]">
                                  Toteutus: {historyDateLabel} · {occurrenceLabel}
                                </p>
                                <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[var(--text-subtle)] sm:text-xs">
                                  <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-1">
                                    {group.workouts.length} toteutusta
                                  </span>
                                  <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-1">
                                    {insight.exerciseCount} liikettä
                                  </span>
                                  <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-1">
                                    {insight.completedSetCount}/{insight.setCount} sarjaa
                                  </span>
                                  <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-1">
                                    {formatLiftedKgValue(insight.liftedKg)}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {isGroupExpanded ? (
                              <div
                                id={`athlete-history-panel-${group.key}`}
                                className="border-t border-[var(--border)] bg-[var(--surface)] px-3 py-3 sm:px-4 sm:py-4"
                              >
                                {group.workouts.length === 1 ? (
                                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
                                    <p className="text-[11px] font-semibold tracking-[0.04em] text-[var(--text-subtle)]">
                                      Toteutus
                                    </p>
                                    {programTitle ? (
                                      <p className="mt-1 text-xs text-[var(--text-subtle)]">Ohjelma: {programTitle}</p>
                                    ) : null}
                                    <p className="mt-1 text-sm text-[var(--text)]">
                                      {historyDateLabel} · {occurrenceLabel}
                                    </p>
                                  </div>
                                ) : (
                                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-3">
                                    <div className="flex items-center justify-between gap-3">
                                      <Label htmlFor={`athlete-history-group-${group.key}`} className="text-xs">
                                        Valitse toteutus
                                      </Label>
                                      <p className="text-[11px] text-[var(--text-subtle)]">
                                        Uusin ensin
                                      </p>
                                    </div>
                                    {programTitle ? (
                                      <p className="mt-2 text-xs text-[var(--text-subtle)]">Ohjelma: {programTitle}</p>
                                    ) : null}
                                    <Select
                                      id={`athlete-history-group-${group.key}`}
                                      value={workout.id}
                                      className="mt-2"
                                      onChange={(event) =>
                                        setSelectedHistoryWorkoutByGroup((current) => ({
                                          ...current,
                                          [group.key]: event.target.value,
                                        }))
                                      }
                                    >
                                      {group.workouts.map((item) => (
                                        <option key={item.workout.id} value={item.workout.id}>
                                          {item.historyDateLabel} · {item.occurrenceLabel}
                                        </option>
                                      ))}
                                    </Select>
                                  </div>
                                )}

                                {noteBody ? (
                                  <div className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-3">
                                    <p className="text-[11px] font-semibold tracking-[0.04em] text-[var(--text-subtle)]">
                                      Oma muistiinpano
                                    </p>
                                    <p className="mt-1 whitespace-pre-line text-xs leading-5 text-[var(--text-muted)]">
                                      {noteBody}
                                    </p>
                                  </div>
                                ) : (
                                  <p className="mt-3 text-xs text-[var(--text-subtle)]">Ei muistiinpanoa tästä treenistä.</p>
                                )}

                                <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
                                  <HistoryMetric label="Kesto" value={formatWorkoutDuration(insight.durationSeconds)} />
                                  <HistoryMetric label="Sarjat" value={`${insight.completedSetCount}/${insight.setCount}`} />
                                  <HistoryMetric label="Nostettu" value={formatLiftedKgValue(insight.liftedKg)} />
                                  <HistoryMetric label="Kalorit" value={formatEstimatedCaloriesValue(insight.estimatedCalories)} />
                                </div>

                                <div className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-3">
                                  <p className="text-[11px] font-semibold tracking-[0.04em] text-[var(--text-subtle)]">
                                    Lihasryhmat
                                  </p>
                                  <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3 xl:grid-cols-4">
                                    {historyMuscleGroups.map((muscleGroup) => (
                                      <p key={muscleGroup.key} className="text-[11px] text-[var(--text-muted)]">
                                        {muscleGroup.label}: {formatLiftedKgValue(insight.muscleGroupLiftedKg[muscleGroup.key])}
                                      </p>
                                    ))}
                                  </div>
                                </div>

                                <WorkoutMiniProgress workoutId={workout.id} />
                              </div>
                            ) : null}
                          </section>
                        );
                      })}
                    </div>
                  </>
                )}
                <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                  <p className="text-sm font-semibold text-[var(--text)]">Extra-treenien historia</p>
                  {extraActivities.length === 0 ? (
                    <p className="mt-3 text-xs text-[var(--text-subtle)]">Ei extra-treenejä vielä.</p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {visibleExtraActivities.map((activity) => (
                        <div key={activity.id} className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
                          <div className="flex min-w-0 items-start gap-2">
                            <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-[color:color-mix(in_srgb,var(--accent)_13%,var(--surface))] text-[var(--accent)]">
                              {renderCalendarActivityIcon(activity.activityType)}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-[var(--text)]">
                                {extraActivityCatalog[activity.activityType].label}
                              </p>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--text-subtle)]">
                                <span className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-0.5">
                                  {activity.durationMinutes} min
                                </span>
                                <span className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-0.5">
                                  {activity.estimatedKcal} kcal
                                </span>
                                <span>{formatDateWithWeekday(activity.occurredAt)}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              className="size-8 rounded-full p-0"
                              aria-label="Muokkaa extra-treeniä"
                              onClick={() => {
                                const minutes = activity.durationMinutes;
                                const hours = Math.floor(minutes / 60);
                                const remainder = minutes % 60;
                                setExtraActivityType(activity.activityType);
                                setExtraActivityDurationMinutes(String(hours * 60 + remainder));
                                setExtraActivityDate(activity.occurredAt.slice(0, 10));
                                setExtraActivityNotes(activity.notes ?? "");
                                setManualExtraActivityKcal(String(activity.estimatedKcal));
                                setIsManualExtraActivityKcalEnabled(true);
                                setEditingExtraActivityId(activity.id);
                                setIsExtraActivityDialogOpen(true);
                              }}
                            >
                              <Pencil className="size-4" aria-hidden="true" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              className="size-8 rounded-full p-0 text-[var(--danger)]"
                              aria-label="Poista extra-treeni"
                              onClick={async () => {
                                const confirmed = window.confirm(
                                  `Poistetaanko extra-treeni "${extraActivityCatalog[activity.activityType].label}" päivältä ${formatDateWithWeekday(activity.occurredAt)}? Toimintoa ei voi kumota.`,
                                );
                                if (!confirmed) {
                                  return;
                                }
                                const result = await deleteExtraActivity(activity.id);
                                if (result.ok) {
                                  notify({ tone: "success", message: "Extra-treeni poistettu." });
                                } else {
                                  notify({ tone: "danger", message: result.message });
                                }
                              }}
                            >
                              <Trash2 className="size-4" aria-hidden="true" />
                            </Button>
                          </div>
                        </div>
                      ))}
                      {extraActivities.length > 5 ? (
                        <div className="pt-1">
                          <Button
                            type="button"
                            variant="ghost"
                            className="h-8 px-2 text-xs"
                            onClick={() => setShowAllExtraActivities((current) => !current)}
                          >
                            {showAllExtraActivities ? "Näytä vähemmän" : `Näytä lisää (${extraActivities.length - 5})`}
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              </Card>
            </div>
            ) : null}
          </div>
        )
      )}
      {openWorkoutInstruction ? (
        <CoachInstructionDialog
          exerciseName={openWorkoutInstruction.exerciseName}
          instruction={openWorkoutInstruction.instruction}
          onClose={() => setOpenWorkoutInstruction(null)}
        />
      ) : null}
      {openWorkoutPreview ? (
        <WorkoutPreviewDialog
          workout={openWorkoutPreview}
          onClose={() => setOpenWorkoutPreview(null)}
        />
      ) : null}
      {isExtraActivityDialogOpen ? (
        <ExtraActivityDialog
          activityType={extraActivityType}
          durationMinutes={extraActivityDurationMinutes}
          occurredDate={extraActivityDate}
          notes={extraActivityNotes}
          estimatedKcal={extraActivityEstimatedKcalPreview}
          isManualKcalEnabled={isManualExtraActivityKcalEnabled}
          manualKcal={manualExtraActivityKcal}
          onChangeActivityType={setExtraActivityType}
          onChangeDurationMinutes={setExtraActivityDurationMinutes}
          onChangeOccurredDate={setExtraActivityDate}
          onChangeNotes={setExtraActivityNotes}
          onToggleManualKcal={setIsManualExtraActivityKcalEnabled}
          onChangeManualKcal={setManualExtraActivityKcal}
          onClose={() => {
            setIsExtraActivityDialogOpen(false);
            setEditingExtraActivityId(null);
          }}
          onSave={() => {
            void (async () => {
              const payload = {
                activityType: extraActivityType,
                durationMinutes: Number(extraActivityDurationMinutes),
                manualKcal: isManualExtraActivityKcalEnabled ? Number(manualExtraActivityKcal) : undefined,
                occurredAt: new Date(`${extraActivityDate}T12:00:00`).toISOString(),
                notes: extraActivityNotes,
              };
              const result = editingExtraActivityId
                ? await updateExtraActivity(editingExtraActivityId, payload)
                : await addExtraActivity(payload);
              if (result.ok) {
                notify({
                  tone: "success",
                  message: editingExtraActivityId ? "Extra-treeni päivitetty." : "Extra-treeni lisätty historiaan.",
                });
              } else {
                notify({ tone: "danger", message: result.message });
              }
              if (result.ok) {
                setExtraActivityDurationMinutes("30");
                setExtraActivityNotes("");
                setIsManualExtraActivityKcalEnabled(false);
                setManualExtraActivityKcal("");
                setIsExtraActivityDialogOpen(false);
                setEditingExtraActivityId(null);
              }
            })();
          }}
        />
      ) : null}
      {selectedCalendarWorkoutDetails ? (
        <CalendarWorkoutDetailDialog
          title={selectedCalendarWorkoutDetails.title}
          occurredAt={selectedCalendarWorkoutDetails.occurredAt}
          note={selectedCalendarWorkoutDetails.note}
          rows={selectedCalendarWorkoutDetails.rows}
          onClose={() => setSelectedCalendarWorkoutId(null)}
        />
      ) : null}
      {selectedCalendarExtraActivity ? (
        <CalendarExtraActivityDetailDialog
          title={extraActivityCatalog[selectedCalendarExtraActivity.activityType].label}
          occurredAt={selectedCalendarExtraActivity.occurredAt}
          durationMinutes={selectedCalendarExtraActivity.durationMinutes}
          estimatedKcal={selectedCalendarExtraActivity.estimatedKcal}
          notes={selectedCalendarExtraActivity.notes}
          onClose={() => setSelectedCalendarExtraActivityId(null)}
        />
      ) : null}
    </div>
  );
}


function buildWorkoutInsights(state: AppState) {
  const sessionByWorkoutId = new Map(
    state.sessions.map((session) => [session.scheduledWorkoutId, session]),
  );
  const planById = new Map(state.plans.map((plan) => [plan.id, plan]));
  const exerciseById = new Map(state.exercises.map((exercise) => [exercise.id, exercise]));
  const userById = new Map(state.users.map((user) => [user.id, user]));
  const bodyMeasurementsByUserId = new Map(
    state.users.map((user) => [user.id, getMeasurementsForUser(state, user.id)]),
  );
  const insights = new Map<string, WorkoutInsight>();

  state.scheduledWorkouts.forEach((workout) => {
    const session = sessionByWorkoutId.get(workout.id);
    let exerciseCount = 0;
    let setCount = 0;
    let completedSetCount = 0;
    let completionPercent = 0;
    let totalLoadKg = 0;
    let liftedKg = 0;
    let durationSeconds = 0;
    let estimatedCalories = 0;
    const muscleGroupSetCounts = createEmptyMuscleGroupSetCounts();
    const muscleGroupLiftedKg = createEmptyMuscleGroupLiftedKg();

    if (session) {
      exerciseCount = new Set(session.setLogs.map((log) => log.templateExerciseId)).size;
      setCount = session.setLogs.length;
      completedSetCount = session.setLogs.filter((log) => log.done).length;
      completionPercent = setCount > 0 ? Math.round((completedSetCount / setCount) * 100) : 0;
      totalLoadKg = session.setLogs.reduce((sum, log) => {
        if (!log.done) {
          return sum;
        }
        return sum + (log.actualLoad ?? log.targetLoad ?? 0);
      }, 0);
      liftedKg = session.setLogs.reduce((sum, log) => {
        if (!log.done) {
          return sum;
        }

        const reps = log.actualReps ?? log.targetReps;
        const load = log.actualLoad ?? log.targetLoad ?? 0;
        return sum + reps * load;
      }, 0);

      durationSeconds = calculateSessionDurationSeconds(session);
      estimatedCalories = estimateStrengthCalories({
        durationSeconds,
        completionPercent,
        completedSetCount,
        weightKg: getWeightAtMoment(
          userById.get(workout.athleteId),
          bodyMeasurementsByUserId.get(workout.athleteId) ?? [],
          getSessionDisplayCompletedAt(session),
        ),
      });

      const logsForGroupSummary =
        completedSetCount > 0 ? session.setLogs.filter((log) => log.done) : session.setLogs;
      logsForGroupSummary.forEach((log) => {
        const category = exerciseById.get(log.exerciseId)?.category;
        const groups = ensureMuscleGroups(
          mapExerciseToMuscleGroups(category, log.exerciseName, log.muscleGroup),
        );
        groups.forEach((groupKey) => {
          muscleGroupSetCounts[groupKey] += 1;
        });
      });

      session.setLogs
        .filter((log) => log.done)
        .forEach((log) => {
          const category = exerciseById.get(log.exerciseId)?.category;
          const groups = ensureMuscleGroups(
            mapExerciseToMuscleGroups(category, log.exerciseName, log.muscleGroup),
          );
          const reps = log.actualReps ?? log.targetReps;
          const load = log.actualLoad ?? log.targetLoad ?? 0;
          const liftedForLog = reps * load;
          const distributedLiftedForLog = groups.length > 0 ? liftedForLog / groups.length : liftedForLog;
          groups.forEach((groupKey) => {
            muscleGroupLiftedKg[groupKey] += distributedLiftedForLog;
          });
        });
    } else if (workout.trainingPlanId && workout.programWorkoutId) {
      const plan = planById.get(workout.trainingPlanId);
      const programWorkout = plan?.workouts?.find((item) => item.id === workout.programWorkoutId);
      if (programWorkout) {
        exerciseCount = programWorkout.exercises.length;
        setCount = programWorkout.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
      }
    }

    insights.set(workout.id, {
      exerciseCount,
      setCount,
      completedSetCount,
      completionPercent,
      totalLoadKg,
      liftedKg,
      durationSeconds,
      estimatedCalories,
      muscleGroupSetCounts,
      muscleGroupLiftedKg,
    });
  });

  return insights;
}

function createEmptyMuscleGroupSetCounts(): Record<HistoryMuscleGroupKey, number> {
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

function createEmptyMuscleGroupLiftedKg(): Record<HistoryMuscleGroupKey, number> {
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

function ensureMuscleGroups(groups: HistoryMuscleGroupKey[]): HistoryMuscleGroupKey[] {
  return groups.length > 0 ? groups : ["other"];
}

function mapCategoryToMuscleGroups(category?: string): HistoryMuscleGroupKey[] {
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
  const groups = new Set<HistoryMuscleGroupKey>();

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

function mapExerciseToMuscleGroups(
  category: string | undefined,
  exerciseName: string,
  explicitGroup?: string,
): HistoryMuscleGroupKey[] {
  const mappedFromExplicit = parseHistoryMuscleGroup(explicitGroup);
  if (mappedFromExplicit) {
    return [mappedFromExplicit];
  }

  const mappedFromCategory = mapCategoryToMuscleGroups(category);
  if (mappedFromCategory.length > 0) {
    return mappedFromCategory;
  }

  const normalized = exerciseName.toLowerCase();
  const groups = new Set<HistoryMuscleGroupKey>();

  if (normalized.includes("olkap") || normalized.includes("pystypunn") || normalized.includes("shoulder") || normalized.includes("overhead press") || normalized.includes("shoulder press")) groups.add("shoulders");
  if (normalized.includes("hauis") || normalized.includes("ojent") || normalized.includes("curl") || normalized.includes("tricep") || normalized.includes("bicep")) groups.add("arms");
  if (normalized.includes("penkki") || normalized.includes("rinta") || normalized.includes("punnerrus") || normalized.includes("chest") || normalized.includes("bench")) groups.add("chest");
  if (normalized.includes("vatsa") || normalized.includes("core") || normalized.includes("plank") || normalized.includes("abs")) groups.add("abs");
  if (normalized.includes("soutu") || normalized.includes("ylätalja") || normalized.includes("selkä") || normalized.includes("veto") || normalized.includes("row") || normalized.includes("pulldown") || normalized.includes("deadlift")) groups.add("back");
  if (normalized.includes("kyykky") || normalized.includes("jalka") || normalized.includes("askel") || normalized.includes("pakara") || normalized.includes("squat") || normalized.includes("leg") || normalized.includes("lunge") || normalized.includes("hip thrust")) groups.add("legs");

  return Array.from(groups);
}

function parseHistoryMuscleGroup(value?: string): HistoryMuscleGroupKey | undefined {
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

function getLatestWorkoutCompletionDate(
  state: AppState,
  athleteId: string,
  workoutRef: { templateId?: string; programWorkoutId?: string },
) {
  if (!workoutRef.templateId && !workoutRef.programWorkoutId) {
    return undefined;
  }

  const sessionByWorkoutId = new Map(
    state.sessions.map((session) => [session.scheduledWorkoutId, session]),
  );

  const latest = state.scheduledWorkouts
    .filter(
      (workout) =>
        workout.athleteId === athleteId &&
        (workoutRef.programWorkoutId
          ? workout.programWorkoutId === workoutRef.programWorkoutId
          : workout.templateId === workoutRef.templateId) &&
        workout.status === "completed",
    )
    .sort((a, b) => {
      const leftCompletedAt =
        a.completedAt ?? getWorkoutOrderTimestamps(a, sessionByWorkoutId.get(a.id)).primaryTimestamp;
      const rightCompletedAt =
        b.completedAt ?? getWorkoutOrderTimestamps(b, sessionByWorkoutId.get(b.id)).primaryTimestamp;
      return rightCompletedAt.localeCompare(leftCompletedAt);
    })[0];

  if (!latest) {
    return undefined;
  }

  const latestSession = state.sessions.find((session) => session.scheduledWorkoutId === latest.id);
  return latest.completedAt ?? getWorkoutOrderTimestamps(latest, latestSession).primaryTimestamp;
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

  const sessionByWorkoutId = new Map(
    state.sessions.map((session) => [session.scheduledWorkoutId, session]),
  );

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
    .sort((a, b) => {
      const metadataComparison = compareWorkoutOrderValues(
        getWorkoutOrderTimestamps(a, sessionByWorkoutId.get(a.id)),
        getWorkoutOrderTimestamps(b, sessionByWorkoutId.get(b.id)),
      );
      return metadataComparison !== 0 ? metadataComparison : b.id.localeCompare(a.id);
    });

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
    .sort((a, b) => {
      const metadataComparison = compareWorkoutOrderValues(
        { primaryTimestamp: getSessionDisplayCompletedAt(a), secondaryTimestamp: a.startedAt ?? a.updatedAt },
        { primaryTimestamp: getSessionDisplayCompletedAt(b), secondaryTimestamp: b.startedAt ?? b.updatedAt },
      );
      return metadataComparison !== 0 ? metadataComparison : b.id.localeCompare(a.id);
    })
    .forEach((session) => {
      session.setLogs.forEach((log) => {
        if (result.has(log.exerciseId)) {
          return;
        }

        if (!log.done) {
          return;
        }

        result.set(log.exerciseId, {
          actualReps: log.actualReps,
          actualLoad: log.actualLoad,
          completedAt: getSessionDisplayCompletedAt(session),
          timesCompleted: exerciseCompletionCount.get(log.exerciseId) ?? 0,
        });
      });
    });

  return result;
}

function buildWorkoutExerciseInstructions(
  state: AppState,
  scheduledWorkout: AppState["scheduledWorkouts"][number],
) {
  const workout = resolveScheduledProgramWorkout(state, scheduledWorkout);
  if (!workout) {
    return new Map<string, string>();
  }

  return new Map(
    workout.exercises
      .map((exercise) => [exercise.id, exercise.instruction.trim()] as const)
      .filter((entry) => entry[1].length > 0),
  );
}

function resolveScheduledWorkoutDescription(
  state: AppState,
  scheduledWorkout: AppState["scheduledWorkouts"][number],
) {
  const programWorkout = resolveScheduledProgramWorkout(state, scheduledWorkout);
  const workoutGuidance = programWorkout?.guidance?.trim();
  if (workoutGuidance) {
    return workoutGuidance;
  }

  if (scheduledWorkout.templateId) {
    const template = state.templates.find((item) => item.id === scheduledWorkout.templateId);
    const description = template?.description?.trim();
    if (description) {
      return description;
    }
  }

  return undefined;
}

function resolveScheduledProgramWorkout(
  state: AppState,
  scheduledWorkout: AppState["scheduledWorkouts"][number],
) {
  if (scheduledWorkout.trainingPlanId && scheduledWorkout.programWorkoutId) {
    const plan = state.plans.find((item) => item.id === scheduledWorkout.trainingPlanId);
    const workout = plan?.workouts?.find((item) => item.id === scheduledWorkout.programWorkoutId);
    if (workout) {
      return workout;
    }
  }

  if (!scheduledWorkout.programWorkoutId) {
    return undefined;
  }

  return state.plans
    .flatMap((plan) => plan.workouts ?? [])
    .find((workout) => workout.id === scheduledWorkout.programWorkoutId);
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

function formatLiftedKgValue(value: number) {
  return `${Math.round(value)} kg`;
}

function formatLoadValue(value: number) {
  const decimals = Number.isInteger(value) ? 0 : 1;
  return new Intl.NumberFormat("fi-FI", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

function formatEstimatedCaloriesValue(value: number) {
  return `${Math.round(value)} kcal`;
}

function statusTone(status: string) {
  return workoutStatusBadgeClass(status);
}

function HistoryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
      <p className="text-[11px] font-semibold tracking-[0.04em] text-[var(--text-subtle)]">{label}</p>
      <p className="mt-1 text-sm font-medium text-[var(--text)]">{value}</p>
    </div>
  );
}

function ExerciseProgressMetric({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3">
      <p className="text-[11px] font-semibold tracking-[0.04em] text-[var(--text-subtle)]">{label}</p>
      <p className="mt-1 text-sm font-medium text-[var(--text)]">{value}</p>
      <p className="mt-1 text-xs leading-5 text-[var(--text-subtle)]">{helper}</p>
    </div>
  );
}

function formatExerciseSetValue(
  summary?:
    | {
        actualLoad: number;
        actualReps: number;
      }
    | undefined,
) {
  if (!summary) {
    return "Ei dataa";
  }

  return `${formatLoadValue(summary.actualLoad)} kg x ${summary.actualReps}`;
}

function formatExerciseSetHelper(
  summary?:
    | {
        estimatedOneRepMax: number;
        completedAt: string;
      }
    | undefined,
) {
  if (!summary) {
    return "Tarvitsee toteutuneen painon ja toistot valmiista treenistä.";
  }

  return `e1RM ${formatLoadValue(summary.estimatedOneRepMax)} kg · ${formatDate(summary.completedAt)}`;
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
      <p className="mt-1 text-xs leading-5 text-[var(--text-subtle)]">
        {progress.completedSets}/{progress.totalSets} sarjaa tehty - eteneminen {progress.percent}%
      </p>
    </div>
  );
}

function startOfCalendarMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function addMonthsToCalendarMonth(value: Date, amount: number) {
  return new Date(value.getFullYear(), value.getMonth() + amount, 1);
}

function toLocalDateKey(value: string | Date) {
  const parsed = value instanceof Date ? value : new Date(value);
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatCalendarDate(value: Date) {
  return new Intl.DateTimeFormat("fi-FI", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).format(value);
}

function parseLocalDateKey(value: string) {
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return new Date(value);
  }

  return new Date(year, month - 1, day);
}

function buildHistoryCalendarCells(
  month: Date,
  activityByDay: Map<string, Record<string, number>>,
) {
  const firstOfMonth = startOfCalendarMonth(month);
  const firstDayWeekIndex = (firstOfMonth.getDay() + 6) % 7;
  const gridStartDate = new Date(firstOfMonth);
  gridStartDate.setDate(firstOfMonth.getDate() - firstDayWeekIndex);

  const cells: HistoryCalendarCell[] = [];
  for (let offset = 0; offset < 42; offset += 1) {
    const cellDate = new Date(gridStartDate);
    cellDate.setDate(gridStartDate.getDate() + offset);
    const dayKey = toLocalDateKey(cellDate);
    const dayActivity = activityByDay.get(dayKey) ?? {};
    cells.push({
      key: dayKey,
      date: cellDate,
      isCurrentMonth: cellDate.getMonth() === firstOfMonth.getMonth(),
      activityCount: Object.values(dayActivity).reduce((sum, count) => sum + count, 0),
      activityByType: dayActivity,
    });
  }

  return cells;
}

function renderCalendarActivityIcon(activityType: string) {
  if (activityType === "strength") return <Dumbbell className="size-3.5" aria-hidden="true" />;
  if (activityType === "run") return <Footprints className="size-3.5" aria-hidden="true" />;
  if (activityType === "walk") return <PersonStanding className="size-3.5" aria-hidden="true" />;
  if (activityType === "cycle") return <Bike className="size-3.5" aria-hidden="true" />;
  if (activityType === "indoor_cycle") return <Bike className="size-3.5" aria-hidden="true" />;
  if (activityType === "mtb") return <Bike className="size-3.5" aria-hidden="true" />;
  if (activityType === "treadmill") return <Footprints className="size-3.5" aria-hidden="true" />;
  if (activityType === "stair_climber") return <Mountain className="size-3.5" aria-hidden="true" />;
  if (activityType === "elliptical") return <Activity className="size-3.5" aria-hidden="true" />;
  if (activityType === "swim") return <Waves className="size-3.5" aria-hidden="true" />;
  if (activityType === "paddle") return <Waves className="size-3.5" aria-hidden="true" />;
  if (activityType === "climb" || activityType === "hike") return <Mountain className="size-3.5" aria-hidden="true" />;
  if (activityType === "row") return <Activity className="size-3.5" aria-hidden="true" />;
  if (activityType === "ski" || activityType === "downhill_ski" || activityType === "skate") return <Snowflake className="size-3.5" aria-hidden="true" />;
  if (activityType === "disc_golf") return <CircleDot className="size-3.5" aria-hidden="true" />;
  if (activityType === "yoga" || activityType === "mobility") return <HeartPulse className="size-3.5" aria-hidden="true" />;
  if (activityType === "hiit") return <Flame className="size-3.5" aria-hidden="true" />;
  if (activityType === "combat") return <Swords className="size-3.5" aria-hidden="true" />;
  if (activityType === "dance") return <Music className="size-3.5" aria-hidden="true" />;
  return <CircleDot className="size-3.5" aria-hidden="true" />;
}
