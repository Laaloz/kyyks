import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { calculateRecipeNutrition } from "@/lib/nutrition";
import { isAthleteRole } from "@/lib/role-access";
import {
  PROGRAMS_DASHBOARD_VIEW,
  type AppState,
  type AssignedMealPlan,
  type BodyMeasurement,
  type CoachAthleteAssignment,
  type ConversationEntry,
  type Exercise,
  type ExtraActivity,
  type DayMealPlanEntry,
  type Ingredient,
  type MealPlanTemplate,
  type NutritionProfile,
  type Recipe,
  type ScheduledWorkout,
  type TrainingPlan,
  type UserProfile,
  type WorkoutNote,
  type WorkoutSession,
} from "@/lib/types";

type ServerClient = SupabaseClient<any, "public", any>;

function logSyncPhase(phase: string, startedAt: number) {
  const durationMs = Number((performance.now() - startedAt).toFixed(1));
  console.info(`[timing:app-state] ${phase}`, { durationMs });
}

function compareWorkoutSetLabels(left: string, right: string) {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber !== rightNumber) {
    return leftNumber - rightNumber;
  }

  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

function buildProgramExerciseOrder(
  plans: TrainingPlan[],
  workout: ScheduledWorkout | undefined,
) {
  if (!workout?.trainingPlanId || !workout.programWorkoutId) {
    return new Map<string, number>();
  }

  const plan = plans.find((item) => item.id === workout.trainingPlanId);
  const programWorkout = plan?.workouts?.find((item) => item.id === workout.programWorkoutId);
  if (!programWorkout) {
    return new Map<string, number>();
  }

  return new Map(programWorkout.exercises.map((exercise, index) => [exercise.id, index] as const));
}

type ProfileRow = {
  id: string;
  role: UserProfile["role"];
  status: UserProfile["status"];
  full_name: string;
  profile_image_url: string | null;
  email: string;
  default_dashboard_view: UserProfile["settings"] extends infer _ ? string | null : string | null;
  email_notifications: boolean;
  weekly_measurement_reminders: boolean;
  theme_mode: "light" | "dark" | "mallu" | "camel";
  load_increment_kg: 1 | 2.5 | 5 | null;
  age?: number | string | null;
  sex?: "female" | "male" | "other" | null;
  height_cm: number | string | null;
  weight_kg: number | string | null;
  waist_cm: number | string | null;
  created_at: string;
  updated_at: string;
};

type BodyMeasurementRow = {
  id: string;
  user_id: string;
  height_cm: number | string | null;
  weight_kg: number | string | null;
  waist_cm: number | string | null;
  measured_at: string;
  created_at: string;
};

type AssignmentRow = {
  id: string;
  coach_id: string;
  athlete_id: string;
  active: boolean;
  created_at: string;
};

type ExerciseRow = {
  id: string;
  external_key: string | null;
  name: string;
  category: string;
  equipment: string;
  cue: string;
  scope: Exercise["scope"];
  coach_id: string | null;
};

type TrainingPlanRow = {
  id: string;
  coach_id: string;
  athlete_id: string;
  program_group_id: string | null;
  title: string;
  description: string | null;
  status: TrainingPlan["status"];
  start_date: string;
  week_count: number;
  workouts: TrainingPlan["workouts"];
  created_at: string;
  updated_at: string;
};

type ScheduledWorkoutRow = {
  id: string;
  training_plan_id: string | null;
  program_workout_id: string | null;
  athlete_id: string;
  coach_id: string;
  title: string;
  scheduled_date: string;
  status: ScheduledWorkout["status"];
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type WorkoutSessionRow = {
  id: string;
  scheduled_workout_id: string;
  athlete_id: string;
  energy_level: number | null;
  started_at: string;
  completed_at: string | null;
  paused_at: string | null;
  paused_duration_seconds: number | null;
  updated_at: string;
};

type WorkoutSetLogRow = {
  id: string;
  session_id: string;
  scheduled_workout_id: string;
  template_exercise_id: string;
  set_id: string;
  exercise_id: string;
  exercise_name: string;
  muscle_group: string | null;
  superset_group: string | null;
  set_label: string;
  target_reps: number;
  target_reps_min: number | null;
  target_reps_max: number | null;
  target_load: number | string | null;
  target_rest_seconds: number | null;
  program_workout_id: string | null;
  actual_reps: number | null;
  actual_load: number | string | null;
  done: boolean;
};

type WorkoutNoteRow = {
  id: string;
  session_id: string;
  athlete_id: string;
  coach_id: string;
  body: string;
  created_at: string;
  updated_at: string;
};

type ExtraActivityRow = {
  id: string;
  athlete_id: string;
  activity_type: ExtraActivity["activityType"];
  duration_minutes: number;
  estimated_kcal: number;
  occurred_at: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type DayMealPlanRow = {
  id: string;
  athlete_id: string;
  plan_date: string;
  meal_tag: DayMealPlanEntry["mealTag"];
  recipe_id: string | null;
  source: DayMealPlanEntry["source"];
  servings: number;
  eaten_at: string | null;
  position: number;
  ingredient_id: string | null;
  grams: number | string | null;
  food_name: string | null;
  kcal_per_100: number | string | null;
  protein_per_100: number | string | null;
  carbs_per_100: number | string | null;
  fat_per_100: number | string | null;
  food_source: DayMealPlanEntry["foodSource"] | null;
  ai_status: DayMealPlanEntry["aiStatus"] | null;
  created_at: string;
  updated_at: string;
};

type ConversationEntryRow = {
  id: string;
  athlete_id: string;
  coach_id: string;
  author_user_id: string;
  author_role: ConversationEntry["authorRole"];
  type: ConversationEntry["type"];
  body: string;
  context_type: ConversationEntry["contextType"];
  context_id: string | null;
  context_label: string | null;
  read_by_user_ids: string[] | null;
  created_at: string;
};

type NutritionProfileRow = {
  id: string;
  user_id: string;
  goal: NutritionProfile["goal"];
  activity_level: NutritionProfile["activityLevel"];
  meals_per_day: number;
  target_kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  calculation_mode: NutritionProfile["calculationMode"];
  coach_notes: string | null;
  dietary_flags: string[] | null;
  allergies: string[] | null;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
};

export type IngredientRow = {
  id: string;
  name: string;
  display_name: string | null;
  source: Ingredient["source"];
  source_external_id: string | null;
  owner_role: Ingredient["ownerRole"];
  owner_user_id: string | null;
  created_by: string;
  default_purchase_unit: Ingredient["defaultPurchaseUnit"] | null;
  grams_per_unit: number | string | null;
  kcal_per_100: number | string;
  protein_per_100: number | string;
  carbs_per_100: number | string;
  fat_per_100: number | string;
  created_at: string;
  updated_at: string;
};

type RecipeIngredientRow = {
  id: string;
  recipe_id: string;
  ingredient_id: string | null;
  ingredient_name: string;
  group_label: string | null;
  alternatives: string[] | null;
  alternative_options: Recipe["ingredients"][number]["alternativeOptions"] | null;
  quantity: number | string | null;
  unit: Recipe["ingredients"][number]["unit"];
  display_quantity: string | null;
  display_unit: string | null;
  normalized_quantity: number | string | null;
  ingredient_role: Recipe["ingredients"][number]["ingredientRole"];
  scaling_mode: Recipe["ingredients"][number]["scalingMode"];
  sort_order: number;
};

type RecipeRow = {
  id: string;
  name: string;
  description: string | null;
  instructions: string;
  meal_tag: Recipe["mealTag"];
  dietary_flags: string[] | null;
  allergies: string[] | null;
  owner_role: Recipe["ownerRole"];
  created_by: string;
  default_servings: number;
  min_servings: number;
  max_servings: number;
  created_at: string;
  updated_at: string;
};

type MealPlanTemplateItemRow = {
  id: string;
  template_id: string;
  meal_tag: MealPlanTemplate["items"][number]["mealTag"];
  recipe_id: string;
  sort_order: number;
};

type MealPlanTemplateRow = {
  id: string;
  name: string;
  description: string | null;
  owner_role: MealPlanTemplate["ownerRole"];
  created_by: string;
  created_at: string;
  updated_at: string;
};

type AssignedMealPlanItemRow = {
  id: string;
  assigned_plan_id: string;
  meal_tag: AssignedMealPlan["items"][number]["mealTag"];
  recipe_id: string;
  sort_order: number;
};

type AssignedMealPlanRow = {
  id: string;
  athlete_id: string;
  template_id: string;
  assigned_by: string;
  name: string;
  active: boolean;
  assigned_at: string;
  updated_at: string;
};

export const INGREDIENT_SELECT_COLUMNS =
  "id, name, display_name, source, source_external_id, owner_role, owner_user_id, created_by, default_purchase_unit, grams_per_unit, kcal_per_100, protein_per_100, carbs_per_100, fat_per_100, created_at, updated_at";

// Kevennetty katalogilataus: vain ei-Fineli-ainekset + käyttäjän omat tuotteet + reseptien
// viittaamat ainekset (makroja varten). Koko Fineli (tuhansia rivejä) jätetään pois selaimen
// muistista — se haetaan tarvittaessa (reseptieditori/admin). Korjaa mobiilin muistinpaineen.
export async function fetchReducedIngredientRows(
  supabase: ServerClient,
  userId: string | null,
): Promise<IngredientRow[]> {
  const { data: refData } = await supabase
    .from("recipe_ingredients")
    .select("ingredient_id")
    .not("ingredient_id", "is", null);
  const referencedIds = Array.from(
    new Set(
      ((refData ?? []) as Array<{ ingredient_id: string | null }>)
        .map((row) => row.ingredient_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  const orFilter = userId ? `source.neq.fineli,owner_user_id.eq.${userId}` : "source.neq.fineli";
  const baseQuery = await supabase
    .from("ingredient_catalog")
    .select(INGREDIENT_SELECT_COLUMNS)
    .or(orFilter)
    .order("name", { ascending: true });
  if (baseQuery.error) {
    throw new Error(baseQuery.error.message || "Ingredients haku epäonnistui.");
  }

  const byId = new Map<string, IngredientRow>();
  for (const row of (baseQuery.data ?? []) as IngredientRow[]) {
    byId.set(row.id, row);
  }

  // Lisää reseptien viittaamat ainekset jotka eivät jo ole mukana (esim. mahdollinen Fineli-
  // aines reseptissä) — muuten kyseisen reseptin makrot menisivät väärin.
  const missingRefs = referencedIds.filter((id) => !byId.has(id));
  const chunkSize = 200;
  for (let index = 0; index < missingRefs.length; index += chunkSize) {
    const chunk = missingRefs.slice(index, index + chunkSize);
    const { data: refRows, error: refError } = await supabase
      .from("ingredient_catalog")
      .select(INGREDIENT_SELECT_COLUMNS)
      .in("id", chunk);
    if (refError) {
      throw new Error(refError.message || "Ingredients haku epäonnistui.");
    }
    for (const row of (refRows ?? []) as IngredientRow[]) {
      byId.set(row.id, row);
    }
  }

  return Array.from(byId.values());
}

export async function fetchAllIngredientRows(supabase: ServerClient) {
  const pageSize = 1000;
  const selectColumns = INGREDIENT_SELECT_COLUMNS;

  // The catalog can hold thousands of rows; fetching pages sequentially adds a
  // round trip per 1000 rows to every full sync. Get the count with the first
  // page, then pull the remaining pages in parallel.
  const firstPage = await supabase
    .from("ingredient_catalog")
    .select(selectColumns, { count: "exact" })
    .order("name", { ascending: true })
    .range(0, pageSize - 1);

  if (firstPage.error) {
    throw new Error(firstPage.error.message || "Ingredients haku epäonnistui.");
  }

  const allRows: IngredientRow[] = [...((firstPage.data ?? []) as IngredientRow[])];
  const totalCount = firstPage.count ?? allRows.length;

  if (totalCount > pageSize) {
    const remainingPageStarts: number[] = [];
    for (let from = pageSize; from < totalCount; from += pageSize) {
      remainingPageStarts.push(from);
    }

    const remainingPages = await Promise.all(
      remainingPageStarts.map((from) =>
        supabase
          .from("ingredient_catalog")
          .select(selectColumns)
          .order("name", { ascending: true })
          .range(from, from + pageSize - 1),
      ),
    );

    for (const page of remainingPages) {
      if (page.error) {
        throw new Error(page.error.message || "Ingredients haku epäonnistui.");
      }
      allRows.push(...((page.data ?? []) as IngredientRow[]));
    }
  }

  return allRows;
}

export type SupabaseVisibleAppStateSnapshot = Partial<Pick<
  AppState,
  | "users"
  | "bodyMeasurements"
  | "nutritionProfiles"
  | "ingredientsCatalog"
  | "recipes"
  | "mealPlanTemplates"
  | "assignedMealPlans"
  | "assignments"
  | "exercises"
  | "templates"
  | "plans"
  | "scheduledWorkouts"
  | "sessions"
  | "notes"
  | "extraActivities"
  | "dayMealPlans"
  | "conversationEntries"
>> & { mode?: "full" | "workouts" };

function toNumberOrUndefined(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  const nextValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(nextValue) ? nextValue : undefined;
}

function mapProfileRow(profile: ProfileRow): UserProfile {
  return {
    id: profile.id,
    role: profile.role,
    fullName: profile.full_name,
    profileImageUrl: profile.profile_image_url ?? undefined,
    email: profile.email,
    status: profile.status,
    age: toNumberOrUndefined(profile.age),
    sex: profile.sex ?? undefined,
    heightCm: toNumberOrUndefined(profile.height_cm),
    weightKg: toNumberOrUndefined(profile.weight_kg),
    waistCm: toNumberOrUndefined(profile.waist_cm),
    settings: {
      defaultDashboardView:
        profile.default_dashboard_view === "overview" ||
        profile.default_dashboard_view === "nutrition" ||
        profile.default_dashboard_view === "athletes" ||
        profile.default_dashboard_view === PROGRAMS_DASHBOARD_VIEW ||
        profile.default_dashboard_view === "invites" ||
        profile.default_dashboard_view === "athlete-log" ||
        profile.default_dashboard_view === "conversation"
          ? profile.default_dashboard_view
          : isAthleteRole(profile.role)
            ? "athlete-log"
            : "overview",
      emailNotifications: profile.email_notifications,
      weeklyMeasurementReminders: profile.weekly_measurement_reminders,
      themeMode: profile.theme_mode,
      loadIncrementKg: profile.load_increment_kg ?? 2.5,
    },
    createdAt: profile.created_at,
    updatedAt: profile.updated_at,
  };
}

function mapBodyMeasurementRow(entry: BodyMeasurementRow): BodyMeasurement {
  return {
    id: entry.id,
    userId: entry.user_id,
    heightCm: toNumberOrUndefined(entry.height_cm),
    weightKg: toNumberOrUndefined(entry.weight_kg),
    waistCm: toNumberOrUndefined(entry.waist_cm),
    measuredAt: entry.measured_at,
    createdAt: entry.created_at,
  };
}

function mapNutritionProfileRow(entry: NutritionProfileRow): NutritionProfile {
  return {
    id: entry.id,
    userId: entry.user_id,
    goal: entry.goal,
    activityLevel: entry.activity_level,
    mealsPerDay: entry.meals_per_day,
    targetKcal: entry.target_kcal,
    proteinG: entry.protein_g,
    carbsG: entry.carbs_g,
    fatG: entry.fat_g,
    calculationMode: entry.calculation_mode,
    coachNotes: entry.coach_notes ?? undefined,
    dietaryFlags: entry.dietary_flags ?? [],
    allergies: entry.allergies ?? [],
    createdBy: entry.created_by,
    updatedBy: entry.updated_by,
    createdAt: entry.created_at,
    updatedAt: entry.updated_at,
  };
}

export function mapIngredientRow(entry: IngredientRow): Ingredient {
  return {
    id: entry.id,
    name: entry.name,
    displayName: entry.display_name ?? undefined,
    source: entry.source,
    sourceExternalId: entry.source_external_id ?? undefined,
    ownerRole: entry.owner_role,
    ownerUserId: entry.owner_user_id,
    createdBy: entry.created_by,
    defaultPurchaseUnit: entry.default_purchase_unit ?? undefined,
    gramsPerUnit: toNumberOrUndefined(entry.grams_per_unit),
    kcalPer100: toNumberOrUndefined(entry.kcal_per_100) ?? 0,
    proteinPer100: toNumberOrUndefined(entry.protein_per_100) ?? 0,
    carbsPer100: toNumberOrUndefined(entry.carbs_per_100) ?? 0,
    fatPer100: toNumberOrUndefined(entry.fat_per_100) ?? 0,
    createdAt: entry.created_at,
    updatedAt: entry.updated_at,
  };
}

function mapAssignmentRow(entry: AssignmentRow): CoachAthleteAssignment {
  return {
    id: entry.id,
    coachId: entry.coach_id,
    athleteId: entry.athlete_id,
    active: entry.active,
    createdAt: entry.created_at,
  };
}

function mapExerciseRow(entry: ExerciseRow): Exercise {
  return {
    id: entry.external_key ?? entry.id,
    name: entry.name,
    category: entry.category,
    equipment: entry.equipment,
    cue: entry.cue,
    scope: entry.scope,
    coachId: entry.coach_id ?? undefined,
  };
}

function mapPlanRow(entry: TrainingPlanRow): TrainingPlan {
  return {
    id: entry.id,
    coachId: entry.coach_id,
    athleteId: entry.athlete_id,
    programGroupId: entry.program_group_id ?? undefined,
    title: entry.title,
    description: entry.description ?? undefined,
    status: entry.status ?? "active",
    workouts: Array.isArray(entry.workouts) ? entry.workouts : [],
    startDate: new Date(`${entry.start_date}T08:00:00`).toISOString(),
    weekCount: entry.week_count,
    createdAt: entry.created_at,
    updatedAt: entry.updated_at,
  };
}

function mapScheduledWorkoutRow(entry: ScheduledWorkoutRow): ScheduledWorkout {
  return {
    id: entry.id,
    trainingPlanId: entry.training_plan_id ?? undefined,
    programWorkoutId: entry.program_workout_id ?? undefined,
    athleteId: entry.athlete_id,
    coachId: entry.coach_id,
    title: entry.title,
    scheduledDate: entry.scheduled_date,
    status: entry.status,
    completedAt: entry.completed_at ?? undefined,
    createdAt: entry.created_at,
    updatedAt: entry.updated_at,
  };
}

function mapWorkoutNoteRow(entry: WorkoutNoteRow): WorkoutNote {
  return {
    id: entry.id,
    sessionId: entry.session_id,
    athleteId: entry.athlete_id,
    coachId: entry.coach_id,
    body: entry.body,
    createdAt: entry.created_at,
    updatedAt: entry.updated_at,
  };
}

function mapExtraActivityRow(entry: ExtraActivityRow): ExtraActivity {
  return {
    id: entry.id,
    athleteId: entry.athlete_id,
    activityType: entry.activity_type,
    durationMinutes: entry.duration_minutes,
    estimatedKcal: entry.estimated_kcal,
    occurredAt: entry.occurred_at,
    notes: entry.notes ?? undefined,
    createdAt: entry.created_at,
    updatedAt: entry.updated_at,
  };
}

export type { DayMealPlanRow };

export function mapDayMealPlanRow(entry: DayMealPlanRow): DayMealPlanEntry {
  return {
    id: entry.id,
    athleteId: entry.athlete_id,
    planDate: entry.plan_date,
    mealTag: entry.meal_tag,
    recipeId: entry.recipe_id,
    source: entry.source,
    servings: Number(entry.servings),
    eatenAt: entry.eaten_at,
    position: entry.position,
    ingredientId: entry.ingredient_id,
    grams: toNumberOrUndefined(entry.grams) ?? null,
    foodName: entry.food_name,
    kcalPer100: toNumberOrUndefined(entry.kcal_per_100) ?? null,
    proteinPer100: toNumberOrUndefined(entry.protein_per_100) ?? null,
    carbsPer100: toNumberOrUndefined(entry.carbs_per_100) ?? null,
    fatPer100: toNumberOrUndefined(entry.fat_per_100) ?? null,
    foodSource: entry.food_source,
    aiStatus: entry.ai_status,
    createdAt: entry.created_at,
    updatedAt: entry.updated_at,
  };
}

// Heittää vain kriittisille (critical=true) hauille — käytännössä Profiles (identiteetti).
// Muut domain-haut vain varoittavat ja jäävät tyhjäksi (mapperit käyttävät `?? []`), jottei
// yksi rikkinäinen haku (puuttuva sarake, RLS, hetkellinen virhe) kaada koko app-state-latausta.
function throwIfQueryFailed(
  label: string,
  result: {
    error: { message?: string | null } | null;
  },
  critical = false,
) {
  if (!result.error) {
    return;
  }
  const message = `${label} sync failed: ${result.error.message ?? "Unknown Supabase error."}`;
  if (critical) {
    throw new Error(message);
  }
  console.warn(`[app-state-sync] ${message} — osa jätetään tyhjäksi, muu tila ladataan silti.`);
}

export async function loadVisibleSupabaseAppState(
  supabase: ServerClient,
  options?: { lite?: boolean; mode?: "full" | "workouts" },
): Promise<SupabaseVisibleAppStateSnapshot> {
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  const profileStartedAt = performance.now();
  const { data: currentProfile } = authUser
    ? await supabase
        .from("profiles")
        .select("id, role")
        .eq("id", authUser.id)
        .maybeSingle<{ id: string; role: UserProfile["role"] }>()
    : { data: null };
  logSyncPhase("current-profile", profileStartedAt);

  const isAdminViewer = currentProfile?.role === "admin";
  const lite = Boolean(options?.lite);
  const mode = options?.mode ?? "full";
  const queryStartedAt = performance.now();
  const ingredientsPromise =
    mode === "full"
      ? fetchReducedIngredientRows(supabase, authUser?.id ?? null).then((data) => ({ data, error: null }))
      : Promise.resolve({ data: [] as IngredientRow[], error: null });

  const [
    profilesResult,
    bodyMeasurementsResult,
    nutritionProfilesResult,
    ingredientsResult,
    recipesResult,
    recipeIngredientsResult,
    mealPlanTemplatesResult,
    mealPlanTemplateItemsResult,
    assignedMealPlansResult,
    assignedMealPlanItemsResult,
    assignmentsResult,
    exercisesResult,
    plansResult,
    scheduledWorkoutsResult,
    sessionsResult,
    notesResult,
    extraActivitiesResult,
    dayMealPlansResult,
    conversationEntriesResult,
  ] = await Promise.all([
    mode === "full" || mode === "workouts"
      ? supabase
          .from("profiles")
          .select(
            "id, role, status, full_name, profile_image_url, email, default_dashboard_view, email_notifications, weekly_measurement_reminders, theme_mode, load_increment_kg, age, sex, height_cm, weight_kg, waist_cm, created_at, updated_at",
          )
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as ProfileRow[], error: null }),
    mode === "full"
      ? supabase
          .from("body_measurements")
          .select("id, user_id, height_cm, weight_kg, waist_cm, measured_at, created_at")
          .limit(lite ? 60 : isAdminViewer ? 500 : 200)
          .order("measured_at", { ascending: false })
      : Promise.resolve({ data: [] as BodyMeasurementRow[], error: null }),
    mode === "full"
      ? supabase
          .from("nutrition_profiles")
          .select("id, user_id, goal, activity_level, meals_per_day, target_kcal, protein_g, carbs_g, fat_g, calculation_mode, coach_notes, dietary_flags, allergies, created_by, updated_by, created_at, updated_at")
          .order("updated_at", { ascending: false })
      : Promise.resolve({ data: [] as NutritionProfileRow[], error: null }),
    ingredientsPromise,
    mode === "full"
      ? supabase
          .from("recipes")
          .select("id, name, description, instructions, meal_tag, dietary_flags, allergies, owner_role, created_by, default_servings, min_servings, max_servings, created_at, updated_at")
          .order("updated_at", { ascending: false })
      : Promise.resolve({ data: [] as RecipeRow[], error: null }),
    mode === "full"
      ? supabase
          .from("recipe_ingredients")
          .select("id, recipe_id, ingredient_id, ingredient_name, group_label, alternatives, alternative_options, quantity, unit, display_quantity, display_unit, normalized_quantity, ingredient_role, scaling_mode, sort_order")
          .order("recipe_id", { ascending: true })
          .order("sort_order", { ascending: true })
      : Promise.resolve({ data: [] as RecipeIngredientRow[], error: null }),
    mode === "full"
      ? supabase
          .from("meal_plan_templates")
          .select("id, name, description, owner_role, created_by, created_at, updated_at")
          .order("updated_at", { ascending: false })
      : Promise.resolve({ data: [] as MealPlanTemplateRow[], error: null }),
    mode === "full"
      ? supabase
          .from("meal_plan_template_items")
          .select("id, template_id, meal_tag, recipe_id, sort_order")
          .order("template_id", { ascending: true })
          .order("sort_order", { ascending: true })
      : Promise.resolve({ data: [] as MealPlanTemplateItemRow[], error: null }),
    mode === "full"
      ? supabase
          .from("assigned_meal_plans")
          .select("id, athlete_id, template_id, assigned_by, name, active, assigned_at, updated_at")
          .order("assigned_at", { ascending: false })
      : Promise.resolve({ data: [] as AssignedMealPlanRow[], error: null }),
    mode === "full"
      ? supabase
          .from("assigned_meal_plan_items")
          .select("id, assigned_plan_id, meal_tag, recipe_id, sort_order")
          .order("assigned_plan_id", { ascending: true })
          .order("sort_order", { ascending: true })
      : Promise.resolve({ data: [] as AssignedMealPlanItemRow[], error: null }),
    mode === "full" || mode === "workouts"
      ? supabase
          .from("coach_athlete_assignments")
          .select("id, coach_id, athlete_id, active, created_at")
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as AssignmentRow[], error: null }),
    mode === "full" || mode === "workouts"
      ? supabase
          .from("exercises")
          .select("id, external_key, name, category, equipment, cue, scope, coach_id")
          .order("name", { ascending: true })
      : Promise.resolve({ data: [] as ExerciseRow[], error: null }),
    mode === "full" || mode === "workouts"
      ? supabase
          .from("training_plans")
          .select("id, coach_id, athlete_id, program_group_id, title, description, status, start_date, week_count, workouts, created_at, updated_at")
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as TrainingPlanRow[], error: null }),
    supabase
      .from("scheduled_workouts")
      .select("id, training_plan_id, program_workout_id, athlete_id, coach_id, title, scheduled_date, status, completed_at, created_at, updated_at")
      .limit(lite ? 80 : isAdminViewer ? 500 : 200)
      .order("scheduled_date", { ascending: false }),
    supabase
      .from("workout_sessions")
      .select("id, scheduled_workout_id, athlete_id, energy_level, started_at, completed_at, paused_at, paused_duration_seconds, updated_at")
      .limit(lite ? 80 : isAdminViewer ? 500 : 200)
      .order("started_at", { ascending: false }),
    supabase
      .from("workout_notes")
      .select("id, session_id, athlete_id, coach_id, body, created_at, updated_at")
      .limit(lite ? 40 : isAdminViewer ? 300 : 150)
      .order("updated_at", { ascending: false }),
    supabase
      .from("extra_activities")
      .select("id, athlete_id, activity_type, duration_minutes, estimated_kcal, occurred_at, notes, created_at, updated_at")
      .limit(lite ? 80 : isAdminViewer ? 500 : 250)
      .order("occurred_at", { ascending: false }),
    mode === "full"
      ? supabase
          .from("day_meal_plans")
          .select("id, athlete_id, plan_date, meal_tag, recipe_id, source, servings, eaten_at, position, ingredient_id, grams, food_name, kcal_per_100, protein_per_100, carbs_per_100, fat_per_100, food_source, ai_status, created_at, updated_at")
          .limit(lite ? 120 : isAdminViewer ? 1000 : 500)
          .order("plan_date", { ascending: false })
          .order("position", { ascending: true })
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] as DayMealPlanRow[], error: null }),
    mode === "full"
      ? supabase
          .from("conversation_entries")
          .select("id, athlete_id, coach_id, author_user_id, author_role, type, body, context_type, context_id, context_label, read_by_user_ids, created_at")
          .limit(lite ? 80 : isAdminViewer ? 1000 : 400)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as ConversationEntryRow[], error: null }),
  ]);
  logSyncPhase("all-queries", queryStartedAt);

  throwIfQueryFailed("Profiles", profilesResult, true);
  throwIfQueryFailed("Body measurements", bodyMeasurementsResult);
  throwIfQueryFailed("Nutrition profiles", nutritionProfilesResult);
  throwIfQueryFailed("Ingredients", ingredientsResult);
  throwIfQueryFailed("Recipes", recipesResult);
  throwIfQueryFailed("Recipe ingredients", recipeIngredientsResult);
  throwIfQueryFailed("Meal plan templates", mealPlanTemplatesResult);
  throwIfQueryFailed("Meal plan template items", mealPlanTemplateItemsResult);
  throwIfQueryFailed("Assigned meal plans", assignedMealPlansResult);
  throwIfQueryFailed("Assigned meal plan items", assignedMealPlanItemsResult);
  throwIfQueryFailed("Assignments", assignmentsResult);
  throwIfQueryFailed("Exercises", exercisesResult);
  throwIfQueryFailed("Training plans", plansResult);
  throwIfQueryFailed("Scheduled workouts", scheduledWorkoutsResult);
  throwIfQueryFailed("Workout sessions", sessionsResult);
  throwIfQueryFailed("Workout notes", notesResult);
  throwIfQueryFailed("Extra activities", extraActivitiesResult);
  throwIfQueryFailed("Day meal plans", dayMealPlansResult);
  throwIfQueryFailed("Conversation entries", conversationEntriesResult);

  const visibleSessionIds = ((sessionsResult.data ?? []) as WorkoutSessionRow[]).map((entry) => entry.id);
  const setLogsResult =
    visibleSessionIds.length > 0
      ? await supabase
          .from("workout_set_logs")
          .select("id, session_id, scheduled_workout_id, template_exercise_id, set_id, exercise_id, exercise_name, muscle_group, superset_group, set_label, target_reps, target_reps_min, target_reps_max, target_load, target_rest_seconds, program_workout_id, actual_reps, actual_load, done")
          .in("session_id", visibleSessionIds)
          .order("session_id", { ascending: true })
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
      : {
          data: [] as WorkoutSetLogRow[],
          error: null,
        };

  throwIfQueryFailed("Workout set logs", setLogsResult);

  const mappingStartedAt = performance.now();

  const users = (profilesResult.data ?? []).map((entry) => mapProfileRow(entry as ProfileRow));
  const bodyMeasurements = (bodyMeasurementsResult.data ?? []).map((entry) =>
    mapBodyMeasurementRow(entry as BodyMeasurementRow),
  );
  const nutritionProfiles = (nutritionProfilesResult.data ?? []).map((entry) =>
    mapNutritionProfileRow(entry as NutritionProfileRow),
  );
  const ingredientsCatalog = (ingredientsResult.data ?? []).map((entry) => mapIngredientRow(entry as IngredientRow));
  const recipeIngredientsByRecipeId = new Map<string, Recipe["ingredients"]>();
  ((recipeIngredientsResult.data ?? []) as RecipeIngredientRow[]).forEach((entry) => {
    const existing = recipeIngredientsByRecipeId.get(entry.recipe_id) ?? [];
    existing.push({
      id: entry.id,
      ingredientId: entry.ingredient_id ?? undefined,
      ingredientName: entry.ingredient_name,
      groupLabel: entry.group_label ?? undefined,
      alternatives: entry.alternatives ?? undefined,
      alternativeOptions: entry.alternative_options ?? undefined,
      quantity: toNumberOrUndefined(entry.quantity),
      unit: entry.unit,
      displayQuantity: entry.display_quantity ?? undefined,
      displayUnit: entry.display_unit ?? undefined,
      normalizedQuantity: toNumberOrUndefined(entry.normalized_quantity),
      ingredientRole: entry.ingredient_role,
      scalingMode: entry.scaling_mode,
    });
    recipeIngredientsByRecipeId.set(entry.recipe_id, existing);
  });
  const recipes = ((recipesResult.data ?? []) as RecipeRow[]).map((entry) => {
    const ingredients = recipeIngredientsByRecipeId.get(entry.id) ?? [];
    const recipeBase: Recipe = {
      id: entry.id,
      name: entry.name,
      description: entry.description ?? undefined,
      instructions: entry.instructions,
      mealTag: entry.meal_tag,
      dietaryFlags: entry.dietary_flags ?? [],
      allergies: entry.allergies ?? [],
      ownerRole: entry.owner_role,
      createdBy: entry.created_by,
      defaultServings: entry.default_servings,
      minServings: entry.min_servings,
      maxServings: entry.max_servings,
      ingredients,
      createdAt: entry.created_at,
      updatedAt: entry.updated_at,
    };
    const nutrition = calculateRecipeNutrition(recipeBase, ingredientsCatalog);

    return {
      ...recipeBase,
      nutritionPerRecipe: nutrition.nutritionPerRecipe,
      nutritionPerServing: nutrition.nutritionPerServing,
    };
  });
  const mealPlanTemplateItemsByTemplateId = new Map<string, MealPlanTemplate["items"]>();
  ((mealPlanTemplateItemsResult.data ?? []) as MealPlanTemplateItemRow[]).forEach((entry) => {
    const existing = mealPlanTemplateItemsByTemplateId.get(entry.template_id) ?? [];
    existing.push({
      id: entry.id,
      mealTag: entry.meal_tag,
      recipeId: entry.recipe_id,
      sortOrder: entry.sort_order,
    });
    mealPlanTemplateItemsByTemplateId.set(entry.template_id, existing);
  });
  const mealPlanTemplates = ((mealPlanTemplatesResult.data ?? []) as MealPlanTemplateRow[]).map((entry) => ({
    id: entry.id,
    name: entry.name,
    description: entry.description ?? undefined,
    ownerRole: entry.owner_role,
    createdBy: entry.created_by,
    items: mealPlanTemplateItemsByTemplateId.get(entry.id) ?? [],
    createdAt: entry.created_at,
    updatedAt: entry.updated_at,
  }));
  const assignedMealPlanItemsByPlanId = new Map<string, AssignedMealPlan["items"]>();
  ((assignedMealPlanItemsResult.data ?? []) as AssignedMealPlanItemRow[]).forEach((entry) => {
    const existing = assignedMealPlanItemsByPlanId.get(entry.assigned_plan_id) ?? [];
    existing.push({
      id: entry.id,
      mealTag: entry.meal_tag,
      recipeId: entry.recipe_id,
      sortOrder: entry.sort_order,
    });
    assignedMealPlanItemsByPlanId.set(entry.assigned_plan_id, existing);
  });
  const assignedMealPlans = ((assignedMealPlansResult.data ?? []) as AssignedMealPlanRow[]).map((entry) => ({
    id: entry.id,
    athleteId: entry.athlete_id,
    templateId: entry.template_id,
    assignedBy: entry.assigned_by,
    name: entry.name,
    items: assignedMealPlanItemsByPlanId.get(entry.id) ?? [],
    active: entry.active,
    assignedAt: entry.assigned_at,
    updatedAt: entry.updated_at,
  }));
  const assignments = (assignmentsResult.data ?? []).map((entry) =>
    mapAssignmentRow(entry as AssignmentRow),
  );
  const exercises = (exercisesResult.data ?? []).map((entry) => mapExerciseRow(entry as ExerciseRow));
  const templates: AppState["templates"] = [];
  const plans = ((plansResult.data ?? []) as TrainingPlanRow[]).map((entry) => mapPlanRow(entry));

  const scheduledWorkouts = ((scheduledWorkoutsResult.data ?? []) as ScheduledWorkoutRow[]).map((entry) =>
    mapScheduledWorkoutRow(entry),
  );

  const setLogsBySessionId = new Map<string, WorkoutSession["setLogs"]>();
  ((setLogsResult.data ?? []) as WorkoutSetLogRow[]).forEach((entry) => {
    const existing = setLogsBySessionId.get(entry.session_id) ?? [];
    existing.push({
      id: entry.id,
      scheduledWorkoutId: entry.scheduled_workout_id,
      templateExerciseId: entry.template_exercise_id,
      setId: entry.set_id,
      exerciseId: entry.exercise_id,
      exerciseName: entry.exercise_name,
      muscleGroup: (entry.muscle_group as WorkoutSession["setLogs"][number]["muscleGroup"]) ?? undefined,
      supersetGroup: entry.superset_group ?? undefined,
      setLabel: entry.set_label,
      targetReps: entry.target_reps,
      targetRepsMin: entry.target_reps_min ?? undefined,
      targetRepsMax: entry.target_reps_max ?? undefined,
      targetLoad: toNumberOrUndefined(entry.target_load),
      targetRestSeconds: entry.target_rest_seconds ?? undefined,
      programWorkoutId: entry.program_workout_id ?? undefined,
      actualReps: entry.actual_reps ?? undefined,
      actualLoad: toNumberOrUndefined(entry.actual_load),
      done: entry.done,
    });
    setLogsBySessionId.set(entry.session_id, existing);
  });

  const scheduledWorkoutsById = new Map(scheduledWorkouts.map((workout) => [workout.id, workout]));
  const sessions = ((sessionsResult.data ?? []) as WorkoutSessionRow[]).map((entry) => {
    const workout = scheduledWorkoutsById.get(entry.scheduled_workout_id);
    const exerciseOrder = buildProgramExerciseOrder(plans, workout);
    const rawSetLogs = setLogsBySessionId.get(entry.id) ?? [];
    const canUseProgramOrder =
      exerciseOrder.size > 0 && rawSetLogs.every((log) => exerciseOrder.has(log.templateExerciseId));
    const originalLogIndex = new Map(rawSetLogs.map((log, index) => [log.id, index] as const));
    const setLogs = [...rawSetLogs].sort((left, right) => {
      if (!canUseProgramOrder) {
        return (originalLogIndex.get(left.id) ?? 0) - (originalLogIndex.get(right.id) ?? 0);
      }

      const leftOrder = exerciseOrder.get(left.templateExerciseId) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = exerciseOrder.get(right.templateExerciseId) ?? Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }

      const byLabel = compareWorkoutSetLabels(left.setLabel, right.setLabel);
      if (byLabel !== 0) {
        return byLabel;
      }

      return left.id.localeCompare(right.id);
    });

    return {
      id: entry.id,
      scheduledWorkoutId: entry.scheduled_workout_id,
      athleteId: entry.athlete_id,
      energyLevel: entry.energy_level ?? undefined,
      startedAt: entry.started_at,
      completedAt: entry.completed_at ?? undefined,
      pausedAt: entry.paused_at ?? undefined,
      pausedDurationSeconds: entry.paused_duration_seconds ?? undefined,
      updatedAt: entry.updated_at,
      setLogs,
    };
  });

  const notes = ((notesResult.data ?? []) as WorkoutNoteRow[]).map((entry) => mapWorkoutNoteRow(entry));
  const extraActivities = ((extraActivitiesResult.data ?? []) as ExtraActivityRow[]).map((entry) =>
    mapExtraActivityRow(entry),
  );
  const dayMealPlans = ((dayMealPlansResult.data ?? []) as DayMealPlanRow[]).map((entry) =>
    mapDayMealPlanRow(entry),
  );
  const conversationEntries = ((conversationEntriesResult.data ?? []) as ConversationEntryRow[]).map((entry) => ({
    id: entry.id,
    athleteId: entry.athlete_id,
    coachId: entry.coach_id,
    authorUserId: entry.author_user_id,
    authorRole: entry.author_role,
    type: entry.type,
    body: entry.body,
    contextType: entry.context_type,
    contextId: entry.context_id ?? undefined,
    contextLabel: entry.context_label ?? undefined,
    readByUserIds: entry.read_by_user_ids ?? [],
    createdAt: entry.created_at,
  }));

  logSyncPhase("mapping", mappingStartedAt);

  return {
    mode,
    users,
    bodyMeasurements,
    nutritionProfiles,
    ingredientsCatalog,
    recipes,
    mealPlanTemplates,
    assignedMealPlans,
    assignments,
    exercises,
    templates,
    plans,
    scheduledWorkouts,
    sessions,
    notes,
    extraActivities,
    dayMealPlans,
    conversationEntries,
  };
}
