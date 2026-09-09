import test from 'node:test'
import assert from 'node:assert/strict'
import { importWorkoutCsv } from './csvImport.ts'
import { isAppData } from './storage.ts'

const header = 'title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe'

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
