import { canActAsCoach, isAthleteRole } from "@/lib/role-access";
import type { AppState, UserProfile } from "@/lib/types";

export function getAdminOverviewAthleteGroups(users: UserProfile[]) {
  const athletes = users.filter((user) => isAthleteRole(user.role));

  return {
    athletes,
    activeAthletes: athletes.filter((user) => user.status === "active"),
    invitedAthletes: athletes.filter((user) => user.status === "invited"),
  };
}

export function getAdminCoachingCoverage({
  users,
  assignments,
  plans,
  scheduledWorkouts,
}: Pick<AppState, "users" | "assignments" | "plans" | "scheduledWorkouts">) {
  const activeAthleteIds = new Set(
    users.filter((user) => isAthleteRole(user.role) && user.status === "active").map((user) => user.id),
  );
  const coachIds = new Set(users.filter((user) => canActAsCoach(user.role)).map((user) => user.id));
  const athleteCoachIds = new Map<string, Set<string>>();
  const coachAthleteIds = new Map<string, Set<string>>();

  const linkCoachToAthlete = (coachId: string | undefined, athleteId: string | undefined) => {
    if (!coachId || !athleteId || !activeAthleteIds.has(athleteId) || !coachIds.has(coachId)) {
      return;
    }

    const athleteSet = athleteCoachIds.get(athleteId) ?? new Set<string>();
    athleteSet.add(coachId);
    athleteCoachIds.set(athleteId, athleteSet);

    const coachSet = coachAthleteIds.get(coachId) ?? new Set<string>();
    coachSet.add(athleteId);
    coachAthleteIds.set(coachId, coachSet);
  };

  assignments.forEach((assignment) => {
    if (assignment.active) {
      linkCoachToAthlete(assignment.coachId, assignment.athleteId);
    }
  });

  plans.forEach((plan) => {
    linkCoachToAthlete(plan.coachId, plan.athleteId);
  });

  scheduledWorkouts.forEach((workout) => {
    linkCoachToAthlete(workout.coachId, workout.athleteId);
  });

  return {
    athleteCoachCount: new Map(
      Array.from(athleteCoachIds.entries(), ([athleteId, coachSet]) => [athleteId, coachSet.size]),
    ),
    coachAthleteCount: new Map(
      Array.from(coachAthleteIds.entries(), ([coachId, athleteSet]) => [coachId, athleteSet.size]),
    ),
    relationshipCount: Array.from(athleteCoachIds.values()).reduce((sum, coachSet) => sum + coachSet.size, 0),
  };
}
