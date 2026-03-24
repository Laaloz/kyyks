// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseAdminClientMock } = vi.hoisted(() => ({
  createSupabaseAdminClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock,
}));
vi.mock("server-only", () => ({}));

import { createProgramOnServer } from "@/lib/server/training-workflows";

type MockProfile = {
  id: string;
  role: "admin" | "coach" | "athlete";
  email: string;
};

type MockAssignment = {
  id: string;
  coach_id: string;
  athlete_id: string;
  active: boolean;
};

function createMockAdminClient({
  profiles,
  assignments,
}: {
  profiles: MockProfile[];
  assignments?: MockAssignment[];
}) {
  const profileRows = [...profiles];
  const assignmentRows = [...(assignments ?? [])];
  const insertedPlans: Array<Record<string, unknown>> = [];

  const createBuilder = (table: string) => {
    const filters: Array<{ kind: "eq" | "ilike"; column: string; value: unknown }> = [];
    let selectedColumns = "";
    let updateValues: Record<string, unknown> | null = null;
    let insertValues: Record<string, unknown> | null = null;

    const findProfile = () =>
      profileRows.find((profile) =>
        filters.every((filter) => {
          const currentValue = profile[filter.column as keyof MockProfile];
          if (filter.kind === "ilike") {
            return String(currentValue ?? "").toLowerCase() === String(filter.value ?? "").toLowerCase();
          }
          return currentValue === filter.value;
        }),
      ) ?? null;

    const findAssignment = () =>
      assignmentRows.find((assignment) =>
        filters.every((filter) => assignment[filter.column as keyof MockAssignment] === filter.value),
      ) ?? null;

    const builder = {
      select: vi.fn((columns?: string) => {
        selectedColumns = columns ?? "";
        return builder;
      }),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push({ kind: "eq", column, value });
        return builder;
      }),
      ilike: vi.fn((column: string, value: unknown) => {
        filters.push({ kind: "ilike", column, value });
        return builder;
      }),
      update: vi.fn((values: Record<string, unknown>) => {
        updateValues = values;
        return builder;
      }),
      insert: vi.fn((values: Record<string, unknown>) => {
        insertValues = values;
        if (table === "training_plans") {
          insertedPlans.push(values);
        }
        return builder;
      }),
      maybeSingle: vi.fn(async () => {
        if (table === "profiles") {
          return { data: findProfile(), error: null };
        }

        if (table === "coach_athlete_assignments") {
          return { data: findAssignment(), error: null };
        }

        return { data: null, error: null };
      }),
      single: vi.fn(async () => {
        if (table === "training_plans" && insertValues) {
          return {
            data: {
              id: "plan-created-1",
              ...(selectedColumns.includes("id") ? {} : insertValues),
            },
            error: null,
          };
        }

        return { data: null, error: null };
      }),
      then: (resolve: (value: { data: unknown; error: null }) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve({ data: updateValues, error: null }).then(resolve, reject),
    };

    return builder;
  };

  return {
    client: {
      from(table: string) {
        return createBuilder(table);
      },
    },
    state: {
      insertedPlans,
    },
  };
}

beforeEach(() => {
  createSupabaseAdminClientMock.mockReset();
});

describe("training workflows server", () => {
  it("resolves the athlete by email when the client sends a stale placeholder id", async () => {
    const mock = createMockAdminClient({
      profiles: [
        {
          id: "admin-1",
          role: "admin",
          email: "admin@example.com",
        },
        {
          id: "e3cedd3c-c34a-4748-95a0-56a43f028ff8",
          role: "athlete",
          email: "laaloceesay+testaa@gmail.com",
        },
      ],
    });

    createSupabaseAdminClientMock.mockReturnValue(mock.client);

    const result = await createProgramOnServer({
      requester: {
        id: "admin-1",
        role: "admin",
      },
      payload: {
        title: "Testiohjelma",
        athleteId: "user_placeholder_invite",
        athleteEmail: "laaloceesay+testaa@gmail.com",
        workouts: [
          {
            splitType: "upper",
            defaultRestSeconds: 120,
            exercises: [
              {
                exerciseId: "ex_bench_press",
                exerciseName: "Penkkipunnerrus",
                instruction: "Pidä toistot puhtaina.",
                setCount: 3,
                targetReps: 5,
              },
            ],
          },
        ],
      },
    });

    expect(result).toEqual({
      ok: true,
      programId: "plan-created-1",
    });
    expect(mock.state.insertedPlans).toContainEqual(
      expect.objectContaining({
        athlete_id: "e3cedd3c-c34a-4748-95a0-56a43f028ff8",
      }),
    );
  });
});
