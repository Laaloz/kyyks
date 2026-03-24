import { describe, expect, it } from "vitest";

import {
  canResendInvite,
  getAssignableCoachUsers,
  getCoachCapableUsers,
  getDashboardViewsForRole,
  getDefaultDashboardView,
  canActAsCoach,
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
  });

  it("exposes coach workspace views for admin", () => {
    expect(getDashboardViewsForRole("admin")).toContain("conversation");
    expect(getDefaultDashboardView("admin")).toBe("overview");
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
