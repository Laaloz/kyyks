// @vitest-environment node

import { describe, expect, it, vi, beforeEach } from "vitest";

const { createSupabaseServerClientMock } = vi.hoisted(() => ({
  createSupabaseServerClientMock: vi.fn(),
}));

const { ensureProfileForAuthenticatedUserOnServerMock } = vi.hoisted(() => ({
  ensureProfileForAuthenticatedUserOnServerMock: vi.fn(),
}));

const { loadVisibleSupabaseAppStateMock } = vi.hoisted(() => ({
  loadVisibleSupabaseAppStateMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: createSupabaseServerClientMock,
}));

vi.mock("@/lib/server/auth-workflows", () => ({
  ensureProfileForAuthenticatedUserOnServer: ensureProfileForAuthenticatedUserOnServerMock,
}));

vi.mock("@/lib/server/training-sync", () => ({
  loadVisibleSupabaseAppState: loadVisibleSupabaseAppStateMock,
}));

vi.mock("@/lib/server/request-timing", () => ({
  createRequestTimer: () => ({
    json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
    log: vi.fn(),
  }),
}));

import { GET } from "@/app/api/app-state/route";

describe("GET /api/app-state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the bearer token when provided and returns the profile repair error", async () => {
    const getUser = vi.fn(async (token?: string) => ({
      data: {
        user: token === "token-123"
          ? {
              id: "user-1",
              email: "athlete@example.com",
              user_metadata: { full_name: "Athlete One" },
            }
          : null,
      },
    }));

    createSupabaseServerClientMock.mockResolvedValue({
      auth: {
        getUser,
      },
    });

    ensureProfileForAuthenticatedUserOnServerMock.mockResolvedValue({
      ok: false,
      message: "Käyttäjäprofiilia ei löytynyt eikä sähköpostille löytynyt kutsua.",
    });

    const response = await GET(
      new Request("https://example.com/api/app-state", {
        headers: {
          authorization: "Bearer token-123",
        },
      }),
    );

    expect(createSupabaseServerClientMock).toHaveBeenCalledWith({ accessToken: "token-123" });
    expect(getUser).toHaveBeenCalledWith("token-123");
    expect(ensureProfileForAuthenticatedUserOnServerMock).toHaveBeenCalledWith({
      authUserId: "user-1",
      email: "athlete@example.com",
      fullName: "Athlete One",
    });
    expect(loadVisibleSupabaseAppStateMock).not.toHaveBeenCalled();
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: "Käyttäjäprofiilia ei löytynyt eikä sähköpostille löytynyt kutsua.",
    });
  });

  it("falls back to cookie auth when no bearer token is provided", async () => {
    const getUser = vi.fn(async () => ({
      data: {
        user: {
          id: "user-2",
          email: "coach@example.com",
          user_metadata: { name: "Coach Example" },
        },
      },
    }));

    createSupabaseServerClientMock.mockResolvedValue({
      auth: {
        getUser,
      },
    });

    ensureProfileForAuthenticatedUserOnServerMock.mockResolvedValue({
      ok: true,
      repaired: false,
    });

    loadVisibleSupabaseAppStateMock.mockResolvedValue({
      users: [],
      bodyMeasurements: [],
      assignments: [],
      exercises: [],
      templates: [],
      plans: [],
      scheduledWorkouts: [],
      sessions: [],
      notes: [],
      conversationEntries: [],
    });

    const response = await GET(new Request("https://example.com/api/app-state"));

    expect(createSupabaseServerClientMock).toHaveBeenCalledWith({ accessToken: undefined });
    expect(getUser).toHaveBeenCalledWith();
    expect(response.status).toBe(200);
  });
});
