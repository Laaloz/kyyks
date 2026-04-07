import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { User as SupabaseAuthUser } from "@supabase/supabase-js";

import { cloneDemoState } from "@/lib/domain";
import type { WorkoutSession } from "@/lib/types";
import {
  applyPartialUserMeasurementUpdate,
  applyProgramDeletion,
  applyProgramStatusUpdate,
  applyAdminCoachAssignmentUpdate,
  applyAdminRoleUpdate,
  buildWorkoutSetDraftKey,
  canDeleteProgramFromState,
  canRetargetProgramInState,
  collectPendingWorkoutMutationKinds,
  mergeWorkoutSetDraftPatch,
  rekeyOptimisticWorkoutArtifacts,
  reconcileSupabaseInviteDirectory,
  reconcileSupabaseVisibleState,
  resolveSelectedUserFromState,
  resolveBlockingWorkoutStart,
  resolveSupabaseUserForState,
  resolvePrimaryCoachIdForAthlete,
  shouldCreateFreshInviteOnResendFailure,
  shouldPreserveStoredSessionDuringSupabaseBootstrap,
  shouldPreserveStoredSessionOnTransientSupabaseNullEvent,
  shouldRevalidateSupabaseSessionBeforeClearingAuth,
  shouldTreatInviteActivationLoginFailureAsPartialSuccess,
  shouldSyncSupabaseAuthEvent,
  preserveActiveWorkoutShells,
  markVisibleConversationEntriesRead,
  resolveSupabaseAuthUserAfterPasswordSignIn,
} from "@/providers/app-state-provider";

describe("collectPendingWorkoutMutationKinds", () => {
  it("returns queued mutation kinds in the original order", () => {
    expect(
      collectPendingWorkoutMutationKinds([
        { kind: "note" },
        { kind: "complete" },
        { kind: "duration" },
      ]),
    ).toEqual(["note", "complete", "duration"]);
  });
});

describe("mergeWorkoutSetDraftPatch", () => {
  it("merges partial edits into one draft patch and keeps stable identifiers", () => {
    expect(
      mergeWorkoutSetDraftPatch(
        {
          logId: "log_1",
          templateExerciseId: "exercise_1",
          setLabel: "1",
          actualReps: 5,
        },
        {
          actualLoad: 82.5,
          done: true,
        },
      ),
    ).toEqual({
      logId: "log_1",
      templateExerciseId: "exercise_1",
      setLabel: "1",
      actualReps: 5,
      actualLoad: 82.5,
      done: true,
    });
  });
});

describe("buildWorkoutSetDraftKey", () => {
  it("prefers stable template exercise identifiers over transient log ids", () => {
    expect(
      buildWorkoutSetDraftKey({
        logId: "log_1",
        templateExerciseId: "exercise_1",
        setLabel: "2",
      }),
    ).toBe("exercise_1::2");
    expect(buildWorkoutSetDraftKey({ logId: "log_1" })).toBe("log::log_1");
  });
});

describe("shouldPreserveStoredSessionDuringSupabaseBootstrap", () => {
  it("does not preserve a stale local session during bootstrap null-state checks", () => {
    expect(
      shouldPreserveStoredSessionDuringSupabaseBootstrap("bootstrap", "user_athlete_1"),
    ).toBe(false);
  });

  it("keeps the locally restored session during early auth events before Supabase has resolved a user", () => {
    expect(
      shouldPreserveStoredSessionDuringSupabaseBootstrap("event", "user_athlete_1"),
    ).toBe(true);
  });

  it("does not preserve the session after auth has resolved or without a stored user id", () => {
    expect(
      shouldPreserveStoredSessionDuringSupabaseBootstrap("event", "user_athlete_1", true),
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

  it("revalidates an existing session before clearing auth on late null auth events", () => {
    expect(
      shouldRevalidateSupabaseSessionBeforeClearingAuth("event", "user_athlete_1", true),
    ).toBe(true);
    expect(
      shouldRevalidateSupabaseSessionBeforeClearingAuth("event", "user_athlete_1", false),
    ).toBe(false);
    expect(
      shouldRevalidateSupabaseSessionBeforeClearingAuth("bootstrap", "user_athlete_1", true),
    ).toBe(true);
    expect(
      shouldRevalidateSupabaseSessionBeforeClearingAuth("event", null, true),
    ).toBe(false);
    expect(
      shouldRevalidateSupabaseSessionBeforeClearingAuth("bootstrap", "user_athlete_1", false),
    ).toBe(true);
  });

  it("preserves the locally restored session during transient null auth events from Supabase", () => {
    expect(
      shouldPreserveStoredSessionOnTransientSupabaseNullEvent("event", "user_athlete_1"),
    ).toBe(true);
    expect(
      shouldPreserveStoredSessionOnTransientSupabaseNullEvent("bootstrap", "user_athlete_1"),
    ).toBe(false);
    expect(
      shouldPreserveStoredSessionOnTransientSupabaseNullEvent("event", null),
    ).toBe(false);
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

  it("retries auth user resolution after password sign-in until email becomes available", async () => {
    const confirmUser = vi
      .fn<() => Promise<SupabaseAuthUser | null>>()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "supabase_user", email: "athlete@example.com" } as SupabaseAuthUser);

    const resolved = await resolveSupabaseAuthUserAfterPasswordSignIn({
      initialUser: null,
      confirmUser,
      attempts: 4,
      waitForNextPaintFn: async () => undefined,
      waitForDelayFn: async () => undefined,
    });

    expect(resolved?.email).toBe("athlete@example.com");
    expect(confirmUser).toHaveBeenCalledTimes(2);
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

  it("keeps schema RLS access open for athlete conversations with admin coaches", () => {
    const schema = readFileSync(resolve(process.cwd(), "supabase/schema.sql"), "utf8");

    expect(schema).toContain("'admin_message'");
    expect(schema).toContain("profile.role = 'admin'");
    expect(schema).toContain("role in ('coach', 'admin') and public.is_athlete_of(id)");
    expect(schema).toContain("from public.training_plans plan");
    expect(schema).toContain("from public.scheduled_workouts workout");
  });

  it("marks conversation entries as read per user without clearing another coach user's unread state", () => {
    const state = cloneDemoState();

    state.users = [
      ...state.users.filter((user) => user.id !== "user_admin" && user.id !== "user_coach_1"),
      {
        id: "user_admin",
        role: "admin",
        fullName: "Admin",
        email: "admin@example.com",
        status: "active",
        createdAt: "2026-03-24T08:00:00.000Z",
        updatedAt: "2026-03-24T08:00:00.000Z",
      },
      {
        id: "user_coach_1",
        role: "coach",
        fullName: "Coach One",
        email: "coach@example.com",
        status: "active",
        createdAt: "2026-03-24T08:00:00.000Z",
        updatedAt: "2026-03-24T08:00:00.000Z",
      },
    ];
    state.assignments = [
      {
        id: "assignment_1",
        coachId: "user_coach_1",
        athleteId: "user_athlete_1",
        active: true,
        createdAt: "2026-03-24T08:00:00.000Z",
      },
    ];
    state.conversationEntries = [
      {
        id: "conversation_1",
        athleteId: "user_athlete_1",
        coachId: "user_coach_1",
        authorUserId: "user_athlete_1",
        authorRole: "athlete",
        type: "comment",
        body: "Hei",
        contextType: "general",
        createdAt: "2026-03-30T08:00:00.000Z",
        readByUserIds: ["user_athlete_1"],
      },
    ];

    const admin = state.users.find((user) => user.id === "user_admin");
    const coach = state.users.find((user) => user.id === "user_coach_1");

    expect(admin).toBeTruthy();
    expect(coach).toBeTruthy();

    const afterAdminRead = markVisibleConversationEntriesRead(state, admin!, { athleteId: "user_athlete_1" }).state;
    expect(afterAdminRead.conversationEntries[0]?.readByUserIds).toContain("user_admin");
    expect(afterAdminRead.conversationEntries[0]?.readByUserIds).not.toContain("user_coach_1");

    const afterCoachRead = markVisibleConversationEntriesRead(afterAdminRead, coach!, { athleteId: "user_athlete_1" }).state;
    expect(afterCoachRead.conversationEntries[0]?.readByUserIds).toContain("user_admin");
    expect(afterCoachRead.conversationEntries[0]?.readByUserIds).toContain("user_coach_1");
  });

  it("keeps newer local workout session data when an older snapshot arrives", () => {
    const state = cloneDemoState();
    const localSession: WorkoutSession = {
      id: "session_local",
      scheduledWorkoutId: "workout_local",
      athleteId: "user_athlete_1",
      startedAt: "2026-03-24T08:00:00.000Z",
      updatedAt: "2026-03-24T08:10:00.000Z",
      setLogs: [
        {
          id: "log_local",
          scheduledWorkoutId: "workout_local",
          templateExerciseId: "exercise_1",
          setId: "set_1",
          exerciseId: "exercise_1",
          exerciseName: "Kyykky",
          setLabel: "1",
          targetReps: 5,
          actualReps: 5,
          done: true,
        },
      ],
    };

    state.scheduledWorkouts = [
      {
        id: "workout_local",
        athleteId: "user_athlete_1",
        coachId: "user_coach_1",
        title: "Jalkapäivä",
        scheduledDate: "2026-03-24T08:00:00.000Z",
        status: "in_progress",
        createdAt: "2026-03-24T08:00:00.000Z",
        updatedAt: "2026-03-24T08:10:00.000Z",
      },
    ];
    state.sessions = [localSession];

    const nextState = reconcileSupabaseVisibleState(state, {
      users: state.users,
      bodyMeasurements: state.bodyMeasurements,
      assignments: state.assignments,
      exercises: state.exercises,
      templates: state.templates,
      plans: state.plans,
      scheduledWorkouts: [
        {
          ...state.scheduledWorkouts[0]!,
          updatedAt: "2026-03-24T08:05:00.000Z",
        },
      ],
      sessions: [
        {
          ...localSession,
          updatedAt: "2026-03-24T08:05:00.000Z",
          setLogs: localSession.setLogs.map((log) => ({ ...log, done: false })),
        },
      ],
      notes: state.notes,
      conversationEntries: state.conversationEntries,
    });

    expect(nextState.sessions[0]?.setLogs[0]?.done).toBe(true);
    expect(nextState.scheduledWorkouts[0]?.updatedAt).toBe("2026-03-24T08:10:00.000Z");
  });

  it("preserves pending optimistic set updates even when a newer stale server session snapshot arrives", () => {
    const state = cloneDemoState();
    const localSession: WorkoutSession = {
      id: "session_local",
      scheduledWorkoutId: "workout_local",
      athleteId: "user_athlete_1",
      startedAt: "2026-03-24T08:00:00.000Z",
      updatedAt: "2026-03-24T08:12:00.000Z",
      setLogs: [
        {
          id: "log_local",
          scheduledWorkoutId: "workout_local",
          templateExerciseId: "exercise_1",
          setId: "set_1",
          exerciseId: "exercise_1",
          exerciseName: "Kyykky",
          setLabel: "1",
          targetReps: 5,
          actualReps: 5,
          actualLoad: 100,
          done: true,
        },
      ],
    };

    state.scheduledWorkouts = [
      {
        id: "workout_local",
        athleteId: "user_athlete_1",
        coachId: "user_coach_1",
        title: "Jalkapäivä",
        scheduledDate: "2026-03-24T08:00:00.000Z",
        status: "in_progress",
        createdAt: "2026-03-24T08:00:00.000Z",
        updatedAt: "2026-03-24T08:12:00.000Z",
      },
    ];
    state.sessions = [localSession];

    const nextState = reconcileSupabaseVisibleState(
      state,
      {
        users: state.users,
        bodyMeasurements: state.bodyMeasurements,
        assignments: state.assignments,
        exercises: state.exercises,
        templates: state.templates,
        plans: state.plans,
        scheduledWorkouts: [
          {
            ...state.scheduledWorkouts[0]!,
            updatedAt: "2026-03-24T08:11:00.000Z",
          },
        ],
        sessions: [
          {
            ...localSession,
            updatedAt: "2026-03-24T08:13:00.000Z",
            setLogs: [
              {
                ...localSession.setLogs[0]!,
                actualReps: 3,
                actualLoad: 90,
                done: false,
              },
            ],
          },
        ],
        notes: state.notes,
        conversationEntries: state.conversationEntries,
      },
      new Map(),
      new Map([
        [
          "workout_local",
          {
            scheduledWorkoutId: "workout_local",
            patches: new Map([
              [
                "exercise_1::1",
                {
                  logId: "log_local",
                  templateExerciseId: "exercise_1",
                  setLabel: "1",
                  done: true,
                  actualReps: 5,
                  actualLoad: 100,
                },
              ],
            ]),
            syncing: false,
            confirmedSessionUpdatedAt: "2026-03-24T08:10:00.000Z",
          },
        ],
      ]),
      new Map(),
    );

    expect(nextState.sessions[0]?.setLogs[0]).toMatchObject({
      actualReps: 5,
      actualLoad: 100,
      done: true,
    });
    expect(nextState.sessions[0]?.updatedAt).toBe("2026-03-24T08:12:00.000Z");
    expect(nextState.scheduledWorkouts[0]?.updatedAt).toBe("2026-03-24T08:12:00.000Z");
  });

  it("preserves recently confirmed set logs until the server snapshot catches up", () => {
    const state = cloneDemoState();
    const localSession: WorkoutSession = {
      id: "session_local",
      scheduledWorkoutId: "workout_local",
      athleteId: "user_athlete_1",
      startedAt: "2026-03-24T08:00:00.000Z",
      updatedAt: "2026-03-24T08:12:00.000Z",
      setLogs: [
        {
          id: "log_local",
          scheduledWorkoutId: "workout_local",
          templateExerciseId: "exercise_1",
          setId: "set_1",
          exerciseId: "exercise_1",
          exerciseName: "Kyykky",
          setLabel: "1",
          targetReps: 5,
          actualReps: 5,
          actualLoad: 100,
          done: true,
        },
      ],
    };

    state.scheduledWorkouts = [
      {
        id: "workout_local",
        athleteId: "user_athlete_1",
        coachId: "user_coach_1",
        title: "Jalkapäivä",
        scheduledDate: "2026-03-24T08:00:00.000Z",
        status: "in_progress",
        createdAt: "2026-03-24T08:00:00.000Z",
        updatedAt: "2026-03-24T08:12:00.000Z",
      },
    ];
    state.sessions = [localSession];

    const nextState = reconcileSupabaseVisibleState(
      state,
      {
        users: state.users,
        bodyMeasurements: state.bodyMeasurements,
        assignments: state.assignments,
        exercises: state.exercises,
        templates: state.templates,
        plans: state.plans,
        scheduledWorkouts: [
          {
            ...state.scheduledWorkouts[0]!,
            updatedAt: "2026-03-24T08:11:00.000Z",
          },
        ],
        sessions: [
          {
            ...localSession,
            updatedAt: "2026-03-24T08:11:00.000Z",
            setLogs: [
              {
                ...localSession.setLogs[0]!,
                actualReps: undefined,
                actualLoad: undefined,
                done: false,
              },
            ],
          },
        ],
        notes: state.notes,
        conversationEntries: state.conversationEntries,
      },
      new Map(),
      new Map(),
      new Map([
        ["workout_local", "2026-03-24T08:12:00.000Z"],
      ]),
    );

    expect(nextState.sessions[0]?.setLogs[0]).toMatchObject({
      actualReps: 5,
      actualLoad: 100,
      done: true,
    });
    expect(nextState.sessions[0]?.updatedAt).toBe("2026-03-24T08:12:00.000Z");
  });

  it("preserves a recently confirmed workout note until the server snapshot catches up", () => {
    const state = cloneDemoState();
    state.scheduledWorkouts = [
      {
        id: "workout_local",
        athleteId: "user_athlete_1",
        coachId: "user_coach_1",
        title: "Jalkapäivä",
        scheduledDate: "2026-03-24T08:00:00.000Z",
        status: "in_progress",
        createdAt: "2026-03-24T08:00:00.000Z",
        updatedAt: "2026-03-24T08:12:00.000Z",
      },
    ];
    state.sessions = [
      {
        id: "session_local",
        scheduledWorkoutId: "workout_local",
        athleteId: "user_athlete_1",
        startedAt: "2026-03-24T08:00:00.000Z",
        updatedAt: "2026-03-24T08:12:00.000Z",
        setLogs: [],
      },
    ];
    state.notes = [
      {
        id: "note_local",
        sessionId: "session_local",
        athleteId: "user_athlete_1",
        coachId: "user_coach_1",
        body: "Tuore muistiinpano",
        createdAt: "2026-03-24T08:00:00.000Z",
        updatedAt: "2026-03-24T08:12:00.000Z",
      },
    ];

    const nextState = reconcileSupabaseVisibleState(
      state,
      {
        users: state.users,
        bodyMeasurements: state.bodyMeasurements,
        assignments: state.assignments,
        exercises: state.exercises,
        templates: state.templates,
        plans: state.plans,
        scheduledWorkouts: state.scheduledWorkouts,
        sessions: state.sessions.map((session) => ({
          ...session,
          updatedAt: "2026-03-24T08:11:00.000Z",
        })),
        notes: [
          {
            ...state.notes[0]!,
            body: "Vanha muistiinpano",
            updatedAt: "2026-03-24T08:11:00.000Z",
          },
        ],
        conversationEntries: state.conversationEntries,
      },
      new Map(),
      new Map(),
      new Map(),
      new Map([["workout_local", "2026-03-24T08:12:00.000Z"]]),
    );

    expect(nextState.notes[0]).toMatchObject({
      body: "Tuore muistiinpano",
      updatedAt: "2026-03-24T08:12:00.000Z",
    });
  });

  it("preserves an optimistic active workout shell until the server snapshot catches up", () => {
    const state = cloneDemoState();

    state.scheduledWorkouts = [
      {
        id: "workout_local_start",
        athleteId: "user_athlete_1",
        coachId: "user_admin",
        trainingPlanId: "plan_1",
        programWorkoutId: "day_1",
        title: "Penkki",
        scheduledDate: "2026-03-24T08:00:00.000Z",
        status: "in_progress",
        createdAt: "2026-03-24T08:00:00.000Z",
        updatedAt: "2026-03-24T08:00:00.000Z",
      },
    ];
    state.sessions = [
      {
        id: "session_local_start",
        scheduledWorkoutId: "workout_local_start",
        athleteId: "user_athlete_1",
        startedAt: "2026-03-24T08:00:00.000Z",
        updatedAt: "2026-03-24T08:00:00.000Z",
        pausedDurationSeconds: 0,
        setLogs: [],
      },
    ];

    const preserved = preserveActiveWorkoutShells(state, {
      users: state.users,
      bodyMeasurements: state.bodyMeasurements,
      assignments: state.assignments,
      exercises: state.exercises,
      templates: state.templates,
      plans: state.plans,
      scheduledWorkouts: [],
      sessions: [],
      notes: state.notes,
      conversationEntries: state.conversationEntries,
    });

    expect(preserved.scheduledWorkouts.some((workout: { id: string }) => workout.id === "workout_local_start")).toBe(true);
    expect(preserved.sessions.some((session: { id: string }) => session.id === "session_local_start")).toBe(true);
  });

  it("rekeys optimistic workout artifacts to the persisted workout id", () => {
    const state = cloneDemoState();

    state.scheduledWorkouts = [
      {
        id: "workout_local_start",
        athleteId: "user_athlete_1",
        coachId: "user_admin",
        trainingPlanId: "plan_1",
        programWorkoutId: "day_1",
        title: "Penkki",
        scheduledDate: "2026-03-24T08:00:00.000Z",
        status: "in_progress",
        createdAt: "2026-03-24T08:00:00.000Z",
        updatedAt: "2026-03-24T08:00:00.000Z",
      },
    ];
    state.sessions = [
      {
        id: "session_local_start",
        scheduledWorkoutId: "workout_local_start",
        athleteId: "user_athlete_1",
        startedAt: "2026-03-24T08:00:00.000Z",
        updatedAt: "2026-03-24T08:00:00.000Z",
        pausedDurationSeconds: 0,
        setLogs: [
          {
            id: "log_local_start",
            scheduledWorkoutId: "workout_local_start",
            templateExerciseId: "exercise_1",
            setId: "set_1",
            exerciseId: "exercise_1",
            exerciseName: "Penkkipunnerrus",
            setLabel: "1",
            targetReps: 5,
            actualReps: 0,
            done: false,
          },
        ],
      },
    ];
    state.conversationEntries = [
      {
        id: "conversation_1",
        athleteId: "user_athlete_1",
        coachId: "user_admin",
        authorUserId: "user_athlete_1",
        authorRole: "athlete",
        type: "comment",
        body: "Testi",
        contextType: "workout",
        contextId: "workout_local_start",
        contextLabel: "Penkki",
        readByUserIds: [],
        createdAt: "2026-03-24T08:00:00.000Z",
      },
    ];

    const nextState = rekeyOptimisticWorkoutArtifacts(state, "workout_local_start", "srv_workout_1");

    expect(nextState.scheduledWorkouts[0]?.id).toBe("srv_workout_1");
    expect(nextState.sessions[0]?.scheduledWorkoutId).toBe("srv_workout_1");
    expect(nextState.sessions[0]?.setLogs[0]?.scheduledWorkoutId).toBe("srv_workout_1");
    expect(nextState.conversationEntries[0]?.contextId).toBe("srv_workout_1");
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
        profile_image_url: null,
        email: "laaloceesay+test@gmail.com",
        default_dashboard_view: "athlete-log",
        email_notifications: false,
        weekly_measurement_reminders: true,
        theme_mode: "light",
        load_increment_kg: 2.5,
        height_cm: 181,
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
      resolution.nextState.users.find((user) => user.id === supabaseUserId)?.heightCm,
    ).toBe(181);
    expect(
      resolution.nextState.users.find((user) => user.id === supabaseUserId)?.settings?.loadIncrementKg,
    ).toBe(2.5);
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
            weeklyMeasurementReminders: true,
            themeMode: "light",
            loadIncrementKg: 2.5,
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

  it("drops invited placeholders from visible state when the server already has an active user for the same email", () => {
    const state = cloneDemoState();
    const eliasEmail = "eliaskautto@gmail.com";
    const resolvedUserId = "e3cedd3c-c34a-4748-95a0-56a43f028ff8";

    state.users = [
      ...state.users,
      {
        id: "user_placeholder_visible",
        role: "athlete",
        fullName: "eliaskautto",
        email: eliasEmail,
        status: "invited",
        createdAt: "2026-03-24T08:00:00.000Z",
        updatedAt: "2026-03-24T08:00:00.000Z",
      },
    ];

    const nextState = reconcileSupabaseVisibleState(state, {
      users: [
        {
          id: resolvedUserId,
          role: "athlete",
          fullName: "Elias Kautto",
          email: eliasEmail,
          status: "active",
          settings: {
            defaultDashboardView: "athlete-log",
            emailNotifications: false,
            weeklyMeasurementReminders: true,
            themeMode: "light",
            loadIncrementKg: 2.5,
          },
          createdAt: "2026-03-24T08:30:00.000Z",
          updatedAt: "2026-03-24T08:30:00.000Z",
        },
      ],
      bodyMeasurements: [],
      nutritionProfiles: [],
      ingredientsCatalog: [],
      recipes: [],
      mealPlanTemplates: [],
      assignedMealPlans: [],
      assignments: [],
      exercises: [],
      templates: [],
      plans: [],
      scheduledWorkouts: [],
      sessions: [],
      notes: [],
      conversationEntries: [],
    });

    expect(nextState.users.some((user) => user.id === "user_placeholder_visible")).toBe(false);
    expect(nextState.users.find((user) => user.email === eliasEmail)?.id).toBe(resolvedUserId);
    expect(nextState.users.find((user) => user.email === eliasEmail)?.status).toBe("active");
  });

  it("prefers the active server user over an invited placeholder with the same email", () => {
    const state = cloneDemoState();
    const eliasEmail = "eliaskautto@gmail.com";

    state.users = [
      ...state.users,
      {
        id: "user_placeholder_visible",
        role: "athlete",
        fullName: "eliaskautto",
        email: eliasEmail,
        status: "invited",
        createdAt: "2026-03-24T08:00:00.000Z",
        updatedAt: "2026-03-24T08:00:00.000Z",
      },
      {
        id: "e3cedd3c-c34a-4748-95a0-56a43f028ff8",
        role: "athlete",
        fullName: "Elias Kautto",
        email: eliasEmail,
        status: "active",
        settings: {
          defaultDashboardView: "athlete-log",
          emailNotifications: false,
          weeklyMeasurementReminders: true,
          themeMode: "light",
          loadIncrementKg: 2.5,
        },
        createdAt: "2026-03-24T08:30:00.000Z",
        updatedAt: "2026-03-24T08:30:00.000Z",
      },
    ];

    const resolvedUser = resolveSelectedUserFromState(state, "user_placeholder_visible");

    expect(resolvedUser?.id).toBe("e3cedd3c-c34a-4748-95a0-56a43f028ff8");
    expect(resolvedUser?.status).toBe("active");
  });

  it("finds an in-progress or resumable workout as a blocking start condition", () => {
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
    state.sessions = [
      {
        id: "session_blocking",
        scheduledWorkoutId: blockingWorkoutId,
        athleteId,
        startedAt: "2026-03-24T08:00:00.000Z",
        updatedAt: "2026-03-24T08:10:00.000Z",
        setLogs: [],
      },
    ];

    expect(resolveBlockingWorkoutStart(state, athleteId)?.id).toBe(blockingWorkoutId);
    expect(resolveBlockingWorkoutStart(state, athleteId, blockingProgramWorkoutId)).toBeNull();

    state.scheduledWorkouts = state.scheduledWorkouts.map((workout) =>
      workout.id === blockingWorkoutId ? { ...workout, status: "cancelled" } : workout,
    );

    expect(resolveBlockingWorkoutStart(state, athleteId)?.id).toBe(blockingWorkoutId);

    state.sessions = [];

    expect(resolveBlockingWorkoutStart(state, athleteId)).toBeNull();
  });

  it("ignores workouts whose session is already completed even if the scheduled status is stale", () => {
    const state = cloneDemoState();
    const athleteId = "user_athlete_1";
    const blockingWorkoutId = "workout_completed_but_stale";

    state.scheduledWorkouts = [
      {
        id: blockingWorkoutId,
        athleteId,
        coachId: "user_admin",
        title: "Voimapäivä A",
        scheduledDate: "2026-03-24T08:00:00.000Z",
        status: "in_progress",
        createdAt: "2026-03-24T08:00:00.000Z",
        updatedAt: "2026-03-24T08:10:00.000Z",
      },
    ];
    state.sessions = [
      {
        id: "session_completed",
        scheduledWorkoutId: blockingWorkoutId,
        athleteId,
        startedAt: "2026-03-24T08:00:00.000Z",
        completedAt: "2026-03-24T09:00:00.000Z",
        updatedAt: "2026-03-24T09:00:00.000Z",
        setLogs: [],
      },
    ];

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

  it("marks a program removed instead of deleting its history", () => {
    const state = cloneDemoState();

    expect(canDeleteProgramFromState(state, "plan_1")).toBe(true);

    const nextState = applyProgramDeletion(state, "plan_1");
    expect(nextState.plans.find((plan) => plan.id === "plan_1")?.status).toBe("removed");
    expect(canDeleteProgramFromState(nextState, "plan_1")).toBe(false);
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
      {
        id: "plan_c",
        coachId: "user_admin",
        athleteId: "user_athlete_1",
        title: "Ohjelma C",
        status: "removed",
        workouts: [],
        startDate: "2026-03-24",
        weekCount: 4,
        createdAt: "2026-03-24T08:20:00.000Z",
      },
    ];

    const nextState = applyProgramStatusUpdate(state, "plan_b", "active");

    expect(nextState.plans.find((plan) => plan.id === "plan_a")?.status).toBe("archived");
    expect(nextState.plans.find((plan) => plan.id === "plan_b")?.status).toBe("active");
    expect(nextState.plans.find((plan) => plan.id === "plan_c")?.status).toBe("removed");
  });
});

describe("applyPartialUserMeasurementUpdate", () => {
  it("keeps height and waist when only weight is updated", () => {
    const state = cloneDemoState();
    const athleteId = "user_athlete_1";
    state.users = state.users.map((user) =>
      user.id === athleteId
        ? {
            ...user,
            heightCm: 181,
            weightKg: 80,
            waistCm: 86,
          }
        : user,
    );

    const nextState = applyPartialUserMeasurementUpdate(state, athleteId, { weightKg: 78.5 }, "2026-03-25T10:00:00.000Z");
    const nextUser = nextState.users.find((user) => user.id === athleteId);
    const newestMeasurement = nextState.bodyMeasurements[0];

    expect(nextUser?.heightCm).toBe(181);
    expect(nextUser?.weightKg).toBe(78.5);
    expect(nextUser?.waistCm).toBe(86);
    expect(newestMeasurement?.heightCm).toBeUndefined();
    expect(newestMeasurement?.weightKg).toBe(78.5);
    expect(newestMeasurement?.waistCm).toBeUndefined();
  });

  it("keeps weight and waist when only height is updated", () => {
    const state = cloneDemoState();
    const athleteId = "user_athlete_1";
    state.users = state.users.map((user) =>
      user.id === athleteId
        ? {
            ...user,
            heightCm: 181,
            weightKg: 80,
            waistCm: 86,
          }
        : user,
    );

    const nextState = applyPartialUserMeasurementUpdate(state, athleteId, { heightCm: 182 }, "2026-03-25T10:05:00.000Z");
    const nextUser = nextState.users.find((user) => user.id === athleteId);
    const newestMeasurement = nextState.bodyMeasurements[0];

    expect(nextUser?.heightCm).toBe(182);
    expect(nextUser?.weightKg).toBe(80);
    expect(nextUser?.waistCm).toBe(86);
    expect(newestMeasurement?.heightCm).toBe(182);
    expect(newestMeasurement?.weightKg).toBeUndefined();
    expect(newestMeasurement?.waistCm).toBeUndefined();
  });
});
