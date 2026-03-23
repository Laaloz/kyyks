import { splitLabel } from "@/lib/domain";
import type { ScheduledWorkout, SplitType, TrainingPlan, WorkoutTemplate } from "@/lib/types";
import { normalizeWorkoutHistoryTitle } from "@/lib/workout-history-title";

type WorkoutConversationContextOption = {
  id: string;
  label: string;
  contextType: "workout";
  contextId: string;
  contextLabel: string;
};

const splitOrder: Record<SplitType, number> = {
  upper: 0,
  lower: 1,
  full_body: 2,
  custom: 3,
};

export function buildWorkoutConversationContextOptions({
  workouts,
  plans,
  templates,
}: {
  workouts: ScheduledWorkout[];
  plans: TrainingPlan[];
  templates: WorkoutTemplate[];
}) {
  const plansById = new Map(plans.map((plan) => [plan.id, plan]));
  const templatesById = new Map(templates.map((template) => [template.id, template]));
  const groupedOptions = new Map<
    string,
    WorkoutConversationContextOption & { order: number; sortTime: number }
  >();

  workouts.forEach((workout) => {
    const splitType = resolveWorkoutSplitType(workout, plansById, templatesById);
    const contextLabel = splitLabel(splitType);
    const existingOption = groupedOptions.get(splitType);
    const sortTime = resolveWorkoutSortTime(workout);

    if (!existingOption || sortTime > existingOption.sortTime) {
      groupedOptions.set(splitType, {
        id: `workout-group-${splitType}`,
        label: `Treenialue: ${contextLabel}`,
        contextType: "workout",
        contextId: workout.id,
        contextLabel,
        order: splitOrder[splitType],
        sortTime,
      });
    }
  });

  return Array.from(groupedOptions.values())
    .sort((left, right) => {
      if (left.order !== right.order) {
        return left.order - right.order;
      }

      if (left.sortTime !== right.sortTime) {
        return right.sortTime - left.sortTime;
      }

      return left.label.localeCompare(right.label, "fi");
    })
    .map(({ order: _order, sortTime: _sortTime, ...option }) => option);
}

function resolveWorkoutSplitType(
  workout: ScheduledWorkout,
  plansById: Map<string, TrainingPlan>,
  templatesById: Map<string, WorkoutTemplate>,
): SplitType {
  if (workout.trainingPlanId && workout.programWorkoutId) {
    const programWorkout = plansById
      .get(workout.trainingPlanId)
      ?.workouts?.find((item) => item.id === workout.programWorkoutId);
    if (programWorkout?.splitType) {
      return programWorkout.splitType;
    }
  }

  if (workout.templateId) {
    const template = templatesById.get(workout.templateId);
    if (template?.splitType) {
      return template.splitType;
    }
  }

  return inferSplitTypeFromTitle(workout.title);
}

function inferSplitTypeFromTitle(title: string): SplitType {
  const normalizedTitle = normalizeWorkoutHistoryTitle(title).toLowerCase();

  if (normalizedTitle.includes("ylä")) {
    return "upper";
  }

  if (normalizedTitle.includes("ala")) {
    return "lower";
  }

  if (normalizedTitle.includes("koko")) {
    return "full_body";
  }

  return "custom";
}

function resolveWorkoutSortTime(workout: ScheduledWorkout) {
  const updatedTime = Date.parse(workout.updatedAt);
  if (Number.isFinite(updatedTime)) {
    return updatedTime;
  }

  const scheduledTime = Date.parse(workout.scheduledDate);
  if (Number.isFinite(scheduledTime)) {
    return scheduledTime;
  }

  const createdTime = Date.parse(workout.createdAt);
  if (Number.isFinite(createdTime)) {
    return createdTime;
  }

  return 0;
}
