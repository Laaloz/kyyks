import { describe, expect, it } from "vitest";

import { cloneDemoState } from "@/lib/domain";
import {
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
});
