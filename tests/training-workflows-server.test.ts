// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseAdminClientMock } = vi.hoisted(() => ({
  createSupabaseAdminClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock,
}));
vi.mock("server-only", () => ({}));

import {
  completeWorkoutOnServer,
  createProgramOnServer,
  saveWorkoutNoteOnServer,
  syncWorkoutSetDraftsOnServer,
  startProgramWorkoutOnServer,
  updateWorkoutDateOnServer,
  updateWorkoutDurationOnServer,
  updateWorkoutSetOnServer,
} from "@/lib/server/training-workflows";

type MockProfile = {
  id: string;
  role: "admin" | "coach" | "athlete" | "independent_athlete";
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
  workoutSetLogs,
}: {
  profiles: MockProfile[];
  assignments?: MockAssignment[];
  workoutSetLogs?: Array<{
    id: string;
    scheduled_workout_id: string;
    template_exercise_id: string;
    set_label: string;
  }>;
}) {
  const profileRows = [...profiles];
  const assignmentRows = [...(assignments ?? [])];
  const workoutSetLogRows = [...(workoutSetLogs ?? [])];
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

    const findWorkoutSetLog = () =>
      workoutSetLogRows.find((log) =>
        filters.every((filter) => log[filter.column as keyof (typeof workoutSetLogRows)[number]] === filter.value),
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

        if (table === "workout_set_logs") {
          return { data: findWorkoutSetLog(), error: null };
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

function createWorkoutSetRpcClient(result: Record<string, unknown>, options?: { error?: { message?: string } | null }) {
  return {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    })),
    rpc: vi.fn(async () => ({
      data: result,
      error: options?.error ?? null,
    })),
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

  it("allows an independent athlete to create a program only for themselves", async () => {
    const mock = createMockAdminClient({
      profiles: [
        {
          id: "independent-1",
          role: "independent_athlete",
          email: "solo@example.com",
        },
      ],
    });

    createSupabaseAdminClientMock.mockReturnValue(mock.client);

    const result = await createProgramOnServer({
      requester: {
        id: "independent-1",
        role: "independent_athlete",
      },
      payload: {
        title: "Oma ohjelma",
        athleteId: "independent-1",
        athleteEmail: "solo@example.com",
        workouts: [
          {
            splitType: "full_body",
            defaultRestSeconds: 120,
            exercises: [
              {
                exerciseId: "ex_squat",
                exerciseName: "Kyykky",
                instruction: "Pidä keskivartalo tiukkana.",
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
        coach_id: "independent-1",
        athlete_id: "independent-1",
      }),
    );
  });

  it("updates the set log and session timestamp through direct writes", async () => {
    const admin = {
      from: vi.fn((table: string) => {
        const builder = {
          select: vi.fn(() => builder),
          eq: vi.fn(() => builder),
          neq: vi.fn(() => builder),
          maybeSingle: vi.fn(async () => {
            if (table === "scheduled_workouts") {
              return {
                data: { id: "workout-1", athlete_id: "athlete-1", status: "in_progress" },
                error: null,
              };
            }

            if (table === "workout_set_logs") {
              return {
                data: {
                  id: "log-1",
                  template_exercise_id: "exercise-1",
                  set_id: "set-1",
                  set_label: "1",
                  superset_group: null,
                  target_reps: 8,
                  target_reps_min: 6,
                  target_load: 100,
                  actual_reps: null,
                  actual_load: null,
                  done: false,
                },
                error: null,
              };
            }

            return { data: null, error: null };
          }),
          update: vi.fn(() => builder),
          then: (resolve: (value: { data: unknown; error: null }) => unknown, reject?: (reason: unknown) => unknown) =>
            Promise.resolve({ data: {}, error: null }).then(resolve, reject),
        };
        return builder;
      }),
    };

    createSupabaseAdminClientMock.mockReturnValue(admin);

    const result = await updateWorkoutSetOnServer({
      requester: {
        id: "athlete-1",
        role: "athlete",
      },
      scheduledWorkoutId: "workout-1",
      logId: "log-1",
      patch: {
        done: true,
        actualReps: null,
        actualLoad: null,
      },
    });

    expect(admin.from).toHaveBeenCalledWith("scheduled_workouts");
    expect(admin.from).toHaveBeenCalledWith("workout_set_logs");
    expect(admin.from).toHaveBeenCalledWith("workout_sessions");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.setLog).toEqual({
        id: "log-1",
        actualReps: 6,
        actualLoad: 100,
        done: true,
      });
      expect(result.sessionUpdatedAt).toBeTruthy();
    }
  });

  it("remaps stale client log ids from template exercise and set label before the set write", async () => {
    const admin = {
      from: vi.fn((table: string) => {
        const builder = {
          select: vi.fn(() => builder),
          eq: vi.fn((column: string, value: unknown) => {
            if (table === "workout_set_logs" && column === "scheduled_workout_id") {
              expect(value).toBe("workout-1");
            }
            if (table === "workout_set_logs" && column === "template_exercise_id") {
              expect(value).toBe("exercise-1");
            }
            if (table === "workout_set_logs" && column === "set_label") {
              expect(value).toBe("2");
            }
            return builder;
          }),
          neq: vi.fn(() => builder),
          maybeSingle: vi.fn(async () => ({
            data:
              table === "scheduled_workouts"
                ? { id: "workout-1", athlete_id: "athlete-1", status: "in_progress" }
                : table === "workout_set_logs"
                  ? {
                      id: "server-log-2",
                      template_exercise_id: "exercise-1",
                      set_id: "set-2",
                      set_label: "2",
                      superset_group: null,
                      target_reps: 8,
                      target_reps_min: 6,
                      target_load: 100,
                      actual_reps: null,
                      actual_load: null,
                      done: false,
                    }
                  : null,
            error: null,
          })),
          update: vi.fn(() => builder),
          then: (resolve: (value: { data: unknown; error: null }) => unknown, reject?: (reason: unknown) => unknown) =>
            Promise.resolve({ data: {}, error: null }).then(resolve, reject),
        };
        return builder;
      }),
    };

    createSupabaseAdminClientMock.mockReturnValue(admin);

    const result = await updateWorkoutSetOnServer({
      requester: {
        id: "athlete-1",
        role: "athlete",
      },
      scheduledWorkoutId: "workout-1",
      logId: "stale-local-log",
      patch: {
        done: true,
        actualReps: 8,
        templateExerciseId: "exercise-1",
        setLabel: "2",
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.setLog).toEqual({
        id: "server-log-2",
        actualReps: 8,
        actualLoad: 100,
        done: true,
      });
    }
  });

  it("syncs multiple dirty workout sets in a single batch", async () => {
    const admin = {
      from: vi.fn((table: string) => {
        const builder = {
          select: vi.fn(() => builder),
          eq: vi.fn(() => builder),
          neq: vi.fn(() => builder),
          maybeSingle: vi.fn(async () => ({
            data: table === "scheduled_workouts" ? { id: "workout-1", athlete_id: "athlete-1", status: "in_progress" } : null,
            error: null,
          })),
          update: vi.fn(() => builder),
          then: (resolve: (value: { data: unknown; error: null }) => unknown, reject?: (reason: unknown) => unknown) =>
            Promise.resolve({
              data:
                table === "workout_set_logs"
                  ? [
                      {
                        id: "log-1",
                        template_exercise_id: "exercise-1",
                        set_id: "set-1",
                        set_label: "1",
                        superset_group: null,
                        target_reps: 8,
                        target_reps_min: 6,
                        target_load: 100,
                        actual_reps: null,
                        actual_load: null,
                        done: false,
                      },
                      {
                        id: "log-2",
                        template_exercise_id: "exercise-1",
                        set_id: "set-2",
                        set_label: "2",
                        superset_group: null,
                        target_reps: 8,
                        target_reps_min: 6,
                        target_load: 110,
                        actual_reps: null,
                        actual_load: null,
                        done: false,
                      },
                    ]
                  : {},
              error: null,
            }).then(resolve, reject),
        };

        return builder;
      }),
    };

    createSupabaseAdminClientMock.mockReturnValue(admin);

    const result = await syncWorkoutSetDraftsOnServer({
      requester: {
        id: "athlete-1",
        role: "athlete",
      },
      scheduledWorkoutId: "workout-1",
      sets: [
        {
          templateExerciseId: "exercise-1",
          setLabel: "1",
          done: true,
        },
        {
          templateExerciseId: "exercise-1",
          setLabel: "2",
          actualReps: 7,
          actualLoad: 112.5,
          done: true,
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.setLogs).toEqual([
        {
          id: "log-1",
          templateExerciseId: "exercise-1",
          setLabel: "1",
          actualReps: 6,
          actualLoad: 100,
          done: true,
        },
        {
          id: "log-2",
          templateExerciseId: "exercise-1",
          setLabel: "2",
          actualReps: 7,
          actualLoad: 112.5,
          done: true,
        },
      ]);
    }
  });

  it("does not reopen a workout as active when its session is already completed", async () => {
    const admin = {
      from: vi.fn((table: string) => {
        const builder = {
          select: vi.fn(() => builder),
          eq: vi.fn(() => builder),
          in: vi.fn(() => builder),
          neq: vi.fn(() => builder),
          not: vi.fn(() => builder),
          order: vi.fn(() => builder),
          insert: vi.fn(() => builder),
          maybeSingle: vi.fn(async () => {
            if (table === "training_plans") {
              return {
                data: {
                  id: "plan-1",
                  coach_id: "coach-1",
                  athlete_id: "athlete-1",
                  title: "Plan",
                  description: null,
                  status: "active",
                  start_date: "2026-04-01",
                  week_count: 4,
                  workouts: [
                    {
                      id: "program-workout-1",
                      name: "Penkki",
                      splitType: "upper",
                      defaultRestSeconds: 120,
                      exercises: [],
                    },
                  ],
                  created_at: "2026-04-01T08:00:00.000Z",
                  updated_at: "2026-04-01T08:00:00.000Z",
                },
                error: null,
              };
            }

            if (table === "scheduled_workouts") {
              return {
                data: {
                  id: "old-workout",
                  title: "Penkki",
                },
                error: null,
              };
            }

            if (table === "workout_sessions") {
              return {
                data: {
                  completed_at: "2026-04-03T08:00:00.000Z",
                },
                error: null,
              };
            }

            return { data: null, error: null };
          }),
          single: vi.fn(async () => {
            if (table === "scheduled_workouts") {
              return {
                data: { id: "new-workout" },
                error: null,
              };
            }

            if (table === "workout_sessions") {
              return {
                data: { id: "new-session", updated_at: "2026-04-03T08:10:00.000Z" },
                error: null,
              };
            }

            return { data: null, error: null };
          }),
          then: (resolve: (value: { data: unknown; error: null }) => unknown, reject?: (reason: unknown) => unknown) =>
            Promise.resolve({ data: [], error: null }).then(resolve, reject),
        };
        return builder;
      }),
    };

    createSupabaseAdminClientMock.mockReturnValue(admin);

    const result = await startProgramWorkoutOnServer({
      requester: {
        id: "athlete-1",
        role: "athlete",
      },
      programId: "plan-1",
      programWorkoutId: "program-workout-1",
    });

    expect(result).toEqual({
      ok: true,
      scheduledWorkoutId: "new-workout",
    });
  });

  it("sends duration updates through the atomic rpc with expected session version", async () => {
    const admin = createWorkoutSetRpcClient({
      ok: true,
      updated_at: "2026-04-02T09:20:00.000Z",
    });
    createSupabaseAdminClientMock.mockReturnValue(admin);

    const result = await updateWorkoutDurationOnServer({
      requester: { id: "athlete-1", role: "athlete" },
      scheduledWorkoutId: "workout-1",
      durationSeconds: 3600,
      expectedUpdatedAt: "2026-04-02T09:00:00.000Z",
    });

    expect(admin.rpc).toHaveBeenCalledWith("update_workout_duration_atomic", {
      p_scheduled_workout_id: "workout-1",
      p_requester_id: "athlete-1",
      p_requester_role: "athlete",
      p_expected_session_updated_at: "2026-04-02T09:00:00.000Z",
      p_duration_seconds: 3600,
    });
    expect(result).toEqual({ ok: true, updatedAt: "2026-04-02T09:20:00.000Z" });
  });

  it("sends date updates through the atomic rpc with expected session version", async () => {
    const admin = createWorkoutSetRpcClient({
      ok: true,
      updated_at: "2026-04-02T09:20:00.000Z",
      completed_at: "2026-04-05T09:20:00.000Z",
    });
    createSupabaseAdminClientMock.mockReturnValue(admin);

    const result = await updateWorkoutDateOnServer({
      requester: { id: "athlete-1", role: "athlete" },
      scheduledWorkoutId: "workout-1",
      scheduledDate: "2026-04-05",
      expectedUpdatedAt: "2026-04-02T09:00:00.000Z",
    });

    expect(admin.rpc).toHaveBeenCalledWith("update_workout_date_atomic", {
      p_scheduled_workout_id: "workout-1",
      p_requester_id: "athlete-1",
      p_requester_role: "athlete",
      p_expected_session_updated_at: "2026-04-02T09:00:00.000Z",
      p_scheduled_date: "2026-04-05",
    });
    expect(result).toEqual({
      ok: true,
      updatedAt: "2026-04-02T09:20:00.000Z",
      completedAt: "2026-04-05T09:20:00.000Z",
    });
  });

  it("sends note saves through the atomic rpc with note version", async () => {
    const admin = createWorkoutSetRpcClient({
      ok: true,
      note_updated_at: "2026-04-02T09:25:00.000Z",
    });
    createSupabaseAdminClientMock.mockReturnValue(admin);

    const result = await saveWorkoutNoteOnServer({
      requester: { id: "athlete-1", role: "athlete" },
      scheduledWorkoutId: "workout-1",
      body: "Hyva treeni",
      expectedUpdatedAt: "2026-04-02T09:10:00.000Z",
    });

    expect(admin.rpc).toHaveBeenCalledWith("save_workout_note_entry", {
      p_scheduled_workout_id: "workout-1",
      p_requester_id: "athlete-1",
      p_requester_role: "athlete",
      p_body: "Hyva treeni",
      p_expected_note_updated_at: "2026-04-02T09:10:00.000Z",
    });
    expect(result).toEqual({ ok: true, updatedAt: "2026-04-02T09:25:00.000Z" });
  });

  it("sends complete workout through the atomic rpc with expected session version", async () => {
    const admin = createWorkoutSetRpcClient({
      ok: true,
      updated_at: "2026-04-02T09:30:00.000Z",
      completed_at: "2026-04-02T09:30:00.000Z",
    });
    createSupabaseAdminClientMock.mockReturnValue(admin);

    const result = await completeWorkoutOnServer({
      requester: { id: "athlete-1", role: "athlete" },
      scheduledWorkoutId: "workout-1",
      expectedUpdatedAt: "2026-04-02T09:20:00.000Z",
    });

    expect(admin.rpc).toHaveBeenCalledWith("complete_workout_atomic", {
      p_scheduled_workout_id: "workout-1",
      p_requester_id: "athlete-1",
      p_requester_role: "athlete",
      p_expected_session_updated_at: "2026-04-02T09:20:00.000Z",
    });
    expect(result).toEqual({
      ok: true,
      updatedAt: "2026-04-02T09:30:00.000Z",
      completedAt: "2026-04-02T09:30:00.000Z",
    });
  });
});
