export type Role = "admin" | "coach" | "athlete" | "independent_athlete";
export type AthleteRole = Extract<Role, "athlete" | "independent_athlete">;
export type UserStatus = "active" | "invited";
export type TemplateStatus = "draft" | "published";
export type ProgramStatus = "active" | "archived" | "removed";
export type ScheduledWorkoutStatus = "in_progress" | "completed" | "cancelled";
export type ExtraActivityType =
  | "run"
  | "walk"
  | "cycle"
  | "indoor_cycle"
  | "treadmill"
  | "stair_climber"
  | "elliptical"
  | "mtb"
  | "downhill_ski"
  | "disc_golf"
  | "skate"
  | "paddle"
  | "swim"
  | "climb"
  | "hike"
  | "row"
  | "ski"
  | "yoga"
  | "hiit"
  | "combat"
  | "dance"
  | "mobility"
  | "other";
export type InviteStatus = "pending" | "accepted";
export type SplitType = "upper" | "lower" | "full_body" | "custom";
export type ExerciseScope = "global" | "coach_custom";
export type RepTargetMode = "exact" | "range";
export const PROGRAMS_DASHBOARD_VIEW = "templates";
// "templates" is kept as a compatibility persisted settings key.
// The current coach workspace uses it as the programs/program builder view.
export type DashboardHomeView =
  | "overview"
  | "nutrition"
  | "measurements"
  | typeof PROGRAMS_DASHBOARD_VIEW
  | "invites"
  | "athlete-log"
  | "conversation"
  | "athletes"
  | "users";
export type MuscleGroupKey = "shoulders" | "arms" | "chest" | "abs" | "back" | "legs" | "other";
export type ThemeMode = "light" | "dark" | "mallu" | "camel";
export type LoadIncrement = 1 | 2.5 | 5;
export type ProfileSex = "female" | "male" | "other";
export type NutritionGoal = "maintain" | "gain" | "lose";
export type NutritionActivityLevel = "low" | "moderate" | "high";
export type NutritionOwnerRole = "admin" | "coach";
export type IngredientSource = "fineli" | "open_food_facts" | "manual";
export type IngredientUnit = "g" | "ml" | "pcs";
export type IngredientRole = "main" | "spice" | "garnish";
export type IngredientScalingMode = "linear" | "gentle" | "fixed" | "text_only";
export type MealTag = "breakfast" | "lunch" | "snack" | "dinner" | "evening_snack";
export type PurchaseUnit = "g" | "kg" | "ml" | "l" | "pcs" | "pack";

export interface UserSettings {
  defaultDashboardView: DashboardHomeView;
  emailNotifications: boolean;
  weeklyMeasurementReminders: boolean;
  themeMode: ThemeMode;
  loadIncrementKg: LoadIncrement;
}

export interface UserProfile {
  id: string;
  role: Role;
  fullName: string;
  profileImageUrl?: string;
  email: string;
  status: UserStatus;
  demoPassword?: string;
  age?: number;
  sex?: ProfileSex;
  heightCm?: number;
  weightKg?: number;
  waistCm?: number;
  settings?: UserSettings;
  createdAt: string;
  updatedAt: string;
}

export interface BodyMeasurement {
  id: string;
  userId: string;
  heightCm?: number;
  weightKg?: number;
  waistCm?: number;
  measuredAt: string;
  createdAt: string;
}

export interface MacroTarget {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface NutritionProfile {
  id: string;
  userId: string;
  goal: NutritionGoal;
  activityLevel: NutritionActivityLevel;
  mealsPerDay: number;
  targetKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  calculationMode: "auto" | "manual_override";
  coachNotes?: string;
  dietaryFlags: string[];
  allergies: string[];
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Ingredient {
  id: string;
  name: string;
  displayName?: string;
  source: IngredientSource;
  sourceExternalId?: string;
  ownerRole: NutritionOwnerRole;
  createdBy: string;
  defaultPurchaseUnit?: PurchaseUnit;
  gramsPerUnit?: number;
  kcalPer100: number;
  proteinPer100: number;
  carbsPer100: number;
  fatPer100: number;
  createdAt: string;
  updatedAt: string;
}

export interface RecipeIngredient {
  id: string;
  ingredientId?: string;
  ingredientName: string;
  groupLabel?: string;
  alternatives?: string[];
  quantity?: number;
  unit: IngredientUnit;
  displayQuantity?: string;
  displayUnit?: string;
  normalizedQuantity?: number;
  ingredientRole: IngredientRole;
  scalingMode: IngredientScalingMode;
}

export interface RecipeNutritionSummary extends MacroTarget {
  servings: number;
}

export interface Recipe {
  id: string;
  name: string;
  description?: string;
  instructions: string;
  mealTag: MealTag;
  dietaryFlags: string[];
  allergies: string[];
  ownerRole: NutritionOwnerRole;
  createdBy: string;
  defaultServings: number;
  minServings: number;
  maxServings: number;
  ingredients: RecipeIngredient[];
  nutritionPerRecipe?: RecipeNutritionSummary;
  nutritionPerServing?: RecipeNutritionSummary;
  createdAt: string;
  updatedAt: string;
}

export interface MealPlanTemplateItem {
  id: string;
  mealTag: MealTag;
  recipeId: string;
  sortOrder: number;
}

export interface MealPlanTemplate {
  id: string;
  name: string;
  description?: string;
  ownerRole: NutritionOwnerRole;
  createdBy: string;
  items: MealPlanTemplateItem[];
  createdAt: string;
  updatedAt: string;
}

export interface AssignedMealPlanItem {
  id: string;
  mealTag: MealTag;
  recipeId: string;
  sortOrder: number;
}

export interface AssignedMealPlan {
  id: string;
  athleteId: string;
  templateId: string;
  assignedBy: string;
  name: string;
  items: AssignedMealPlanItem[];
  active: boolean;
  assignedAt: string;
  updatedAt: string;
}

export interface CoachAthleteAssignment {
  id: string;
  coachId: string;
  athleteId: string;
  active: boolean;
  createdAt: string;
}

export interface Exercise {
  id: string;
  name: string;
  category: string;
  equipment: string;
  cue: string;
  scope: ExerciseScope;
  coachId?: string;
}

export interface TemplateSetPrescription {
  id: string;
  label: string;
  targetReps: number;
  targetLoad?: number;
  restSeconds: number;
  notes?: string;
}

export interface WorkoutTemplateExercise {
  id: string;
  exerciseId: string;
  muscleGroup?: MuscleGroupKey;
  instruction: string;
  sets: TemplateSetPrescription[];
}

export interface WorkoutTemplateBlock {
  id: string;
  title: string;
  note?: string;
  exercises: WorkoutTemplateExercise[];
}

export interface WorkoutTemplate {
  id: string;
  coachId: string;
  title: string;
  description: string;
  goal: string;
  splitType: SplitType;
  status: TemplateStatus;
  blocks: WorkoutTemplateBlock[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export interface ProgramWorkoutSet {
  id: string;
  label: string;
  targetReps: number;
  targetRepsMin?: number;
  targetRepsMax?: number;
  targetLoad?: number;
  restSeconds?: number;
  notes?: string;
}

export interface ProgramWorkoutExercise {
  id: string;
  exerciseId?: string;
  exerciseName: string;
  muscleGroup?: MuscleGroupKey;
  supersetGroup?: string;
  instruction: string;
  sets: ProgramWorkoutSet[];
}

export interface ProgramWorkout {
  id: string;
  name: string;
  guidance?: string;
  splitType: SplitType;
  defaultRestSeconds: number;
  exercises: ProgramWorkoutExercise[];
}

export interface TrainingPlan {
  id: string;
  coachId: string;
  athleteId: string;
  title: string;
  description?: string;
  status?: ProgramStatus;
  workouts?: ProgramWorkout[];
  startDate: string;
  weekCount: number;
  createdAt: string;
  updatedAt?: string;
}

export interface ScheduledWorkout {
  id: string;
  trainingPlanId?: string;
  templateId?: string;
  programWorkoutId?: string;
  athleteId: string;
  coachId: string;
  title: string;
  scheduledDate: string;
  status: ScheduledWorkoutStatus;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface WorkoutSetLog {
  id: string;
  scheduledWorkoutId: string;
  templateExerciseId: string;
  setId: string;
  exerciseId: string;
  exerciseName: string;
  muscleGroup?: MuscleGroupKey;
  supersetGroup?: string;
  setLabel: string;
  targetReps: number;
  targetRepsMin?: number;
  targetRepsMax?: number;
  targetLoad?: number;
  targetRestSeconds?: number;
  programWorkoutId?: string;
  actualReps?: number;
  actualLoad?: number;
  done: boolean;
}

export interface WorkoutSession {
  id: string;
  scheduledWorkoutId: string;
  athleteId: string;
  startedAt: string;
  completedAt?: string;
  pausedAt?: string;
  pausedDurationSeconds?: number;
  updatedAt: string;
  setLogs: WorkoutSetLog[];
  energyLevel?: number;
}

export interface WorkoutNote {
  id: string;
  sessionId: string;
  athleteId: string;
  coachId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export type ConversationEntryType = "comment" | "admin_message";

export type ConversationContextType = "general" | "workout" | "program";

export interface ConversationEntry {
  id: string;
  athleteId: string;
  coachId: string;
  authorUserId: string;
  authorRole: Role;
  type: ConversationEntryType;
  body: string;
  contextType: ConversationContextType;
  contextId?: string;
  contextLabel?: string;
  createdAt: string;
  readByUserIds: string[];
}

export interface ExtraActivity {
  id: string;
  athleteId: string;
  activityType: ExtraActivityType;
  durationMinutes: number;
  estimatedKcal: number;
  occurredAt: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// Päiväkohtaisen ateriarivin lähde: pohjalistalta, vaihdettu, vai itse lisätty.
export type DayMealSource = "plan" | "swapped" | "added";

// Treenaajan oma päiväkohtainen ateriavalinta (vaihe 6). Pohja tulee suunnitelmasta,
// mutta treenaaja kokoaa päivänsä itse näiden rivien kautta.
export interface DayMealPlanEntry {
  id: string;
  athleteId: string;
  // Paikallinen päiväavain muodossa YYYY-MM-DD.
  planDate: string;
  mealTag: MealTag;
  recipeId: string;
  source: DayMealSource;
  servings: number;
  // null/undefined = ei vielä syöty; aikaleima = merkitty syödyksi.
  eatenAt?: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface Invite {
  id: string;
  token: string;
  email: string;
  role: Exclude<Role, "admin">;
  invitedBy: string;
  coachId?: string;
  status: InviteStatus;
  createdAt: string;
  expiresAt: string;
}

export interface PasswordResetRequest {
  id: string;
  userId: string;
  email: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  requestedByUserId?: string;
  requestedByRole: Role | "self_service";
  consumedAt?: string;
}

export interface AppState {
  users: UserProfile[];
  bodyMeasurements: BodyMeasurement[];
  nutritionProfiles: NutritionProfile[];
  ingredientsCatalog: Ingredient[];
  recipes: Recipe[];
  mealPlanTemplates: MealPlanTemplate[];
  assignedMealPlans: AssignedMealPlan[];
  assignments: CoachAthleteAssignment[];
  exercises: Exercise[];
  templates: WorkoutTemplate[];
  plans: TrainingPlan[];
  scheduledWorkouts: ScheduledWorkout[];
  sessions: WorkoutSession[];
  notes: WorkoutNote[];
  extraActivities?: ExtraActivity[];
  dayMealPlans?: DayMealPlanEntry[];
  conversationEntries: ConversationEntry[];
  invites: Invite[];
  passwordResetRequests: PasswordResetRequest[];
}

export interface TemplateExerciseInput {
  exerciseId: string;
  muscleGroup?: MuscleGroupKey;
  instruction: string;
  setCount: number;
  targetReps: number;
  targetLoad?: number;
  restSeconds: number;
  notes?: string;
}

export interface TemplateBuilderInput {
  title: string;
  description: string;
  goal: string;
  splitType: SplitType;
  blockTitle: string;
  blockNote?: string;
  exercises: TemplateExerciseInput[];
}

export interface ProgramBuilderInput {
  title: string;
  description?: string;
  athleteId: string;
  athleteEmail?: string;
  workouts: ProgramWorkoutInput[];
  startDate?: string;
  weekCount?: number;
}

export interface ProgramWorkoutExerciseInput {
  exerciseId?: string;
  exerciseName?: string;
  exerciseNameOverride?: string;
  customExerciseName?: string;
  customMuscleGroup?: MuscleGroupKey;
  supersetGroup?: string;
  instruction: string;
  repMode?: RepTargetMode;
  setCount: number;
  targetReps: number;
  targetRepsMin?: number;
  targetRepsMax?: number;
  targetLoad?: number;
  restSeconds?: number;
  notes?: string;
}

export interface ProgramWorkoutInput {
  splitType: SplitType;
  nameOverride?: string;
  guidance?: string;
  defaultRestSeconds: number;
  exercises: ProgramWorkoutExerciseInput[];
}

export interface ProgramUpdateInput {
  title?: string;
  description?: string;
  athleteId?: string;
  athleteEmail?: string;
  workouts?: ProgramWorkoutInput[];
}

export interface InviteInput {
  email: string;
  role: Exclude<Role, "admin">;
  coachId?: string;
}

export interface NutritionProfileInput {
  userId: string;
  goal: NutritionGoal;
  activityLevel: NutritionActivityLevel;
  mealsPerDay: number;
  calculationMode: "auto" | "manual_override";
  targetKcal?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  coachNotes?: string;
  dietaryFlags?: string[];
  allergies?: string[];
}

export interface IngredientInput {
  id?: string;
  name: string;
  displayName?: string;
  source: IngredientSource;
  sourceExternalId?: string;
  defaultPurchaseUnit?: PurchaseUnit;
  gramsPerUnit?: number;
  kcalPer100: number;
  proteinPer100: number;
  carbsPer100: number;
  fatPer100: number;
}

export interface RecipeIngredientInput {
  ingredientId?: string;
  ingredientName?: string;
  groupLabel?: string;
  alternatives?: string[];
  quantity?: number;
  unit: IngredientUnit;
  displayQuantity?: string;
  displayUnit?: string;
  ingredientRole: IngredientRole;
  scalingMode: IngredientScalingMode;
}

export interface RecipeInput {
  id?: string;
  name: string;
  description?: string;
  instructions: string;
  mealTag: MealTag;
  dietaryFlags?: string[];
  allergies?: string[];
  defaultServings: number;
  minServings: number;
  maxServings: number;
  ingredients: RecipeIngredientInput[];
}

export interface MealPlanTemplateInput {
  id?: string;
  name: string;
  description?: string;
  items: Array<{
    mealTag: MealTag;
    recipeId: string;
    sortOrder: number;
  }>;
}

export interface AssignedMealPlanInput {
  athleteId: string;
  templateId: string;
}

export interface WorkoutUpdateInput {
  actualReps?: number | null;
  actualLoad?: number | null;
  done?: boolean;
  expectedUpdatedAt?: string;
  templateExerciseId?: string;
  setLabel?: string;
}

export interface WorkoutSetDraftPatch {
  logId?: string;
  templateExerciseId?: string;
  setLabel?: string;
  actualReps?: number | null;
  actualLoad?: number | null;
  done?: boolean;
}

export interface WorkoutBatchSetSyncInput {
  sets: WorkoutSetDraftPatch[];
}

export interface WorkoutBatchSetSyncResult {
  updatedAt: string;
  setLogs: Array<{
    id: string;
    templateExerciseId?: string;
    setLabel?: string;
    actualReps?: number;
    actualLoad?: number;
    done: boolean;
  }>;
}

export interface WorkoutStartAutofillHint {
  templateExerciseId: string;
  setId: string;
  exerciseId: string;
  setLabel: string;
  actualReps?: number;
  actualLoad?: number;
}
