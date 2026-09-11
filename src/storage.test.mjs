import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SETTINGS, generatePlan } from './domain.ts'
import { decodeData, emptyData, isAppData, loadData, STORAGE_KEY } from './storage.ts'
import { blankRoutine, routineFromPlan } from './routines.ts'

function dataWithSession() {
  const { plan } = generatePlan(DEFAULT_SETTINGS)
  assert.ok(plan)
  return {
    ...emptyData(),
    active: {
      id: 'session', plan, startedAt: new Date().toISOString(), finishedAt: null,
      logs: [{ id: 'log', planExerciseId: plan.exercises[0].id, setIndex: 0, weight: 20, reps: 5, rir: null, completedAt: new Date().toISOString() }],
    },
    restEndsAt: Date.now() + 120000,
  }
}

test('fresh state and populated active state round-trip through JSON', () => {
  assert.equal(isAppData(JSON.parse(JSON.stringify(emptyData()))), true)
  assert.equal(isAppData(JSON.parse(JSON.stringify(dataWithSession()))), true)
})

test('legacy backups keep optional accessory and rest fields absent, without changing sessions', () => {
  const data = dataWithSession()
  for (const settings of [data.settings, data.active.plan.settings]) {
    delete settings.includeAccessories
    delete settings.minRestSeconds
  }
  const copy = JSON.parse(JSON.stringify(data))
  assert.equal(isAppData(copy), true)
  assert.deepEqual(copy, data)
  data.settings.includeAccessories = true
  data.settings.minRestSeconds = 120
  assert.equal(isAppData(JSON.parse(JSON.stringify(data))), true)
  data.settings.includeAccessories = 'yes'
  assert.equal(isAppData(data), false)
  data.settings.includeAccessories = true
  data.settings.minRestSeconds = -1
  assert.equal(isAppData(data), false)
})

test('unknown catalog IDs, duplicate logs, and foreign series are rejected', () => {
  const unknown = dataWithSession()
  unknown.active.plan.exercises[0].exerciseId = 'invented-exercise'
  assert.equal(isAppData(unknown), false)
  const duplicated = dataWithSession()
  duplicated.active.logs.push({ ...duplicated.active.logs[0], id: 'second' })
  assert.equal(isAppData(duplicated), false)
  const foreign = dataWithSession()
  foreign.active.logs[0].planExerciseId = 'another-workout'
  assert.equal(isAppData(foreign), false)
})

test('invalid numeric data and missing RIR are distinguished', () => {
  const valid = dataWithSession()
  assert.equal(isAppData(valid), true)
  valid.active.logs[0].rir = 11
  assert.equal(isAppData(valid), false)
  const invalid = dataWithSession()
  invalid.active.logs[0].reps = -2
  assert.equal(isAppData(invalid), false)
  assert.equal(isAppData({ ...emptyData(), restEndsAt: Infinity }), false)
})

test('malformed storage is reported and never overwritten', () => {
  let writes = 0
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem(key) { assert.equal(key, STORAGE_KEY); return '{broken' },
    setItem() { writes++ },
  } })
  const loaded = loadData()
  assert.ok(loaded.error)
  assert.equal(writes, 0)
  delete globalThis.localStorage
})

function legacyData() {
  const data = dataWithSession()
  data.version = 1
  delete data.routines
  delete data.routineHistoryInitialized
  data.draft = structuredClone(data.active.plan)
  data.history = [{ ...structuredClone(data.active), id: 'finished-session', finishedAt: new Date().toISOString() }]
  data.settings.muscles = ['back', 'arms', 'glutes', 'legs']
  data.draft.settings.muscles = ['arms', 'chest']
  data.active.plan.settings.muscles = ['glutes', 'legs', 'arms']
  data.history[0].plan.settings.muscles = ['legs', 'glutes', 'arms']
  data.history[0].plan.name = 'Braccia e glutei'
  data.active.plan.exercises[0].exerciseId = 'db-glute-bridge'
  data.history[0].plan.exercises[0].exerciseId = 'db-curl'
  return data
}

test('v1 migration deduplicates anatomy in order, preserving original sessions, prescriptions and logs', () => {
  const legacy = legacyData()
  const before = structuredClone(legacy)
  assert.equal(isAppData(legacy), false)
  const decoded = decodeData(legacy)
  assert.ok(decoded?.migrated)
  const { data } = decoded
  assert.equal(data.version, 3)
  assert.deepEqual(data.routines, [])
  assert.equal(data.routineHistoryInitialized, false)
  assert.equal(decoded.schemaUpgraded, true)
  assert.deepEqual(data.settings.muscles, ['back', 'biceps', 'triceps', 'legs'])
  assert.deepEqual(data.draft.settings.muscles, ['biceps', 'triceps', 'chest'])
  assert.deepEqual(data.active.plan.settings.muscles, ['legs', 'biceps', 'triceps'])
  assert.deepEqual(data.history[0].plan.settings.muscles, ['legs', 'biceps', 'triceps'])
  assert.equal(data.history[0].plan.name, 'Braccia e glutei')
  assert.deepEqual(legacy, before, 'The source backup is never modified')
  for (const key of ['id', 'startedAt', 'finishedAt', 'logs']) {
    assert.deepEqual(data.active[key], before.active[key])
    assert.deepEqual(data.history[0][key], before.history[0][key])
  }
  for (const key of ['id', 'createdAt', 'exercises', 'warmupSeconds', 'reserveSeconds']) {
    assert.deepEqual(data.draft[key], before.draft[key])
    assert.deepEqual(data.active.plan[key], before.active.plan[key])
    assert.deepEqual(data.history[0].plan[key], before.history[0].plan[key])
  }
  assert.equal(data.restEndsAt, legacy.restEndsAt)
  assert.deepEqual(decodeData(JSON.parse(JSON.stringify(data))), { data, migrated: false })
})

test('storage loading and imports use the same migration; invalid legacy backups are not repaired into valid data', () => {
  const legacy = legacyData()
  let writes = 0
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem() { return JSON.stringify(legacy) }, setItem() { writes++ },
  } })
  try {
    const loaded = loadData()
    assert.equal(loaded.error, null)
    assert.match(loaded.notice, /Bicipiti, poi Tricipiti/)
    assert.deepEqual(loaded.data, decodeData(legacy).data)
    assert.equal(writes, 0)
    legacy.active.logs.push({ ...legacy.active.logs[0], id: 'duplicate-set' })
    assert.equal(decodeData(legacy), null)
    assert.ok(loadData().error)
    assert.equal(writes, 0)
  } finally { delete globalThis.localStorage }
  for (const change of [
    (data) => { data.settings.muscles.push('unknown-muscle') },
    (data) => { data.history[0].plan.exercises[0].exerciseId = 'unknown' },
    (data) => { data.version = 4 },
    (data) => { data.draft.exercises[0].progressionNote = 42 },
  ]) {
    const data = legacyData()
    change(data)
    assert.equal(decodeData(data), null)
  }
})

test('v2 schema upgrade is pure, preserves the entire workspace, and has no anatomy notice', () => {
  const legacy = dataWithSession()
  legacy.version = 2
  delete legacy.routines
  delete legacy.routineHistoryInitialized
  legacy.draft = structuredClone(legacy.active.plan)
  legacy.history = [{ ...structuredClone(legacy.active), id: 'past', finishedAt: new Date().toISOString() }]
  const before = structuredClone(legacy)
  const decoded = decodeData(legacy)
  assert.equal(decoded.migrated, false)
  assert.equal(decoded.schemaUpgraded, true)
  assert.deepEqual(decoded.data, { ...before, version: 3, routines: [], routineHistoryInitialized: false })
  assert.deepEqual(legacy, before)
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem() { return JSON.stringify(legacy) },
    setItem() { assert.fail('Loading must not write') },
  } })
  try {
    assert.equal(loadData().notice, undefined)
    assert.equal(loadData().error, null)
  } finally { delete globalThis.localStorage }
})

test('schema3 stores empty routine drafts and invalid programming without allowing a corrupt shape', () => {
  const data = emptyData()
  assert.equal(data.version, 3)
  assert.equal(data.routineHistoryInitialized, true)
  data.routines = [blankRoutine(data.settings)]
  assert.equal(isAppData(data), true)
  const populated = dataWithSession()
  populated.routines = [routineFromPlan(populated.active.plan)]
  populated.routines[0].plan.exercises[0].restSeconds = 30
  assert.equal(isAppData(populated), true, 'An unsafe rest can be saved for editing, not started')
  assert.deepEqual(decodeData(JSON.parse(JSON.stringify(populated))), { data: populated, migrated: false })
  for (const corrupt of [
    (copy) => { delete copy.routines },
    (copy) => { delete copy.routineHistoryInitialized },
    (copy) => { copy.routineHistoryInitialized = 1 },
    (copy) => { copy.routines = null },
    (copy) => { copy.routines[0].id = '' },
    (copy) => { copy.routines.push(structuredClone(copy.routines[0])) },
    (copy) => { copy.routines[0].name = ' ' },
    (copy) => { copy.routines[0].source = 'unknown' },
    (copy) => { copy.routines[0].refreshLoads = 'yes' },
    (copy) => { copy.routines[0].createdAt = 'broken' },
    (copy) => { copy.routines[0].updatedAt = '2000-01-01' },
    (copy) => { copy.routines[0].historyKey = 1 },
    (copy) => { copy.routines[0].sourceSessionId = [] },
    (copy) => { copy.routines[0].plan.exercises[0].exerciseId = 'unknown' },
    (copy) => { copy.routines[0].plan.exercises[0].targetLoad = Infinity },
    (copy) => { copy.routines[0].plan.exercises.push(structuredClone(copy.routines[0].plan.exercises[0])) },
    (copy) => { copy.routines[0].plan.kind = 'automatic' },
    (copy) => { copy.routines[0].plan.routineId = 1 },
    (copy) => { copy.active.plan.kind = 'automatic' },
    (copy) => { copy.draft = { ...copy.active.plan, routineId: '' } },
    (copy) => { copy.version = 4 },
  ]) {
    const copy = structuredClone(populated)
    corrupt(copy)
    assert.equal(isAppData(copy), false)
    assert.equal(decodeData(copy), null)
  }
})
