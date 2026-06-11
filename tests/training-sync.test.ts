// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { loadVisibleSupabaseAppState } from "@/lib/server/training-sync";

type QueryState = {
  table: string;
  selectClause?: string;
  eqFilters: Array<{ column: string; value: unknown }>;
  inFilters: Array<{ column: string; values: unknown[] }>;
  isMaybeSingle: boolean;
};

function createSupabaseMock(options?: { omitFirstExerciseFromPlan?: boolean }) {
  const inCalls: Array<{ table: string; column: string; values: unknown[] }> = [];

  const resolveResult = (state: QueryState) => {
    if (state.table === "profiles" && state.isMaybeSingle) {
      return {
        data: {
          id: "athlete-1",
          role: "athlete",
        },
        error: null,
      };
    }

    if (state.table === "profiles") {
      return {
        data: [
          {
            id: "athlete-1",
            role: "athlete",
            status: "active",
            full_name: "Athlete One",
            email: "athlete@example.com",
            default_dashboard_view: "athlete-log",
            email_notifications: true,
            weekly_measurement_reminders: false,
            theme_mode: "light",
            load_increment_kg: 2.5,
            height_cm: null,
            weight_kg: null,
            waist_cm: null,
            created_at: "2026-03-01T08:00:00.000Z",
            updated_at: "2026-03-01T08:00:00.000Z",
          },
        ],
        error: null,
      };
    }

    if (state.table === "body_measurements") {
      return { data: [], error: null };
    }

    if (
      state.table === "nutrition_profiles" ||
      state.table === "ingredient_catalog" ||
      state.table === "recipes" ||
      state.table === "recipe_ingredients" ||
      state.table === "meal_plan_templates" ||
      state.table === "meal_plan_template_items" ||
      state.table === "assigned_meal_plans" ||
      state.table === "assigned_meal_plan_items"
    ) {
      return { data: [], error: null };
    }

    if (state.table === "coach_athlete_assignments") {
      return { data: [], error: null };
    }

    if (state.table === "exercises") {
      return { data: [], error: null };
    }

    if (state.table === "training_plans") {
      return {
        data: [
          {
            id: "plan-1",
            coach_id: "coach-1",
            athlete_id: "athlete-1",
            title: "Voimaohjelma",
            description: null,
            status: "active",
            start_date: "2026-03-01",
            week_count: 4,
            workouts: [
              {
                id: "day-1",
                name: "Penkki",
                splitType: "upper",
                defaultRestSeconds: 180,
                exercises: [
                  ...(options?.omitFirstExerciseFromPlan
                    ? []
                    : [
                        {
                          id: "exercise-template-1",
                          exerciseId: "exercise-1",
                          exerciseName: "Bench Press",
                          instruction: "",
                          sets: [{ id: "set-1", label: "1", targetReps: 5 }],
                        },
                      ]),
                  {
                    id: "exercise-template-2",
                    exerciseId: "exercise-2",
                    exerciseName: "Row",
                    instruction: "",
                    sets: [{ id: "set-1", label: "1", targetReps: 8 }],
                  },
                ],
              },
            ],
            created_at: "2026-03-01T08:00:00.000Z",
            updated_at: "2026-03-01T08:00:00.000Z",
          },
        ],
        error: null,
      };
    }

    if (state.table === "scheduled_workouts") {
      return {
        data: [
          {
            id: "workout-1",
            training_plan_id: "plan-1",
            program_workout_id: "day-1",
            athlete_id: "athlete-1",
            coach_id: "coach-1",
            title: "Penkki",
            scheduled_date: "2026-03-30T08:00:00.000Z",
            status: "completed",
            completed_at: "2026-03-30T09:00:00.000Z",
            created_at: "2026-03-29T08:00:00.000Z",
            updated_at: "2026-03-30T09:00:00.000Z",
          },
        ],
        error: null,
      };
    }

    if (state.table === "workout_sessions") {
      return {
        data: [
          {
            id: "session-target",
            scheduled_workout_id: "workout-1",
            athlete_id: "athlete-1",
            energy_level: null,
            started_at: "2026-03-30T08:00:00.000Z",
            completed_at: "2026-03-30T09:00:00.000Z",
            paused_at: null,
            paused_duration_seconds: 0,
            updated_at: "2026-03-30T09:00:00.000Z",
          },
        ],
        error: null,
      };
    }

    if (state.table === "workout_set_logs") {
      return {
        data: [
          {
            id: "log-second",
            session_id: "session-target",
            scheduled_workout_id: "workout-1",
            template_exercise_id: "exercise-template-2",
            set_id: "set-1",
            exercise_id: "exercise-2",
            exercise_name: "Row",
            muscle_group: "back",
            superset_group: null,
            set_label: "1",
            target_reps: 8,
            target_reps_min: null,
            target_reps_max: null,
            target_load: 60,
            target_rest_seconds: 180,
            program_workout_id: "day-1",
            actual_reps: 8,
            actual_load: 60,
            done: true,
          },
          {
            id: "log-target",
            session_id: "session-target",
            scheduled_workout_id: "workout-1",
            template_exercise_id: "exercise-template-1",
            set_id: "set-1",
            exercise_id: "exercise-1",
            exercise_name: "Bench Press",
            muscle_group: "chest",
            superset_group: null,
            set_label: "1",
            target_reps: 5,
            target_reps_min: null,
            target_reps_max: null,
            target_load: 100,
            target_rest_seconds: 180,
            program_workout_id: "day-1",
            actual_reps: 5,
            actual_load: 100,
            done: true,
          },
        ],
        error: null,
      };
    }

    if (state.table === "workout_notes") {
      return { data: [], error: null };
    }

    if (state.table === "conversation_entries") {
      return { data: [], error: null };
    }

    if (state.table === "extra_activities") {
      return { data: [], error: null };
    }

    throw new Error(`Unhandled table in test mock: ${state.table}`);
  };

  const from = (table: string) => {
    const state: QueryState = {
      table,
      eqFilters: [],
      inFilters: [],
      isMaybeSingle: false,
    };

    const builder = {
      select(selectClause: string) {
        state.selectClause = selectClause;
        return builder;
      },
      eq(column: string, value: unknown) {
        state.eqFilters.push({ column, value });
        return builder;
      },
      in(column: string, values: unknown[]) {
        state.inFilters.push({ column, values });
        inCalls.push({ table, column, values });
        return builder;
      },
      limit() {
        return builder;
      },
      order() {
        return builder;
      },
      range() {
        return builder;
      },
      maybeSingle() {
        state.isMaybeSingle = true;
        return Promise.resolve(resolveResult(state));
      },
      then(resolve: (value: unknown) => void, reject?: (reason: unknown) => void) {
        return Promise.resolve(resolveResult(state)).then(resolve, reject);
      },
    };

    return builder;
  };

  return {
    inCalls,
    client: {
      auth: {
        getUser: async () => ({
          data: {
            user: {
              id: "athlete-1",
            },
          },
        }),
      },
      from,
    },
  };
}

describe("loadVisibleSupabaseAppState", () => {
  it("fetches set logs for the visible session ids instead of relying on a global log cap", async () => {
    const supabase = createSupabaseMock();

    const snapshot = await loadVisibleSupabaseAppState(supabase.client as never);

    expect(
      supabase.inCalls.some(
        (call) =>
          call.table === "workout_set_logs" &&
          call.column === "session_id" &&
          call.values.length === 1 &&
          call.values[0] === "session-target",
      ),
    ).toBe(true);
    expect(snapshot.sessions ?? []).toHaveLength(1);
    expect(snapshot.sessions?.[0]?.id).toBe("session-target");
    expect(snapshot.sessions?.[0]?.setLogs ?? []).toHaveLength(2);
    expect(snapshot.sessions?.[0]?.setLogs[0]).toMatchObject({
      id: "log-target",
      actualReps: 5,
      actualLoad: 100,
      done: true,
    });
    expect(snapshot.sessions?.[0]?.setLogs[1]).toMatchObject({
      id: "log-second",
    });
  });

  it("keeps persisted set log order when the current program no longer matches the workout snapshot", async () => {
    const supabase = createSupabaseMock({ omitFirstExerciseFromPlan: true });

    const snapshot = await loadVisibleSupabaseAppState(supabase.client as never);

    expect(snapshot.sessions?.[0]?.setLogs.map((log) => log.id)).toEqual(["log-second", "log-target"]);
  });
});
