import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_SETTINGS, EXERCISES, MUSCLE_LABELS, EQUIPMENT_LABELS, GOAL_LABELS,
  LEVEL_LABELS, PATTERN_LABELS, generatePlan, getExercise, estimateExerciseSeconds,
  estimatePlanSeconds, validatePlan, getSubstitutions, suggestLoad, minimumRestSeconds, planBudgetNote, isBodyweightExercise,
} from './domain.ts'

function settings(overrides = {}) {
  return {
    ...DEFAULT_SETTINGS, muscles: [...DEFAULT_SETTINGS.muscles],
    avoidedIds: [], preferredIds: [], avoidedPatterns: [], ...overrides,
  }
}

function item(exerciseId = 'barbell-bench', overrides = {}) {
  return {
    id: `item-${exerciseId}`, exerciseId, sets: 3, repMin: 3, repMax: 6,
    restSeconds: 180, rir: 2, targetLoad: null, ...overrides,
  }
}

function planFor(items, overrides = {}) {
  return {
    id: 'test-plan', name: 'Seduta di prova', createdAt: '2026-08-01T09:00:00.000Z',
    settings: settings({ minutes: 90, goal: 'strength', muscles: ['chest'] }),
    exercises: items, warmupSeconds: 300, reserveSeconds: 90, ...overrides,
  }
}

test('manual edits preserve recovery floors instead of squeezing work into the budget', () => {
  const heavy = item('barbell-bench', { restSeconds: 30 })
  assert.equal(minimumRestSeconds(heavy), 120)
  assert.ok(validatePlan(planFor([heavy])).some((error) => error.includes('120 secondi')))
  assert.equal(minimumRestSeconds(item('cable-row', { repMin: 8, repMax: 12 })), 90)
  assert.equal(minimumRestSeconds(item('push-up', { repMin: 8, repMax: 15 })), 60)
  assert.deepEqual(validatePlan(planFor([item('barbell-bench', { restSeconds: 120 })])), [])
})

function assertValid(result, request) {
  assert.ok(result.plan, result.message)
  const plan = result.plan
  assert.deepEqual(validatePlan(plan), [])
  assert.ok(estimatePlanSeconds(plan) <= request.minutes * 60, JSON.stringify(request))
  assert.ok(plan.warmupSeconds >= 300)
  assert.ok(plan.reserveSeconds >= 60)
  const primary = new Set(plan.exercises.flatMap((entry) => getExercise(entry.exerciseId).muscles))
  for (const muscle of request.muscles) assert.ok(primary.has(muscle), `Missing primary ${muscle}`)
  assert.ok(getExercise(plan.exercises[0].exerciseId).muscles.includes(request.muscles[0]), 'First muscle keeps priority')
  for (const entry of plan.exercises) {
    const exercise = getExercise(entry.exerciseId)
    assert.ok(exercise.equipment.includes(request.equipment))
    assert.ok(!request.avoidedIds.includes(exercise.id))
    assert.ok(!request.avoidedPatterns.includes(exercise.pattern))
    assert.ok(entry.sets >= 1)
    assert.ok(Number.isInteger(entry.sets))
    assert.ok(entry.repMin <= entry.repMax)
    if (request.level === 'beginner') assert.ok(entry.rir >= 3)
    if (isBodyweightExercise(exercise)) assert.equal(entry.targetLoad, null)
    assert.ok(entry.restSeconds >= (request.minRestSeconds ?? 0))
  }
  return plan
}

function exposure({
  day = 1, exerciseId = 'barbell-bench', sets = 3, weight = 100,
  repMin = 3, repMax = 6, rir = 2, restSeconds = 180,
} = {}) {
  const date = `2026-08-${String(day).padStart(2, '0')}`
  const prescription = item(exerciseId, { id: `item-${day}`, sets, repMin, repMax, rir, restSeconds, targetLoad: weight })
  return {
    id: `session-${day}`, plan: planFor([prescription]),
    startedAt: `${date}T09:00:00.000Z`,
    finishedAt: `${date}T10:00:00.000Z`,
    logs: Array.from({ length: sets }, (_, index) => ({
      id: `log-${day}-${index}`, planExerciseId: prescription.id, setIndex: index,
      weight, reps: repMax, rir, completedAt: `${date}T09:${String(5 + index * 3).padStart(2, '0')}:00.000Z`,
    })),
  }
}

test('catalogue has unique variants, Italian labels and explicit equipment compatibility', () => {
  assert.ok(EXERCISES.length >= 25)
  assert.equal(new Set(EXERCISES.map((exercise) => exercise.id)).size, EXERCISES.length)
  assert.equal(Object.keys(MUSCLE_LABELS).length, 7)
  assert.equal(Object.keys(EQUIPMENT_LABELS).length, 3)
  assert.equal(Object.keys(GOAL_LABELS).length, 3)
  assert.equal(Object.keys(LEVEL_LABELS).length, 3)
  for (const exercise of EXERCISES) {
    assert.equal(getExercise(exercise.id), exercise)
    assert.ok(exercise.name.length > 0 && exercise.instructions.length > 40)
    assert.ok(exercise.muscles.length > 0)
    for (const muscle of [...exercise.muscles, ...exercise.secondary]) assert.ok(Object.hasOwn(MUSCLE_LABELS, muscle))
    assert.ok(Object.hasOwn(PATTERN_LABELS, exercise.pattern))
    assert.equal(typeof exercise.stimulus, 'string')
    assert.ok(exercise.stimulus.length > 0)
    assert.ok(exercise.equipment.includes('gym'))
    if (exercise.equipment.includes('bodyweight')) assert.ok(exercise.equipment.includes('dumbbells'))
    for (const field of ['setupSeconds', 'rampSeconds', 'secondsPerRep']) assert.ok(exercise[field] > 0)
  }
  assert.ok(!EXERCISES.some((exercise) => exercise.equipment.includes('bodyweight') && exercise.muscles.includes('back')))
  assert.deepEqual(getExercise('db-incline-press').equipment, ['gym'], 'A bench is not implied by owning dumbbells')
  assert.throws(() => getExercise('does-not-exist'), /sconosciuto/)
  assert.throws(() => getExercise('constructor'), /sconosciuto/)
})

test('timing includes setup, ramp recovery, upper reps, both sides, log overhead and N−1 rests', () => {
  for (const exerciseId of ['db-row', 'db-one-arm-row', 'dead-bug']) {
    const exercise = getExercise(exerciseId)
    const one = item(exerciseId, { sets: 1, repMin: 6, repMax: 12, restSeconds: 120 })
    const duration = 12 * exercise.secondsPerRep * (exercise.unilateral ? 2 : 1)
    assert.equal(estimateExerciseSeconds(one), exercise.setupSeconds + exercise.rampSeconds + duration + 12)
    const three = { ...one, sets: 3 }
    assert.equal(estimateExerciseSeconds(three), exercise.setupSeconds + exercise.rampSeconds + 3 * (duration + 12) + 2 * 120)
    assert.equal(estimateExerciseSeconds({ ...three, repMin: 1 }), estimateExerciseSeconds(three), 'Upper bound drives time')
    assert.equal(estimateExerciseSeconds({ ...one, restSeconds: 300 }), estimateExerciseSeconds(one), 'No trailing rest after one set')
    assert.equal(estimateExerciseSeconds({ ...three, restSeconds: 180 }) - estimateExerciseSeconds(three), 2 * 60)
  }
})

test('plan timing adds general warm-up, one transition between exercises, and reserve once', () => {
  const a = item()
  const b = item('lat-pulldown')
  assert.equal(estimatePlanSeconds(planFor([a])), 390 + estimateExerciseSeconds(a))
  assert.equal(estimatePlanSeconds(planFor([a, b])), 390 + estimateExerciseSeconds(a) + estimateExerciseSeconds(b) + 45)
  assert.equal(estimatePlanSeconds(planFor([])), 390)
  assert.equal(estimateExerciseSeconds(item('unknown')), Infinity)
  assert.equal(estimateExerciseSeconds(item('barbell-bench', { sets: NaN })), Infinity)
  assert.equal(estimatePlanSeconds({ exercises: null }), Infinity)
})

test('all goals, levels, time presets and equipment keep hard budget, coverage and exclusions', () => {
  const selections = [
    ['chest', 'back'], ['legs'], ['shoulders', 'biceps', 'triceps', 'core'],
    ['chest'], Object.keys(MUSCLE_LABELS),
  ]
  let feasible = 0
  let impossible = 0
  for (const goal of Object.keys(GOAL_LABELS)) {
    for (const level of Object.keys(LEVEL_LABELS)) {
      for (const equipment of Object.keys(EQUIPMENT_LABELS)) {
        for (const minutes of [10, 15, 20, 30, 45, 60, 90, 120]) {
          for (const muscles of selections) {
            const request = settings({ goal, level, equipment, minutes, muscles })
            const result = generatePlan(request)
            if (result.plan) {
              feasible++
              assertValid(result, request)
              assert.ok(result.plan.exercises.every((entry) => entry.targetLoad === null))
            } else {
              impossible++
              assert.ok(result.message.length > 30, JSON.stringify(request))
              if (minutes >= 45 && !(equipment === 'bodyweight' && muscles.some((muscle) => ['back', 'biceps'].includes(muscle)))) {
                assert.fail(`Unexpected failure for ${JSON.stringify(request)}: ${result.message}`)
              }
            }
            if (equipment === 'bodyweight' && muscles.some((muscle) => ['back', 'biceps'].includes(muscle))) assert.equal(result.plan, null)
          }
        }
      }
    }
  }
  assert.ok(feasible > 400)
  assert.ok(impossible > 100)
})

test('a useful 30-minute chest/back workout is feasible for every goal and level with weights', () => {
  for (const equipment of ['gym', 'dumbbells']) {
    for (const goal of Object.keys(GOAL_LABELS)) {
      for (const level of Object.keys(LEVEL_LABELS)) {
        const request = settings({ minutes: 30, goal, level, equipment })
        const plan = assertValid(generatePlan(request), request)
        assert.ok(plan.exercises.every((entry) => entry.sets >= 2))
      }
    }
  }
})

test('short budgets use coverage search rather than spending all time on preferred isolated groups', () => {
  const request = settings({
    minutes: 15, equipment: 'dumbbells',
    muscles: ['chest', 'triceps', 'legs', 'core'],
    preferredIds: ['db-floor-press', 'db-triceps-extension', 'db-goblet-squat'],
  })
  const result = generatePlan(request)
  const plan = assertValid(result, request)
  assert.ok(plan.exercises.some((entry) => entry.exerciseId === 'close-push-up'))
  assert.ok(plan.exercises.some((entry) => getExercise(entry.exerciseId).muscles.includes('legs')))
  assert.match(result.message, /abbreviato/i)
  assert.equal(plan.warmupSeconds, 300)
})

test('tiny budgets and unavailable primary groups fail explicitly without silent dropping', () => {
  for (const request of [
    settings({ minutes: 5 }),
    settings({ equipment: 'bodyweight', muscles: ['chest', 'back'], minutes: 90 }),
    settings({ avoidedIds: EXERCISES.filter((exercise) => exercise.muscles.includes('chest')).map((exercise) => exercise.id) }),
    settings({ equipment: 'dumbbells', avoidedPatterns: ['horizontal_pull'], muscles: ['back', 'legs'] }),
    settings({ equipment: 'bodyweight', muscles: ['biceps'], minutes: 90 }),
  ]) {
    const result = generatePlan(request)
    assert.equal(result.plan, null)
    assert.match(result.message, /grupp|primario/)
  }
  assert.match(generatePlan(settings({ equipment: 'bodyweight' })).message, /Senza attrezzi per tirare/)
  assert.match(generatePlan(settings({ minutes: 5 })).message, /riscaldamento/)
})

test('primary coverage is not satisfied by secondary activation', () => {
  const plan = planFor([item('db-rdl')], {
    settings: settings({ muscles: ['back'], minutes: 90, equipment: 'dumbbells' }),
  })
  assert.ok(validatePlan(plan).some((error) => /Manca lavoro primario.*Schiena/.test(error)))
})

test('exclusions override preferences, including movement-pattern exclusions', () => {
  const request = settings({
    minutes: 45, preferredIds: ['barbell-bench', 'lat-pulldown'],
    avoidedIds: ['barbell-bench'], avoidedPatterns: ['vertical_pull'],
  })
  const plan = assertValid(generatePlan(request), request)
  assert.ok(!plan.exercises.some((entry) => entry.exerciseId === 'barbell-bench' || entry.exerciseId === 'lat-pulldown'))
  for (const equipment of ['gym', 'dumbbells', 'bodyweight']) {
    const constrained = settings({
      equipment, muscles: ['legs', 'core'], minutes: 30,
      avoidedIds: ['db-rdl'], preferredIds: ['db-rdl'], avoidedPatterns: ['squat'],
    })
    const result = generatePlan(constrained)
    if (result.plan) assertValid(result, constrained)
    else assert.match(result.message, /primario|non entra/)
  }
})

test('soft preference can select a compatible less time-efficient variant when time allows', () => {
  const request = settings({ minutes: 60, muscles: ['back'], preferredIds: ['db-one-arm-row'], equipment: 'dumbbells' })
  const plan = assertValid(generatePlan(request), request)
  assert.ok(plan.exercises.some((entry) => entry.exerciseId === 'db-one-arm-row'))
})

test('muscle priority is preserved for first primary exposure', () => {
  for (const muscles of [['back', 'chest'], ['core', 'legs', 'shoulders'], ['biceps', 'chest', 'back'], ['triceps', 'back', 'chest']]) {
    const request = settings({ minutes: 45, muscles })
    assertValid(generatePlan(request), request)
  }
})

test('strength, hypertrophy and mixed prescriptions are distinct, with conservative beginner RIR', () => {
  for (const goal of Object.keys(GOAL_LABELS)) {
    for (const level of Object.keys(LEVEL_LABELS)) {
      const request = settings({
        minutes: 60, muscles: ['chest', 'back'], goal, level,
        avoidedIds: EXERCISES.filter(isBodyweightExercise).map((exercise) => exercise.id),
      })
      const plan = assertValid(generatePlan(request), request)
      const compounds = plan.exercises.filter((entry) => getExercise(entry.exerciseId).category === 'compound')
      if (goal === 'strength') {
        assert.ok(compounds.length >= 2)
        for (const entry of compounds) {
          assert.equal(entry.repMin, level === 'beginner' ? 5 : 3)
          assert.equal(entry.repMax, level === 'beginner' ? 8 : 6)
          assert.ok(entry.restSeconds >= 120 && entry.restSeconds <= 240)
        }
      } else if (goal === 'hypertrophy') {
        for (const entry of plan.exercises) {
          const isolation = getExercise(entry.exerciseId).category === 'isolation'
          assert.ok(entry.repMin >= (isolation ? 10 : 6))
          assert.ok(entry.repMax <= (isolation ? 20 : 15))
          assert.ok(entry.restSeconds >= (isolation ? 60 : 90))
          assert.ok(entry.restSeconds <= (isolation ? 120 : 180))
        }
      } else {
        assert.equal(compounds.filter((entry) => entry.repMax <= 8).length, 1)
        assert.ok(plan.exercises.some((entry) => entry.repMin >= 8 && entry.repMax >= 10))
      }
      if (level === 'beginner') assert.ok(plan.exercises.every((entry) => entry.rir >= 3))
    }
  }
})

test('mixed does not move its heavy main to another muscle when the focus is bodyweight only', () => {
  const request = settings({
    minutes: 30, muscles: ['chest', 'triceps', 'back'],
    preferredIds: ['close-push-up'], avoidedPatterns: ['horizontal_adduction'],
    avoidedIds: ['barbell-bench', 'db-incline-press', 'db-floor-press', 'db-flat-bench-press'],
  })
  const plan = assertValid(generatePlan(request), request)
  assert.ok(getExercise(plan.exercises[0].exerciseId).equipment.includes('bodyweight'))
  assert.ok(plan.exercises.every((entry) => entry.repMax > 8))
})

test('bodyweight strength does not pretend an easy squat is a quantified heavy strength exercise', () => {
  const request = settings({ equipment: 'bodyweight', goal: 'strength', muscles: ['legs'], minutes: 30 })
  const result = generatePlan(request)
  const plan = assertValid(result, request)
  assert.match(result.message, /Limite corpo libero/)
  assert.match(result.message, /non una prescrizione di forza specifica/)
  for (const entry of plan.exercises) {
    assert.ok(entry.repMin >= 8)
    assert.ok(entry.rir >= 3)
    assert.equal(entry.targetLoad, null)
  }
})

test('90-minute chest/back sessions add three complementary exercises per group when feasible', () => {
  for (const goal of Object.keys(GOAL_LABELS)) {
    for (const level of ['intermediate', 'advanced']) {
      const request = settings({ minutes: 90, goal, level })
      const plan = assertValid(generatePlan(request), request)
      for (const muscle of request.muscles) {
        const group = plan.exercises.filter((entry) => getExercise(entry.exerciseId).muscles.includes(muscle))
        assert.ok(group.length >= 3, `${goal}/${level}/${muscle}: ${group.length} exercises`)
        assert.equal(new Set(group.map((entry) => getExercise(entry.exerciseId).stimulus)).size, group.length)
        assert.ok(group.reduce((sum, entry) => sum + entry.sets, 0) <= (level === 'intermediate' ? 9 : 12))
      }
      const short = assertValid(generatePlan({ ...request, minutes: 30 }), { ...request, minutes: 30 })
      assert.ok(plan.exercises.length > short.exercises.length)
      assert.ok(estimatePlanSeconds(plan) > estimatePlanSeconds(short))
    }
  }
})

test('lower-body sessions retain three distinct stimuli after grouping glute work under legs', () => {
  for (const equipment of ['gym', 'dumbbells']) {
    const request = settings({ minutes: 90, muscles: ['legs'], equipment })
    const plan = assertValid(generatePlan(request), request)
    const stimuli = plan.exercises.map((entry) => getExercise(entry.exerciseId).stimulus)
    assert.ok(new Set(stimuli).size >= 3)
    const lowerStimuli = EXERCISES.filter((exercise) => exercise.muscles.includes('legs') && exercise.equipment.includes(equipment)).map((exercise) => exercise.stimulus)
    for (const stimulus of ['squat', 'hip_bridge', 'hip_hinge', 'lunge']) assert.ok(lowerStimuli.includes(stimulus), stimulus)
    for (const muscle of request.muscles) {
      assert.ok(plan.exercises.filter((entry) => getExercise(entry.exerciseId).muscles.includes(muscle)).length >= 3)
    }
  }
})

test('long multi-group sessions do not impose one exercise per muscle', () => {
  const request = settings({ minutes: 90, muscles: ['chest', 'back', 'shoulders', 'biceps'] })
  const plan = assertValid(generatePlan(request), request)
  for (const muscle of request.muscles.slice(0, 3)) {
    assert.ok(plan.exercises.filter((entry) => getExercise(entry.exerciseId).muscles.includes(muscle)).length >= 2, muscle)
  }
  assert.equal(plan.exercises.filter((entry) => getExercise(entry.exerciseId).muscles.includes('chest')).length, 3)
  assert.ok(plan.exercises.length <= 8, 'Focus gets a third variant before the last-priority group gets a second')
  assert.ok(plan.exercises.reduce((sum, entry) => sum + entry.sets, 0) <= 26)
})

test('long sessions respect level volume limits and explain unused time instead of padding duplicates', () => {
  for (const level of Object.keys(LEVEL_LABELS)) {
    const request = settings({ minutes: 90, level })
    const plan = assertValid(generatePlan(request), request)
    assert.ok(plan.exercises.length <= (level === 'beginner' ? 6 : 8))
    assert.ok(plan.exercises.reduce((sum, entry) => sum + entry.sets, 0) <= (level === 'beginner' ? 12 : level === 'intermediate' ? 26 : 30))
    if (level === 'beginner') for (const muscle of request.muscles) {
      assert.ok(plan.exercises.filter((entry) => getExercise(entry.exerciseId).muscles.includes(muscle)).reduce((sum, entry) => sum + entry.sets, 0) <= 6)
    }
    assert.ok(plan.exercises.every((entry) => entry.sets <= (level === 'beginner' ? 3 : level === 'intermediate' ? 4 : 5)))
  }
  const request = settings({ minutes: 90, muscles: ['back'], equipment: 'dumbbells' })
  const result = generatePlan(request)
  const plan = assertValid(result, request)
  assert.equal(plan.exercises.length, 1, 'Do not stack three near-identical dumbbell rows')
  assert.ok(planBudgetNote(plan))
  assert.match(result.message, /varianti compatibili/)
  const short = generatePlan(settings({ minutes: 30 })).plan
  assert.equal(planBudgetNote(short), null)
})

test('long-session expansion still honors both exclusions and movement patterns', () => {
  const request = settings({ minutes: 90, avoidedIds: ['db-incline-press'], avoidedPatterns: ['shoulder_extension', 'vertical_pull'] })
  const plan = assertValid(generatePlan(request), request)
  assert.ok(plan.exercises.every((entry) => entry.exerciseId !== 'db-incline-press'
    && !request.avoidedPatterns.includes(getExercise(entry.exerciseId).pattern)))
  assert.equal(plan.exercises.filter((entry) => getExercise(entry.exerciseId).muscles.includes('back')).length, 1)
})

test('two-hour sessions respect personal recovery minima at every level and goal', () => {
  for (const minRestSeconds of [90, 120, 180]) {
    for (const goal of Object.keys(GOAL_LABELS)) {
      for (const level of Object.keys(LEVEL_LABELS)) {
        const request = settings({ minutes: 120, minRestSeconds, goal, level, muscles: ['back', 'chest', 'shoulders', 'biceps', 'triceps'] })
        const plan = assertValid(generatePlan(request), request)
        assert.ok(plan.exercises.every((entry) => entry.restSeconds >= minRestSeconds && entry.rir >= 2))
        if (level === 'beginner') assert.ok(plan.exercises.reduce((sum, entry) => sum + entry.sets, 0) <= 12)
        const edited = structuredClone(plan)
        edited.exercises[0].restSeconds = minRestSeconds - 1
        const expectedMinimum = Math.max(minRestSeconds, minimumRestSeconds(edited.exercises[0]))
        assert.ok(validatePlan(edited).some((error) => error.includes(`${expectedMinimum} secondi`)))
      }
    }
  }
})

test('accessories are opt-in, bounded and never replace primary coverage', () => {
  const request = settings({ minutes: 120, minRestSeconds: 120 })
  for (const includeAccessories of [undefined, false]) {
    const plan = assertValid(generatePlan({ ...request, includeAccessories }), request)
    assert.ok(plan.exercises.every((entry) => getExercise(entry.exerciseId).muscles.some((muscle) => request.muscles.includes(muscle))))
  }
  for (const level of Object.keys(LEVEL_LABELS)) {
    const enabled = { ...request, level, includeAccessories: true }
    const plan = assertValid(generatePlan(enabled), enabled)
    const accessories = plan.exercises.filter((entry) => !getExercise(entry.exerciseId).muscles.some((muscle) => request.muscles.includes(muscle)))
    if (level !== 'beginner') assert.ok(accessories.length > 0)
    assert.ok(accessories.length <= 3)
    const slots = accessories.map((entry) => {
      const exercise = getExercise(entry.exerciseId)
      assert.equal(exercise.category, 'isolation')
      return exercise.muscles[0]
    })
    assert.equal(new Set(slots).size, slots.length)
    for (const muscle of ['shoulders', 'biceps', 'triceps']) {
      assert.ok(accessories.filter((entry) => getExercise(entry.exerciseId).muscles.includes(muscle)).reduce((sum, entry) => sum + entry.sets, 0) <= 6)
    }
    const firstAccessory = plan.exercises.findIndex((entry) => accessories.includes(entry))
    if (firstAccessory >= 0) {
      assert.ok(plan.exercises.slice(firstAccessory).every((entry) => accessories.includes(entry)))
    }
  }
  const short = { ...request, minutes: 30, minRestSeconds: 0, includeAccessories: true }
  const shortPlan = assertValid(generatePlan(short), short)
  assert.ok(shortPlan.exercises.every((entry) => getExercise(entry.exerciseId).muscles.some((muscle) => short.muscles.includes(muscle))))
  const excluded = { ...request, includeAccessories: true, avoidedPatterns: ['elbow_flexion', 'elbow_extension', 'shoulder_abduction', 'shoulder_horizontal_abduction'] }
  const constrained = assertValid(generatePlan(excluded), excluded)
  assert.ok(constrained.exercises.every((entry) => !excluded.avoidedPatterns.includes(getExercise(entry.exerciseId).pattern)))
})

test('pull-ups and dips need equipment but never invent external loads or heavy rep targets', () => {
  for (const id of ['pull-up', 'chest-dip']) {
    assert.ok(isBodyweightExercise(getExercise(id)))
    assert.deepEqual(getExercise(id).equipment, ['gym'])
    const muscle = getExercise(id).muscles[0]
    const request = settings({ minutes: 90, muscles: [muscle], goal: 'strength', preferredIds: [id], minRestSeconds: 120,
      avoidedIds: EXERCISES.filter((exercise) => exercise.id !== id && exercise.muscles.includes(muscle)).map((exercise) => exercise.id),
    })
    const plan = assertValid(generatePlan(request, [exposure({ exerciseId: id, weight: 20 })]), request)
    const item = plan.exercises.find((entry) => entry.exerciseId === id)
    assert.ok(item, id)
    assert.equal(item.targetLoad, null)
    assert.ok(item.repMin >= 8 && item.rir >= 3)
    assert.equal(suggestLoad(id, [exposure({ exerciseId: id })], 6, 2), null)
  }
  assert.equal(getExercise('db-preacher-curl').unilateral, true)
  assert.notEqual(getExercise('db-preacher-curl').id, getExercise('cable-preacher-curl').id)
  assert.equal(getExercise('db-flat-bench-press').stimulus, getExercise('barbell-bench').stimulus)
})

test('substitutions share all relevant primary muscles and honor every hard constraint', () => {
  const request = settings({
    muscles: ['legs'], equipment: 'dumbbells',
    avoidedIds: ['db-reverse-lunge'], avoidedPatterns: ['squat'],
    preferredIds: ['db-reverse-lunge'],
  })
  const options = getSubstitutions(item('barbell-rdl'), request, ['db-glute-bridge'])
  assert.ok(options.some((exercise) => exercise.id === 'db-rdl'))
  assert.ok(options.every((exercise) => !['db-reverse-lunge', 'db-glute-bridge'].includes(exercise.id) && exercise.pattern !== 'squat'))
  for (const exercise of options) {
    assert.ok(exercise.muscles.includes('legs'))
    assert.ok(exercise.equipment.includes('dumbbells'))
  }
  const chest = settings({ muscles: ['chest'], equipment: 'dumbbells', avoidedIds: ['push-up'] })
  const chestOptions = getSubstitutions(item('db-floor-press'), chest, ['db-floor-fly'])
  assert.ok(chestOptions.length > 0)
  assert.ok(chestOptions.every((exercise) => exercise.id !== 'db-floor-press'
    && exercise.id !== 'db-floor-fly' && exercise.id !== 'push-up' && exercise.muscles.includes('chest')))
  assert.deepEqual(getSubstitutions(item('db-row'), settings({ equipment: 'bodyweight' })), [])
  assert.deepEqual(getSubstitutions(item('unknown'), chest), [])
  assert.deepEqual(getSubstitutions(item(), { ...chest, equipment: 'unknown' }), [])
})

test('substitution time is revalidated, not presumed equivalent', () => {
  const fast = item('db-row', { sets: 2, repMin: 8, repMax: 12, restSeconds: 120 })
  const plan = planFor([fast], { settings: settings({ muscles: ['back'], equipment: 'dumbbells', minutes: 90 }) })
  plan.settings.minutes = estimatePlanSeconds(plan) / 60
  assert.deepEqual(validatePlan(plan), [])
  assert.ok(getSubstitutions(fast, plan.settings).some((exercise) => exercise.id === 'db-one-arm-row'))
  plan.exercises[0] = { ...fast, exerciseId: 'db-one-arm-row' }
  assert.ok(validatePlan(plan).some((error) => /supera il tempo/.test(error)))
})

test('no history, another variant and bodyweight never invent a target load', () => {
  assert.equal(suggestLoad('barbell-bench', [], 6, 2), null)
  assert.equal(suggestLoad('db-floor-press', [exposure()], 6, 2), null)
  assert.equal(suggestLoad('push-up', [exposure({ exerciseId: 'push-up' })], 6, 2), null)
  assert.equal(suggestLoad('unknown', [], 6, 2), null)
  assert.equal(suggestLoad('barbell-bench', null, 6, 2), null)
  assert.equal(suggestLoad('barbell-bench', [null, {}, { plan: null }], 6, 2), null)
  assert.equal(suggestLoad('barbell-bench', [exposure()], NaN, 2), null)
})

test('double progression requires two comparable completed full exposures at upper reps and RIR', () => {
  const first = exposure({ day: 1 })
  const second = exposure({ day: 2 })
  assert.equal(suggestLoad('barbell-bench', [first], 6, 2), 100)
  assert.equal(suggestLoad('barbell-bench', [first, second], 6, 2), 102.5)
  assert.equal(suggestLoad('barbell-bench', [second, first], 6, 2), 102.5)
  assert.equal(suggestLoad('barbell-bench', [first, second], 8, 2), 100)
  assert.equal(suggestLoad('barbell-bench', [first, second], 6, 3), 100)
})

test('missing RIR, partial or fewer sets, inconsistent loads, duplicates and unfinished work never raise load', () => {
  const changes = [
    (session) => { session.logs[1].rir = null },
    (session) => { delete session.logs[1].rir },
    (session) => { session.logs[1].rir = 1 },
    (session) => { session.logs[1].rir = NaN },
    (session) => { session.logs[1].reps = 5 },
    (session) => { session.logs.pop() },
    (session) => { session.plan.exercises[0].sets = 2; session.logs.pop() },
    (session) => { session.logs[0].weight = 95 },
    (session) => { session.logs[1].setIndex = 0 },
    (session) => { session.logs[1].id = session.logs[0].id },
    (session) => { session.finishedAt = null },
    (session) => { session.logs[1].completedAt = 'not-a-date' },
    (session) => { session.logs[1].completedAt = '2026-08-03T09:00:00.000Z' },
    (session) => { session.plan.exercises[0].repMin = 4 },
    (session) => { session.plan.exercises[0].restSeconds = 240 },
    (session) => { session.logs.forEach((log) => { log.setIndex += 1 }) },
    (session) => { session.logs = [] },
  ]
  for (const change of changes) {
    const first = exposure({ day: 1 })
    const second = exposure({ day: 2 })
    change(second)
    assert.equal(suggestLoad('barbell-bench', [first, second], 6, 2), 100, change.toString())
  }
  const repeated = exposure({ day: 1 })
  assert.equal(suggestLoad('barbell-bench', [repeated, structuredClone(repeated)], 6, 2), 100)
  assert.equal(suggestLoad('barbell-bench', [exposure({ day: 1 }), exposure({ day: 2, weight: 90 })], 6, 2), 90)
})

test('a partial latest exposure blocks reusing older success to repeatedly increase loads', () => {
  const history = [exposure({ day: 1 }), exposure({ day: 2 }), exposure({ day: 3 })]
  history[2].logs.pop()
  assert.equal(suggestLoad('barbell-bench', history, 6, 2), 100)
})

test('rounding stays conservative and does not increase when available increment exceeds five percent', () => {
  for (const [exerciseId, weight, expected] of [
    ['barbell-bench', 100, 102.5],
    ['barbell-bench', 50, 52.5],
    ['barbell-bench', 40, 40],
    ['db-floor-press', 40, 41],
    ['db-floor-press', 20, 21],
    ['db-floor-press', 10, 10],
  ]) {
    const result = suggestLoad(exerciseId, [
      exposure({ exerciseId, weight, day: 1 }), exposure({ exerciseId, weight, day: 2 }),
    ], 6, 2)
    assert.equal(result, expected)
    assert.ok(result <= weight * 1.05 + 0.000001)
  }
})

test('generation uses only matching history loads and never mutates settings or history', () => {
  const request = settings({ minutes: 45, goal: 'strength', preferredIds: ['barbell-bench'] })
  const baseline = generatePlan(request).plan.exercises.find((entry) => entry.exerciseId === 'barbell-bench')
  const history = [exposure({ day: 1, sets: baseline.sets }), exposure({ day: 2, sets: baseline.sets })]
  const before = structuredClone({ request, history })
  const plan = assertValid(generatePlan(request, history), request)
  assert.ok(plan.exercises.some((entry) => entry.exerciseId === 'barbell-bench' && entry.targetLoad === 102.5))
  assert.ok(plan.exercises.filter((entry) => entry.exerciseId !== 'barbell-bench').every((entry) => entry.targetLoad === null))
  assert.deepEqual({ request, history }, before)
  request.muscles.push('core')
  request.avoidedIds.push('barbell-bench')
  assert.deepEqual(plan.settings, before.request)
  const next = generatePlan(before.request).plan
  assert.notEqual(plan.id, next.id)
  assert.equal(new Set([...plan.exercises, ...next.exercises].map((entry) => entry.id)).size, plan.exercises.length + next.exercises.length)
})

test('focus variants remain stable with history, while explicit preferences and exclusions override the anchor', () => {
  const request = settings({ minutes: 45, muscles: ['back'], equipment: 'dumbbells' })
  const firstPlan = assertValid(generatePlan(request), request)
  const firstId = firstPlan.exercises[0].exerciseId
  const history = [exposure({ exerciseId: firstId })]
  const next = assertValid(generatePlan(request, history), request)
  assert.equal(next.exercises[0].exerciseId, firstId)
  assert.ok(next.exercises.every((entry) => getExercise(entry.exerciseId).muscles.includes('back')))
  const preferred = { ...request, preferredIds: [firstId] }
  assert.ok(assertValid(generatePlan(preferred, history), preferred).exercises.some((entry) => entry.exerciseId === firstId))
  const alternative = EXERCISES.find((exercise) => exercise.id !== firstId && exercise.equipment.includes('dumbbells') && exercise.muscles.includes('back'))
  const changed = { ...request, preferredIds: [alternative.id] }
  assert.equal(assertValid(generatePlan(changed, history), changed).exercises[0].exerciseId, alternative.id)
  const excluded = { ...request, avoidedIds: [firstId] }
  assert.ok(assertValid(generatePlan(excluded, history), excluded).exercises.every((entry) => entry.exerciseId !== firstId))
  for (const unusable of [null, {}, [null, {}, { plan: null }]]) {
    assert.ok(assertValid(generatePlan(request, unusable), request).exercises.every((entry) => entry.targetLoad === null))
  }
})

test('biceps and triceps are independent primary groups and cannot substitute for one another', () => {
  assert.equal(Object.hasOwn(MUSCLE_LABELS, 'glutes'), false)
  assert.equal(Object.hasOwn(MUSCLE_LABELS, 'arms'), false)
  for (const [muscle, id, opposite] of [['biceps', 'db-curl', 'triceps'], ['triceps', 'cable-triceps', 'biceps']]) {
    const request = settings({ muscles: [muscle], minutes: 60 })
    const plan = assertValid(generatePlan(request), request)
    assert.ok(plan.exercises.every((entry) => getExercise(entry.exerciseId).muscles.includes(muscle)))
    assert.ok(getSubstitutions(item(id), request).every((exercise) => exercise.muscles.includes(muscle) && !exercise.muscles.includes(opposite)))
    const onlyOther = planFor([item(opposite === 'biceps' ? 'db-curl' : 'cable-triceps')], { settings: request })
    assert.ok(validatePlan(onlyOther).some((message) => message.includes('Manca lavoro primario')))
  }
  assert.ok(getExercise('barbell-bench').secondary.includes('triceps'))
  assert.ok(getExercise('lat-pulldown').secondary.includes('biceps'))
  for (const id of ['barbell-hip-thrust', 'db-glute-bridge', 'single-leg-bridge']) {
    assert.deepEqual(getExercise(id).muscles, ['legs'], 'Existing variant IDs remain usable in history')
  }
})

test('changing click order changes focus order and first allocation of complementary volume', () => {
  for (const muscles of [['back', 'chest'], ['chest', 'back']]) {
    const request = settings({ minutes: 60, muscles })
    const plan = assertValid(generatePlan(request), request)
    const counts = muscles.map((muscle) => plan.exercises.filter((entry) => getExercise(entry.exerciseId).muscles.includes(muscle)).length)
    assert.deepEqual(counts, [3, 2])
    const ordered = plan.exercises.map((entry) => muscles.findIndex((muscle) => getExercise(entry.exerciseId).muscles.includes(muscle)))
    assert.deepEqual(ordered, ordered.toSorted((a, b) => a - b), 'All focus work precedes lower priorities')
    assert.ok(plan.exercises.filter((entry) => getExercise(entry.exerciseId).muscles.includes(muscles[0])).every((entry) => entry.progressionNote))
    assert.ok(plan.exercises.filter((entry) => !getExercise(entry.exerciseId).muscles.includes(muscles[0])).every((entry) => !entry.progressionNote))
  }
  const constrained = settings({ minutes: 20, muscles: ['back', 'chest'] })
  const short = assertValid(generatePlan(constrained), constrained)
  assert.ok(short.exercises[0].sets > short.exercises[1].sets, 'Short budgets protect focus sets, not just its label')
})

test('isolation and core focus stay first without assigning their mixed strength block to another muscle', () => {
  for (const focus of ['biceps', 'core']) {
    const request = settings({ minutes: 60, muscles: [focus, 'chest', 'back'], goal: 'mixed' })
    const result = generatePlan(request)
    const plan = assertValid(result, request)
    assert.ok(plan.exercises.every((entry) => entry.repMax > 8))
    assert.match(result.message, /sul focus manca un fondamentale/i)
  }
  const request = settings({ minutes: 60, muscles: ['biceps', 'triceps'], goal: 'hypertrophy' })
  const plan = assertValid(generatePlan(request), request)
  assert.ok(plan.exercises.filter((entry) => getExercise(entry.exerciseId).muscles.includes('biceps')).length >= 3)
})

test('load increases are reserved for the focus, not other selected groups with identical successful history', () => {
  for (const muscles of [['chest', 'back'], ['back', 'chest']]) {
    const request = settings({ minutes: 90, goal: 'hypertrophy', muscles, preferredIds: ['barbell-bench', 'lat-pulldown'] })
    const baseline = generatePlan(request).plan
    const history = [1, 2].map((day) => {
      const session = exposure({ day })
      session.plan = structuredClone(baseline)
      session.logs = baseline.exercises.flatMap((entry) => Array.from({ length: entry.sets }, (_, setIndex) => ({
        id: `${day}-${entry.id}-${setIndex}`, planExerciseId: entry.id, setIndex,
        weight: 100, reps: entry.repMax, rir: entry.rir, completedAt: session.logs[0].completedAt,
      })))
      return session
    })
    const plan = assertValid(generatePlan(request, history), request)
    for (const id of ['barbell-bench', 'lat-pulldown']) {
      const prescribed = plan.exercises.find((entry) => entry.exerciseId === id)
      assert.ok(prescribed, id)
      const focused = getExercise(id).muscles.includes(muscles[0])
      assert.equal(prescribed.targetLoad, focused ? 102.5 : 100, `${muscles}/${id}`)
      if (focused) assert.match(prescribed.progressionNote, /proposta 102.5 kg/)
      else assert.equal(prescribed.progressionNote, undefined)
    }
  }
})

test('a changed next prescription or a nonfocus exercise keeps its recorded load', () => {
  const history = [exposure({ day: 1 }), exposure({ day: 2 })]
  assert.equal(suggestLoad('barbell-bench', history, 6, 2, false), 100)
  assert.equal(suggestLoad('barbell-bench', history, 6, 2, true, item()), 102.5)
  for (const patch of [{ sets: 4 }, { restSeconds: 240 }, { repMin: 4 }]) {
    assert.equal(suggestLoad('barbell-bench', history, 6, 2, true, item('barbell-bench', patch)), 100)
  }
})

test('runtime settings validation rejects malformed forms and unknown enums without throwing', () => {
  const invalid = [
    null, undefined, [], {}, 'settings',
    ...[NaN, Infinity, -Infinity, -1, 0, 181, null, '30'].map((minutes) => settings({ minutes })),
    ...[null, [], ['unknown'], ['chest', 'chest'], [NaN], [null], 'chest'].map((muscles) => settings({ muscles })),
    settings({ goal: 'fat-loss' }), settings({ level: 'expert' }), settings({ equipment: 'bands' }),
    settings({ goal: 'constructor' }), settings({ level: 'toString' }),
    settings({ avoidedIds: null }), settings({ preferredIds: [42] }),
    settings({ preferredIds: ['unknown'] }), settings({ avoidedPatterns: ['unknown'] }),
    settings({ avoidedPatterns: 'squat' }),
    settings({ includeAccessories: 'yes' }), settings({ includeAccessories: null }),
    ...[-1, 301, Infinity, NaN, '120', null, 1.5].map((minRestSeconds) => settings({ minRestSeconds })),
  ]
  for (const request of invalid) {
    assert.doesNotThrow(() => {
      const result = generatePlan(request)
      assert.equal(result.plan, null, JSON.stringify(request))
      assert.ok(result.message.length > 10)
    })
  }
})

test('plan validation catches IDs, empty plans, incompatible equipment, exclusions and malformed prescriptions', () => {
  const base = planFor([item()])
  assert.deepEqual(validatePlan(base), [])
  const cases = [
    (plan) => { plan.id = '' },
    (plan) => { plan.createdAt = 'invalid' },
    (plan) => { plan.name = '' },
    (plan) => { plan.exercises = [] },
    (plan) => { plan.exercises = null },
    (plan) => { plan.exercises = [null] },
    (plan) => { plan.exercises[0].id = '' },
    (plan) => { plan.exercises[0].exerciseId = 'unknown' },
    (plan) => { plan.exercises.push({ ...plan.exercises[0] }) },
    (plan) => { plan.exercises[0].sets = NaN },
    (plan) => { plan.exercises[0].sets = 1.5 },
    (plan) => { plan.exercises[0].sets = 10 },
    (plan) => { plan.exercises[0].repMin = 8 },
    (plan) => { plan.exercises[0].repMax = Infinity },
    (plan) => { plan.exercises[0].restSeconds = -1 },
    (plan) => { plan.exercises[0].restSeconds = '180' },
    (plan) => { plan.exercises[0].rir = NaN },
    (plan) => { plan.exercises[0].targetLoad = -10 },
    (plan) => { plan.exercises[0].targetLoad = '50' },
    (plan) => { plan.warmupSeconds = 0 },
    (plan) => { plan.warmupSeconds = NaN },
    (plan) => { plan.reserveSeconds = 0 },
    (plan) => { plan.settings.equipment = 'bodyweight' },
    (plan) => { plan.settings.avoidedIds = ['barbell-bench'] },
    (plan) => { plan.settings.avoidedPatterns = ['horizontal_push'] },
    (plan) => { plan.settings = null },
    (plan) => { plan.settings.level = 'unknown' },
    (plan) => { plan.settings.minutes = NaN },
    (plan) => { plan.settings.muscles = [NaN] },
    (plan) => { plan.settings.level = 'beginner'; plan.exercises[0].rir = 2 },
    (plan) => { plan.exercises[0] = item('push-up', { targetLoad: 20 }) },
  ]
  for (const change of cases) {
    const changed = structuredClone(base)
    change(changed)
    assert.doesNotThrow(() => assert.ok(validatePlan(changed).length > 0, change.toString()))
  }
  assert.ok(validatePlan(null).length > 0)
})

test('hard budget validation accepts the exact boundary and rejects a one-second overrun', () => {
  const plan = planFor([item()])
  plan.settings.minutes = estimatePlanSeconds(plan) / 60
  assert.deepEqual(validatePlan(plan), [])
  plan.settings.minutes -= 1 / 60
  assert.ok(validatePlan(plan).some((error) => /supera il tempo/.test(error)))
})
