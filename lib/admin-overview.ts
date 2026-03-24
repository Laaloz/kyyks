import type { UserProfile } from "@/lib/types";

export function getAdminOverviewAthleteGroups(users: UserProfile[]) {
  const athletes = users.filter((user) => user.role === "athlete");

  return {
    athletes,
    activeAthletes: athletes.filter((user) => user.status === "active"),
    invitedAthletes: athletes.filter((user) => user.status === "invited"),
  };
}
