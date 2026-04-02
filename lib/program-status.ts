import type { ProgramStatus, TrainingPlan } from "@/lib/types";

export function getProgramStatus(plan: Pick<TrainingPlan, "status"> | null | undefined): ProgramStatus {
  if (plan?.status === "archived") {
    return "archived";
  }

  if (plan?.status === "removed") {
    return "removed";
  }

  return "active";
}

export function isProgramActive(plan: Pick<TrainingPlan, "status"> | null | undefined) {
  return getProgramStatus(plan) === "active";
}

export function getProgramStatusLabel(status: ProgramStatus) {
  if (status === "active") {
    return "Aktiivinen";
  }

  if (status === "archived") {
    return "Arkistoitu";
  }

  return "Poistettu näkyvistä";
}
