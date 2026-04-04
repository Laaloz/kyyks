"use client";

import { BookOpen, Check, ChevronDown, ChevronUp, GripVertical, MoreHorizontal } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type CSSProperties,
} from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/field";
import { InfoTooltip } from "@/components/ui/tooltip";
import { InlineFeedback } from "@/components/workout/inline-feedback";
import { withMinimumDelay } from "@/lib/min-delay";
import { workoutStatusBadgeClass, workoutStatusLabel } from "@/components/workout/shared";
import { calculateSessionDurationSeconds } from "@/lib/domain";
import type { WorkoutSession } from "@/lib/types";
import { formatDate } from "@/lib/utils";

type PreviousExerciseResult = {
  actualReps?: number;
  actualLoad?: number;
  completedAt: string;
  timesCompleted: number;
};

type ExerciseGroup = {
  key: string;
  exerciseName: string;
  supersetGroup?: string;
  logs: WorkoutSession["setLogs"];
};

type PersistedWorkoutUiState = {
  noteDraft?: string;
  restTotalSeconds?: number;
  restEndsAt?: number;
  restExerciseKey?: string;
  restExerciseName?: string;
  hasSeenDragHint?: boolean;
};

const inputDragHandleClass =
  "flex h-full w-full items-center justify-center rounded-[0.6rem] border border-[color-mix(in_srgb,var(--border)_58%,transparent)] bg-[color-mix(in_srgb,var(--surface)_96%,transparent)] text-[color-mix(in_srgb,var(--text-subtle)_82%,transparent)] transition hover:border-[color-mix(in_srgb,var(--border-strong)_72%,transparent)] hover:bg-[color-mix(in_srgb,var(--surface)_98%,var(--surface-2))] hover:text-[var(--text-muted)]";

const inputDragHandleActiveClass =
  "border-[color-mix(in_srgb,var(--accent)_55%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_12%,var(--surface))] text-[var(--accent)] shadow-[0_10px_20px_-16px_var(--accent)]";

const dragPixelsPerStep = 14;

type DragField = "reps" | "load";

type DragSession = {
  logId: string;
  field: DragField;
  pointerId: number;
  startY: number;
  lastStepOffset: number;
  currentValue: number;
  increment: number;
};

function getWorkoutUiStorageKey(scheduledWorkoutId: string) {
  return `rookiapp.workout-ui.${scheduledWorkoutId}`;
}

function readPersistedWorkoutUiState(scheduledWorkoutId: string): PersistedWorkoutUiState | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(getWorkoutUiStorageKey(scheduledWorkoutId));
    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as PersistedWorkoutUiState;
  } catch {
    return null;
  }
}

function persistWorkoutUiState(scheduledWorkoutId: string, state: PersistedWorkoutUiState) {
  if (typeof window === "undefined") {
    return;
  }

  const hasContent = Object.values(state).some((value) => value !== undefined && value !== null && value !== "");

  try {
    if (!hasContent) {
      window.sessionStorage.removeItem(getWorkoutUiStorageKey(scheduledWorkoutId));
      return;
    }

    window.sessionStorage.setItem(getWorkoutUiStorageKey(scheduledWorkoutId), JSON.stringify(state));
  } catch {
    // Ignore storage failures on restricted browsers.
  }
}

function compareSetLabels(left: string, right: string) {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

function getWorkoutFieldId(
  scheduledWorkoutId: string,
  logId: string,
  field: "reps" | "load",
) {
  return `${scheduledWorkoutId}-${logId}-${field}`;
}

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
        className="w-full max-w-lg rounded-3xl border border-[var(--border-strong)] bg-[var(--surface)] p-5 shadow-[0_24px_60px_-24px_var(--shadow)]"
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
          className="mt-3 max-h-[60vh] overflow-y-auto text-sm leading-6 text-[var(--text-muted)]"
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

function parseDurationInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parts = trimmed.split(":").map((part) => part.trim());
  if (parts.some((part) => part === "" || !/^\d+$/.test(part))) {
    return null;
  }

  if (parts.length === 2) {
    const [minutes, seconds] = parts.map(Number);
    if (seconds > 59) {
      return null;
    }
    return minutes * 60 + seconds;
  }

  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts.map(Number);
    if (minutes > 59 || seconds > 59) {
      return null;
    }
    return hours * 3600 + minutes * 60 + seconds;
  }

  return null;
}

function formatWorkoutDateInput(value: string) {
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) {
    return "";
  }

  const year = timestamp.getFullYear();
  const month = String(timestamp.getMonth() + 1).padStart(2, "0");
  const day = String(timestamp.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
  const restTargets = logs
    .map((log) => log.targetRestSeconds)
    .filter((value): value is number => value !== undefined);

  const parts = [`${logs.length} sarjaa`];

  parts.push(
    repTargets.length === 1
      ? `${repTargets[0]} toistoa`
      : "sarjakohtaiset toistot",
  );

  if (restTargets.length > 0) {
    const uniqueRests = Array.from(new Set(restTargets));
    parts.push(uniqueRests.length === 1 ? `lepo ${formatDuration(uniqueRests[0])}` : "sarjakohtainen lepo");
  }

  return parts.join(" · ");
}

function isBelowTargetRepMinimum(log: WorkoutSession["setLogs"][number]) {
  if (log.actualReps === undefined || log.actualReps === null) {
    return false;
  }

  const targetMinimum = log.targetRepsMin ?? log.targetReps;
  return log.actualReps < targetMinimum;
}

function formatLoadDraftValue(value: number) {
  return String(value).replace(".", ",");
}

function parseLoadDraftValue(rawValue: string) {
  const normalized = rawValue.trim().replace(",", ".");
  if (!normalized || normalized.endsWith(".")) {
    return null;
  }

  const parsedValue = Number(normalized);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

const repsTooltipText =
  "Kirjaa tähän toteutuneet toistot. Jos teit enemmän tai vähemmän kuin suunnitelmassa, merkitse tähän oikea määrä.";

const loadTooltipText =
  "Kirjaa tähän sarjassa käytetty kuorma kiloina. Jos teit sarjan ilman lisäpainoa, jätä kenttä arvoon 0 tai tyhjäksi käytäntönne mukaan. Kuorman säätöaskelta voit muuttaa kohdasta Tili > Asetukset.";

export function AthleteSessionPanel({
  scheduledWorkoutId,
  scheduledWorkoutTitle,
  scheduledWorkoutDescription,
  scheduledWorkoutGuidance,
  selectedSession,
  note,
  status,
  scheduledDate,
  onStart,
  onUpdate,
  onUpdateDate,
  onUpdateDuration,
  onSaveNote,
  onComplete,
  onCancel,
  onDelete,
  onBackToList,
  canDeleteWorkout,
  initialCorrectionMode,
  progress,
  previousExerciseResults,
  exerciseInstructions,
  exerciseOrder,
  activeWorkoutCount,
  workoutMessage,
  isCompleting,
  isSessionSyncing,
  loadIncrementKg,
}: {
  scheduledWorkoutId: string;
  scheduledWorkoutTitle: string;
  scheduledWorkoutDescription?: string;
  scheduledWorkoutGuidance?: string;
  selectedSession?: WorkoutSession;
  note: string;
  status: string;
  scheduledDate?: string;
  onStart: () => void | Promise<void>;
  onUpdate: (logId: string, patch: { actualReps?: number | null; actualLoad?: number | null; done?: boolean }) => void;
  onUpdateDate: (scheduledDate: string) => Promise<{ ok: boolean; message?: string }>;
  onUpdateDuration: (durationSeconds: number) => Promise<{ ok: boolean; message?: string }>;
  onSaveNote: (body: string) => void;
  onComplete: () => void | Promise<void>;
  onCancel: () => void | Promise<void>;
  onDelete: () => void | Promise<void>;
  onBackToList: () => void;
  canDeleteWorkout: boolean;
  initialCorrectionMode: boolean;
  progress: { totalSets: number; completedSets: number; percent: number; allDone: boolean } | null;
  previousExerciseResults: Map<string, PreviousExerciseResult>;
  exerciseInstructions: Map<string, string>;
  exerciseOrder: Map<string, number>;
  activeWorkoutCount?: number;
  workoutMessage: string;
  isCompleting: boolean;
  isSessionSyncing?: boolean;
  loadIncrementKg: 1 | 2.5 | 5;
}) {
  const [localNote, setLocalNote] = useState(note);
  const noteSaveTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    setLocalNote(note);
  }, [note, scheduledWorkoutId]);

  useEffect(() => {
    return () => {
      if (noteSaveTimeoutRef.current !== null) {
        window.clearTimeout(noteSaveTimeoutRef.current);
      }
    };
  }, []);
  const [correctionMode, setCorrectionMode] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [restTotalSeconds, setRestTotalSeconds] = useState(0);
  const [restSecondsLeft, setRestSecondsLeft] = useState(0);
  const [restRunning, setRestRunning] = useState(false);
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  const [restExerciseKey, setRestExerciseKey] = useState<string | null>(null);
  const [restExerciseName, setRestExerciseName] = useState<string | null>(null);
  const [expandedExerciseKeys, setExpandedExerciseKeys] = useState<Record<string, boolean>>({});
  const [openInstruction, setOpenInstruction] = useState<{ exerciseName: string; instruction: string } | null>(null);
  const [isSecondaryActionsOpen, setIsSecondaryActionsOpen] = useState(false);
  const [secondaryActionsAnchorRect, setSecondaryActionsAnchorRect] = useState<AnchorRect | null>(null);
  const [secondaryActionsMenuStyle, setSecondaryActionsMenuStyle] = useState<CSSProperties | null>(null);
  const [scheduledDateDraft, setScheduledDateDraft] = useState("");
  const [durationDraft, setDurationDraft] = useState("");
  const [dateMessage, setDateMessage] = useState("");
  const [durationMessage, setDurationMessage] = useState("");
  const [dateMessageTone, setDateMessageTone] = useState<"success" | "danger" | null>(null);
  const [durationMessageTone, setDurationMessageTone] = useState<"success" | "danger" | null>(null);
  const [isSavingDate, setIsSavingDate] = useState(false);
  const [isSavingDuration, setIsSavingDuration] = useState(false);
  const [hasSeenDragHint, setHasSeenDragHint] = useState(false);
  const [isStartingWorkout, setIsStartingWorkout] = useState(false);
  const [isCancellingWorkout, setIsCancellingWorkout] = useState(false);
  const [isDeletingWorkout, setIsDeletingWorkout] = useState(false);
  const [loadDrafts, setLoadDrafts] = useState<Record<string, string>>({});
  const [dragSession, setDragSession] = useState<DragSession | null>(null);
  const secondaryActionsMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const persistedState = readPersistedWorkoutUiState(scheduledWorkoutId);
    if (!persistedState) {
      setLocalNote(note);
      setRestTotalSeconds(0);
      setRestSecondsLeft(0);
      setRestRunning(false);
      setRestEndsAt(null);
      setRestExerciseKey(null);
      setRestExerciseName(null);
      setHasSeenDragHint(false);
      return;
    }

    setLocalNote(persistedState.noteDraft ?? note);
    setHasSeenDragHint(Boolean(persistedState.hasSeenDragHint));

    if (
      status === "in_progress" &&
      typeof persistedState.restEndsAt === "number" &&
      typeof persistedState.restTotalSeconds === "number" &&
      persistedState.restEndsAt > Date.now() &&
      persistedState.restTotalSeconds > 0
    ) {
      setRestTotalSeconds(persistedState.restTotalSeconds);
      setRestEndsAt(persistedState.restEndsAt);
      setRestSecondsLeft(Math.max(0, Math.ceil((persistedState.restEndsAt - Date.now()) / 1000)));
      setRestRunning(true);
      setRestExerciseKey(persistedState.restExerciseKey ?? null);
      setRestExerciseName(persistedState.restExerciseName ?? null);
      return;
    }

    setRestTotalSeconds(0);
    setRestSecondsLeft(0);
    setRestRunning(false);
    setRestEndsAt(null);
    setRestExerciseKey(null);
    setRestExerciseName(null);
  }, [note, scheduledWorkoutId, status]);

  useEffect(() => {
    persistWorkoutUiState(scheduledWorkoutId, {
      noteDraft: localNote.trim() ? localNote : undefined,
      restTotalSeconds: restRunning ? restTotalSeconds : undefined,
      restEndsAt: restRunning ? restEndsAt ?? undefined : undefined,
      restExerciseKey: restRunning ? restExerciseKey ?? undefined : undefined,
      restExerciseName: restRunning ? restExerciseName ?? undefined : undefined,
      hasSeenDragHint,
    });
  }, [hasSeenDragHint, localNote, restEndsAt, restExerciseKey, restExerciseName, restRunning, restTotalSeconds, scheduledWorkoutId]);

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
    setRestEndsAt(null);
    setRestExerciseKey(null);
    setRestExerciseName(null);
    setExpandedExerciseKeys({});
    setOpenInstruction(null);
    setDateMessage("");
    setDurationMessage("");
    setDateMessageTone(null);
    setDurationMessageTone(null);
    setHasSeenDragHint(false);
    setLoadDrafts({});
  }, [scheduledWorkoutId]);

  useEffect(() => {
    if (!selectedSession) {
      setElapsedSeconds(0);
      return;
    }

    const getElapsed = () => {
      if (status === "in_progress") {
        return calculateSessionDurationSeconds(selectedSession, new Date().toISOString());
      }

      return calculateSessionDurationSeconds(selectedSession);
    };

    setElapsedSeconds(getElapsed());

    if (status !== "in_progress") {
      return;
    }

    const syncElapsed = () => {
      setElapsedSeconds(getElapsed());
    };

    const interval = window.setInterval(() => {
      syncElapsed();
    }, 1000);

    const handleVisibilityOrFocus = () => {
      syncElapsed();
    };

    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
    };
  }, [selectedSession, status]);

  useEffect(() => {
    setDurationDraft(formatWorkoutDuration(elapsedSeconds));
  }, [elapsedSeconds, scheduledWorkoutId, correctionMode]);

  useEffect(() => {
    setScheduledDateDraft(scheduledDate ? formatWorkoutDateInput(scheduledDate) : "");
  }, [scheduledDate, scheduledWorkoutId]);

  useEffect(() => {
    if (!selectedSession) {
      return;
    }

    setLoadDrafts((previous) => {
      let changed = false;
      const next = { ...previous };

      Object.entries(previous).forEach(([logId, rawValue]) => {
        const parsedValue = parseLoadDraftValue(rawValue);
        if (parsedValue === null) {
          return;
        }

        const log = selectedSession.setLogs.find((item) => item.id === logId);
        if (!log) {
          delete next[logId];
          changed = true;
          return;
        }

        if (log.actualLoad !== undefined && Math.abs(log.actualLoad - parsedValue) < 0.0001) {
          delete next[logId];
          changed = true;
        }
      });

      return changed ? next : previous;
    });
  }, [selectedSession]);

  useEffect(() => {
    if (!restRunning || !restEndsAt) {
      return;
    }

    const syncRestCountdown = () => {
      const remainingSeconds = Math.max(0, Math.ceil((restEndsAt - Date.now()) / 1000));

      if (remainingSeconds <= 0) {
        setRestSecondsLeft(0);
        setRestRunning(false);
        setRestTotalSeconds(0);
        setRestEndsAt(null);
        setRestExerciseKey(null);
        setRestExerciseName(null);
        return;
      }

      setRestSecondsLeft(remainingSeconds);
    };

    syncRestCountdown();

    const interval = window.setInterval(() => {
      syncRestCountdown();
    }, 1000);

    const handleVisibilityOrFocus = () => {
      syncRestCountdown();
    };

    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
    };
  }, [restEndsAt, restRunning]);

  useEffect(() => {
    if (status !== "in_progress") {
      setRestRunning(false);
      setRestEndsAt(null);
    }
  }, [status]);

  useEffect(() => {
    if (!isSecondaryActionsOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-session-actions-menu-root='true']")) {
        return;
      }

      setIsSecondaryActionsOpen(false);
      setSecondaryActionsAnchorRect(null);
      setSecondaryActionsMenuStyle(null);
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("touchstart", handlePointerDown);
    window.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("touchstart", handlePointerDown);
      window.removeEventListener("pointerdown", handlePointerDown);
    };
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
      const sortedLogs = (logs: WorkoutSession["setLogs"]) =>
        [...logs].sort((left, right) => {
          const byLabel = compareSetLabels(left.setLabel, right.setLabel);
          if (byLabel !== 0) {
            return byLabel;
          }

          return left.id.localeCompare(right.id);
        });
      if (current) {
        grouped.set(key, {
          ...current,
          logs: sortedLogs([...current.logs, log]),
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
      const leftOrder = exerciseOrder.get(left.key) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = exerciseOrder.get(right.key) ?? Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }

      return left.exerciseName.localeCompare(right.exerciseName, undefined, { sensitivity: "base" });
    });
  }, [exerciseOrder, selectedSession]);

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
    setRestEndsAt(Date.now() + duration * 1000);
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
    setRestEndsAt(null);
    setRestExerciseKey(null);
    setRestExerciseName(null);
  };

  const restartRestTimer = () => {
    if (restTotalSeconds < 1) {
      return;
    }

    setRestSecondsLeft(restTotalSeconds);
    setRestRunning(true);
    setRestEndsAt(Date.now() + restTotalSeconds * 1000);
  };

  const handleLogUpdate = (
    log: WorkoutSession["setLogs"][number],
    patch: { actualReps?: number | null; actualLoad?: number | null; done?: boolean },
  ) => {
    onUpdate(log.id, patch);
  };

  const handleLogUpdateById = (
    logId: string,
    patch: { actualReps?: number | null; actualLoad?: number | null; done?: boolean },
  ) => {
    onUpdate(logId, patch);
  };

  const handleDoneUpdate = (log: WorkoutSession["setLogs"][number], nextDone: boolean) => {
    if (nextDone && activeWorkoutCount && activeWorkoutCount > 1) {
      console.warn("[workout-ui] multiple-active-workouts-detected", {
        scheduledWorkoutId,
        activeWorkoutCount,
      });
    }

    onUpdate(log.id, { done: nextDone });

    if (!nextDone) {
      skipRestTimer();
      return;
    }

    startRestTimer(log.targetRestSeconds ?? 180, log.templateExerciseId, log.exerciseName, log.supersetGroup);
  };

  const handleLoadDraftChange = (log: WorkoutSession["setLogs"][number], rawValue: string) => {
    setLoadDrafts((previous) => ({
      ...previous,
      [log.id]: rawValue,
    }));

    if (rawValue.trim() === "") {
      onUpdate(log.id, { actualLoad: null });
      return;
    }

    const parsedValue = parseLoadDraftValue(rawValue);
    if (parsedValue === null) {
      return;
    }

    onUpdate(log.id, { actualLoad: parsedValue });
  };

  const handleLoadDraftBlur = (log: WorkoutSession["setLogs"][number]) => {
    setLoadDrafts((previous) => {
      const rawValue = previous[log.id];
      if (rawValue === undefined) {
        return previous;
      }

      const parsedValue = parseLoadDraftValue(rawValue);
      if (parsedValue !== null && (log.actualLoad === undefined || Math.abs(log.actualLoad - parsedValue) >= 0.0001)) {
        return previous;
      }

      const next = { ...previous };
      delete next[log.id];
      return next;
    });
  };

  const readOnly = (status === "completed" && !correctionMode) || Boolean(isSessionSyncing);
  const showCancelAction = status === "in_progress";
  const showResumeAction = status === "cancelled";
  const showDeleteAction = canDeleteWorkout;
  const showBottomBackToList = status !== "in_progress";
  const hasSecondaryActions = showResumeAction || showCancelAction || showDeleteAction;
  const initialScheduledDateDraft = scheduledDate ? formatWorkoutDateInput(scheduledDate) : "";
  const isDateDirty = scheduledDateDraft.trim() !== initialScheduledDateDraft;
  const isDurationDirty = durationDraft.trim() !== formatWorkoutDuration(elapsedSeconds);
  const roundToIncrement = (value: number, increment: number) => {
    const next = Math.round(value / increment) * increment;
    return Number(next.toFixed(increment % 1 === 0 ? 0 : 2));
  };

  const adjustActualReps = (log: WorkoutSession["setLogs"][number], delta: number) => {
    const nextValue = Math.max(0, (log.actualReps ?? 0) + delta);
    handleLogUpdate(log, { actualReps: nextValue });
  };

  const adjustActualLoad = (log: WorkoutSession["setLogs"][number], delta: number) => {
    const baseValue = log.actualLoad ?? 0;
    const nextValue = Math.max(0, roundToIncrement(baseValue + delta, loadIncrementKg));

    setLoadDrafts((previous) => ({
      ...previous,
      [log.id]: formatLoadDraftValue(nextValue),
    }));

    handleLogUpdate(log, { actualLoad: nextValue });
  };

  const beginFieldDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    log: WorkoutSession["setLogs"][number],
    field: DragField,
  ) => {
    if (readOnly) {
      return;
    }

    const currentValue = field === "reps" ? log.actualReps ?? 0 : log.actualLoad ?? 0;
    const increment = field === "reps" ? 1 : loadIncrementKg;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setHasSeenDragHint(true);

    setDragSession({
      logId: log.id,
      field,
      pointerId: event.pointerId,
      startY: event.clientY,
      lastStepOffset: 0,
      currentValue,
      increment,
    });
  };

  const updateDragSession = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!dragSession || event.pointerId !== dragSession.pointerId) {
      return;
    }

    event.preventDefault();

    const deltaY = dragSession.startY - event.clientY;
    const nextStepOffset = Math.trunc(deltaY / dragPixelsPerStep);
    if (nextStepOffset === dragSession.lastStepOffset) {
      return;
    }

    const stepDelta = nextStepOffset - dragSession.lastStepOffset;
    const nextValue = Math.max(0, roundToIncrement(dragSession.currentValue + stepDelta * dragSession.increment, dragSession.increment));

    if (dragSession.field === "reps") {
      handleLogUpdateById(dragSession.logId, { actualReps: nextValue });
    } else {
      setLoadDrafts((previous) => ({
        ...previous,
        [dragSession.logId]: formatLoadDraftValue(nextValue),
      }));

      handleLogUpdateById(dragSession.logId, { actualLoad: nextValue });
    }

    setDragSession((previous) =>
      previous && previous.pointerId === event.pointerId
        ? { ...previous, currentValue: nextValue, lastStepOffset: nextStepOffset }
        : previous,
    );
  };

  const endFieldDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!dragSession || event.pointerId !== dragSession.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    setDragSession(null);
  };

  const handleFieldDragKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    log: WorkoutSession["setLogs"][number],
    field: DragField,
  ) => {
    if (readOnly) {
      return;
    }

    if (event.key === "ArrowUp" || event.key === "ArrowRight") {
      event.preventDefault();
      if (field === "reps") {
        adjustActualReps(log, 1);
      } else {
        adjustActualLoad(log, loadIncrementKg);
      }
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
      event.preventDefault();
      if (field === "reps") {
        adjustActualReps(log, -1);
      } else {
        adjustActualLoad(log, -loadIncrementKg);
      }
    }
  };

  const focusWorkoutField = (logId: string, field: "reps" | "load") => {
    if (typeof window === "undefined") {
      return;
    }

    window.requestAnimationFrame(() => {
      const element = document.getElementById(getWorkoutFieldId(scheduledWorkoutId, logId, field));
      if (!(element instanceof HTMLInputElement)) {
        return;
      }

      element.focus();
      element.select();
    });
  };

  const handleWorkoutFieldEnter = (
    event: KeyboardEvent<HTMLInputElement>,
    logs: WorkoutSession["setLogs"],
    currentLog: WorkoutSession["setLogs"][number],
    field: "reps" | "load",
  ) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();

    if (field === "reps") {
      focusWorkoutField(currentLog.id, "load");
      return;
    }

    const currentIndex = logs.findIndex((entry) => entry.id === currentLog.id);
    const nextLog = currentIndex >= 0 ? logs[currentIndex + 1] : undefined;
    if (nextLog) {
      focusWorkoutField(nextLog.id, "reps");
    }
  };
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
    const instruction = exerciseInstructions.get(exerciseKey)?.trim();
    const isExpanded = getIsExpanded(group);
    const cardToneClass = isComplete
      ? "border-[color-mix(in_srgb,var(--success)_30%,var(--border))] bg-[var(--surface)] shadow-[0_10px_24px_-22px_var(--success)]"
      : isStarted
        ? "border-[color-mix(in_srgb,var(--warning)_30%,var(--border))] bg-[var(--surface)] shadow-[0_10px_24px_-22px_var(--warning)]"
        : supersetGroup
          ? "border-[color-mix(in_srgb,var(--accent)_22%,var(--border))] bg-[var(--surface)]"
          : "border-[var(--border)] bg-[var(--surface)]";
    const progressBadgeClass = isComplete
      ? "border-[var(--success)] bg-[var(--surface)] text-[var(--success)]"
      : isStarted
        ? "border-[var(--warning)] bg-[var(--surface)] text-[var(--warning)]"
        : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-subtle)]";
    const indicatorClass = isComplete
      ? "bg-[var(--success)]"
      : isStarted
        ? "bg-[var(--warning)]"
        : "bg-[var(--border)]";
    const chevronClass = isComplete
      ? "border-[color-mix(in_srgb,var(--success)_35%,var(--border))] bg-[color-mix(in_srgb,var(--success)_12%,var(--surface))] text-[var(--success)] group-hover:border-[color-mix(in_srgb,var(--success)_45%,var(--border))] group-hover:bg-[color-mix(in_srgb,var(--success)_16%,var(--surface))]"
      : isStarted
        ? "border-[color-mix(in_srgb,var(--warning)_30%,var(--border))] bg-[color-mix(in_srgb,var(--warning)_10%,var(--surface))] text-[var(--warning)] group-hover:border-[color-mix(in_srgb,var(--warning)_40%,var(--border))] group-hover:bg-[color-mix(in_srgb,var(--warning)_14%,var(--surface))]"
        : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-subtle)] group-hover:border-[var(--border-strong)] group-hover:bg-[var(--surface-3)] group-hover:text-[var(--text)]";
    return (
      <div
        key={exerciseKey}
        className={`overflow-hidden rounded-[1.35rem] border p-3 md:p-3.5 ${cardToneClass}`}
      >
        <div className="flex items-start gap-2 px-1">
          <button
            type="button"
            className="group min-w-0 flex-1 rounded-[1rem] py-0 text-left text-inherit transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
            id={disclosureButtonId}
            aria-expanded={isExpanded}
            aria-controls={disclosurePanelId}
            onClick={() => setGroupExpansion(group)}
          >
            <span className="min-w-0">
              <span className="flex items-center gap-1.5">
                <span className={`size-2.5 rounded-full ${indicatorClass}`} aria-hidden="true" />
                <span className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">
                  Liike
                </span>
              </span>
              <span className="mt-0.5 block font-[family-name:var(--font-display)] text-[0.97rem] font-semibold leading-tight text-[var(--text)] md:text-[1.02rem]">
                {exerciseName}
              </span>
            </span>
          </button>
          <div className="flex shrink-0 items-center gap-2 self-start">
            {instruction ? (
              <button
                type="button"
                aria-label={`${exerciseName} ohje`}
                title="Ohje"
                className="inline-flex size-8.5 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--accent)_22%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_7%,var(--surface))] text-[var(--accent)] shadow-[0_4px_12px_-14px_var(--accent)] transition hover:border-[color-mix(in_srgb,var(--accent)_36%,var(--border))] hover:bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))] hover:opacity-95"
                onClick={() => setOpenInstruction({ exerciseName, instruction })}
              >
                <BookOpen className="size-3.5" aria-hidden="true" />
              </button>
            ) : null}
            <button
              type="button"
              className={`grid size-8.5 place-items-center rounded-full border transition ${chevronClass}`}
              aria-label={isExpanded ? `Sulje ${exerciseName}` : `Avaa ${exerciseName}`}
              aria-expanded={isExpanded}
              aria-controls={disclosurePanelId}
              onClick={() => setGroupExpansion(group)}
            >
              {isExpanded ? (
                <ChevronUp className="size-4" aria-hidden="true" />
              ) : (
                <ChevronDown className="size-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
        <div className="mt-2 flex items-start gap-2 px-1">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <Badge className={`min-w-0 ${progressBadgeClass}`}>{completedInExercise}/{logs.length} tehty</Badge>
            {targetSummary ? (
              <span className="inline-flex max-w-full min-w-0 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--text-subtle)]">
                <span className="truncate">{targetSummary}</span>
              </span>
            ) : null}
          </div>
        </div>
        {status === "completed" && previous ? (
          <p className="mt-2 px-1 text-xs text-[var(--text-subtle)]">
            Tehty {previous.timesCompleted} kertaa · viimeksi {formatDate(previous.completedAt)} · {formatPreviousExerciseResult(previous)}
          </p>
        ) : null}
        {isExpanded ? (
          <div
            id={disclosurePanelId}
            role="region"
            aria-labelledby={disclosureButtonId}
            className="mt-3 border-t border-[var(--border)] pt-3"
          >
            <div className="overflow-hidden rounded-[1rem] bg-[color-mix(in_srgb,var(--surface-2)_68%,var(--surface))]">
              <table className="w-full table-fixed border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--surface-3)_82%,var(--surface))] text-[10px] font-semibold uppercase tracking-[0.05em] text-[var(--text-subtle)]">
                    <th scope="col" className="w-11 px-2 py-2.5 text-left md:w-12 md:px-3">Sarja</th>
                    <th scope="col" className="px-2 py-2.5 text-left md:px-3">
                      <span className="inline-flex items-center gap-1">
                        Toistot
                        <InfoTooltip text={repsTooltipText} />
                      </span>
                    </th>
                    <th scope="col" className="px-2 py-2.5 text-left md:px-3">
                      <span className="inline-flex items-center gap-1">
                        Kuorma
                        <InfoTooltip text={loadTooltipText} />
                      </span>
                    </th>
                    <th scope="col" className="w-11 px-2 py-2.5 text-center md:w-12 md:px-3 md:text-right">
                      <span className="inline-flex items-center justify-center gap-1 md:justify-end">Tila</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                {logs.map((log) => {
                   const isBelowTarget = log.done && isBelowTargetRepMinimum(log);
                   const rowToneClass = log.done
                     ? "bg-[color-mix(in_srgb,var(--success)_10%,var(--surface))]"
                     : "bg-transparent";
                   const inputToneClass = log.done
                     ? "border-[color-mix(in_srgb,var(--success)_40%,var(--border))] bg-[color-mix(in_srgb,var(--success)_12%,var(--surface))] text-[var(--text)]"
                    : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)]";
                  const repsInputToneClass = isBelowTarget
                    ? "border-[color-mix(in_srgb,var(--warning)_55%,var(--border))] bg-[color-mix(in_srgb,var(--warning)_14%,var(--surface))] text-[var(--text)]"
                    : inputToneClass;
                  const setLabelToneClass = log.done
                    ? "text-[var(--success)] md:border-[color-mix(in_srgb,var(--success)_35%,var(--border))] md:bg-[color-mix(in_srgb,var(--success)_12%,var(--surface))]"
                    : "text-[var(--text-subtle)] md:border-[var(--border)] md:bg-[var(--surface-2)]";

                   return (
                    <tr
                       key={log.id}
                       className={`border-b border-[var(--border)] last:border-b-0 ${rowToneClass}`}
                    >
                      <td className="px-1 py-2.5 text-center align-middle md:px-3">
                        <span
                          className={`inline-flex h-8 w-8 items-center justify-center text-xs font-semibold tabular-nums md:rounded-full md:border ${setLabelToneClass}`}
                        >
                          {log.setLabel}
                        </span>
                      </td>
                      <td className="px-1 py-2.5 align-middle md:px-3">
                        <div className="relative">
                          <Input
                            className={`h-9 min-w-0 rounded-xl px-2 py-1 pr-9 text-center text-sm font-medium shadow-[inset_0_1px_0_0_var(--shadow-soft)] md:h-10 md:px-3 md:pr-10 ${repsInputToneClass}`}
                            id={getWorkoutFieldId(scheduledWorkoutId, log.id, "reps")}
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            placeholder="0"
                            aria-label={`${exerciseName} sarja ${log.setLabel} toteutuneet toistot`}
                            value={log.actualReps ?? ""}
                            data-below-target={isBelowTarget ? "true" : undefined}
                            disabled={readOnly}
                            onChange={(event) => {
                              const trimmed = event.target.value.trim();
                              if (trimmed === "") {
                                handleLogUpdate(log, { actualReps: null });
                                return;
                              }

                              if (!/^\d+$/.test(trimmed)) {
                                return;
                              }

                              handleLogUpdate(log, { actualReps: Number(trimmed) });
                            }}
                            onKeyDown={(event) => handleWorkoutFieldEnter(event, logs, log, "reps")}
                          />
                          <div className="absolute inset-y-1 right-1 w-7 rounded-[0.6rem] bg-[color-mix(in_srgb,var(--border)_26%,transparent)] p-px">
                            <button
                              type="button"
                              className={`${inputDragHandleClass} ${dragSession?.logId === log.id && dragSession.field === "reps" ? inputDragHandleActiveClass : ""}`}
                              disabled={readOnly}
                              role="spinbutton"
                              aria-label={`${exerciseName} sarja ${log.setLabel} saata toistoja vetamalla ylos tai alas`}
                              aria-valuemin={0}
                              aria-valuenow={log.actualReps ?? 0}
                              aria-valuetext={`${log.actualReps ?? 0} toistoa`}
                              onPointerDown={(event) => beginFieldDrag(event, log, "reps")}
                              onPointerMove={updateDragSession}
                              onPointerUp={endFieldDrag}
                              onPointerCancel={endFieldDrag}
                              onKeyDown={(event) => handleFieldDragKeyDown(event, log, "reps")}
                              style={{ touchAction: "none" }}
                            >
                              <GripVertical className="size-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      </td>
                      <td className="px-1 py-2.5 align-middle md:px-3">
                        <div className="relative">
                          <Input
                            className={`h-9 min-w-0 rounded-xl px-2 py-1 pr-9 text-center text-sm font-medium shadow-[inset_0_1px_0_0_var(--shadow-soft)] md:h-10 md:px-3 md:pr-10 ${inputToneClass}`}
                            id={getWorkoutFieldId(scheduledWorkoutId, log.id, "load")}
                            type="text"
                            inputMode="decimal"
                            placeholder="0"
                            aria-label={`${exerciseName} sarja ${log.setLabel} toteutunut kuorma`}
                            value={loadDrafts[log.id] ?? (log.actualLoad !== undefined ? String(log.actualLoad).replace(".", ",") : "")}
                            disabled={readOnly}
                            onChange={(event) => handleLoadDraftChange(log, event.target.value)}
                            onBlur={() => handleLoadDraftBlur(log)}
                            onKeyDown={(event) => handleWorkoutFieldEnter(event, logs, log, "load")}
                          />
                          <div className="absolute inset-y-1 right-1 w-7 rounded-[0.6rem] bg-[color-mix(in_srgb,var(--border)_26%,transparent)] p-px">
                            <button
                              type="button"
                              className={`${inputDragHandleClass} ${dragSession?.logId === log.id && dragSession.field === "load" ? inputDragHandleActiveClass : ""}`}
                              disabled={readOnly}
                              role="spinbutton"
                              aria-label={`${exerciseName} sarja ${log.setLabel} saata kuormaa vetamalla ylos tai alas`}
                              aria-valuemin={0}
                              aria-valuenow={log.actualLoad ?? 0}
                              aria-valuetext={`${log.actualLoad ?? 0} kiloa`}
                              onPointerDown={(event) => beginFieldDrag(event, log, "load")}
                              onPointerMove={updateDragSession}
                              onPointerUp={endFieldDrag}
                              onPointerCancel={endFieldDrag}
                              onKeyDown={(event) => handleFieldDragKeyDown(event, log, "load")}
                              style={{ touchAction: "none" }}
                            >
                              <GripVertical className="size-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      </td>
                      <td className="px-1.5 py-2.5 text-center align-middle md:px-3 md:text-right">
                        <div className="flex justify-center md:justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          className={`size-8 shrink-0 rounded-full p-0 shadow-[0_6px_18px_-12px_var(--shadow)] md:size-8.5 ${
                            log.done
                              ? "border-[var(--success)] bg-[var(--success)] text-white hover:border-[var(--success)] hover:bg-[var(--success)] hover:text-white"
                              : "border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text-subtle)] hover:border-[var(--border-strong)] hover:bg-[var(--surface)] hover:text-[var(--text-subtle)]"
                          }`}
                          data-state={log.done ? "done" : "pending"}
                          disabled={readOnly}
                          aria-pressed={log.done}
                          aria-label={
                            log.done
                              ? "Kumoa kuittaus"
                              : "Merkitse tehdyksi"
                          }
                          title={
                            log.done
                              ? "Kumoa kuittaus"
                              : "Merkitse tehdyksi"
                          }
                          onClick={() => handleDoneUpdate(log, !log.done)}
                        >
                          <Check className="size-4 shrink-0 stroke-[2.5]" aria-hidden="true" />
                        </Button>
                        </div>
                      </td>
                    </tr>
                   );
                 })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  if (isSessionSyncing) {
    return (
      <div className="mt-6 space-y-4">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
          <p className="font-medium text-[var(--text)]">{scheduledWorkoutTitle}</p>
          {scheduledWorkoutDescription ? (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-muted)]">{scheduledWorkoutDescription}</p>
          ) : null}
          {scheduledWorkoutGuidance ? (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-muted)]">{scheduledWorkoutGuidance}</p>
          ) : null}
        </div>
        <div className="rounded-3xl border border-[var(--border-strong)] bg-[color:color-mix(in_srgb,var(--surface-2)_82%,var(--surface))] px-4 py-5 shadow-[0_12px_28px_-24px_var(--shadow)]">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent text-[var(--accent)]"
            />
            <div>
              <p className="text-sm font-semibold text-[var(--text)]">Synkronoidaan treeniä...</p>
              <p className="mt-1 text-xs text-[var(--text-subtle)]">
                Liikkeet, sarjat ja ohjeet avautuvat heti kun palvelimen tiedot ovat valmiina.
              </p>
            </div>
          </div>
        </div>
        <p aria-live="polite" className="sr-only">
          {workoutMessage}
        </p>
      </div>
    );
  }

  if (!selectedSession) {
    return (
        <div className="mt-5 rounded-2xl border border-dashed border-[var(--border)] bg-[color:color-mix(in_srgb,var(--surface-2)_82%,var(--surface))] p-6 shadow-[0_10px_24px_-22px_var(--shadow)]">
        <p className="font-medium text-[var(--text)]">{scheduledWorkoutTitle}</p>
        {scheduledWorkoutDescription ? (
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-muted)]">{scheduledWorkoutDescription}</p>
        ) : null}
        {scheduledWorkoutGuidance ? (
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-muted)]">{scheduledWorkoutGuidance}</p>
        ) : null}
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
        <Badge className={workoutStatusBadgeClass(status)}>{workoutStatusLabel(status)}</Badge>
        <p className="text-sm text-[var(--text-muted)]">Käynnistetty {formatDate(selectedSession.startedAt)}</p>
        <Badge className="border-[var(--accent)] bg-[var(--surface-3)] text-[var(--accent)]">
          Treeniaika {formatWorkoutDuration(elapsedSeconds)}
        </Badge>
        {readOnly ? <Badge className="border-[var(--accent-secondary)] bg-[var(--surface-3)] text-[var(--accent-secondary)]">Lukittu</Badge> : null}
      </div>
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
        <p className="font-medium text-[var(--text)]">{scheduledWorkoutTitle}</p>
        {scheduledWorkoutDescription ? (
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-muted)]">{scheduledWorkoutDescription}</p>
        ) : null}
        {scheduledWorkoutGuidance ? (
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-muted)]">{scheduledWorkoutGuidance}</p>
        ) : null}
      </div>
      {status === "completed" && correctionMode ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
          <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-[color-mix(in_srgb,var(--accent)_18%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_6%,var(--surface))] px-3 py-2 text-xs text-[var(--text-subtle)]">
            <span>Muokkaa valmiin treenin sarjoja, päivämäärää ja kestoa.</span>
            <InfoTooltip
              side="top"
              text="Sarjamuutokset tallentuvat heti. Päivämäärä ja kesto tallennetaan niiden omista painikkeista."
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="w-full sm:max-w-[16rem]">
                  <Label htmlFor={`${scheduledWorkoutId}-date`}>Päivämäärä</Label>
                  <Input
                    id={`${scheduledWorkoutId}-date`}
                    type="date"
                    value={scheduledDateDraft}
                    onChange={(event) => {
                      setScheduledDateDraft(event.target.value);
                      setDateMessage("");
                      setDateMessageTone(null);
                    }}
                  />
                  <p className="mt-2 text-xs text-[var(--text-subtle)]">
                    Päivittää myös valmiin treenin toteutuspäivän samaan päivään.
                  </p>
                </div>
                <Button
                  type="button"
                  variant={isDateDirty ? "secondary" : "ghost"}
                  disabled={!isDateDirty || !scheduledDateDraft}
                  loading={isSavingDate}
                  loadingText="Tallennetaan päivää..."
                  className="w-full sm:w-auto"
                  onClick={async () => {
                    setIsSavingDate(true);
                    try {
                      const result = await withMinimumDelay(onUpdateDate(scheduledDateDraft));
                      setDateMessage(result.ok ? "Päivämäärä päivitetty." : result.message ?? "Päivämäärän päivitys epäonnistui.");
                      setDateMessageTone(result.ok ? "success" : "danger");
                    } finally {
                      setIsSavingDate(false);
                    }
                  }}
                >
                  Tallenna päivä
                </Button>
              </div>
              <InlineFeedback
                message={dateMessage}
                tone={dateMessageTone}
                idleMessage="Muokkaa treenin päivämäärää, jos haluat siirtää toteutuksen oikealle päivälle."
                className="mt-3 text-sm"
              />
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="w-full sm:max-w-[16rem]">
                  <Label htmlFor={`${scheduledWorkoutId}-duration`}>Kesto</Label>
                  <Input
                    id={`${scheduledWorkoutId}-duration`}
                    type="text"
                    inputMode="text"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="Esim. 45:00 tai 01:15:00"
                    value={durationDraft}
                    onChange={(event) => {
                      setDurationDraft(event.target.value);
                      setDurationMessage("");
                      setDurationMessageTone(null);
                    }}
                  />
                  <p className="mt-2 text-xs text-[var(--text-subtle)]">
                    Hyvaksyy muodot `mm:ss` ja `hh:mm:ss`.
                  </p>
                </div>
                <Button
                  type="button"
                  variant={isDurationDirty ? "secondary" : "ghost"}
                  disabled={!isDurationDirty}
                  loading={isSavingDuration}
                  loadingText="Tallennetaan kestoa..."
                  className="w-full sm:w-auto"
                  onClick={async () => {
                    const parsedDuration = parseDurationInput(durationDraft);
                    if (parsedDuration === null) {
                      setDurationMessage("Anna kesto muodossa mm:ss tai hh:mm:ss.");
                      setDurationMessageTone("danger");
                      return;
                    }

                    setIsSavingDuration(true);
                    try {
                      const result = await withMinimumDelay(onUpdateDuration(parsedDuration));
                      setDurationMessage(result.ok ? "Kesto päivitetty." : result.message ?? "Keston päivitys epäonnistui.");
                      setDurationMessageTone(result.ok ? "success" : "danger");
                    } finally {
                      setIsSavingDuration(false);
                    }
                  }}
                >
                  Tallenna kesto
                </Button>
              </div>
              <InlineFeedback
                message={durationMessage}
                tone={durationMessageTone}
                idleMessage="Muokkaa treenin kokonaiskestoa, jos ajastin jäi liian pitkäksi tai lyhyeksi."
                className="mt-3 text-sm"
              />
            </div>
          </div>
        </div>
      ) : null}
      {isSessionSyncing ? (
        <div className="rounded-2xl border border-[var(--border-strong)] bg-[color:color-mix(in_srgb,var(--surface-2)_82%,var(--surface))] px-4 py-3">
          <p className="text-sm font-semibold text-[var(--text)]">Haetaan treenin tiedot...</p>
          <p className="mt-1 text-xs text-[var(--text-subtle)]">
            Treeni aukesi jo. Synkronoidaan palvelimelta sarjat ja viimeisimmät arvot.
          </p>
        </div>
      ) : null}
      <p aria-live="polite" className="sr-only">
        {workoutMessage}
      </p>
      {isSessionSyncing ? (
        <div className="rounded-3xl border border-[var(--border-strong)] bg-[color:color-mix(in_srgb,var(--surface-2)_82%,var(--surface))] px-4 py-5 shadow-[0_12px_28px_-24px_var(--shadow)]">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent text-[var(--accent)]"
            />
            <div>
              <p className="text-sm font-semibold text-[var(--text)]">Synkronoidaan treeniä...</p>
              <p className="mt-1 text-xs text-[var(--text-subtle)]">
                Liikkeet ja sarjat avautuvat heti kun palvelimen tiedot ovat valmiina.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <>
      {!readOnly ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-[color-mix(in_srgb,var(--accent)_18%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_6%,var(--surface))] px-3 py-2 text-xs text-[var(--text-subtle)]">
          <span>Toisto- ja kuormakentissä voit painaa oikean reunan kahvaa ja vetää ylös tai alas muuttaaksesi arvoa.</span>
          <GripVertical className="size-3.5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
        </div>
      ) : null}
          {exerciseRenderBlocks.map((block) => {
            if (block.type === "single") {
              return renderExerciseGroupCard(block.groups[0]!);
            }

            return (
              <div key={block.key} className="rounded-3xl border border-[var(--accent)] bg-[var(--surface-3)]/60 p-3">
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
        </>
      )}
      {openInstruction ? (
        <CoachInstructionDialog
          exerciseName={openInstruction.exerciseName}
          instruction={openInstruction.instruction}
          onClose={() => setOpenInstruction(null)}
        />
      ) : null}

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
            const nextValue = event.target.value;
            setLocalNote(nextValue);
            if (noteSaveTimeoutRef.current !== null) {
              window.clearTimeout(noteSaveTimeoutRef.current);
            }
            noteSaveTimeoutRef.current = window.setTimeout(() => {
              onSaveNote(nextValue);
            }, 500);
          }}
          placeholder="Kirjaa treenin fiilis, mahdollinen kipu tai muu huomio. Jos treeni jäi kesken, kerro syy lyhyesti."
        />
        <p aria-live="polite" className="mt-2 text-xs text-[var(--text-subtle)]">
          Muistiinpano tallentuu automaattisesti.
        </p>
      </div>

      {status !== "completed" && restTotalSeconds > 0 && restExerciseKey ? (
        <div className="sticky bottom-[max(env(safe-area-inset-bottom),0.75rem)] z-30 mt-4 md:fixed md:bottom-3 md:right-6 md:left-auto md:mt-0 md:w-[min(18rem,calc(100vw-2rem))]">
          <div className="ml-auto w-full max-w-full rounded-2xl border border-[color-mix(in_srgb,var(--accent)_50%,var(--border))] bg-[color-mix(in_srgb,var(--surface)_94%,var(--surface-3))] px-3 py-2.5 shadow-[0_12px_26px_-20px_var(--shadow)] backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-subtle)]">
                  Lepo
                </p>
                <p className="truncate text-sm font-medium text-[var(--text)]">{restExerciseName ?? "Liike"}</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-semibold tabular-nums text-[var(--accent)]">
                  {formatDuration(restSecondsLeft)}
                </p>
                <p className="text-[10px] text-[var(--text-subtle)]">
                  {restRunning ? "Kaynnissa" : "Valmis"}
                </p>
              </div>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-3)]">
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-[width]"
                style={{
                  width: `${restTotalSeconds > 0 ? Math.round((restSecondsLeft / restTotalSeconds) * 100) : 0}%`,
                }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-[var(--text-subtle)]">
              <span>Aloitus {formatDuration(restTotalSeconds)}</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[11px] font-medium text-[var(--text-muted)] transition hover:border-[var(--border-strong)] hover:text-[var(--text)]"
                  onClick={skipRestTimer}
                >
                  Ohita
                </button>
                <button
                  type="button"
                  className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[11px] font-medium text-[var(--text-muted)] transition hover:border-[var(--border-strong)] hover:text-[var(--text)]"
                  onClick={restartRestTimer}
                >
                  Uudelleen
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="rounded-none border-0 bg-transparent p-0 shadow-none">
        {(isCompleting || isCancellingWorkout || isDeletingWorkout) ? (
          <div className="mb-3 flex items-center gap-3 rounded-2xl border border-[var(--border-strong)] bg-[color:color-mix(in_srgb,var(--surface-2)_84%,var(--surface))] px-4 py-3 text-sm text-[var(--text)] shadow-[0_12px_28px_-24px_var(--shadow)]">
            <span
              aria-hidden="true"
              className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent text-[var(--accent)]"
            />
            <span>
              {isCompleting
                ? "Tallennetaan treeni..."
                : isCancellingWorkout
                  ? "Keskeytetään treeni..."
                  : "Poistetaan treeni..."}
            </span>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-3 items-center">
          {status !== "completed" ? (
            <>
              {showResumeAction ? (
                <Button
                  onClick={async () => {
                    setIsStartingWorkout(true);
                    try {
                      await onStart();
                    } finally {
                      setIsStartingWorkout(false);
                    }
                  }}
                   type="button"
                   className="w-full sm:w-auto"
                   loading={isStartingWorkout}
                   loadingText="Käynnistetään treeni..."
                 >
                   Jatka treeniä
                 </Button>
              ) : (
                !isCompleting ? (
                  <Button
                    onClick={onComplete}
                     type="button"
                   className="w-full sm:w-auto"
                     loading={isCompleting}
                     loadingText="Tallennetaan..."
                   >
                     Merkitse valmiiksi
                   </Button>
                ) : null
              )}
              {showBottomBackToList ? (
                <Button onClick={onBackToList} type="button" variant="ghost" className="w-full sm:w-auto">
                  Takaisin treenilistaan
                </Button>
              ) : null}
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
                    onClick={(event) => {
                      console.info("[workout-ui] secondary-actions-toggle", {
                        status,
                        scheduledWorkoutId,
                        open: !isSecondaryActionsOpen,
                      });
                      toggleSecondaryActionsMenu(event.currentTarget);
                    }}
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
                            console.info("[workout-ui] resume-from-menu", { scheduledWorkoutId });
                            setIsSecondaryActionsOpen(false);
                            setSecondaryActionsAnchorRect(null);
                            setSecondaryActionsMenuStyle(null);
                            void onStart();
                          }}
                        >
                          Jatka treeniä
                        </button>
                      ) : null}
                      {showCancelAction ? (
                        <button
                          type="button"
                          role="menuitem"
                          disabled={isCancellingWorkout || isDeletingWorkout}
                          className="w-full rounded-lg px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-[var(--surface-3)]"
                          onClick={async () => {
                            console.info("[workout-ui] cancel-from-menu", { scheduledWorkoutId });
                            setIsSecondaryActionsOpen(false);
                            setSecondaryActionsAnchorRect(null);
                            setSecondaryActionsMenuStyle(null);
                            setIsCancellingWorkout(true);
                            try {
                              await onCancel();
                            } finally {
                              setIsCancellingWorkout(false);
                            }
                          }}
                        >
                          {isCancellingWorkout ? "Keskeytetään treeni..." : "Keskeytä treeni"}
                        </button>
                      ) : null}
                      {showDeleteAction ? (
                        <button
                          type="button"
                          role="menuitem"
                          disabled={isDeletingWorkout || isCancellingWorkout}
                          className="w-full rounded-lg px-3 py-2 text-left text-sm text-[var(--danger)] hover:bg-[var(--surface-3)]"
                          onClick={async () => {
                            console.info("[workout-ui] delete-from-menu", { scheduledWorkoutId });
                            setIsSecondaryActionsOpen(false);
                            setSecondaryActionsAnchorRect(null);
                            setSecondaryActionsMenuStyle(null);
                            setIsDeletingWorkout(true);
                            try {
                              await onDelete();
                            } finally {
                              setIsDeletingWorkout(false);
                            }
                          }}
                        >
                          {isDeletingWorkout ? "Poistetaan treeni..." : "Poista treeni"}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <div className="inline-flex items-center gap-1.5">
              {showBottomBackToList ? (
                <Button onClick={onBackToList} type="button" variant="ghost">
                  {correctionMode ? "Valmis" : "Takaisin treenilistaan"}
                </Button>
              ) : null}
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
                    onClick={(event) => {
                      console.info("[workout-ui] completed-secondary-actions-toggle", {
                        status,
                        scheduledWorkoutId,
                        open: !isSecondaryActionsOpen,
                      });
                      toggleSecondaryActionsMenu(event.currentTarget);
                    }}
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
                          console.info("[workout-ui] delete-completed-from-menu", { scheduledWorkoutId });
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
