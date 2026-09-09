import test from 'node:test'
import assert from 'node:assert/strict'
import { importWorkoutCsv } from './csvImport.ts'
import { emptyData, isAppData, decodeData } from './storage.ts'
import { CSV_EXERCISE_MAP } from './csvExercises.ts'
import { EXERCISES, getExercise, needsCsvRepair, suggestLoad, generatePlan, DEFAULT_SETTINGS } from './domain.ts'
import { progressPoints } from './progress.ts'
import { repairCsvHistory } from './csvRepair.ts'

const header = 'title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe'
function row(exercise, weight = 40, index = 0, title = 'Seduta esempio') {
  return `"${title}","8 set 2026, 11:09","8 set 2026, 13:07","","${exercise}",,"",${index},"normal",${weight},8,,,8`
}
function legacySession(corrected) {
  const old = structuredClone(corrected)
  old.id = `imported-session-${old.startedAt}`
  delete old.importSource
  old.plan.exercises.forEach((item) => { item.exerciseId = 'barbell-bench'; delete item.sourceExerciseName })
  old.logs.forEach((log) => { delete log.sourceSetIndex })
  return old
}

test('imports Hevy CSV sessions, preserves RPE as conservative RIR and skips warmups', () => {
  const csv = [
    header,
    '"Dorso - Bicipiti","8 set 2026, 11:09","8 set 2026, 13:07","","Pull Up",,"",0,"warmup",,5,,,5',
    '"Dorso - Bicipiti","8 set 2026, 11:09","8 set 2026, 13:07","","Pull Up",,"",1,"normal",,7,,,9',
    '"Dorso - Bicipiti","8 set 2026, 11:09","8 set 2026, 13:07","","Bicep Curl (Dumbbell)",,"",0,"normal",13,10,,,8.5',
    '"Dorso - Bicipiti","8 set 2026, 11:09","8 set 2026, 13:07","","Mystery Movement",,"",0,"normal",20,10,,,8',
  ].join('\n')
  const result = importWorkoutCsv(csv)
  assert.equal(result.error, null)
  assert.equal(result.importedSessions, 1)
  assert.equal(result.importedSets, 2)
  assert.equal(result.skippedRows, 2)
  assert.deepEqual(result.skippedExercises, ['Mystery Movement'])
  assert.ok(result.data && isAppData(result.data))
  const session = result.data.history[0]
  assert.equal(session.plan.name, 'Dorso - Bicipiti')
  assert.deepEqual(session.plan.settings.muscles, ['back', 'biceps'])
  assert.deepEqual(session.plan.exercises.map((item) => item.exerciseId), ['pull-up', 'db-curl'])
  assert.equal(session.logs[0].rir, 1)
  assert.equal(session.logs[1].rir, 1.5)
  assert.equal(session.logs[1].weight, 13)
  assert.equal(session.startedAt, new Date(2026, 8, 8, 11, 9).toISOString())
  assert.equal(session.finishedAt, new Date(2026, 8, 8, 13, 7).toISOString())
  assert.equal(session.plan.exercises[0].sourceExerciseName, 'Pull Up')
  assert.equal(session.logs[0].sourceSetIndex, 1)
  assert.equal(session.importSource.mappingVersion, 2)
})

test('rejects malformed or non-importable CSV without producing partial app data', () => {
  assert.equal(importWorkoutCsv('title,start_time\nWorkout,not-a-date').data, null)
  const result = importWorkoutCsv([
    header,
    '"Cardio","8 set 2026, 11:09","8 set 2026, 11:30","","Treadmill",,"",0,"normal",,,"2",,""',
  ].join('\n'))
  assert.equal(result.data, null)
  assert.match(result.error, /Nessuna seduta importabile/)
})

test('decline machine press, flat machine press, barbell and dumbbell benches stay separate', () => {
  const names = ['Decline Bench Press (Machine)', 'Bench Press (Barbell)', 'Chest Press (Machine)', 'Incline Bench Press (Barbell)', 'Incline Bench Press (Dumbbell)']
  const result = importWorkoutCsv([header, ...names.map((name, index) => row(name, 100 - index * 10))].join('\n'))
  assert.equal(result.error, null)
  const session = result.data.history[0]
  assert.deepEqual(session.plan.exercises.map((item) => item.exerciseId), ['machine-decline-chest-press', 'barbell-bench', 'machine-chest-press', 'barbell-incline-bench', 'db-incline-press'])
  assert.deepEqual(session.plan.exercises.map((item) => item.sourceExerciseName), names)
  assert.equal(getExercise(session.plan.exercises[0].exerciseId).name, 'Chest press declinata alla macchina')
  const now = new Date(2026, 8, 9)
  assert.deepEqual(progressPoints(result.data.history, 'barbell-bench', 'max', 'weight', now).map((point) => point.value), [90])
  assert.deepEqual(progressPoints(result.data.history, 'machine-decline-chest-press', 'max', 'weight', now).map((point) => point.value), [100])
  assert.equal(suggestLoad('barbell-bench', importWorkoutCsv([header, row(names[0], 150)].join('\n')).data.history, 8, 2), null)
})

test('every explicit mapping has a real identity and retains its source name and weight', () => {
  const names = Object.keys(CSV_EXERCISE_MAP)
  const result = importWorkoutCsv([header, ...names.map((name, index) => row(name, index + 1, 0, `Exercise ${index}`))].join('\n'))
  assert.equal(result.error, null)
  assert.equal(result.importedSessions, names.length)
  assert.equal(new Set(result.data.history.map((session) => session.id)).size, names.length)
  result.data.history.forEach((session, index) => {
    assert.equal(session.plan.exercises[0].sourceExerciseName, names[index])
    assert.equal(session.logs[0].weight, index + 1)
    assert.equal(session.plan.exercises[0].exerciseId, getExercise(CSV_EXERCISE_MAP[names[index]]).id)
  })
  const ids = names.filter((name) => name !== 'Iso-Lateral Chest Press').map((name) => CSV_EXERCISE_MAP[name])
  assert.equal(new Set(ids).size, ids.length, 'Only the explicitly identical iso-lateral machine aliases may share an ID')
  assert.equal(new Set(EXERCISES.map((exercise) => exercise.id)).size, EXERCISES.length)
  assert.ok(isAppData(result.data))
  assert.deepEqual(decodeData(JSON.parse(JSON.stringify(result.data))).data, result.data)
  const malformed = structuredClone(result.data)
  malformed.history[0].importSource.mappingVersion = 99
  assert.equal(isAppData(malformed), false)
  malformed.history[0].importSource.mappingVersion = 2
  malformed.history[0].plan.exercises[0].sourceExerciseName = 123
  assert.equal(isAppData(malformed), false)
  const generated = generatePlan(DEFAULT_SETTINGS).plan
  assert.ok(generated)
  assert.ok(generated.exercises.every((item) => !getExercise(item.exerciseId).historyOnly))
})

test('sets are never truncated or pooled across source names and unsupported activities are not guessed', () => {
  const rows = Array.from({ length: 15 }, (_, index) => row('Decline Bench Press (Machine)', 100 - index, index))
  const result = importWorkoutCsv([header, ...rows, row('Bench Press (Barbell)'), row('Wall Sit'), row('Unknown press')].join('\n'))
  assert.equal(result.importedSets, 16)
  assert.equal(result.skippedRows, 2)
  assert.deepEqual(result.skippedExercises, ['Wall Sit', 'Unknown press'])
  assert.deepEqual(result.data.history[0].plan.exercises.map((item) => item.sets), [12, 3, 1])
  assert.equal(result.data.history[0].logs[14].sourceSetIndex, 14)
  assert.ok(isAppData(result.data))
  const aliases = importWorkoutCsv([header, row('Iso-Lateral Chest Press'), row('Iso-Lateral Chest Press (Machine)')].join('\n'))
  assert.equal(aliases.data.history[0].plan.exercises.length, 2)
  assert.equal(aliases.importedSets, 2)
})

test('repair replaces only matching legacy CSV sessions and preserves native work, settings and timer', () => {
  const imported = importWorkoutCsv([header, row('Decline Bench Press (Machine)', 120), row('Bench Press (Barbell)', 40)].join('\n'))
  const corrected = imported.data.history[0]
  const old = legacySession(corrected)
  const native = { ...structuredClone(old), id: 'native-session' }
  const unmatched = { ...structuredClone(old), id: 'imported-session-unmatched', plan: { ...old.plan, name: 'Different workout' } }
  const original = { ...emptyData(), history: [native, old, unmatched], draft: native.plan, active: { ...native, id: 'active', finishedAt: null }, restEndsAt: 123456789 }
  const snapshot = structuredClone(original)
  const result = repairCsvHistory(original, imported.data.history)
  assert.equal(result.error, null)
  assert.equal(result.correctedSessions, 1)
  assert.equal(result.remainingSessions, 1)
  assert.equal(result.restoredSets, 2)
  assert.equal(result.data.history.length, 3)
  assert.equal(result.data.history[0], native)
  assert.equal(result.data.history[1].id, old.id)
  assert.equal(needsCsvRepair(result.data.history[1]), false)
  assert.equal(result.data.history[1].plan.exercises[0].exerciseId, 'machine-decline-chest-press')
  assert.equal(result.data.history[2], unmatched)
  assert.equal(result.data.settings, original.settings)
  assert.equal(result.data.active, original.active)
  assert.equal(result.data.draft, original.draft)
  assert.equal(result.data.restEndsAt, original.restEndsAt)
  assert.deepEqual(original, snapshot)
  assert.ok(isAppData(result.data))
  assert.equal(repairCsvHistory(result.data, imported.data.history).data, null, 'Repeated repair cannot duplicate sessions')
})

test('repair rejects ambiguous or unrelated files and legacy mappings never enter progress or load suggestions', () => {
  const imported = importWorkoutCsv([header, row('Decline Bench Press (Machine)', 120)].join('\n'))
  const old = legacySession(imported.data.history[0])
  const data = { ...emptyData(), history: [old] }
  assert.equal(repairCsvHistory(data, []).data, null)
  assert.equal(repairCsvHistory(data, [old]).data, null)
  assert.equal(repairCsvHistory(data, [...imported.data.history, ...imported.data.history]).data, null)
  assert.equal(repairCsvHistory({ ...data, history: [old, ...imported.data.history] }, imported.data.history).data, null)
  const fewerSets = { ...imported.data.history[0], logs: [] }
  assert.equal(repairCsvHistory(data, [fewerSets]).data, null)
  assert.deepEqual(progressPoints([old], 'barbell-bench', 'max', 'weight', new Date(2026, 8, 9)), [])
  assert.equal(suggestLoad('barbell-bench', [old], 8, 2), null)
})
