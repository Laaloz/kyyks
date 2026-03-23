import type { AppState, UserProfile } from "@/lib/types";

type ReminderWindowState = {
  cycleKey: string | null;
  isDue: boolean;
  isWindowOpen: boolean;
  weightDue: boolean;
  waistDue: boolean;
};

function startOfLocalDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function startOfLocalWeek(date: Date) {
  const next = startOfLocalDay(date);
  const day = (next.getDay() + 6) % 7;
  next.setDate(next.getDate() - day);
  return next;
}

function fridayOfCurrentWeek(date: Date) {
  const next = startOfLocalWeek(date);
  next.setDate(next.getDate() + 4);
  return next;
}

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
  if (!user || user.role !== "athlete") {
    return {
      cycleKey: null,
      isDue: false,
      isWindowOpen: false,
      weightDue: false,
      waistDue: false,
    };
  }

  const day = now.getDay();
  const isWindowOpen = day === 5 || day === 6 || day === 0;
  const weekStart = startOfLocalWeek(now).getTime();
  const latestWeightAt = getLatestMetricTimestamp(state, user.id, "weightKg", user);
  const latestWaistAt = getLatestMetricTimestamp(state, user.id, "waistCm", user);
  const weightDue = !latestWeightAt || latestWeightAt.getTime() < weekStart;
  const waistDue = !latestWaistAt || latestWaistAt.getTime() < weekStart;
  const cycleKey = isWindowOpen ? localDateKey(fridayOfCurrentWeek(now)) : null;

  return {
    cycleKey,
    isDue: isWindowOpen && (weightDue || waistDue),
    isWindowOpen,
    weightDue,
    waistDue,
  };
}
