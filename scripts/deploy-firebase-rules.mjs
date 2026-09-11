import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { delimiter, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { securityCases } from './firebase-rules-cases.mjs'

const PROJECT = 'sincro-ai'
const RELEASE = `projects/${PROJECT}/releases/cloud.firestore`
const BEGIN = '// BEGIN TEMPOFIT RULES'
const END = '// END TEMPOFIT RULES'
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// firebase-tools mutates request options, including authenticated headers and POST bodies.
const requestOptions = () => ({ skipLog: { body: true, resBody: true, queryParams: true } })
const fail = (message) => { throw new Error(message) }
const digest = (value) => createHash('sha256').update(value).digest('hex')

// Preserve offsets: braces in comments, quoted regexes and path captures are not blocks.
export function lex(source) {
  const tokens = []
  const comments = []
  const pattern = /\s+|\/\/[^\r\n]*|\/\*[\s\S]*?\*\/|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|[A-Za-z_][A-Za-z_0-9]*|\d+|\*\*|[^\s]/gy
  let offset = 0
  while (offset < source.length) {
    pattern.lastIndex = offset
    const match = pattern.exec(source)
    if (!match) fail('Cannot tokenize source.')
    const value = match[0]
    const token = { value, start: offset, end: pattern.lastIndex }
    if (value.startsWith('//') || value.startsWith('/*')) comments.push(token)
    else if (!/^\s+$/.test(value)) tokens.push(token)
    offset = pattern.lastIndex
  }
  return { tokens, comments }
}

export function parseRules(source) {
  const { tokens, comments } = lex(source)
  let i = 0
  const take = (value) => {
    const token = tokens[i++]
    if (!token || (value !== undefined && token.value !== value)) {
      fail(`Unexpected rules structure near token ${i}; refusing to rewrite.`)
    }
    return token
  }
  const skipBody = () => {
    take('{')
    let depth = 1
    while (depth) {
      const value = take().value
      if (value === '{') depth++
      if (value === '}') depth--
    }
  }
  const scope = (kind, path = [], start = 0) => {
    const open = take('{')
    const node = { kind, path, start, open: open.start, children: [], allows: [] }
    while (tokens[i]?.value !== '}') {
      const token = take()
      if (token.value === 'match') {
        const segments = []
        while (tokens[i]?.value === '/') {
          take('/')
          if (tokens[i]?.value === '{') {
            take('{')
            const name = take().value
            if (!/^[A-Za-z_]\w*$/.test(name)) fail('Unexpected path capture.')
            let recursive = false
            if (tokens[i]?.value === '=') {
              take('=')
              take('**')
              recursive = true
            }
            take('}')
            segments.push({ wildcard: true, recursive, name })
          } else {
            const value = take().value
            if (!/^[A-Za-z_]\w*$/.test(value)) fail('Unsupported literal path segment.')
            segments.push({ literal: value })
          }
        }
        if (!segments.length) fail('Empty match path.')
        node.children.push(scope('match', segments, token.start))
      } else if (token.value === 'function') {
        take()
        take('(')
        while (tokens[i]?.value !== ')') take()
        take(')')
        skipBody()
      } else if (token.value === 'allow') {
        const expression = []
        while (tokens[i]?.value !== ';') expression.push(take().value)
        take(';')
        const colon = expression.indexOf(':')
        if (colon < 1 || expression[colon + 1] !== 'if') fail('Unexpected allow statement.')
        node.allows.push(expression.slice(colon + 2))
      } else {
        fail(`Unsupported ${kind} declaration; manual review required.`)
      }
    }
    node.close = take('}').start
    node.end = tokens[i - 1].end
    return node
  }
  take('rules_version')
  take('=')
  if (!["'2'", '"2"'].includes(take().value)) fail('Only rules_version 2 is supported.')
  take(';')
  take('service')
  take('cloud')
  take('.')
  take('firestore')
  const service = scope('service')
  if (i !== tokens.length || service.children.length !== 1 || service.allows.length) {
    fail('Expected exactly one Firestore service and documents block.')
  }
  const documents = service.children[0]
  if (documents.path.length !== 3 ||
      documents.path[0].literal !== 'databases' ||
      !documents.path[1].wildcard || documents.path[1].recursive ||
      documents.path[2].literal !== 'documents') {
    fail('Expected /databases/{database}/documents.')
  }
  return { documents, comments }
}

function markerRange(source, parsed) {
  const begins = parsed.comments.filter((token) => token.value.trim() === BEGIN)
  const ends = parsed.comments.filter((token) => token.value.trim() === END)
  if (!begins.length && !ends.length) return null
  if (begins.length !== 1 || ends.length !== 1) fail('Duplicate or incomplete TempoFit markers.')
  const start = begins[0].start
  const end = ends[0].end
  if (start >= ends[0].start || start <= parsed.documents.open || end >= parsed.documents.close) {
    fail('TempoFit markers are outside the documents block or reversed.')
  }
  for (const token of [begins[0], ends[0]]) {
    if (source.slice(source.lastIndexOf('\n', token.start - 1) + 1, token.start).trim()) {
      fail('TempoFit markers must occupy standalone comment lines.')
    }
  }
  const children = parsed.documents.children.filter((node) => node.start > start && node.end < end)
  if (children.length !== 1 || children[0].path.length !== 2 ||
      children[0].path[0].literal !== 'tempoFitUsers' ||
      !children[0].path[1].wildcard || children[0].path[1].recursive) {
    fail('Marked block must contain exactly the TempoFit root match.')
  }
  // No helper functions, grants, or other declarations may be swallowed by replacement.
  const outside = source.slice(begins[0].end, children[0].start) +
    source.slice(children[0].end, ends[0].start)
  if (lex(outside).tokens.length) fail('Unrelated declarations inside TempoFit markers.')
  return { start, end, node: children[0] }
}

function inspectIsolation(documents, ownedNode) {
  const namespaces = []
  const walk = (node, path) => {
    if (node === ownedNode) return
    const fullPath = [...path, ...node.path]
    const first = fullPath[0]
    if (first?.literal === 'tempoFitUsers') fail('Existing unmarked TempoFit namespace collision.')
    const overlaps = !first || first.wildcard
    if (overlaps && node.allows.some((expression) => expression.join(' ') !== 'false')) {
      fail('Broad/catch-all grant may bypass TempoFit isolation; manual shared-rules review required.')
    }
    for (const child of node.children) walk(child, fullPath)
  }
  if (documents.allows.some((expression) => expression.join(' ') !== 'false')) {
    fail('Documents-level grants may bypass TempoFit isolation.')
  }
  for (const child of documents.children) {
    namespaces.push(child.path.map((part) => part.literal ?? `{${part.name}${part.recursive ? '=**' : ''}}`).join('/'))
    walk(child, [])
  }
  return namespaces
}

export function mergeRules(live, fragment) {
  const parsed = parseRules(live)
  const range = markerRange(live, parsed)
  const namespaces = inspectIsolation(parsed.documents, range?.node)
  const trimmed = fragment.trim()
  const wrapper = `rules_version = '2';\nservice cloud.firestore {\nmatch /databases/{database}/documents {\n${trimmed}\n}\n}`
  const fragmentParsed = parseRules(wrapper)
  const fragmentRange = markerRange(wrapper, fragmentParsed)
  if (!fragmentRange || fragmentParsed.documents.children.length !== 1 ||
      fragmentParsed.documents.allows.length) fail('Unexpected TempoFit fragment structure.')
  const fragmentTokens = lex(trimmed).tokens
  const markedTokens = lex(wrapper.slice(fragmentRange.start, fragmentRange.end)).tokens
  if (fragmentTokens.length !== markedTokens.length) fail('Declarations outside TempoFit fragment markers.')
  const eol = live.includes('\r\n') ? '\r\n' : '\n'
  const rendered = trimmed.replace(/\r?\n/g, eol + '    ')
  let candidate
  if (range) {
    candidate = live.slice(0, range.start) + rendered + live.slice(range.end)
  } else {
    const lineStart = live.lastIndexOf('\n', parsed.documents.close - 1) + 1
    const insertion = live.slice(lineStart, parsed.documents.close).trim() ? parsed.documents.close : lineStart
    candidate = live.slice(0, insertion) + eol + '    ' + rendered + eol + live.slice(insertion)
  }
  const finalParsed = parseRules(candidate)
  inspectIsolation(finalParsed.documents, markerRange(candidate, finalParsed)?.node)
  return { candidate, namespaces, replaced: Boolean(range) }
}

export function validateSource(ruleset) {
  if (ruleset.source?.files?.length !== 1) fail('Expected one live rules source file.')
  const file = ruleset.source.files[0]
  if (file.name !== 'firestore.rules' || typeof file.content !== 'string' ||
      ruleset.metadata?.services?.some((service) => service !== 'cloud.firestore')) {
    fail('Unexpected live source name, content, or service.')
  }
  return file
}

export async function authenticatedClients() {
  // npm exec exposes its cached .bin on PATH; never scan the home directory or copy credentials.
  const candidates = [join(ROOT, 'node_modules', 'firebase-tools', 'package.json')]
  for (const entry of (process.env.PATH ?? '').split(delimiter)) {
    if (entry && entry.endsWith('.bin')) candidates.push(join(entry, '..', 'firebase-tools', 'package.json'))
  }
  const packageFile = candidates.find(existsSync)
  if (!packageFile) fail('Use npm exec --offline --package=firebase-tools -- node scripts\\deploy-firebase-rules.mjs')
  const cli = createRequire(realpathSync(packageFile))
  if (cli('./package.json').version !== '15.29.0') {
    fail('This helper requires reviewed firebase-tools 15.29.0 internals.')
  }
  cli('./lib/logger.js').logger.silent = true
  if (process.env.FIREBASE_TOKEN || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    fail('Use the existing signed-in Firebase CLI account, not credential environment overrides.')
  }
  const account = cli('./lib/auth.js').getProjectDefaultAccount(ROOT)
  if (!account?.user || !account?.tokens) fail('No existing Firebase CLI login; no account changes attempted.')
  await cli('./lib/requireAuth.js').requireAuth({ project: PROJECT, ...account }, true)
  const { Client } = cli('./lib/apiv2.js')
  return {
    rules: new Client({ urlPrefix: 'https://firebaserules.googleapis.com', apiVersion: 'v1' }),
    auth: new Client({ urlPrefix: 'https://identitytoolkit.googleapis.com', auth: true }),
  }
}

export async function validateCandidate(client, files, cases = securityCases()) {
  // Only synthetic fixtures are sent to projects:test. Nothing is read from Firestore.
  for (let offset = 0; offset < cases.length; offset += 10) {
    const batch = cases.slice(offset, offset + 10)
    const { body } = await client.post(`/projects/${PROJECT}:test`, {
      source: { files },
      testSuite: { testCases: batch.map(({ name: _name, ...testCase }) => testCase) },
    }, requestOptions())
    const issues = body.issues?.filter((issue) => issue.severity === 'ERROR') ?? []
    if (issues.length) fail(`Candidate compilation rejected: ${issues.map((issue) => issue.description).join('; ')}`)
    if (body.testResults?.length !== batch.length) fail('Rules service did not run every assertion.')
    const failed = batch.filter((_, index) => body.testResults[index].state !== 'SUCCESS')
    if (failed.length) fail(`Rules assertions failed: ${failed.map((item) => item.name).join(', ')}`)
  }
  return cases.length
}

export function sameRelease(before, after) {
  return before.name === after.name && before.rulesetName === after.rulesetName &&
    before.updateTime === after.updateTime
}

export async function run({ apply = false, clients, fragment } = {}) {
  const { rules, auth } = clients ?? await authenticatedClients()
  const live = (await rules.get(`/${RELEASE}`, requestOptions())).body
  if (live.name !== RELEASE || !live.rulesetName?.startsWith(`projects/${PROJECT}/rulesets/`) ||
      !live.updateTime) fail('Unexpected live Firestore release.')
  const ruleset = (await rules.get(`/${live.rulesetName}`, requestOptions())).body
  const file = validateSource(ruleset)
  const { candidate, namespaces, replaced } = mergeRules(
    file.content,
    fragment ?? readFileSync(join(ROOT, 'firebase', 'tempofit.rules.fragment'), 'utf8'),
  )
  const authConfig = (await auth.get(`/admin/v2/projects/${PROJECT}/config`, requestOptions())).body
  const provider = (await auth.get(`/admin/v2/projects/${PROJECT}/defaultSupportedIdpConfigs/google.com`, requestOptions())).body
  if (!authConfig.authorizedDomains?.includes('gianmarcotacchini92.github.io') || provider.enabled !== true) {
    fail('Google provider or production authorized domain is missing. No shared Auth settings were modified.')
  }
  console.log(`Live namespaces: ${namespaces.join(', ')}. No overlapping grants found.`)
  console.log(`Google enabled; production GitHub Pages host authorized. ${replaced ? 'Replace' : 'Insert'} TempoFit fragment only.`)
  const files = [{ name: file.name, content: candidate }]
  const count = await validateCandidate(rules, files)
  console.log(`Server validated candidate and ${count} synthetic assertions. SHA256 ${digest(candidate)}`)
  const current = (await rules.get(`/${RELEASE}`, requestOptions())).body
  if (!sameRelease(live, current)) fail('Live release changed during validation; rerun from fresh source.')
  if (!apply) {
    console.log('DRY RUN: no ruleset created or live release changed. Add --apply only after review.')
    return { applied: false, count }
  }
  if (candidate === file.content) {
    console.log('Live fragment is already current; no write needed.')
    return { applied: false, count }
  }
  const created = (await rules.post(`/projects/${PROJECT}/rulesets`, { source: { files } }, requestOptions())).body
  if (!created.name?.startsWith(`projects/${PROJECT}/rulesets/`)) fail('Unexpected created ruleset name.')
  const latest = (await rules.get(`/${RELEASE}`, requestOptions())).body
  if (!sameRelease(live, latest)) fail('Live release changed before apply; candidate left unreleased. Rerun.')
  // The Rules API has no ETag/precondition for releases.patch. Coordinate other deployments:
  // this final recheck narrows, but cannot eliminate, the concurrent-publisher race.
  await rules.patch(`/${RELEASE}`, {
    release: { name: RELEASE, rulesetName: created.name },
    updateMask: 'rulesetName',
  }, requestOptions())
  const verified = (await rules.get(`/${RELEASE}`, requestOptions())).body
  if (verified.rulesetName !== created.name) fail('Release verification failed; inspect live state manually. No rollback attempted.')
  console.log(`Applied and verified ${created.name}. Previous ruleset: ${live.rulesetName}`)
  return { applied: true, count }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2)
  if (args.some((arg) => !['--apply', '--dry-run'].includes(arg)) ||
      new Set(args).size !== args.length || (args.includes('--apply') && args.includes('--dry-run'))) {
    console.error('Usage: npm exec --offline --package=firebase-tools -- node scripts\\deploy-firebase-rules.mjs [--dry-run | --apply]')
    process.exitCode = 1
  } else {
    run({ apply: args.includes('--apply') }).catch((error) => {
      // Never print complete HTTP errors/objects: they may carry authenticated request context.
      console.error(`Rules helper stopped: ${error.message}`)
      process.exitCode = 1
    })
  }
}
