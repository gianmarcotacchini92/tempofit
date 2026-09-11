import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { mergeRules, parseRules, run, sameRelease, validateCandidate, validateSource } from './deploy-firebase-rules.mjs'

const fragment = readFileSync(new URL('../firebase/tempofit.rules.fragment', import.meta.url), 'utf8')
const wrap = (body) => `rules_version = '2';\nservice cloud.firestore {\n  match /databases/{database}/documents {\n${body}\n  }\n}\n`
const unrelated = '    match /anotherApp/{uid} {\n      allow read, write: if request.auth.uid == uid;\n    }'
const live = wrap(unrelated)
const originalRelease = {
  name: 'projects/sincro-ai/releases/cloud.firestore',
  rulesetName: 'projects/sincro-ai/rulesets/original',
  updateTime: '2026-09-10T12:00:00Z',
}

test('insertion preserves every unrelated source byte and is idempotent', () => {
  const { candidate, replaced, namespaces } = mergeRules(live, fragment)
  assert.equal(replaced, false)
  assert.deepEqual(namespaces, ['anotherApp/{uid}'])
  const start = candidate.indexOf('\n    // BEGIN TEMPOFIT RULES')
  const end = candidate.indexOf('// END TEMPOFIT RULES') + '// END TEMPOFIT RULES\n'.length
  assert.equal(candidate.slice(0, start) + candidate.slice(end), live)
  const again = mergeRules(candidate, fragment)
  assert.equal(again.candidate, candidate)
  assert.equal(again.replaced, true)
})

test('replacement changes only the marked block', () => {
  const installed = mergeRules(live, fragment).candidate
  const changed = fragment.replace('921600', '920000')
  const result = mergeRules(installed, changed).candidate
  assert.equal(result, installed.replace('921600', '920000'))
})

test('CRLF and comments/strings containing braces are preserved', () => {
  const original = wrap(`${unrelated}\n // braces } { and match /tempoFitUsers/{uid} {}\n function probe() { return '} match /fake/{x} {'; }`).replaceAll('\n', '\r\n')
  const result = mergeRules(original, fragment).candidate
  assert.ok(result.includes(unrelated.replaceAll('\n', '\r\n')))
  assert.ok(!/(?<!\r)\n/.test(result))
  assert.equal(mergeRules(result, fragment).candidate, result)
})

test('recursive denies are safe; fixed unrelated recursive grants cannot overlap', () => {
  const source = wrap('match /{document=**} { allow read, write: if false; }\nmatch /anotherApp/{rest=**} { allow read: if true; }')
  assert.ok(mergeRules(source, fragment).candidate.includes('BEGIN TEMPOFIT RULES'))
})

for (const [name, body] of [
  ['unmarked namespace', 'match /tempoFitUsers/{uid} { allow read: if false; }'],
  ['literal namespace with no grants', 'match /tempoFitUsers/{uid} {}'],
  ['global recursive grant', 'match /{document=**} { allow read, write: if true; }'],
  ['owner-conditioned broad grant', 'match /{collection}/{uid} { allow read: if request.auth.uid == uid; }'],
  ['nested grant in broad path', 'match /{path=**} { match /sessions/{id} { allow get: if true; } }'],
  ['documents-level grant', 'allow read: if request.auth != null;'],
  ['incomplete markers', '// BEGIN TEMPOFIT RULES\nmatch /tempoFitUsers/{uid} {}'],
  ['reversed markers', '// END TEMPOFIT RULES\n// BEGIN TEMPOFIT RULES'],
  ['unrelated marked block', '// BEGIN TEMPOFIT RULES\nmatch /anotherApp/{uid} {}\n// END TEMPOFIT RULES'],
  ['unrelated helper in marked block', '// BEGIN TEMPOFIT RULES\nfunction shared() { return true; }\nmatch /tempoFitUsers/{uid} {}\n// END TEMPOFIT RULES'],
  ['markers nested in another app', 'match /anotherApp/{uid} {\n// BEGIN TEMPOFIT RULES\nmatch /tempoFitUsers/{uid} {}\n// END TEMPOFIT RULES\n}'],
]) {
  test(`refuses ${name}`, () => assert.throws(() => mergeRules(wrap(body), fragment)))
}

test('refuses duplicate markers and multiple database blocks', () => {
  assert.throws(() => mergeRules(wrap(`${fragment}\n${fragment}`), fragment))
  assert.throws(() => mergeRules(live.replace('\n}\n', '\nmatch /databases/{other}/documents {}\n}\n'), fragment))
})

test('refuses misplaced markers and fragment declarations outside markers', () => {
  assert.throws(() => mergeRules(`// BEGIN TEMPOFIT RULES\n${live}\n// END TEMPOFIT RULES`, fragment))
  assert.throws(() => mergeRules(live, `function shared() { return true; }\n${fragment}`))
  assert.throws(() => mergeRules(live, `${fragment}\nallow read: if true;`))
})

test('rejects unexpected source bundles and service shapes', () => {
  assert.throws(() => validateSource({ source: { files: [] } }))
  assert.throws(() => validateSource({ source: { files: [{ name: 'firestore.rules', content: live }, {}] } }))
  assert.throws(() => validateSource({ source: { files: [{ name: 'storage.rules', content: live }] } }))
  assert.throws(() => parseRules(live.replace("'2'", "'1'")))
  assert.throws(() => parseRules(live.replace('cloud.firestore', 'firebase.storage')))
  assert.throws(() => parseRules(live + live))
  assert.equal(validateSource({ source: { files: [{ name: 'firestore.rules', content: live }] } }).content, live)
})

test('release comparisons detect ruleset and timestamp changes', () => {
  assert.ok(sameRelease(originalRelease, { ...originalRelease }))
  assert.ok(!sameRelease(originalRelease, { ...originalRelease, rulesetName: 'different' }))
  assert.ok(!sameRelease(originalRelease, { ...originalRelease, updateTime: 'different' }))
})

function mockClients({ changeAt, failTest = false, missingDomain = false, disabledGoogle = false, installed = false } = {}) {
  const writes = []
  const requestObjects = new WeakSet()
  let releaseReads = 0
  let release = { ...originalRelease }
  const optionsCheck = (options) => {
    assert.ok(!requestObjects.has(options), 'Firebase CLI request options must never be reused')
    requestObjects.add(options)
    options.body = { mutated: true }
  }
  return {
    writes,
    clients: {
      auth: {
        async get(path, options) {
          optionsCheck(options)
          return { body: path.endsWith('/config')
            ? { authorizedDomains: missingDomain ? [] : ['gianmarcotacchini92.github.io'] }
            : { enabled: !disabledGoogle } }
        },
      },
      rules: {
        async get(path, options) {
          optionsCheck(options)
          if (path.includes('/releases/')) {
            releaseReads++
            if (releaseReads === changeAt) release = { ...release, updateTime: 'concurrent-change' }
            return { body: { ...release } }
          }
          return { body: { source: { files: [{ name: 'firestore.rules', content: installed ? mergeRules(live, fragment).candidate : live }] } } }
        },
        async post(path, body, options) {
          optionsCheck(options)
          if (path.endsWith(':test')) {
            assert.ok(body.source.files[0].content.includes(unrelated))
            return { body: { testResults: body.testSuite.testCases.map(() => ({ state: failTest ? 'FAILURE' : 'SUCCESS' })) } }
          }
          writes.push({ method: 'post', path, body })
          return { body: { name: 'projects/sincro-ai/rulesets/candidate' } }
        },
        async patch(path, body, options) {
          optionsCheck(options)
          writes.push({ method: 'patch', path, body })
          release = { ...release, rulesetName: body.release.rulesetName }
          return { body: release }
        },
      },
    },
  }
}

test('default dry run never creates or releases rules', async () => {
  const { clients, writes } = mockClients()
  const result = await run({ clients, fragment })
  assert.equal(result.applied, false)
  assert.equal(result.count, 70)
  assert.deepEqual(writes, [])
})

test('mocked explicit apply validates, publishes only Firestore and verifies release', async () => {
  const { clients, writes } = mockClients()
  assert.equal((await run({ apply: true, clients, fragment })).applied, true)
  assert.deepEqual(writes.map((write) => write.method), ['post', 'patch'])
  assert.equal(writes[1].path, '/projects/sincro-ai/releases/cloud.firestore')
  assert.equal(writes[1].body.updateMask, 'rulesetName')
})

test('an already current fragment produces no writes', async () => {
  const { clients, writes } = mockClients({ installed: true })
  assert.equal((await run({ apply: true, clients, fragment })).applied, false)
  assert.deepEqual(writes, [])
})

for (const [name, config, expectedWrites] of [
  ['failed assertions', { failTest: true }, 0],
  ['missing production domain', { missingDomain: true }, 0],
  ['disabled Google provider', { disabledGoogle: true }, 0],
  ['release changed during tests', { changeAt: 2 }, 0],
  ['release changed before patch', { changeAt: 3 }, 1],
]) {
  test(`apply aborts for ${name}`, async () => {
    const { clients, writes } = mockClients(config)
    await assert.rejects(run({ apply: true, clients, fragment }))
    assert.equal(writes.length, expectedWrites)
    assert.ok(writes.every((write) => write.method !== 'patch'))
  })
}

test('remote compiler errors and incomplete test execution abort validation', async () => {
  const files = [{ name: 'firestore.rules', content: live }]
  const cases = [{ name: 'synthetic', expectation: 'DENY', request: {} }]
  await assert.rejects(validateCandidate({
    post: async () => ({ body: { issues: [{ severity: 'ERROR', description: 'bad source' }] } }),
  }, files, cases), /compilation rejected/)
  await assert.rejects(validateCandidate({
    post: async () => ({ body: { testResults: [] } }),
  }, files, cases), /every assertion/)
})
