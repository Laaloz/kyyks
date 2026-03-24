"use client";

import { Check, ChevronDown, ChevronUp, MoreHorizontal } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/field";
import { InfoTooltip } from "@/components/ui/tooltip";
import { numberOrUndefined } from "@/components/workout/schemas";
import { workoutStatusLabel } from "@/components/workout/shared";
import type { WorkoutSession } from "@/lib/types";
import { formatDate } from "@/lib/utils";

type PreviousExerciseResult = {
  actualReps?: number;
  actualLoad?: number;
  rpe?: number;
  completedAt: string;
  timesCompleted: number;
};

type ExerciseGroup = {
  key: string;
  exerciseName: string;
  supersetGroup?: string;
  logs: WorkoutSession["setLogs"];
};

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

function formatExerciseTargetSummary(logs: WorkoutSession["setLogs"]) {
  if (!logs.length) {
    return "";
  }

  const repTargets = Array.from(new Set(logs.map((log) => formatTargetReps(log))));
  const targetLoads = logs
    .map((log) => log.targetLoad)
    .filter((value): value is number => value !== undefined);
  const restTargets = logs
    .map((log) => log.targetRestSeconds)
    .filter((value): value is number => value !== undefined);

  const parts = [`${logs.length} sarjaa`];

  parts.push(
    repTargets.length === 1
      ? `${repTargets[0]} toistoa`
      : "sarjakohtaiset toistot",
  );

  if (targetLoads.length > 0) {
    const uniqueLoads = Array.from(new Set(targetLoads));
    parts.push(uniqueLoads.length === 1 ? `${uniqueLoads[0]} kg` : "sarjakohtainen kuorma");
  }

  if (restTargets.length > 0) {
    const uniqueRests = Array.from(new Set(restTargets));
    parts.push(uniqueRests.length === 1 ? `lepo ${formatDuration(uniqueRests[0])}` : "sarjakohtainen lepo");
  }

  return parts.join(" · ");
}

export function AthleteSessionPanel({
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
  initialCorrectionMode,
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
  initialCorrectionMode: boolean;
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
  const [isSecondaryActionsOpen, setIsSecondaryActionsOpen] = useState(false);
  const [secondaryActionsAnchorRect, setSecondaryActionsAnchorRect] = useState<AnchorRect | null>(null);
  const [secondaryActionsMenuStyle, setSecondaryActionsMenuStyle] = useState<CSSProperties | null>(null);
  const secondaryActionsMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setLocalNote(note);
  }, [note, scheduledWorkoutId]);

  useEffect(() => {
    setCorrectionMode(initialCorrectionMode && status === "completed");
  }, [initialCorrectionMode, status]);

  useEffect(() => {
    setIsSecondaryActionsOpen(false);
    setSecondaryActionsAnchorRect(null);
    setSecondaryActionsMenuStyle(null);
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

  useEffect(() => {
    if (status !== "in_progress") {
      setRestRunning(false);
    }
  }, [status]);

  useEffect(() => {
    if (!isSecondaryActionsOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-session-actions-menu-root='true']")) {
        return;
      }

      setIsSecondaryActionsOpen(false);
      setSecondaryActionsAnchorRect(null);
      setSecondaryActionsMenuStyle(null);
    };

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [isSecondaryActionsOpen]);

  useLayoutEffect(() => {
    if (!isSecondaryActionsOpen || !secondaryActionsAnchorRect || !secondaryActionsMenuRef.current) {
      return;
    }

    setSecondaryActionsMenuStyle(
      getFloatingMenuStyle(secondaryActionsAnchorRect, secondaryActionsMenuRef.current),
    );
  }, [isSecondaryActionsOpen, secondaryActionsAnchorRect]);

  useEffect(() => {
    if (!isSecondaryActionsOpen) {
      return;
    }

    const syncSecondaryActionsPosition = () => {
      const trigger = document.querySelector<HTMLElement>("[data-session-actions-trigger='true']");
      if (!trigger) {
        setIsSecondaryActionsOpen(false);
        setSecondaryActionsAnchorRect(null);
        setSecondaryActionsMenuStyle(null);
        return;
      }

      setSecondaryActionsAnchorRect(toAnchorRect(trigger.getBoundingClientRect()));
    };

    window.addEventListener("resize", syncSecondaryActionsPosition);
    window.addEventListener("scroll", syncSecondaryActionsPosition, true);
    return () => {
      window.removeEventListener("resize", syncSecondaryActionsPosition);
      window.removeEventListener("scroll", syncSecondaryActionsPosition, true);
    };
  }, [isSecondaryActionsOpen]);

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
  };

  const handleDoneUpdate = (log: WorkoutSession["setLogs"][number], nextDone: boolean) => {
    onUpdate(log.id, { done: nextDone });

    if (!nextDone) {
      skipRestTimer();
      return;
    }

    startRestTimer(log.targetRestSeconds ?? 180, log.templateExerciseId, log.exerciseName, log.supersetGroup);
  };

  const readOnly = status === "completed" && !correctionMode;
  const showCancelAction = status === "in_progress";
  const showResumeAction = status === "cancelled";
  const showDeleteAction = canDeleteWorkout;
  const showBottomBackToList = status !== "in_progress";
  const hasSecondaryActions = showResumeAction || showCancelAction || showDeleteAction;
  const toggleSecondaryActionsMenu = (anchor: HTMLButtonElement) => {
    if (isSecondaryActionsOpen) {
      setIsSecondaryActionsOpen(false);
      setSecondaryActionsAnchorRect(null);
      setSecondaryActionsMenuStyle(null);
      return;
    }

    setSecondaryActionsAnchorRect(toAnchorRect(anchor.getBoundingClientRect()));
    setIsSecondaryActionsOpen(true);
  };

  const renderExerciseGroupCard = (group: ExerciseGroup) => {
    const exerciseKey = group.key;
    const safeExerciseKey = exerciseKey.replace(/[^a-zA-Z0-9_-]/g, "-");
    const disclosureButtonId = `${scheduledWorkoutId}-${safeExerciseKey}-toggle`;
    const disclosurePanelId = `${scheduledWorkoutId}-${safeExerciseKey}-panel`;
    const exerciseName = group.exerciseName;
    const logs = group.logs;
    const supersetGroup = group.supersetGroup;
    const completedInExercise = logs.filter((log) => log.done).length;
    const isComplete = completedInExercise === logs.length && logs.length > 0;
    const isStarted = completedInExercise > 0 && !isComplete;
    const targetSummary = formatExerciseTargetSummary(logs);
    const previous = previousExerciseResults.get(logs[0]?.exerciseId ?? "");
    const isExpanded = getIsExpanded(group);
    const cardToneClass = isComplete
      ? "border-[var(--success)] bg-[var(--surface)] shadow-[0_10px_26px_-20px_var(--success)]"
      : isStarted
        ? "border-[var(--accent)] bg-[var(--surface)] shadow-[0_10px_26px_-20px_var(--accent)]"
        : supersetGroup
          ? "border-[var(--accent)]/60 bg-[var(--surface-2)] shadow-[0_10px_26px_-20px_var(--accent)]"
          : "border-[var(--border)] bg-[var(--surface-2)]";
    const progressBadgeClass = isComplete
      ? "border-[var(--success)] bg-[var(--surface)] text-[var(--success)]"
      : isStarted
        ? "border-[var(--accent)] bg-[var(--surface)] text-[var(--accent)]"
        : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-subtle)]";
    const indicatorClass = isComplete
      ? "bg-[var(--success)]"
      : isStarted
        ? "bg-[var(--accent)]"
        : "bg-[var(--border)]";
    const chevronClass = isComplete
      ? "border-[color-mix(in_srgb,var(--success)_35%,var(--border))] bg-[color-mix(in_srgb,var(--success)_12%,var(--surface))] text-[var(--success)] group-hover:border-[color-mix(in_srgb,var(--success)_45%,var(--border))] group-hover:bg-[color-mix(in_srgb,var(--success)_16%,var(--surface))]"
      : isStarted
        ? "border-[color-mix(in_srgb,var(--accent)_30%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))] text-[var(--accent)] group-hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--border))] group-hover:bg-[color-mix(in_srgb,var(--accent)_14%,var(--surface))]"
        : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-subtle)] group-hover:border-[var(--border-strong)] group-hover:bg-[var(--surface-3)] group-hover:text-[var(--text)]";
    return (
      <div
        key={exerciseKey}
        className={`rounded-[1.35rem] border p-3.5 md:p-4.5 ${cardToneClass}`}
      >
        <div className="flex items-start gap-2">
          <Button
            type="button"
            variant="ghost"
            className="group flex min-w-0 flex-1 flex-col items-stretch gap-3 rounded-[1.1rem] border border-[var(--border)] bg-[var(--surface)]/88 px-3.5 py-3 text-left text-inherit shadow-[0_8px_22px_-18px_var(--shadow)] hover:border-[var(--border-strong)] hover:bg-[var(--surface)] sm:flex-row sm:items-start sm:justify-between sm:gap-4"
            id={disclosureButtonId}
            aria-expanded={isExpanded}
            aria-controls={disclosurePanelId}
            onClick={() => setGroupExpansion(group)}
          >
            <span className="min-w-0 sm:flex-1">
              <span className="flex items-center gap-2">
                <span className={`size-2.5 rounded-full ${indicatorClass}`} aria-hidden="true" />
                <span className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">
                  {supersetGroup ? `Superset ${supersetGroup}` : "Liike"}
                </span>
              </span>
              <span className="mt-1 block font-[family-name:var(--font-display)] text-base font-semibold leading-tight text-[var(--text)] md:text-[1.05rem]">
                {exerciseName}
              </span>
              <span className="mt-2 inline-flex max-w-full rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-[11px] font-medium text-[var(--text-subtle)]">
                <span className="truncate">{targetSummary}</span>
              </span>
              {status === "completed" && previous ? (
                <span className="mt-1 block text-xs text-[var(--text-subtle)]">
                  Tehty {previous.timesCompleted} kertaa · viimeksi {formatDate(previous.completedAt)} · {formatPreviousExerciseResult(previous)}
                </span>
              ) : null}
            </span>

            <span className="flex min-w-0 items-center justify-between gap-2 sm:ml-3 sm:w-auto sm:shrink-0 sm:justify-end">
              <Badge className={`min-w-0 ${progressBadgeClass}`}>{completedInExercise}/{logs.length} sarjaa tehty</Badge>
              <span className={`grid size-9 place-items-center rounded-full border transition ${chevronClass}`}>
                {isExpanded ? (
                  <ChevronUp className="size-4" aria-hidden="true" />
                ) : (
                  <ChevronDown className="size-4" aria-hidden="true" />
                )}
              </span>
            </span>
          </Button>
        </div>
        {isExpanded ? (
          <div
            id={disclosurePanelId}
            role="region"
            aria-labelledby={disclosureButtonId}
            className="mt-2 md:mt-3"
          >
            <div className="rounded-[1.15rem] border border-[var(--border)] bg-[var(--surface)]">
              <div className="relative z-10 grid grid-cols-[2.8rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)_2.8rem] items-center gap-2 rounded-t-[1.15rem] border-b border-[var(--border)] bg-[var(--surface-3)]/75 px-2.5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-[var(--text-subtle)] md:grid-cols-[0.82fr_1fr_1fr_0.9fr_auto] md:px-3.5">
                <span>Sarja</span>
                <span>Toistot</span>
                <span>Kuorma</span>
                <span className="inline-flex items-center gap-1">
                  RPE
                  <InfoTooltip text="RPE kertoo, kuinka raskaalta sarja tuntui asteikolla 1-10. Lisätoistot tarkoittavat arviota siitä, montako toistoa olisi vielä ollut varaa tehdä hyvällä tekniikalla (ei tehdä niitä heti). 10 = 0 toistoa varaa, 9 = noin 1 toisto varaa, 8 = noin 2 toistoa varaa." />
                </span>
                <span className="inline-flex items-center justify-end gap-1">
                  <span className="hidden md:inline">Tila</span>
                  <InfoTooltip text="Merkitse sarja tehdyksi kun sarja on valmis. Voit myös kumota kuittauksen tarvittaessa." />
                </span>
              </div>
              <div className="overflow-hidden rounded-b-[1.15rem] divide-y divide-[var(--border)]">
              {logs.map((log) => {
                  const rowToneClass = log.done
                    ? "bg-[color-mix(in_srgb,var(--success)_10%,var(--surface))]"
                    : "bg-[var(--surface)]";
                  const inputToneClass = log.done
                    ? "border-[color-mix(in_srgb,var(--success)_40%,var(--border))] bg-[color-mix(in_srgb,var(--success)_12%,var(--surface))] text-[var(--text)]"
                    : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)]";
                  const setLabelClass = log.done
                    ? "border-[color-mix(in_srgb,var(--success)_35%,var(--border))] bg-[color-mix(in_srgb,var(--success)_12%,var(--surface))] text-[var(--success)]"
                    : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)]";

                  return (
                    <div
                      key={log.id}
                      className={`grid grid-cols-[2.8rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)_2.8rem] items-center gap-2 px-2.5 py-2.5 md:grid-cols-[0.82fr_1fr_1fr_0.9fr_auto] md:px-3.5 ${rowToneClass}`}
                    >
                      <div className="min-w-0">
                        <span className={`inline-flex min-w-[2.15rem] items-center justify-center rounded-full border px-2 py-1 text-xs font-semibold ${setLabelClass}`}>
                          #{log.setLabel}
                        </span>
                      </div>
                      <Input
                        className={`h-10 min-w-0 rounded-xl px-2.5 py-1 text-sm font-medium shadow-[inset_0_1px_0_0_var(--shadow-soft)] md:px-3 ${inputToneClass}`}
                        id={`${scheduledWorkoutId}-${log.id}-reps`}
                        type="number"
                        min={0}
                        placeholder="0"
                        aria-label={`${exerciseName} sarja ${log.setLabel} toteutuneet toistot`}
                        value={log.actualReps ?? ""}
                        disabled={readOnly}
                        onChange={(event) => handleLogUpdate(log, { actualReps: numberOrUndefined(event.target.value) })}
                      />
                      <Input
                        className={`h-10 min-w-0 rounded-xl px-2.5 py-1 text-sm font-medium shadow-[inset_0_1px_0_0_var(--shadow-soft)] md:px-3 ${inputToneClass}`}
                        id={`${scheduledWorkoutId}-${log.id}-load`}
                        type="number"
                        min={0}
                        step="0.5"
                        placeholder="0"
                        aria-label={`${exerciseName} sarja ${log.setLabel} toteutunut kuorma`}
                        value={log.actualLoad ?? ""}
                        disabled={readOnly}
                        onChange={(event) => handleLogUpdate(log, { actualLoad: numberOrUndefined(event.target.value) })}
                      />
                      <Input
                        className={`h-10 min-w-0 rounded-xl px-2.5 py-1 text-sm font-medium shadow-[inset_0_1px_0_0_var(--shadow-soft)] md:px-3 ${inputToneClass}`}
                        id={`${scheduledWorkoutId}-${log.id}-rpe`}
                        type="number"
                        min={1}
                        max={10}
                        step={1}
                        placeholder="-"
                        aria-label={`${exerciseName} sarja ${log.setLabel} RPE`}
                        value={log.rpe ?? ""}
                        disabled={readOnly}
                        onChange={(event) => handleLogUpdate(log, { rpe: numberOrUndefined(event.target.value) })}
                      />
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          className={`size-9 rounded-full p-0 shadow-[0_6px_18px_-12px_var(--shadow)] ${
                            log.done
                              ? "border-[var(--success)] bg-[var(--success)] text-white hover:border-[var(--success)] hover:bg-[var(--success)] hover:text-white"
                              : "border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text-subtle)] hover:border-[var(--border-strong)] hover:bg-[var(--surface)] hover:text-[var(--text-subtle)]"
                          }`}
                          disabled={readOnly}
                          aria-pressed={log.done}
                          aria-label={log.done ? "Kumoa kuittaus" : "Merkitse tehdyksi"}
                          title={log.done ? "Kumoa kuittaus" : "Merkitse tehdyksi"}
                          onClick={() => handleDoneUpdate(log, !log.done)}
                        >
                          <Check className="size-5" aria-hidden="true" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  if (!selectedSession) {
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

  return (
    <div className="mt-6 space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Badge>{workoutStatusLabel(status)}</Badge>
        <p className="text-sm text-[var(--text-muted)]">Käynnistetty {formatDate(selectedSession.startedAt)}</p>
        <Badge className="border-[var(--accent)] bg-[var(--surface-3)] text-[var(--accent)]">
          Treeniaika {formatWorkoutDuration(elapsedSeconds)}
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
              <div className="inline-flex items-center gap-1.5">
                <p className="text-sm font-semibold text-[var(--accent)]">
                  Superset {block.supersetGroup}
                </p>
                <InfoTooltip text="Supersetissä tämän ryhmän liikkeet tehdään vuorotellen. Saman sarjan kuittaus peilautuu ryhmän muihin liikkeisiin." />
              </div>
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
          <InfoTooltip text="Kirjoita tähän fiilis, kipu tai muu huomio. Muistiinpano näkyy treenin yhteenvedossa." />
        </div>
        <Textarea
          id={`${scheduledWorkoutId}-note`}
          value={localNote}
          disabled={readOnly}
          onChange={(event) => {
            setLocalNote(event.target.value);
            onSaveNote(event.target.value);
          }}
          placeholder="Kirjaa treenin fiilis, mahdollinen kipu tai muu huomio. Jos treeni jäi kesken, kerro syy lyhyesti."
        />
        <p aria-live="polite" className="mt-2 text-xs text-[var(--text-subtle)]">
          Muistiinpano tallentuu automaattisesti.
        </p>
      </div>

      {status !== "completed" && restTotalSeconds > 0 && restExerciseKey ? (
        <div className="sticky bottom-[max(env(safe-area-inset-bottom),0.75rem)] z-30 mt-4 md:fixed md:bottom-3 md:right-6 md:left-auto md:mt-0 md:w-[min(24rem,calc(100vw-3rem))]">
          <div className="ml-auto w-full max-w-full rounded-2xl border border-[var(--accent)] bg-[var(--surface)] p-4 shadow-[0_14px_30px_-18px_var(--shadow)]">
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

      <div className="rounded-none border-0 bg-transparent p-0 shadow-none">
        <div className="flex flex-wrap gap-3 items-center">
          {showBottomBackToList ? (
            <Button onClick={onBackToList} type="button" variant="ghost" className="w-full sm:w-auto">
              Takaisin treenilistaan
            </Button>
          ) : null}
          {status !== "completed" ? (
            <>
              <Button onClick={onComplete} type="button" className="w-full sm:w-auto">
                Merkitse treeni valmiiksi
              </Button>
              {hasSecondaryActions ? (
                <div className="relative" data-session-actions-menu-root="true">
                  <Button
                    type="button"
                    variant="ghost"
                    className="size-10 rounded-full p-0"
                    data-session-actions-trigger="true"
                    aria-expanded={isSecondaryActionsOpen}
                    aria-haspopup="menu"
                    aria-label="Avaa treenin lisätoiminnot"
                    onClick={(event) => toggleSecondaryActionsMenu(event.currentTarget)}
                  >
                    <MoreHorizontal className="size-5" aria-hidden="true" />
                  </Button>
                  {isSecondaryActionsOpen ? (
                    <div
                      ref={secondaryActionsMenuRef}
                      role="menu"
                      className="z-20 min-w-40 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 shadow-[0_12px_30px_-20px_var(--shadow)]"
                      style={
                        secondaryActionsMenuStyle ??
                        (secondaryActionsAnchorRect
                          ? getHiddenFloatingMenuStyle(secondaryActionsAnchorRect)
                          : undefined)
                      }
                    >
                      {showResumeAction ? (
                        <button
                          type="button"
                          role="menuitem"
                          className="w-full rounded-lg px-3 py-2 text-left text-sm text-[var(--accent)] hover:bg-[var(--surface-3)]"
                          onClick={() => {
                            setIsSecondaryActionsOpen(false);
                            setSecondaryActionsAnchorRect(null);
                            setSecondaryActionsMenuStyle(null);
                            onStart();
                          }}
                        >
                          Jatka treeniä
                        </button>
                      ) : null}
                      {showCancelAction ? (
                        <button
                          type="button"
                          role="menuitem"
                          className="w-full rounded-lg px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-[var(--surface-3)]"
                          onClick={() => {
                            setIsSecondaryActionsOpen(false);
                            setSecondaryActionsAnchorRect(null);
                            setSecondaryActionsMenuStyle(null);
                            onCancel();
                          }}
                        >
                          Keskeytä treeni
                        </button>
                      ) : null}
                      {showDeleteAction ? (
                        <button
                          type="button"
                          role="menuitem"
                          className="w-full rounded-lg px-3 py-2 text-left text-sm text-[var(--danger)] hover:bg-[var(--surface-3)]"
                          onClick={() => {
                            setIsSecondaryActionsOpen(false);
                            setSecondaryActionsAnchorRect(null);
                            setSecondaryActionsMenuStyle(null);
                            onDelete();
                          }}
                        >
                          Poista treeni
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
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
              {showDeleteAction ? (
                <div className="relative" data-session-actions-menu-root="true">
                  <Button
                    type="button"
                    variant="ghost"
                    className="size-10 rounded-full p-0"
                    data-session-actions-trigger="true"
                    aria-expanded={isSecondaryActionsOpen}
                    aria-haspopup="menu"
                    aria-label="Avaa treenin lisätoiminnot"
                    onClick={(event) => toggleSecondaryActionsMenu(event.currentTarget)}
                  >
                    <MoreHorizontal className="size-5" aria-hidden="true" />
                  </Button>
                  {isSecondaryActionsOpen ? (
                    <div
                      ref={secondaryActionsMenuRef}
                      role="menu"
                      className="z-20 min-w-40 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 shadow-[0_12px_30px_-20px_var(--shadow)]"
                      style={
                        secondaryActionsMenuStyle ??
                        (secondaryActionsAnchorRect
                          ? getHiddenFloatingMenuStyle(secondaryActionsAnchorRect)
                          : undefined)
                      }
                    >
                      <button
                        type="button"
                        role="menuitem"
                        className="w-full rounded-lg px-3 py-2 text-left text-sm text-[var(--danger)] hover:bg-[var(--surface-3)]"
                        onClick={() => {
                          setIsSecondaryActionsOpen(false);
                          setSecondaryActionsAnchorRect(null);
                          setSecondaryActionsMenuStyle(null);
                          onDelete();
                        }}
                      >
                        Poista treeni
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
      {status !== "completed" && progress && progress.percent < 100 ? (
        <p className="text-sm text-[var(--text-muted)]">
          Voit merkitä treenin valmiiksi myös osittain. Toteuma nyt {progress.completedSets}/{progress.totalSets} sarjaa ({progress.percent}%).
        </p>
      ) : null}
    </div>
  );
}
