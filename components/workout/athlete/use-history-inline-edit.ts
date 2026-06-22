"use client";

import { useEffect, useState } from "react";

import type { WorkoutInsight } from "@/components/workout/athlete/dashboard-insights";
import type { ExtraActivity, ExtraActivityType, WorkoutSession } from "@/lib/types";
import { useAppState } from "@/providers/app-state-provider";

type HistoryEditDraft = {
  workoutId: string;
  durationMin: number;
  exercises: Array<{
    name: string;
    target: string;
    sets: Array<{ logId: string; load: number; reps: number; targetMin?: number }>;
  }>;
};

type ExtraEditDraft = {
  activityId: string;
  activityType: ExtraActivityType;
  durationMin: number;
  kcal: number;
  occurredDate: string;
  notes: string;
};

// Historian inline-muokkaus: treenihistorian (per-sarja load/reps + kesto) ja
// extra-treenien luonnokset + tallennus + ryhmien laajennustila. Renderin
// inline-mutaatiot käyttävät paljastettuja settereitä sellaisenaan.
export function useHistoryInlineEdit({
  sessionByWorkoutId,
  workoutInsights,
  currentUserId,
  setWorkoutMessage,
}: {
  sessionByWorkoutId: Map<string, WorkoutSession>;
  workoutInsights: Map<string, WorkoutInsight>;
  currentUserId: string | undefined;
  setWorkoutMessage: (message: string) => void;
}) {
  const { updateWorkoutSet, updateWorkoutDuration, updateExtraActivity, notify } = useAppState();

  const [expandedHistoryGroups, setExpandedHistoryGroups] = useState<Record<string, boolean>>({});
  const [historyEditDraft, setHistoryEditDraft] = useState<HistoryEditDraft | null>(null);
  const [isSavingHistoryEdit, setIsSavingHistoryEdit] = useState(false);
  const [extraEditDraft, setExtraEditDraft] = useState<ExtraEditDraft | null>(null);
  const [isSavingExtraEdit, setIsSavingExtraEdit] = useState(false);

  useEffect(() => {
    setExpandedHistoryGroups({});
  }, [currentUserId]);

  const startHistoryEdit = (workoutId: string) => {
    const session = sessionByWorkoutId.get(workoutId);
    const insight = workoutInsights.get(workoutId);
    const exercises: Array<{ name: string; target: string; sets: Array<{ logId: string; load: number; reps: number; targetMin?: number }> }> = [];
    (session?.setLogs ?? []).forEach((log) => {
      const name = log.exerciseName?.trim() || "Liike";
      const repMin = log.targetRepsMin ?? log.targetReps;
      const repMax = log.targetRepsMax ?? log.targetReps;
      const target =
        repMin !== undefined && repMax !== undefined && repMax > repMin ? `${repMin}-${repMax}` : `${repMin ?? log.targetReps ?? ""}`;
      const group = exercises.find((item) => item.name === name);
      const entry = { logId: log.id, load: log.actualLoad ?? 0, reps: log.actualReps ?? 0, targetMin: repMin };
      if (group) {
        group.sets.push(entry);
      } else {
        exercises.push({ name, target, sets: [entry] });
      }
    });
    setHistoryEditDraft({
      workoutId,
      durationMin: Math.max(1, Math.round((insight?.durationSeconds ?? 0) / 60)),
      exercises,
    });
  };

  const saveHistoryEdit = async () => {
    if (!historyEditDraft) {
      return;
    }
    setIsSavingHistoryEdit(true);
    try {
      for (const exercise of historyEditDraft.exercises) {
        for (const set of exercise.sets) {
          await updateWorkoutSet(historyEditDraft.workoutId, set.logId, { actualLoad: set.load, actualReps: set.reps });
        }
      }
      const result = await updateWorkoutDuration(historyEditDraft.workoutId, historyEditDraft.durationMin * 60);
      setWorkoutMessage(result.ok ? "Muutokset tallennettu." : result.message);
      if (result.ok) {
        setHistoryEditDraft(null);
      }
    } finally {
      setIsSavingHistoryEdit(false);
    }
  };

  const startExtraEdit = (activity: ExtraActivity) => {
    setExpandedHistoryGroups((current) => ({ ...current, [`extra-${activity.id}`]: true }));
    setExtraEditDraft({
      activityId: activity.id,
      activityType: activity.activityType,
      durationMin: Math.max(1, activity.durationMinutes),
      kcal: activity.estimatedKcal,
      occurredDate: activity.occurredAt.slice(0, 10),
      notes: activity.notes ?? "",
    });
  };

  const saveExtraEdit = async () => {
    if (!extraEditDraft) {
      return;
    }
    setIsSavingExtraEdit(true);
    try {
      const result = await updateExtraActivity(extraEditDraft.activityId, {
        activityType: extraEditDraft.activityType,
        durationMinutes: extraEditDraft.durationMin,
        manualKcal: extraEditDraft.kcal,
        occurredAt: new Date(`${extraEditDraft.occurredDate}T12:00:00`).toISOString(),
        notes: extraEditDraft.notes,
      });
      if (result.ok) {
        notify({ tone: "success", message: "Extra-treeni päivitetty." });
        setExtraEditDraft(null);
      } else {
        notify({ tone: "danger", message: result.message });
      }
    } finally {
      setIsSavingExtraEdit(false);
    }
  };

  return {
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
  };
}
