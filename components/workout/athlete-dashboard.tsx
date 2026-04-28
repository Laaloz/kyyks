"use client";

import { ArrowLeft, BookOpen, ChevronDown, ChevronUp, MoreHorizontal } from "lucide-react";
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
import type { AppState, ConversationEntry, WorkoutSession } from "@/lib/types";
import { formatDate, formatDateWithWeekday, formatRelativeDate } from "@/lib/utils";
import { resolveBlockingWorkoutStart, useAppState } from "@/providers/app-state-provider";

import { ProgressRing, workoutStatusBadgeClass, workoutStatusLabel, type WorkspaceView } from "@/components/workout/shared";

type WorkoutSelectionPriority = 0 | 2 | 3;

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
    updateWorkoutSet,
    saveWorkoutNote,
    addConversationComment,
    completeWorkout,
    cancelWorkout,
    deleteWorkout,
  } = useAppState();
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(null);
  const [workoutMessage, setWorkoutMessage] = useState<string>("");
  const [openWorkoutInstruction, setOpenWorkoutInstruction] = useState<{ exerciseName: string; instruction: string } | null>(null);
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
  const [isCompletingWorkout, setIsCompletingWorkout] = useState(false);
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
      return;
    }

    const workoutName = normalizeWorkoutHistoryTitle(workout.title);
    setPendingWorkoutTransition({ type: "open", scheduledWorkoutId, workoutName, sourceKey });

    try {
      if (resolveWorkoutStatus(workout) === "cancelled") {
        const result = await withMinimumDelay(startWorkout(scheduledWorkoutId));
        if (!result.ok) {
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
  const activeScheduledByProgramWorkoutId = useMemo(() => {
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
      .filter((workout) => workout.programWorkoutId && resolveWorkoutStatus(workout) !== "completed")
      .forEach((workout) => {
        if (!workout.programWorkoutId) {
          return;
        }

        const existing = activeById.get(workout.programWorkoutId);
        const candidatePriority = getWorkoutPriority(workout);
        if (candidatePriority === 0) {
          return;
        }

        if (!existing) {
          activeById.set(workout.programWorkoutId, workout);
          return;
        }

        const existingPriority = getWorkoutPriority(existing);
        if (
          candidatePriority > existingPriority ||
          (candidatePriority === existingPriority && compareWorkoutOrder(workout, existing) < 0)
        ) {
          activeById.set(workout.programWorkoutId, workout);
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
    <div className="grid gap-6">
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
        <Card className="border-[var(--border-strong)]">
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Yhteenveto</p>
              <CardTitle className="mt-2 text-2xl">Tämä viikko</CardTitle>
              <CardDescription className="mt-2 max-w-3xl leading-6">
                Näet viikon etenemisen, viimeisimmän treenin ja seuraavan askeleen yhdellä silmäyksellä.
              </CardDescription>
            </div>
            <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                <div className="grid gap-4 md:grid-cols-[auto_1fr] md:items-center">
                  <ProgressRing label="Viikon eteneminen" percent={weeklyInsights.completionRate} showLabel={false} />
                  <div className="space-y-4">
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Viikon eteneminen</p>
                        <InfoTooltip text="Kuinka monta tämän viikon valmista treeniä on tehty suhteessa ohjelman viikkotavoitteeseen." />
                      </div>
                      <p className="mt-2 text-2xl font-semibold text-[var(--text)]">
                        {weeklyInsights.completedCount}{" "}
                        {weeklyInsights.completedCount === 1 ? "treeni" : "treeniä"} valmiina
                      </p>
                      <p className="mt-1 text-sm text-[var(--text-muted)]">
                        {weeklyInsights.targetCount > 0
                          ? `Tavoite tällä viikolla: ${weeklyInsights.targetCount} ${weeklyInsights.targetCount === 1 ? "treeni" : "treeniä"}`
                          : "Viikkotavoitetta ei ole vielä määritetty."}
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                        <div className="flex items-center gap-1">
                          <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Volyymi tällä viikolla</p>
                          <InfoTooltip text="Luku lasketaan valmiista sarjoista kaavalla kuorma x toistot." />
                        </div>
                        <p className="mt-1 text-base font-semibold text-[var(--text)]">
                          {formatLiftedKgValue(weeklyInsights.weeklyVolume)}
                        </p>
                        <p className="mt-1 text-xs text-[var(--text-subtle)]">Valmiit sarjat yhteensä</p>
                      </div>
                      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                        <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Viimeisin valmis treeni</p>
                        <p className="mt-1 text-base font-semibold text-[var(--text)]">
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
              <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">
                  {highlightedWorkoutState === "active"
                    ? "Aktiivinen treeni"
                    : highlightedWorkoutState === "resumable"
                      ? "Keskeytetty treeni"
                      : "Seuraava askel"}
                </p>
                <p className="mt-2 text-lg font-semibold text-[var(--text)]">
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
                <div className="mt-4">
                  {highlightedWorkout ? (
                    <Button
                      type="button"
                      variant="secondary"
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
                      variant="ghost"
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
                  <p className="mt-3 text-xs text-[var(--text-subtle)]">
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
                <CardTitle className="mt-2 text-2xl">Omat mitat ja kehitys</CardTitle>
                <CardDescription className="mt-2 max-w-3xl">
                  Näet viimeisimmät mittasi ja niiden kehityksen.
                </CardDescription>
            </div>
            <div className="grid w-full gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[color-mix(in_srgb,var(--surface-2)_74%,var(--surface))] px-3 py-2.5">
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
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5">
                <p className="text-[11px] font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Paino</p>
                <p className="mt-1 text-base font-semibold text-[var(--text)]">
                  {currentUser.weightKg !== undefined ? `${currentUser.weightKg} kg` : "Ei asetettu"}
                </p>
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5">
                <p className="text-[11px] font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Vyötärö</p>
                <p className="mt-1 text-base font-semibold text-[var(--text)]">
                  {latestWaistCm !== undefined ? `${latestWaistCm} cm` : "Ei asetettu"}
                </p>
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5">
                <p className="text-[11px] font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Viimeisin mittaus</p>
                <p className="mt-1 text-base font-semibold text-[var(--text)]">
                  {latestBodyMeasurement ? formatDate(latestBodyMeasurement.measuredAt) : "Ei vielä"}
                </p>
              </div>
            </div>
          </div>
          <div className="mt-5 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-2)]">
            <div className="flex items-start gap-2 p-4">
              <button
                type="button"
                id={measurementDisclosureButtonId}
                aria-expanded={isMeasurementFormExpanded}
                aria-controls={measurementDisclosurePanelId}
                className="group min-w-0 flex-1 rounded-[1rem] py-0 text-left text-inherit transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
                onClick={() => setIsMeasurementFormExpanded((current) => !current)}
              >
                <span className="block text-sm font-semibold text-[var(--text)]">Kirjaa uusi mittaus</span>
                <span className="mt-1 block text-sm text-[var(--text-muted)]">
                  Päivitä paino tai vyötärö. Voit täyttää vain muuttuneet kentät.
                </span>
              </button>
              <button
                type="button"
                className="grid size-8.5 shrink-0 place-items-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text-subtle)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-3)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
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
                className="border-t border-[var(--border)] px-4 pb-4 pt-4"
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
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
          <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-[var(--text)]">Kehitystrendi</p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">Valitse paino, vyötärö tai volyymi.</p>
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
            <div className="mt-4">
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
                  {blockingWorkout.status !== "cancelled" ? (
                    <div className="mt-3">
                      <Button
                        type="button"
                        variant="secondary"
                        className="w-full sm:w-auto"
                        disabled={isTransitionLoading(`blocking-${blockingWorkout.id}`)}
                        onClick={() => {
                          void openOrResumeWorkout(blockingWorkout.id, `blocking-${blockingWorkout.id}`);
                        }}
                      >
                        Siirry treeniin
                      </Button>
                    </div>
                  ) : null}
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
                        {[...(program.workouts ?? [])]
                          .sort((a, b) => {
                            const aActiveScheduled = activeScheduledByProgramWorkoutId.get(a.id);
                            const bActiveScheduled = activeScheduledByProgramWorkoutId.get(b.id);
                            const aStatus = aActiveScheduled ? resolveWorkoutStatus(aActiveScheduled) : undefined;
                            const bStatus = bActiveScheduled ? resolveWorkoutStatus(bActiveScheduled) : undefined;
                            const aResumable = Boolean(
                              aActiveScheduled &&
                                aStatus === "cancelled" &&
                                scheduledWithSessionIds.has(aActiveScheduled.id),
                            );
                            const bResumable = Boolean(
                              bActiveScheduled &&
                                bStatus === "cancelled" &&
                                scheduledWithSessionIds.has(bActiveScheduled.id),
                            );
                            const aInProgress = aStatus === "in_progress";
                            const bInProgress = bStatus === "in_progress";

                            if (aResumable !== bResumable) {
                              return aResumable ? -1 : 1;
                            }
                            if (aInProgress !== bInProgress) {
                              return aInProgress ? -1 : 1;
                            }

                            const aCompletionCount = currentUser
                              ? countWorkoutCompletions(state, currentUser.id, {
                                  programWorkoutId: a.id,
                                })
                              : 0;
                            const bCompletionCount = currentUser
                              ? countWorkoutCompletions(state, currentUser.id, {
                                  programWorkoutId: b.id,
                                })
                              : 0;
                            return bCompletionCount - aCompletionCount;
                          })
                          .map((workout) => {
                          const setCount = workout.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
                          const completionCount =
                            currentUser
                              ? countWorkoutCompletions(state, currentUser.id, {
                                  programWorkoutId: workout.id,
                                })
                              : 0;
                          const activeScheduled = activeScheduledByProgramWorkoutId.get(workout.id);
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
                                    {workout.exercises.length} liikettä · {setCount} sarjaa · oletuslepo {workout.defaultRestSeconds}s
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  aria-label={`${workout.name} ohje`}
                                  title="Ohje"
                                  className="inline-flex size-8.5 shrink-0 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--accent)_22%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_7%,var(--surface))] text-[var(--accent)] shadow-[0_4px_12px_-14px_var(--accent)] transition hover:border-[color-mix(in_srgb,var(--accent)_36%,var(--border))] hover:bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))] hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
                                  onClick={() => setOpenWorkoutInstruction({ exerciseName: workout.name, instruction: workoutGuidance })}
                                >
                                  <BookOpen className="size-3.5" aria-hidden="true" />
                                </button>
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
                                    variant="secondary"
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
            </Card>
            </div>
            ) : null}

            {athleteLogTab === "history" ? (
            <div ref={historySectionRef} role="tabpanel" id="athlete-log-panel-history" aria-labelledby="athlete-log-tab-history">
              <Card>
                <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Treenihistoria</p>
                <CardTitle className="text-2xl">Historia</CardTitle>
                <CardDescription className="mt-2">
                  Historia on ryhmitelty treeneittäin. Valitse toteutus päivämäärän mukaan tai avaa treeni tarkasteluun ja korjaukseen.
                </CardDescription>
                <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-[var(--text)]">Liikekohtainen kehitys</p>
                      <p className="mt-1 text-sm text-[var(--text-muted)]">
                        Seuraa valitun liikkeen arvioidun yhden toiston maksimin (e1RM) kehitystä, parasta työsarjaa ja viimeisintä kuormallista toteumaa.
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
                      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                        <ExerciseProgressMetric
                          label="Nykyinen e1RM"
                          value={
                            selectedExerciseProgress.currentEstimatedOneRepMax !== undefined
                              ? `${formatLoadValue(selectedExerciseProgress.currentEstimatedOneRepMax)} kg`
                              : "Ei dataa"
                          }
                          helper={
                            selectedExerciseProgress.currentEstimatedOneRepMax !== undefined
                              ? `Arvioitu yhden toiston maksimi. Viimeisin kuormallinen toteuma ${formatDate(selectedExerciseProgress.lastCompletedAt)}`
                              : "Tarvitsee valmiista treenistä toteutuneen painon ja toistot, jotta yhden toiston maksimi voidaan arvioida."
                          }
                        />
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

                      <div className="mt-4">
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
