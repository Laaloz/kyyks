"use client";

import { ChevronDown, ChevronUp, Flame, MoreHorizontal } from "lucide-react";
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
import { estimateStrengthCalories, getLatestMeasurement, getMeasurementsForUser, getWeightAtMoment } from "@/lib/body-metrics";
import { calculateSessionDurationSeconds, getSessionProgress } from "@/lib/domain";
import { withMinimumDelay } from "@/lib/min-delay";
import { isProgramActive } from "@/lib/program-status";
import { buildWorkoutConversationContextOptions } from "@/lib/workout-conversation-context";
import { buildWorkoutHistoryTitleMap, normalizeWorkoutHistoryTitle } from "@/lib/workout-history-title";
import type { AppState, ConversationEntry, WorkoutSession } from "@/lib/types";
import { formatDate, formatDateWithWeekday, formatRelativeDate } from "@/lib/utils";
import { resolveBlockingWorkoutStart, useAppState } from "@/providers/app-state-provider";

import { workoutStatusLabel, type WorkspaceView } from "@/components/workout/shared";

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
  completedSetCount: number;
  completionPercent: number;
  totalLoadKg: number;
  liftedKg: number;
  durationSeconds: number;
  estimatedCalories: number;
  muscleGroupSetCounts: Record<HistoryMuscleGroupKey, number>;
  muscleGroupLiftedKg: Record<HistoryMuscleGroupKey, number>;
};

type AthleteLogMode = "library" | "workout";
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
    maxHeight: viewportHeight - floatingMenuPadding * 2,
    overflowY: "auto",
  };
}

export function AthleteDashboard({
  view,
  onOpenWorkoutLog,
  overviewFocusTarget,
  onOverviewFocusHandled,
}: {
  view: WorkspaceView;
  onOpenWorkoutLog?: () => void;
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
  const [athleteLogMode, setAthleteLogMode] = useState<AthleteLogMode>("library");
  const [dismissedActiveWorkoutId, setDismissedActiveWorkoutId] = useState<string | null>(null);
  const [historyFocusWorkoutId, setHistoryFocusWorkoutId] = useState<string | null>(null);
  const [correctionModeWorkoutId, setCorrectionModeWorkoutId] = useState<string | null>(null);
  const [openHistoryMenuWorkoutId, setOpenHistoryMenuWorkoutId] = useState<string | null>(null);
  const [historyMenuAnchorRect, setHistoryMenuAnchorRect] = useState<AnchorRect | null>(null);
  const [historyMenuStyle, setHistoryMenuStyle] = useState<CSSProperties | null>(null);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);
  const [selectedHistoryWorkoutByGroup, setSelectedHistoryWorkoutByGroup] = useState<Record<string, string>>({});
  const [measurementDraft, setMeasurementDraft] = useState({
    heightCm: "",
    weightKg: "",
    waistCm: "",
  });
  const [measurementMessage, setMeasurementMessage] = useState("");
  const [measurementMessageTone, setMeasurementMessageTone] = useState<MeasurementMessageTone>("info");
  const [isSavingMeasurements, setIsSavingMeasurements] = useState(false);
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
    setDismissedActiveWorkoutId(selectedWorkoutId ?? activeWorkout?.id ?? null);
    setSelectedWorkoutId(null);
    setHistoryFocusWorkoutId(null);
    setCorrectionModeWorkoutId(null);
    setOpenHistoryMenuWorkoutId(null);
    setHistoryMenuAnchorRect(null);
    setHistoryMenuStyle(null);
    setAthleteLogMode("library");
  };
  useEffect(() => {
    setSelectedHistoryWorkoutByGroup({});
  }, [currentUser?.id]);
  useEffect(() => {
    setMeasurementDraft({
      heightCm: currentUser?.heightCm !== undefined ? String(currentUser.heightCm) : "",
      weightKg: currentUser?.weightKg !== undefined ? String(currentUser.weightKg) : "",
      waistCm: currentUser?.waistCm !== undefined ? String(currentUser.waistCm) : "",
    });
  }, [currentUser?.id, currentUser?.heightCm, currentUser?.weightKg, currentUser?.waistCm]);
  useEffect(() => {
    setMeasurementMessage("");
    setMeasurementMessageTone("info");
  }, [currentUser?.id]);
  useEffect(() => {
    if (view !== "overview" || overviewFocusTarget !== "measurements") {
      return;
    }

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
  const activeWorkout = useMemo(
    () =>
      [...workouts]
        .filter((item) => item.status === "in_progress")
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0],
    [workouts],
  );
  const resumableWorkout = useMemo(
    () =>
      [...workouts]
        .filter((item) => item.status === "cancelled" && scheduledWithSessionIds.has(item.id))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0],
    [scheduledWithSessionIds, workouts],
  );
  const highlightedWorkout = activeWorkout ?? resumableWorkout;
  const highlightedWorkoutState = activeWorkout ? "active" : resumableWorkout ? "resumable" : null;
  const selectedWorkout =
    (selectedWorkoutId ? workouts.find((item) => item.id === selectedWorkoutId) : undefined) ??
    (athleteLogMode === "workout" ? highlightedWorkout ?? workouts[workouts.length - 1] : undefined);

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
  const inProgressCount = workouts.filter((item) => item.status === "in_progress").length;
  useEffect(() => {
    if (!dismissedActiveWorkoutId) {
      return;
    }

    if (!activeWorkout || activeWorkout.id !== dismissedActiveWorkoutId) {
      setDismissedActiveWorkoutId(null);
    }
  }, [activeWorkout, dismissedActiveWorkoutId]);

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
  const workoutInsights = useMemo(() => buildWorkoutInsights(state), [state]);
  const sessionByWorkoutId = useMemo(
    () => new Map(state.sessions.map((session) => [session.scheduledWorkoutId, session])),
    [state.sessions],
  );
  const resolveWorkoutStatus = (workout: (typeof workouts)[number]) => workout.status;
  const selectedWorkoutStatus = selectedWorkout ? resolveWorkoutStatus(selectedWorkout) : undefined;
  const selectedWorkoutInsight = selectedWorkout ? workoutInsights.get(selectedWorkout.id) : undefined;
  const latestBodyMeasurement = currentUser ? getLatestMeasurement(state, currentUser.id) : undefined;
  const parseMeasurementField = (value: string) => {
    if (!value.trim()) {
      return undefined;
    }

    const nextValue = Number(value.replace(",", "."));
    return Number.isFinite(nextValue) ? nextValue : undefined;
  };
  const nextHeightCm = parseMeasurementField(measurementDraft.heightCm);
  const nextWeightKg = parseMeasurementField(measurementDraft.weightKg);
  const nextWaistCm = parseMeasurementField(measurementDraft.waistCm);
  const isMeasurementDirty =
    currentUser?.role === "athlete" &&
    (currentUser.heightCm !== nextHeightCm ||
      currentUser.weightKg !== nextWeightKg ||
      currentUser.waistCm !== nextWaistCm);
  const weightTrendPoints = useMemo(
    () =>
      currentUser
        ? getMeasurementsForUser(state, currentUser.id)
            .filter((entry) => entry.weightKg !== undefined)
            .slice(0, 12)
            .reverse()
            .map((entry) => ({
              date: entry.measuredAt,
              value: entry.weightKg as number,
            }))
        : [],
    [currentUser, state],
  );
  const waistTrendPoints = useMemo(
    () =>
      currentUser
        ? getMeasurementsForUser(state, currentUser.id)
            .filter((entry) => entry.waistCm !== undefined)
            .slice(0, 12)
            .reverse()
            .map((entry) => ({
              date: entry.measuredAt,
              value: entry.waistCm as number,
            }))
        : [],
    [currentUser, state],
  );
  const openWorkoutView = (scheduledWorkoutId: string, options?: { correctionMode?: boolean }) => {
    setDismissedActiveWorkoutId(null);
    setHistoryFocusWorkoutId(null);
    setSelectedWorkoutId(scheduledWorkoutId);
    setCorrectionModeWorkoutId(options?.correctionMode ? scheduledWorkoutId : null);
    setOpenHistoryMenuWorkoutId(null);
    setHistoryMenuAnchorRect(null);
    setHistoryMenuStyle(null);
    setAthleteLogMode("workout");
  };
  const startWorkoutFromProgram = async (programId: string, workoutId: string, workoutName: string, sourceKey: string) => {
    setPendingWorkoutTransition({ type: "start", workoutId, workoutName, sourceKey });
    const result = await startProgramWorkout(programId, workoutId);
    if (result.ok && result.scheduledWorkoutId) {
      openWorkoutView(result.scheduledWorkoutId);
      setWorkoutMessage(`Treeni "${workoutName}" käynnistyi.`);
      notify({ tone: "success", message: `Treeni "${workoutName}" käynnistyi.` });
      onOpenWorkoutLog?.();
      setPendingWorkoutTransition(null);
      return;
    }

    setPendingWorkoutTransition(null);
    setWorkoutMessage(result.ok ? "Treeni käynnistyi." : result.message);
    if (!result.ok) {
      notify({ tone: "danger", message: result.message });
    }
  };
  const openOrResumeWorkout = async (scheduledWorkoutId: string, sourceKey: string) => {
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

      openWorkoutView(scheduledWorkoutId);
      onOpenWorkoutLog?.();
    } finally {
      setPendingWorkoutTransition((current) =>
        current?.type === "open" && current.scheduledWorkoutId === scheduledWorkoutId ? null : current,
      );
    }
  };
  const isTransitionLoading = (sourceKey: string) =>
    pendingWorkoutTransition !== null && "sourceKey" in pendingWorkoutTransition && pendingWorkoutTransition.sourceKey === sourceKey;
  const activeScheduledByProgramWorkoutId = useMemo(() => {
    const activeById = new Map<string, (typeof workouts)[number]>();
    const getWorkoutPriority = (workout: (typeof workouts)[number]) => {
      const hasSession = scheduledWithSessionIds.has(workout.id);
      const workoutStatus = workout.status;
      if (workoutStatus === "in_progress") {
        return 3;
      }
      if (workoutStatus === "cancelled" && hasSession) {
        return 2;
      }
      return 0;
    };

    workouts
      .filter((workout) => workout.programWorkoutId && workout.status !== "completed")
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
          (candidatePriority === existingPriority && workout.updatedAt > existing.updatedAt)
        ) {
          activeById.set(workout.programWorkoutId, workout);
        }
      });

    return activeById;
  }, [scheduledWithSessionIds, workouts]);
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
  const workoutOccurrenceLabelById = useMemo(
    () =>
      new Map(
        Array.from(workoutHistoryTitles.entries()).map(([workoutId, info]) => [workoutId, info.occurrenceLabel]),
      ),
    [workoutHistoryTitles],
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
    const weeklyTargetCount = athletePrograms.reduce(
      (sum, program) => sum + (program.workouts?.length ?? 0),
      0,
    );
    const completedThisWeek = workouts.filter((workout) => {
      if (workout.status !== "completed") {
        return false;
      }

      const completedAt = workout.completedAt ?? sessionByWorkoutId.get(workout.id)?.completedAt ?? workout.updatedAt;
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
      .sort((a, b) => (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt))[0];
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
  }, [athletePrograms, state.sessions, workoutInsights, workouts]);
  const groupedWorkoutHistory = useMemo(() => {
    const grouped = new Map<
      string,
      {
        key: string;
        title: string;
        workouts: Array<{
          workout: (typeof workoutHistory)[number];
          occurrenceLabel: string;
          insight: WorkoutInsight;
          notePreview: string | null;
          workoutStatus: string;
          completedAt: string;
          historyDateLabel: string;
          canResumeHistoryWorkout: boolean;
          canDeleteHistoryWorkout: boolean;
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
      const notePreview = createNotePreview(latestNoteByWorkoutId.get(workout.id)?.body);
      const canDeleteHistoryWorkout = Boolean(workout.programWorkoutId);
      const workoutStatus = resolveWorkoutStatus(workout);
      const completedAt =
        workout.completedAt ??
        sessionByWorkoutId.get(workout.id)?.completedAt ??
        workout.updatedAt ??
        workout.scheduledDate;
      const historyDateLabel =
        workoutStatus === "completed"
          ? formatDateWithWeekday(completedAt)
          : formatRelativeDate(workout.scheduledDate);
      const canResumeHistoryWorkout =
        workoutStatus === "cancelled" && scheduledWithSessionIds.has(workout.id);
      const title = historyTitle?.title ?? normalizeWorkoutHistoryTitle(workout.title);
      const groupKey = title.toLowerCase();
      const current = grouped.get(groupKey);
      const row = {
        workout,
        occurrenceLabel: historyTitle?.occurrenceLabel ?? "Treeni 1",
        insight,
        notePreview,
        workoutStatus,
        completedAt,
        historyDateLabel,
        canResumeHistoryWorkout,
        canDeleteHistoryWorkout,
      };

      if (current) {
        current.workouts.push(row);
        return;
      }

      grouped.set(groupKey, {
        key: groupKey,
        title,
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
    workoutHistory,
    workoutHistoryTitles,
    workoutInsights,
  ]);
  const visibleGroupedWorkoutHistory = useMemo(
    () => (isHistoryExpanded ? groupedWorkoutHistory : groupedWorkoutHistory.slice(0, 3)),
    [groupedWorkoutHistory, isHistoryExpanded],
  );
  const conversationContextOptions = useMemo(
    () => [
      { id: "general", label: "Yleinen keskustelu", contextType: "general" as const },
      ...buildWorkoutConversationContextOptions({
        workouts,
        plans: athletePrograms,
        templates: state.templates,
      }),
      ...athletePrograms.map((program) => ({
        id: `program-${program.id}`,
        label: `Ohjelma: ${program.title}`,
        contextType: "program" as const,
        contextId: program.id,
        contextLabel: program.title,
      })),
    ],
    [athletePrograms, state.templates, workouts],
  );

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
              <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Treeniäly</p>
              <CardTitle className="mt-2 text-2xl">Tämän viikon treenipulssi</CardTitle>
              <CardDescription className="mt-2 max-w-3xl leading-7">
                Näe yhdellä silmäyksellä mitä kannattaa tehdä seuraavaksi, miten viikko etenee ja mitä olet jo saanut aikaan.
              </CardDescription>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_0.85fr] lg:auto-rows-fr lg:items-stretch">
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4">
                <div className="flex items-center gap-1">
                  <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Viikon eteneminen</p>
                  <InfoTooltip text="Kuinka monta tämän viikon valmista treeniä on tehty suhteessa ohjelman viikkotavoitteeseen." />
                </div>
                <p className="mt-2 text-lg font-semibold text-[var(--text)]">
                  {weeklyInsights.completedCount}/{weeklyInsights.targetCount} treeniä valmiina
                </p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  {weeklyInsights.targetCount > 0
                    ? "Tasainen eteneminen vie pitkälle. Jatkuvuus rakentaa tuloksia."
                    : "Viikkotavoitetta ei ole vielä määritetty."}
                </p>
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4">
                <div className="flex items-center gap-1">
                  <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Nostettu tällä viikolla</p>
                  <InfoTooltip text="Luku lasketaan valmiista sarjoista kaavalla kuorma x toistot." />
                </div>
                <p className="mt-2 text-lg font-semibold text-[var(--text)]">{formatLiftedKgValue(weeklyInsights.weeklyVolume)}</p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  Jokainen valmis sarja kasvattaa kokonaistyömäärää ja rakentaa progressiota.
                </p>
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4">
                  <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">
                    {highlightedWorkoutState === "active"
                      ? "Aktiivinen treeni"
                      : highlightedWorkoutState === "resumable"
                        ? "Keskeytetty treeni"
                        : "Päivän valinta"}
                  </p>
                  <p className="mt-2 text-lg font-semibold text-[var(--text)]">
                    {highlightedWorkout
                      ? normalizeWorkoutHistoryTitle(highlightedWorkout.title)
                      : athletePrograms.length
                        ? "Ei aktiivista treeniä"
                        : "Ei treenejä vielä"}
                  </p>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    {highlightedWorkoutState === "active"
                      ? "Siirry takaisin treeniin ja viimeistele sarjat."
                      : highlightedWorkoutState === "resumable"
                        ? "Sinulla on keskeytetty treeni odottamassa jatkoa samasta kohdasta."
                      : athletePrograms.length
                        ? "Avaa alapuolelta treenilista ja valitse seuraava treeni ohjelmastasi."
                        : "Pyydä valmentajaa rakentamaan ensimmäinen ohjelma."}
                  </p>
                  {highlightedWorkout ? (
                    <div className="mt-4">
                      <Button
                        type="button"
                        variant="secondary"
                        className="w-full sm:w-auto"
                        loading={isTransitionLoading("overview-highlight")}
                        loadingText="Avataan treeniä..."
                        onClick={() => {
                          void openOrResumeWorkout(highlightedWorkout.id, "overview-highlight");
                        }}
                      >
                        {highlightedWorkoutState === "active" ? "Siirry treeniin" : "Jatka treeniä"}
                      </Button>
                    </div>
                  ) : null}
                </div>
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4">
                <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Viimeisin valmis treeni</p>
                <p className="mt-2 text-lg font-semibold text-[var(--text)]">
                  {weeklyInsights.latestCompleted
                    ? normalizeWorkoutHistoryTitle(weeklyInsights.latestCompleted.title)
                    : "Ei vielä valmiita treenejä"}
                </p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  {weeklyInsights.latestCompleted
                    ? `${formatDateWithWeekday(weeklyInsights.latestCompleted.completedAt ?? weeklyInsights.latestCompleted.updatedAt)} · ${formatLiftedKgValue(weeklyInsights.latestCompletedVolume)}`
                    : "Ensimmäinen valmis treeni näkyy tässä automaattisesti."}
                </p>
              </div>
              <div className="grid place-items-center rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-6 sm:col-span-2 lg:col-start-3 lg:row-start-1 lg:row-span-2">
                <ProgressRing label="Viikon eteneminen" percent={weeklyInsights.completionRate} />
              </div>
            </div>
          </div>
        </Card>
      )}

      {view === "overview" && currentUser?.role === "athlete" ? (
        <div
          ref={measurementsSectionRef}
          id="overview-measurements"
        >
          <Card className="scroll-mt-24 border-[var(--border-strong)]">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Kehon seuranta</p>
                <CardTitle className="mt-2 text-2xl">Mitat ja kehitys</CardTitle>
                <CardDescription className="mt-2 max-w-3xl">
                  Näet tästä viimeisimmät mitat ja niiden kehityksen. Kun kirjaat uuden mittauksen, seuranta päivittyy automaattisesti.
                </CardDescription>
            </div>
            <div className="grid w-full gap-3 sm:grid-cols-2 xl:w-auto xl:min-w-[38rem] xl:grid-cols-4">
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4">
                <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Pituus</p>
                <p className="mt-2 text-lg font-semibold text-[var(--text)]">
                  {currentUser.heightCm !== undefined ? `${currentUser.heightCm} cm` : "Ei asetettu"}
                </p>
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4">
                <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Paino</p>
                <p className="mt-2 text-lg font-semibold text-[var(--text)]">
                  {currentUser.weightKg !== undefined ? `${currentUser.weightKg} kg` : "Ei asetettu"}
                </p>
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4">
                <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Vyötärö</p>
                <p className="mt-2 text-lg font-semibold text-[var(--text)]">
                  {currentUser.waistCm !== undefined ? `${currentUser.waistCm} cm` : "Ei asetettu"}
                </p>
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4">
                <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Viimeisin mittaus</p>
                <p className="mt-2 text-lg font-semibold text-[var(--text)]">
                  {latestBodyMeasurement ? formatDate(latestBodyMeasurement.measuredAt) : "Ei vielä"}
                </p>
              </div>
            </div>
          </div>
          <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
            <div className="flex flex-col gap-2">
              <div>
                <p className="text-sm font-semibold text-[var(--text)]">Kirjaa uusi mittaus</p>
                <p className="text-sm text-[var(--text-muted)]">
                  Lisää tähän uusin mittaus, kun haluat päivittää seurannan. Voit täyttää vain ne kentät, joihin tuli muutos.
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div>
                <Label htmlFor="overview-height-cm">Pituus (cm, valinnainen)</Label>
                <Input
                  id="overview-height-cm"
                  type="number"
                  inputMode="decimal"
                  min={80}
                  max={250}
                  step="0.5"
                  placeholder="Esim. 178"
                  value={measurementDraft.heightCm}
                  onChange={(event) => {
                    setMeasurementDraft((previous) => ({ ...previous, heightCm: event.target.value }));
                    setMeasurementMessage("");
                    setMeasurementMessageTone("info");
                  }}
                />
              </div>
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
                    ? "Tallennus päivittää viimeisimmän mittauksen ja trendit."
                    : "Täytä yksi tai useampi kenttä, kun haluat tallentaa uuden mittauksen.")}
              </p>
              <Button
                type="button"
                variant={isMeasurementDirty ? "primary" : "secondary"}
                disabled={!isMeasurementDirty}
                loading={isSavingMeasurements}
                loadingText="Tallennetaan mittatietoja..."
                className="w-full sm:w-auto"
                onClick={async () => {
                  const parsed = bodyMeasurementSchema.safeParse(measurementDraft);
                  if (!parsed.success) {
                    setMeasurementMessage(parsed.error.issues[0]?.message ?? "Tarkista mittatiedot ja yritä uudelleen.");
                    setMeasurementMessageTone("error");
                    return;
                  }

                  setIsSavingMeasurements(true);
                  try {
                    const result = await withMinimumDelay(updateCurrentUserMeasurements(parsed.data));
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
          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            <div>
              <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Painotrendi</p>
              <MetricTrendChart
                points={weightTrendPoints}
                ariaLabel="Painon kehitystrendi"
                emptyMessage="Lisää paino viimeisimpään mittaukseen, niin kehitystrendi alkaa piirtyä tähän."
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
                emptyMessage="Lisää vyötärö viimeisimpään mittaukseen, niin kehitystrendi alkaa piirtyä tähän."
                helperText="Alarivillä näkyy kuukausi ja vuosi, oikealla vyötärön asteikko."
                valueLabel="Vyötärö"
                unit="cm"
              />
            </div>
            </div>
          </Card>
        </div>
      ) : null}

      {view === "overview" && (
        <Card className="border-[var(--border-strong)]">
          <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Seuraava askel</p>
          <CardTitle className="text-2xl">
            {highlightedWorkoutState === "active"
              ? "Siirry aktiiviseen treeniin"
              : highlightedWorkoutState === "resumable"
                ? "Jatka keskeytettyä treeniä"
              : athletePrograms.length
                ? "Siirry treeneihin"
                : "Treeniohjelma puuttuu"}
          </CardTitle>
          <CardDescription className="mt-2">
            {highlightedWorkoutState === "active"
              ? "Avaa keskeneräinen treeni suoraan siitä kohdasta, johon jäit."
              : highlightedWorkoutState === "resumable"
                ? "Jatka keskeytettyä treeniä suoraan siitä kohdasta, johon jäit."
              : athletePrograms.length
                ? "Treeneissä valitset treenin, seuraat historiaa ja teet kaikki kirjaukset."
                : "Pyydä valmentajaa lisäämään sinulle ohjelma, niin pääset aloittamaan treenit tästä."}
          </CardDescription>
          <div className="mt-5 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
              <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">
                {highlightedWorkout ? "Nopea toiminto" : "Treenit"}
              </p>
              <p className="mt-2 text-lg font-semibold text-[var(--text)]">
                {highlightedWorkout ? normalizeWorkoutHistoryTitle(highlightedWorkout.title) : "Avaa treenit ja historia"}
              </p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                {highlightedWorkoutState === "active"
                  ? "Siirry takaisin treeniin ilman ylimääräisiä välivaiheita."
                  : highlightedWorkoutState === "resumable"
                    ? "Jatka keskeytettyä treeniä ilman, että aloitat uutta päivää."
                  : athletePrograms.length
                    ? "Valitse treeni, käynnistä se tai palaa aiempiin toteutuksiin."
                    : "Kun ohjelma on luotu, käynnistät treenit tästä näkymästä."}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                {highlightedWorkout ? (
                  <Button
                    type="button"
                    variant="secondary"
                    loading={isTransitionLoading("overview-next-step")}
                    loadingText="Avataan treeniä..."
                    onClick={() => {
                      void openOrResumeWorkout(highlightedWorkout.id, "overview-next-step");
                    }}
                  >
                    {highlightedWorkoutState === "active" ? "Siirry treeniin" : "Jatka treeniä"}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={!athletePrograms.length}
                    onClick={() => {
                      setAthleteLogMode("library");
                      onOpenWorkoutLog?.();
                    }}
                  >
                    Avaa treenit
                  </Button>
                )}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4">
                <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Ohjelmat</p>
                <p className="mt-2 text-lg font-semibold text-[var(--text)]">{athletePrograms.length}</p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">Aktiiviset treeniohjelmasi</p>
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4">
                <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Toteutukset</p>
                <p className="mt-2 text-lg font-semibold text-[var(--text)]">{workoutHistory.length}</p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">Harjoituksiin tallennetut toteutukset</p>
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4">
                <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Kesken</p>
                <p className="mt-2 text-lg font-semibold text-[var(--text)]">{inProgressCount}</p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">Treeni odottaa jatkamista</p>
              </div>
            </div>
          </div>
        </Card>
      )}

      {view === "conversation" && currentUser ? (
        <ConversationPanel
          heading="Yhteinen keskustelu"
          description="Löydät yhdestä paikasta valmentajan kommentit ja omat viestisi."
          entries={athleteConversationEntries}
          users={state.users}
          currentRole={currentUser.role}
          currentUserId={currentUser.id}
          emptyMessage="Tähän näkymään ilmestyvät viestit heti, kun niitä syntyy."
          contextOptions={conversationContextOptions}
          occurrenceLabelByWorkoutId={workoutOccurrenceLabelById}
          onSend={(body, option) =>
            addConversationComment(body, {
              scheduledWorkoutId: option.contextType === "workout" ? option.contextId : undefined,
              trainingPlanId: option.contextType === "program" ? option.contextId : undefined,
              contextLabel: option.contextLabel,
            })
          }
        />
      ) : null}

      {view === "athlete-log" && (
        athleteLogMode === "workout" ? (
          <Card className="border-[var(--border-strong)] max-md:rounded-none max-md:border-0 max-md:bg-transparent max-md:p-0 max-md:shadow-none">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Treeni</p>
                <CardTitle className="text-2xl">
                  {selectedWorkout ? normalizeWorkoutHistoryTitle(selectedWorkout.title) : "Aktiivinen treeni"}
                </CardTitle>
                <CardDescription className="mt-2">
                  {selectedWorkout
                    ? `${formatRelativeDate(selectedWorkout.scheduledDate)} · ${workoutStatusLabel(selectedWorkoutStatus ?? selectedWorkout.status)}`
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
                      <p className="text-sm font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Edistyminen</p>
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
                    Nostettu yhteensä {formatLiftedKgValue(selectedWorkoutInsight?.liftedKg ?? 0)} ·{" "}
                    arvioitu kulutus {formatEstimatedCaloriesValue(selectedWorkoutInsight?.estimatedCalories ?? 0)}.
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
                scheduledWorkoutTitle={normalizeWorkoutHistoryTitle(selectedWorkout.title)}
                onStart={async () => {
                  const result = await startWorkout(selectedWorkout.id);
                  if (!result.ok) {
                    setWorkoutMessage(result.message);
                    return;
                  }

                  setSelectedWorkoutId(selectedWorkout.id);
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
                      setAthleteLogMode("library");
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
                    setAthleteLogMode("library");
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

                  const result = await deleteWorkout(selectedWorkout.id);
                  console.info("[workout-ui] delete-result", {
                    scheduledWorkoutId: selectedWorkout.id,
                    ok: result.ok,
                    message: result.ok ? undefined : result.message,
                  });
                  setWorkoutMessage(result.ok ? "Treeni poistettiin." : result.message);

                  if (result.ok) {
                    setPendingWorkoutTransition({ type: "delete" });
                    setDismissedActiveWorkoutId(null);
                    setSelectedWorkoutId(null);
                    setCorrectionModeWorkoutId(null);
                    setAthleteLogMode("library");
                    notify({ tone: "success", message: "Treeni poistettiin." });
                    window.setTimeout(() => setPendingWorkoutTransition(null), 900);
                  } else {
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
                workoutMessage={workoutMessage}
                isCompleting={isCompletingWorkout}
              />
            ) : (
              <CardDescription className="mt-4">Ei vielä treenejä.</CardDescription>
            )}
          </Card>
        ) : (
          <div className="grid gap-6">
            <Card>
              <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Ohjelman treenit</p>
              <CardTitle className="text-2xl">Valitse treeni</CardTitle>
              <CardDescription className="mt-2">
                 Aloita treeni ohjelmastasi. Aiempien toteutusten tiedot löydät historiasta.
              </CardDescription>
              {blockingWorkout ? (
                <div className="mt-4 rounded-2xl border border-[var(--accent)] bg-[color:color-mix(in_srgb,var(--accent)_10%,var(--surface))] px-4 py-4 text-sm text-[var(--text)] shadow-[0_10px_24px_-22px_var(--accent)]">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold tracking-[0.04em] text-[var(--accent)]">
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
                        loading={isTransitionLoading(`blocking-${blockingWorkout.id}`)}
                        loadingText="Avataan treeniä..."
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
              {pendingWorkoutTransition && !["open", "start"].includes(pendingWorkoutTransition.type) ? (
                <p className="mt-4 flex items-center gap-3 rounded-2xl border border-[var(--border-strong)] bg-[color:color-mix(in_srgb,var(--surface-2)_84%,var(--surface))] px-4 py-3 text-sm text-[var(--text)] shadow-[0_12px_28px_-24px_var(--shadow)]">
                  <span
                    aria-hidden="true"
                    className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent text-[var(--accent)]"
                  />
                  <span>
                    {pendingWorkoutTransition.type === "complete"
                        ? "Merkitään treeniä valmiiksi ja palataan treenilistaan..."
                      : pendingWorkoutTransition.type === "cancel"
                        ? "Palataan treenilistaan ja päivitetään keskeytetty tila..."
                        : "Poistetaan treeniä ja päivitetään näkymä..."}
                  </span>
                </p>
              ) : null}
              {athletePrograms.length ? (
                <div className="mt-5 grid gap-4">
                  {athletePrograms.map((program) => (
                    <div key={program.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                      <p className="text-sm font-semibold text-[var(--text)]">{program.title}</p>
                      {program.description ? (
                        <p className="mt-2 max-w-3xl text-sm text-[var(--text-muted)]">{program.description}</p>
                      ) : null}
                      <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
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

                          return (
                            <div
                              key={workout.id}
                              className="flex h-full w-full flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[0_1px_0_0_var(--shadow-soft),0_10px_24px_-20px_var(--shadow)]"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-base font-semibold text-[var(--text)]">{workout.name}</p>
                                  <p className="mt-1 text-xs text-[var(--text-subtle)]">
                                    {workout.exercises.length} liikettä · {setCount} sarjaa · oletuslepo {workout.defaultRestSeconds}s
                                  </p>
                                </div>
                                {activeScheduled ? (
                                  <Badge className={statusTone(activeScheduledStatus ?? activeScheduled.status)}>
                                    {workoutStatusLabel(activeScheduledStatus ?? activeScheduled.status)}
                                  </Badge>
                                ) : null}
                              </div>
                              <p className="mt-3 text-sm text-[var(--text-muted)]">{workoutSummary}</p>
                              <div className="mt-3 flex flex-wrap gap-2">
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
                                      (!resumableScheduledId && pendingWorkoutTransition?.type === "start")
                                    }
                                    loading={
                                      resumableScheduledId
                                        ? isTransitionLoading(`program-${program.id}-workout-${workout.id}`)
                                        : pendingWorkoutTransition?.type === "start" &&
                                          pendingWorkoutTransition.workoutId === workout.id &&
                                          pendingWorkoutTransition.sourceKey === `program-${program.id}-workout-${workout.id}`
                                    }
                                    loadingText="Avataan treeniä..."
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
            <div ref={historySectionRef}>
              <Card>
                <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Treenihistoria</p>
                <CardTitle className="text-2xl">Historia</CardTitle>
                <CardDescription className="mt-2">
                  Historia on ryhmitelty treeneittäin. Valitse toteutus päivämäärän mukaan tai avaa treeni tarkasteluun ja korjaukseen.
                </CardDescription>
                {workoutHistory.length === 0 ? (
                  <p className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--text-muted)]">
                    Historia on vielä tyhjä. Käynnistä ensimmäinen treeni ohjelmakorteista.
                  </p>
                ) : (
                  <>
                    <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {visibleGroupedWorkoutHistory.map((group) => {
                      const selectedHistoryWorkout =
                        group.workouts.find((item) => item.workout.id === selectedHistoryWorkoutByGroup[group.key]) ??
                        group.workouts[0];
                      if (!selectedHistoryWorkout) {
                        return null;
                      }

                      const { workout, insight, notePreview, workoutStatus, historyDateLabel, canResumeHistoryWorkout, canDeleteHistoryWorkout, occurrenceLabel } = selectedHistoryWorkout;
                      const isFocusedHistoryItem = historyFocusWorkoutId === workout.id;
                      const isActionMenuOpen = openHistoryMenuWorkoutId === workout.id;
                      return (
                        <div
                          key={group.key}
                          className={`w-full rounded-3xl border bg-[var(--surface-2)] p-5 transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-3)] ${
                            isFocusedHistoryItem
                              ? "border-[var(--accent)] shadow-[0_0_0_1px_var(--accent)]"
                              : "border-[var(--border)]"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="font-medium text-[var(--text)]">{group.title}</p>
                              <p className="text-sm text-[var(--text-muted)]">{historyDateLabel}</p>
                              <p className="mt-1 text-xs text-[var(--text-subtle)]">
                                {insight.exerciseCount} liikettä · {occurrenceLabel}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-start gap-2">
                              <div className="flex flex-col items-end gap-2">
                                <Badge className={statusTone(workoutStatus)}>{workoutStatusLabel(workoutStatus)}</Badge>
                              </div>
                              <div className="relative" data-history-menu-root="true">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  className="size-8 rounded-full p-0"
                                  data-history-menu-trigger-id={workout.id}
                                  aria-expanded={isActionMenuOpen}
                                  aria-haspopup="menu"
                                  aria-label="Avaa treenin toiminnot"
                                  onClick={(event) => {
                                    if (isActionMenuOpen) {
                                      setOpenHistoryMenuWorkoutId(null);
                                      setHistoryMenuAnchorRect(null);
                                      setHistoryMenuStyle(null);
                                      return;
                                    }

                                    setHistoryMenuAnchorRect(
                                      toAnchorRect(event.currentTarget.getBoundingClientRect()),
                                    );
                                    setOpenHistoryMenuWorkoutId(workout.id);
                                  }}
                                >
                                  <MoreHorizontal className="size-4" aria-hidden="true" />
                                </Button>
                                {isActionMenuOpen ? (
                                  <div
                                    ref={historyMenuRef}
                                    role="menu"
                                    className="z-20 min-w-36 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 shadow-[0_12px_30px_-20px_var(--shadow)]"
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
                                           void openOrResumeWorkout(workout.id, `history-menu-${workout.id}`);
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
                                          openWorkoutView(workout.id, { correctionMode: true });
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
                            </div>
                          </div>
                          <div className="mt-4">
                            {group.workouts.length === 1 ? (
                              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
                                <p className="text-[11px] font-semibold tracking-[0.04em] text-[var(--text-subtle)]">
                                  Toteutus
                                </p>
                                <p className="mt-1 text-sm text-[var(--text)]">
                                  {historyDateLabel} · {occurrenceLabel}
                                </p>
                              </div>
                            ) : (
                              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3">
                                <div className="flex items-center justify-between gap-3">
                                  <Label htmlFor={`athlete-history-group-${group.key}`} className="text-xs">
                                    Valitse toteutus
                                  </Label>
                                  <p className="text-[11px] text-[var(--text-subtle)]">
                                    {group.workouts.length} toteutusta
                                  </p>
                                </div>
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
                          </div>
                          {notePreview ? (
                            <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
                              <p className="text-[11px] font-semibold tracking-[0.04em] text-[var(--text-subtle)]">
                                Oma muistiinpano
                              </p>
                              <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{notePreview}</p>
                            </div>
                          ) : null}
                          <div className="mt-4 grid grid-cols-2 gap-2">
                            <HistoryMetric label="Kesto" value={formatWorkoutDuration(insight.durationSeconds)} />
                            <HistoryMetric label="Sarjat" value={`${insight.completedSetCount}/${insight.setCount}`} />
                            <HistoryMetric label="Nostettu yhteensä" value={formatLiftedKgValue(insight.liftedKg)} />
                            <HistoryMetric label="Kalorit" value={formatEstimatedCaloriesValue(insight.estimatedCalories)} />
                            <HistoryMetric label="Suoritus" value={`${insight.completionPercent}%`} />
                          </div>
                          <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
                            <p className="text-[11px] font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Lihasryhmäyleiskatsaus</p>
                            <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                              {historyMuscleGroups.map((group) => (
                                <p key={group.key} className="text-[11px] text-[var(--text-muted)]">
                                  {group.label}: {formatLiftedKgValue(insight.muscleGroupLiftedKg[group.key])}
                                </p>
                              ))}
                            </div>
                          </div>
                          {!notePreview ? (
                            <p className="mt-2 text-xs text-[var(--text-subtle)]">Ei muistiinpanoa tästä treenistä.</p>
                          ) : null}
                          <WorkoutMiniProgress workoutId={workout.id} />
                        </div>
                      );
                      })}
                    </div>
                    {groupedWorkoutHistory.length > 3 ? (
                      <div className="mt-4 flex justify-center">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => setIsHistoryExpanded((value) => !value)}
                        >
                          {isHistoryExpanded
                            ? "Näytä vähemmän"
                            : `Näytä lisää (${groupedWorkoutHistory.length - 3})`}
                        </Button>
                      </div>
                    ) : null}
                  </>
                )}
              </Card>
            </div>
          </div>
        )
      )}
    </div>
  );
}


function buildWorkoutInsights(state: AppState) {
  const sessionByWorkoutId = new Map(
    state.sessions.map((session) => [session.scheduledWorkoutId, session]),
  );
  const templateById = new Map(state.templates.map((template) => [template.id, template]));
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
          session.completedAt ?? session.updatedAt,
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

  const latest = state.scheduledWorkouts
    .filter(
      (workout) =>
        workout.athleteId === athleteId &&
        (workoutRef.programWorkoutId
          ? workout.programWorkoutId === workoutRef.programWorkoutId
          : workout.templateId === workoutRef.templateId) &&
        workout.status === "completed",
    )
    .sort((a, b) => (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt))[0];

  return latest?.completedAt ?? latest?.updatedAt;
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

        if (!log.done) {
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

function buildWorkoutExerciseInstructions(
  state: AppState,
  scheduledWorkout: AppState["scheduledWorkouts"][number],
) {
  if (scheduledWorkout.templateId) {
    const template = state.templates.find((item) => item.id === scheduledWorkout.templateId);
    if (!template) {
      return new Map<string, string>();
    }

    return new Map(
      template.blocks.flatMap((block) =>
        block.exercises
          .map((exercise) => [exercise.id, exercise.instruction.trim()] as const)
          .filter((entry) => entry[1].length > 0),
      ),
    );
  }

  if (scheduledWorkout.trainingPlanId && scheduledWorkout.programWorkoutId) {
    const plan = state.plans.find((item) => item.id === scheduledWorkout.trainingPlanId);
    const workout = plan?.workouts?.find((item) => item.id === scheduledWorkout.programWorkoutId);
    if (!workout) {
      return new Map<string, string>();
    }

    return new Map(
      workout.exercises
        .map((exercise) => [exercise.id, exercise.instruction.trim()] as const)
        .filter((entry) => entry[1].length > 0),
    );
  }

  return new Map<string, string>();
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

function createNotePreview(note?: string, maxLength = 160) {
  if (!note) {
    return "";
  }

  if (note.length <= maxLength) {
    return note;
  }

  return `${note.slice(0, maxLength - 1).trimEnd()}…`;
}

function formatLiftedKgValue(value: number) {
  return `${Math.round(value)} kg`;
}

function formatEstimatedCaloriesValue(value: number) {
  return `${Math.round(value)} kcal`;
}

function statusTone(status: string) {
  switch (status) {
    case "completed":
      return "border-[var(--accent-tertiary)] bg-[var(--surface-3)] text-[var(--accent-tertiary)]";
    case "in_progress":
      return "border-[var(--accent)] bg-[var(--surface-3)] text-[var(--accent)]";
    case "cancelled":
      return "border-[var(--danger)] bg-[var(--surface-3)] text-[var(--danger)]";
    default:
      return "border-[var(--border-strong)] bg-[var(--surface-3)] text-[var(--text-subtle)]";
  }
}

function HistoryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
      <p className="text-[11px] font-semibold tracking-[0.04em] text-[var(--text-subtle)]">{label}</p>
      <p className="mt-1 text-sm font-medium text-[var(--text)]">{value}</p>
    </div>
  );
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
        <div className="flex size-28 flex-col items-center justify-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)]">
          <Flame className="size-6 text-[var(--accent)]" />
          <p className="font-[family-name:var(--font-display)] text-3xl font-semibold leading-none text-[var(--text)]">{percent}%</p>
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
        {progress.completedSets}/{progress.totalSets} sarjaa valmiina ({progress.percent}%)
      </p>
    </div>
  );
}
