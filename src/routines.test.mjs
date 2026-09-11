import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_SETTINGS, getExercise, isBodyweightExercise, routineVolumeWarnings, validatePlan, workoutSetSteps,
} from './domain.ts'
import { emptyData, isAppData } from './storage.ts'
import {
  addRoutineExercise, blankRoutine, extractHistoryRoutines, getRoutineExercises, instantiateRoutine,
  moveRoutineExercise, normalizeRoutineName, recoverHistoryRoutines, routineFromPlan, setRoutineExercises,
} from './routines.ts'

const settings = (changes = {}) => ({
  ...structuredClone(DEFAULT_SETTINGS), minutes: 180, goal: 'hypertrophy', level: 'advanced',
  muscles: ['chest', 'biceps', 'triceps'], ...changes,
})
const item = (exerciseId = 'barbell-bench', changes = {}) => ({
  id: `item-${exerciseId}`, exerciseId, sets: 3, repMin: 8, repMax: 12, restSeconds: 120,
  rir: 2, targetLoad: 40, ...changes,
})
const plan = (items = [item()], changes = {}) => ({
  id: 'original-plan', name: 'Petto', createdAt: '2026-08-01T09:00:00.000Z', settings: settings({ muscles: ['chest'] }),
  exercises: items, warmupSeconds: 300, reserveSeconds: 90, ...changes,
})
function session(name = 'Petto', day = 1, workout = plan(), changes = {}) {
  const date = `2026-08-${String(day).padStart(2, '0')}`
  return {
    id: `session-${day}`, plan: { ...structuredClone(workout), name }, startedAt: `${date}T09:00:00.000Z`,
    finishedAt: `${date}T11:00:00.000Z`,
    logs: workout.exercises.flatMap((entry) => Array.from({ length: entry.sets }, (_, setIndex) => ({
      id: `log-${day}-${entry.id}-${setIndex}`, planExerciseId: entry.id, setIndex,
      weight: isBodyweightExercise(getExercise(entry.exerciseId)) ? null : 40,
      reps: entry.repMax, rir: entry.rir, completedAt: `${date}T10:${String(setIndex).padStart(2, '0')}:00.000Z`,
    }))),
    ...changes,
  }
}
const freeze = (value) => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze)
    Object.freeze(value)
  }
  return value
}
function intensityPlan() {
  return plan([
    item('db-floor-press'),
    item('db-curl', { repMin: 10, repMax: 15, restSeconds: 75, supersetGroup: 'old-pair' }),
    item('cable-triceps', { repMin: 10, repMax: 15, restSeconds: 75, supersetGroup: 'old-pair' }),
    item('leg-extension', { repMin: 10, repMax: 15, restSeconds: 75, technique: 'drop-set' }),
  ], { settings: settings({ muscles: ['chest', 'biceps', 'triceps', 'legs'] }) })
}

test('name matching uses Italian case, canonical Unicode and whitespace without dropping accents or punctuation', () => {
  assert.equal(normalizeRoutineName('  P\u00c9TTO \t A\n'), 'p\u00e9tto a')
  assert.equal(normalizeRoutineName('Pe\u0301tto\u00a0A'), 'p\u00e9tto a')
  assert.equal(normalizeRoutineName('GIORNO I'), 'giorno i')
  assert.notEqual(normalizeRoutineName('Petto A'), normalizeRoutineName('Petto-A'))
  assert.notEqual(normalizeRoutineName('P\u00e9tto'), normalizeRoutineName('Petto'))
  assert.equal(normalizeRoutineName('  '), '')
})

test('extracts only the latest finished session per normalized name with deterministic date and id ties', () => {
  const older = session('PETTO A', 1)
  const recent = session(' Petto  A ', 2)
  const earlyStart = session('petto a', 2, plan(), { id: 'z-early', startedAt: '2026-08-02T08:00:00.000Z' })
  const tie = session('PeTTo A', 2, plan(), { id: 'z-latest' })
  const variant = session('Petto-A', 1, plan(), { id: 'variant' })
  const input = freeze([recent, earlyStart, older, tie, variant])
  const routines = extractHistoryRoutines(input)
  assert.deepEqual(routines, extractHistoryRoutines([...input].reverse()))
  assert.equal(routines.length, 2)
  const selected = routines.find((entry) => entry.historyKey === 'petto a')
  assert.equal(selected.sourceSessionId, 'z-latest')
  assert.equal(selected.name, 'PeTTo A')
  assert.equal(selected.plan.name, 'PeTTo A')
  assert.equal(selected.createdAt, tie.startedAt)
  assert.equal(selected.updatedAt, tie.finishedAt)
  assert.equal(selected.id, extractHistoryRoutines([older])[0].id)
  assert.notEqual(routines[0].id, routines[1].id)
  assert.equal(selected.source, 'history')
  assert.equal(selected.refreshLoads, true)
})

test('history identities do not collide for names a slug would conflate', () => {
  const names = ['A/B', 'A-B', 'A B', '\u00e0', 'a', '__proto__', 'constructor', '\ud800', '\ufffd']
  const routines = extractHistoryRoutines(names.map((name, index) => session(name, index + 1)))
  assert.equal(routines.length, names.length)
  assert.equal(new Set(routines.map((entry) => entry.id)).size, names.length)
})

test('skips unfinished, invalid dates, empty names, empty or mini-only sessions, and ambiguous legacy imports', () => {
  const good = session('Good')
  const legacy = session('Legacy', 2, plan(), { id: 'imported-session-old' })
  const repaired = { ...structuredClone(legacy), id: 'hevy-session-repaired',
    importSource: { format: 'hevy-csv', mappingVersion: 2, key: 'source' } }
  const invalid = [
    session('Unfinished', 2, plan(), { finishedAt: null }),
    session('Bad end', 2, plan(), { finishedAt: 'not-a-date' }),
    session('Bad start', 2, plan(), { startedAt: 'not-a-date' }),
    session('Reversed', 2, plan(), { finishedAt: '2026-08-01T00:00:00.000Z' }),
    session('Empty', 2, plan(), { logs: [] }), session(' ', 2),
    session('Mini only', 2, plan(), { logs: good.logs.map((log) => ({ ...log, part: 'drop' })) }),
    session('Foreign', 2, plan(), { logs: good.logs.map((log) => ({ ...log, planExerciseId: 'foreign' })) }),
    session('No reps', 2, plan(), { logs: good.logs.map((log) => ({ ...log, reps: 0 })) }),
  ]
  assert.deepEqual(extractHistoryRoutines([good, legacy, ...invalid]).map((entry) => entry.name), ['Good'])
  assert.equal(extractHistoryRoutines([repaired])[0].sourceSessionId, repaired.id)
})

test('partial native sessions preserve every intended exercise, prescription, variant and source spelling', () => {
  const workout = plan([
    item('machine-chest-press', { sourceExerciseName: 'Chest Press (Machine)', progressionNote: 'stale', targetLoad: 80 }),
    item('machine-decline-chest-press', { targetLoad: 77, sets: 4, repMin: 10, repMax: 15 }),
    item('push-up', { targetLoad: 10 }),
  ])
  const source = session('Partial', 1, workout)
  source.logs = [source.logs[0], { ...source.logs[1], weight: 55 }]
  const before = structuredClone(source)
  const routine = extractHistoryRoutines([freeze(source)])[0]
  assert.equal(routine.plan.exercises.length, 3)
  assert.deepEqual(routine.plan.exercises.map((entry) => entry.exerciseId), workout.exercises.map((entry) => entry.exerciseId))
  assert.equal(routine.plan.exercises[0].targetLoad, 55)
  assert.equal(routine.plan.exercises[0].sourceExerciseName, 'Chest Press (Machine)')
  assert.equal(Object.hasOwn(routine.plan.exercises[0], 'progressionNote'), false)
  assert.deepEqual(routine.plan.exercises[1], workout.exercises[1])
  assert.equal(routine.plan.exercises[2].targetLoad, null)
  routine.plan.exercises[0].sets = 1
  routine.plan.settings.muscles.push('legs')
  assert.deepEqual(source, before)
})

test('CSV recovery raises only copied estimated rests to exercise and personal minima without changing historical facts', () => {
  const workout = plan([
    item('machine-decline-chest-press', { sets: 9, repMin: 3, repMax: 6, restSeconds: 30 }),
    item('machine-chest-fly', { repMin: 10, repMax: 15, restSeconds: 30 }),
    item('machine-chest-press', { restSeconds: 240 }),
  ])
  const imported = session('CSV workout', 1, workout, {
    id: 'hevy-session-source', importSource: { format: 'hevy-csv', mappingVersion: 2, key: 'source-key' },
  })
  const native = session('Native workout', 2, workout)
  const history = freeze([imported, native])
  const before = structuredClone(history)
  const direct = extractHistoryRoutines(history)
  const csv = direct.find((entry) => entry.name === 'CSV workout')
  assert.deepEqual(csv.plan.exercises.map((entry) => entry.restSeconds), [120, 60, 240])
  assert.equal(csv.source, 'history')
  assert.equal(csv.sourceSessionId, imported.id)
  assert.deepEqual(direct.find((entry) => entry.name === 'Native workout').plan.exercises.map((entry) => entry.restSeconds), [30, 30, 240])
  const prescribedMinimum = structuredClone(imported)
  prescribedMinimum.plan.settings.minRestSeconds = 150
  assert.deepEqual(extractHistoryRoutines([prescribedMinimum])[0].plan.exercises.map((entry) => entry.restSeconds), [150, 150, 240])
  const data = { ...emptyData(), settings: settings({ minRestSeconds: 180 }), history }
  const recovered = recoverHistoryRoutines(data).data
  const saved = recovered.routines.find((entry) => entry.name === 'CSV workout')
  assert.deepEqual(saved.plan.exercises.map((entry) => entry.restSeconds), [180, 180, 240])
  assert.deepEqual(saved.plan.exercises.map(({ restSeconds: _rest, ...entry }) => entry),
    imported.plan.exercises.map(({ restSeconds: _rest, ...entry }) => entry))
  assert.equal(saved.plan.exercises[0].sets, 9)
  assert.deepEqual(validatePlan(saved.plan), [])
  assert.ok(routineVolumeWarnings(saved.plan).some((warning) => warning.includes('9 serie')))
  assert.equal(recovered.history, history)
  assert.deepEqual(history, before)
  saved.name = 'Manually renamed'
  saved.plan.exercises[0].restSeconds = 30
  const recoveredAgain = recoverHistoryRoutines(recovered)
  assert.equal(recoveredAgain.data, recovered)
  assert.equal(recoveredAgain.added, 0)
  assert.equal(saved.plan.exercises[0].restSeconds, 30, 'Explicit recovery never overwrites an existing edit')
})

test('recovery never overwrites edited or renamed originals and deduplicates custom names', () => {
  const history = [session('A'), session('B', 2), session('C', 3), session('Old', 4, plan(), { id: 'imported-session-ambiguous' })]
  const base = { ...emptyData(), history, routineHistoryInitialized: false }
  const initial = recoverHistoryRoutines(base)
  assert.equal(initial.added, 3)
  assert.equal(initial.existing, 0)
  assert.equal(initial.skippedLegacy, 1)
  assert.equal(initial.data.routineHistoryInitialized, true)
  const renamed = structuredClone(initial.data.routines.find((entry) => entry.name === 'A'))
  renamed.name = 'Completely renamed'
  renamed.plan.exercises[0].sets = 1
  renamed.refreshLoads = false
  const custom = routineFromPlan(plan(undefined, { name: ' b ' }))
  const unrelated = routineFromPlan(plan(undefined, { name: 'Personal' }))
  const edited = freeze({ ...base, routines: [renamed, custom, unrelated] })
  const recovered = recoverHistoryRoutines(edited)
  assert.equal(recovered.added, 1)
  assert.equal(recovered.existing, 2)
  assert.deepEqual(recovered.data.routines.slice(0, 3), edited.routines)
  assert.equal(recovered.data.history, edited.history)
  assert.equal(recovered.data.settings, edited.settings)
  assert.equal(recovered.data.routines[3].name, 'C')
  const again = recoverHistoryRoutines(recovered.data)
  assert.equal(again.added, 0)
  assert.equal(again.existing, 3)
  assert.equal(again.data, recovered.data)
  assert.equal(base.routines.length, 0)
})

test('explicit recovery may re-add a deleted routine while initialized empty recovery is a stable no-op', () => {
  const original = recoverHistoryRoutines({ ...emptyData(), history: [session()] }).data
  const deleted = { ...original, routines: [] }
  assert.equal(recoverHistoryRoutines(deleted).added, 1)
  const empty = emptyData()
  assert.equal(recoverHistoryRoutines(empty).data, empty)
  const pending = { ...empty, routineHistoryInitialized: false }
  assert.deepEqual(recoverHistoryRoutines(pending).data, empty)
})

test('blank drafts clone settings, have fresh identities and safe timing, and cannot start empty', () => {
  const request = freeze(settings())
  const first = blankRoutine(request)
  const second = blankRoutine(request)
  assert.equal(first.name, 'Nuova routine')
  assert.equal(first.plan.kind, 'routine')
  assert.equal(first.plan.routineId, first.id)
  assert.notEqual(first.id, second.id)
  assert.notEqual(first.plan.id, second.plan.id)
  assert.notEqual(first.plan.settings, request)
  assert.deepEqual(first.plan.exercises, [])
  assert.ok(first.plan.warmupSeconds >= 300 && first.plan.reserveSeconds >= 60)
  assert.ok(validatePlan(first.plan).some((error) => error.includes('vuoto')))
  assert.equal(isAppData({ ...emptyData(), routines: [first, second] }), true)
})

test('saving and instantiating independently clone all identities, supersets and mini-set prescriptions without logs', () => {
  const source = session('Supersets', 1, intensityPlan())
  source.plan.exercises[0].progressionNote = 'obsolete'
  const last = source.plan.exercises.at(-1)
  source.logs.push({ ...source.logs.at(-1), id: 'mini', part: 'drop', weight: 25, reps: 8 })
  const before = structuredClone(source)
  assert.deepEqual(validatePlan(source.plan), [])
  const recovered = extractHistoryRoutines([freeze(source)])[0]
  assert.equal(recovered.plan.exercises.at(-1).technique, last.technique)
  assert.equal(recovered.plan.exercises.at(-1).targetLoad, 40, 'Mini-set loads are not the next standard-set reference')
  const saved = routineFromPlan(source.plan)
  saved.refreshLoads = false
  saved.name = 'Renamed routine'
  const savedBefore = structuredClone(saved)
  const first = instantiateRoutine(freeze(saved), [source])
  const second = instantiateRoutine(saved, [source])
  assert.equal(first.name, 'Renamed routine')
  assert.equal(first.routineId, saved.id)
  assert.equal(first.kind, 'routine')
  for (const copy of [saved.plan, first, second]) {
    assert.notEqual(copy.id, source.plan.id)
    assert.ok(copy.exercises.every((entry) => !source.plan.exercises.some((old) => old.id === entry.id)))
    assert.equal(copy.exercises[1].supersetGroup, copy.exercises[2].supersetGroup)
    assert.notEqual(copy.exercises[1].supersetGroup, 'old-pair')
    assert.equal(copy.exercises[3].technique, 'drop-set')
    assert.equal(Object.hasOwn(copy, 'logs'), false)
    assert.equal(Object.hasOwn(copy, 'startedAt'), false)
    assert.ok(copy.exercises.every((entry) => !Object.hasOwn(entry, 'progressionNote')))
    assert.deepEqual(validatePlan(copy), [])
    assert.deepEqual(workoutSetSteps(copy).map((step) => [step.item.exerciseId, step.setIndex, step.part]),
      workoutSetSteps(source.plan).map((step) => [step.item.exerciseId, step.setIndex, step.part]))
  }
  assert.notEqual(first.id, second.id)
  assert.notEqual(first.exercises[0].id, second.exercises[0].id)
  assert.notEqual(first.exercises[1].supersetGroup, second.exercises[1].supersetGroup)
  first.settings.muscles.reverse()
  first.exercises[0].sets = 1
  assert.deepEqual(saved, savedBefore)
  assert.deepEqual(source, before)
})

test('rest-pause mini-set definitions survive extraction and independent instantiation', () => {
  const workout = intensityPlan()
  workout.exercises.at(-1).technique = 'rest-pause'
  const source = session('Rest pause', 1, workout)
  source.logs.push({ ...source.logs.at(-1), id: 'mini-rest', part: 'rest-pause', reps: 4, weight: 999 })
  const routine = extractHistoryRoutines([freeze(source)])[0]
  const instantiated = instantiateRoutine(routine, [source])
  assert.equal(instantiated.exercises.at(-1).technique, 'rest-pause')
  assert.equal(instantiated.exercises.at(-1).targetLoad, 40)
  assert.equal(workoutSetSteps(instantiated).at(-1).part, 'rest-pause')
  assert.equal(Object.hasOwn(instantiated, 'logs'), false)
  assert.equal(isAppData({ ...emptyData(), routines: [routine], history: [source], draft: instantiated }), true)
})

test('manual exercise additions use generator prescriptions and ordered primary muscle priorities', () => {
  const original = blankRoutine(settings({ goal: 'mixed', muscles: ['chest', 'back'] })).plan
  const one = addRoutineExercise(freeze(original), 'cable-row')
  assert.deepEqual(one.settings.muscles, ['back'])
  assert.deepEqual([one.exercises[0].sets, one.exercises[0].repMin, one.exercises[0].repMax, one.exercises[0].restSeconds], [3, 3, 6, 210])
  const two = addRoutineExercise(one, 'lat-pulldown')
  assert.equal(two.exercises[1].repMax, 12, 'Mixed goal keeps only the first focus compound heavy')
  const three = addRoutineExercise(two, 'close-push-up')
  assert.deepEqual(three.settings.muscles, ['back', 'triceps', 'chest'])
  assert.equal(three.exercises[2].targetLoad, null)
  const reordered = setRoutineExercises(three, [three.exercises[2], three.exercises[0], three.exercises[1]])
  assert.deepEqual(reordered.settings.muscles, ['triceps', 'chest', 'back'])
  assert.deepEqual(reordered.exercises.map((entry) => entry.id), [three.exercises[2].id, three.exercises[0].id, three.exercises[1].id])
  const empty = setRoutineExercises(reordered, [])
  assert.deepEqual(empty.settings.muscles, reordered.settings.muscles)
  assert.equal(original.exercises.length, 0)
  const beginner = addRoutineExercise(blankRoutine(settings({ level: 'beginner', minRestSeconds: 150 })).plan, 'db-curl')
  assert.deepEqual([beginner.exercises[0].sets, beginner.exercises[0].rir, beginner.exercises[0].restSeconds], [2, 3, 150])
})

test('manual picker and additions reject unknown, unavailable, avoided and duplicate exercises explicitly', () => {
  const draft = blankRoutine(settings()).plan
  const added = addRoutineExercise(draft, 'machine-decline-chest-press')
  assert.equal(added.exercises[0].exerciseId, 'machine-decline-chest-press')
  assert.deepEqual(validatePlan(added), [])
  assert.throws(() => addRoutineExercise(added, 'machine-decline-chest-press'), /gia presente/)
  assert.throws(() => addRoutineExercise(draft, 'unknown'), /sconosciuto/)
  assert.throws(() => setRoutineExercises(draft, [item(), item('barbell-bench', { id: 'different' })]), /gia presente/)
  assert.throws(() => setRoutineExercises(draft, [item(), item('cable-row', { id: 'item-barbell-bench' })]), /identificativo unico/)
  for (const changes of [
    { equipment: 'bodyweight' }, { equipment: 'dumbbells' },
    { avoidedIds: ['machine-decline-chest-press'] }, { avoidedPatterns: ['horizontal_push'] },
  ]) {
    const restricted = blankRoutine(settings(changes)).plan
    assert.ok(!getRoutineExercises(restricted.settings).some((entry) => entry.id === 'machine-decline-chest-press'))
    assert.throws(() => addRoutineExercise(restricted, 'machine-decline-chest-press'), /non compatibili/)
    assert.throws(() => setRoutineExercises(restricted, [item('machine-decline-chest-press')]), /non compatibili/)
  }
})

test('personal volume stays intact with warnings while timing and serialization limits still block invalid plans', () => {
  const original = plan([item('barbell-bench', { sets: 6 })])
  const routine = routineFromPlan(original).plan
  assert.deepEqual(validatePlan(routine), [])
  assert.ok(routineVolumeWarnings(routine).some((warning) => warning.includes('6 serie')))
  assert.equal(routine.exercises[0].sets, 6)
  assert.ok(validatePlan(original).some((error) => error.includes('limita le serie')))
  assert.deepEqual(routineVolumeWarnings(original), [])
  assert.ok(validatePlan({ ...routine, settings: { ...routine.settings, minutes: 5 } }).some((error) => error.includes('supera il tempo')))
  assert.ok(validatePlan({ ...routine, exercises: [item('barbell-bench', { sets: 13 })] }).some((error) => error.includes('12 serie')))
  const beginner = { ...routine, settings: { ...routine.settings, level: 'beginner' } }
  assert.ok(validatePlan(beginner).some((error) => error.includes('almeno 3')))
  const shortRest = { ...routine, exercises: [{ ...routine.exercises[0], restSeconds: 30 }] }
  assert.ok(validatePlan(shortRest).some((error) => error.includes('recupero')))
})

test('existing incompatible or duplicated historical rows can be corrected gradually without permitting new invalid additions', () => {
  const added = addRoutineExercise(blankRoutine(settings()).plan, 'barbell-bench')
  const restricted = { ...added, settings: { ...added.settings, equipment: 'bodyweight' } }
  const retained = setRoutineExercises(restricted, restricted.exercises)
  assert.ok(validatePlan(retained).some((error) => error.includes('incompatibile')))
  const expanded = addRoutineExercise(retained, 'close-push-up')
  const corrected = setRoutineExercises(expanded, expanded.exercises.filter((entry) => entry.exerciseId !== 'barbell-bench'))
  assert.deepEqual(validatePlan(corrected), [])
  assert.equal(added.exercises[0].exerciseId, 'barbell-bench')
  const repeated = plan([item(), item('barbell-bench', { id: 'second' }), item('barbell-bench', { id: 'third' })])
  const fewer = setRoutineExercises(repeated, repeated.exercises.slice(0, 2))
  assert.equal(fewer.exercises.length, 2)
  assert.deepEqual(validatePlan(setRoutineExercises(fewer, fewer.exercises.slice(0, 1))), [])
  const noted = { ...added, exercises: [{ ...added.exercises[0], progressionNote: 'Old focus increase' }] }
  assert.equal(setRoutineExercises(noted, noted.exercises).exercises[0].progressionNote, undefined)
})

test('CSV titles do not invent absent muscle blocks and current recovery minima remain part of the template', () => {
  const source = session('Petto e gambe', 1, plan([item()], { settings: settings({ muscles: ['chest', 'legs'] }) }), {
    importSource: { format: 'hevy-csv', mappingVersion: 2, key: 'synthetic' },
  })
  const data = { ...emptyData(), settings: settings({ minRestSeconds: 180 }), history: [source] }
  const recovered = recoverHistoryRoutines(data).data.routines[0]
  assert.deepEqual(recovered.plan.settings.muscles, ['chest'])
  assert.equal(recovered.plan.settings.minRestSeconds, 180)
  assert.equal(recovered.plan.exercises[0].restSeconds, 180)
  assert.deepEqual(source.plan.settings.muscles, ['chest', 'legs'])
  assert.equal(source.plan.exercises[0].restSeconds, 120)
})

test('row removal and reordering remove dangling supersets and techniques on the new focus anchor', () => {
  const original = freeze(intensityPlan())
  const separated = setRoutineExercises(original, [original.exercises[0], original.exercises[1], original.exercises[3], original.exercises[2]])
  assert.ok(separated.exercises.every((entry) => entry.supersetGroup === undefined))
  assert.equal(separated.exercises[2].technique, 'drop-set')
  assert.deepEqual(validatePlan(separated), [])
  const removed = setRoutineExercises(original, original.exercises.filter((entry) => entry.exerciseId !== 'db-curl'))
  assert.equal(removed.exercises[1].supersetGroup, undefined)
  const focused = setRoutineExercises(original, [original.exercises[3], ...original.exercises.slice(0, 3)])
  assert.deepEqual(focused.settings.muscles, ['legs', 'chest', 'biceps', 'triceps'])
  assert.equal(focused.exercises[0].technique, undefined)
  assert.deepEqual(validatePlan(focused), [])
  const pairFirst = setRoutineExercises(original, [original.exercises[1], original.exercises[2], original.exercises[0], original.exercises[3]])
  assert.ok(pairFirst.exercises.every((entry) => entry.supersetGroup === undefined))
  assert.equal(isAppData({ ...emptyData(), routines: [routineFromPlan(pairFirst)] }), true)
  assert.equal(original.exercises[1].supersetGroup, 'old-pair')
})

test('single-row moves use the same safe ordering rules and reject unknown rows, directions or out-of-range moves', () => {
  const original = freeze(intensityPlan())
  const moved = moveRoutineExercise(original, original.exercises[2].id, 1)
  assert.deepEqual(moved.exercises.map((entry) => entry.exerciseId), ['db-floor-press', 'db-curl', 'leg-extension', 'cable-triceps'])
  assert.ok(moved.exercises.every((entry) => entry.supersetGroup === undefined))
  assert.deepEqual(validatePlan(moved), [])
  assert.throws(() => moveRoutineExercise(original, original.exercises[0].id, -1), /fuori dai limiti/)
  assert.throws(() => moveRoutineExercise(original, original.exercises.at(-1).id, 1), /fuori dai limiti/)
  assert.throws(() => moveRoutineExercise(original, 'unknown', -1), /non presente/)
  assert.throws(() => moveRoutineExercise(original, original.exercises[0].id, 2), /non valida/)
})

test('fixed loads stay exact; refreshing uses conservative references and increases only the focus', () => {
  const workout = plan([
    item('barbell-bench', { repMin: 3, repMax: 6, restSeconds: 180, targetLoad: 70, progressionNote: 'old' }),
    item('cable-row', { repMin: 3, repMax: 6, restSeconds: 180, targetLoad: 80 }),
  ], { settings: settings({ muscles: ['chest', 'back'], goal: 'strength' }) })
  const history = [session('Other name', 1, workout), session('Latest', 2, workout)]
  for (const entry of history) entry.logs.forEach((log) => { log.weight = 100 })
  const saved = routineFromPlan(workout)
  saved.refreshLoads = false
  const fixed = instantiateRoutine(saved, history)
  assert.deepEqual(fixed.exercises.map((entry) => entry.targetLoad), [70, 80])
  assert.ok(fixed.exercises.every((entry) => entry.progressionNote === undefined))
  saved.refreshLoads = true
  const refreshed = instantiateRoutine(saved, freeze(history))
  assert.deepEqual(refreshed.exercises.map((entry) => entry.targetLoad), [102.5, 100])
  assert.match(refreshed.exercises[0].progressionNote, /Focus: proposta/)
  assert.match(refreshed.exercises[1].progressionNote, /Riferimento dallo storico/)
  assert.deepEqual(saved.plan.exercises.map((entry) => entry.targetLoad), [70, 80])
  assert.deepEqual(instantiateRoutine(saved, []).exercises.map((entry) => entry.targetLoad), [70, 80])
  const changed = structuredClone(saved)
  changed.plan.exercises[0].sets = 4
  assert.equal(instantiateRoutine(changed, history).exercises[0].targetLoad, 100)
  const partial = structuredClone(history)
  partial[1].logs.shift()
  assert.equal(instantiateRoutine(saved, partial).exercises[0].targetLoad, 100)
  const missingRir = structuredClone(history)
  missingRir[1].logs[0].rir = null
  assert.equal(instantiateRoutine(saved, missingRir).exercises[0].targetLoad, 100)
})

test('intensity work never drives increases, variant identities never borrow weights, and no history means saved reference', () => {
  const workout = intensityPlan()
  const history = [session('First', 1, workout), session('Second', 2, workout)]
  for (const entry of history) entry.logs.forEach((log) => { log.weight = 100 })
  const saved = routineFromPlan(workout)
  const started = instantiateRoutine(saved, history)
  assert.equal(started.exercises[1].targetLoad, 100)
  assert.equal(started.exercises[2].targetLoad, 100)
  assert.equal(started.exercises[3].targetLoad, 100)
  const variant = routineFromPlan(plan([
    item('machine-decline-chest-press', { targetLoad: 37 }),
    item('barbell-bench', { targetLoad: 61 }),
  ]))
  const machineOnly = session('Machines', 1, plan([item('machine-chest-press')]))
  machineOnly.logs.forEach((log) => { log.weight = 200 })
  assert.deepEqual(instantiateRoutine(variant, [machineOnly]).exercises.map((entry) => entry.targetLoad), [37, 61])
  const legacy = { ...machineOnly, id: 'imported-session-unsafe' }
  const same = routineFromPlan(machineOnly.plan)
  same.plan.exercises[0].targetLoad = 22
  assert.equal(instantiateRoutine(same, [legacy]).exercises[0].targetLoad, 22)
})

test('a newly selected focus intensity technique prevents an increase from older traditional exposures', () => {
  const traditional = plan([
    item('db-hammer-curl', { repMin: 10, repMax: 15, restSeconds: 75 }),
    item('db-curl', { repMin: 10, repMax: 15, restSeconds: 75 }),
  ], { settings: settings({ muscles: ['biceps'] }) })
  const history = [session('First', 1, traditional), session('Second', 2, traditional)]
  const saved = routineFromPlan(traditional)
  assert.equal(instantiateRoutine(saved, history).exercises[1].targetLoad, 41)
  saved.plan.exercises[1].technique = 'drop-set'
  assert.deepEqual(validatePlan(saved.plan), [])
  assert.equal(instantiateRoutine(saved, history).exercises[1].targetLoad, 40)
})

test('recovered personal volume is preserved while invalid historical recovery still blocks starting', () => {
  const source = session('Long history', 1, plan([item('machine-chest-press', { sets: 9, restSeconds: 30 })]))
  const routine = extractHistoryRoutines([source])[0]
  assert.equal(routine.plan.exercises[0].sets, 9)
  assert.equal(routine.plan.exercises[0].restSeconds, 30)
  assert.equal(isAppData({ ...emptyData(), history: [source], routines: [routine] }), true)
  const started = instantiateRoutine(routine, [source])
  assert.ok(routineVolumeWarnings(started).some((warning) => warning.includes('9 serie')))
  assert.ok(validatePlan(started).some((error) => error.includes('recupero')))
  assert.equal(started.exercises.length, 1)
  assert.equal(started.exercises[0].exerciseId, 'machine-chest-press')
})
