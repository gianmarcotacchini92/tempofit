import { getApps, initializeApp } from 'firebase/app'
import { browserLocalPersistence, browserPopupRedirectResolver, initializeAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import { collection, doc, documentId, getDocFromServer, getDocsFromServer, getFirestore, onSnapshot, query, runTransaction, serverTimestamp, where, writeBatch } from 'firebase/firestore'
import type { Auth } from 'firebase/auth'
import type { Firestore } from 'firebase/firestore'
import { firebaseConfig } from './firebaseConfig'
import { CloudConflictError } from './cloudModel'
import type { CloudSnapshot } from './cloudModel'
import type { CloudClient } from './cloudClientTypes'
import type { CloudSyncTransport } from './cloudSync'
import { encodedBytes, parseManifest, prepareCloudData, restoreCloudData } from './cloudPayload'
import type { CloudManifest } from './cloudPayload'
import type { AppData } from './storage'

let instance: Promise<CloudClient> | undefined

export function firebaseClient(): Promise<CloudClient> {
  if (instance) return instance
  instance = initializeClient().catch((error: unknown) => { instance = undefined; throw error })
  return instance
}

async function initializeClient(): Promise<CloudClient> {
  const app = getApps().find((candidate) => candidate.name === 'tempofit') ?? initializeApp(firebaseConfig, 'tempofit')
  // Resolve popup infrastructure only on sign-in, not during anonymous browsing.
  const auth = initializeAuth(app, { persistence: browserLocalPersistence })
  auth.languageCode = 'it'
  const db = getFirestore(app)
  return {
    observeAuth: (receive, error) => onAuthStateChanged(auth, (user) => receive(user ? { uid: user.uid, displayName: user.displayName, email: user.email } : null), error),
    signIn: async () => {
      const provider = new GoogleAuthProvider()
      provider.setCustomParameters({ prompt: 'select_account' })
      await signInWithPopup(auth, provider, browserPopupRedirectResolver)
    },
    signOut: () => signOut(auth),
    transport: (uid) => new FirebaseTransport(db, auth, uid),
  }
}

class FirebaseTransport implements CloudSyncTransport {
  private readonly historyCache = new Map<string, unknown>()
  private readonly db: Firestore
  private readonly auth: Auth
  private readonly uid: string

  constructor(db: Firestore, auth: Auth, uid: string) {
    if (!uid || uid.includes('/') || uid.length > 128) throw new Error('Identificativo account non valido.')
    this.db = db
    this.auth = auth
    this.uid = uid
  }

  private owner() {
    if (this.auth.currentUser?.uid !== this.uid) throw new Error("Account cambiato: l'operazione precedente e stata annullata.")
  }

  private root() { return doc(this.db, 'tempoFitUsers', this.uid) }
  private history() { return collection(this.db, 'tempoFitUsers', this.uid, 'sessions') }

  private async hydrate(manifest: CloudManifest): Promise<CloudSnapshot> {
    this.owner()
    const documents = new Map(this.historyCache)
    const missing = manifest.sessions.filter((key) => !this.historyCache.has(key))
    for (let index = 0; index < missing.length; index += 30) {
      const result = await getDocsFromServer(query(this.history(), where(documentId(), 'in', missing.slice(index, index + 30))))
      this.owner()
      for (const document of result.docs) documents.set(document.id, document.data())
    }
    const data = await restoreCloudData(manifest, documents)
    this.owner()
    for (const key of manifest.sessions) this.historyCache.set(key, documents.get(key))
    return { revision: manifest.revision, data }
  }

  async read(): Promise<CloudSnapshot> {
    this.owner()
    const snapshot = await getDocFromServer(this.root())
    this.owner()
    return snapshot.exists() ? this.hydrate(parseManifest(snapshot.data())) : { revision: null, data: null }
  }

  async write(data: AppData, expectedRevision: string | null): Promise<CloudSnapshot> {
    this.owner()
    const prepared = await prepareCloudData(data)
    this.owner()
    // History is immutable and content-addressed. Only the manifest makes staged documents visible.
    const uploads = prepared.history.filter((item) => !this.historyCache.has(item.key))
    for (let index = 0; index < uploads.length;) {
      const batch = writeBatch(this.db)
      const staged: typeof uploads = []
      let bytes = 0
      while (index < uploads.length && staged.length < 250) {
        const entry = uploads[index]
        const size = encodedBytes(entry.payload) + 2048
        if (staged.length && bytes + size > 4 * 1024 * 1024) break
        batch.set(doc(this.history(), entry.key), { schemaVersion: 1, payload: entry.payload })
        staged.push(entry)
        bytes += size
        index++
      }
      await batch.commit()
      this.owner()
      staged.forEach((entry) => this.historyCache.set(entry.key, { schemaVersion: 1, payload: entry.payload }))
    }
    const revision = crypto.randomUUID()
    const committed = await runTransaction(this.db, async (transaction) => {
      this.owner()
      const current = await transaction.get(this.root())
      const currentRevision = current.exists() ? parseManifest(current.data()).revision : null
      if (currentRevision !== expectedRevision) return false
      this.owner()
      transaction.set(this.root(), { schemaVersion: 1, revision, state: prepared.state, sessions: prepared.history.map((entry) => entry.key), updatedAt: serverTimestamp() })
      return true
    })
    this.owner()
    if (!committed) throw new CloudConflictError(await this.read())
    return { revision, data }
  }

  watch(receive: (snapshot: CloudSnapshot) => void, error: (error: unknown) => void): () => void {
    let sequence = 0
    let stopped = false
    const unsubscribe = onSnapshot(this.root(), { includeMetadataChanges: true }, (snapshot) => {
      if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return
      const current = ++sequence
      void (async () => {
        try {
          this.owner()
          const value = snapshot.exists() ? await this.hydrate(parseManifest(snapshot.data())) : { revision: null, data: null }
          if (!stopped && current === sequence) receive(value)
        } catch (cause) { if (!stopped && current === sequence) error(cause) }
      })()
    }, (cause) => { if (!stopped) error(cause) })
    return () => { stopped = true; sequence++; unsubscribe() }
  }
}
