import { isProgramActive } from "./program-status";
import type { AppState } from "./types";

export type RhythmTraining = "done" | "plan" | "rest";
export type RhythmNutrition = "ok" | "part" | "none";
export type AthleteStatusTone = "good" | "warn" | "neutral";

export interface AthleteRhythmCell {
  /** YYYY-MM-DD local date key */
  key: string;
  /** Ma, Ti, … Su */
  weekdayLabel: string;
  isToday: boolean;
  training: RhythmTraining;
  nutrition: RhythmNutrition;
}

export interface AthleteRosterSummary {
  /** Treenejä viikossa, aktiivisten ohjelmien treenipäivien summa. */
  weeklyTarget: number;
  /** Tällä viikolla valmiiksi merkityt treenit. */
  doneThisWeek: number;
  statusLabel: string;
  statusTone: AthleteStatusTone;
  /** "tänään" | "eilen" | "Ma".."Su" | lyhyt päivämäärä | "—" */
  lastSeenLabel: string;
  cells: AthleteRhythmCell[];
}

const WEEKDAY_LABELS = ["Ma", "Ti", "Ke", "To", "Pe", "La", "Su"];

function toLocalDateKey(value: string | Date): string {
  const parsed = value instanceof Date ? value : new Date(value);
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfWeekMonday(reference: Date): Date {
  const start = new Date(reference);
  start.setHours(0, 0, 0, 0);
  const daysSinceMonday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - daysSinceMonday);
  return start;
}

/**
 * Rakentaa valmentajan tiiminäkymän urheilijakortin yhteenvedon: viikkorytmin
 * (treeni + ravinto per päivä), viikkotavoitteen ja tila-pillerin.
 *
 * Mirroraa urheilijan oman Viikkorytmi-näkymän semantiikkaa: treeni "done" =
 * päivänä valmiiksi merkitty treeni, "plan" = kesken oleva (in_progress) treeni,
 * muuten "rest". Ravinto ok/part/none day_meal_plan -riveistä.
 */
export function buildAthleteRosterSummary(
  state: AppState,
  athleteId: string,
  reference: Date = new Date(),
): AthleteRosterSummary {
  const weekStart = startOfWeekMonday(reference);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const todayKey = toLocalDateKey(reference);

  const activePlans = state.plans.filter(
    (plan) => plan.athleteId === athleteId && isProgramActive(plan),
  );
  const weeklyTarget = activePlans.reduce(
    (sum, plan) => sum + (plan.workouts?.length ?? 0),
    0,
  );

  const sessionByWorkoutId = new Map(
    state.sessions
      .filter((session) => session.athleteId === athleteId)
      .map((session) => [session.scheduledWorkoutId, session]),
  );

  const athleteWorkouts = state.scheduledWorkouts.filter(
    (workout) => workout.athleteId === athleteId,
  );

  // Treenitila per päiväavain tältä viikolta.
  const trainingByDay = new Map<string, RhythmTraining>();
  let lastCompletedAt: string | undefined;
  let doneThisWeek = 0;

  athleteWorkouts.forEach((workout) => {
    const completedAt =
      workout.completedAt ?? sessionByWorkoutId.get(workout.id)?.completedAt;

    if (workout.status === "completed") {
      const stamp = completedAt ?? workout.scheduledDate;
      if (!lastCompletedAt || stamp.localeCompare(lastCompletedAt) > 0) {
        lastCompletedAt = stamp;
      }
      const dayKey = toLocalDateKey(stamp);
      const day = new Date(dayKey);
      if (day >= weekStart && day < weekEnd) {
        doneThisWeek += 1;
        trainingByDay.set(dayKey, "done");
      }
      return;
    }

    if (workout.status === "in_progress") {
      const dayKey = toLocalDateKey(workout.scheduledDate);
      const day = new Date(dayKey);
      if (day >= weekStart && day < weekEnd && trainingByDay.get(dayKey) !== "done") {
        trainingByDay.set(dayKey, "plan");
      }
    }
  });

  // Ravintotila per päiväavain.
  const nutritionByDay = new Map<string, { total: number; eaten: number }>();
  (state.dayMealPlans ?? [])
    .filter((entry) => entry.athleteId === athleteId)
    .forEach((entry) => {
      const current = nutritionByDay.get(entry.planDate) ?? { total: 0, eaten: 0 };
      current.total += 1;
      if (entry.eatenAt) {
        current.eaten += 1;
      }
      nutritionByDay.set(entry.planDate, current);
    });

  const cells: AthleteRhythmCell[] = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    const key = toLocalDateKey(date);
    const nutrition = nutritionByDay.get(key);
    const nutritionStatus: RhythmNutrition =
      nutrition && nutrition.total > 0 && nutrition.eaten >= nutrition.total
        ? "ok"
        : nutrition && nutrition.eaten > 0
          ? "part"
          : "none";

    return {
      key,
      weekdayLabel: WEEKDAY_LABELS[index],
      isToday: key === todayKey,
      training: trainingByDay.get(key) ?? "rest",
      nutrition: nutritionStatus,
    };
  });

  // Tila-pilleri: tahtiin verrattuna.
  const daysElapsed = Math.min(
    7,
    Math.max(1, Math.floor((reference.getTime() - weekStart.getTime()) / 86_400_000) + 1),
  );
  const expectedByNow = Math.floor((daysElapsed / 7) * weeklyTarget);
  const behind = Math.max(0, expectedByNow - doneThisWeek);

  let statusLabel: string;
  let statusTone: AthleteStatusTone;
  if (weeklyTarget === 0) {
    statusLabel = "Ei ohjelmaa";
    statusTone = "neutral";
  } else if (doneThisWeek >= weeklyTarget) {
    statusLabel = "Viikko valmis";
    statusTone = "good";
  } else if (behind > 0) {
    statusLabel = `${behind} ${behind === 1 ? "treeni" : "treeniä"} jäljessä`;
    statusTone = "warn";
  } else {
    statusLabel = "Rytmissä";
    statusTone = "good";
  }

  return {
    weeklyTarget,
    doneThisWeek,
    statusLabel,
    statusTone,
    lastSeenLabel: formatLastSeen(lastCompletedAt, reference),
    cells,
  };
}

function formatLastSeen(value: string | undefined, reference: Date): string {
  if (!value) {
    return "—";
  }

  const todayKey = toLocalDateKey(reference);
  const yesterday = new Date(reference);
  yesterday.setDate(yesterday.getDate() - 1);
  const valueKey = toLocalDateKey(value);

  if (valueKey === todayKey) {
    return "tänään";
  }
  if (valueKey === toLocalDateKey(yesterday)) {
    return "eilen";
  }

  const weekStart = startOfWeekMonday(reference);
  const valueDate = new Date(valueKey);
  if (valueDate >= weekStart) {
    return WEEKDAY_LABELS[(valueDate.getDay() + 6) % 7];
  }

  return new Intl.DateTimeFormat("fi-FI", { day: "numeric", month: "numeric" }).format(valueDate);
}
