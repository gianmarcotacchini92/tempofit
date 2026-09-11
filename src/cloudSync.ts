import { baselineFor, CloudConflictError, hasLocalWork, mergeCloudData, parseCloudBaseline, parseCloudData, sameAppData } from './cloudModel.ts'
import type { CloudBaseline, CloudSnapshot } from './cloudModel.ts'
import type { AppData } from './storage.ts'

export interface CloudSyncStatus {
  phase: 'connecting' | 'synced' | 'pending' | 'saving' | 'choice' | 'conflict' | 'error' | 'offline'
  message: string
  canUseRemote?: boolean
}

export interface CloudSyncTransport {
  read(): Promise<CloudSnapshot>
  write(data: AppData, expectedRevision: string | null): Promise<CloudSnapshot>
  watch(receive: (snapshot: CloudSnapshot) => void, error: (error: unknown) => void): () => void
}

export interface CloudSyncPorts {
  local: () => AppData
  /** Atomically persist before publishing state; on failure throw without changing local data. */
  apply: (data: AppData) => void
  blocked: () => boolean
  /** Persist before publishing the baseline; on failure throw without advancing it. */
  remember: (baseline: CloudBaseline) => void
  backup: (data: AppData) => void
  status: (status: CloudSyncStatus) => void
  describeError: (error: unknown) => string
}

export class CloudSyncSession {
  private readonly transport: CloudSyncTransport
  private readonly ports: CloudSyncPorts
  private baseline: CloudBaseline | undefined
  private latest: CloudSnapshot | undefined
  private epoch = 0
  private remoteVersion = 0
  private online = false
  private stopped = false
  private enabled = false
  private failed = false
  private queue: Promise<void> = Promise.resolve()
  private timer: ReturnType<typeof setTimeout> | undefined
  private unwatch: (() => void) | undefined

  constructor(transport: CloudSyncTransport, ports: CloudSyncPorts, baseline?: CloudBaseline) {
    this.transport = transport
    this.ports = ports
    if (baseline !== undefined) {
      const parsed = parseCloudBaseline(baseline)
      if (!parsed) throw new Error('Collegamento cloud locale non valido. Nessun dato e stato trasferito.')
      this.baseline = parsed
    }
  }

  private current(epoch: number): boolean {
    return !this.stopped && this.online && this.epoch === epoch
  }

  private working(epoch: number): boolean {
    return this.current(epoch) && !this.failed
  }

  private cancelTimer(): void {
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
  }

  private disconnect(): void {
    this.epoch++
    this.enabled = false
    this.cancelTimer()
    const unwatch = this.unwatch
    this.unwatch = undefined
    this.queue = Promise.resolve()
    unwatch?.()
  }

  private fail(error: unknown, epoch: number): void {
    if (!this.current(epoch)) return
    this.failed = true
    this.enabled = false
    this.cancelTimer()
    this.ports.status({ phase: 'error', message: this.ports.describeError(error) })
  }

  private run(action: (epoch: number) => Promise<void>): Promise<void> {
    const epoch = this.epoch
    const next = this.queue.then(async () => {
      if (!this.working(epoch)) return
      try { await action(epoch) }
      catch (error) { this.fail(error, epoch) }
    })
    this.queue = next
    return next
  }

  private checked(snapshot: CloudSnapshot): CloudSnapshot {
    if (snapshot.data === null && snapshot.revision === null) return { revision: null, data: null }
    if (typeof snapshot.revision !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(snapshot.revision)
      || snapshot.data === null) throw new Error('Snapshot cloud non valido. Dati locali conservati.')
    return { revision: snapshot.revision, data: parseCloudData(snapshot.data) }
  }

  private receive(snapshot: CloudSnapshot, epoch: number): void {
    if (!this.working(epoch)) return
    try {
      this.latest = this.checked(snapshot)
      this.remoteVersion++
      void this.run((generation) => this.reconcile(generation))
    } catch (error) { this.fail(error, epoch) }
  }

  async start(): Promise<void> {
    if (this.stopped) return
    const epoch = this.epoch + 1
    this.online = true
    this.failed = false
    this.latest = undefined
    try {
      this.disconnect()
      if (!this.working(epoch)) return
      this.ports.status({ phase: 'connecting', message: 'Connessione al tuo spazio Firebase...' })
      const snapshot = await this.transport.read()
      if (!this.working(epoch)) return
      this.latest = this.checked(snapshot)
      this.remoteVersion++
      const unwatch = this.transport.watch(
        (remote) => this.receive(remote, epoch),
        (error) => this.fail(error, epoch),
      )
      if (!this.working(epoch)) { unwatch(); return }
      this.unwatch = unwatch
      await this.run((generation) => this.reconcile(generation))
    } catch (error) { this.fail(error, epoch) }
  }

  private choice(conflict = false, message?: string): void {
    this.enabled = false
    this.cancelTimer()
    this.ports.status({
      phase: conflict ? 'conflict' : 'choice',
      message: message ?? (conflict
        ? 'I dispositivi hanno modificato gli stessi dati. Le copie sono conservate: scegli quale usare.'
        : this.latest?.data
          ? 'Scegli quale copia usare per collegare il dispositivo. Nessun dato viene sostituito senza consenso.'
          : 'Attiva il salvataggio dei dati di questo dispositivo nel tuo spazio Firebase.'),
      canUseRemote: Boolean(this.latest?.data),
    })
  }

  private available(): void {
    if (!this.ports.blocked()) return
    throw new Error('Salvataggio locale bloccato. Sincronizzazione sospesa: conserva o esporta i dati e riprova.')
  }

  private remember(baseline: CloudBaseline): void {
    this.ports.remember(baseline)
    this.baseline = baseline
  }

  private schedule(): void {
    this.cancelTimer()
    const epoch = this.epoch
    this.timer = setTimeout(() => {
      if (this.working(epoch)) void this.flush()
    }, 900)
  }

  private report(schedule: boolean): void {
    const equal = sameAppData(this.ports.local(), this.latest?.data ?? null)
    this.ports.status({
      phase: equal ? 'synced' : 'pending',
      message: equal ? 'Sincronizzato con Firebase.'
        : 'Modifiche conservate sul dispositivo, sincronizzazione in attesa...',
    })
    if (equal) this.cancelTimer()
    else if (schedule) this.schedule()
  }

  private stable(epoch: number, remoteVersion: number, local: AppData): boolean {
    return this.working(epoch) && this.remoteVersion === remoteVersion && sameAppData(local, this.ports.local())
  }

  private async reconcile(epoch: number, schedule = true): Promise<void> {
    while (this.working(epoch) && this.latest) {
      this.available()
      const remote = this.latest
      const remoteVersion = this.remoteVersion
      const local = parseCloudData(this.ports.local())
      if (!remote.data) { this.choice(); return }
      const equal = sameAppData(local, remote.data)
      if (!equal && this.baseline?.head && this.baseline.revision === remote.revision) {
        this.enabled = true
        this.report(schedule)
        return
      }
      let target: AppData = remote.data
      if (!equal && this.baseline?.head) {
        const merged = await mergeCloudData(this.baseline, local, remote.data)
        if (!this.working(epoch)) return
        if (!this.stable(epoch, remoteVersion, local)) continue
        if (!merged.data) { this.choice(true); return }
        target = merged.data
      } else if (!equal && hasLocalWork(local)) {
        this.choice()
        return
      }
      const baseline = await baselineFor(remote)
      if (!this.working(epoch)) return
      if (!this.stable(epoch, remoteVersion, local)) continue
      this.available()
      if (!sameAppData(local, target)) {
        if (!this.stable(epoch, remoteVersion, local)) continue
        this.ports.apply(target)
        if (!this.working(epoch)) return
      }
      this.remember(baseline)
      if (!this.working(epoch)) return
      this.enabled = true
      this.report(schedule)
      return
    }
  }

  localChanged(): void {
    if (!this.working(this.epoch)) return
    this.cancelTimer()
    void this.run((epoch) => this.reconcile(epoch))
  }

  async flush(): Promise<void> {
    this.cancelTimer()
    await this.run(async (epoch) => {
      await this.reconcile(epoch, false)
      if (!this.working(epoch) || !this.enabled || !this.latest) return
      this.available()
      const local = parseCloudData(this.ports.local())
      if (sameAppData(local, this.latest.data)) return
      await this.write(local, this.latest, epoch, false)
    })
  }

  private async write(local: AppData, remote: CloudSnapshot, epoch: number, explicit: boolean): Promise<void> {
    this.cancelTimer()
    this.ports.status({ phase: 'saving', message: 'Salvataggio su Firebase...' })
    if (!this.working(epoch)) return
    try {
      const saved = this.checked(await this.transport.write(local, remote.revision))
      if (!this.working(epoch)) return
      if (!saved.data || !sameAppData(local, saved.data) || saved.revision === remote.revision) {
        throw new Error('Il cloud non ha confermato la copia inviata. Sincronizzazione sospesa.')
      }
      const baseline = await baselineFor(saved)
      if (!this.working(epoch)) return
      this.available()
      this.remember(baseline)
      if (!this.working(epoch)) return
      if (!this.latest || this.latest.revision === remote.revision || this.latest.revision === saved.revision) {
        this.latest = saved
        this.remoteVersion++
      } else {
        // UUID revisions are not ordered: a server read disambiguates watch events racing the acknowledgement.
        const latest = await this.transport.read()
        if (!this.working(epoch)) return
        this.latest = this.checked(latest)
        this.remoteVersion++
      }
      this.enabled = true
      await this.reconcile(epoch)
    } catch (error) {
      if (!this.working(epoch)) return
      if (!(error instanceof CloudConflictError)) throw error
      this.latest = this.checked(error.latest)
      this.remoteVersion++
      if (explicit) this.choice(true)
      else await this.reconcile(epoch)
    }
  }

  async chooseLocal(): Promise<void> {
    await this.run(async (epoch) => {
      if (!this.latest) return
      this.available()
      const remote = this.latest
      const remoteVersion = this.remoteVersion
      const local = parseCloudData(this.ports.local())
      if (remote.data) this.ports.backup(parseCloudData(remote.data))
      if (!this.stable(epoch, remoteVersion, local)) {
        if (this.working(epoch)) this.choice(false, 'Le copie sono cambiate. Controllale e conferma di nuovo la scelta.')
        return
      }
      await this.write(local, remote, epoch, true)
    })
  }

  async chooseRemote(): Promise<void> {
    await this.run(async (epoch) => {
      if (!this.latest?.data) return
      this.available()
      const remote = this.latest
      const remoteVersion = this.remoteVersion
      const local = parseCloudData(this.ports.local())
      const baseline = await baselineFor(remote)
      if (!this.working(epoch)) return
      if (!this.stable(epoch, remoteVersion, local)) {
        this.choice(false, 'Le copie sono cambiate. Controllale e conferma di nuovo la scelta.')
        return
      }
      this.available()
      this.ports.backup(local)
      if (!this.stable(epoch, remoteVersion, local)) return
      this.ports.apply(parseCloudData(remote.data))
      if (!this.working(epoch)) return
      this.remember(baseline)
      if (!this.working(epoch)) return
      this.enabled = true
      this.report(true)
    })
  }

  offline(): void {
    if (this.stopped) return
    this.online = false
    this.disconnect()
    this.ports.status({ phase: 'offline', message: 'Sei offline. Le modifiche restano sul dispositivo; ricollega il cloud per sincronizzarle.' })
  }

  stop(): void {
    this.stopped = true
    this.online = false
    this.disconnect()
  }
}
