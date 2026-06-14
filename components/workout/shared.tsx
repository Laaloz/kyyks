import { PROGRAMS_DASHBOARD_VIEW, type DashboardHomeView, type Role } from "@/lib/types";

export const PROGRAMS_WORKSPACE_VIEW = PROGRAMS_DASHBOARD_VIEW;

// The compatibility "templates" route key now renders the programs workspace.
export type WorkspaceView = DashboardHomeView | "settings";

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
