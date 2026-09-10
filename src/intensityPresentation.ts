import type { IntensityTechnique, PlanExercise, WorkoutPlan } from './domain.ts'

export const INTENSITY_LABELS: Record<IntensityTechnique, string> = {
  'drop-set': 'Drop set / stripping',
  'rest-pause': 'Rest-pause',
}

export function recoverySeconds(item: PlanExercise, plan: WorkoutPlan) {
  return item.supersetGroup ? Math.max(...plan.exercises.filter((other) => other.supersetGroup === item.supersetGroup).map((other) => other.restSeconds)) : item.restSeconds
}
