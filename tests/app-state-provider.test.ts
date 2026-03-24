import { describe, expect, it } from "vitest";

import {
  shouldPreserveStoredSessionDuringSupabaseBootstrap,
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
});
