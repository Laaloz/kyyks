import { describe, expect, it } from "vitest";

import { getAdminOverviewAthleteGroups } from "@/lib/admin-overview";
import type { UserProfile } from "@/lib/types";

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
