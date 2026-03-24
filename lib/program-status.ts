import type { ProgramStatus, TrainingPlan } from "@/lib/types";

export function getProgramStatus(plan: Pick<TrainingPlan, "status"> | null | undefined): ProgramStatus {
  return plan?.status === "archived" ? "archived" : "active";
}

export function isProgramActive(plan: Pick<TrainingPlan, "status"> | null | undefined) {
  return getProgramStatus(plan) === "active";
}

export function getProgramStatusLabel(status: ProgramStatus) {
  return status === "active" ? "Aktiivinen" : "Arkistoitu";
}
