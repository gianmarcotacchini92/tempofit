import { DEFAULT_SETTINGS, getExercise, minimumRestSeconds } from './domain.ts'
import type { Muscle, PlanExercise, SetLog, WorkoutPlan, WorkoutSession } from './domain.ts'
import type { AppData } from './storage.ts'

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

// The export comes from Hevy and contains more variants than the TempoFit catalog.
// Mappings stay explicit so an unknown movement is reported instead of guessed.
const EXERCISE_MAP: Record<string, string> = {
  'Bench Press (Barbell)': 'barbell-bench',
  'Bench Press (Dumbbell)': 'db-flat-bench-press',
  'Chest Press (Machine)': 'barbell-bench',
  'Iso-Lateral Chest Press': 'barbell-bench',
  'Iso-Lateral Chest Press (Machine)': 'barbell-bench',
  'Decline Bench Press (Machine)': 'barbell-bench',
  'Incline Bench Press (Barbell)': 'db-incline-press',
  'Incline Bench Press (Dumbbell)': 'db-incline-press',
  'Chest Fly (Dumbbell)': 'db-floor-fly',
  'Chest Fly (Machine)': 'cable-fly',
  'Cable Fly Crossovers': 'cable-fly',
  'Chest Dip': 'chest-dip',
  'Push Up': 'push-up',
  'Pull Up': 'pull-up',
  'Pull Up (Band)': 'pull-up',
  'Lat Pulldown (Cable)': 'lat-pulldown',
  'Lat Pulldown (Machine)': 'lat-pulldown',
  'Lat Pulldown - Close Grip (Cable)': 'close-grip-lat-pulldown',
  'Single Arm Lat Pulldown': 'lat-pulldown',
  'T Bar Row': 'barbell-row',
  'Landmine Row': 'barbell-row',
  'Dumbbell Row': 'db-row',
  'Seated Cable Row - Bar Grip': 'cable-row',
  'Seated Cable Row - Bar Wide Grip': 'cable-row',
  'Seated Cable Row - V Grip (Cable)': 'cable-row',
  'Seated Row (Machine)': 'cable-row',
  'Iso-Lateral Row (Machine)': 'cable-row',
  'Iso-Lateral Low Row': 'cable-row',
  'Straight Arm Lat Pulldown (Cable)': 'cable-straight-arm-pulldown',
  'Rope Straight Arm Pulldown': 'cable-straight-arm-pulldown',
  'Squat (Barbell)': 'barbell-squat',
  'Hack Squat (Machine)': 'leg-press',
  'Leg Press (Machine)': 'leg-press',
  'Single Leg Press (Machine)': 'leg-press',
  'Bulgarian Split Squat (Dumbbell)': 'db-reverse-lunge',
  'Lunge (Dumbbell)': 'db-reverse-lunge',
  'Curtsy Lunge (Dumbbell)': 'db-reverse-lunge',
  'Romanian Deadlift (Barbell)': 'barbell-rdl',
  'Romanian Deadlift (Dumbbell)': 'db-rdl',
  'Lying Leg Curl (Machine)': 'seated-leg-curl',
  'Seated Leg Curl (Machine)': 'seated-leg-curl',
  'Standing Leg Curls': 'seated-leg-curl',
  'Leg Extension (Machine)': 'leg-extension',
  'Single Leg Extensions': 'leg-extension',
  'Wall Sit': 'bodyweight-squat',
  'Overhead Press (Barbell)': 'barbell-overhead-press',
  'Shoulder Press (Dumbbell)': 'db-overhead-press',
  'Arnold Press (Dumbbell)': 'db-overhead-press',
  'Seated Lateral Raise (Dumbbell)': 'db-lateral-raise',
  'Lateral Raise (Dumbbell)': 'db-lateral-raise',
  'Single Arm Lateral Raise (Cable)': 'db-lateral-raise',
  'Reverse Fly Single Arm (Cable)': 'db-reverse-fly',
  'Rear Delt Reverse Fly (Dumbbell)': 'db-reverse-fly',
  'Face Pull': 'db-reverse-fly',
  'EZ Bar Biceps Curl': 'db-curl',
  'Bicep Curl (Dumbbell)': 'db-curl',
  'Seated Incline Curl (Dumbbell)': 'db-curl',
  'Concentration Curl': 'db-curl',
  'Behind the Back Curl (Cable)': 'db-curl',
  'Preacher Curl (Dumbbell)': 'db-preacher-curl',
  'Spider Curl (Dumbbell)': 'db-preacher-curl',
  'Hammer Curl (Dumbbell)': 'db-hammer-curl',
  'Triceps Rope Pushdown': 'cable-triceps',
  'Triceps Kickback (Cable)': 'cable-triceps',
  'Overhead Triceps Extension (Cable)': 'db-triceps-extension',
  'Skullcrusher (Dumbbell)': 'db-triceps-extension',
  'Single Arm Tricep Extension (Dumbbell)': 'db-triceps-extension',
  'Cable Crunch': 'reverse-crunch',
  'Decline Crunch (Weighted)': 'reverse-crunch',
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
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
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

function createPlan(name: string, startedAt: string, settingsMuscles: Muscle[], entries: Array<{ id: string; rows: CsvRow[] }>): WorkoutPlan {
  const exercises: PlanExercise[] = entries.map(({ id, rows: sourceRows }) => {
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
      id: `imported-exercise-${id}`, exerciseId: id, sets: Math.min(12, sourceRows.length),
      repMin, repMax, restSeconds, rir: rirs.length ? Math.round((rirs.reduce((sum, value) => sum + value, 0) / rirs.length) * 2) / 2 : 2,
      targetLoad: loads.length ? loads[loads.length - 1]! : null,
    }
  })
  return {
    id: `imported-plan-${startedAt}`,
    name: safeName(name),
    createdAt: startedAt,
    settings: {
      ...structuredClone(DEFAULT_SETTINGS), minutes: 180, muscles: settingsMuscles,
      goal: 'hypertrophy', level: 'advanced', equipment: 'gym',
    },
    exercises, warmupSeconds: 300, reserveSeconds: 90,
  }
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
    if (!startedAt || !endedAt) { skippedRows += group.length; continue }
    const byExercise = new Map<string, CsvRow[]>()
    for (const row of group) {
      if (row.set_type === 'warmup') { skippedRows += 1; continue }
      const mapped = EXERCISE_MAP[row.exercise_title]
      const reps = parseNumber(row.reps)
      if (!mapped || !reps || !Number.isInteger(reps) || reps < 1) {
        if (row.exercise_title) skippedExercises.add(row.exercise_title)
        skippedRows += 1
        continue
      }
      const exerciseRows = byExercise.get(mapped) ?? []
      exerciseRows.push(row)
      byExercise.set(mapped, exerciseRows)
    }
    if (!byExercise.size) continue
    const exerciseIds = [...byExercise.keys()]
    const muscles = focusMuscles(title ?? '', exerciseIds)
    const plan = createPlan(title ?? '', startedAt, muscles, exerciseIds.map((id) => ({ id, rows: byExercise.get(id)! })))
    const logs: SetLog[] = []
    for (const item of plan.exercises) {
      const sourceRows = byExercise.get(item.exerciseId)!
      sourceRows.slice(0, item.sets).forEach((row, setIndex) => {
        const rpe = parseNumber(row.rpe)
        logs.push({
          id: `imported-log-${startedAt}-${item.id}-${setIndex}`,
          planExerciseId: item.id, setIndex,
          weight: parseNumber(row.weight_kg),
          reps: Number(row.reps),
          rir: rpe === null ? null : Math.max(0, Math.min(10, 10 - rpe)),
          completedAt: startedAt,
        })
      })
    }
    sessions.push({ id: `imported-session-${startedAt}`, plan, startedAt, finishedAt: endedAt, logs })
  }
  if (!sessions.length) {
    return { data: null, importedSessions: 0, importedSets: 0, skippedSessions: groups.size, skippedExercises: [...skippedExercises], skippedRows, error: 'Nessuna seduta importabile: non sono state riconosciute serie allenanti con date valide.' }
  }
  const importedSets = sessions.reduce((sum, session) => sum + session.logs.length, 0)
  const data: AppData = { version: 2, settings: structuredClone(DEFAULT_SETTINGS), draft: null, active: null, history: sessions, restEndsAt: null }
  return { data, importedSessions: sessions.length, importedSets, skippedSessions: groups.size - sessions.length, skippedExercises: [...skippedExercises], skippedRows, error: null }
}
