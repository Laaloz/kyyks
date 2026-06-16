import { describe, expect, it } from "vitest";

import {
  canResendInvite,
  getAssignableCoachUsers,
  getCoachCapableUsers,
  getDashboardViewsForRole,
  getDefaultDashboardView,
  canActAsCoach,
  canTrackOwnTraining,
} from "@/lib/role-access";
import type { UserProfile } from "@/lib/types";

const users: UserProfile[] = [
  {
    id: "admin_1",
    role: "admin",
    fullName: "Admin",
    email: "admin@example.com",
    status: "active",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
  },
  {
    id: "coach_1",
    role: "coach",
    fullName: "Coach",
    email: "coach@example.com",
    status: "active",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
  },
  {
    id: "athlete_1",
    role: "athlete",
    fullName: "Athlete",
    email: "athlete@example.com",
    status: "active",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
  },
];

describe("role access helpers", () => {
  it("treats admin as coach-capable inside the app", () => {
    expect(canActAsCoach("admin")).toBe(true);
    expect(canActAsCoach("coach")).toBe(true);
    expect(canActAsCoach("athlete")).toBe(false);
    expect(canActAsCoach("independent_athlete")).toBe(false);
  });

  it("allows every signed-in role to track their own training progress", () => {
    expect(canTrackOwnTraining("admin")).toBe(true);
    expect(canTrackOwnTraining("coach")).toBe(true);
    expect(canTrackOwnTraining("athlete")).toBe(true);
    expect(canTrackOwnTraining("independent_athlete")).toBe(true);
    expect(canTrackOwnTraining(null)).toBe(false);
  });

  it("gives the admin the same five-tab workspace as the coach (management bridged from Tiimi)", () => {
    // Admin käyttää treenaajasovellusta; hallintapinnat (templates/conversation/
    // invites/users/ingredients) avataan Tiimistä, eivät ole välilehtipalkissa.
    expect(getDashboardViewsForRole("admin")).toEqual([
      "overview",
      "nutrition",
      "athlete-log",
      "measurements",
      "athletes",
    ]);
    expect(getDashboardViewsForRole("admin")).not.toContain("conversation");
    expect(getDashboardViewsForRole("admin")).not.toContain("templates");
    expect(getDashboardViewsForRole("admin")).not.toContain("users");
    expect(getDashboardViewsForRole("coach")).not.toContain("conversation");
    expect(getDashboardViewsForRole("independent_athlete")).not.toContain("invites");
    expect(getDefaultDashboardView("admin")).toBe("overview");
  });

  it("gives the coach a five-tab workspace (Tänään/Ravinto/Treeni/Keho/Tiimi) with Treeni centered", () => {
    const coachViews = getDashboardViewsForRole("coach");
    expect(coachViews).toEqual(["overview", "nutrition", "athlete-log", "measurements", "athletes"]);
    // Treeni (athlete-log) on keskellä viittä välilehteä.
    expect(coachViews.indexOf("athlete-log")).toBe(2);
    // Keho mukana; Ohjelmat (templates) avataan Tiimistä, ei navissa.
    expect(coachViews).toContain("measurements");
    expect(coachViews).not.toContain("templates");
  });

  it("gives the coached athlete the four-tab workspace (Tänään/Treeni/Ravinto/Keho)", () => {
    const expected = ["overview", "athlete-log", "nutrition", "measurements"];
    expect(getDashboardViewsForRole("athlete")).toEqual(expected);
    // Chat moves to the top bar; coached athletes have no program tab.
    expect(getDashboardViewsForRole("athlete")).not.toContain("conversation");
    expect(getDashboardViewsForRole("athlete")).not.toContain("templates");
    expect(getDefaultDashboardView("athlete")).toBe("overview");
  });

  it("gives the independent athlete a program tab with Treeni in the middle", () => {
    const views = getDashboardViewsForRole("independent_athlete");
    // Itse ohjelmoiva treenaaja saa oman Ohjelma-välilehden; Treeni pysyy keskellä.
    expect(views).toEqual(["overview", "templates", "athlete-log", "nutrition", "measurements"]);
    expect(views.indexOf("athlete-log")).toBe(2);
    expect(views).not.toContain("conversation");
    expect(getDefaultDashboardView("independent_athlete")).toBe("overview");
  });

  it("includes admin users in coach-capable roster lists", () => {
    expect(getCoachCapableUsers(users).map((user) => user.id)).toEqual(["admin_1", "coach_1"]);
  });

  it("shows admin and coach users in assignable coach lists", () => {
    expect(getAssignableCoachUsers(users).map((user) => user.id)).toEqual(["admin_1", "coach_1"]);
  });

  it("allows admins and the owning coach to resend pending invites", () => {
    expect(
      canResendInvite(users[0], {
        status: "pending",
        invitedBy: "coach_1",
      }),
    ).toBe(true);

    expect(
      canResendInvite(users[1], {
        status: "pending",
        invitedBy: "coach_1",
      }),
    ).toBe(true);

    expect(
      canResendInvite(users[1], {
        status: "pending",
        invitedBy: "coach_2",
      }),
    ).toBe(false);

    expect(
      canResendInvite(users[2], {
        status: "pending",
        invitedBy: "coach_1",
      }),
    ).toBe(false);

    expect(
      canResendInvite(users[0], {
        status: "accepted",
        invitedBy: "coach_1",
      }),
    ).toBe(false);
  });
});
