import type { ScheduledWorkout } from "@/lib/types";

type WorkoutTitleSource = Pick<
  ScheduledWorkout,
  "id" | "title" | "programWorkoutId" | "templateId" | "scheduledDate" | "createdAt" | "updatedAt"
>;

export type WorkoutHistoryTitleInfo = {
  title: string;
  occurrenceNumber: number;
  occurrenceLabel: string;
};

const singleLetterSuffixPattern = /^[A-Za-zÅÄÖåäö]$/;
const numericSuffixPattern = /^\d{1,2}$/;

export function normalizeWorkoutHistoryTitle(title: string) {
  const cleaned = title.trim().replace(/\s+/g, " ");
  if (!cleaned) {
    return "Harjoitus";
  }

  const tokens = cleaned.split(" ");
  if (tokens.length < 2 || tokens.length > 3) {
    return cleaned;
  }

  const lastToken = tokens[tokens.length - 1];
  const hasVariantSuffix =
    numericSuffixPattern.test(lastToken) || singleLetterSuffixPattern.test(lastToken);
  if (!hasVariantSuffix) {
    return cleaned;
  }

  const baseTitle = tokens.slice(0, -1).join(" ").trim();
  if (baseTitle.length < 3) {
    return cleaned;
  }

  return baseTitle;
}

export function buildWorkoutHistoryTitleMap(workouts: WorkoutTitleSource[]) {
  const sorted = [...workouts].sort((left, right) => {
    const leftTime = resolveWorkoutSortTime(left);
    const rightTime = resolveWorkoutSortTime(right);
    if (leftTime !== rightTime) {
      return leftTime - rightTime;
    }

    return left.id.localeCompare(right.id);
  });

  const perGroupCount = new Map<string, number>();
  const titleByWorkoutId = new Map<string, WorkoutHistoryTitleInfo>();

  sorted.forEach((workout) => {
    const normalizedTitle = normalizeWorkoutHistoryTitle(workout.title);
    const groupKey = resolveWorkoutGroupKey(workout, normalizedTitle);
    const occurrenceNumber = (perGroupCount.get(groupKey) ?? 0) + 1;
    perGroupCount.set(groupKey, occurrenceNumber);

    titleByWorkoutId.set(workout.id, {
      title: normalizedTitle,
      occurrenceNumber,
      occurrenceLabel: `Treeni ${occurrenceNumber}`,
    });
  });

  return titleByWorkoutId;
}

function resolveWorkoutGroupKey(workout: WorkoutTitleSource, normalizedTitle: string) {
  const rawTitle = workout.title.trim().replace(/\s+/g, " ");
  const titleWasNormalized = normalizedTitle !== rawTitle;

  if (titleWasNormalized) {
    return `normalized:${normalizedTitle.toLowerCase()}`;
  }

  if (workout.programWorkoutId) {
    return `program:${workout.programWorkoutId}`;
  }

  if (workout.templateId) {
    return `template:${workout.templateId}`;
  }

  return `title:${normalizedTitle.toLowerCase()}`;
}

function resolveWorkoutSortTime(workout: WorkoutTitleSource) {
  const scheduledTime = Date.parse(workout.scheduledDate);
  if (Number.isFinite(scheduledTime)) {
    return scheduledTime;
  }

  const createdTime = Date.parse(workout.createdAt);
  if (Number.isFinite(createdTime)) {
    return createdTime;
  }

  const updatedTime = Date.parse(workout.updatedAt);
  if (Number.isFinite(updatedTime)) {
    return updatedTime;
  }

  return 0;
}
