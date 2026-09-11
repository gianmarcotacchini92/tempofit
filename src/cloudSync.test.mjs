import test from 'node:test'
import assert from 'node:assert/strict'
import { setImmediate as immediate } from 'node:timers/promises'
import { emptyData } from './storage.ts'
import { baselineFor, CloudConflictError, sameAppData } from './cloudModel.ts'
import { CloudSyncSession } from './cloudSync.ts'

const date = '2026-08-01T10:00:00.000Z'
const snapshot = (data) => ({ revision: data ? crypto.randomUUID() : null, data: structuredClone(data) })
const data = (...ids) => ({
  ...emptyData(),
  history: ids.map((id) => ({
    id, startedAt: date, finishedAt: date,
    plan: {
      id: `plan-${id}`, name: 'Original workout', createdAt: date, settings: emptyData().settings,
      exercises: [{
        id: 'exercise', exerciseId: 'db-curl', sets: 3, repMin: 8, repMax: 12,
        restSeconds: 75, rir: 2, targetLoad: 12,
      }],
      warmupSeconds: 300, reserveSeconds: 90,
    },
    logs: [{ id: 'log', planExerciseId: 'exercise', setIndex: 0, weight: 12, reps: 10, rir: null, completedAt: date }],
  })),
})
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
async function until(predicate) {
  const deadline = Date.now() + 4000
  while (!predicate()) {
    if (Date.now() > deadline) assert.fail('Timed out waiting for synchronization')
    await immediate()
  }
}

function harness(t, local, remote = snapshot(null), baseline) {
  const h = {
    local: structuredClone(local), server: structuredClone(remote), statuses: [], savedBaselines: [],
    backups: [], applied: [], writes: [], reads: 0, watchers: [], stoppedWatchers: 0, blocked: false,
    backupError: null, applyError: null, rememberError: null, readOverride: null, writeOverride: null,
  }
  h.emit = (next) => {
    h.server = structuredClone(next)
    for (const watcher of h.watchers) if (watcher.active) watcher.receive(structuredClone(next))
  }
  h.transport = {
    async read() {
      h.reads++
      return h.readOverride ? h.readOverride() : structuredClone(h.server)
    },
    async write(value, expectedRevision) {
      h.writes.push({ data: structuredClone(value), expectedRevision })
      if (h.writeOverride) return h.writeOverride(value, expectedRevision)
      if (expectedRevision !== h.server.revision) throw new CloudConflictError(structuredClone(h.server))
      const saved = snapshot(value)
      h.emit(saved)
      return saved
    },
    watch(receive, error) {
      const watcher = { receive, error, active: true }
      h.watchers.push(watcher)
      return () => { watcher.active = false; h.stoppedWatchers++ }
    },
  }
  h.ports = {
    local: () => h.local,
    blocked: () => h.blocked,
    apply(value) {
      if (h.applyError) throw h.applyError
      h.applied.push(structuredClone(value))
      h.local = value
    },
    remember(value) {
      if (h.rememberError) throw h.rememberError
      h.savedBaselines.push(structuredClone(value))
    },
    backup(value) {
      if (h.backupError) throw h.backupError
      h.backups.push(structuredClone(value))
    },
    status(value) { h.statuses.push(value) },
    describeError: (error) => error.message ?? String(error),
  }
  h.sync = new CloudSyncSession(h.transport, h.ports, baseline)
  h.phase = () => h.statuses.at(-1)?.phase
  h.edit = (value) => { h.local = value; h.sync.localChanged() }
  t.after(() => h.sync.stop())
  return h
}

test('first link with meaningful local work needs consent; settings-only customization counts', async (t) => {
  for (const local of [data('local'), { ...emptyData(), settings: { ...emptyData().settings, minutes: 60 } }]) {
    const h = harness(t, local, snapshot(data('remote')))
    await h.sync.start()
    assert.equal(h.phase(), 'choice')
    assert.equal(h.statuses.at(-1).canUseRemote, true)
    await h.sync.flush()
    assert.equal(h.writes.length, 0)
    assert.equal(h.applied.length, 0)
    assert.equal(h.savedBaselines.length, 0)
    await h.sync.chooseLocal()
    assert.deepEqual(h.backups, [data('remote')])
    assert.equal(h.writes.length, 1)
    assert.equal(sameAppData(h.server.data, local), true)
    assert.equal(h.phase(), 'synced')
  }
})

test('remote absence asks activation even for an empty workspace', async (t) => {
  const h = harness(t, emptyData())
  await h.sync.start()
  assert.equal(h.phase(), 'choice')
  assert.equal(h.statuses.at(-1).canUseRemote, false)
  await h.sync.flush()
  await h.sync.chooseRemote()
  assert.equal(h.writes.length, 0)
  await h.sync.chooseLocal()
  assert.equal(h.writes[0].expectedRevision, null)
  assert.equal(h.phase(), 'synced')
  assert.ok(h.savedBaselines.at(-1).revision)
})

test('an untouched empty guest downloads remote automatically; identical histories need no choice', async (t) => {
  const remote = snapshot(data('a', 'b'))
  const h = harness(t, emptyData(), remote)
  await h.sync.start()
  assert.deepEqual(h.local, remote.data)
  assert.equal(h.phase(), 'synced')
  assert.equal(h.writes.length, 0)
  assert.equal(h.backups.length, 0)
  assert.equal(h.savedBaselines.at(-1).revision, remote.revision)
  const identical = harness(t, data('b', 'a'), remote)
  await identical.sync.start()
  assert.equal(identical.phase(), 'synced')
  assert.equal(identical.applied.length, 0)
})

test('explicit remote choice backs up original before applying and remembering', async (t) => {
  const local = data('local')
  const remote = snapshot(data('remote'))
  const h = harness(t, local, remote)
  await h.sync.start()
  const apply = h.ports.apply
  h.ports.apply = (value) => { assert.deepEqual(h.backups, [local]); apply(value) }
  await h.sync.chooseRemote()
  assert.deepEqual(h.local, remote.data)
  assert.equal(h.writes.length, 0)
  assert.equal(h.phase(), 'synced')
})

test('backup failures prevent either destructive choice and remain explicit errors', async (t) => {
  for (const choice of ['chooseLocal', 'chooseRemote']) {
    const h = harness(t, data('local'), snapshot(data('remote')))
    await h.sync.start()
    h.backupError = new Error('Backup quota exceeded')
    await h.sync[choice]()
    assert.equal(h.phase(), 'error')
    assert.match(h.statuses.at(-1).message, /quota/)
    assert.deepEqual(h.local, data('local'))
    assert.equal(h.applied.length, 0)
    assert.equal(h.writes.length, 0)
    assert.equal(h.savedBaselines.length, 0)
    h.edit(data('more-local'))
    await h.sync.flush()
    assert.equal(h.writes.length, 0)
  }
})

test('known baseline merges separate-device additions, one-sided deletion and repairs without losses', async (t) => {
  const original = snapshot(data('old', 'deleted'))
  const local = data('old', '__proto__')
  const remoteData = data('old', 'deleted', 'constructor')
  remoteData.history[0].logs[0].weight = 45
  const remote = snapshot(remoteData)
  const h = harness(t, local, remote, await baselineFor(original))
  await h.sync.start()
  assert.equal(h.phase(), 'pending')
  assert.deepEqual(h.local.history.map((entry) => entry.id), ['old', '__proto__', 'constructor'])
  assert.equal(h.local.history[0].logs[0].weight, 45)
  await h.sync.flush()
  assert.equal(h.writes[0].expectedRevision, remote.revision)
  assert.equal(sameAppData(h.local, h.server.data), true)
  assert.equal(h.phase(), 'synced')
  assert.equal(h.backups.length, 0)
})

test('same-history undo versus edit and coherent live-head conflicts pause all writes', async (t) => {
  const original = snapshot(data('old'))
  const cases = []
  const local = data('old'); local.history[0].logs = []
  const remote = data('old'); remote.history[0].logs[0].weight = 40
  cases.push([local, remote])
  cases.push([
    { ...data('old'), settings: { ...emptyData().settings, minutes: 90 } },
    { ...data('old'), active: { ...data('active').history[0], finishedAt: null }, restEndsAt: 1234 },
  ])
  for (const [here, there] of cases) {
    const h = harness(t, here, snapshot(there), await baselineFor(original))
    await h.sync.start()
    assert.equal(h.phase(), 'conflict')
    await h.sync.flush()
    assert.equal(h.writes.length, 0)
    assert.deepEqual(h.local, here)
  }
})

test('debounce waits approximately 900ms and saves only the latest local edit', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const original = snapshot(emptyData())
  const h = harness(t, emptyData(), original, await baselineFor(original))
  await h.sync.start()
  h.edit(data('first'))
  await until(() => h.phase() === 'pending')
  t.mock.timers.tick(800)
  assert.equal(h.writes.length, 0)
  h.edit(data('first', 'second'))
  await immediate()
  t.mock.timers.tick(899)
  await immediate()
  assert.equal(h.writes.length, 0)
  t.mock.timers.tick(1)
  await until(() => h.phase() === 'synced')
  assert.equal(h.writes.length, 1)
  assert.deepEqual(h.writes[0].data, data('first', 'second'))
})

test('in-flight writes snapshot exact data and never acknowledge newer local edits as saved', async (t) => {
  const original = snapshot(data('old'))
  const h = harness(t, data('old', 'first'), original, await baselineFor(original))
  await h.sync.start()
  const gate = deferred()
  h.writeOverride = async (sent) => {
    await gate.promise
    const saved = snapshot(sent)
    h.emit(saved)
    return saved
  }
  const flushing = h.sync.flush()
  await until(() => h.writes.length === 1)
  const statusIndex = h.statuses.length
  h.local.history.push(data('later').history[0])
  h.local.history[1].logs[0].weight = 99
  h.sync.localChanged()
  gate.resolve()
  await flushing
  await until(() => h.phase() === 'pending')
  assert.equal(h.server.data.history.length, 2)
  assert.equal(h.server.data.history[1].logs[0].weight, 12)
  assert.equal(h.local.history.length, 3)
  assert.equal(h.savedBaselines.at(-1).sessions.length, 2)
  assert.equal(h.statuses.slice(statusIndex).some((status) => status.phase === 'synced'), false)
  h.writeOverride = null
  await h.sync.flush()
  assert.equal(h.phase(), 'synced')
  assert.equal(sameAppData(h.server.data, h.local), true)
})

test('CAS races merge distinct additions and retry against the latest revision', async (t) => {
  const original = snapshot(data('old'))
  const h = harness(t, data('old', 'local'), original, await baselineFor(original))
  await h.sync.start()
  h.server = snapshot(data('old', 'remote'))
  await h.sync.flush()
  assert.equal(h.phase(), 'pending')
  assert.deepEqual(h.local.history.map((entry) => entry.id), ['old', 'local', 'remote'])
  await h.sync.flush()
  assert.equal(h.phase(), 'synced')
  assert.equal(h.writes.length, 2)
})

test('destructive local choice uses CAS and never overwrites an unbacked-up newer server copy', async (t) => {
  const initial = snapshot(data('remote'))
  const h = harness(t, data('local'), initial)
  await h.sync.start()
  const newer = snapshot(data('remote', 'new'))
  h.server = newer
  await h.sync.chooseLocal()
  assert.equal(h.phase(), 'conflict')
  assert.deepEqual(h.backups, [initial.data])
  assert.deepEqual(h.server, newer)
  assert.equal(h.savedBaselines.length, 0)
  await h.sync.flush()
  assert.equal(h.writes.length, 1)
  await h.sync.chooseLocal()
  assert.deepEqual(h.backups[1], newer.data)
  assert.equal(h.phase(), 'synced')
})

test('watch changes during a write are reconciled after acknowledgement, not discarded', async (t) => {
  const original = snapshot(data('old'))
  const h = harness(t, data('old', 'local'), original, await baselineFor(original))
  await h.sync.start()
  const gate = deferred()
  h.writeOverride = async (sent) => {
    const saved = snapshot(sent)
    h.emit(saved)
    await gate.promise
    h.emit(snapshot({ ...sent, history: [...sent.history, data('remote').history[0]] }))
    return saved
  }
  const flushing = h.sync.flush()
  await until(() => h.writes.length === 1)
  gate.resolve()
  await flushing
  await until(() => h.local.history.length === 3)
  assert.deepEqual(h.local.history.map((entry) => entry.id), ['old', 'local', 'remote'])
  assert.equal(h.phase(), 'synced')
  assert.ok(h.reads >= 2)
})

test('failed writes remain dirty and paused until retry reads the server', async (t) => {
  const original = snapshot(data('old'))
  const h = harness(t, data('old', 'local'), original, await baselineFor(original))
  await h.sync.start()
  h.writeOverride = async () => { throw new Error('network unavailable') }
  await h.sync.flush()
  assert.equal(h.phase(), 'error')
  assert.equal(h.savedBaselines.length, 0)
  h.edit(data('old', 'local', 'later'))
  await h.sync.flush()
  assert.equal(h.writes.length, 1)
  h.writeOverride = null
  await h.sync.start()
  assert.equal(h.reads, 2)
  assert.equal(h.phase(), 'pending')
  await h.sync.flush()
  assert.equal(h.phase(), 'synced')
  assert.deepEqual(h.server.data, data('old', 'local', 'later'))
})

test('offline cancels timers and watch; reconnect reads and merges before resuming writes', async (t) => {
  const original = snapshot(data('old'))
  const h = harness(t, data('old'), original, await baselineFor(original))
  await h.sync.start()
  const stale = h.watchers[0]
  h.sync.offline()
  h.edit(data('old', 'offline'))
  h.server = snapshot(data('old', 'remote'))
  stale.receive(snapshot(data('WRONG')))
  stale.error(new Error('stale error'))
  await h.sync.flush()
  assert.equal(h.phase(), 'offline')
  assert.equal(h.writes.length, 0)
  assert.equal(stale.active, false)
  await h.sync.start()
  assert.equal(h.reads, 2)
  assert.deepEqual(h.local.history.map((entry) => entry.id), ['old', 'offline', 'remote'])
  await h.sync.flush()
  assert.equal(h.phase(), 'synced')
})

test('stop fences delayed reads and both stale watch callbacks after an account switch', async (t) => {
  const h = harness(t, emptyData(), snapshot(data('old-account')))
  const gate = deferred()
  h.readOverride = () => gate.promise
  const starting = h.sync.start()
  h.sync.stop()
  const stoppedStatuses = h.statuses.length
  const next = harness(t, emptyData(), snapshot(data('new-account')))
  await next.sync.start()
  gate.resolve(snapshot(data('old-account')))
  await starting
  assert.equal(h.applied.length, 0)
  assert.equal(h.savedBaselines.length, 0)
  assert.equal(h.statuses.length, stoppedStatuses)
  assert.equal(h.watchers.length, 0)
  const watcher = next.watchers[0]
  next.sync.stop()
  const count = next.statuses.length
  watcher.receive(snapshot(data('WRONG')))
  watcher.error(new Error('old account error'))
  await immediate()
  assert.equal(next.statuses.length, count)
  assert.deepEqual(next.local, data('new-account'))
})

test('restart fences old read errors and obsolete watcher errors', async (t) => {
  const h = harness(t, emptyData(), snapshot(data('remote')))
  const gate = deferred()
  h.readOverride = () => gate.promise
  const first = h.sync.start()
  h.readOverride = null
  await h.sync.start()
  gate.reject(new Error('obsolete read'))
  await first
  assert.equal(h.phase(), 'synced')
  const previousWatcher = h.watchers[0]
  await h.sync.start()
  previousWatcher.error(new Error('obsolete watch'))
  assert.equal(h.phase(), 'synced')
})

test('stop and offline fence in-flight write acknowledgements and failures', async (t) => {
  for (const action of ['stop', 'offline']) {
    for (const reject of [false, true]) {
      const original = snapshot(data('old'))
      const h = harness(t, data('old', 'new'), original, await baselineFor(original))
      await h.sync.start()
      const gate = deferred()
      h.writeOverride = () => gate.promise
      const writing = h.sync.flush()
      await until(() => h.writes.length === 1)
      h.sync[action]()
      const counts = [h.statuses.length, h.savedBaselines.length, h.applied.length]
      if (reject) gate.reject(new Error('late write failure'))
      else gate.resolve(snapshot(data('old', 'new')))
      await writing
      assert.deepEqual([h.statuses.length, h.savedBaselines.length, h.applied.length], counts)
    }
  }
})

test('storage apply/remember failures preserve recoverable originals and stop further pushes until retry', async (t) => {
  for (const failure of ['applyError', 'rememberError']) {
    const h = harness(t, data('local'), snapshot(data('remote')))
    await h.sync.start()
    h[failure] = new Error(`${failure}: quota exceeded`)
    await h.sync.chooseRemote()
    assert.equal(h.phase(), 'error')
    assert.deepEqual(h.backups[0], data('local'))
    if (failure === 'applyError') assert.deepEqual(h.local, data('local'))
    assert.equal(h.savedBaselines.length, 0)
    h.sync.localChanged()
    await h.sync.flush()
    assert.equal(h.writes.length, 0)
    h[failure] = null
    await h.sync.start()
    if (failure === 'applyError') await h.sync.chooseRemote()
    assert.equal(h.phase(), 'synced')
  }
})

test('invalid remote history and unsupported schema surface errors without replacing local data', async (t) => {
  for (const remote of [data('duplicate', 'duplicate'), { ...data('future'), version: 4 }]) {
    const h = harness(t, emptyData(), snapshot(remote))
    await h.sync.start()
    assert.equal(h.phase(), 'error')
    assert.equal(h.applied.length, 0)
    assert.equal(h.writes.length, 0)
    assert.equal(h.savedBaselines.length, 0)
  }
})

test('blocked local storage prevents activation and all remote replacement', async (t) => {
  const h = harness(t, emptyData(), snapshot(data('remote')))
  h.blocked = true
  await h.sync.start()
  assert.equal(h.phase(), 'error')
  await h.sync.chooseLocal()
  await h.sync.chooseRemote()
  assert.equal(h.applied.length, 0)
  assert.equal(h.writes.length, 0)
})

test('delayed reconciliation digests re-read local edits instead of overwriting them', async (t) => {
  const original = snapshot(data('old'))
  const h = harness(t, data('old'), original, await baselineFor(original))
  await h.sync.start()
  const entered = deferred()
  const release = deferred()
  const digest = crypto.subtle.digest
  let delayed = false
  t.mock.method(crypto.subtle, 'digest', function (...args) {
    if (!delayed) {
      delayed = true
      entered.resolve()
      return release.promise.then(() => digest.apply(this, args))
    }
    return digest.apply(this, args)
  })
  h.emit(snapshot(data('old', 'remote')))
  await entered.promise
  h.edit(data('old', 'local'))
  release.resolve()
  await until(() => h.local.history.length === 3)
  assert.deepEqual(h.local.history.map((entry) => entry.id), ['old', 'local', 'remote'])
  await h.sync.flush()
  assert.equal(h.phase(), 'synced')
})

test('stop while hashing initial download prevents apply, remember and stale errors', async (t) => {
  const h = harness(t, emptyData(), snapshot(data('remote')))
  const entered = deferred()
  const release = deferred()
  t.mock.method(crypto.subtle, 'digest', () => { entered.resolve(); return release.promise })
  const starting = h.sync.start()
  await entered.promise
  h.sync.stop()
  const count = h.statuses.length
  release.reject(new Error('late digest failure'))
  await starting
  assert.equal(h.statuses.length, count)
  assert.equal(h.applied.length, 0)
  assert.equal(h.savedBaselines.length, 0)
})

test('local edits during automatic-download hashing turn into consent, not silent replacement', async (t) => {
  const h = harness(t, emptyData(), snapshot(data('remote')))
  const entered = deferred()
  const release = deferred()
  const digest = crypto.subtle.digest
  let once = false
  t.mock.method(crypto.subtle, 'digest', function (...args) {
    if (!once) {
      once = true
      entered.resolve()
      return release.promise.then(() => digest.apply(this, args))
    }
    return digest.apply(this, args)
  })
  const starting = h.sync.start()
  await entered.promise
  h.edit(data('new-local'))
  release.resolve()
  await starting
  assert.equal(h.phase(), 'choice')
  assert.deepEqual(h.local, data('new-local'))
  assert.equal(h.applied.length, 0)
  assert.equal(h.savedBaselines.length, 0)
})

test('local edits while an initial read is delayed are protected by first-link consent', async (t) => {
  const h = harness(t, emptyData(), snapshot(data('remote')))
  const gate = deferred()
  h.readOverride = () => gate.promise
  const starting = h.sync.start()
  h.edit({ ...emptyData(), settings: { ...emptyData().settings, minutes: 120 } })
  gate.resolve(h.server)
  await starting
  assert.equal(h.phase(), 'choice')
  assert.equal(h.local.settings.minutes, 120)
  assert.equal(h.applied.length, 0)
  assert.equal(h.writes.length, 0)
})

test('edits made while hashing an explicit remote choice need renewed consent', async (t) => {
  const h = harness(t, data('local'), snapshot(data('remote')))
  await h.sync.start()
  const entered = deferred()
  const release = deferred()
  const digest = crypto.subtle.digest
  t.mock.method(crypto.subtle, 'digest', function (...args) {
    entered.resolve()
    return release.promise.then(() => digest.apply(this, args))
  })
  const choosing = h.sync.chooseRemote()
  await entered.promise
  h.edit(data('local', 'new-local'))
  release.resolve()
  await choosing
  assert.equal(h.phase(), 'choice')
  assert.deepEqual(h.local, data('local', 'new-local'))
  assert.equal(h.backups.length, 0)
  assert.equal(h.applied.length, 0)
})

test('a remember failure after a successful CAS stays dirty until authoritative retry', async (t) => {
  const original = snapshot(data('old'))
  const h = harness(t, data('old', 'new'), original, await baselineFor(original))
  await h.sync.start()
  h.rememberError = new Error('Baseline storage quota')
  await h.sync.flush()
  assert.equal(h.phase(), 'error')
  assert.deepEqual(h.local, data('old', 'new'))
  assert.deepEqual(h.server.data, h.local)
  assert.equal(h.savedBaselines.length, 0)
  h.edit(data('old', 'new', 'later'))
  await h.sync.flush()
  assert.equal(h.writes.length, 1)
  h.rememberError = null
  await h.sync.start()
  await h.sync.flush()
  assert.equal(h.phase(), 'synced')
  assert.deepEqual(h.server.data, data('old', 'new', 'later'))
})

test('a watcher error while writing cancels acknowledgement until a reconnect', async (t) => {
  const original = snapshot(data('old'))
  const h = harness(t, data('old', 'new'), original, await baselineFor(original))
  await h.sync.start()
  const gate = deferred()
  h.writeOverride = () => gate.promise
  const writing = h.sync.flush()
  await until(() => h.writes.length === 1)
  h.watchers[0].error(new Error('watch unavailable'))
  const count = h.statuses.length
  gate.resolve(snapshot(data('old', 'new')))
  await writing
  assert.equal(h.phase(), 'error')
  assert.equal(h.statuses.length, count)
  assert.equal(h.savedBaselines.length, 0)
})

test('a newer watch snapshot during a delayed digest wins over the obsolete remote merge', async (t) => {
  const original = snapshot(data('old'))
  const h = harness(t, data('old'), original, await baselineFor(original))
  await h.sync.start()
  const entered = deferred()
  const release = deferred()
  const digest = crypto.subtle.digest
  let once = false
  t.mock.method(crypto.subtle, 'digest', function (...args) {
    if (!once) {
      once = true
      entered.resolve()
      return release.promise.then(() => digest.apply(this, args))
    }
    return digest.apply(this, args)
  })
  h.emit(snapshot(data('old', 'obsolete')))
  await entered.promise
  const latest = snapshot(data('old', 'latest'))
  h.emit(latest)
  release.resolve()
  await until(() => h.savedBaselines.at(-1)?.revision === latest.revision)
  assert.deepEqual(h.local, latest.data)
  assert.equal(h.applied.some((value) => value.history.some((entry) => entry.id === 'obsolete')), false)
})

test('start reports read, subscription and reconnect teardown errors without rejecting its promise', async (t) => {
  for (const source of ['read', 'watch', 'unwatch']) {
    const h = harness(t, emptyData(), snapshot(emptyData()))
    if (source === 'read') h.readOverride = async () => { throw new Error('read failed') }
    if (source === 'watch') h.transport.watch = () => { throw new Error('watch failed') }
    if (source === 'unwatch') {
      h.transport.watch = () => () => { throw new Error('unwatch failed') }
      await h.sync.start()
    }
    await assert.doesNotReject(h.sync.start())
    assert.equal(h.phase(), 'error')
    assert.equal(h.statuses.at(-1).message, `${source} failed`)
    assert.equal(h.writes.length, 0)
  }
})

test('explicit local choice reports write errors without rejecting or replacing either copy', async (t) => {
  const h = harness(t, data('local'), snapshot(data('remote')))
  await h.sync.start()
  h.writeOverride = async () => { throw new Error('write failed') }
  await assert.doesNotReject(h.sync.chooseLocal())
  assert.equal(h.phase(), 'error')
  assert.deepEqual(h.backups, [data('remote')])
  assert.deepEqual(h.local, data('local'))
  assert.deepEqual(h.server.data, data('remote'))
  assert.equal(h.savedBaselines.length, 0)
})

test('automatic download, history merge and remote set updates never invoke download-backed backups', async (t) => {
  const h = harness(t, emptyData(), snapshot(data('old')))
  h.backupError = new Error('Automatic synchronization must not request a backup download')
  await h.sync.start()
  assert.equal(h.phase(), 'synced')
  assert.deepEqual(h.local, data('old'))
  h.edit(data('old', 'local'))
  const remote = snapshot(data('old', 'remote'))
  h.emit(remote)
  await until(() => h.savedBaselines.at(-1)?.revision === remote.revision)
  assert.equal(h.phase(), 'pending')
  assert.deepEqual(h.local.history.map((entry) => entry.id), ['old', 'local', 'remote'])
  await h.sync.flush()
  assert.equal(h.phase(), 'synced')
  const updated = structuredClone(h.server.data)
  updated.history[0].logs[0].weight = 42
  const changedSet = snapshot(updated)
  h.emit(changedSet)
  await until(() => h.savedBaselines.at(-1)?.revision === changedSet.revision)
  assert.equal(h.phase(), 'synced')
  assert.deepEqual(h.local, updated)
  assert.equal(h.backups.length, 0)
})

test('automatic apply and remember failures preserve local work without creating full-copy backups', async (t) => {
  for (const failure of ['applyError', 'rememberError']) {
    const original = snapshot(data('old'))
    const local = data('old', 'local')
    const remote = snapshot(data('old', 'remote'))
    const h = harness(t, local, remote, await baselineFor(original))
    h.backupError = new Error('Automatic synchronization must not request a backup download')
    h[failure] = new Error(`${failure}: quota exceeded`)
    await h.sync.start()
    assert.equal(h.phase(), 'error')
    assert.match(h.statuses.at(-1).message, /quota exceeded/)
    assert.equal(h.savedBaselines.length, 0)
    assert.equal(h.writes.length, 0)
    assert.equal(h.backups.length, 0)
    if (failure === 'applyError') assert.deepEqual(h.local, local)
    else assert.deepEqual(h.local.history.map((entry) => entry.id), ['old', 'local', 'remote'])
    await h.sync.flush()
    assert.equal(h.writes.length, 0)
    h[failure] = null
    await h.sync.start()
    await h.sync.flush()
    assert.equal(h.phase(), 'synced')
    assert.deepEqual(h.server.data.history.map((entry) => entry.id), ['old', 'local', 'remote'])
    assert.equal(h.backups.length, 0)
  }
})
