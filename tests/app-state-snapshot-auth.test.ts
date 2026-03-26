import { describe, expect, it, vi, beforeEach } from "vitest";

const { getSessionMock, createSupabaseBrowserClientMock } = vi.hoisted(() => {
  const getSessionMock = vi.fn();
  const createSupabaseBrowserClientMock = vi.fn(() => ({
    auth: {
      getSession: getSessionMock,
    },
  }));

  return { getSessionMock, createSupabaseBrowserClientMock };
});

vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: createSupabaseBrowserClientMock,
}));

import { fetchSupabaseVisibleStateSnapshotWithClient } from "@/providers/app-state-provider";

describe("fetchSupabaseVisibleStateSnapshotWithClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the explicit access token without asking Supabase session again", async () => {
    getSessionMock.mockResolvedValue({
      data: {
        session: {
          access_token: "session-token",
        },
      },
    });

    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
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
        }),
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    await fetchSupabaseVisibleStateSnapshotWithClient(
      createSupabaseBrowserClientMock() as never,
      { accessToken: "direct-token" },
    );

    expect(getSessionMock).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/app-state",
      expect.objectContaining({
        headers: {
          Authorization: "Bearer direct-token",
        },
      }),
    );
  });
});
