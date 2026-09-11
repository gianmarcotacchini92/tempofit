import {
  DEFAULT_SETTINGS, EXERCISES, MAX_PLAN_EXERCISES, allowed, getExercise, intensityOptions, isBodyweightExercise,
  isFocusExercise, minimumRestSeconds, needsCsvRepair, routinePrescription, suggestLoad, supersetCandidates,
} from './domain.ts'
import type { Exercise, Muscle, PlanExercise, WorkoutPlan, WorkoutSession, WorkoutSettings } from './domain.ts'
import type { AppData } from './storage.ts'

export interface WorkoutRoutine {
  id: string
  name: string
  plan: WorkoutPlan
  createdAt: string
  updatedAt: string
  refreshLoads: boolean
  source: 'history' | 'custom'
  historyKey?: string
  sourceSessionId?: string
}

export function normalizeRoutineName(name: string): string {
  return name.normalize('NFC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('it').normalize('NFC')
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function hasStandardSet(session: WorkoutSession): boolean {
  return session.logs.some((log) => log.part === undefined
    && Number.isInteger(log.reps) && log.reps > 0 && validDate(log.completedAt)
    && session.plan.exercises.some((item) => item.id === log.planExerciseId
      && Number.isInteger(log.setIndex) && log.setIndex >= 0 && log.setIndex < item.sets))
}

function historyId(key: string): string {
  // Encode every UTF-16 code unit: punctuation, accents and unpaired surrogates cannot collide.
  return `history-routine-${key.split('').map((char) => char.charCodeAt(0).toString(16).padStart(4, '0')).join('')}`
}

function raiseEstimatedRests(plan: WorkoutPlan, personalMinimum = 0): void {
  // CSV recovery times are estimates, unlike the prescriptions recorded by native sessions.
  for (const item of plan.exercises) {
    item.restSeconds = Math.max(item.restSeconds, minimumRestSeconds(item), plan.settings.minRestSeconds ?? 0, personalMinimum)
  }
}

export function extractHistoryRoutines(history: WorkoutSession[]): WorkoutRoutine[] {
  const latest = new Map<string, WorkoutSession>()
  const ordered = history.filter((session) => !needsCsvRepair(session)
    && validDate(session.startedAt) && validDate(session.finishedAt)
    && Date.parse(session.finishedAt) >= Date.parse(session.startedAt) && hasStandardSet(session))
    .sort((left, right) => Date.parse(right.finishedAt!) - Date.parse(left.finishedAt!)
      || Date.parse(right.startedAt) - Date.parse(left.startedAt) || compareText(right.id, left.id))
  for (const session of ordered) {
    const key = normalizeRoutineName(session.plan.name)
    if (key && !latest.has(key)) latest.set(key, session)
  }
  return [...latest].sort(([left], [right]) => compareText(left, right)).map(([historyKey, session]) => {
    const id = historyId(historyKey)
    const createdAt = new Date(session.startedAt).toISOString()
    const updatedAt = new Date(session.finishedAt!).toISOString()
    const plan = structuredClone(session.plan)
    Object.assign(plan, { id: `${id}-plan`, kind: 'routine', routineId: id, createdAt })
    for (const item of plan.exercises) {
      delete item.progressionNote
      item.targetLoad = isBodyweightExercise(getExercise(item.exerciseId)) ? null
        : suggestLoad(item.exerciseId, [session], item.repMax, item.rir, false, item) ?? item.targetLoad
    }
    if (session.importSource?.format === 'hevy-csv') {
      plan.settings.muscles = inferredMuscles(plan.exercises.map((item) => item.exerciseId), plan.settings)
      raiseEstimatedRests(plan)
    }
    return {
      id, name: session.plan.name, plan, createdAt, updatedAt, refreshLoads: true,
      source: 'history', historyKey, sourceSessionId: session.id,
    }
  })
}

export function recoverHistoryRoutines(data: AppData): { data: AppData; added: number; existing: number; skippedLegacy: number } {
  const names = new Set(data.routines.map((routine) => normalizeRoutineName(routine.name)))
  const keys = new Set(data.routines.flatMap((routine) =>
    routine.historyKey === undefined ? [] : [normalizeRoutineName(routine.historyKey)]))
  const ids = new Set(data.routines.map((routine) => routine.id))
  const csvSessions = new Set(data.history.filter((session) => session.importSource?.format === 'hevy-csv').map((session) => session.id))
  const additions: WorkoutRoutine[] = []
  let existing = 0
  for (const routine of extractHistoryRoutines(data.history)) {
    if (names.has(routine.historyKey!) || keys.has(routine.historyKey!) || ids.has(routine.id)) existing++
    else {
      if (csvSessions.has(routine.sourceSessionId!)) {
        routine.plan.settings.minRestSeconds = Math.max(routine.plan.settings.minRestSeconds ?? 0, data.settings.minRestSeconds ?? 0)
        raiseEstimatedRests(routine.plan)
      }
      additions.push(routine)
    }
  }
  const skippedLegacy = data.history.filter(needsCsvRepair).length
  return {
    data: !additions.length && data.routineHistoryInitialized ? data
      : { ...data, routines: [...data.routines, ...additions], routineHistoryInitialized: true },
    added: additions.length, existing, skippedLegacy,
  }
}

function freshPlan(plan: WorkoutPlan, routineId: string, name: string, createdAt: string): WorkoutPlan {
  const groups = new Map<string, string>()
  const copy: WorkoutPlan = {
    id: crypto.randomUUID(), name, kind: 'routine', routineId, createdAt,
    settings: structuredClone(plan.settings), warmupSeconds: plan.warmupSeconds, reserveSeconds: plan.reserveSeconds,
    exercises: structuredClone(plan.exercises),
  }
  for (const item of copy.exercises) {
    item.id = crypto.randomUUID()
    delete item.progressionNote
    if (item.supersetGroup !== undefined) {
      if (!groups.has(item.supersetGroup)) groups.set(item.supersetGroup, crypto.randomUUID())
      item.supersetGroup = groups.get(item.supersetGroup)!
    }
  }
  return copy
}

export function routineFromPlan(plan: WorkoutPlan): WorkoutRoutine {
  const id = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  return {
    id, name: plan.name, plan: freshPlan(plan, id, plan.name, createdAt),
    createdAt, updatedAt: createdAt, refreshLoads: true, source: 'custom',
  }
}

export function blankRoutine(settings: WorkoutSettings): WorkoutRoutine {
  return routineFromPlan({
    id: '', name: 'Nuova routine', createdAt: '', settings, exercises: [], warmupSeconds: 300, reserveSeconds: 90,
  })
}

export function instantiateRoutine(routine: WorkoutRoutine, history: WorkoutSession[]): WorkoutPlan {
  const plan = freshPlan(routine.plan, routine.id, routine.name, new Date().toISOString())
  if (!routine.refreshLoads) return plan
  for (const item of plan.exercises) {
    if (isBodyweightExercise(getExercise(item.exerciseId))) {
      item.targetLoad = null
      continue
    }
    const reference = suggestLoad(item.exerciseId, history, item.repMax, item.rir, false, item)
    const load = suggestLoad(item.exerciseId, history, item.repMax, item.rir, isFocusExercise(item, plan.settings), item)
    if (load === null) continue
    item.targetLoad = load
    item.progressionNote = reference !== null && load > reference
      ? `Focus: proposta ${load} kg (prima ${reference} kg), dopo due sedute comparabili. Conferma il carico e mantieni RIR ${item.rir}.`
      : `Riferimento dallo storico: ${load} kg, da confermare. Mantieni RIR ${item.rir}; nessun aumento automatico.`
  }
  return plan
}

function inferredMuscles(exerciseIds: string[], previous: WorkoutSettings): Muscle[] {
  const muscles = [...new Set(exerciseIds.flatMap((id) => getExercise(id).muscles))]
  return muscles.length ? muscles : [...(previous.muscles.length ? previous.muscles : DEFAULT_SETTINGS.muscles)]
}

export function getRoutineExercises(settings: WorkoutSettings): Exercise[] {
  return EXERCISES.filter((exercise) => allowed(exercise, settings, true))
}

export function setRoutineExercises(plan: WorkoutPlan, items: PlanExercise[]): WorkoutPlan {
  if (items.length > MAX_PLAN_EXERCISES) throw new Error(`Il formato supporta al massimo ${MAX_PLAN_EXERCISES} esercizi per scheda.`)
  const original = new Map(plan.exercises.map((item) => [item.id, item.exerciseId]))
  const previousCounts = new Map<string, number>()
  for (const item of plan.exercises) previousCounts.set(item.exerciseId, (previousCounts.get(item.exerciseId) ?? 0) + 1)
  const counts = new Map<string, number>()
  const exerciseIds = new Set<string>()
  const itemIds = new Set<string>()
  for (const item of items) {
    const exercise = getExercise(item.exerciseId)
    const existing = original.get(item.id) === item.exerciseId
    if (!existing && !allowed(exercise, plan.settings, true)) throw new Error(`${exercise.name}: attrezzatura o esclusioni non compatibili.`)
    const count = (counts.get(exercise.id) ?? 0) + 1
    if (count > Math.max(1, previousCounts.get(exercise.id) ?? 0)) throw new Error(`${exercise.name}: esercizio gia presente nella routine.`)
    counts.set(exercise.id, count)
    if (!item.id.trim() || itemIds.has(item.id)) throw new Error('Ogni esercizio deve avere un identificativo unico.')
    exerciseIds.add(exercise.id)
    itemIds.add(item.id)
  }
  const result = structuredClone(plan)
  result.kind = 'routine'
  result.exercises = structuredClone(items)
  result.settings.muscles = inferredMuscles([...exerciseIds], plan.settings)
  for (const item of result.exercises) {
    delete item.progressionNote
    if (item.technique !== undefined && !intensityOptions(result, item).includes(item.technique)) delete item.technique
  }
  const invalidGroups = new Set(result.exercises.filter((item) =>
    item.supersetGroup !== undefined && supersetCandidates(result, item).length !== 1).map((item) => item.supersetGroup))
  for (const item of result.exercises) {
    if (invalidGroups.has(item.supersetGroup)) delete item.supersetGroup
  }
  const keptGroups = new Set<string>()
  let blocks = 0
  for (const item of result.exercises) {
    if (item.technique !== undefined && ++blocks > 2) delete item.technique
    if (item.supersetGroup !== undefined && !keptGroups.has(item.supersetGroup)) {
      const group = item.supersetGroup
      keptGroups.add(group)
      if (++blocks > 2) for (const member of result.exercises) {
        if (member.supersetGroup === group) delete member.supersetGroup
      }
    }
  }
  return result
}

export function addRoutineExercise(plan: WorkoutPlan, exerciseId: string): WorkoutPlan {
  if (plan.exercises.length >= MAX_PLAN_EXERCISES) throw new Error(`Il formato supporta al massimo ${MAX_PLAN_EXERCISES} esercizi per scheda.`)
  const exercise = getExercise(exerciseId)
  if (!allowed(exercise, plan.settings, true)) throw new Error(`${exercise.name}: attrezzatura o esclusioni non compatibili.`)
  if (plan.exercises.some((item) => item.exerciseId === exerciseId)) throw new Error(`${exercise.name}: esercizio gia presente nella routine.`)
  const settings = { ...plan.settings, muscles: inferredMuscles([...plan.exercises.map((item) => item.exerciseId), exerciseId], plan.settings) }
  const item = routinePrescription(exercise, settings, plan.exercises)
  return setRoutineExercises(plan, [...plan.exercises, item])
}

export function moveRoutineExercise(plan: WorkoutPlan, itemId: string, direction: -1 | 1): WorkoutPlan {
  const index = plan.exercises.findIndex((item) => item.id === itemId)
  if (index < 0) throw new Error('Esercizio non presente nella routine.')
  if (direction !== -1 && direction !== 1) throw new Error('Direzione di spostamento non valida.')
  const target = index + direction
  if (target < 0 || target >= plan.exercises.length) throw new Error('Posizione fuori dai limiti della routine.')
  const items = [...plan.exercises]
  const moved = items.splice(index, 1)[0]!
  items.splice(target, 0, moved)
  return setRoutineExercises(plan, items)
}
