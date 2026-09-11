import { parseCloudBaseline, parseCloudData } from './cloudModel.ts'
import type { CloudBaseline } from './cloudModel.ts'
import type { AppData } from './storage.ts'

const ACCOUNT_PREFIX = 'tempofit.account.v1.'

export type AccountCache =
  | { kind: 'missing' }
  | { kind: 'ready'; data: AppData; baseline?: CloudBaseline }
  | { kind: 'error'; message: string; data?: AppData }

export function accountStorageKey(uid: string) {
  if (!uid || uid.includes('/') || uid.length > 128) throw new Error('Identificativo account non valido.')
  return `${ACCOUNT_PREFIX}${encodeURIComponent(uid)}`
}

export function loadAccount(uid: string): AccountCache {
  try {
    const raw = localStorage.getItem(accountStorageKey(uid))
    if (raw === null) return { kind: 'missing' }
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1
      || !('uid' in value) || value.uid !== uid || !('data' in value) || !('baseline' in value)) {
      return { kind: 'error', message: 'La copia locale non appartiene a questo account o non e compatibile. Esporta il file originale prima di ripristinarla.' }
    }
    const data = parseCloudData(value.data)
    const baseline = value.baseline === null ? undefined : parseCloudBaseline(value.baseline)
    if (baseline === null) return { kind: 'error', data, message: 'Il riferimento di sincronizzazione locale non e valido. La copia originale non sara sovrascritta.' }
    return { kind: 'ready', data, baseline }
  } catch (error) {
    if (error instanceof DOMException) return { kind: 'error', message: 'Il browser non consente di leggere la copia locale di questo account.' }
    if (error instanceof Error) return { kind: 'error', message: `Copia locale non leggibile: ${error.message}. Il file originale e conservato.` }
    throw error
  }
}

export function saveAccount(uid: string, data: AppData, baseline?: CloudBaseline) {
  const valid = parseCloudData(data)
  localStorage.setItem(accountStorageKey(uid), JSON.stringify({ version: 1, uid, data: valid, baseline: baseline ?? null }))
}
