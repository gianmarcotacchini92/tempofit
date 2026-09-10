import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_SETTINGS, generatePlan, getExercise, estimateExerciseSeconds, estimatePlanSeconds,
  intensityOptions, supersetCandidates, workoutSetSteps, validatePlan, minimumRestSeconds,
  suggestLoad, getSubstitutions,
} from './domain.ts'
import { emptyData, decodeData, isAppData, loadData } from './storage.ts'
import { estimatedOneRepMax, progressPoints } from './progress.ts'

const date = '2026-08-01T10:00:00.000Z'
const settings = (changes = {}) => ({ ...structuredClone(DEFAULT_SETTINGS), minutes: 90, goal: 'hypertrophy', muscles: ['chest', 'biceps', 'triceps'], ...changes })
const item = (exerciseId, changes = {}) => ({
  id: exerciseId, exerciseId, sets: 3, repMin: 10, repMax: 15, restSeconds: 75,
  rir: 2, targetLoad: null, ...changes,
})
const anchor = () => item('db-floor-press', { repMin: 8, repMax: 12, restSeconds: 120 })
const plan = (items = [anchor(), item('db-curl'), item('cable-triceps')], changes = {}) => ({
  id: 'plan', name: 'Intensity test', createdAt: date, settings: settings(),
  exercises: items, warmupSeconds: 300, reserveSeconds: 90, ...changes,
})
const log = (entry, setIndex, changes = {}) => ({
  id: `${entry.id}-${setIndex}`, planExerciseId: entry.id, setIndex, weight: 40, reps: 15,
  rir: 2, completedAt: date, ...changes,
})
const session = (workout, day = 1) => ({
  id: `session-${day}`, plan: workout, startedAt: `2026-08-${String(day).padStart(2, '0')}T09:00:00.000Z`,
  finishedAt: `2026-08-${String(day).padStart(2, '0')}T11:00:00.000Z`,
  logs: workout.exercises.flatMap((entry) => Array.from({ length: entry.sets }, (_, index) =>
    log(entry, index, { completedAt: `2026-08-${String(day).padStart(2, '0')}T10:00:00.000Z` }))),
})
const data = (workout) => ({ ...emptyData(), draft: workout, history: [session(workout)] })
const pair = () => plan([anchor(), item('db-curl', { supersetGroup: 'pair' }), item('cable-triceps', { supersetGroup: 'pair', restSeconds: 120 })])
const extended = (technique = 'drop-set') => {
  const result = data(plan([anchor(), item('db-curl'), item('cable-triceps', { sets: 2, technique })]))
  const entry = result.history[0].plan.exercises[2]
  result.history[0].logs.push(log(entry, 1, {
    id: 'mini', part: technique === 'drop-set' ? 'drop' : 'rest-pause', weight: 30, reps: 8,
    completedAt: '2026-08-01T10:01:00.000Z',
  }))
  return result
}

test('default and explicit OFF retain traditional prescriptions and exact settings snapshots', () => {
  const request = settings({ minutes: 45 })
  const missing = generatePlan(request)
  const off = generatePlan({ ...request, optimizeTime: false })
  const comparable = (workout) => workout.exercises.map(({ id: _id, ...entry }) => entry)
  assert.deepEqual(comparable(missing.plan), comparable(off.plan))
  assert.equal(missing.message, off.message)
  assert.equal(Object.hasOwn(missing.plan.settings, 'optimizeTime'), false)
  assert.equal(Object.hasOwn(DEFAULT_SETTINGS, 'optimizeTime'), false)
  for (const result of [missing, off]) {
    assert.ok(result.plan.exercises.every((entry) => !entry.technique && !entry.supersetGroup))
    assert.ok(workoutSetSteps(result.plan).every((step) => !step.part))
  }
  const stored = JSON.stringify(data(missing.plan))
  assert.equal(JSON.stringify(decodeData(JSON.parse(stored)).data), stored)
})

test('manual eligibility is opt-in independent, conservative, and protects the first focus anchor', () => {
  const workout = plan()
  assert.deepEqual(intensityOptions(workout, workout.exercises[1]), ['drop-set', 'rest-pause'])
  for (const exerciseId of ['barbell-bench', 'barbell-row', 'leg-press', 'db-one-arm-row', 'db-preacher-curl', 'db-triceps-extension', 'db-reverse-fly', 'push-up', 'pull-up', 'db-floor-fly']) {
    const unsafe = item(exerciseId, { id: 'unsafe', restSeconds: 120 })
    assert.deepEqual(intensityOptions(plan([anchor(), unsafe]), unsafe), [], exerciseId)
  }
  const focus = item('db-curl')
  assert.deepEqual(intensityOptions(plan([focus], { settings: settings({ muscles: ['biceps'] }) }), focus), [])
  for (const change of [{ repMax: 8 }, { repMin: 5 }, { rir: 0 }, { restSeconds: 30 }, { supersetGroup: 'x' }]) {
    const unsafe = item('cable-triceps', change)
    assert.deepEqual(intensityOptions(plan([anchor(), unsafe]), unsafe), [])
  }
  const isolated = item('leg-extension')
  assert.deepEqual(intensityOptions(plan([anchor(), isolated]), isolated), ['drop-set', 'rest-pause'])
  assert.deepEqual(intensityOptions(workout, item('not-in-plan')), [])
})

test('beginner, strength and longer plans remain traditional with an honest generated explanation', () => {
  for (const changes of [{ level: 'beginner' }, { goal: 'strength' }, { minutes: 60 }, { minutes: 90 }]) {
    const request = settings({ minutes: 45, optimizeTime: true, ...changes })
    const result = generatePlan(request)
    assert.ok(result.plan, result.message)
    assert.ok(result.plan.exercises.every((entry) => !entry.technique && !entry.supersetGroup))
    assert.match(result.message, /Ottimizza il tempo:.*tradizionali/)
    if (request.level === 'beginner' || request.goal === 'strength') {
      for (const entry of result.plan.exercises) {
        assert.deepEqual(intensityOptions(result.plan, entry), [])
        assert.deepEqual(supersetCandidates(result.plan, entry), [])
      }
    }
  }
  const unsupported = generatePlan(settings({ optimizeTime: true, minutes: 20, muscles: ['chest'], equipment: 'bodyweight' }))
  assert.ok(unsupported.plan)
  assert.match(unsupported.message, /nessun blocco compatibile.*risparmio reale/)
})

test('extensions charge upper-bound work, logging, preparation and change/rest without fabricated volume', () => {
  const original = item('cable-triceps')
  const drop = { ...original, sets: 2, technique: 'drop-set' }
  const rp = { ...original, sets: 2, technique: 'rest-pause' }
  const exercise = getExercise(original.exerciseId)
  assert.equal(estimateExerciseSeconds(original), 35 + 45 + 3 * (15 * 3 + 12) + 2 * 75)
  assert.equal(estimateExerciseSeconds(drop) - estimateExerciseSeconds({ ...drop, technique: undefined }), 10 + 20 + 10 * exercise.secondsPerRep + 12)
  assert.equal(estimateExerciseSeconds(rp) - estimateExerciseSeconds({ ...rp, technique: undefined }), 20 + 5 * exercise.secondsPerRep + 12)
  assert.equal(estimateExerciseSeconds(original) - estimateExerciseSeconds(drop), 60)
  assert.equal(estimateExerciseSeconds(original) - estimateExerciseSeconds(rp), 85)
  assert.equal(estimatePlanSeconds(plan([anchor(), original])) - estimatePlanSeconds(plan([anchor(), drop])), 60)
  for (const entry of [drop, rp]) {
    const steps = workoutSetSteps(plan([anchor(), entry])).filter((step) => step.item.id === entry.id)
    assert.deepEqual(steps.map((step) => [step.setIndex, step.part, step.restAfterSeconds]), [
      [0, undefined, 75], [1, undefined, 20], [1, entry.technique === 'drop-set' ? 'drop' : 'rest-pause', 0],
    ])
    assert.deepEqual(steps.slice(-1).map(({ repMin, repMax, rir }) => [repMin, repMax, rir]), [entry === drop ? [6, 10, 2] : [3, 5, 2]])
  }
})

test('pairs interleave adjacent exercises and charge actual transitions and maximum round rests', () => {
  const workout = pair()
  assert.deepEqual(validatePlan(workout), [])
  assert.equal(isAppData(data(workout)), true)
  const traditional = structuredClone(workout)
  traditional.exercises.forEach((entry) => { delete entry.supersetGroup })
  assert.equal(estimateExerciseSeconds(workout.exercises[1]), estimateExerciseSeconds(traditional.exercises[1]))
  assert.equal(estimatePlanSeconds(traditional) - estimatePlanSeconds(workout), 2 * 75 + 45 - 3 * 30)
  const pairedSteps = workoutSetSteps(workout).slice(3)
  assert.deepEqual(pairedSteps.map((step) => [step.item.exerciseId, step.setIndex, step.restAfterSeconds]), [
    ['db-curl', 0, 30], ['cable-triceps', 0, 120],
    ['db-curl', 1, 30], ['cable-triceps', 1, 120],
    ['db-curl', 2, 30], ['cable-triceps', 2, 0],
  ])
  const restored = decodeData(JSON.parse(JSON.stringify(data(workout)))).data
  assert.deepEqual(workoutSetSteps(restored.draft), workoutSetSteps(workout))
  const workAndLogging = workoutSetSteps(workout).reduce((sum, step) => sum + step.repMax * getExercise(step.item.exerciseId).secondsPerRep + 12 + step.restAfterSeconds, 0)
  const setups = workout.exercises.reduce((sum, entry) => sum + getExercise(entry.exerciseId).setupSeconds + getExercise(entry.exerciseId).rampSeconds, 0)
  assert.equal(estimatePlanSeconds(workout), 390 + workAndLogging + setups + 45)
})

test('normal rests and round rests respect user minima; extension and pair transitions remain explicit exceptions', () => {
  const workout = pair()
  workout.settings.minRestSeconds = 180
  workout.exercises.forEach((entry) => { entry.restSeconds = 180 })
  assert.deepEqual(validatePlan(workout), [])
  const steps = workoutSetSteps(workout)
  assert.equal(steps[0].restAfterSeconds, 180)
  assert.equal(steps[3].restAfterSeconds, 30)
  assert.equal(steps[4].restAfterSeconds, 180)
  assert.ok(workout.exercises.every((entry) => entry.restSeconds >= minimumRestSeconds(entry)))
  workout.exercises[1].restSeconds = 120
  assert.ok(validatePlan(workout).some((message) => message.includes('180 secondi')))
  assert.equal(isAppData(data(workout)), false)
})

test('advanced block exits have full timed recovery and count the exercise transition exactly once', () => {
  for (const technique of ['drop-set', 'rest-pause']) {
    const workout = plan([anchor(), item('db-curl', { sets: 2, restSeconds: 90, technique }), item('cable-triceps')])
    const steps = workoutSetSteps(workout)
    const mini = steps.find((step) => step.part)
    assert.equal(mini.restAfterSeconds, 90)
    const unpairedEstimate = workout.exercises.reduce((sum, entry) => sum + estimateExerciseSeconds(entry), 0)
    assert.equal(estimatePlanSeconds(workout), 390 + unpairedEstimate + 45 + 90)
    assert.equal(steps[2].restAfterSeconds, 0, 'Traditional exercise exits retain their existing timer behavior')
    assert.deepEqual(workoutSetSteps(decodeData(JSON.parse(JSON.stringify(data(workout)))).data.draft), steps)
  }
  const workout = pair()
  workout.exercises.push(item('db-lateral-raise'))
  const steps = workoutSetSteps(workout)
  assert.equal(steps[8].item.exerciseId, 'cable-triceps')
  assert.equal(steps[8].restAfterSeconds, 120)
  const workAndLogging = steps.reduce((sum, step) => sum + step.repMax * getExercise(step.item.exerciseId).secondsPerRep + 12 + step.restAfterSeconds, 0)
  const setups = workout.exercises.reduce((sum, entry) => sum + getExercise(entry.exerciseId).setupSeconds + getExercise(entry.exerciseId).rampSeconds, 0)
  assert.equal(estimatePlanSeconds(workout), 390 + workAndLogging + setups + 45)
  workout.settings.minRestSeconds = 180
  workout.exercises.forEach((entry) => { entry.restSeconds = 180 })
  assert.equal(workoutSetSteps(workout)[8].restAfterSeconds, 180)
  assert.equal(isAppData(data(workout)), true)
})

test('partial or corrected supersets remain valid stored facts without requiring contiguous logs', () => {
  const workout = pair()
  const value = data(workout)
  const original = value.history[0].logs
  value.history[0].logs = [original[6], original[4], original[8], original[3]]
  value.history[0].logs.at(-1).completedAt = '2026-08-01T10:05:00.000Z'
  const before = JSON.stringify(value)
  assert.equal(isAppData(value), true)
  assert.equal(JSON.stringify(decodeData(JSON.parse(before)).data), before)
  value.history[0].logs.splice(1, 1)
  assert.equal(isAppData(value), true, 'Undoing an earlier ordinary A set need not delete later recorded B sets')
})

test('pair candidates cannot reorder, compete, stack, use two stations or steal another group', () => {
  const workout = plan([anchor(), item('db-curl'), item('cable-triceps'), item('db-lateral-raise')])
  assert.deepEqual(supersetCandidates(workout, workout.exercises[1]).map((entry) => entry.id), ['cable-triceps'])
  assert.deepEqual(supersetCandidates(workout, workout.exercises[2]).map((entry) => entry.id), ['db-curl', 'db-lateral-raise'])
  for (const changes of [
    (value) => { value.exercises[2].sets = 2 },
    (value) => { value.exercises[2].technique = 'drop-set' },
    (value) => { value.exercises[2].supersetGroup = 'another' },
    (value) => { value.exercises[2].exerciseId = 'db-hammer-curl' },
    (value) => { value.exercises[2].exerciseId = 'db-triceps-extension' },
    (value) => { value.exercises[1].exerciseId = 'cable-preacher-curl' },
  ]) {
    const invalid = structuredClone(workout)
    changes(invalid)
    assert.deepEqual(supersetCandidates(invalid, invalid.exercises[1]), [])
  }
  const nonadjacent = pair()
  nonadjacent.exercises.splice(2, 0, item('db-lateral-raise'))
  assert.ok(validatePlan(nonadjacent).some((message) => /adiacenti/.test(message)))
  assert.equal(isAppData(data(nonadjacent)), false)
})

test('manual substitution is filtered for techniques and orphaned pair edits fail validation', () => {
  const workout = extended().draft
  const target = workout.exercises[2]
  assert.ok(getSubstitutions(target, workout.settings).every((exercise) => exercise.id !== 'db-triceps-extension'))
  target.exerciseId = 'db-triceps-extension'
  assert.ok(validatePlan(workout).some((message) => /tecnica di intensità/.test(message)))
  assert.equal(isAppData(data(workout)), false)
  const changed = pair()
  changed.exercises[2].sets--
  assert.ok(validatePlan(changed).some((message) => /stesso numero/.test(message)))
  changed.exercises.pop()
  assert.ok(validatePlan(changed).some((message) => /adiacenti/.test(message)))
})

test('optional storage metadata and mini-set uniqueness round-trip without modifying actual logs', () => {
  for (const technique of ['drop-set', 'rest-pause']) {
    const value = extended(technique)
    value.settings.optimizeTime = false
    const before = JSON.stringify(value)
    assert.equal(isAppData(value), true)
    assert.equal(JSON.stringify(decodeData(JSON.parse(before)).data), before)
    const logs = value.history[0].logs
    assert.equal(logs.at(-2).setIndex, logs.at(-1).setIndex)
    assert.equal(logs.at(-2).weight, 40)
    assert.equal(logs.at(-1).weight, 30)
    assert.equal(logs.at(-1).completedAt, '2026-08-01T10:01:00.000Z')
  }
})

test('invalid optional types, unsafe prescriptions, malformed groups and forged extensions are rejected', () => {
  for (const change of [
    (value) => { value.settings.optimizeTime = 'true' },
    (value) => { value.draft.settings.optimizeTime = 1 },
    (value) => { value.draft.exercises[2].technique = 'stripping' },
    (value) => { value.draft.exercises[2].supersetGroup = '' },
    (value) => { value.draft.exercises[2].supersetGroup = 42 },
    (value) => { value.draft.exercises[2].repMin = 0 },
    (value) => { value.draft.exercises[2].repMax = 8 },
    (value) => { value.draft.exercises[2].rir = -1 },
    (value) => { value.draft.exercises[2].restSeconds = Infinity },
    (value) => { value.history[0].logs.at(-1).part = 'regular' },
    (value) => { value.history[0].logs.at(-1).part = 'rest-pause' },
    (value) => { value.history[0].logs.at(-1).setIndex = 0 },
    (value) => { value.history[0].logs.at(-1).planExerciseId = 'db-curl' },
    (value) => { value.history[0].logs.at(-1).completedAt = '2026-08-01T09:59:00.000Z' },
    (value) => { value.history[0].logs.at(-1).reps = 51 },
    (value) => { value.history[0].logs.splice(-2, 1) },
    (value) => { value.history[0].logs.unshift(value.history[0].logs.pop()) },
    (value) => { value.history[0].logs.push({ ...value.history[0].logs.at(-1), id: 'duplicate-mini' }) },
  ]) {
    const value = extended()
    change(value)
    assert.equal(isAppData(value), false, change.toString())
    assert.equal(decodeData(value), null)
  }
  for (const change of [
    (value) => { value.exercises[2].supersetGroup = 'other' },
    (value) => { value.exercises[0].supersetGroup = 'pair' },
    (value) => { value.exercises[1].technique = 'rest-pause' },
  ]) {
    const value = pair()
    change(value)
    assert.equal(isAppData(data(value)), false)
    assert.ok(validatePlan(value).length)
  }
})

test('invalid imports never overwrite existing local data', () => {
  const invalid = extended()
  invalid.history[0].logs.at(-1).part = 'forged'
  let writes = 0
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: () => JSON.stringify(invalid), setItem: () => { writes++ },
  } })
  try {
    assert.ok(loadData().error)
    assert.equal(writes, 0)
  } finally { delete globalThis.localStorage }
})

test('two advanced blocks is a session-wide cap, not a per-technique cap', () => {
  const workout = plan([anchor(), item('db-curl', { technique: 'rest-pause' }), item('cable-triceps', { technique: 'drop-set' }), item('db-lateral-raise'), item('leg-extension')])
  assert.deepEqual(intensityOptions(workout, workout.exercises[3]), [])
  assert.deepEqual(supersetCandidates(workout, workout.exercises[3]), [])
  workout.exercises[3].technique = 'rest-pause'
  assert.ok(validatePlan(workout).some((message) => /due blocchi/.test(message)))
  assert.equal(isAppData(data(workout)), false)
})

test('automatic optimization preserves coverage, priorities, budgets and source data across durations', () => {
  let optimizedCount = 0
  for (const minutes of [20, 30, 45, 60, 90]) {
    for (const muscles of [['chest', 'back'], ['chest', 'biceps', 'triceps'], ['legs', 'shoulders', 'biceps'], ['biceps', 'triceps']]) {
      for (const minRestSeconds of [0, 120]) {
        const request = settings({ minutes, muscles, minRestSeconds })
        const before = structuredClone(request)
        const traditional = generatePlan(request)
        const result = generatePlan({ ...request, optimizeTime: true })
        assert.deepEqual(request, before)
        assert.ok(result.plan, result.message)
        const workout = result.plan
        assert.deepEqual(validatePlan(workout), [])
        assert.ok(estimatePlanSeconds(workout) <= minutes * 60)
        assert.equal(workout.exercises.length, traditional.plan.exercises.length)
        workout.exercises.forEach((entry, index) => {
          const original = traditional.plan.exercises[index]
          if (entry.exerciseId === original.exerciseId) return
          assert.notEqual(index, 0)
          assert.match(result.message, /sostituito con/)
          const selectedPrimary = getExercise(original.exerciseId).muscles.filter((muscle) => muscles.includes(muscle))
          assert.ok(selectedPrimary.every((muscle) => getExercise(entry.exerciseId).muscles.includes(muscle)))
          assert.ok(getSubstitutions(original, request).some((exercise) => exercise.id === entry.exerciseId))
        })
        assert.deepEqual(workout.exercises[0].sets, traditional.plan.exercises[0].sets)
        assert.equal(workout.exercises[0].technique, undefined)
        assert.equal(workout.exercises[0].supersetGroup, undefined)
        assert.equal(workout.warmupSeconds, traditional.plan.warmupSeconds)
        assert.equal(workout.reserveSeconds, traditional.plan.reserveSeconds)
        const blocks = workout.exercises.filter((entry) => entry.technique).length + new Set(workout.exercises.filter((entry) => entry.supersetGroup).map((entry) => entry.supersetGroup)).size
        assert.ok(blocks <= 2)
        if (blocks) {
          optimizedCount++
          assert.ok(minutes <= 45)
          const saving = estimatePlanSeconds(traditional.plan) - estimatePlanSeconds(workout)
          assert.ok(saving > 0)
          assert.ok(result.message.includes(`${saving} secondi`))
          assert.match(result.message, /non equivale al suo volume/)
          workout.exercises.forEach((entry, index) => {
            if (entry.technique) assert.equal(entry.sets + 1, traditional.plan.exercises[index].sets)
          })
        } else assert.match(result.message, /nessun blocco compatibile|riservata alle sedute/)
        assert.equal(isAppData(data(workout)), true)
      }
    }
  }
  assert.ok(optimizedCount > 10)
})

test('the intermediate 30-minute arms request finds a useful stable accessory without touching its focus', () => {
  const request = settings({ minutes: 30, level: 'intermediate', equipment: 'gym', goal: 'hypertrophy', muscles: ['biceps', 'triceps'] })
  const traditional = generatePlan(request).plan
  const result = generatePlan({ ...request, optimizeTime: true })
  const optimized = result.plan
  assert.deepEqual(validatePlan(optimized), [])
  const first = ({ id: _id, ...entry }) => entry
  assert.deepEqual(first(optimized.exercises[0]), first(traditional.exercises[0]))
  assert.ok(optimized.exercises.some((entry) => entry.technique))
  assert.equal(optimized.exercises[1].exerciseId, 'cable-triceps')
  assert.equal(optimized.exercises[1].technique, 'drop-set')
  assert.equal(optimized.exercises[1].sets, traditional.exercises[1].sets - 1)
  assert.ok(estimatePlanSeconds(optimized) < estimatePlanSeconds(traditional))
  assert.ok(estimatePlanSeconds(optimized) <= 30 * 60)
  assert.match(result.message, /sostituito con.*il risparmio include anche questa variante/)
  assert.equal(isAppData(data(optimized)), true)
  const preferred = generatePlan({ ...request, optimizeTime: true, preferredIds: ['close-push-up'] })
  assert.ok(preferred.plan.exercises.some((entry) => entry.exerciseId === 'close-push-up'))
  assert.ok(preferred.plan.exercises.every((entry) => !entry.technique && !entry.supersetGroup))
})

test('the manual two-set fixture supports either curl extension or a curl/pushdown superset', () => {
  const workout = plan([
    item('barbell-bench', { sets: 2, repMin: 5, repMax: 8, restSeconds: 180 }),
    item('db-curl', { sets: 2, restSeconds: 90 }),
    item('cable-triceps', { sets: 2, restSeconds: 90 }),
  ])
  assert.deepEqual(intensityOptions(workout, workout.exercises[1]), ['drop-set', 'rest-pause'])
  assert.deepEqual(supersetCandidates(workout, workout.exercises[1]).map((entry) => entry.exerciseId), ['cable-triceps'])
  workout.exercises[1].supersetGroup = 'manual'
  workout.exercises[2].supersetGroup = 'manual'
  assert.deepEqual(validatePlan(workout), [])
  assert.deepEqual(workoutSetSteps(workout).slice(2).map((step) => [step.item.exerciseId, step.setIndex, step.restAfterSeconds]), [
    ['db-curl', 0, 30], ['cable-triceps', 0, 90], ['db-curl', 1, 30], ['cable-triceps', 1, 0],
  ])
  assert.equal(isAppData(data(workout)), true)
})

test('a suitable advanced short session automatically pairs accessories without rearranging priorities', () => {
  const request = settings({
    minutes: 30, level: 'advanced', muscles: ['chest', 'biceps', 'triceps'],
    preferredIds: ['db-curl', 'cable-triceps', 'db-lateral-raise'],
  })
  const traditional = generatePlan(request).plan
  const optimized = generatePlan({ ...request, optimizeTime: true }).plan
  assert.deepEqual(validatePlan(optimized), [])
  assert.deepEqual(optimized.exercises.map((entry) => entry.exerciseId), traditional.exercises.map((entry) => entry.exerciseId))
  assert.equal(optimized.exercises[0].supersetGroup, undefined)
  assert.ok(optimized.exercises[1].supersetGroup)
  assert.equal(optimized.exercises[1].supersetGroup, optimized.exercises[2].supersetGroup)
  assert.equal(estimatePlanSeconds(traditional) - estimatePlanSeconds(optimized), 105)
  assert.equal(isAppData(data(optimized)), true)
})

test('load suggestions ignore extensions and intensity exposures cannot trigger traditional progression', () => {
  const workout = plan()
  const old = session(workout, 1)
  const recent = session(workout, 2)
  assert.equal(suggestLoad('db-curl', [old, recent], 15, 2), 41)
  for (const flag of ['technique', 'supersetGroup']) {
    const advanced = structuredClone(recent)
    advanced.plan.exercises[1][flag] = flag === 'technique' ? 'rest-pause' : 'paired'
    assert.equal(suggestLoad('db-curl', [old, advanced], 15, 2), 40)
  }
  const mini = log(workout.exercises[1], 2, { id: 'mini', part: 'rest-pause', weight: 200, reps: 3, completedAt: '2026-08-02T10:30:00.000Z' })
  recent.logs.push(mini)
  assert.equal(suggestLoad('db-curl', [old, recent], 15, 2), 40)
  const miniOnly = { ...recent, logs: [mini] }
  assert.equal(suggestLoad('db-curl', [miniOnly], 15, 2), null)
  assert.equal(suggestLoad('db-curl', [old, session(workout, 2)], 15, 2, true, { ...workout.exercises[1], technique: 'rest-pause' }), 40)
  const history = [old, recent]
  const before = structuredClone(history)
  suggestLoad('db-curl', history, 15, 2)
  assert.deepEqual(history, before)
})

test('metrics retain actual extension weights and separate volumes but exclude mini-set 1RM', () => {
  const history = extended().history
  const entry = history[0].plan.exercises[2]
  history[0].logs.filter((value) => value.planExerciseId === entry.id && !value.part).forEach((value) => { value.reps = 10 })
  const mini = history[0].logs.at(-1)
  mini.weight = 100
  mini.reps = 5
  const before = structuredClone(history)
  const now = new Date('2026-09-01T12:00:00.000Z')
  const points = (metric) => progressPoints(history, entry.exerciseId, 'max', metric, now)
  assert.equal(points('weight')[0].value, 100)
  assert.equal(points('weight')[0].log.part, 'drop')
  assert.deepEqual(points('volume').map((point) => point.value), [400, 400, 500])
  assert.deepEqual(points('volume').map((point) => point.log.part), [undefined, undefined, 'drop'])
  assert.equal(points('oneRepMax')[0].log.part, undefined)
  assert.ok(Math.abs(points('oneRepMax')[0].value - 53.3333333333) < 0.001)
  assert.equal(estimatedOneRepMax(getExercise(entry.exerciseId), mini), null)
  assert.deepEqual(history, before)
})
