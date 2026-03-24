import { describe, expect, it } from "vitest";
import type { User as SupabaseAuthUser } from "@supabase/supabase-js";

import { cloneDemoState } from "@/lib/domain";
import {
  applyProgramDeletion,
  applyProgramStatusUpdate,
  applyAdminCoachAssignmentUpdate,
  applyAdminRoleUpdate,
  canDeleteProgramFromState,
  canRetargetProgramInState,
  reconcileSupabaseInviteDirectory,
  resolveBlockingWorkoutStart,
  resolveSupabaseUserForState,
  resolvePrimaryCoachIdForAthlete,
  shouldCreateFreshInviteOnResendFailure,
  shouldPreserveStoredSessionDuringSupabaseBootstrap,
  shouldTreatInviteActivationLoginFailureAsPartialSuccess,
  shouldSyncSupabaseAuthEvent,
} from "@/providers/app-state-provider";

describe("shouldPreserveStoredSessionDuringSupabaseBootstrap", () => {
  it("keeps the locally restored session during bootstrap when Supabase has not resolved a user yet", () => {
    expect(
      shouldPreserveStoredSessionDuringSupabaseBootstrap("bootstrap", "user_athlete_1"),
    ).toBe(true);
  });

  it("does not preserve the session after auth events or without a stored user id", () => {
    expect(
      shouldPreserveStoredSessionDuringSupabaseBootstrap("event", "user_athlete_1"),
    ).toBe(false);
    expect(
      shouldPreserveStoredSessionDuringSupabaseBootstrap("bootstrap", null),
    ).toBe(false);
  });

  it("ignores the duplicate INITIAL_SESSION auth event after bootstrap", () => {
    expect(shouldSyncSupabaseAuthEvent("INITIAL_SESSION")).toBe(false);
    expect(shouldSyncSupabaseAuthEvent("SIGNED_IN")).toBe(true);
    expect(shouldSyncSupabaseAuthEvent("SIGNED_OUT")).toBe(true);
  });

  it("recreates a fresh server invite when resending a legacy local invite", () => {
    expect(shouldCreateFreshInviteOnResendFailure("Kutsua ei löytynyt.")).toBe(true);
    expect(shouldCreateFreshInviteOnResendFailure("Kutsun uudelleenlähetys epäonnistui.")).toBe(false);
  });

  it("treats captcha-only auto-login failures as partial success after invite activation", () => {
    expect(
      shouldTreatInviteActivationLoginFailureAsPartialSuccess(
        "Captcha-tarkistus epäonnistui. Tarkista hCaptcha-asetukset ja yritä uudelleen.",
      ),
    ).toBe(true);
    expect(
      shouldTreatInviteActivationLoginFailureAsPartialSuccess("Väärä sähköposti tai salasana."),
    ).toBe(false);
  });

  it("resolves the athlete conversation coach from the training plan when admin is the responsible coach", () => {
    const state = cloneDemoState();

    state.assignments = state.assignments.filter((assignment) => assignment.athleteId !== "user_athlete_1");
    state.scheduledWorkouts = state.scheduledWorkouts.filter((workout) => workout.athleteId !== "user_athlete_1");
    state.plans = [
      {
        id: "plan_admin_only",
        coachId: "user_admin",
        athleteId: "user_athlete_1",
        title: "Admin ohjelma",
        workouts: [],
        startDate: "2026-03-24",
        weekCount: 4,
        createdAt: "2026-03-24T08:00:00.000Z",
      },
    ];

    expect(resolvePrimaryCoachIdForAthlete(state, "user_athlete_1")).toBe("user_admin");
  });

  it("rekeys an invited placeholder user to the real Supabase profile id after activation", () => {
    const state = cloneDemoState();
    const placeholderId = "user_athlete_1";
    const supabaseUserId = "6fa8486a-c4f8-4210-8b74-f1bd39e1d001";

    state.users = state.users.map((user) =>
      user.id === placeholderId
        ? {
            ...user,
            email: "laaloceesay+test@gmail.com",
            status: "invited",
          }
        : user,
    );
    state.assignments = state.assignments.map((assignment) =>
      assignment.athleteId === placeholderId ? { ...assignment, athleteId: placeholderId } : assignment,
    );
    state.plans = state.plans.map((plan) =>
      plan.athleteId === placeholderId ? { ...plan, athleteId: placeholderId } : plan,
    );

    const resolution = resolveSupabaseUserForState(
      state,
      {
        id: supabaseUserId,
        email: "laaloceesay+test@gmail.com",
      } as SupabaseAuthUser,
      {
        id: supabaseUserId,
        role: "athlete",
        status: "active",
        full_name: "Laalo Treenaaja",
        email: "laaloceesay+test@gmail.com",
        default_dashboard_view: "athlete-log",
        email_notifications: false,
        theme_mode: "light",
        weight_kg: null,
        waist_cm: null,
        created_at: "2026-03-24T08:00:00.000Z",
        updated_at: "2026-03-24T08:30:00.000Z",
      },
    );

    expect(resolution.resolvedUserId).toBe(supabaseUserId);
    expect(resolution.nextState.users.some((user) => user.id === placeholderId)).toBe(false);
    expect(
      resolution.nextState.users.find((user) => user.id === supabaseUserId)?.status,
    ).toBe("active");
    expect(
      resolution.nextState.assignments.some((assignment) => assignment.athleteId === supabaseUserId),
    ).toBe(true);
    expect(resolution.nextState.plans.some((plan) => plan.athleteId === supabaseUserId)).toBe(true);
  });

  it("drops stale pending invites when Supabase reports the email as already active", () => {
    const state = cloneDemoState();
    const ghostEmail = "laaloceesay+test@gmail.com";

    state.invites = [
      {
        id: "invite_ghost",
        token: "token_ghost",
        email: ghostEmail,
        role: "athlete",
        invitedBy: "user_admin",
        coachId: "user_admin",
        status: "pending",
        createdAt: "2026-03-24T08:00:00.000Z",
        expiresAt: "2026-03-31T08:00:00.000Z",
      },
    ];
    state.users = [
      ...state.users,
      {
        id: "user_ghost_placeholder",
        role: "athlete",
        fullName: "Ghost Athlete",
        email: ghostEmail,
        status: "invited",
        createdAt: "2026-03-24T08:00:00.000Z",
        updatedAt: "2026-03-24T08:00:00.000Z",
      },
    ];

    const nextState = reconcileSupabaseInviteDirectory(state, {
      invites: [],
      activeEmails: [ghostEmail],
    });

    expect(nextState.invites).toEqual([]);
    expect(
      nextState.users.find((user) => user.email.toLowerCase() === ghostEmail)?.status,
    ).toBe("active");
  });

  it("replaces an invited placeholder with the active server profile for the same email", () => {
    const state = cloneDemoState();
    const ghostEmail = "eliaskautto@gmail.com";

    state.users = [
      ...state.users,
      {
        id: "user_placeholder_invite",
        role: "athlete",
        fullName: "eliaskautto",
        email: ghostEmail,
        status: "invited",
        createdAt: "2026-03-24T08:00:00.000Z",
        updatedAt: "2026-03-24T08:00:00.000Z",
      },
    ];

    const nextState = reconcileSupabaseInviteDirectory(state, {
      invites: [],
      activeEmails: [ghostEmail],
      activeProfiles: [
        {
          id: "6fa8486a-c4f8-4210-8b74-f1bd39e1d100",
          role: "athlete",
          fullName: "Elias Kautto",
          email: ghostEmail,
          status: "active",
          settings: {
            defaultDashboardView: "athlete-log",
            emailNotifications: false,
            themeMode: "light",
          },
          createdAt: "2026-03-24T08:30:00.000Z",
          updatedAt: "2026-03-24T08:30:00.000Z",
        },
      ],
    });

    expect(nextState.users.some((user) => user.id === "user_placeholder_invite")).toBe(false);
    expect(nextState.users.find((user) => user.email === ghostEmail)?.fullName).toBe("Elias Kautto");
    expect(nextState.users.find((user) => user.email === ghostEmail)?.status).toBe("active");
  });

  it("drops a pending invite even if the server snapshot still contains it for an active email", () => {
    const state = cloneDemoState();
    const ghostEmail = "eliaskautto@gmail.com";

    const nextState = reconcileSupabaseInviteDirectory(state, {
      invites: [
        {
          id: "invite_server_ghost",
          token: "token_server_ghost",
          email: ghostEmail,
          role: "athlete",
          invitedBy: "user_admin",
          coachId: "user_admin",
          status: "pending",
          createdAt: "2026-03-24T08:00:00.000Z",
          expiresAt: "2026-03-31T08:00:00.000Z",
        },
      ],
      activeEmails: [ghostEmail],
    });

    expect(nextState.invites.some((invite) => invite.email.toLowerCase() === ghostEmail)).toBe(false);
  });

  it("finds only an in-progress workout as a blocking start condition", () => {
    const state = cloneDemoState();
    const athleteId = "user_athlete_1";
    const blockingWorkoutId = "workout_blocking";
    const blockingProgramWorkoutId = "program_workout_blocking";

    state.scheduledWorkouts = [
      {
        id: blockingWorkoutId,
        trainingPlanId: "plan_blocking",
        programWorkoutId: blockingProgramWorkoutId,
        athleteId,
        coachId: "user_admin",
        title: "Voimapäivä A",
        scheduledDate: "2026-03-24T08:00:00.000Z",
        status: "in_progress",
        createdAt: "2026-03-24T08:00:00.000Z",
        updatedAt: "2026-03-24T08:10:00.000Z",
      },
    ];

    expect(resolveBlockingWorkoutStart(state, athleteId)?.id).toBe(blockingWorkoutId);
    expect(resolveBlockingWorkoutStart(state, athleteId, blockingProgramWorkoutId)).toBeNull();

    state.scheduledWorkouts = state.scheduledWorkouts.map((workout) =>
      workout.id === blockingWorkoutId ? { ...workout, status: "cancelled" } : workout,
    );

    expect(resolveBlockingWorkoutStart(state, athleteId)).toBeNull();
  });

  it("applies a server-backed role change using the resolved Supabase user id", () => {
    const state = cloneDemoState();
    const placeholderId = "user_athlete_1";
    const resolvedUserId = "6fa8486a-c4f8-4210-8b74-f1bd39e1d002";

    state.users = state.users.map((user) =>
      user.id === placeholderId
        ? {
            ...user,
            email: "rolechange@example.com",
            status: "active",
          }
        : user,
    );
    state.assignments = [
      {
        id: "assignment_role_change",
        coachId: "user_admin",
        athleteId: placeholderId,
        active: true,
        createdAt: "2026-03-24T08:00:00.000Z",
      },
    ];

    const nextState = applyAdminRoleUpdate(
      state,
      placeholderId,
      resolvedUserId,
      "rolechange@example.com",
      "coach",
      "2026-03-24T09:00:00.000Z",
    );

    expect(nextState.users.some((user) => user.id === placeholderId)).toBe(false);
    expect(nextState.users.find((user) => user.id === resolvedUserId)?.role).toBe("coach");
    expect(nextState.assignments.some((assignment) => assignment.athleteId === resolvedUserId)).toBe(false);
  });

  it("applies a server-backed athlete coach update using the resolved Supabase user id", () => {
    const state = cloneDemoState();
    const placeholderId = "user_athlete_1";
    const resolvedUserId = "6fa8486a-c4f8-4210-8b74-f1bd39e1d003";

    state.users = state.users.map((user) =>
      user.id === placeholderId
        ? {
            ...user,
            email: "coaches@example.com",
            status: "active",
          }
        : user,
    );
    state.assignments = [
      {
        id: "assignment_old",
        coachId: "user_admin",
        athleteId: placeholderId,
        active: true,
        createdAt: "2026-03-24T08:00:00.000Z",
      },
    ];

    const nextState = applyAdminCoachAssignmentUpdate(
      state,
      placeholderId,
      resolvedUserId,
      "coaches@example.com",
      ["user_admin", "user_coach_1"],
      "2026-03-24T09:00:00.000Z",
      "user_admin",
    );

    expect(nextState.users.some((user) => user.id === placeholderId)).toBe(false);
    expect(
      nextState.assignments.filter((assignment) => assignment.athleteId === resolvedUserId && assignment.active),
    ).toHaveLength(2);
  });

  it("allows deleting a program only when it has no started workouts linked to it", () => {
    const state = cloneDemoState();

    expect(canDeleteProgramFromState(state, "plan_1")).toBe(false);

    const removableState = {
      ...state,
      scheduledWorkouts: state.scheduledWorkouts.filter((workout) => workout.trainingPlanId !== "plan_1"),
    };

    expect(canDeleteProgramFromState(removableState, "plan_1")).toBe(true);

    const nextState = applyProgramDeletion(removableState, "plan_1");
    expect(nextState.plans.some((plan) => plan.id === "plan_1")).toBe(false);
  });

  it("allows retargeting a program only before workouts have been started from it", () => {
    const state = cloneDemoState();

    expect(canRetargetProgramInState(state, "plan_1")).toBe(false);

    const retargetableState = {
      ...state,
      scheduledWorkouts: state.scheduledWorkouts.filter((workout) => workout.trainingPlanId !== "plan_1"),
    };

    expect(canRetargetProgramInState(retargetableState, "plan_1")).toBe(true);
  });

  it("activating a program archives the athlete's other programs", () => {
    const state = cloneDemoState();

    state.plans = [
      {
        id: "plan_a",
        coachId: "user_admin",
        athleteId: "user_athlete_1",
        title: "Ohjelma A",
        status: "active",
        workouts: [],
        startDate: "2026-03-24",
        weekCount: 4,
        createdAt: "2026-03-24T08:00:00.000Z",
      },
      {
        id: "plan_b",
        coachId: "user_admin",
        athleteId: "user_athlete_1",
        title: "Ohjelma B",
        status: "archived",
        workouts: [],
        startDate: "2026-03-24",
        weekCount: 4,
        createdAt: "2026-03-24T08:10:00.000Z",
      },
    ];

    const nextState = applyProgramStatusUpdate(state, "plan_b", "active");

    expect(nextState.plans.find((plan) => plan.id === "plan_a")?.status).toBe("archived");
    expect(nextState.plans.find((plan) => plan.id === "plan_b")?.status).toBe("active");
  });
});
