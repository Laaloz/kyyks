import type { AppState, ScheduledWorkout } from "@/lib/types";

export function buildScheduledWorkoutExerciseOrder(
  state: AppState,
  scheduledWorkout: ScheduledWorkout,
) {
  if (scheduledWorkout.templateId) {
    const template = state.templates.find((item) => item.id === scheduledWorkout.templateId);
    if (!template) {
      return new Map<string, number>();
    }

    const order = new Map<string, number>();
    let nextIndex = 0;
    template.blocks.forEach((block) => {
      block.exercises.forEach((exercise) => {
        order.set(exercise.id, nextIndex);
        nextIndex += 1;
      });
    });
    return order;
  }

  if (scheduledWorkout.trainingPlanId && scheduledWorkout.programWorkoutId) {
    const plan = state.plans.find((item) => item.id === scheduledWorkout.trainingPlanId);
    const workout = plan?.workouts?.find((item) => item.id === scheduledWorkout.programWorkoutId);
    if (!workout) {
      return new Map<string, number>();
    }

    return new Map(workout.exercises.map((exercise, index) => [exercise.id, index] as const));
  }

  return new Map<string, number>();
}
