import { DEFAULT_SETTINGS, getExercise, minimumRestSeconds } from './domain.ts'
import type { Muscle, PlanExercise, SetLog, WorkoutPlan, WorkoutSession } from './domain.ts'
import type { AppData } from './storage.ts'
import { isAppData } from './storage.ts'
import { CSV_EXERCISE_MAP } from './csvExercises.ts'

type CsvRow = Record<string, string>

export interface CsvImportResult {
  data: AppData | null
  importedSessions: number
  importedSets: number
  skippedSessions: number
  skippedExercises: string[]
  skippedRows: number
  error: string | null
}

const MONTHS: Record<string, number> = {
  gen: 0, gennaio: 0, feb: 1, febbraio: 1, mar: 2, marzo: 2, apr: 3, aprile: 3,
  mag: 4, maggio: 4, giu: 5, giugno: 5, lug: 6, luglio: 6, ago: 7, agosto: 7,
  set: 8, settembre: 8, ott: 9, ottobre: 9, nov: 10, novembre: 10, dic: 11, dicembre: 11,
}

const MUSCLE_WORDS: Array<[RegExp, Muscle]> = [
  [/\b(?:petto|chest)\b/i, 'chest'], [/\b(?:dorso|schiena|back)\b/i, 'back'],
  [/\b(?:spalle|spalla|shoulders?)\b/i, 'shoulders'], [/\b(?:gambe|legs?)\b/i, 'legs'],
  [/\b(?:bicipiti|biceps?)\b/i, 'biceps'], [/\b(?:tricipiti|triceps?)\b/i, 'triceps'],
  [/\b(?:core|addominali|abs?)\b/i, 'core'],
]

function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { cell += '"'; index += 1 }
      else if (character === '"') quoted = false
      else cell += character
    } else if (character === '"') quoted = true
    else if (character === ',') { row.push(cell); cell = '' }
    else if (character === '\n') { row.push(cell); rows.push(row); row = []; cell = '' }
    else if (character !== '\r') cell += character
  }
  if (quoted) return []
  if (cell || row.length) { row.push(cell); rows.push(row) }
  const headers = rows.shift()?.map((header) => header.trim()) ?? []
  return rows.filter((values) => values.some(Boolean)).map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])))
}

function parseNumber(value: string): number | null {
  const number = Number(value.replace(',', '.'))
  return value.trim() === '' || !Number.isFinite(number) ? null : number
}

function parseDate(value: string): string | null {
  const match = value.trim().match(/^(\d{1,2})\s+([^\s]+)\s+(\d{4}),\s*(\d{1,2}):(\d{2})$/i)
  if (!match) return null
  const month = MONTHS[match[2]!.toLocaleLowerCase('it')]
  if (month === undefined) return null
  const date = new Date(Number(match[3]), month, Number(match[1]), Number(match[4]), Number(match[5]))
  return date.getFullYear() !== Number(match[3]) || date.getMonth() !== month || date.getDate() !== Number(match[1])
    || date.getHours() !== Number(match[4]) || date.getMinutes() !== Number(match[5]) ? null : date.toISOString()
}

function focusMuscles(title: string, exerciseIds: string[]): Muscle[] {
  const result: Muscle[] = []
  for (const [pattern, muscle] of MUSCLE_WORDS) if (pattern.test(title) && !result.includes(muscle)) result.push(muscle)
  for (const id of exerciseIds) {
    const muscle = getExercise(id).muscles[0]
    if (!result.includes(muscle)) result.push(muscle)
  }
  return result.length ? result : ['chest']
}

function safeName(value: string): string {
  return value.trim() || 'Allenamento importato'
}

function createPlan(sessionId: string, name: string, startedAt: string, settingsMuscles: Muscle[], entries: Array<{ id: string; name: string; rows: CsvRow[] }>): { plan: WorkoutPlan; logs: SetLog[] } {
  const logs: SetLog[] = []
  // Split long entries to respect the plan-item limit without discarding source sets.
  const exercises: PlanExercise[] = entries.flatMap(({ id, name: sourceName, rows }, entryIndex) => Array.from({ length: Math.ceil(rows.length / 12) }, (_, chunk) => {
    const sourceRows = rows.slice(chunk * 12, (chunk + 1) * 12)
    const entryId = `imported-exercise-${entryIndex}-${chunk}`
    sourceRows.forEach((row, setIndex) => {
      const rpe = parseNumber(row.rpe)
      const sourceSetIndex = parseNumber(row.set_index ?? '')
      logs.push({
        id: `${sessionId}-${entryId}-${setIndex}`, planExerciseId: entryId, setIndex,
        sourceSetIndex: sourceSetIndex !== null && Number.isInteger(sourceSetIndex) && sourceSetIndex >= 0 ? sourceSetIndex : chunk * 12 + setIndex,
        weight: parseNumber(row.weight_kg), reps: parseNumber(row.reps)!,
        rir: rpe === null ? null : 10 - rpe, completedAt: startedAt,
      })
    })
    const reps = sourceRows.map((row) => parseNumber(row.reps)).filter((value): value is number => value !== null && Number.isInteger(value) && value > 0)
    const loads = sourceRows.map((row) => parseNumber(row.weight_kg)).filter((value): value is number => value !== null && value >= 0)
    const rirs = sourceRows.map((row) => {
      const rpe = parseNumber(row.rpe)
      return rpe === null ? null : Math.max(0, Math.min(5, 10 - rpe))
    }).filter((value): value is number => value !== null)
    const repMin = Math.max(1, Math.min(...reps.length ? reps : [1]))
    const repMax = Math.max(repMin, Math.max(...reps, repMin))
    const restSeconds = Math.max(minimumRestSeconds({
      id: `imported-${id}`, exerciseId: id, sets: sourceRows.length, repMin, repMax,
      restSeconds: 90, rir: rirs.length ? Math.min(...rirs) : 2, targetLoad: null,
    }), 60)
    return {
      id: entryId, exerciseId: id, sourceExerciseName: sourceName, sets: sourceRows.length,
      repMin, repMax, restSeconds, rir: rirs.length ? Math.round((rirs.reduce((sum, value) => sum + value, 0) / rirs.length) * 2) / 2 : 2,
      targetLoad: loads.length ? loads[loads.length - 1]! : null,
    }
  }))
  const plan: WorkoutPlan = {
    id: `plan-${sessionId}`,
    name: safeName(name),
    createdAt: startedAt,
    settings: {
      ...structuredClone(DEFAULT_SETTINGS), minutes: 180, muscles: settingsMuscles,
      goal: 'hypertrophy', level: 'advanced', equipment: 'gym',
    },
    exercises, warmupSeconds: 300, reserveSeconds: 90,
  }
  return { plan, logs }
}

export function importWorkoutCsv(text: string): CsvImportResult {
  const rows = parseCsv(text)
  const required = ['title', 'start_time', 'end_time', 'exercise_title', 'set_type', 'weight_kg', 'reps', 'rpe']
  if (!rows.length || required.some((key) => !Object.hasOwn(rows[0]!, key))) {
    return { data: null, importedSessions: 0, importedSets: 0, skippedSessions: 0, skippedExercises: [], skippedRows: 0, error: 'CSV non riconosciuto: servono le colonne di un export di allenamenti.' }
  }
  const groups = new Map<string, CsvRow[]>()
  for (const row of rows) {
    const key = `${row.title}\u0000${row.start_time}\u0000${row.end_time}`
    const group = groups.get(key) ?? []
    group.push(row)
    groups.set(key, group)
  }
  const skippedExercises = new Set<string>()
  const sessions: WorkoutSession[] = []
  let skippedRows = 0
  for (const [key, group] of groups) {
    const [title, startValue, endValue] = key.split('\u0000')
    const startedAt = parseDate(startValue ?? '')
    const endedAt = parseDate(endValue ?? '')
    if (!startedAt || !endedAt || Date.parse(endedAt) < Date.parse(startedAt)) { skippedRows += group.length; continue }
    const byExercise = new Map<string, CsvRow[]>()
    for (const row of group) {
      if (row.set_type === 'warmup') { skippedRows += 1; continue }
      const mapped = Object.hasOwn(CSV_EXERCISE_MAP, row.exercise_title) ? CSV_EXERCISE_MAP[row.exercise_title] : undefined
      const reps = parseNumber(row.reps)
      const weight = parseNumber(row.weight_kg)
      const rpe = parseNumber(row.rpe)
      if (!mapped || !reps || !Number.isInteger(reps) || reps < 1
        || (row.weight_kg.trim() !== '' && (weight === null || weight < 0))
        || (row.rpe.trim() !== '' && (rpe === null || rpe < 0 || rpe > 10))) {
        if (row.exercise_title) skippedExercises.add(row.exercise_title)
        skippedRows += 1
        continue
      }
      const exerciseRows = byExercise.get(row.exercise_title) ?? []
      exerciseRows.push(row)
      byExercise.set(row.exercise_title, exerciseRows)
    }
    if (!byExercise.size) continue
    const entries = [...byExercise].map(([name, rows]) => ({ id: CSV_EXERCISE_MAP[name], name, rows }))
    const exerciseIds = entries.map((entry) => entry.id)
    const muscles = focusMuscles(title ?? '', exerciseIds)
    const sessionId = `hevy-session-${encodeURIComponent(key)}`
    const { plan, logs } = createPlan(sessionId, title ?? '', startedAt, muscles, entries)
    sessions.push({ id: sessionId, plan, startedAt, finishedAt: endedAt, logs, importSource: { format: 'hevy-csv', mappingVersion: 2, key } })
  }
  if (!sessions.length) {
    return { data: null, importedSessions: 0, importedSets: 0, skippedSessions: groups.size, skippedExercises: [...skippedExercises], skippedRows, error: 'Nessuna seduta importabile: non sono state riconosciute serie allenanti con date valide.' }
  }
  const importedSets = sessions.reduce((sum, session) => sum + session.logs.length, 0)
  const data: AppData = { version: 3, settings: structuredClone(DEFAULT_SETTINGS), draft: null, active: null, history: sessions, restEndsAt: null, routines: [], routineHistoryInitialized: false }
  if (!isAppData(data)) return { data: null, importedSessions: 0, importedSets: 0, skippedSessions: groups.size, skippedExercises: [...skippedExercises], skippedRows, error: 'Il CSV supera i limiti del modello storico. Nessun dato e stato importato.' }
  return { data, importedSessions: sessions.length, importedSets, skippedSessions: groups.size - sessions.length, skippedExercises: [...skippedExercises], skippedRows, error: null }
}
