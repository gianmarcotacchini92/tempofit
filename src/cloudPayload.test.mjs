import test from 'node:test'
import assert from 'node:assert/strict'
import { generatePlan, DEFAULT_SETTINGS } from './domain.ts'
import { emptyData } from './storage.ts'
import { canonicalJson, sameAppData } from './cloudModel.ts'
import { CLOUD_DOCUMENT_BYTES, parseManifest, prepareCloudData, restoreCloudData } from './cloudPayload.ts'

function dataWithHistory(count = 1) {
  const data = emptyData()
  const { plan } = generatePlan(DEFAULT_SETTINGS)
  for (let index = 0; index < count; index++) {
    data.history.push({ id: `session-${index}`, plan: { ...structuredClone(plan), name: 'Workout '.repeat(180) },
      startedAt: '2026-06-01T10:00:00.000Z', finishedAt: '2026-06-01T11:00:00.000Z',
      logs: [{ id: 'set-1', planExerciseId: plan.exercises[0].id, setIndex: 0, weight: 40, reps: 5, rir: 2, completedAt: '2026-06-01T10:01:00.000Z' }] })
  }
  return data
}

test('history larger than one megabyte round-trips across immutable documents', async () => {
  const data = dataWithHistory(400)
  assert.ok(canonicalJson(data).length > 1024 * 1024)
  const prepared = await prepareCloudData(data)
  const manifest = parseManifest({ schemaVersion: 1, revision: crypto.randomUUID(), state: prepared.state, sessions: prepared.history.map((entry) => entry.key) })
  assert.ok(canonicalJson(manifest).length < CLOUD_DOCUMENT_BYTES)
  const documents = new Map(prepared.history.map(({ key, payload }) => [key, { schemaVersion: 1, payload }]))
  assert.ok(sameAppData(data, await restoreCloudData(manifest, documents)))
  assert.equal(new Set(prepared.history.map((entry) => entry.key)).size, 400)
})

test('missing and altered history documents fail instead of dropping sessions', async () => {
  const prepared = await prepareCloudData(dataWithHistory())
  const manifest = parseManifest({ schemaVersion: 1, revision: crypto.randomUUID(), state: prepared.state, sessions: prepared.history.map((entry) => entry.key) })
  await assert.rejects(restoreCloudData(manifest, new Map()), /incompleto/)
  const entry = prepared.history[0]
  await assert.rejects(restoreCloudData(manifest, new Map([[entry.key, { schemaVersion: 1, payload: `${entry.payload} ` }]])), /integro/)
})

test('oversized heads, sessions and manifests are rejected before writes', async () => {
  const largeSession = dataWithHistory()
  largeSession.history[0].plan.name = 'x'.repeat(CLOUD_DOCUMENT_BYTES)
  await assert.rejects(prepareCloudData(largeSession), /singola seduta/)
  const largeHead = emptyData()
  largeHead.settings.avoidedIds = ['x'.repeat(CLOUD_DOCUMENT_BYTES)]
  await assert.rejects(prepareCloudData(largeHead), /documento Firebase/)
  assert.throws(() => parseManifest({ schemaVersion: 1, revision: crypto.randomUUID(), state: '{}', sessions: Array(5001).fill('a'.repeat(64)) }), /compatibile/)
})
