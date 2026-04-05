import { Flame } from "lucide-react";
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

// The legacy "templates" route key now renders the programs workspace.
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

export function roleHeadline(role: Role) {
  switch (role) {
    case "admin":
      return "Hallinnoi rosteria ja seuraa valmennusta omassa nakymassaan.";
    case "coach":
      return "Rakenna ohjelmat nopeasti ja seuraa kuka oikeasti etenee.";
    case "athlete":
      return "Pidä fokus toistoissa, voimassa ja jatkuvassa progressissa.";
    case "independent_athlete":
      return "Rakenna omat ohjelmat ja seuraa progressia ilman turhaa kitkaa.";
  }
}

export function MetricGrid({
  metrics,
  role,
}: {
  metrics: Array<{ label: string; value: number; icon: ComponentType<{ className?: string }> }>;
  role: Role | null;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => (
        <Card
          key={metric.label}
          className="border-[var(--border-strong)] bg-[var(--surface)]"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold tracking-[0.03em] text-[var(--text-subtle)]">{metric.label}</p>
              <p className="mt-4 font-[family-name:var(--font-display)] text-4xl font-semibold text-[var(--text)]">
                {metric.value}
              </p>
            </div>
            <div className={`rounded-xl border bg-[var(--surface-2)] p-3 ${metricTone(role)}`}>
              <metric.icon className="size-6 text-[var(--accent)]" />
            </div>
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

  return (
    <div className="flex flex-col items-center text-center">
      <div
        aria-label={`${label} ${safePercent}%`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={safePercent}
        className="grid size-36 place-items-center rounded-full border border-[var(--border)] shadow-[inset_0_1px_0_var(--shadow-soft)]"
        role="progressbar"
        style={{
          background: `conic-gradient(var(--accent) 0 ${safePercent}%, color-mix(in_srgb,var(--surface-4)_82%,var(--border)) ${safePercent}% 100%)`,
        }}
      >
        <div className="flex size-28 flex-col items-center justify-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] shadow-[0_1px_0_0_var(--shadow-soft)]">
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
        <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-5">
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
          <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-5">
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
