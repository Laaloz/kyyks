import type { DashboardHomeView, Role, UserProfile } from "@/lib/types";

const coachWorkspaceViews: DashboardHomeView[] = [
  "overview",
  "templates",
  "athlete-log",
  "conversation",
  "invites",
];

const athleteWorkspaceViews: DashboardHomeView[] = ["overview", "athlete-log", "conversation"];

export function canActAsCoach(role: Role | null | undefined) {
  return role === "admin" || role === "coach";
}

export function isAdminRole(role: Role | null | undefined) {
  return role === "admin";
}

export function getDashboardViewsForRole(role: Role): DashboardHomeView[] {
  return role === "athlete" ? athleteWorkspaceViews : coachWorkspaceViews;
}

export function getDefaultDashboardView(role: Role): DashboardHomeView {
  return role === "athlete" ? "athlete-log" : "overview";
}

export function getCoachCapableUsers(users: UserProfile[]) {
  return users.filter((user) => canActAsCoach(user.role));
}

export function getAssignableCoachUsers(users: UserProfile[]) {
  return users.filter((user) => user.role === "coach");
}
