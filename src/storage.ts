import { DEFAULT_SETTINGS, EQUIPMENT_LABELS, EXERCISES, GOAL_LABELS, LEVEL_LABELS, MAX_PLAN_EXERCISES, MAX_PRESCRIPTION_SETS, MUSCLE_LABELS, intensityOptions, supersetCandidates } from './domain.ts'
import type { WorkoutPlan, WorkoutSession, WorkoutSettings } from './domain.ts'
import type { WorkoutRoutine } from './routines.ts'

export const STORAGE_KEY = 'tempofit.local.v1'
export const MIGRATION_NOTICE = 'Muscoli aggiornati: Glutei confluisce in Gambe; Braccia diventa Bicipiti, poi Tricipiti. Serie e carichi conservati. Controlla il focus in Configura e rigenera i vecchi piani per applicare le nuove priorita.'

export interface AppData {
  version: 3
  settings: WorkoutSettings
  draft: WorkoutPlan | null
  active: WorkoutSession | null
  history: WorkoutSession[]
  restEndsAt: number | null
  routines: WorkoutRoutine[]
  routineHistoryInitialized: boolean
}

export function emptyData(): AppData {
  return { version: 3, settings: structuredClone(DEFAULT_SETTINGS), draft: null, active: null, history: [], restEndsAt: null, routines: [], routineHistoryInitialized: true }
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
    && (value.optimizeTime === undefined || typeof value.optimizeTime === 'boolean')
    && (value.minRestSeconds === undefined || (finite(value.minRestSeconds) && Number.isInteger(value.minRestSeconds) && value.minRestSeconds >= 0 && value.minRestSeconds <= 300))
}

function planShape(value: unknown): value is WorkoutPlan {
  return record(value) && typeof value.id === 'string' && typeof value.name === 'string'
    && (value.kind === undefined || value.kind === 'routine')
    && (value.routineId === undefined || (typeof value.routineId === 'string' && value.routineId.trim().length > 0))
    && date(value.createdAt) && settings(value.settings)
    && finite(value.warmupSeconds) && value.warmupSeconds >= 0 && finite(value.reserveSeconds) && value.reserveSeconds >= 0
    && Array.isArray(value.exercises) && value.exercises.length <= MAX_PLAN_EXERCISES && value.exercises.every((item: unknown) =>
      record(item) && typeof item.id === 'string' && typeof item.exerciseId === 'string'
      && EXERCISES.some((exercise) => exercise.id === item.exerciseId)
      && Number.isInteger(item.sets) && finite(item.sets) && item.sets > 0 && item.sets <= MAX_PRESCRIPTION_SETS
      && finite(item.repMin) && finite(item.repMax) && finite(item.restSeconds)
      && finite(item.rir) && nullableNumber(item.targetLoad) && (item.targetLoad === null || (finite(item.targetLoad) && item.targetLoad >= 0))
      && (item.progressionNote === undefined || typeof item.progressionNote === 'string')
      && (item.sourceExerciseName === undefined || typeof item.sourceExerciseName === 'string')
      && (item.technique === undefined || item.technique === 'drop-set' || item.technique === 'rest-pause')
      && (item.supersetGroup === undefined || (typeof item.supersetGroup === 'string' && item.supersetGroup.trim().length > 0)))
}

function plan(value: unknown): value is WorkoutPlan {
  if (!planShape(value)) return false
  const workout = value
  // Do not re-validate old/imported prescriptions against today's programming rules.
  if (!workout.exercises.some((item) => item.technique !== undefined || item.supersetGroup !== undefined)) return true
  if (new Set(workout.exercises.map((item) => item.id)).size !== workout.exercises.length) return false
  const groups = new Set(workout.exercises.filter((item) => item.supersetGroup !== undefined).map((item) => item.supersetGroup))
  if (groups.size + workout.exercises.filter((item) => item.technique !== undefined).length > 2) return false
  return workout.exercises.every((item) =>
    (item.technique === undefined || intensityOptions(workout, item).includes(item.technique))
    && (item.supersetGroup === undefined || supersetCandidates(workout, item).length === 1))
}

function session(value: unknown): value is WorkoutSession {
  if (!record(value) || typeof value.id !== 'string' || !plan(value.plan)
    || !date(value.startedAt) || !(value.finishedAt === null || date(value.finishedAt))
    || !Array.isArray(value.logs)) return false
  if (value.importSource !== undefined && (!record(value.importSource) || value.importSource.format !== 'hevy-csv'
    || value.importSource.mappingVersion !== 2 || typeof value.importSource.key !== 'string')) return false
  if (value.plan.exercises.length === 0 || new Set(value.plan.exercises.map((item) => item.id)).size !== value.plan.exercises.length) return false
  const exerciseIds = new Map(value.plan.exercises.map((item) => [item.id, item]))
  const seen = new Set<string>()
  const completedParents = new Map<string, number>()
  return value.logs.every((item: unknown) => {
    if (!record(item) || typeof item.id !== 'string' || typeof item.planExerciseId !== 'string'
      || !finite(item.setIndex) || !Number.isInteger(item.setIndex)
      || item.setIndex < 0 || item.setIndex >= (exerciseIds.get(item.planExerciseId)?.sets ?? 0)
      || !nullableNumber(item.weight) || (finite(item.weight) && item.weight < 0)
      || !finite(item.reps) || !Number.isInteger(item.reps) || item.reps < 1
      || !nullableNumber(item.rir) || (finite(item.rir) && (item.rir < 0 || item.rir > 10))
      || !date(item.completedAt)) return false
    if (item.sourceSetIndex !== undefined && (!finite(item.sourceSetIndex) || !Number.isInteger(item.sourceSetIndex) || item.sourceSetIndex < 0)) return false
    if (item.part !== undefined && item.part !== 'drop' && item.part !== 'rest-pause') return false
    const parentKey = JSON.stringify([item.planExerciseId, item.setIndex])
    if (item.part !== undefined) {
      const prescription = exerciseIds.get(item.planExerciseId)!
      const expected = prescription.technique === 'drop-set' ? 'drop'
        : prescription.technique === 'rest-pause' ? 'rest-pause' : undefined
      const parentCompletedAt = completedParents.get(parentKey)
      if (item.part !== expected || item.setIndex !== prescription.sets - 1 || item.reps > 50
        || parentCompletedAt === undefined || Date.parse(item.completedAt) < parentCompletedAt) return false
    } else {
      completedParents.set(parentKey, Date.parse(item.completedAt))
    }
    const key = JSON.stringify([item.planExerciseId, item.setIndex, item.part ?? null])
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function isAppData(value: unknown): value is AppData {
  return record(value) && value.version === 3 && settings(value.settings)
    && (value.draft === null || plan(value.draft))
    && (value.active === null || (session(value.active) && value.active.finishedAt === null))
    && Array.isArray(value.history) && value.history.every((item: unknown) => session(item) && item.finishedAt !== null)
    && nullableNumber(value.restEndsAt)
    && typeof value.routineHistoryInitialized === 'boolean'
    && Array.isArray(value.routines) && value.routines.every((item: unknown) =>
      record(item) && typeof item.id === 'string' && item.id.trim().length > 0
      && typeof item.name === 'string' && item.name.trim().length > 0 && plan(item.plan)
      && date(item.createdAt) && date(item.updatedAt) && Date.parse(item.updatedAt) >= Date.parse(item.createdAt)
      && typeof item.refreshLoads === 'boolean' && (item.source === 'history' || item.source === 'custom')
      && (item.historyKey === undefined || (typeof item.historyKey === 'string' && item.historyKey.trim().length > 0))
      && (item.sourceSessionId === undefined || (typeof item.sourceSessionId === 'string' && item.sourceSessionId.trim().length > 0))
      && new Set(item.plan.exercises.map((entry) => entry.id)).size === item.plan.exercises.length)
    && new Set(value.routines.map((item: WorkoutRoutine) => item.id)).size === value.routines.length
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
export function decodeData(value: unknown): { data: AppData; migrated: boolean; schemaUpgraded?: boolean } | null {
  if (isAppData(value)) return { data: value, migrated: false }
  if (!record(value) || (value.version !== 1 && value.version !== 2)) return null
  const anatomy = value.version === 1
  const previous = anatomy ? {
    ...value, version: 2, settings: migrateSettings(value.settings),
    draft: migratePlan(value.draft), active: migrateSession(value.active),
    history: Array.isArray(value.history) ? value.history.map(migrateSession) : value.history,
  } : value
  const migrated: unknown = { ...previous, version: 3, routines: [], routineHistoryInitialized: false }
  return isAppData(migrated) ? { data: migrated, migrated: anatomy, schemaUpgraded: true } : null
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
