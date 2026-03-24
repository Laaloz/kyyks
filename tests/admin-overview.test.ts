import { describe, expect, it } from "vitest";

import { getAdminCoachingCoverage, getAdminOverviewAthleteGroups } from "@/lib/admin-overview";
import type { AppState, UserProfile } from "@/lib/types";

const users: UserProfile[] = [
  {
    id: "admin_1",
    role: "admin",
    fullName: "Admin",
    email: "admin@example.com",
    status: "active",
    createdAt: "2026-03-24T08:00:00.000Z",
    updatedAt: "2026-03-24T08:00:00.000Z",
  },
  {
    id: "athlete_active",
    role: "athlete",
    fullName: "Active Athlete",
    email: "active@example.com",
    status: "active",
    createdAt: "2026-03-24T08:00:00.000Z",
    updatedAt: "2026-03-24T08:00:00.000Z",
  },
  {
    id: "athlete_invited",
    role: "athlete",
    fullName: "Invited Athlete",
    email: "invited@example.com",
    status: "invited",
    createdAt: "2026-03-24T08:00:00.000Z",
    updatedAt: "2026-03-24T08:00:00.000Z",
  },
];

describe("getAdminOverviewAthleteGroups", () => {
  it("separates invited athletes from active athletes for admin overview cards", () => {
    const groups = getAdminOverviewAthleteGroups(users);

    expect(groups.athletes.map((user) => user.id)).toEqual(["athlete_active", "athlete_invited"]);
    expect(groups.activeAthletes.map((user) => user.id)).toEqual(["athlete_active"]);
    expect(groups.invitedAthletes.map((user) => user.id)).toEqual(["athlete_invited"]);
  });
});

describe("getAdminCoachingCoverage", () => {
  it("counts admin-led plans as a real coaching relationship even without a separate assignment row", () => {
    const state = {
      users,
      assignments: [],
      plans: [
        {
          id: "plan_admin_only",
          coachId: "admin_1",
          athleteId: "athlete_active",
          title: "Admin ohjelma",
          workouts: [],
          startDate: "2026-03-24",
          weekCount: 4,
          createdAt: "2026-03-24T08:00:00.000Z",
        },
      ],
      scheduledWorkouts: [],
    } satisfies Pick<AppState, "users" | "assignments" | "plans" | "scheduledWorkouts">;

    const coverage = getAdminCoachingCoverage(state);

    expect(coverage.athleteCoachCount.get("athlete_active")).toBe(1);
    expect(coverage.coachAthleteCount.get("admin_1")).toBe(1);
    expect(coverage.relationshipCount).toBe(1);
  });

  it("still counts an archived admin-led plan as coaching coverage for the athlete", () => {
    const state = {
      users,
      assignments: [],
      plans: [
        {
          id: "plan_archived",
          coachId: "admin_1",
          athleteId: "athlete_active",
          title: "Vanha ohjelma",
          status: "archived" as const,
          workouts: [],
          startDate: "2026-03-24",
          weekCount: 4,
          createdAt: "2026-03-24T08:00:00.000Z",
        },
      ],
      scheduledWorkouts: [],
    } satisfies Pick<AppState, "users" | "assignments" | "plans" | "scheduledWorkouts">;

    const coverage = getAdminCoachingCoverage(state);

    expect(coverage.relationshipCount).toBe(1);
  });
});
