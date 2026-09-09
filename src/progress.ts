import { getExercise, isBodyweightExercise } from './domain.ts'
import type { Exercise, SetLog, WorkoutSession } from './domain.ts'

export const PROGRESS_RANGES = [
  { id: '3m', label: '3 mesi', months: 3 },
  { id: '6m', label: '6 mesi', months: 6 },
  { id: '1y', label: '1 anno', months: 12 },
  { id: 'max', label: 'Max', months: null },
] as const
export type ProgressRange = typeof PROGRESS_RANGES[number]['id']
export type ProgressMetric = 'weight' | 'oneRepMax' | 'volume'
export const PROGRESS_METRICS: { id: ProgressMetric; label: string; unit: string; description: string }[] = [
  { id: 'weight', label: 'Peso utilizzato', unit: 'kg', description: 'Il carico effettivamente registrato in ogni serie' },
  { id: 'oneRepMax', label: 'Carico massimale', unit: 'kg', description: '1RM stimato: la migliore stima di ogni sessione, non un massimale misurato' },
  { id: 'volume', label: 'Volume della serie', unit: 'kg \u00d7 rip.', description: 'Peso registrato \u00d7 ripetizioni della singola serie, non il totale della sessione' },
]

export interface ProgressPoint {
  sessionId: string
  sessionName: string
  date: string
  log: SetLog
  value: number
}

export function progressStart(range: ProgressRange, now: Date): number {
  const months = PROGRESS_RANGES.find((option) => option.id === range)!.months
  if (months === null) return -Infinity
  const start = new Date(now)
  const day = start.getDate()
  start.setHours(0, 0, 0, 0)
  start.setDate(1)
  start.setMonth(start.getMonth() - months)
  // Clamp month ends (e.g. May 31 -> February 28), rather than overflowing into March.
  const lastDay = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate()
  start.setDate(Math.min(day, lastDay))
  return start.getTime()
}

export function estimatedOneRepMax(exercise: Exercise, log: Pick<SetLog, 'weight' | 'reps'>): number | null {
  if (isBodyweightExercise(exercise) || log.weight === null || log.weight <= 0 || log.reps > 10) return null
  return log.reps === 1 ? log.weight : log.weight * (1 + log.reps / 30)
}

export function progressPoints(history: WorkoutSession[], exerciseId: string, range: ProgressRange, metric: ProgressMetric, now = new Date()): ProgressPoint[] {
  const start = progressStart(range, now)
  const exercise = getExercise(exerciseId)
  return history.filter((session) => session.finishedAt !== null && Date.parse(session.startedAt) >= start && Date.parse(session.startedAt) <= now.getTime())
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt))
    .flatMap((session) => {
      const points = session.plan.exercises.filter((item) => item.exerciseId === exerciseId).flatMap((item) =>
        session.logs.filter((log) => log.planExerciseId === item.id && log.weight !== null)
          .sort((a, b) => a.setIndex - b.setIndex)
          .flatMap((log): ProgressPoint[] => {
            const value = metric === 'oneRepMax' ? estimatedOneRepMax(exercise, log)
              : metric === 'volume' ? log.weight! * log.reps : log.weight
            return value === null ? [] : [{ sessionId: session.id, sessionName: session.plan.name, date: session.startedAt, log, value }]
          }))
      if (metric !== 'oneRepMax' || !points.length) return points
      return [points.reduce((best, point) => point.value > best.value ? point : best)]
    })
}
