import { workoutStatusBadgeClass } from "@/components/workout/shared";

export function formatDuration(seconds: number) {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export function formatWorkoutDuration(seconds: number) {
  const safe = Math.max(0, seconds);
  if (safe < 3600) {
    return formatDuration(safe);
  }

  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remainder = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export function formatLiftedKgValue(value: number) {
  return `${Math.round(value)} kg`;
}

export function formatLoadValue(value: number) {
  const decimals = Number.isInteger(value) ? 0 : 1;
  return new Intl.NumberFormat("fi-FI", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatEstimatedCaloriesValue(value: number) {
  return `${Math.round(value)} kcal`;
}

export function statusTone(status: string) {
  return workoutStatusBadgeClass(status);
}

export function toLocalDateKey(value: string | Date) {
  const parsed = value instanceof Date ? value : new Date(value);
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatCalendarDate(value: Date) {
  return new Intl.DateTimeFormat("fi-FI", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).format(value);
}
