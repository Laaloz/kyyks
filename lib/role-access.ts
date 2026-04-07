import { PROGRAMS_DASHBOARD_VIEW, type AthleteRole, type DashboardHomeView, type Invite, type Role, type UserProfile } from "@/lib/types";

const coachWorkspaceViews: DashboardHomeView[] = [
  "athlete-log",
  "overview",
  PROGRAMS_DASHBOARD_VIEW,
  "athletes",
];

const adminWorkspaceViews: DashboardHomeView[] = [
  "athlete-log",
  "overview",
  "nutrition",
  "athletes",
  PROGRAMS_DASHBOARD_VIEW,
  "conversation",
  "invites",
  "users",
];

const athleteWorkspaceViews: DashboardHomeView[] = ["athlete-log", "overview", "conversation"];
const independentAthleteWorkspaceViews: DashboardHomeView[] = ["athlete-log", "overview", PROGRAMS_DASHBOARD_VIEW, "conversation"];

export function isAthleteRole(role: Role | null | undefined): role is AthleteRole {
  return role === "athlete" || role === "independent_athlete";
}

export function canActAsCoach(role: Role | null | undefined) {
  return role === "admin" || role === "coach";
}

export function canManageOwnPrograms(role: Role | null | undefined) {
  return role === "independent_athlete";
}

export function canManagePrograms(role: Role | null | undefined) {
  return canActAsCoach(role) || canManageOwnPrograms(role);
}

export function canTrackOwnTraining(role: Role | null | undefined) {
  return role === "admin" || role === "coach" || isAthleteRole(role);
}

export function isAdminRole(role: Role | null | undefined) {
  return role === "admin";
}

export function getDashboardViewsForRole(role: Role): DashboardHomeView[] {
  if (role === "athlete") {
    return athleteWorkspaceViews;
  }

  if (role === "independent_athlete") {
    return independentAthleteWorkspaceViews;
  }

  if (role === "admin") {
    return adminWorkspaceViews;
  }

  return coachWorkspaceViews;
}

export function getDefaultDashboardView(role: Role): DashboardHomeView {
  if (role === "athlete") {
    return "athlete-log";
  }

  return "overview";
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
