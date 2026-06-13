import { Activity, Bike, CircleDot, Dumbbell, Flame, Footprints, HeartPulse, Mountain, Music, PersonStanding, Snowflake, Swords, Waves } from "lucide-react";
import type { ComponentType } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CardDescription, CardTitle } from "@/components/ui/card";
import { isProgramActive } from "@/lib/program-status";
import { normalizeWorkoutHistoryTitle } from "@/lib/workout-history-title";
import { formatDateWithWeekday } from "@/lib/utils";
import { PROGRAMS_DASHBOARD_VIEW, type AppState, type DashboardHomeView, type Role, type UserProfile } from "@/lib/types";

export const PROGRAMS_WORKSPACE_VIEW = PROGRAMS_DASHBOARD_VIEW;

// The compatibility "templates" route key now renders the programs workspace.
export type WorkspaceView = DashboardHomeView | "settings";

export function metricTone(role: Role | null) {
  switch (role) {
    case "admin":
      return "border-[var(--border-strong)] text-[var(--accent-secondary)]";
    case "coach":
      return "border-[var(--accent-tertiary)] text-[var(--accent-tertiary)]";
    case "athlete":
    case "independent_athlete":
      return "border-[var(--accent)] text-[var(--accent)]";
    default:
      return "border-[var(--border-strong)] text-[var(--text)]";
  }
}

export function roleLabel(role: Role) {
  if (role === "admin") return "Admin";
  if (role === "coach") return "Valmentaja";
  if (role === "independent_athlete") return "Itsenäinen treenaaja";
  return "Treenaaja";
}

export function workoutStatusLabel(status: string) {
  switch (status) {
    case "in_progress":
      return "Kesken";
    case "completed":
      return "Valmis";
    case "cancelled":
      return "Keskeytetty";
    default:
      return "Keskeytetty";
  }
}

export function workoutStatusBadgeClass(status: string) {
  switch (status) {
    case "in_progress":
      return "border-[color-mix(in_srgb,var(--warning)_40%,var(--border))] bg-[color:color-mix(in_srgb,var(--warning)_14%,var(--surface))] text-[var(--warning)]";
    case "completed":
      return "border-[color-mix(in_srgb,var(--success)_40%,var(--border))] bg-[color:color-mix(in_srgb,var(--success)_14%,var(--surface))] text-[var(--success)]";
    case "cancelled":
      return "border-[color-mix(in_srgb,var(--danger)_40%,var(--border))] bg-[color:color-mix(in_srgb,var(--danger)_12%,var(--surface))] text-[var(--danger)]";
    default:
      return "border-[var(--border-strong)] bg-[var(--surface-3)] text-[var(--text-subtle)]";
  }
}

export function MetricGrid({
  metrics,
  role,
  compact = false,
}: {
  metrics: Array<{ label: string; value: number; icon: ComponentType<{ className?: string }> }>;
  role: Role | null;
  compact?: boolean;
}) {
  return (
    <div className={`grid md:grid-cols-2 xl:grid-cols-4 ${compact ? "gap-2.5" : "gap-4"}`}>
      {metrics.map((metric) => (
        <Card key={metric.label} className={compact ? "rounded-2xl px-3.5 py-3" : ""}>
          <div className={`flex justify-between ${compact ? "items-center gap-3" : "items-start gap-4"}`}>
            <div className={compact ? "min-w-0 flex-1" : ""}>
              <p className={`font-medium text-[var(--text-subtle)] ${compact ? "text-[11px]" : "text-xs"}`}>
                {metric.label}
              </p>
              <p
                className={`font-[family-name:var(--font-display)] font-semibold tabular-nums text-[var(--text)] ${
                  compact ? "mt-1 text-[1.7rem] leading-none" : "mt-4 text-4xl"
                }`}
              >
                {metric.value}
              </p>
            </div>
            <metric.icon className={`shrink-0 ${compact ? "size-5" : "size-6"} ${metricTone(role)}`} />
          </div>
        </Card>
      ))}
    </div>
  );
}

export function ProgressRing({
  percent,
  label,
  showLabel = true,
}: {
  percent: number;
  label: string;
  showLabel?: boolean;
}) {
  const safePercent = Math.max(0, Math.min(100, percent));
  const ringRadius = 62;
  const ringStrokeWidth = 6;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference - (safePercent / 100) * ringCircumference;

  return (
    <div className="flex flex-col items-center text-center">
      <div
        aria-label={`${label} ${safePercent}%`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={safePercent}
        className="relative grid size-[8.5rem] place-items-center"
        role="progressbar"
      >
        <svg className="absolute inset-0 size-full -rotate-90" viewBox="0 0 144 144" aria-hidden="true">
          <circle
            cx="72"
            cy="72"
            r={ringRadius}
            fill="none"
            stroke="color-mix(in srgb, var(--surface-4) 82%, var(--border))"
            strokeWidth={ringStrokeWidth}
          />
          <circle
            cx="72"
            cy="72"
            r={ringRadius}
            fill="none"
            stroke="var(--accent)"
            strokeLinecap="round"
            strokeWidth={ringStrokeWidth}
            strokeDasharray={ringCircumference}
            strokeDashoffset={ringOffset}
          />
        </svg>
        <div className="flex size-[6.75rem] flex-col items-center justify-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] shadow-[0_1px_0_0_var(--shadow-soft)]">
          <Flame className="size-8 text-[var(--accent)]" />
          <p className="font-[family-name:var(--font-display)] text-3xl font-semibold leading-none text-[var(--text)]">
            {safePercent}%
          </p>
        </div>
      </div>
      {showLabel ? <p className="mt-3 text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">{label}</p> : null}
    </div>
  );
}

export function OwnTrainingOverviewCard({
  currentUser,
  state,
  onOpenWorkoutLog,
}: {
  currentUser: UserProfile;
  state: AppState;
  onOpenWorkoutLog?: () => void;
}) {
  const toLocalDateKey = (value: string | Date) => {
    const date = value instanceof Date ? value : new Date(value);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };
  const renderCalendarActivityIcon = (activityType: string) => {
    if (activityType === "strength") return <Dumbbell className="size-3.5" aria-hidden="true" />;
    if (activityType === "run" || activityType === "treadmill") return <Footprints className="size-3.5" aria-hidden="true" />;
    if (activityType === "walk") return <PersonStanding className="size-3.5" aria-hidden="true" />;
    if (activityType === "cycle" || activityType === "indoor_cycle" || activityType === "mtb") return <Bike className="size-3.5" aria-hidden="true" />;
    if (activityType === "swim" || activityType === "paddle") return <Waves className="size-3.5" aria-hidden="true" />;
    if (activityType === "climb" || activityType === "hike" || activityType === "stair_climber") return <Mountain className="size-3.5" aria-hidden="true" />;
    if (activityType === "row" || activityType === "elliptical") return <Activity className="size-3.5" aria-hidden="true" />;
    if (activityType === "ski" || activityType === "downhill_ski" || activityType === "skate") return <Snowflake className="size-3.5" aria-hidden="true" />;
    if (activityType === "yoga" || activityType === "mobility") return <HeartPulse className="size-3.5" aria-hidden="true" />;
    if (activityType === "hiit") return <Flame className="size-3.5" aria-hidden="true" />;
    if (activityType === "combat") return <Swords className="size-3.5" aria-hidden="true" />;
    if (activityType === "dance") return <Music className="size-3.5" aria-hidden="true" />;
    return <CircleDot className="size-3.5" aria-hidden="true" />;
  };
  const ownPrograms = state.plans.filter(
    (plan) => plan.athleteId === currentUser.id && Boolean(plan.workouts?.length) && isProgramActive(plan),
  );
  const ownWorkouts = state.scheduledWorkouts.filter((workout) => workout.athleteId === currentUser.id);
  const inProgressCount = ownWorkouts.filter((workout) => workout.status === "in_progress").length;
  const completedLastWeekCount = ownWorkouts.filter((workout) => {
    if (workout.status !== "completed") {
      return false;
    }

    const completedMoment = Date.parse(workout.completedAt ?? workout.updatedAt);
      return Number.isFinite(completedMoment) && Date.now() - completedMoment <= 7 * 24 * 60 * 60 * 1000;
  }).length;
  const weeklyTargetCount = ownPrograms.reduce((sum, program) => sum + (program.workouts?.length ?? 0), 0);
  const completionRate = weeklyTargetCount
    ? Math.min(Math.round((completedLastWeekCount / weeklyTargetCount) * 100), 100)
    : 0;
  const latestCompletedWorkout = [...ownWorkouts]
    .filter((workout) => workout.status === "completed")
    .sort((left, right) =>
      (right.completedAt ?? right.updatedAt).localeCompare(left.completedAt ?? left.updatedAt),
    )[0];
  const highlightedWorkout = ownWorkouts.find((workout) => workout.status === "in_progress");
  const highlightedState = highlightedWorkout ? "active" : ownPrograms.length > 0 ? "ready" : "empty";
  const historyActivityByDay = new Map<string, Record<string, number>>();
  ownWorkouts.forEach((workout) => {
    if (workout.status !== "completed") {
      return;
    }
    const completedAt = workout.completedAt ?? workout.updatedAt;
    const key = toLocalDateKey(completedAt);
    const current = historyActivityByDay.get(key) ?? {};
    historyActivityByDay.set(key, { ...current, strength: (current.strength ?? 0) + 1 });
  });
  (state.extraActivities ?? [])
    .filter((activity) => activity.athleteId === currentUser.id)
    .forEach((activity) => {
      const key = toLocalDateKey(activity.occurredAt);
      const current = historyActivityByDay.get(key) ?? {};
      historyActivityByDay.set(key, { ...current, [activity.activityType]: (current[activity.activityType] ?? 0) + 1 });
    });
  const todayCalendarKey = toLocalDateKey(new Date());
  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const overviewWeekCells = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    const key = toLocalDateKey(date);
    const activityByType = historyActivityByDay.get(key) ?? {};
    const activityCount = Object.values(activityByType).reduce((sum, count) => sum + count, 0);
    return { key, date, activityByType, activityCount };
  });

  return (
    <Card className="border-[var(--border-strong)]">
      <div className="space-y-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Yhteenveto</p>
          <CardTitle className="mt-2 text-2xl">Tämä viikko</CardTitle>
          <CardDescription className="mt-2 max-w-3xl leading-7">
            Näet oman treeniseurannan, viimeisimmän toteutuksen ja seuraavan askeleen yhdellä silmäyksellä.
          </CardDescription>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-2.5 sm:p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-[var(--text)]">Viikkonäkymä</p>
            <p className="text-xs text-[var(--text-subtle)]">Ma–Su</p>
          </div>
          <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[10px] text-[var(--text-subtle)] sm:text-[11px]">
            {["Ma", "Ti", "Ke", "To", "Pe", "La", "Su"].map((label) => (
              <p key={`shared-overview-week-${label}`}>{label}</p>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1.5">
            {overviewWeekCells.map((cell) => {
              const iconKeys = Object.keys(cell.activityByType).filter((key) => (cell.activityByType[key] ?? 0) > 0);
              const firstIcon = iconKeys[0];
              const extraTypeCount = Math.max(0, iconKeys.length - 1);
              const hasActivity = cell.activityCount > 0;
              const isToday = cell.key === todayCalendarKey;

              return (
                <button
                  type="button"
                  key={`shared-overview-week-cell-${cell.key}`}
                  className={`relative aspect-square w-full max-w-11 min-h-0 min-w-0 justify-self-center appearance-none rounded-full border p-0 ${
                    isToday
                      ? "border-[var(--accent)] bg-[color:color-mix(in_srgb,var(--accent)_14%,var(--surface))]"
                      : "border-[var(--border)] bg-[var(--surface)]"
                  } ${hasActivity ? "cursor-pointer hover:border-[var(--accent)]" : "cursor-pointer hover:border-[var(--border-strong)]"}`}
                  aria-label={`${formatDateWithWeekday(cell.date.toISOString())} avaa treenit`}
                  onClick={() => onOpenWorkoutLog?.()}
                >
                  {hasActivity ? (
                    <div className={`flex h-full w-full items-center justify-center rounded-full ${isToday ? "bg-[var(--accent)] text-[var(--accent-contrast)]" : "bg-[color:color-mix(in_srgb,var(--accent)_12%,var(--surface))] text-[var(--accent)]"}`}>
                      <span className="grid size-8 place-items-center">
                        {firstIcon ? renderCalendarActivityIcon(firstIcon) : null}
                      </span>
                    </div>
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <span className="text-xs text-[var(--text-subtle)]">{cell.date.getDate()}</span>
                    </div>
                  )}
                  {extraTypeCount > 0 ? (
                    <span className="absolute -bottom-1 -right-1 grid min-h-4 min-w-4 place-items-center rounded-full border border-[color-mix(in_srgb,var(--accent)_35%,var(--border))] bg-[var(--surface)] px-1 text-[9px] font-semibold leading-4 text-[var(--accent)]">
                      +{extraTypeCount}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
            <div className="grid gap-4 md:grid-cols-[auto_1fr] md:items-center">
              <ProgressRing label="Viikon eteneminen" percent={completionRate} showLabel={false} />
              <div className="space-y-4">
                <div className="text-center">
                  <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Viikon yhteenveto</p>
                  <p className="mt-2 text-2xl font-semibold text-[var(--text)]">
                    {completedLastWeekCount} {completedLastWeekCount === 1 ? "treeni" : "treeniä"} valmiina
                  </p>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    {weeklyTargetCount > 0
                      ? `Tavoite tällä viikolla: ${weeklyTargetCount} ${weeklyTargetCount === 1 ? "treeni" : "treeniä"}`
                      : ownPrograms.length > 0
                        ? `${ownPrograms.length} ${ownPrograms.length === 1 ? "aktiivinen ohjelma" : "aktiivista ohjelmaa"} omassa seurannassa.`
                        : "Ei aktiivisia omia ohjelmia juuri nyt."}
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                  <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Kesken nyt</p>
                  <p className="mt-1 text-base font-semibold text-[var(--text)]">{inProgressCount}</p>
                </div>
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                  <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Viimeisin valmis treeni</p>
                  <p className="mt-1 text-base font-semibold text-[var(--text)]">
                    {latestCompletedWorkout ? normalizeWorkoutHistoryTitle(latestCompletedWorkout.title) : "Ei vielä valmiita treenejä"}
                  </p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    {latestCompletedWorkout
                      ? formatDateWithWeekday(latestCompletedWorkout.completedAt ?? latestCompletedWorkout.updatedAt)
                      : "Kun teet oman treenin valmiiksi, se näkyy tässä."}
                  </p>
                </div>
              </div>
            </div>
            </div>
          </div>
          <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
            <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">
              {highlightedState === "active" ? "Aktiivinen treeni" : "Seuraava askel"}
            </p>
            <p className="mt-2 text-lg font-semibold text-[var(--text)]">
              {highlightedWorkout
                ? normalizeWorkoutHistoryTitle(highlightedWorkout.title)
                : ownPrograms.length
                  ? "Avaa omat treenit"
                  : "Ei treenejä vielä"}
            </p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {highlightedState === "active"
                ? "Palaa suoraan käynnissä olevaan treeniin."
                : ownPrograms.length
                  ? "Siirry treeneihin nähdäksesi omat ohjelmat ja toteutukset."
                  : "Luo ensin oma ohjelma tai avaa treenit, kun sisältöä on saatavilla."}
            </p>
            <div className="mt-4">
              <Button type="button" variant={highlightedWorkout ? "secondary" : "ghost"} className="w-full" onClick={() => onOpenWorkoutLog?.()}>
                {highlightedWorkout ? "Siirry treeniin" : "Avaa omat treenit"}
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge>{currentUser.fullName}</Badge>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
