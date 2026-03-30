import type { AppState, UserProfile } from "@/lib/types";

import { canTrackOwnTraining } from "@/lib/role-access";

type ReminderWindowState = {
  cycleKey: string | null;
  isDue: boolean;
  isWindowOpen: boolean;
  weightDue: boolean;
  waistDue: boolean;
};

type ZonedDateParts = {
  year: number;
  month: number;
  day: number;
  weekday: number;
  hour: number;
};

const REMINDER_TIME_ZONE = "Europe/Helsinki";
const REMINDER_START_HOUR = 6;
const DAY_MS = 24 * 60 * 60 * 1000;

const zonedDateTimeFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: REMINDER_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
  hour: "2-digit",
  hourCycle: "h23",
});

function getZonedDateParts(date: Date): ZonedDateParts {
  const parts = zonedDateTimeFormatter.formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  const weekdayValue = values.get("weekday");
  const weekdayMap: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 0,
  };

  return {
    year: Number(values.get("year") ?? 0),
    month: Number(values.get("month") ?? 0),
    day: Number(values.get("day") ?? 0),
    weekday: weekdayMap[weekdayValue ?? "Sun"] ?? 0,
    hour: Number(values.get("hour") ?? 0),
  };
}

function dateKeyFromUtcDate(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getCurrentCycleKey(date: Date) {
  const zoned = getZonedDateParts(date);
  const daysFromMonday = (zoned.weekday + 6) % 7;
  const currentLocalDayAtUtcNoon = new Date(Date.UTC(zoned.year, zoned.month - 1, zoned.day, 12));
  const fridayAtUtcNoon = new Date(currentLocalDayAtUtcNoon.getTime() + (4 - daysFromMonday) * DAY_MS);
  return dateKeyFromUtcDate(fridayAtUtcNoon);
}

function isReminderWindowOpen(date: Date) {
  const zoned = getZonedDateParts(date);
  return (
    (zoned.weekday === 5 && zoned.hour >= REMINDER_START_HOUR) ||
    zoned.weekday === 6 ||
    zoned.weekday === 0
  );
}

function getLatestMetricTimestamp(
  state: AppState,
  userId: string,
  metric: "weightKg" | "waistCm",
  fallbackUser?: UserProfile,
) {
  const matching = state.bodyMeasurements
    .filter((entry) => entry.userId === userId && typeof entry[metric] === "number")
    .sort((a, b) => new Date(b.measuredAt).getTime() - new Date(a.measuredAt).getTime())[0];

  if (matching?.measuredAt) {
    return new Date(matching.measuredAt);
  }

  if (fallbackUser && typeof fallbackUser[metric] === "number") {
    return new Date(fallbackUser.updatedAt);
  }

  return null;
}

export function getMeasurementReminderState(
  state: AppState,
  user: UserProfile | null,
  now = new Date(),
): ReminderWindowState {
  if (!user || !canTrackOwnTraining(user.role)) {
    return {
      cycleKey: null,
      isDue: false,
      isWindowOpen: false,
      weightDue: false,
      waistDue: false,
    };
  }

  const isWindowOpen = isReminderWindowOpen(now);
  const cycleKey = getCurrentCycleKey(now);
  const latestWeightAt = getLatestMetricTimestamp(state, user.id, "weightKg", user);
  const latestWaistAt = getLatestMetricTimestamp(state, user.id, "waistCm", user);
  const weightDue = !latestWeightAt || getCurrentCycleKey(latestWeightAt) !== cycleKey;
  const waistDue = !latestWaistAt || getCurrentCycleKey(latestWaistAt) !== cycleKey;

  return {
    cycleKey: isWindowOpen ? cycleKey : null,
    isDue: isWindowOpen && weightDue && waistDue,
    isWindowOpen,
    weightDue,
    waistDue,
  };
}
