const OWNER = 'tempofit-rules-owner'
const ROOT = `/databases/(default)/documents/tempoFitUsers/${OWNER}`
const TIME = '2026-09-10T12:00:00Z'
const HASH = 'a'.repeat(64)
const REVISION = '00000000-0000-4000-8000-000000000001'
const manifest = () => ({
  schemaVersion: 1,
  revision: REVISION,
  state: '{"schemaVersion":1,"plans":[],"settings":{}}',
  sessions: [HASH],
  updatedAt: TIME,
})
const session = () => ({ schemaVersion: 1, payload: '{"id":"synthetic-session","exercises":[]}' })

export function securityCases() {
  const cases = []
  const add = (name, expectation, method, path, data, previous, uid = OWNER) => {
    cases.push({
      name, expectation,
      request: {
        path, method, time: TIME,
        auth: uid === null ? null : { uid, token: {} },
        ...(data === undefined ? {} : { resource: { data } }),
      },
      ...(previous === undefined ? {} : { resource: { data: previous } }),
      pathEncoding: 'PLAIN',
    })
  }
  for (const [label, uid] of [['owner', OWNER], ['other user', 'tempofit-rules-other'], ['anonymous', null]]) {
    const allowed = uid === OWNER ? 'ALLOW' : 'DENY'
    add(`${label} manifest get`, allowed, 'get', ROOT, undefined, manifest(), uid)
    add(`${label} manifest list`, 'DENY', 'list', ROOT, undefined, manifest(), uid)
    add(`${label} manifest create`, allowed, 'create', ROOT, manifest(), undefined, uid)
    add(`${label} manifest update`, allowed, 'update', ROOT,
      { ...manifest(), revision: '00000000-0000-4000-8000-000000000002' }, manifest(), uid)
    add(`${label} manifest delete`, 'DENY', 'delete', ROOT, undefined, manifest(), uid)
    add(`${label} history get`, allowed, 'get', `${ROOT}/sessions/${HASH}`, undefined, session(), uid)
    add(`${label} history list`, allowed, 'list', `${ROOT}/sessions/${HASH}`, undefined, session(), uid)
    add(`${label} history create`, allowed, 'create', `${ROOT}/sessions/${HASH}`, session(), undefined, uid)
    add(`${label} history idempotent upload`, allowed, 'update', `${ROOT}/sessions/${HASH}`, session(), session(), uid)
    add(`${label} history mutation`, 'DENY', 'update', `${ROOT}/sessions/${HASH}`,
      { ...session(), payload: '{"modified":true}' }, session(), uid)
    add(`${label} history delete`, 'DENY', 'delete', `${ROOT}/sessions/${HASH}`, undefined, session(), uid)
  }
  add('unchanged manifest revision', 'DENY', 'update', ROOT, manifest(), manifest())
  add('empty manifest session list', 'ALLOW', 'create', ROOT, { ...manifest(), sessions: [] })
  add('maximum session list', 'ALLOW', 'create', ROOT, { ...manifest(), sessions: Array(5000).fill(HASH) })
  add('maximum manifest state', 'ALLOW', 'create', ROOT, { ...manifest(), sessions: [], state: 'x'.repeat(921600) })
  for (const [name, changes] of [
    ['extra manifest field', { extra: true }],
    ['wrong schema', { schemaVersion: 2 }],
    ['string schema', { schemaVersion: '1' }],
    ['invalid revision', { revision: 'not-a-uuid' }],
    ['non-v4 revision', { revision: '00000000-0000-1000-8000-000000000001' }],
    ['wrong state type', { state: {} }],
    ['wrong session list type', { sessions: HASH }],
    ['nonstring session id', { sessions: [123] }],
    ['uppercase session id', { sessions: ['A'.repeat(64)] }],
    ['short session id', { sessions: ['abc'] }],
    ['separator injection', { sessions: [`${HASH},${HASH}`] }],
    ['too many sessions', { sessions: Array(5001).fill(HASH) }],
    ['oversize state', { state: 'x'.repeat(921601), sessions: [] }],
    ['combined size cap', { state: 'x'.repeat(921600), sessions: [HASH] }],
    ['stale server timestamp', { updatedAt: '2026-09-09T12:00:00Z' }],
    ['wrong timestamp type', { updatedAt: 1789041600 }],
  ]) add(name, 'DENY', 'create', ROOT, { ...manifest(), ...changes })
  for (const key of Object.keys(manifest())) {
    const data = manifest()
    delete data[key]
    add(`missing manifest ${key}`, 'DENY', 'create', ROOT, data)
  }
  add('maximum history payload', 'ALLOW', 'create', `${ROOT}/sessions/${HASH}`, { ...session(), payload: 'x'.repeat(921600) })
  for (const [name, changes] of [
    ['extra history field', { extra: true }],
    ['wrong history schema', { schemaVersion: 2 }],
    ['wrong payload type', { payload: {} }],
    ['oversize history payload', { payload: 'x'.repeat(921601) }],
  ]) add(name, 'DENY', 'create', `${ROOT}/sessions/${HASH}`, { ...session(), ...changes })
  for (const key of Object.keys(session())) {
    const data = session()
    delete data[key]
    add(`missing history ${key}`, 'DENY', 'create', `${ROOT}/sessions/${HASH}`, data)
  }
  for (const hash of ['ABC', 'A'.repeat(64), 'a'.repeat(63), 'a'.repeat(65)]) {
    add(`invalid history id ${hash.length}`, 'DENY', 'create', `${ROOT}/sessions/${hash}`, session())
  }
  add('unmodeled subcollection denied', 'DENY', 'create', `${ROOT}/private/anything`, session())
  return cases
}
