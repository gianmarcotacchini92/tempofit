import { canonicalJson, cloudHead, hashPayload, parseCloudData } from './cloudModel.ts'
import type { AppData } from './storage.ts'

export const CLOUD_DOCUMENT_BYTES = 900 * 1024
export const CLOUD_SESSION_LIMIT = 5000

export interface CloudManifest {
  schemaVersion: 1
  revision: string
  state: string
  sessions: string[]
}

export interface PreparedCloudData {
  state: string
  history: Array<{ key: string; payload: string }>
}

export function encodedBytes(value: string) {
  return new TextEncoder().encode(value).byteLength
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function parseManifest(value: unknown): CloudManifest {
  if (!record(value) || value.schemaVersion !== 1 || typeof value.revision !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value.revision)
    || typeof value.state !== 'string' || !Array.isArray(value.sessions)
    || value.sessions.length > CLOUD_SESSION_LIMIT
    || !value.sessions.every((key: unknown): key is string => typeof key === 'string' && /^[0-9a-f]{64}$/.test(key))
    || new Set(value.sessions).size !== value.sessions.length) {
    throw new Error("L'archivio Firebase non e compatibile. Nessun dato locale verra sostituito.")
  }
  const manifest: CloudManifest = { schemaVersion: 1, revision: value.revision, state: value.state, sessions: value.sessions }
  if (encodedBytes(canonicalJson(manifest)) > CLOUD_DOCUMENT_BYTES) throw new Error('Il documento Firebase supera il limite supportato.')
  return manifest
}

export async function prepareCloudData(value: AppData): Promise<PreparedCloudData> {
  const data = parseCloudData(value)
  if (data.history.length > CLOUD_SESSION_LIMIT) throw new Error(`Lo storico supera ${CLOUD_SESSION_LIMIT} sedute. La copia locale e conservata; esporta un backup.`)
  const history: PreparedCloudData['history'] = []
  for (const session of data.history) {
    const payload = canonicalJson(session)
    if (encodedBytes(canonicalJson({ schemaVersion: 1, payload })) > CLOUD_DOCUMENT_BYTES) {
      throw new Error('Una singola seduta supera il limite del cloud. Esporta il backup: la copia locale non viene cancellata.')
    }
    history.push({ key: await hashPayload(payload), payload })
  }
  const state = canonicalJson(cloudHead(data))
  parseManifest({ schemaVersion: 1, revision: crypto.randomUUID(), state, sessions: history.map((item) => item.key) })
  return { state, history }
}

export async function restoreCloudData(manifest: CloudManifest, documents: ReadonlyMap<string, unknown>): Promise<AppData> {
  const head: unknown = JSON.parse(manifest.state)
  if (!record(head) || Object.hasOwn(head, 'history')) throw new Error('La configurazione Firebase non e valida. La copia locale e conservata.')
  const history: unknown[] = []
  for (const key of manifest.sessions) {
    const document = documents.get(key)
    if (!record(document) || document.schemaVersion !== 1 || typeof document.payload !== 'string'
      || encodedBytes(canonicalJson(document)) > CLOUD_DOCUMENT_BYTES
      || await hashPayload(document.payload) !== key) {
      throw new Error('Lo storico Firebase e incompleto o non integro. Nessun dato locale verra sostituito.')
    }
    history.push(JSON.parse(document.payload))
  }
  return parseCloudData({ ...head, history })
}
