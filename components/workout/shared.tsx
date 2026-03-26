import type { ComponentType } from "react";

import { Card } from "@/components/ui/card";
import { PROGRAMS_DASHBOARD_VIEW, type DashboardHomeView, type Role } from "@/lib/types";

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
      return "border-[var(--accent)] text-[var(--accent)]";
    default:
      return "border-[var(--border-strong)] text-[var(--text)]";
  }
}

export function roleLabel(role: Role) {
  if (role === "admin") return "Admin";
  if (role === "coach") return "Valmentaja";
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

export function roleHeadline(role: Role) {
  switch (role) {
    case "admin":
      return "Hallinnoi rosteria ja seuraa valmennusta omassa nakymassaan.";
    case "coach":
      return "Rakenna ohjelmat nopeasti ja seuraa kuka oikeasti etenee.";
    case "athlete":
      return "Pidä fokus toistoissa, voimassa ja jatkuvassa progressissa.";
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
