import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SETTINGS, getExercise } from './domain.ts'
import { estimatedOneRepMax, progressPoints, progressStart } from './progress.ts'

const now = new Date(2026, 8, 9, 18)
function session(id, date, weights = [80, 70], exerciseId = 'barbell-bench') {
  return {
    id, startedAt: date.toISOString(), finishedAt: date.toISOString(),
    plan: { id, name: id, createdAt: date.toISOString(), settings: DEFAULT_SETTINGS, warmupSeconds: 0, reserveSeconds: 0,
      exercises: [{ id: 'entry', exerciseId, sets: weights.length, repMin: 1, repMax: 12, restSeconds: 120, rir: 2, targetLoad: 200 }] },
    logs: weights.map((weight, setIndex) => ({ id: `${id}-${setIndex}`, planExerciseId: 'entry', setIndex, weight, reps: setIndex === 0 ? 3 : 10, rir: 2, completedAt: date.toISOString() })),
  }
}

test('calendar ranges include the boundary day and clamp month ends and leap years', () => {
  assert.equal(progressStart('3m', now), new Date(2026, 5, 9).getTime())
  assert.equal(progressStart('6m', now), new Date(2026, 2, 9).getTime())
  assert.equal(progressStart('1y', now), new Date(2025, 8, 9).getTime())
  assert.equal(progressStart('max', now), -Infinity)
  assert.equal(progressStart('3m', new Date(2026, 4, 31)), new Date(2026, 1, 28).getTime())
  assert.equal(progressStart('1y', new Date(2024, 1, 29)), new Date(2023, 1, 28).getTime())
  const dates = [new Date(2026, 5, 8, 23, 59), new Date(2026, 5, 9), new Date(2026, 2, 9), new Date(2025, 8, 9), new Date(2024, 0, 1)]
  const history = dates.map((date, index) => session(String(index), date, [50]))
  assert.equal(progressPoints(history, 'barbell-bench', '3m', 'weight', now).length, 1)
  assert.equal(progressPoints(history, 'barbell-bench', '6m', 'weight', now).length, 3)
  assert.equal(progressPoints(history, 'barbell-bench', '1y', 'weight', now).length, 4)
  assert.equal(progressPoints(history, 'barbell-bench', 'max', 'weight', now).length, 5)
})

test('all recorded sets are chronological without a ten-session cap or source mutation', () => {
  const history = Array.from({ length: 25 }, (_, index) => session(String(index), new Date(2026, 7, index + 1))).reverse()
  history[0].logs.reverse()
  const original = structuredClone(history)
  const points = progressPoints(history, 'barbell-bench', '3m', 'weight', now)
  assert.equal(points.length, 50)
  assert.equal(points[0].sessionId, '0')
  assert.equal(points.at(-1).sessionId, '24')
  assert.deepEqual(points.slice(-2).map((point) => point.log.setIndex), [0, 1])
  assert.deepEqual(history, original)
  assert.deepEqual(progressPoints(history, 'db-curl', 'max', 'weight', now), [])
})

test('weight and volume use each actual set, not targets, totals, or substituted zeroes', () => {
  const history = [session('work', new Date(2026, 8, 1), [80, 70, null, 0])]
  assert.deepEqual(progressPoints(history, 'barbell-bench', 'max', 'weight', now).map((point) => point.value), [80, 70, 0])
  assert.deepEqual(progressPoints(history, 'barbell-bench', 'max', 'volume', now).map((point) => point.value), [240, 700, 0])
  assert.equal(progressPoints(history, 'barbell-bench', 'max', 'weight', now)[1].log.rir, 2)
})

test('1RM uses the best eligible Epley estimate, not the heaviest set', () => {
  const history = [session('work', new Date(2026, 8, 1))]
  const points = progressPoints(history, 'barbell-bench', 'max', 'oneRepMax', now)
  assert.equal(points.length, 1)
  assert.equal(points[0].log.weight, 70)
  assert.ok(Math.abs(points[0].value - 93.3333333333) < 0.001)
  const exercise = getExercise('barbell-bench')
  assert.equal(estimatedOneRepMax(exercise, { weight: 100, reps: 1 }), 100)
  assert.equal(estimatedOneRepMax(exercise, { weight: 100, reps: 11 }), null)
  assert.equal(estimatedOneRepMax(exercise, { weight: null, reps: 5 }), null)
  assert.equal(estimatedOneRepMax(exercise, { weight: 0, reps: 5 }), null)
  assert.equal(estimatedOneRepMax(getExercise('pull-up'), { weight: 20, reps: 5 }), null)
  assert.equal(estimatedOneRepMax(getExercise('push-up'), { weight: 20, reps: 5 }), null)
  history[0].logs.forEach((log) => { log.reps = 15 })
  assert.deepEqual(progressPoints(history, 'barbell-bench', 'max', 'oneRepMax', now), [])
  assert.equal(progressPoints(history, 'barbell-bench', 'max', 'weight', now).length, 2)
})

test('empty, unfinished, future and unlogged sessions do not invent points', () => {
  const unfinished = { ...session('active', new Date(2026, 8, 1)), finishedAt: null }
  const future = session('future', new Date(2027, 0, 1))
  const unlogged = { ...session('empty', new Date(2026, 8, 1)), logs: [] }
  assert.deepEqual(progressPoints([unfinished, future, unlogged], 'barbell-bench', 'max', 'weight', now), [])
})
