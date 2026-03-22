import type { ComponentType } from "react";

import { Card } from "@/components/ui/card";
import type { Role } from "@/lib/types";

export type WorkspaceView = "overview" | "templates" | "athlete-log" | "invites";

export function metricTone(role: Role | null) {
  switch (role) {
    case "admin":
      return "border-[var(--accent-secondary)] text-[var(--accent-secondary)]";
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

export function scheduledStatusLabel(status: string) {
  switch (status) {
    case "scheduled":
      return "Ajastettu";
    case "in_progress":
      return "Kesken";
    case "completed":
      return "Valmis";
    default:
      return status;
  }
}

export function roleHeadline(role: Role) {
  switch (role) {
    case "admin":
      return "Hallinnoi rosteria ja pidä valmennusverkko hallussa.";
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
