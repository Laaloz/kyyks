"use client";

import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Info,
  Plus,
  Trash2,
  Clock3,
} from "lucide-react";
import {
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { InfoTooltip } from "@/components/ui/tooltip";
import { AthleteSessionPanel } from "@/components/workout/athlete/session-panel";
import { ConversationPanel } from "@/components/workout/conversation-panel";
import { DragNumber } from "@/components/ui/drag-number";
import { Segmented } from "@/components/ui/segmented";
import { useHeaderAction } from "@/components/workout/header-action";
import { ExerciseProgressView } from "@/components/workout/exercise-progress-view";
import { MetricTrendChart } from "@/components/workout/metric-trend-chart";
import { NutritionView } from "@/components/workout/nutrition-view";
import { DayMealsSummary } from "@/components/workout/nutrition/day-meals-summary";
import { getMeasurementsForUser } from "@/lib/body-metrics";
import { getSessionProgress } from "@/lib/domain";
import { buildExerciseProgressCatalog, type ExerciseProgressCatalog } from "@/lib/exercise-progress";
import { getMeasurementReminderState } from "@/lib/measurement-reminder";
import { withMinimumDelay } from "@/lib/min-delay";
import { deriveProgramWorkoutGuidance } from "@/lib/program-workout-guidance";
import { isProgramActive } from "@/lib/program-status";
import { canManageOwnPrograms, canTrackOwnTraining } from "@/lib/role-access";
import { buildScheduledWorkoutExerciseOrder } from "@/lib/workout-exercise-order";
import { buildWorkoutHistoryTitleMap, normalizeWorkoutHistoryTitle } from "@/lib/workout-history-title";
import { cn } from "@/lib/utils";
import { extraActivityCatalog } from "@/lib/extra-activities";
import type { AppState, ConversationEntry, ExtraActivity, ExtraActivityType, ProgramWorkout, WorkoutSession } from "@/lib/types";
import { formatDate, formatDateWithWeekday, formatRelativeDate } from "@/lib/utils";
import { resolveBlockingWorkoutStart, useAppState } from "@/providers/app-state-provider";

import { workoutStatusLabel, type WorkspaceView } from "@/components/workout/shared";
import {
  formatCalendarDate,
  formatDuration,
  formatEstimatedCaloriesValue,
  formatLiftedKgValue,
  formatLoadValue,
  formatWorkoutDuration,
  statusTone,
  toLocalDateKey,
} from "@/components/workout/athlete/dashboard-format";
import {
  buildPreviousExerciseResults,
  buildWorkoutExerciseInstructions,
  buildWorkoutInsights,
  compareWorkoutOrderValues,
  countWorkoutCompletions,
  getLatestWorkoutCompletionDate,
  getWorkoutOrderTimestamps,
  type PreviousExerciseResult,
  resolveScheduledProgramWorkout,
  type WorkoutOrderMetadata,
} from "@/components/workout/athlete/dashboard-insights";
import { useExtraActivityForm } from "@/components/workout/athlete/use-extra-activity-form";
import { useHistoryInlineEdit } from "@/components/workout/athlete/use-history-inline-edit";
import { renderCalendarActivityIcon } from "@/components/workout/athlete/calendar-activity-icon";
import { useMeasurementForm } from "@/components/workout/athlete/use-measurement-form";
import { useMeasurementTrend } from "@/components/workout/athlete/use-measurement-trend";
import { useWorkoutWakeLock } from "@/components/workout/athlete/use-workout-wake-lock";
import {
  CoachInstructionDialog,
  ExtraActivityDialog,
  ProgramWorkoutPreviewDialog,
} from "@/components/workout/athlete/dashboard-dialogs";

type WorkoutSelectionPriority = 0 | 2 | 3;

type AthleteLogMode = "overview" | "workout";
type AthleteLogTab = "training" | "history" | "exercises";
type AthleteOverviewFocusTarget = "measurements";

export function AthleteDashboard({
  view,
  readOnly = false,
  onOpenWorkoutLog,
  onOpenSettings,
  onOpenMeasurements,
  onOpenNutrition,
  onOpenProgramEditor,
  onWorkoutDetailModeChange,
  overviewFocusTarget,
  onOverviewFocusHandled,
}: {
  view: WorkspaceView;
  // Esikatselu (vaihe 8): valmentaja/admin katselee urheilijan näkymää read-only.
  // Piilottaa kaikki mutatoivat toiminnot (aloitus, kirjaus, ateriat, mittaukset).
  readOnly?: boolean;
  onOpenWorkoutLog?: () => void;
  onOpenSettings?: () => void;
  onOpenMeasurements?: () => void;
  onOpenNutrition?: () => void;
  onOpenProgramEditor?: () => void;
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
    updateWorkoutDate,
    updateWorkoutDuration,
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
  const [previewProgramWorkout, setPreviewProgramWorkout] = useState<ProgramWorkout | null>(null);
  const [athleteLogMode, setAthleteLogMode] = useState<AthleteLogMode>("overview");
  const [athleteLogTab, setAthleteLogTab] = useState<AthleteLogTab>("training");
  const [athleteLogReturnTab, setAthleteLogReturnTab] = useState<AthleteLogTab>("training");
  const [dismissedActiveWorkoutId, setDismissedActiveWorkoutId] = useState<string | null>(null);
  const [historyFocusWorkoutId, setHistoryFocusWorkoutId] = useState<string | null>(null);
  const [pendingStartWorkoutId, setPendingStartWorkoutId] = useState<string | null>(null);
  const [correctionModeWorkoutId, setCorrectionModeWorkoutId] = useState<string | null>(null);
  const sessionByWorkoutId = useMemo(
    () => new Map(state.sessions.map((session) => [session.scheduledWorkoutId, session])),
    [state.sessions],
  );
  const {
    draft: measurementDraft,
    message: measurementMessage,
    messageTone: measurementMessageTone,
    isSaving: isSavingMeasurements,
    isSheetOpen: isMeasurementSheetOpen,
    clearMessage: clearMeasurementMessage,
    openSheet: openMeasurementSheet,
    closeSheet: closeMeasurementSheet,
    changeWeight: changeMeasurementWeight,
    changeWaist: changeMeasurementWaist,
    save: handleSaveMeasurement,
  } = useMeasurementForm({
    state,
    currentUserId: currentUser?.id,
    currentWeightKg: currentUser?.weightKg,
  });
  const completingWorkoutRef = useRef(false);
  const {
    activityType: extraActivityType,
    setActivityType: setExtraActivityType,
    durationMinutes: extraActivityDurationMinutes,
    setDurationMinutes: setExtraActivityDurationMinutes,
    date: extraActivityDate,
    setDate: setExtraActivityDate,
    notes: extraActivityNotes,
    setNotes: setExtraActivityNotes,
    isManualKcalEnabled: isManualExtraActivityKcalEnabled,
    setIsManualKcalEnabled: setIsManualExtraActivityKcalEnabled,
    manualKcal: manualExtraActivityKcal,
    setManualKcal: setManualExtraActivityKcal,
    isSaving: isSavingExtraActivity,
    isDialogOpen: isExtraActivityDialogOpen,
    open: openExtraActivityDialog,
    close: closeExtraActivityDialog,
    estimatedKcalPreview: extraActivityEstimatedKcalPreview,
    submit: submitExtraActivity,
  } = useExtraActivityForm({
    currentUserId: currentUser?.id,
    weightKg: currentUser?.weightKg,
    onAdded: () => {
      setHistoryFocusWorkoutId(null);
      setAthleteLogTab("history");
      setAthleteLogReturnTab("history");
      setAthleteLogMode("overview");
    },
  });
  const [showAllExtraActivities, setShowAllExtraActivities] = useState(false);
  const [isCompletingWorkout, setIsCompletingWorkout] = useState(false);
  const {
    keepScreenOn: keepWorkoutScreenOn,
    setKeepScreenOn: setKeepWorkoutScreenOn,
    supported: workoutWakeLockSupported,
    error: workoutWakeLockError,
    clearError: clearWorkoutWakeLockError,
  } = useWorkoutWakeLock(athleteLogMode === "workout" && Boolean(selectedWorkoutId));
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
  const measurementsSectionRef = useRef<HTMLDivElement | null>(null);
  const closeWorkoutView = () => {
    setSelectedWorkoutId(null);
    setHistoryFocusWorkoutId(null);
    setCorrectionModeWorkoutId(null);
    setAthleteLogMode("overview");
    setAthleteLogTab(athleteLogReturnTab);
  };
  useEffect(() => {
    onWorkoutDetailModeChange?.(view === "athlete-log" && athleteLogMode === "workout");
  }, [athleteLogMode, onWorkoutDetailModeChange, view]);
  useEffect(() => {
    if (view !== "measurements" || overviewFocusTarget !== "measurements") {
      return;
    }

    // Muistutuksen "Avaa kehon seuranta" avaa Uusi mittaus -sheetin heti.
    openMeasurementSheet();
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
  const highlightedLoggedSetCount = highlightedWorkout
    ? sessionByWorkoutId.get(highlightedWorkout.id)?.setLogs.filter((log) => log.done).length ?? 0
    : 0;
  // When nothing is in progress, surface the next program workout to start on the hero.
  const heroNextWorkout = useMemo(() => {
    for (const program of athletePrograms) {
      const workout = (program.workouts ?? [])[0];
      if (workout) {
        return {
          name: workout.name,
          exerciseCount: workout.exercises.length,
          setCount: workout.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0),
        };
      }
    }
    return null;
  }, [athletePrograms]);
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
  const {
    expandedHistoryGroups,
    setExpandedHistoryGroups,
    historyEditDraft,
    setHistoryEditDraft,
    isSavingHistoryEdit,
    extraEditDraft,
    setExtraEditDraft,
    isSavingExtraEdit,
    startHistoryEdit,
    saveHistoryEdit,
    startExtraEdit,
    saveExtraEdit,
  } = useHistoryInlineEdit({
    sessionByWorkoutId,
    workoutInsights,
    currentUserId: currentUser?.id,
  });
  const selectedWorkoutStatus = selectedWorkout ? resolveWorkoutStatus(selectedWorkout) : undefined;
  // Aktiivinen kirjaus: paneli renderöi prototyypin oman headerin (takaisin +
  // KÄYNNISSÄ·aika + otsikko + x/y), joten emon raskas Card-header piilotetaan.
  const isActiveWorkoutLogging = Boolean(selectedWorkout) && selectedWorkoutStatus === "in_progress" && !readOnly;
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
    // Optimistinen id rekeytettiin oikeaksi → vanhaa id:tä ei enää ole tilassa.
    // Älä jää odottamaan kuollutta id:tä, muuten sync-tila ei koskaan vapaudu.
    if (!pendingWorkout) {
      setPendingStartWorkoutId(null);
      return;
    }

    const pendingSession = sessionByWorkoutId.get(pendingStartWorkoutId);
    if (!pendingSession) {
      return;
    }

    if (pendingWorkout.id.startsWith("workout_") || pendingSession.id.startsWith("session_")) {
      return;
    }

    setPendingStartWorkoutId(null);
  }, [pendingStartWorkoutId, sessionByWorkoutId, workouts]);
  // Turvaverkko: vaikka palvelinsynkka takkuaisi, älä jätä aloitusspinneriä ikuisesti pyörimään.
  useEffect(() => {
    if (!pendingStartWorkoutId) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setPendingStartWorkoutId(null);
    }, 12000);

    return () => window.clearTimeout(timeout);
  }, [pendingStartWorkoutId]);
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
  const canTrackOwnMeasurements = canTrackOwnTraining(currentUser?.role);
  // Keho-näkymän ensisijainen toiminto nostetaan yläpalkkiin (prototyypin TopBar).
  useHeaderAction(
    "measurements",
    view === "measurements" && !readOnly && canTrackOwnMeasurements
      ? {
          label: "Mittaus",
          icon: Plus,
          onClick: () => {
            clearMeasurementMessage();
            openMeasurementSheet();
          },
        }
      : null,
  );
  // Keho-näkymä (prototyyppi): valitun mittarin nykyarvo, muutos valitulta
  // aikaväliltä, koko historia merkintälistana.
  const measurementReminderState = useMemo(
    () => (currentUser ? getMeasurementReminderState(state, currentUser) : null),
    [currentUser, state],
  );
  const weeklyRemindersEnabled = currentUser?.settings?.weeklyMeasurementReminders ?? true;
  const showMeasurementReminderCard =
    !readOnly && weeklyRemindersEnabled && Boolean(measurementReminderState?.isDue);
  const {
    trend: bodyMetric,
    setTrend: setActiveMeasurementTrend,
    range: bodyMetricRange,
    setRange: setBodyMetricRange,
    showAllEntries: showAllMeasurementEntries,
    setShowAllEntries: setShowAllMeasurementEntries,
    unit: bodyMetricUnit,
    entries: bodyMetricEntries,
    currentValue: bodyMetricCurrentValue,
    points: bodyMetricPoints,
    delta: bodyMetricDelta,
    weeks: bodyMetricWeeks,
    visibleEntries: visibleMeasurementEntries,
  } = useMeasurementTrend({
    bodyMeasurements,
    currentUserId: currentUser?.id,
    currentWeightKg: currentUser?.weightKg,
    latestWaistCm,
  });
  const openWorkoutView = (
    scheduledWorkoutId: string,
    options?: { correctionMode?: boolean; returnTab?: AthleteLogTab },
  ) => {
    setDismissedActiveWorkoutId(null);
    setHistoryFocusWorkoutId(null);
    setSelectedWorkoutId(scheduledWorkoutId);
    setCorrectionModeWorkoutId(options?.correctionMode ? scheduledWorkoutId : null);
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
  // Päiväkohtainen ravintotila viikkorytmin ravintosegmenttiä varten:
  // "ok" = kaikki päivän ateriat syöty, "part" = osa syöty, "none" = ei rivejä/ei syötyä.
  const nutritionStatusByDay = useMemo(() => {
    const byDay = new Map<string, { total: number; eaten: number }>();
    (state.dayMealPlans ?? [])
      .filter((entry) => entry.athleteId === currentUser?.id)
      .forEach((entry) => {
        const current = byDay.get(entry.planDate) ?? { total: 0, eaten: 0 };
        current.total += 1;
        if (entry.eatenAt) {
          current.eaten += 1;
        }
        byDay.set(entry.planDate, current);
      });
    return byDay;
  }, [currentUser?.id, state.dayMealPlans]);
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
      const nutrition = nutritionStatusByDay.get(key);
      const nutritionStatus: "ok" | "part" | "none" =
        nutrition && nutrition.total > 0 && nutrition.eaten >= nutrition.total
          ? "ok"
          : nutrition && nutrition.eaten > 0
            ? "part"
            : "none";
      return { key, date, activityByType, activityCount, nutritionStatus };
    });
  }, [historyActivityByDay, nutritionStatusByDay]);
  const todayCalendarKey = useMemo(() => toLocalDateKey(new Date()), []);
  const extraActivities = useMemo(
    () =>
      (state.extraActivities ?? [])
        .filter((activity) => activity.athleteId === currentUser?.id)
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
    [currentUser?.id, state.extraActivities],
  );
  const visibleExtraActivities = showAllExtraActivities ? extraActivities : extraActivities.slice(0, 5);
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

    setExpandedHistoryGroups((current) => {
      if (current[historyFocusWorkoutId] !== undefined) {
        return current;
      }

      return {
        ...current,
        [historyFocusWorkoutId]: true,
      };
    });

    const resetTimer = window.setTimeout(() => {
      setHistoryFocusWorkoutId(null);
    }, 5000);

    return () => window.clearTimeout(resetTimer);
  }, [historyFocusWorkoutId]);

  return (
    <div className="grid grid-cols-1 min-w-0 max-w-full gap-6 overflow-x-clip [contain:inline-size]">
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
        <Card className="today-hero max-w-full overflow-x-clip border-[var(--hero-border)] bg-[var(--hero-bg)] text-[var(--hero-fg)] [contain:inline-size]">
          <p className="text-xs font-semibold tracking-[0.04em] text-[color:color-mix(in_srgb,var(--hero-fg)_62%,transparent)]">
            {highlightedWorkoutState === "active"
              ? "Treeni kesken"
              : highlightedWorkoutState === "resumable"
                ? "Keskeneräinen treeni"
                : heroNextWorkout
                  ? "Seuraava treeni"
                  : "Aloita tästä"}
          </p>
          <h2 className="mt-1.5 font-[family-name:var(--font-display)] text-[1.75rem] font-bold leading-tight tracking-[-0.01em] text-[var(--hero-fg)]">
            {highlightedWorkout
              ? normalizeWorkoutHistoryTitle(highlightedWorkout.title)
              : heroNextWorkout
                ? heroNextWorkout.name
                : "Ei ohjelmaa vielä"}
          </h2>
          <p className="mt-1 text-sm text-[color:color-mix(in_srgb,var(--hero-fg)_72%,transparent)]">
            {highlightedWorkout
              ? `${highlightedLoggedSetCount} ${highlightedLoggedSetCount === 1 ? "sarja" : "sarjaa"} kirjattu — jatka siitä mihin jäit`
              : heroNextWorkout
                ? `${heroNextWorkout.exerciseCount} ${heroNextWorkout.exerciseCount === 1 ? "liike" : "liikettä"} · ${heroNextWorkout.setCount} ${heroNextWorkout.setCount === 1 ? "sarja" : "sarjaa"}`
                : "Pyydä valmentajaa rakentamaan ensimmäinen ohjelma."}
          </p>
          {readOnly ? null : highlightedWorkout ? (
            <Button
              type="button"
              variant="primary"
              className="mt-4 w-full"
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
              className="mt-4 w-full"
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
        </Card>
      )}

      {view === "overview" && (
        <Card className="max-w-full overflow-x-clip [contain:inline-size]">
          <div className="flex items-baseline justify-between gap-3">
            <CardTitle>Viikkorytmi</CardTitle>
            {weeklyInsights.targetCount > 0 ? (
              <p className="shrink-0 font-[family-name:var(--font-display)] text-sm font-semibold tabular-nums text-[var(--text)]">
                {weeklyInsights.completedCount}/{weeklyInsights.targetCount} treeniä
              </p>
            ) : null}
          </div>

          {/* 7 päivää, 2 segmenttiä/päivä: treeni (accent) + ravinto (accent-secondary).
              Ravintosegmentti: ok = kaikki päivän ateriat syöty, part = osa syöty. */}
          <div className="mt-4 grid grid-cols-7 gap-1.5">
            {overviewWeekCells.map((cell) => {
              const hasActivity = cell.activityCount > 0;
              const isToday = cell.key === todayCalendarKey;
              const weekdayLabel = ["Ma", "Ti", "Ke", "To", "Pe", "La", "Su"][(cell.date.getDay() + 6) % 7];

              return (
                <button
                  type="button"
                  key={`overview-week-cell-${cell.key}`}
                  className="flex min-w-0 flex-col items-center gap-1.5 appearance-none bg-transparent p-0"
                  aria-label={`${formatCalendarDate(cell.date)} avaa historian kalenteri`}
                  onClick={() => {
                    setAthleteLogMode("overview");
                    setAthleteLogTab("history");
                    setAthleteLogReturnTab("history");
                    onOpenWorkoutLog?.();
                  }}
                >
                  <span
                    className={cn(
                      "flex w-full flex-col gap-1 rounded-lg",
                      isToday ? "outline outline-2 outline-offset-2 outline-[var(--text)]" : null,
                    )}
                  >
                    <span
                      className={cn(
                        "block h-5 rounded-md",
                        hasActivity
                          ? "bg-[var(--accent)]"
                          : isToday
                            ? "bg-[color:color-mix(in_srgb,var(--accent)_14%,var(--surface))] shadow-[inset_0_0_0_1.5px_var(--accent)]"
                            : "bg-[var(--surface-2)]",
                      )}
                      aria-hidden="true"
                    />
                    <span
                      className={cn(
                        "block h-5 rounded-md",
                        cell.nutritionStatus === "ok"
                          ? "bg-[var(--accent-secondary)]"
                          : cell.nutritionStatus === "part"
                            ? "bg-[color:color-mix(in_srgb,var(--accent-secondary)_35%,var(--surface-2))]"
                            : "bg-[var(--surface-2)]",
                      )}
                      aria-hidden="true"
                    />
                  </span>
                  <span className={cn("text-[11px] font-semibold", isToday ? "text-[var(--accent)]" : "text-[var(--text-subtle)]")}>
                    {weekdayLabel}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-3.5 flex items-center gap-4 text-xs font-semibold text-[var(--text-muted)]">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-[var(--accent)]" aria-hidden="true" />
              Treeni
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-[var(--accent-secondary)]" aria-hidden="true" />
              Ravinto
            </span>
          </div>
        </Card>
      )}

      {view === "overview" && currentUser ? <DayMealsSummary user={currentUser} onOpen={onOpenNutrition} /> : null}

      {view === "measurements" && canTrackOwnMeasurements ? (
        <div ref={measurementsSectionRef} id="overview-measurements" className="scroll-mt-24 space-y-4">
          {/* Osion otsikko + "+ Mittaus" tulevat yläpalkista (useHeaderAction). */}

          {showMeasurementReminderCard ? (
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-left shadow-[0_1px_2px_var(--shadow-soft)] transition hover:border-[var(--border-strong)]"
              onClick={() => {
                clearMeasurementMessage();
                openMeasurementSheet();
              }}
            >
              <span className="size-2.5 shrink-0 rounded-full bg-[var(--success)]" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-[var(--text)]">Viikkomittaus odottaa</span>
                <span className="mt-0.5 block text-sm text-[var(--text-subtle)]">Vie noin 20 sekuntia</span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-[var(--text-subtle)]" aria-hidden="true" />
            </button>
          ) : null}

          <Card>
            <div className="flex items-start justify-between gap-3">
              <p className="font-[family-name:var(--font-display)] text-5xl font-bold leading-none tabular-nums text-[var(--text)]">
                {bodyMetricCurrentValue !== undefined ? bodyMetricCurrentValue : "—"}
                {bodyMetricCurrentValue !== undefined ? (
                  <span className="ml-1.5 text-xl font-semibold text-[var(--text-subtle)]">{bodyMetricUnit}</span>
                ) : null}
              </p>
              {bodyMetricDelta !== null && bodyMetricWeeks !== null ? (
                <span
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1 text-sm font-semibold tabular-nums",
                    bodyMetricDelta <= 0
                      ? "bg-[color-mix(in_srgb,var(--success)_18%,var(--surface))] text-[var(--success)]"
                      : "bg-[var(--surface-2)] text-[var(--text-muted)]",
                  )}
                >
                  {bodyMetricDelta <= 0 ? "−" : "+"}
                  {Math.abs(bodyMetricDelta).toFixed(1)} {bodyMetricUnit} / {bodyMetricWeeks} vko
                </span>
              ) : null}
            </div>
            <div className="mt-4 flex gap-1.5">
              {([
                ["3m", "3 kk"],
                ["1y", "1 v"],
                ["all", "Kaikki"],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={bodyMetricRange === value}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-semibold transition",
                    bodyMetricRange === value
                      ? "bg-[var(--text)] text-[var(--background)]"
                      : "bg-[var(--surface-2)] text-[var(--text-muted)]",
                  )}
                  onClick={() => setBodyMetricRange(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <MetricTrendChart
              points={bodyMetricPoints}
              ariaLabel={`${bodyMetric === "weight" ? "Paino" : "Vyötärö"} kehitystrendi`}
              emptyMessage="Lisää mittauksia, niin kehitys piirtyy tähän."
              helperText="Paina pistettä nähdäksesi yksittäisen mittauksen."
              compactHelperText="Paina pistettä nähdäksesi yksittäisen mittauksen."
              valueLabel={bodyMetric === "weight" ? "Paino" : "Vyötärö"}
              unit={bodyMetricUnit}
              decimals={1}
            />
          </Card>

          <div className="grid grid-cols-2 gap-1 rounded-xl bg-[var(--surface-2)] p-1">
            <button
              type="button"
              className={cn(
                "rounded-lg px-3 py-2.5 text-sm font-semibold transition",
                bodyMetric === "weight"
                  ? "bg-[var(--surface)] text-[var(--text)] shadow-[0_1px_3px_var(--shadow-soft)]"
                  : "text-[var(--text-muted)]",
              )}
              aria-pressed={bodyMetric === "weight"}
              onClick={() => setActiveMeasurementTrend("weight")}
            >
              Paino
            </button>
            <button
              type="button"
              className={cn(
                "rounded-lg px-3 py-2.5 text-sm font-semibold transition",
                bodyMetric === "waist"
                  ? "bg-[var(--surface)] text-[var(--text)] shadow-[0_1px_3px_var(--shadow-soft)]"
                  : "text-[var(--text-muted)]",
              )}
              aria-pressed={bodyMetric === "waist"}
              onClick={() => setActiveMeasurementTrend("waist")}
            >
              Vyötärö
            </button>
          </div>

          <div>
            <p className="px-1 text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-subtle)]">Merkinnät</p>
            <Card className="mt-2">
              {bodyMetricEntries.length > 0 ? (
                <>
                  <div className="divide-y divide-[var(--border)]">
                    {visibleMeasurementEntries.map((entry) => {
                      const value = bodyMetric === "weight" ? entry.weightKg : entry.waistCm;
                      const dateObj = new Date(entry.measuredAt);
                      const weekdayShort = ["Su", "Ma", "Ti", "Ke", "To", "Pe", "La"];
                      const label = Number.isFinite(dateObj.getTime())
                        ? `${weekdayShort[dateObj.getDay()]} ${dateObj.getDate()}.${dateObj.getMonth() + 1}.${dateObj.getFullYear() !== new Date().getFullYear() ? dateObj.getFullYear() : ""}`
                        : formatDate(entry.measuredAt);
                      return (
                        <div key={entry.id} className="flex items-center justify-between gap-3 py-3">
                          <span className="text-sm text-[var(--text-muted)]">{label}</span>
                          <span className="font-[family-name:var(--font-display)] text-base font-bold tabular-nums text-[var(--text)]">
                            {value} {bodyMetricUnit}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {bodyMetricEntries.length > 12 ? (
                    <div className="pt-2">
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-8 px-2 text-xs"
                        onClick={() => setShowAllMeasurementEntries((current) => !current)}
                      >
                        {showAllMeasurementEntries ? "Näytä vähemmän" : `Näytä lisää (${bodyMetricEntries.length - 12})`}
                      </Button>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="py-6 text-center text-sm text-[var(--text-subtle)]">
                  Ei vielä merkintöjä. Lisää ensimmäinen mittaus.
                </p>
              )}
            </Card>
          </div>

          {isMeasurementSheetOpen ? (
              <Sheet
                onClose={closeMeasurementSheet}
                ariaLabel="Uusi mittaus"
              >
                    <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--text)]">Uusi mittaus</h2>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">Täytä vain ne, jotka mittasit tänään.</p>
                    <div className="mt-4 space-y-3">
                      <div>
                        <Label htmlFor="measurement-sheet-weight">Paino (kg)</Label>
                        <Input
                          id="measurement-sheet-weight"
                          type="number"
                          inputMode="decimal"
                          min={20}
                          max={350}
                          step="0.1"
                          placeholder={currentUser?.weightKg !== undefined ? String(currentUser.weightKg) : "Esim. 72.4"}
                          value={measurementDraft.weightKg}
                          onChange={(event) => changeMeasurementWeight(event.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="measurement-sheet-waist">Vyötärö (cm)</Label>
                        <Input
                          id="measurement-sheet-waist"
                          type="number"
                          inputMode="decimal"
                          min={30}
                          max={250}
                          step="0.5"
                          placeholder={latestWaistCm !== undefined ? String(latestWaistCm) : "Esim. 81"}
                          value={measurementDraft.waistCm}
                          onChange={(event) => changeMeasurementWaist(event.target.value)}
                        />
                      </div>
                      {measurementMessage && measurementMessageTone === "error" ? (
                        <p className="text-sm text-[var(--danger)]">{measurementMessage}</p>
                      ) : null}
                      <Button
                        type="button"
                        className="w-full"
                        disabled={measurementDraft.weightKg.trim() === "" && measurementDraft.waistCm.trim() === ""}
                        loading={isSavingMeasurements}
                        loadingText="Tallennetaan..."
                        onClick={() => void handleSaveMeasurement()}
                      >
                        Tallenna
                      </Button>
                    </div>
              </Sheet>
            ) : null}
        </div>
      ) : null}

      {view === "nutrition" && currentUser ? (
        <NutritionView
          user={currentUser}
          readOnly={readOnly}
          onOpenSettings={onOpenSettings}
          onOpenMeasurements={onOpenMeasurements}
        />
      ) : null}

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
            {!isActiveWorkoutLogging ? (
            <>
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
                    clearWorkoutWakeLockError();
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
            </>
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
                isSessionSyncing={pendingStartWorkoutId === selectedWorkout.id && !(selectedSession && selectedSession.setLogs.length > 0)}
                forceReadOnly={readOnly}
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
                  // Estä tuplaklikki sama-tick-tilanteessa (completeWorkout on lisäksi idempotentti).
                  if (completingWorkoutRef.current) {
                    return;
                  }
                  completingWorkoutRef.current = true;
                  const completedWorkoutId = selectedWorkout.id;
                  const completionPercent = progress?.percent ?? 0;
                  setIsCompletingWorkout(true);
                  setPendingWorkoutTransition({ type: "complete" });
                  console.info("[workout-ui] complete-click", { scheduledWorkoutId: completedWorkoutId });

                  // Navigoi Historiaan heti, ennen palvelinkuittausta — muuten
                  // completeWorkout:n optimistinen status="completed" ehtii
                  // renderöidä panelin vanhan completed-näkymän odotuksen ajaksi
                  // (välähdys). Sama kuvio kuin onDelete/onCancel; epäonnistuessa
                  // palataan treeninäkymään.
                  setDismissedActiveWorkoutId(null);
                  setSelectedWorkoutId(null);
                  setHistoryFocusWorkoutId(completedWorkoutId);
                  setCorrectionModeWorkoutId(null);
                  setAthleteLogTab("history");
                  setAthleteLogReturnTab("history");
                  setAthleteLogMode("overview");

                  try {
                    const result = await completeWorkout(completedWorkoutId);
                    console.info("[workout-ui] complete-result", {
                      scheduledWorkoutId: completedWorkoutId,
                      ok: result.ok,
                      message: result.ok ? undefined : result.message,
                    });
                    if (result.ok) {
                      setWorkoutMessage(
                        completionPercent < 100
                          ? `Treeni merkittiin valmiiksi (${completionPercent}% toteutui). Kirjaa muistiinpanoihin, miksi treeni jäi osittaiseksi.`
                          : "Treeni merkittiin valmiiksi.",
                      );
                      notify({ tone: "success", message: "Treeni merkittiin valmiiksi." });
                      window.setTimeout(() => setPendingWorkoutTransition(null), 900);
                      return;
                    }

                    // Lopetus epäonnistui: palaa kesken olevaan treeninäkymään.
                    setPendingWorkoutTransition(null);
                    setHistoryFocusWorkoutId(null);
                    setSelectedWorkoutId(completedWorkoutId);
                    setAthleteLogTab("training");
                    setAthleteLogReturnTab("training");
                    setAthleteLogMode("workout");
                    setWorkoutMessage(result.message);
                    notify({ tone: "danger", message: result.message });
                  } finally {
                    completingWorkoutRef.current = false;
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
            <Segmented
              ariaLabel="Treeninäkymän välilehdet"
              idPrefix="athlete-log-tab"
              value={athleteLogTab}
              onChange={setAthleteLogTab}
              options={[
                { value: "training", label: "Treeni" },
                { value: "history", label: "Historia" },
                { value: "exercises", label: "Liikkeet" },
              ]}
            />

            {athleteLogTab === "exercises" ? (
              <div role="tabpanel" id="athlete-log-panel-exercises" aria-labelledby="athlete-log-tab-exercises">
                <ExerciseProgressView catalog={exerciseProgressCatalog} />
              </div>
            ) : null}

            {athleteLogTab === "training" ? (
            <div role="tabpanel" id="athlete-log-panel-training" aria-labelledby="athlete-log-tab-training">
              {selectionTransitionMessage || pendingWorkoutTransition ? (
                <p className="mb-4 flex items-center gap-3 rounded-2xl bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--text)]">
                  <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent text-[var(--accent)]" />
                  <span>
                    {selectionTransitionMessage
                      ? selectionTransitionMessage
                      : pendingWorkoutTransition?.type === "complete"
                        ? "Tallennetaan treeni ja päivitetään näkymä..."
                        : pendingWorkoutTransition?.type === "cancel"
                          ? "Palataan treenilistaan ja päivitetään keskeytetty tila..."
                          : "Poistetaan treeniä ja päivitetään näkymä..."}
                  </span>
                </p>
              ) : null}

              {athletePrograms.length ? (
                (() => {
                  const weekdayShort = ["Su", "Ma", "Ti", "Ke", "To", "Pe", "La"];
                  const weekStart = new Date();
                  weekStart.setHours(0, 0, 0, 0);
                  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
                  return athletePrograms.map((program) => {
                    const workouts = program.workouts ?? [];
                    const nextWorkoutId = workouts.find((workout) => {
                      const completion = currentUser
                        ? getLatestWorkoutCompletionDate(state, currentUser.id, { programWorkoutId: workout.id })
                        : undefined;
                      const doneThisWeek = completion ? new Date(completion) >= weekStart : false;
                      const active = activeScheduledByProgramWorkoutKey.get(`${program.id}::${workout.id}`);
                      return !doneThisWeek && !active;
                    })?.id;
                    return (
                      <div key={program.id} className="mb-4">
                        <div className="flex flex-wrap items-baseline justify-between px-1">
                          <p className="font-[family-name:var(--font-display)] text-xs font-semibold uppercase tracking-[0.05em] text-[var(--text-subtle)]">
                            {program.title}
                            {program.weekCount ? ` · ${program.weekCount} vk` : ""}
                          </p>
                          {weeklyInsights.targetCount > 0 ? (
                            <p className="font-[family-name:var(--font-display)] text-xs font-semibold tabular-nums text-[var(--text-subtle)]">
                              {weeklyInsights.completedCount}/{weeklyInsights.targetCount} tällä viikolla
                            </p>
                          ) : null}
                        </div>
                        <Card className="mt-2">
                          <div className="divide-y divide-[var(--border)]">
                            {workouts.map((workout) => {
                              const setCount = workout.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
                              const estMin = Math.max(15, Math.round(setCount * 3.5));
                              const activeScheduled = activeScheduledByProgramWorkoutKey.get(`${program.id}::${workout.id}`);
                              const activeScheduledStatus = activeScheduled ? resolveWorkoutStatus(activeScheduled) : undefined;
                              const activeScheduledId = activeScheduledStatus === "in_progress" ? activeScheduled?.id : undefined;
                              const resumableScheduledId =
                                activeScheduled && activeScheduledStatus === "cancelled" && scheduledWithSessionIds.has(activeScheduled.id)
                                  ? activeScheduled.id
                                  : undefined;
                              const completion = currentUser
                                ? getLatestWorkoutCompletionDate(state, currentUser.id, { programWorkoutId: workout.id })
                                : undefined;
                              const doneThisWeek = completion ? new Date(completion) >= weekStart : false;
                              const doneWeekday = doneThisWeek && completion ? weekdayShort[new Date(completion).getDay()] : null;
                              const isActiveRow = Boolean(activeScheduledId || resumableScheduledId);
                              const isNext = workout.id === nextWorkoutId;
                              const isLockedByAnotherWorkout = Boolean(blockingWorkout && blockingWorkout.programWorkoutId !== workout.id);

                              return (
                                <div key={workout.id} className="flex items-center gap-3 py-3">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="truncate font-semibold text-[var(--text)]">{workout.name}</span>
                                      {isActiveRow ? (
                                        <span className="shrink-0 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--accent)]">Kesken</span>
                                      ) : isNext && !doneThisWeek ? (
                                        <span className="shrink-0 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--accent)]">Seuraava</span>
                                      ) : null}
                                    </div>
                                    <p className="mt-0.5 text-xs text-[var(--text-subtle)]">
                                      {workout.exercises.length} liikettä · ~{estMin} min{doneWeekday ? ` · Tehty ${doneWeekday}` : ""}
                                    </p>
                                  </div>
                                  <div className="flex shrink-0 items-center gap-2">
                                    <button
                                      type="button"
                                      aria-label={`Näytä treenin ${workout.name} liikkeet`}
                                      title="Näytä liikkeet"
                                      className="grid size-9 place-items-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text-subtle)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
                                      onClick={() => setPreviewProgramWorkout(workout)}
                                    >
                                      <Info className="size-4" aria-hidden="true" />
                                    </button>
                                    {doneThisWeek && !isActiveRow ? (
                                      <Check className="size-5 shrink-0 text-[var(--success)]" aria-label="Tehty tällä viikolla" />
                                    ) : readOnly ? (
                                      <span className="shrink-0 rounded-full bg-[var(--surface-2)] px-2.5 py-0.5 text-xs font-semibold text-[var(--text-muted)]">Tulossa</span>
                                    ) : activeScheduledId ? (
                                      <Button type="button" variant="primary" className="h-9 shrink-0 px-4 text-sm" onClick={() => openWorkoutView(activeScheduledId)}>
                                        Jatka
                                      </Button>
                                    ) : (
                                      <Button
                                        type="button"
                                        variant={isNext || resumableScheduledId ? "primary" : "secondary"}
                                        className="h-9 shrink-0 px-4 text-sm"
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
                                          void startWorkoutFromProgram(program.id, workout.id, workout.name, `program-${program.id}-workout-${workout.id}`);
                                        }}
                                      >
                                        {resumableScheduledId ? "Jatka" : "Aloita"}
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </Card>
                      </div>
                    );
                  });
                })()
              ) : (
                <Card>
                  <p className="text-sm text-[var(--text-muted)]">
                    Sinulle ei ole vielä luotu ohjelmia. Pyydä valmentajaa lisäämään ensimmäinen ohjelma.
                  </p>
                </Card>
              )}

              {!readOnly ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="mt-1 w-full gap-2"
                  onClick={openExtraActivityDialog}
                >
                  <Plus className="size-4" aria-hidden="true" />
                  Lisää extra-treeni
                </Button>
              ) : null}

              {!readOnly && canManageOwnPrograms(currentUser?.role) && onOpenProgramEditor ? (
                <Button type="button" variant="ghost" className="mt-2 w-full" onClick={onOpenProgramEditor}>
                  Muokkaa ohjelmaa
                </Button>
              ) : null}

              {!readOnly ? (
                <p className="mt-3 px-1 text-sm text-[var(--text-subtle)]">
                  Sarjapainot esitäytetään viime kerrasta — tavoitteena voittaa ne.
                </p>
              ) : null}
            </div>
            ) : null}

            {athleteLogTab === "history" ? (
            <div ref={historySectionRef} role="tabpanel" id="athlete-log-panel-history" aria-labelledby="athlete-log-tab-history" className="space-y-4">
                {workoutHistory.length === 0 ? (
                  <p className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--text-muted)]">
                    Historia on vielä tyhjä. Käynnistä ensimmäinen treeni ohjelmakorteista.
                  </p>
                ) : (
                  <Card className="mt-1">
                    <div className="divide-y divide-[var(--border)]">
                      {workoutHistory.map((workout) => {
                        const insight = workoutInsights.get(workout.id);
                        const session = sessionByWorkoutId.get(workout.id);
                        const status = resolveWorkoutStatus(workout);
                        const completedAt =
                          workout.completedAt ??
                          session?.completedAt ??
                          getWorkoutOrderMetadata(workout).primaryTimestamp ??
                          workout.scheduledDate;
                        const title = workoutHistoryTitles.get(workout.id)?.title ?? normalizeWorkoutHistoryTitle(workout.title);
                        const bestSet = insight?.bestSet ?? null;
                        const durationSeconds = insight?.durationSeconds ?? 0;
                        const liftedKg = insight?.liftedKg ?? 0;
                        const canResume = status === "cancelled" && scheduledWithSessionIds.has(workout.id);
                        const canDelete = Boolean(workout.programWorkoutId);
                        const expanded = expandedHistoryGroups[workout.id] ?? false;
                        const weekdayShort = ["Su", "Ma", "Ti", "Ke", "To", "Pe", "La"];
                        const dateObj = new Date(completedAt);
                        const shortDate = Number.isFinite(dateObj.getTime())
                          ? `${weekdayShort[dateObj.getDay()]} ${dateObj.getDate()}.${dateObj.getMonth() + 1}.`
                          : formatDateWithWeekday(completedAt);
                        const exerciseGroups: Array<{
                          name: string;
                          target: string;
                          sets: Array<{ load: number; reps: number; missed: boolean }>;
                        }> = [];
                        (session?.setLogs ?? [])
                          .filter((log) => log.done)
                          .forEach((log) => {
                            const name = log.exerciseName?.trim() || "Liike";
                            const repMin = log.targetRepsMin ?? log.targetReps;
                            const repMax = log.targetRepsMax ?? log.targetReps;
                            const repsLabel =
                              repMin !== undefined && repMax !== undefined && repMax > repMin
                                ? `${repMin}-${repMax}`
                                : `${repMin ?? log.targetReps ?? ""}`;
                            const missed =
                              repMin !== undefined && log.actualReps !== undefined && log.actualReps !== null && log.actualReps < repMin;
                            const group = exerciseGroups.find((item) => item.name === name);
                            const entry = { load: log.actualLoad ?? 0, reps: log.actualReps ?? 0, missed: Boolean(missed) };
                            if (group) {
                              group.sets.push(entry);
                            } else {
                              exerciseGroups.push({ name, target: repsLabel, sets: [entry] });
                            }
                          });
                        const hasMissedSet = exerciseGroups.some((group) => group.sets.some((set) => set.missed));
                        const workoutNote = session
                          ? state.notes.find((note) => note.sessionId === session.id)?.body?.trim() ?? ""
                          : "";

                        return (
                          <div key={workout.id} className="py-3">
                            <button
                              type="button"
                              className="flex w-full items-center gap-3 text-left"
                              aria-expanded={expanded}
                              onClick={() => toggleHistoryGroup(workout.id, !expanded)}
                            >
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-2">
                                  <span className="truncate font-semibold text-[var(--text)]">{title}</span>
                                  {status !== "completed" ? (
                                    <Badge className={statusTone(status)}>{workoutStatusLabel(status)}</Badge>
                                  ) : null}
                                </span>
                                <span className="mt-0.5 block text-xs text-[var(--text-subtle)]">
                                  {shortDate} · {Math.round(durationSeconds / 60)} min
                                </span>
                              </span>
                              {bestSet ? (
                                <span className="shrink-0 rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-xs font-semibold tabular-nums text-[var(--text-muted)]">
                                  {bestSet.exerciseName.split(" ")[0]} {formatLoadValue(bestSet.load)} kg × {bestSet.reps}
                                </span>
                              ) : null}
                            </button>

                            {expanded ? (
                              historyEditDraft?.workoutId === workout.id ? (
                                <div className="mt-3 space-y-3">
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="text-sm font-semibold text-[var(--text)]">Kesto (min)</span>
                                    <div className="flex items-center overflow-hidden rounded-xl bg-[var(--surface-2)]">
                                      <button
                                        type="button"
                                        className="grid h-9 w-10 place-items-center text-[var(--text)]"
                                        aria-label="Vähennä kestoa"
                                        onClick={() => setHistoryEditDraft((draft) => (draft ? { ...draft, durationMin: Math.max(1, draft.durationMin - 1) } : draft))}
                                      >
                                        −
                                      </button>
                                      <span className="min-w-10 text-center font-[family-name:var(--font-display)] text-base font-bold tabular-nums text-[var(--text)]">
                                        {historyEditDraft.durationMin}
                                      </span>
                                      <button
                                        type="button"
                                        className="grid h-9 w-10 place-items-center text-[var(--text)]"
                                        aria-label="Lisää kestoa"
                                        onClick={() => setHistoryEditDraft((draft) => (draft ? { ...draft, durationMin: Math.min(240, draft.durationMin + 1) } : draft))}
                                      >
                                        +
                                      </button>
                                    </div>
                                  </div>
                                  {historyEditDraft.exercises.map((exercise, exIndex) => (
                                    <div key={exercise.name}>
                                      <div className="flex items-baseline justify-between gap-2">
                                        <p className="text-sm font-semibold text-[var(--text)]">{exercise.name}</p>
                                        <p className="shrink-0 font-[family-name:var(--font-display)] text-xs font-semibold tabular-nums text-[var(--text-subtle)]">
                                          {exercise.sets.length} × {exercise.target}
                                        </p>
                                      </div>
                                      <div className="mt-1.5 space-y-2">
                                        {exercise.sets.map((set, setIndex) => {
                                          const missedReps = set.targetMin !== undefined && set.reps < set.targetMin;
                                          return (
                                            <div key={set.logId} className="grid grid-cols-[1.5rem_1fr_0.75rem_1fr] items-center gap-2">
                                              <span className="font-[family-name:var(--font-display)] text-sm font-semibold text-[var(--text-subtle)]">{setIndex + 1}</span>
                                              <DragNumber
                                                value={set.load}
                                                step={2.5}
                                                ariaLabel={`${exercise.name} sarja ${setIndex + 1} paino`}
                                                onChange={(next) =>
                                                  setHistoryEditDraft((draft) =>
                                                    draft
                                                      ? {
                                                          ...draft,
                                                          exercises: draft.exercises.map((ex, i) =>
                                                            i === exIndex
                                                              ? { ...ex, sets: ex.sets.map((s, j) => (j === setIndex ? { ...s, load: next } : s)) }
                                                              : ex,
                                                          ),
                                                        }
                                                      : draft,
                                                  )
                                                }
                                              />
                                              <span className="text-center text-sm text-[var(--text-subtle)]">×</span>
                                              <DragNumber
                                                value={set.reps}
                                                step={1}
                                                tone={missedReps ? "warn" : undefined}
                                                ariaLabel={`${exercise.name} sarja ${setIndex + 1} toistot`}
                                                onChange={(next) =>
                                                  setHistoryEditDraft((draft) =>
                                                    draft
                                                      ? {
                                                          ...draft,
                                                          exercises: draft.exercises.map((ex, i) =>
                                                            i === exIndex
                                                              ? { ...ex, sets: ex.sets.map((s, j) => (j === setIndex ? { ...s, reps: next } : s)) }
                                                              : ex,
                                                          ),
                                                        }
                                                      : draft,
                                                  )
                                                }
                                              />
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  ))}
                                  <div className="flex gap-2 pt-1">
                                    <Button type="button" variant="secondary" className="px-4" onClick={() => setHistoryEditDraft(null)}>
                                      Peruuta
                                    </Button>
                                    <Button
                                      type="button"
                                      className="flex-1"
                                      loading={isSavingHistoryEdit}
                                      loadingText="Tallennetaan..."
                                      onClick={() => void saveHistoryEdit()}
                                    >
                                      Tallenna muutokset
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                              <div className="mt-3">
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="rounded-xl bg-[var(--surface-2)] px-3 py-2.5">
                                    <p className="font-[family-name:var(--font-display)] text-lg font-bold tabular-nums text-[var(--text)]">
                                      {formatLiftedKgValue(liftedKg)}
                                    </p>
                                    <p className="text-[11px] font-semibold text-[var(--text-subtle)]">Volyymi</p>
                                  </div>
                                  <div className="rounded-xl bg-[var(--surface-2)] px-3 py-2.5">
                                    <p className="font-[family-name:var(--font-display)] text-lg font-bold tabular-nums text-[var(--text)]">
                                      {Math.round(durationSeconds / 60)} min
                                    </p>
                                    <p className="text-[11px] font-semibold text-[var(--text-subtle)]">Kesto</p>
                                  </div>
                                </div>
                                {exerciseGroups.length > 0 ? (
                                  <div className="mt-3 space-y-2.5">
                                    {exerciseGroups.map((group) => (
                                      <div key={group.name}>
                                        <div className="flex items-baseline justify-between gap-2">
                                          <p className="text-sm font-semibold text-[var(--text)]">{group.name}</p>
                                          <p className="shrink-0 font-[family-name:var(--font-display)] text-xs font-semibold tabular-nums text-[var(--text-subtle)]">
                                            {group.sets.length} × {group.target}
                                          </p>
                                        </div>
                                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                                          {group.sets.map((set, index) => (
                                            <span
                                              key={index}
                                              className={cn(
                                                "rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums",
                                                set.missed
                                                  ? "bg-[color:color-mix(in_srgb,var(--warning)_16%,var(--surface))] text-[var(--warning)]"
                                                  : "bg-[var(--surface-2)] text-[var(--text-muted)]",
                                              )}
                                            >
                                              {formatLoadValue(set.load)}×{set.reps}
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    ))}
                                    {hasMissedSet ? (
                                      <p className="text-xs text-[var(--text-subtle)]">Korostettu sarja jäi tavoitetoistoista.</p>
                                    ) : null}
                                  </div>
                                ) : null}
                                {workoutNote ? (
                                  <div className="mt-3 rounded-xl bg-[var(--surface-2)] px-3 py-2.5">
                                    <p className="text-[11px] font-semibold text-[var(--text-subtle)]">Muistiinpano</p>
                                    <p className="mt-1 whitespace-pre-line text-sm text-[var(--text-muted)]">{workoutNote}</p>
                                  </div>
                                ) : null}
                                {!readOnly ? (
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {canResume ? (
                                      <Button
                                        type="button"
                                        variant="secondary"
                                        className="h-9 px-3 text-sm"
                                        onClick={() => void openOrResumeWorkout(workout.id, `history-${workout.id}`, { returnTab: "history" })}
                                      >
                                        Jatka treeniä
                                      </Button>
                                    ) : (
                                      <Button
                                        type="button"
                                        variant="secondary"
                                        className="h-9 px-3 text-sm"
                                        onClick={() => startHistoryEdit(workout.id)}
                                      >
                                        Muokkaa
                                      </Button>
                                    )}
                                    {canDelete ? (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        className="h-9 gap-1.5 px-3 text-sm text-[var(--danger)]"
                                        onClick={async () => {
                                          const confirmed = window.confirm(`Poistetaanko ${title} (${shortDate})? Toimintoa ei voi kumota.`);
                                          if (!confirmed) {
                                            return;
                                          }
                                          const result = await deleteWorkout(workout.id);
                                          setWorkoutMessage(result.ok ? "Treeni poistettiin historiasta." : result.message);
                                        }}
                                      >
                                        <Trash2 className="size-4" aria-hidden="true" />
                                        Poista merkintä
                                      </Button>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                              )
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                )}
                <div className="mt-6">
                  <p className="text-sm font-semibold text-[var(--text)]">Extra-treenien historia</p>
                  {extraActivities.length === 0 ? (
                    <p className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--text-muted)]">
                      Ei extra-treenejä vielä.
                    </p>
                  ) : (
                    <Card className="mt-2">
                      <div className="divide-y divide-[var(--border)]">
                        {visibleExtraActivities.map((activity) => {
                          const expanded = expandedHistoryGroups[`extra-${activity.id}`] ?? false;
                          const label = extraActivityCatalog[activity.activityType].label;
                          const weekdayShort = ["Su", "Ma", "Ti", "Ke", "To", "Pe", "La"];
                          const dateObj = new Date(activity.occurredAt);
                          const shortDate = Number.isFinite(dateObj.getTime())
                            ? `${weekdayShort[dateObj.getDay()]} ${dateObj.getDate()}.${dateObj.getMonth() + 1}.`
                            : formatDateWithWeekday(activity.occurredAt);
                          const editing = extraEditDraft?.activityId === activity.id;
                          return (
                            <div key={activity.id} className="py-3">
                              <button
                                type="button"
                                className="flex w-full items-center gap-3 text-left"
                                aria-expanded={expanded}
                                onClick={() => toggleHistoryGroup(`extra-${activity.id}`, !expanded)}
                              >
                                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[color:color-mix(in_srgb,var(--accent)_13%,var(--surface))] text-[var(--accent)]">
                                  {renderCalendarActivityIcon(activity.activityType)}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="truncate font-semibold text-[var(--text)]">{label}</span>
                                  <span className="mt-0.5 block text-xs text-[var(--text-subtle)]">
                                    {shortDate} · {activity.durationMinutes} min
                                  </span>
                                </span>
                                <span className="shrink-0 rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-xs font-semibold tabular-nums text-[var(--text-muted)]">
                                  {activity.estimatedKcal} kcal
                                </span>
                              </button>

                              {expanded ? (
                                editing && extraEditDraft ? (
                                  <div className="mt-3 space-y-3">
                                    <div>
                                      <Label htmlFor={`extra-edit-type-${activity.id}`} className="text-xs">Laji</Label>
                                      <Select
                                        id={`extra-edit-type-${activity.id}`}
                                        value={extraEditDraft.activityType}
                                        onChange={(event) =>
                                          setExtraEditDraft((draft) => (draft ? { ...draft, activityType: event.target.value as ExtraActivityType } : draft))
                                        }
                                      >
                                        {Object.entries(extraActivityCatalog).map(([key, value]) => (
                                          <option key={key} value={key}>
                                            {value.label}
                                          </option>
                                        ))}
                                      </Select>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                      <span className="text-sm font-semibold text-[var(--text)]">Kesto (min)</span>
                                      <div className="flex items-center overflow-hidden rounded-xl bg-[var(--surface-2)]">
                                        <button
                                          type="button"
                                          className="grid h-9 w-10 place-items-center text-[var(--text)]"
                                          aria-label="Vähennä kestoa"
                                          onClick={() => setExtraEditDraft((draft) => (draft ? { ...draft, durationMin: Math.max(1, draft.durationMin - 5) } : draft))}
                                        >
                                          −
                                        </button>
                                        <span className="min-w-10 text-center font-[family-name:var(--font-display)] text-base font-bold tabular-nums text-[var(--text)]">
                                          {extraEditDraft.durationMin}
                                        </span>
                                        <button
                                          type="button"
                                          className="grid h-9 w-10 place-items-center text-[var(--text)]"
                                          aria-label="Lisää kestoa"
                                          onClick={() => setExtraEditDraft((draft) => (draft ? { ...draft, durationMin: Math.min(600, draft.durationMin + 5) } : draft))}
                                        >
                                          +
                                        </button>
                                      </div>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                      <span className="text-sm font-semibold text-[var(--text)]">Kalorit (kcal)</span>
                                      <DragNumber
                                        value={extraEditDraft.kcal}
                                        step={10}
                                        ariaLabel="Extra-treenin kalorit"
                                        onChange={(next) => setExtraEditDraft((draft) => (draft ? { ...draft, kcal: next } : draft))}
                                      />
                                    </div>
                                    <div>
                                      <Label htmlFor={`extra-edit-date-${activity.id}`} className="text-xs">Päivä</Label>
                                      <Input
                                        id={`extra-edit-date-${activity.id}`}
                                        type="date"
                                        value={extraEditDraft.occurredDate}
                                        onChange={(event) =>
                                          setExtraEditDraft((draft) => (draft ? { ...draft, occurredDate: event.target.value } : draft))
                                        }
                                      />
                                    </div>
                                    <div>
                                      <Label htmlFor={`extra-edit-notes-${activity.id}`} className="text-xs">Muistiinpano (valinnainen)</Label>
                                      <Textarea
                                        id={`extra-edit-notes-${activity.id}`}
                                        rows={2}
                                        value={extraEditDraft.notes}
                                        onChange={(event) =>
                                          setExtraEditDraft((draft) => (draft ? { ...draft, notes: event.target.value } : draft))
                                        }
                                      />
                                    </div>
                                    <div className="flex gap-2 pt-1">
                                      <Button type="button" variant="secondary" className="px-4" onClick={() => setExtraEditDraft(null)}>
                                        Peruuta
                                      </Button>
                                      <Button
                                        type="button"
                                        className="flex-1"
                                        loading={isSavingExtraEdit}
                                        loadingText="Tallennetaan..."
                                        onClick={() => void saveExtraEdit()}
                                      >
                                        Tallenna muutokset
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="mt-3">
                                    <div className="grid grid-cols-2 gap-3">
                                      <div className="rounded-xl bg-[var(--surface-2)] px-3 py-2.5">
                                        <p className="font-[family-name:var(--font-display)] text-lg font-bold tabular-nums text-[var(--text)]">
                                          {activity.durationMinutes} min
                                        </p>
                                        <p className="text-[11px] font-semibold text-[var(--text-subtle)]">Kesto</p>
                                      </div>
                                      <div className="rounded-xl bg-[var(--surface-2)] px-3 py-2.5">
                                        <p className="font-[family-name:var(--font-display)] text-lg font-bold tabular-nums text-[var(--text)]">
                                          {activity.estimatedKcal} kcal
                                        </p>
                                        <p className="text-[11px] font-semibold text-[var(--text-subtle)]">Energia</p>
                                      </div>
                                    </div>
                                    {activity.notes ? (
                                      <p className="mt-3 text-sm text-[var(--text-muted)]">{activity.notes}</p>
                                    ) : null}
                                    {!readOnly ? (
                                      <div className="mt-3 flex flex-wrap gap-2">
                                        <Button
                                          type="button"
                                          variant="secondary"
                                          className="h-9 px-3 text-sm"
                                          onClick={() => startExtraEdit(activity)}
                                        >
                                          Muokkaa
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          className="h-9 gap-1.5 px-3 text-sm text-[var(--danger)]"
                                          onClick={async () => {
                                            const confirmed = window.confirm(
                                              `Poistetaanko extra-treeni "${label}" päivältä ${formatDateWithWeekday(activity.occurredAt)}? Toimintoa ei voi kumota.`,
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
                                          Poista merkintä
                                        </Button>
                                      </div>
                                    ) : null}
                                  </div>
                                )
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                      {extraActivities.length > 5 ? (
                        <div className="pt-2">
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
                    </Card>
                  )}
                </div>
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
      {previewProgramWorkout ? (
        <ProgramWorkoutPreviewDialog
          workout={previewProgramWorkout}
          onClose={() => setPreviewProgramWorkout(null)}
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
          saving={isSavingExtraActivity}
          onChangeActivityType={setExtraActivityType}
          onChangeDurationMinutes={setExtraActivityDurationMinutes}
          onChangeOccurredDate={setExtraActivityDate}
          onChangeNotes={setExtraActivityNotes}
          onToggleManualKcal={setIsManualExtraActivityKcalEnabled}
          onChangeManualKcal={setManualExtraActivityKcal}
          onClose={closeExtraActivityDialog}
          onSave={submitExtraActivity}
        />
      ) : null}
    </div>
  );
}


