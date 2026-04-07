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

  it("throws the backend message when requested", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ message: "Profiles sync failed: permission denied" }), { status: 403 }),
    );

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchSupabaseVisibleStateSnapshotWithClient(createSupabaseBrowserClientMock() as never, {
        accessToken: "direct-token",
        throwOnError: true,
      }),
    ).rejects.toThrow("Profiles sync failed: permission denied");
  });
});
