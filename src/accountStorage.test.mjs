import test from 'node:test'
import assert from 'node:assert/strict'
import { accountStorageKey, loadAccount, saveAccount } from './accountStorage.ts'
import { baselineFor } from './cloudModel.ts'
import { emptyData } from './storage.ts'

function storage() {
  const entries = new Map()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
  } })
  return entries
}

test('account caches are separate from guests and each other', () => {
  const entries = storage()
  entries.set('tempofit.local.v1', 'original guest')
  const a = emptyData()
  a.settings.minutes = 120
  saveAccount('a', a)
  saveAccount('b', emptyData())
  assert.equal(loadAccount('a').data.settings.minutes, 120)
  assert.equal(loadAccount('b').data.settings.minutes, emptyData().settings.minutes)
  assert.equal(loadAccount('c').kind, 'missing')
  assert.equal(entries.get('tempofit.local.v1'), 'original guest')
})

test('invalid owner, malformed JSON and baseline never replace their raw copies', () => {
  const entries = storage()
  const key = accountStorageKey('a')
  for (const raw of ['broken', JSON.stringify({ version: 1, uid: 'b', data: emptyData(), baseline: null }),
    JSON.stringify({ version: 1, uid: 'a', data: emptyData(), baseline: { broken: true } })]) {
    entries.set(key, raw)
    assert.equal(loadAccount('a').kind, 'error')
    assert.equal(entries.get(key), raw)
  }
})

test('a trusted baseline round-trips without duplicating the history', async () => {
  storage()
  const data = emptyData()
  const baseline = await baselineFor({ revision: crypto.randomUUID(), data })
  saveAccount('a', data, baseline)
  assert.deepEqual(loadAccount('a'), { kind: 'ready', data, baseline })
  assert.equal('history' in baseline.head, false)
})

test('storage write errors propagate and do not become successful saves', () => {
  storage()
  localStorage.setItem = () => { throw new DOMException('full', 'QuotaExceededError') }
  assert.throws(() => saveAccount('a', emptyData()), /full/)
  assert.throws(() => accountStorageKey('../a'), /non valido/)
})
