import { PROGRAMS_DASHBOARD_VIEW, type DashboardHomeView, type Invite, type Role, type UserProfile } from "@/lib/types";

const coachWorkspaceViews: DashboardHomeView[] = [
  "overview",
  PROGRAMS_DASHBOARD_VIEW,
  "athlete-log",
  "conversation",
  "invites",
];

const adminWorkspaceViews: DashboardHomeView[] = [
  "overview",
  "athletes",
  PROGRAMS_DASHBOARD_VIEW,
  "athlete-log",
  "conversation",
  "invites",
  "users",
];

const athleteWorkspaceViews: DashboardHomeView[] = ["overview", "athlete-log", "conversation"];

export function canActAsCoach(role: Role | null | undefined) {
  return role === "admin" || role === "coach";
}

export function isAdminRole(role: Role | null | undefined) {
  return role === "admin";
}

export function getDashboardViewsForRole(role: Role): DashboardHomeView[] {
  if (role === "athlete") {
    return athleteWorkspaceViews;
  }

  if (role === "admin") {
    return adminWorkspaceViews;
  }

  return coachWorkspaceViews;
}

export function getDefaultDashboardView(role: Role): DashboardHomeView {
  return role === "athlete" ? "athlete-log" : "overview";
}

export function getCoachCapableUsers(users: UserProfile[]) {
  return users.filter((user) => canActAsCoach(user.role));
}

export function getAssignableCoachUsers(users: UserProfile[]) {
  return users.filter((user) => canActAsCoach(user.role));
}

export function canResendInvite(user: Pick<UserProfile, "id" | "role"> | null | undefined, invite: Pick<Invite, "status" | "invitedBy">) {
  if (!user || invite.status !== "pending") {
    return false;
  }

  return user.role === "admin" || (user.role === "coach" && invite.invitedBy === user.id);
}
