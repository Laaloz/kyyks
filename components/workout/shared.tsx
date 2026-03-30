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
  const latestCompletedWorkout = [...ownWorkouts]
    .filter((workout) => workout.status === "completed")
    .sort((left, right) =>
      (right.completedAt ?? right.updatedAt).localeCompare(left.completedAt ?? left.updatedAt),
    )[0];

  return (
    <Card className="border-[var(--border-strong)]">
      <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr] xl:items-end">
        <div className="space-y-3">
          <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Oma treeniseuranta</p>
          <CardTitle className="text-2xl">Pidä myös oma progressi näkyvissä</CardTitle>
          <CardDescription className="max-w-3xl leading-6">
            Treenit-workspacesta näet omat ohjelmat, käynnissä olevat treenit ja viimeisimmät toteutukset ilman että valmennus- tai hallintanäkymä katoaa ympäriltä.
          </CardDescription>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="secondary" onClick={() => onOpenWorkoutLog?.()}>
              Avaa omat treenit
            </Button>
            <Badge>{currentUser.fullName}</Badge>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
          <div className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] px-4 py-4">
            <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Aktiiviset ohjelmat</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--text)]">{ownPrograms.length}</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">omaan käyttöön rakennetut ohjelmat</p>
          </div>
          <div className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] px-4 py-4">
            <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Kesken nyt</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--text)]">{inProgressCount}</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">treeni odottaa jatkamista</p>
          </div>
          <div className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] px-4 py-4">
            <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Valmiit 7 päivässä</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--text)]">{completedLastWeekCount}</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">omaa toteutusta viime viikolta</p>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
        <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Viimeisin valmis treeni</p>
        <p className="mt-2 text-lg font-semibold text-[var(--text)]">
          {latestCompletedWorkout ? normalizeWorkoutHistoryTitle(latestCompletedWorkout.title) : "Ei vielä valmiita omia treenejä"}
        </p>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {latestCompletedWorkout
            ? formatDateWithWeekday(latestCompletedWorkout.completedAt ?? latestCompletedWorkout.updatedAt)
            : "Kun teet oman treenin valmiiksi, viimeisin toteutus näkyy tässä automaattisesti."}
        </p>
      </div>
    </Card>
  );
}
