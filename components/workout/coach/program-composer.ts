import { z } from "zod";

import { CUSTOM_MUSCLE_GROUP_OPTIONS, programComposerSchema } from "@/components/workout/schemas";
import type { MuscleGroupKey, SplitType } from "@/lib/types";

export type ProgramComposerValues = z.output<typeof programComposerSchema>;

export type ProgramComposerExerciseFormValues = {
  exerciseId: string;
  exerciseNameOverride: string;
  customExerciseName: string;
  customMuscleGroup: "" | MuscleGroupKey;
  supersetGroup: "" | "A" | "B" | "C" | "D";
  instruction: string;
  repMode: "exact" | "range";
  setCount: number;
  targetReps: number;
  targetRepsMin: number | "";
  targetRepsMax: number | "";
  targetLoad: number | "" | undefined;
  restSeconds: number;
  notes: string;
};

export type ProgramComposerWorkoutFormValues = {
  splitType: SplitType;
  nameOverride?: string;
  defaultRestSeconds: number;
  exercises: ProgramComposerExerciseFormValues[];
};

export type ProgramComposerFormValues = {
  title: string;
  description: string;
  athleteId: string;
  workouts: ProgramComposerWorkoutFormValues[];
};

export const customMuscleGroupLabels: Record<(typeof CUSTOM_MUSCLE_GROUP_OPTIONS)[number], string> = {
  shoulders: "Olkapää",
  arms: "Kädet",
  chest: "Rinta",
  abs: "Vatsalihakset",
  back: "Selkä",
  legs: "Jalat",
  other: "Muu",
};
