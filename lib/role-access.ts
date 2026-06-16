import { PROGRAMS_DASHBOARD_VIEW, type AthleteRole, type DashboardHomeView, type Invite, type Role, type UserProfile } from "@/lib/types";

// Valmentaja käyttää samaa treenaajasovellusta omaan treeniinsä; vain Tiimi on
// erillinen. 5 välilehteä, Treeni keskellä: Tänään / Ravinto / Treeni / Keho / Tiimi.
// Ohjelmat avataan Tiimistä (PROGRAMS_DASHBOARD_VIEW yhä validi näkymä, ei navissa).
const coachWorkspaceViews: DashboardHomeView[] = [
  "overview",
  "nutrition",
  "athlete-log",
  "measurements",
  "athletes",
];

// Admin käyttää samaa treenaajasovellusta (Tänään/Ravinto/Treeni/Keho) ja
// Tiimi = hallintakooste (valmentajat, käyttäjät, kutsut, raaka-ainekatalogi).
// Muut hallintanäkymät (users/invites/ingredients/templates/conversation) ovat
// yhä valideja näkymiä, joihin pääsee Tiimin silloista — ei välilehtipalkissa.
const adminWorkspaceViews: DashboardHomeView[] = [
  "overview",
  "nutrition",
  "athlete-log",
  "measurements",
  "athletes",
];

// Treenaajaroolien alapalkki: Tänään / Treeni / Ravinto / Keho (4 tasakokoista).
// Chat siirtyy yläpalkin ikoniksi.
const athleteWorkspaceViews: DashboardHomeView[] = ["overview", "athlete-log", "nutrition", "measurements"];
// Itsenäinen treenaaja vastaa itse ohjelmoinnistaan → Ohjelma on oma välilehti,
// jotta omia ohjelmia voi luoda ja muokata suoraan navista eikä vain Treeni-näkymän
// sillan kautta. Järjestys pitää Treenin keskellä: Tänään / Ohjelma / Treeni / Ravinto / Keho.
const independentAthleteWorkspaceViews: DashboardHomeView[] = [
  "overview",
  PROGRAMS_DASHBOARD_VIEW,
  "athlete-log",
  "nutrition",
  "measurements",
];

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
  // Tänään (overview) on kaikkien roolien kotinäkymä — myös orpoon tabiin
  // joutuneen roolinvaihdon turvalasku.
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
