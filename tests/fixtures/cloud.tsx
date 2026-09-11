import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from '../../src/App'
import '../../src/index.css'
import '@fontsource-variable/dm-sans'
import '@fontsource-variable/manrope'
import { CloudConflictError, parseCloudData } from '../../src/cloudModel'
import type { CloudSnapshot } from '../../src/cloudModel'
import type { CloudClient, CloudIdentity } from '../../src/cloudClientTypes'
import type { CloudSyncTransport } from '../../src/cloudSync'

const observers = new Set<(identity: CloudIdentity | null) => void>()
const identity = (uid: string | null): CloudIdentity | null => uid ? { uid, displayName: `Account ${uid}`, email: `${uid}@example.invalid` } : null
window.addEventListener('storage', (event) => {
  if (event.key === 'test.auth') observers.forEach((receive) => receive(identity(event.newValue)))
})

async function snapshot(response: Response): Promise<CloudSnapshot> {
  const value: unknown = await response.json()
  if (!value || typeof value !== 'object' || !('revision' in value) || !('data' in value)
    || (value.revision !== null && typeof value.revision !== 'string')) throw new Error('Invalid fixture snapshot')
  return { revision: value.revision, data: value.data === null ? null : parseCloudData(value.data) }
}

function transport(uid: string): CloudSyncTransport {
  const url = `/__test_cloud/${encodeURIComponent(uid)}`
  const read = async () => {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Fixture read failed: ${response.status}`)
    return snapshot(response)
  }
  return {
    read,
    write: async (data, expectedRevision) => {
      const response = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data, expectedRevision }) })
      if (response.status === 409) throw new CloudConflictError(await snapshot(response))
      if (!response.ok) throw new Error(`Fixture write failed: ${response.status}`)
      return snapshot(response)
    },
    watch: (receive, error) => {
      let stopped = false
      let loading = false
      let last: string | null | undefined
      const timer = window.setInterval(() => {
        if (loading) return
        loading = true
        void read().then((value) => {
          if (!stopped && value.revision !== last) { last = value.revision; receive(value) }
        }).catch((cause: unknown) => { if (!stopped) error(cause) }).finally(() => { loading = false })
      }, 120)
      return () => { stopped = true; window.clearInterval(timer) }
    },
  }
}

const client: CloudClient = {
  observeAuth: (receive) => {
    observers.add(receive)
    queueMicrotask(() => { if (observers.has(receive)) receive(identity(localStorage.getItem('test.auth'))) })
    return () => { observers.delete(receive) }
  },
  signIn: async () => {
    const select = document.getElementById('test-account')
    if (!(select instanceof HTMLSelectElement)) throw new Error('Missing fixture account control')
    localStorage.setItem('test.auth', select.value)
    observers.forEach((receive) => receive(identity(select.value)))
  },
  signOut: async () => {
    localStorage.removeItem('test.auth')
    observers.forEach((receive) => receive(null))
  },
  transport,
}
const factory = async () => client
createRoot(document.getElementById('root')!).render(<StrictMode>
  <App cloudClientFactory={factory} />
  <label style={{ position: 'fixed', bottom: 0, right: 0, zIndex: 100, background: '#111' }}>
    Test account <select id="test-account" defaultValue="a"><option value="a">a</option><option value="b">b</option></select>
  </label>
</StrictMode>)
