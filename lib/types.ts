export type Role = "admin" | "coach" | "athlete";
export type UserStatus = "active" | "invited";
export type TemplateStatus = "draft" | "published";
export type ScheduledWorkoutStatus = "scheduled" | "in_progress" | "completed";
export type InviteStatus = "pending" | "accepted";
export type SplitType = "upper" | "lower" | "full_body" | "custom";
export type ExerciseScope = "global" | "coach_custom";
export type RepTargetMode = "exact" | "range";

export interface UserProfile {
  id: string;
  role: Role;
  fullName: string;
  email: string;
  status: UserStatus;
  demoPassword?: string;
  createdAt: string;
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
  supersetGroup?: string;
  instruction: string;
  sets: ProgramWorkoutSet[];
}

export interface ProgramWorkout {
  id: string;
  name: string;
  splitType: SplitType;
  defaultRestSeconds: number;
  exercises: ProgramWorkoutExercise[];
}

export interface TrainingPlan {
  id: string;
  coachId: string;
  athleteId: string;
  title: string;
  templateIds?: string[];
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
  rpe?: number;
  done: boolean;
}

export interface WorkoutSession {
  id: string;
  scheduledWorkoutId: string;
  athleteId: string;
  startedAt: string;
  completedAt?: string;
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

export interface AppState {
  users: UserProfile[];
  assignments: CoachAthleteAssignment[];
  exercises: Exercise[];
  templates: WorkoutTemplate[];
  plans: TrainingPlan[];
  scheduledWorkouts: ScheduledWorkout[];
  sessions: WorkoutSession[];
  notes: WorkoutNote[];
  invites: Invite[];
}

export interface TemplateExerciseInput {
  exerciseId: string;
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
  athleteId: string;
  workouts: ProgramWorkoutInput[];
  startDate?: string;
  weekCount?: number;
}

export interface ProgramWorkoutExerciseInput {
  exerciseId?: string;
  exerciseName?: string;
  exerciseNameOverride?: string;
  customExerciseName?: string;
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
  defaultRestSeconds: number;
  exercises: ProgramWorkoutExerciseInput[];
}

export interface ProgramUpdateInput {
  title?: string;
  workouts?: ProgramWorkoutInput[];
}

export interface InviteInput {
  email: string;
  role: Exclude<Role, "admin">;
  coachId?: string;
}

export interface WorkoutUpdateInput {
  actualReps?: number;
  actualLoad?: number;
  rpe?: number;
  done?: boolean;
}
