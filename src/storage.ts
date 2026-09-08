import { DEFAULT_SETTINGS, EQUIPMENT_LABELS, EXERCISES, GOAL_LABELS, LEVEL_LABELS, MUSCLE_LABELS } from './domain.ts'
import type { WorkoutPlan, WorkoutSession, WorkoutSettings } from './domain.ts'

export const STORAGE_KEY = 'tempofit.local.v1'
export const MIGRATION_NOTICE = 'Muscoli aggiornati: Glutei confluisce in Gambe; Braccia diventa Bicipiti, poi Tricipiti. Serie e carichi conservati. Controlla il focus in Configura e rigenera i vecchi piani per applicare le nuove priorita.'

export interface AppData {
  version: 2
  settings: WorkoutSettings
  draft: WorkoutPlan | null
  active: WorkoutSession | null
  history: WorkoutSession[]
  restEndsAt: number | null
}

export function emptyData(): AppData {
  return { version: 2, settings: structuredClone(DEFAULT_SETTINGS), draft: null, active: null, history: [], restEndsAt: null }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function nullableNumber(value: unknown): boolean {
  return value === null || finite(value)
}

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function date(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function settings(value: unknown): value is WorkoutSettings {
  return record(value) && finite(value.minutes) && value.minutes >= 5 && value.minutes <= 180
    && strings(value.muscles) && value.muscles.length > 0 && value.muscles.every((muscle) => Object.hasOwn(MUSCLE_LABELS, muscle))
    && typeof value.goal === 'string' && Object.hasOwn(GOAL_LABELS, value.goal)
    && typeof value.level === 'string' && Object.hasOwn(LEVEL_LABELS, value.level)
    && typeof value.equipment === 'string' && Object.hasOwn(EQUIPMENT_LABELS, value.equipment)
    && strings(value.avoidedIds) && strings(value.preferredIds) && strings(value.avoidedPatterns)
    && (value.includeAccessories === undefined || typeof value.includeAccessories === 'boolean')
    && (value.minRestSeconds === undefined || (finite(value.minRestSeconds) && Number.isInteger(value.minRestSeconds) && value.minRestSeconds >= 0 && value.minRestSeconds <= 300))
}

function plan(value: unknown): value is WorkoutPlan {
  return record(value) && typeof value.id === 'string' && typeof value.name === 'string'
    && date(value.createdAt) && settings(value.settings)
    && finite(value.warmupSeconds) && value.warmupSeconds >= 0 && finite(value.reserveSeconds) && value.reserveSeconds >= 0
    && Array.isArray(value.exercises) && value.exercises.length <= 30 && value.exercises.every((item: unknown) =>
      record(item) && typeof item.id === 'string' && typeof item.exerciseId === 'string'
      && EXERCISES.some((exercise) => exercise.id === item.exerciseId)
      && Number.isInteger(item.sets) && finite(item.sets) && item.sets > 0 && item.sets <= 12
      && finite(item.repMin) && finite(item.repMax) && finite(item.restSeconds)
      && finite(item.rir) && nullableNumber(item.targetLoad) && (item.targetLoad === null || (finite(item.targetLoad) && item.targetLoad >= 0))
      && (item.progressionNote === undefined || typeof item.progressionNote === 'string'))
}

function session(value: unknown): value is WorkoutSession {
  if (!record(value) || typeof value.id !== 'string' || !plan(value.plan)
    || !date(value.startedAt) || !(value.finishedAt === null || date(value.finishedAt))
    || !Array.isArray(value.logs)) return false
  if (value.plan.exercises.length === 0 || new Set(value.plan.exercises.map((item) => item.id)).size !== value.plan.exercises.length) return false
  const exerciseIds = new Map(value.plan.exercises.map((item) => [item.id, item.sets]))
  const seen = new Set<string>()
  return value.logs.every((item: unknown) => {
    if (!record(item) || typeof item.id !== 'string' || typeof item.planExerciseId !== 'string'
      || !finite(item.setIndex) || !Number.isInteger(item.setIndex)
      || item.setIndex < 0 || item.setIndex >= (exerciseIds.get(item.planExerciseId) ?? 0)
      || !nullableNumber(item.weight) || (finite(item.weight) && item.weight < 0)
      || !finite(item.reps) || !Number.isInteger(item.reps) || item.reps < 1
      || !nullableNumber(item.rir) || (finite(item.rir) && (item.rir < 0 || item.rir > 10))
      || !date(item.completedAt)) return false
    const key = `${item.planExerciseId}:${item.setIndex}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function isAppData(value: unknown): value is AppData {
  return record(value) && value.version === 2 && settings(value.settings)
    && (value.draft === null || plan(value.draft))
    && (value.active === null || (session(value.active) && value.active.finishedAt === null))
    && Array.isArray(value.history) && value.history.every((item: unknown) => session(item) && item.finishedAt !== null)
    && nullableNumber(value.restEndsAt)
}

function migrateSettings(value: unknown): unknown {
  if (!record(value) || !strings(value.muscles)) return value
  return { ...value, muscles: [...new Set(value.muscles.flatMap((muscle) =>
    muscle === 'arms' ? ['biceps', 'triceps'] : [muscle === 'glutes' ? 'legs' : muscle]))] }
}

function migratePlan(value: unknown): unknown {
  return record(value) ? { ...value, settings: migrateSettings(value.settings) } : value
}

function migrateSession(value: unknown): unknown {
  return record(value) ? { ...value, plan: migratePlan(value.plan) } : value
}

// Both disk reads and imports pass through this path; only validated migrations are saved.
export function decodeData(value: unknown): { data: AppData; migrated: boolean } | null {
  if (isAppData(value)) return { data: value, migrated: false }
  if (!record(value) || value.version !== 1) return null
  const migrated: unknown = {
    ...value, version: 2, settings: migrateSettings(value.settings),
    draft: migratePlan(value.draft), active: migrateSession(value.active),
    history: Array.isArray(value.history) ? value.history.map(migrateSession) : value.history,
  }
  return isAppData(migrated) ? { data: migrated, migrated: true } : null
}

export function loadData(): { data: AppData; error: string | null; notice?: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return { data: emptyData(), error: null }
    const parsed: unknown = JSON.parse(raw)
    const decoded = decodeData(parsed)
    if (!decoded) return { data: emptyData(), error: 'I dati locali non sono compatibili. Non saranno sovrascritti: esportali prima di ripristinare.' }
    return { data: decoded.data, error: null, notice: decoded.migrated ? MIGRATION_NOTICE : undefined }
  } catch (error) {
    if (error instanceof SyntaxError) return { data: emptyData(), error: 'Il salvataggio locale non e leggibile. Non sara sovrascritto: esportalo prima di ripristinare.' }
    if (error instanceof DOMException) return { data: emptyData(), error: 'Il browser non consente di leggere i dati locali. Abilita lo spazio di archiviazione per salvare gli allenamenti.' }
    throw error
  }
}

export function downloadData(content: string, name: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
