import { CUSTOM_MUSCLE_GROUP_OPTIONS } from "@/components/workout/schemas";

export const customMuscleGroupLabels: Record<(typeof CUSTOM_MUSCLE_GROUP_OPTIONS)[number], string> = {
  shoulders: "Olkapää",
  arms: "Kädet",
  chest: "Rinta",
  abs: "Vatsalihakset",
  back: "Selkä",
  legs: "Jalat",
  other: "Muu",
};
