import { decodeData, emptyData } from './storage.ts'
import type { AppData } from './storage.ts'
import type { WorkoutSession } from './domain.ts'

export interface CloudSnapshot {
  revision: string | null
  data: AppData | null
}

export type CloudHead = Omit<AppData, 'history'>

export interface CloudBaseline {
  revision: string | null
  head: CloudHead | null
  sessions: Array<{ id: string; hash: string }>
}

const revisionPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const hashPattern = /^[0-9a-f]{64}$/

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function canonicalJson(value: unknown): string {
  const ancestors = new Set<object>()
  function encode(item: unknown): string {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return JSON.stringify(item)
    if (typeof item === 'number' && Number.isFinite(item)) return JSON.stringify(item)
    if (typeof item !== 'object' || item === null) throw new Error('Valore non JSON nei dati cloud.')
    if (ancestors.has(item)) throw new Error('Riferimento circolare nei dati cloud.')
    const prototype = Object.getPrototypeOf(item)
    if (!Array.isArray(item) && prototype !== Object.prototype && prototype !== null) {
      throw new Error('Oggetto non JSON nei dati cloud.')
    }
    if (Object.getOwnPropertySymbols(item).length) throw new Error('Chiave non JSON nei dati cloud.')
    ancestors.add(item)
    try {
      const descriptors = Object.getOwnPropertyDescriptors(item)
      for (const key of Object.keys(item)) {
        if (!Object.hasOwn(descriptors[key], 'value')) throw new Error('Proprieta dinamica nei dati cloud.')
      }
      if (Array.isArray(item)) {
        return `[${Array.from({ length: item.length }, (_, index) => {
          const descriptor = Object.hasOwn(descriptors, String(index)) ? descriptors[String(index)] : undefined
          if (descriptor && !Object.hasOwn(descriptor, 'value')) throw new Error('Proprieta dinamica nei dati cloud.')
          const value = descriptor?.value
          return value === undefined ? 'null' : encode(value)
        }).join(',')}]`
      }
      return `{${Object.keys(item).sort().filter((key) => descriptors[key].value !== undefined)
        .map((key) => `${JSON.stringify(key)}:${encode(descriptors[key].value)}`).join(',')}}`
    } finally {
      ancestors.delete(item)
    }
  }
  return encode(value)
}

export async function hashPayload(payload: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function parseCloudData(value: unknown): AppData {
  const decoded = decodeData(JSON.parse(canonicalJson(value)))
  if (!decoded) throw new Error('Dati cloud non validi o versione non supportata. Nessun allenamento e stato rimosso.')
  const ids = new Set<string>()
  for (const session of decoded.data.history) {
    if (ids.has(session.id)) throw new Error('Identificativo duplicato nello storico cloud.')
    ids.add(session.id)
  }
  return decoded.data
}

export function cloudHead(data: AppData): CloudHead {
  const { history: _history, ...head } = data
  return JSON.parse(canonicalJson(head)) as CloudHead
}

export function sameAppData(a: AppData | null, b: AppData | null): boolean {
  if (a === null || b === null) return a === b
  const comparable = (data: AppData) => ({
    ...data,
    history: [...data.history].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
  })
  return canonicalJson(comparable(a)) === canonicalJson(comparable(b))
}

export function hasLocalWork(data: AppData): boolean {
  return data.history.length > 0 || data.active !== null || data.draft !== null || data.restEndsAt !== null
    || data.routines.length > 0
    || canonicalJson(data.settings) !== canonicalJson(emptyData().settings)
}

export async function baselineFor(snapshot: CloudSnapshot): Promise<CloudBaseline> {
  if (snapshot.data === null) {
    if (snapshot.revision !== null) throw new Error('Revisione cloud senza dati.')
    return { revision: null, head: null, sessions: [] }
  }
  if (typeof snapshot.revision !== 'string' || !revisionPattern.test(snapshot.revision)) {
    throw new Error('Revisione cloud non valida.')
  }
  const data = parseCloudData(snapshot.data)
  return {
    revision: snapshot.revision,
    head: cloudHead(data),
    sessions: await Promise.all(data.history.map(async (session) => ({
      id: session.id, hash: await hashPayload(canonicalJson(session)),
    }))),
  }
}

export function parseCloudBaseline(value: unknown): CloudBaseline | null {
  try {
    const parsed: unknown = JSON.parse(canonicalJson(value))
    if (!record(parsed) || Object.keys(parsed).sort().join(',') !== 'head,revision,sessions'
      || !Array.isArray(parsed.sessions)) return null
    if (parsed.revision === null) {
      return parsed.head === null && parsed.sessions.length === 0 ? { revision: null, head: null, sessions: [] } : null
    }
    if (typeof parsed.revision !== 'string' || !revisionPattern.test(parsed.revision)
      || !record(parsed.head) || (parsed.head.version !== 2 && parsed.head.version !== 3) || Object.hasOwn(parsed.head, 'history')) return null
    const head = cloudHead(parseCloudData({ ...parsed.head, history: [] }))
    const sessions: CloudBaseline['sessions'] = []
    const ids = new Set<string>()
    for (const session of parsed.sessions) {
      if (!record(session) || Object.keys(session).sort().join(',') !== 'hash,id'
        || typeof session.id !== 'string' || typeof session.hash !== 'string' || !hashPattern.test(session.hash)
        || ids.has(session.id)) return null
      ids.add(session.id)
      sessions.push({ id: session.id, hash: session.hash })
    }
    return { revision: parsed.revision, head, sessions }
  } catch {
    return null
  }
}

export async function mergeCloudData(
  base: CloudBaseline, local: AppData, remote: AppData,
): Promise<{ data: AppData | null; conflicts: string[] }> {
  const baseline = parseCloudBaseline(base)
  if (!baseline) throw new Error('Base di sincronizzazione non valida. Unione interrotta.')
  const here = parseCloudData(local)
  const there = parseCloudData(remote)
  const before = new Map(baseline.sessions.map((session) => [session.id, session.hash]))
  const fingerprint = async (sessions: WorkoutSession[]) => new Map(await Promise.all(sessions.map(async (session) =>
    [session.id, { session, hash: await hashPayload(canonicalJson(session)) }] as const)))
  const [left, right] = await Promise.all([fingerprint(here.history), fingerprint(there.history)])
  const conflicts: string[] = []
  const headHere = cloudHead(here)
  const headThere = cloudHead(there)
  const equal = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b)
  let head = headHere
  if (equal(headHere, headThere) || equal(headThere, baseline.head)) head = headHere
  else if (equal(headHere, baseline.head)) head = headThere
  else conflicts.push('head')
  const history: WorkoutSession[] = []
  for (const id of new Set([...left.keys(), ...right.keys(), ...before.keys()])) {
    const l = left.get(id)
    const r = right.get(id)
    const previous = before.get(id)
    let selected: typeof l
    if (l?.hash === r?.hash || r?.hash === previous) selected = l
    else if (l?.hash === previous) selected = r
    else {
      conflicts.push(`history:${id}`)
      continue
    }
    if (selected) history.push(selected.session)
  }
  return { data: conflicts.length ? null : parseCloudData({ ...head, history }), conflicts }
}

export class CloudConflictError extends Error {
  readonly latest: CloudSnapshot

  constructor(latest: CloudSnapshot) {
    super('I dati cloud sono cambiati su un altro dispositivo. Nessuna copia e stata sovrascritta.')
    this.name = 'CloudConflictError'
    this.latest = latest
  }
}
