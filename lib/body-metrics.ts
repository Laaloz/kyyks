import type { AppState, BodyMeasurement, UserProfile } from "@/lib/types";

const DEFAULT_WEIGHT_KG = 75;

function sortMeasurementsNewestFirst(a: BodyMeasurement, b: BodyMeasurement) {
  return new Date(b.measuredAt).getTime() - new Date(a.measuredAt).getTime();
}

export function getMeasurementsForUser(state: Pick<AppState, "bodyMeasurements">, userId: string) {
  return state.bodyMeasurements
    .filter((entry) => entry.userId === userId)
    .sort(sortMeasurementsNewestFirst);
}

export function getWeightAtMoment(
  user: Pick<UserProfile, "weightKg"> | undefined,
  measurements: BodyMeasurement[],
  atIso?: string,
) {
  if (!atIso) {
    return measurements.find((entry) => entry.weightKg !== undefined)?.weightKg ?? user?.weightKg;
  }

  const targetTime = new Date(atIso).getTime();
  const matched = measurements.find((entry) => {
    if (entry.weightKg === undefined) {
      return false;
    }

    const measuredAtMs = new Date(entry.measuredAt).getTime();
    return Number.isFinite(measuredAtMs) && measuredAtMs <= targetTime;
  });

  return matched?.weightKg ?? user?.weightKg;
}

export function estimateStrengthCalories(input: {
  durationSeconds: number;
  completionPercent: number;
  completedSetCount: number;
  weightKg?: number;
}) {
  const { durationSeconds, completionPercent, completedSetCount, weightKg } = input;

  if (durationSeconds <= 0 || completedSetCount === 0) {
    return 0;
  }

  const durationMinutes = durationSeconds / 60;
  const normalizedCompletion = Math.min(1, Math.max(0, completionPercent / 100));
  const normalizedSetVolume = Math.min(1, completedSetCount / 18);
  const met = 3.8 + normalizedCompletion * 1.2 + normalizedSetVolume * 0.8;
  const effectiveWeight = weightKg ?? DEFAULT_WEIGHT_KG;

  return Math.max(0, Math.round(durationMinutes * ((met * 3.5 * effectiveWeight) / 200)));
}
