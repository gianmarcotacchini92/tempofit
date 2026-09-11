import { useCallback, useEffect, useRef, useState } from 'react'
import type { SetStateAction } from 'react'
import { accountStorageKey, loadAccount, saveAccount } from './accountStorage'
import { describeCloudError } from './cloudClientTypes'
import type { CloudClient, CloudClientFactory, CloudIdentity } from './cloudClientTypes'
import type { CloudBaseline } from './cloudModel'
import { CloudSyncSession } from './cloudSync'
import type { CloudSyncStatus } from './cloudSync'
import { downloadData, emptyData, loadData, STORAGE_KEY } from './storage'
import type { AppData } from './storage'

const GUEST_STATUS: CloudSyncStatus = { phase: 'choice', message: 'Dati salvati solo in questo browser. Accedi con Google per collegare i tuoi dispositivi.' }
const lazyFirebase: CloudClientFactory = async () => (await import('./firebaseClient')).firebaseClient()

interface WorkspaceState {
  scope: string
  identity: CloudIdentity | null
  data: AppData
  baseline?: CloudBaseline
  storageError: string | null
  storageChanged: boolean
  authError: string | null
  authReady: boolean
  busy: boolean
  accountChangePending: boolean
  status: CloudSyncStatus
  notice?: string
}

export function useCloudWorkspace(factory: CloudClientFactory = lazyFirebase) {
  const [state, setState] = useState<WorkspaceState>(() => {
    const local = loadData()
    return { scope: 'guest', identity: null, data: local.data, storageError: local.error, storageChanged: false,
      authError: null, authReady: false, busy: true, accountChangePending: false, status: GUEST_STATUS, notice: local.notice }
  })
  const current = useRef(state)
  const epoch = useRef(0)
  const mounted = useRef(false)
  const client = useRef<CloudClient | null>(null)
  const session = useRef<CloudSyncSession | null>(null)
  const pendingChange = useRef<(() => void) | null>(null)
  const protectedData = useRef<AppData | null>(null)
  const [attempt, setAttempt] = useState(0)

  const patch = useCallback((change: Partial<WorkspaceState>) => {
    current.current = { ...current.current, ...change }
    setState(current.current)
  }, [])

  const persist = useCallback((value: WorkspaceState) => {
    if (value.identity) saveAccount(value.identity.uid, value.data, value.baseline)
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(value.data))
  }, [])

  const storageFailure = useCallback((error: unknown) => {
    if (error instanceof DOMException) {
      patch({ storageError: 'Salvataggio locale non riuscito: spazio esaurito o accesso bloccato. Esporta i dati correnti prima di chiudere. La sincronizzazione e sospesa.' })
    } else if (error instanceof Error) patch({ storageError: `Salvataggio sospeso: ${error.message}` })
    else throw error
  }, [patch])

  const stopSync = useCallback(() => {
    session.current?.stop()
    session.current = null
  }, [])
  const nextEpoch = useCallback(() => ++epoch.current, [])

  useEffect(() => {
    mounted.current = true
    const bootEpoch = nextEpoch()
    let disposed = false
    let unobserve: (() => void) | undefined
    pendingChange.current = null
    patch({ busy: true, authReady: false, authError: null, accountChangePending: false })
    if (!current.current.storageError) {
      try { persist(current.current) } catch (error) { storageFailure(error) }
    }
    void factory().then((connection) => {
      if (disposed || !mounted.current || bootEpoch !== epoch.current) return
      client.current = connection
      const changeIdentity = (identity: CloudIdentity | null, recovered = false) => {
        if (disposed || !mounted.current) return
        if ((identity === null && current.current.scope === 'guest')
          || (identity && identity.uid === current.current.identity?.uid && session.current)) {
          pendingChange.current = null
          patch({ identity, busy: false, authReady: true, authError: null, accountChangePending: false,
            ...(identity === null ? { status: GUEST_STATUS } : {}) })
          return
        }
        stopSync()
        const accountEpoch = nextEpoch()
        if (current.current.storageError && protectedData.current !== current.current.data && !recovered) {
          pendingChange.current = () => changeIdentity(identity, true)
          patch({ busy: false, authReady: true, accountChangePending: true,
            authError: 'Google ha cambiato account, ma questa copia contiene dati da proteggere. Esportala prima di completare il passaggio.',
            status: { phase: 'error', message: 'Cambio account sospeso: copia corrente conservata in memoria.' } })
          return
        }
        pendingChange.current = null
        protectedData.current = null
        const active = () => !disposed && mounted.current && epoch.current === accountEpoch
        if (!identity) {
          const local = loadData()
          patch({ scope: 'guest', identity: null, data: local.data, baseline: undefined, storageError: local.error, storageChanged: false,
            busy: false, authReady: true, authError: null, accountChangePending: false, status: GUEST_STATUS, notice: local.notice })
          return
        }
        const cache = loadAccount(identity.uid)
        const local = loadData()
        const data = cache.kind === 'ready' ? cache.data : cache.kind === 'missing' ? local.error ? emptyData() : local.data : cache.data ?? emptyData()
        const baseline = cache.kind === 'ready' ? cache.baseline : undefined
        const storageError = cache.kind === 'error' ? cache.message : null
        patch({ scope: `account:${identity.uid}`, identity, data, baseline, storageError, storageChanged: false, busy: false, authReady: true, accountChangePending: false,
          authError: null, status: { phase: 'connecting', message: 'Collegamento al tuo account Firebase...' },
          notice: cache.kind === 'missing' && local.error ? 'La copia senza account non e leggibile e non e stata importata. Il file originale resta conservato nello spazio locale.' : undefined })
        try {
          if (!storageError) persist(current.current)
        } catch (error) { storageFailure(error) }
        try {
          const controller = new CloudSyncSession(connection.transport(identity.uid), {
            local: () => {
              if (!active()) throw new Error('Account cambiato: operazione precedente annullata.')
              return current.current.data
            },
            blocked: () => !active() || Boolean(current.current.storageError),
            apply: (next) => {
              if (!active()) throw new Error('Account cambiato: copia precedente non applicata.')
              if (current.current.storageError) throw new Error('Risolvi il blocco di salvataggio locale prima di caricare dati cloud.')
              try {
                persist({ ...current.current, data: next })
                patch({ data: next })
              } catch (error) { storageFailure(error); throw error }
            },
            remember: (next) => {
              if (!active()) throw new Error('Account cambiato: riferimento precedente non applicato.')
              try {
                persist({ ...current.current, baseline: next })
                patch({ baseline: next })
              } catch (error) { storageFailure(error); throw error }
            },
            backup: (value) => {
              if (!active()) throw new Error('Account cambiato: operazione annullata.')
              downloadData(JSON.stringify(value, null, 2), `tempofit-prima-sincronizzazione-${Date.now()}.json`)
            },
            status: (status) => { if (active()) patch({ status }) },
            describeError: describeCloudError,
          }, baseline)
          session.current = controller
          if (navigator.onLine) void controller.start()
          else controller.offline()
        } catch (error) {
          if (active()) patch({ status: { phase: 'error', message: describeCloudError(error) } })
        }
      }
      unobserve = connection.observeAuth((identity) => changeIdentity(identity), (error) => {
        if (!disposed && mounted.current) {
          stopSync()
          patch({ authError: describeCloudError(error), busy: false, authReady: false,
            status: { phase: 'error', message: 'Accesso da ripristinare: sincronizzazione sospesa.' } })
        }
      })
    }).catch((error: unknown) => {
      if (!disposed && mounted.current && bootEpoch === epoch.current) {
        patch({ authError: describeCloudError(error), busy: false, authReady: false })
      }
    })
    return () => {
      disposed = true
      mounted.current = false
      nextEpoch()
      stopSync()
      unobserve?.()
    }
  }, [attempt, factory, patch, persist, storageFailure, stopSync, nextEpoch])

  useEffect(() => {
    const offline = () => session.current?.offline()
    const online = () => { if (session.current) void session.current.start() }
    function changed(event: StorageEvent) {
      const key = current.current.identity ? accountStorageKey(current.current.identity.uid) : STORAGE_KEY
      if ((event.key === key || event.key === null) && event.storageArea === localStorage) {
        patch({ storageChanged: true, storageError: "Dati modificati in un'altra scheda. Esporta le modifiche di questa scheda e ricarica per evitare sovrascritture." })
        session.current?.offline()
      }
    }
    window.addEventListener('offline', offline)
    window.addEventListener('online', online)
    window.addEventListener('storage', changed)
    return () => {
      window.removeEventListener('offline', offline)
      window.removeEventListener('online', online)
      window.removeEventListener('storage', changed)
    }
  }, [patch])

  const setData = useCallback((update: SetStateAction<AppData>) => {
    if (current.current.busy || current.current.accountChangePending) { patch({ authError: 'Completa il cambio account prima di modificare i dati.' }); return }
    const next = typeof update === 'function' ? update(current.current.data) : update
    if (next === current.current.data) return
    patch({ data: next })
    if (!current.current.storageError) {
      try { persist(current.current) } catch (error) { storageFailure(error) }
    }
    session.current?.localChanged()
  }, [patch, persist, storageFailure])

  const setStorageError = useCallback((message: string | null) => {
    if (message === null && current.current.storageChanged) {
      patch({ authError: "Ricarica la pagina prima di sostituire dati modificati da un'altra scheda." })
      return
    }
    patch({ storageError: message })
    if (message === null) {
      try { persist(current.current) } catch (error) { storageFailure(error); return }
      if (session.current) void session.current.start()
    }
  }, [patch, persist, storageFailure])

  async function authAction(action: 'in' | 'out') {
    if (current.current.accountChangePending || (action === 'in' && current.current.storageError)) {
      patch({ authError: 'Esporta la copia corrente e risolvi il salvataggio locale prima di cambiare account.' })
      return
    }
    const connection = client.current
    if (!connection) { setAttempt((value) => value + 1); return }
    const actionEpoch = epoch.current
    patch({ busy: true, authError: null })
    try {
      if (action === 'out') {
        if (current.current.storageError) {
          downloadData(JSON.stringify(current.current.data, null, 2), `tempofit-prima-uscita-${Date.now()}.json`)
          protectedData.current = current.current.data
        } else persist(current.current)
        await connection.signOut()
      } else await connection.signIn()
    } catch (error) {
      if (mounted.current && actionEpoch === epoch.current) patch({ authError: describeCloudError(error) })
    } finally {
      if (mounted.current && actionEpoch === epoch.current) patch({ busy: false })
    }
  }

  const retry = () => {
    if (current.current.accountChangePending) { patch({ authError: 'Esporta la copia corrente per completare il cambio account.' }); return }
    if (!client.current || !current.current.authReady) setAttempt((value) => value + 1)
    else if (session.current) void session.current.start()
  }

  const renderEpoch = epoch.current
  return {
    ...state,
    setData: (update: SetStateAction<AppData>) => {
      if (!mounted.current || renderEpoch !== epoch.current) {
        patch({ authError: 'Account cambiato: modifica precedente annullata. Ripeti la modifica nel profilo corretto.' })
        return
      }
      setData(update)
    },
    setStorageError,
    completeAccountChange: () => {
      const complete = pendingChange.current
      if (!complete) { patch({ authError: 'Il cambio account non e piu disponibile. Riprova il collegamento.' }); return }
      try {
        downloadData(JSON.stringify(current.current.data, null, 2), `tempofit-prima-cambio-account-${Date.now()}.json`)
        complete()
      } catch (error) { patch({ authError: describeCloudError(error) }) }
    },
    resetGuest: () => {
      if (current.current.identity || current.current.accountChangePending || current.current.busy || renderEpoch !== epoch.current) {
        patch({ authError: 'Esci da Google e completa eventuali cambi account prima di ripristinare lo spazio senza account.' })
        return false
      }
      const data = emptyData()
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)) }
      catch (error) { storageFailure(error); return false }
      patch({ data, baseline: undefined, storageError: null, storageChanged: false })
      return true
    },
    signIn: () => authAction('in'), signOut: () => authAction('out'), retry,
    useLocal: () => session.current?.chooseLocal(),
    useRemote: () => session.current?.chooseRemote(),
    original: () => localStorage.getItem(current.current.identity ? accountStorageKey(current.current.identity.uid) : STORAGE_KEY),
    currentData: () => current.current.data,
    token: () => epoch.current,
    isCurrentToken: (token: number) => mounted.current && token === epoch.current && !current.current.busy && !current.current.accountChangePending,
    isCurrentData: (data: AppData) => current.current.data === data && !current.current.storageChanged,
    report: (message: string) => patch({ authError: message }),
  }
}

export type CloudWorkspace = ReturnType<typeof useCloudWorkspace>
