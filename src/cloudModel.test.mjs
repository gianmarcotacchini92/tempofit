import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { emptyData } from './storage.ts'
import {
  baselineFor, canonicalJson, cloudHead, CloudConflictError, hashPayload, hasLocalWork,
  mergeCloudData, parseCloudBaseline, parseCloudData, sameAppData,
} from './cloudModel.ts'

const date = '2026-08-01T10:00:00.000Z'
const snapshot = (data) => ({ revision: crypto.randomUUID(), data })
const session = (id = 'session') => ({
  id, startedAt: date, finishedAt: date,
  plan: {
    id: `plan-${id}`, name: 'Original CSV name', createdAt: date, settings: emptyData().settings,
    exercises: [{
      id: 'exercise', exerciseId: 'db-curl', sets: 3, repMin: 8, repMax: 12,
      restSeconds: 75, rir: 2, targetLoad: 12, sourceExerciseName: 'Curl (Dumbbell)',
    }],
    warmupSeconds: 300, reserveSeconds: 90,
  },
  logs: [{
    id: 'log', planExerciseId: 'exercise', setIndex: 0, weight: 12, reps: 10,
    rir: null, completedAt: date, sourceSetIndex: 4,
  }],
})
const data = (...ids) => ({ ...emptyData(), history: ids.map((id) => session(id)) })
const freeze = (value) => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze)
    Object.freeze(value)
  }
  return value
}

test('canonical JSON sorts keys recursively, preserves arrays and follows undefined JSON semantics', () => {
  const input = { z: undefined, a: [undefined, undefined, { z: 2, a: 1 }], b: 'line\n"quoted"' }
  assert.equal(canonicalJson(input), '{"a":[null,null,{"a":1,"z":2}],"b":"line\\n\\"quoted\\""}')
  assert.equal(canonicalJson(new Array(2)), '[null,null]')
  assert.equal(canonicalJson({ z: 1, a: 2 }), canonicalJson({ a: 2, z: 1 }))
  assert.notEqual(canonicalJson([1, 2]), canonicalJson([2, 1]))
  const repeated = { x: 1 }
  assert.equal(canonicalJson([repeated, repeated]), '[{"x":1},{"x":1}]')
})

test('canonical JSON rejects cycles, unsupported values, getters and nonfinite numbers', () => {
  const cyclic = {}; cyclic.self = cyclic
  const accessorArray = []
  Object.defineProperty(accessorArray, '0', { get() { return 1 } })
  for (const value of [
    cyclic, undefined, NaN, Infinity, -Infinity, 1n, Symbol('id'), () => {}, new Date(),
    new Map(), { bad: () => {} }, [Symbol('x')], { [Symbol('x')]: 1 }, { get value() { return 1 } }, accessorArray,
  ]) assert.throws(() => canonicalJson(value))
})

test('SHA-256 is lowercase, key-order independent, and distinguishes payload contents', async () => {
  const left = canonicalJson({ id: '__proto__', log: { reps: 8, weight: 12 } })
  const right = canonicalJson({ log: { weight: 12, reps: 8 }, id: '__proto__' })
  assert.equal(await hashPayload(left), createHash('sha256').update(left).digest('hex'))
  assert.equal(await hashPayload(left), await hashPayload(right))
  assert.notEqual(await hashPayload(left), await hashPayload(canonicalJson({ id: '__proto__', log: { reps: 9, weight: 12 } })))
  assert.match(await hashPayload(''), /^[a-f0-9]{64}$/)
})

test('parsing preserves every historical fact and legacy CSV trust markers without mutating callers', () => {
  const original = data('imported-session-untrusted')
  const before = structuredClone(original)
  freeze(original)
  const parsed = parseCloudData(original)
  assert.deepEqual(parsed, before)
  assert.equal(Object.hasOwn(parsed.history[0], 'importSource'), false)
  parsed.history[0].logs[0].weight = 99
  assert.deepEqual(original, before)
  const repaired = data('imported-session-repaired')
  repaired.history[0].importSource = { format: 'hevy-csv', mappingVersion: 2, key: 'source-key' }
  assert.deepEqual(parseCloudData(repaired), repaired)
})

test('invalid history, duplicate IDs, unknown schemas never become an empty workspace', () => {
  for (const invalid of [
    data('same', 'same'), { ...data('valid'), version: 3 },
    { ...data('valid'), history: [session('good'), { id: 'broken' }] },
    { ...emptyData(), version: '2' }, null, {},
  ]) assert.throws(() => parseCloudData(invalid))
  const legacy = data('legacy')
  legacy.version = 1
  legacy.settings.muscles = ['arms']
  const migrated = parseCloudData(legacy)
  assert.equal(migrated.version, 2)
  assert.deepEqual(migrated.settings.muscles, ['biceps', 'triceps'])
  assert.deepEqual(migrated.history, legacy.history)
  assert.equal(legacy.version, 1)
})

test('comparison ignores only history ordering, never settings, head or log order/content', () => {
  const original = freeze(data('z', 'a'))
  const reordered = { ...original, history: [...original.history].reverse() }
  assert.equal(sameAppData(original, reordered), true)
  for (const change of [
    { settings: { ...original.settings, minutes: 60 } },
    { restEndsAt: 42 }, { draft: session().plan },
    { active: { ...session(), finishedAt: null } },
    { history: [session('z')] },
  ]) assert.equal(sameAppData(original, { ...original, ...change }), false)
  const edited = structuredClone(original)
  edited.history[0].logs[0].sourceSetIndex++
  assert.equal(sameAppData(original, edited), false)
  assert.equal(sameAppData(null, null), true)
  assert.equal(sameAppData(original, null), false)
  assert.deepEqual(original.history.map((entry) => entry.id), ['z', 'a'])
  assert.equal(Object.hasOwn(cloudHead(original), 'history'), false)
})

test('empty history does not erase customized settings or a live timer', () => {
  assert.equal(hasLocalWork(emptyData()), false)
  assert.equal(hasLocalWork({ ...emptyData(), settings: { ...emptyData().settings, minutes: 60 } }), true)
  assert.equal(hasLocalWork({ ...emptyData(), restEndsAt: 1 }), true)
  assert.equal(hasLocalWork({ ...emptyData(), draft: session().plan }), true)
  assert.equal(hasLocalWork({ ...emptyData(), active: { ...session(), finishedAt: null } }), true)
  assert.equal(hasLocalWork(data('work')), true)
})

test('baseline caches only head and full-session SHA fingerprints, far smaller than a real history', async () => {
  const large = data(...Array.from({ length: 120 }, (_, i) => `session-${i}`))
  for (const entry of large.history) entry.plan.exercises[0].progressionNote = 'Original prescription and notes. '.repeat(180)
  const remote = snapshot(freeze(large))
  const baseline = await baselineFor(remote)
  assert.equal(baseline.sessions.length, 120)
  assert.ok(canonicalJson(baseline).length < canonicalJson(large).length / 15)
  assert.equal(baseline.sessions[0].hash, await hashPayload(canonicalJson(large.history[0])))
  assert.deepEqual(parseCloudBaseline(baseline), baseline)
  assert.deepEqual(await baselineFor({ revision: null, data: null }), { revision: null, head: null, sessions: [] })
})

test('baseline validation rejects corrupt metadata, duplicates, invalid head and unsupported versions', async () => {
  const baseline = await baselineFor(snapshot(data('__proto__', 'constructor')))
  for (const invalid of [
    {}, null, { ...baseline, revision: 'bad' }, { ...baseline, revision: null },
    { ...baseline, head: { ...baseline.head, history: [] } },
    { ...baseline, head: { ...baseline.head, version: 3 } },
    { ...baseline, head: { ...baseline.head, active: {} } },
    { ...baseline, head: null }, { ...baseline, sessions: [...baseline.sessions, baseline.sessions[0]] },
    { ...baseline, sessions: [{ id: 'x', hash: '0'.repeat(63) }] },
    { ...baseline, sessions: [{ id: 1, hash: '0'.repeat(64) }] },
    { ...baseline, extra: true }, { revision: null, head: null, sessions: [{}] },
  ]) assert.equal(parseCloudBaseline(invalid), null)
  assert.deepEqual(parseCloudBaseline(baseline), baseline)
  await assert.rejects(baselineFor({ revision: null, data: emptyData() }))
})

test('separate-device additions merge by ID, safely including malicious prototype strings', async () => {
  const baseData = freeze(data('old'))
  const local = freeze(data('old', '__proto__', 'constructor'))
  const remote = freeze(data('old', 'toString', 'hasOwnProperty', 'a/b'))
  const result = await mergeCloudData(await baselineFor(snapshot(baseData)), local, remote)
  assert.deepEqual(result.conflicts, [])
  assert.deepEqual(result.data.history.map((entry) => entry.id), ['old', '__proto__', 'constructor', 'toString', 'hasOwnProperty', 'a/b'])
  assert.deepEqual(result.data.history[1], local.history[1])
  assert.equal({}.polluted, undefined)
  const payload = JSON.parse('{"__proto__":{"polluted":true},"constructor":"safe"}')
  assert.equal(canonicalJson(payload), '{"__proto__":{"polluted":true},"constructor":"safe"}')
})

test('one-sided deletion, repair and undo are preserved; competing changes require resolution', async () => {
  const original = data('imported-session-legacy', 'deleted')
  const baseline = await baselineFor(snapshot(original))
  const local = structuredClone(original)
  local.history.pop()
  const remote = structuredClone(original)
  remote.history[0].importSource = { format: 'hevy-csv', mappingVersion: 2, key: 'repaired' }
  remote.history[0].logs[0].weight = 22
  const result = await mergeCloudData(baseline, local, remote)
  assert.deepEqual(result.conflicts, [])
  assert.deepEqual(result.data.history, [remote.history[0]])
  const undo = structuredClone(original)
  undo.history[0].logs = []
  const conflicted = await mergeCloudData(baseline, undo, remote)
  assert.equal(conflicted.data, null)
  assert.deepEqual(conflicted.conflicts, ['history:imported-session-legacy'])
  const deletion = { ...original, history: [original.history[1]] }
  assert.deepEqual((await mergeCloudData(baseline, deletion, remote)).conflicts, ['history:imported-session-legacy'])
  assert.deepEqual((await mergeCloudData(baseline, deletion, original)).data.history, [original.history[1]])
})

test('same-ID independent additions conflict and identical changes converge', async () => {
  const base = await baselineFor(snapshot(emptyData()))
  const local = data('new')
  const remote = data('new')
  remote.history[0].logs[0].reps++
  assert.deepEqual((await mergeCloudData(base, local, remote)).conflicts, ['history:new'])
  assert.equal(sameAppData((await mergeCloudData(base, local, local)).data, local), true)
})

test('head is one atomic plan/settings/active/timer group, not field-wise last-write-wins', async () => {
  const original = data('old')
  const baseline = await baselineFor(snapshot(original))
  const local = { ...original, settings: { ...original.settings, minutes: 60 } }
  const remote = { ...original, active: { ...session('active'), finishedAt: null }, restEndsAt: 12345 }
  assert.deepEqual(await mergeCloudData(baseline, local, remote), { data: null, conflicts: ['head'] })
  const oneSided = await mergeCloudData(baseline, data('old', 'new'), remote)
  assert.deepEqual(cloudHead(oneSided.data), cloudHead(remote))
  assert.equal(oneSided.data.history.length, 2)
})

test('mini-set logs and mini-set undo/repair stay atomic without changing historical volume', async () => {
  const original = data('mini')
  const entry = original.history[0]
  entry.plan.settings = { ...entry.plan.settings, goal: 'hypertrophy', muscles: ['chest', 'biceps'] }
  entry.plan.exercises.unshift({
    ...entry.plan.exercises[0], id: 'anchor', exerciseId: 'db-floor-press',
  })
  Object.assign(entry.plan.exercises[1], { sets: 1, repMin: 10, repMax: 15, technique: 'drop-set' })
  entry.logs.push({ ...entry.logs[0], id: 'mini-log', part: 'drop', reps: 6, weight: 8 })
  assert.deepEqual(parseCloudData(original), original)
  const baseline = await baselineFor(snapshot(original))
  const undo = structuredClone(original)
  undo.history[0].logs.pop()
  const otherDevice = { ...original, history: [...original.history, session('other')] }
  const merged = await mergeCloudData(baseline, undo, otherDevice)
  assert.deepEqual(merged.data.history[0], undo.history[0])
  const repair = structuredClone(original)
  repair.history[0].logs[1].weight = 7
  assert.deepEqual((await mergeCloudData(baseline, undo, repair)).conflicts, ['history:mini'])
})

test('CAS error carries the latest snapshot without changing it', () => {
  const latest = snapshot(data('server'))
  const error = new CloudConflictError(latest)
  assert.ok(error instanceof Error)
  assert.equal(error.latest, latest)
  assert.equal(error.name, 'CloudConflictError')
})
