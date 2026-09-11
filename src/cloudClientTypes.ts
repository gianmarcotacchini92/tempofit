import type { CloudSyncTransport } from './cloudSync.ts'

export interface CloudIdentity {
  uid: string
  displayName: string | null
  email: string | null
}

export interface CloudClient {
  observeAuth(receive: (user: CloudIdentity | null) => void, error: (error: unknown) => void): () => void
  signIn(): Promise<void>
  signOut(): Promise<void>
  transport(uid: string): CloudSyncTransport
}

export type CloudClientFactory = () => Promise<CloudClient>

export function describeCloudError(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : ''
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return 'Accesso annullato. I dati sul dispositivo non sono stati modificati.'
  if (code === 'auth/popup-blocked') return 'Il browser ha bloccato la finestra Google. Consenti i popup per questo sito e riprova.'
  if (code === 'auth/unauthorized-domain') return 'Questo indirizzo non e ancora autorizzato in Firebase Authentication. La copia locale e conservata.'
  if (code === 'permission-denied') return "Firebase non consente l'accesso a questi dati. Controlla account e regole di TempoFit; la copia locale e conservata."
  if (code === 'unavailable' || code === 'auth/network-request-failed') return 'Firebase non e raggiungibile. I dati restano sul dispositivo; riprova quando torna la connessione.'
  if (code === 'resource-exhausted') return 'Quota Firebase raggiunta. I dati restano sul dispositivo: esporta un backup e riprova piu tardi.'
  if (error instanceof Error) return error.message
  return 'Sincronizzazione non riuscita. I dati locali sono conservati; riprova o esporta un backup.'
}
