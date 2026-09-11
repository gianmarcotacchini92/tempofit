import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, BookOpen, Check, ChevronRight, CircleHelp, Download, Dumbbell, HardDrive, History as HistoryIcon, LayoutDashboard, LockKeyhole, Menu, Settings2, TrendingUp, Upload, X, Zap } from 'lucide-react'
import { Configurator } from './Configurator'
import { ActiveWorkout, WorkoutEditor } from './Workout'
import { Dashboard, ExerciseDetail, ExerciseLibrary, History, NoWorkout, Progress } from './Screens'
import { Modal } from './components'
import { decodeData, downloadData, MIGRATION_NOTICE } from './storage'
import type { AppData } from './storage'
import { importWorkoutCsv } from './csvImport'
import { repairCsvHistory } from './csvRepair'
import type { CsvRepairResult } from './csvRepair'
import { needsCsvRepair, validatePlan, workoutSetSteps } from './domain'
import type { Exercise, SetLog, WorkoutPlan, WorkoutSettings } from './domain'
import { loggedSetsLabel } from './format'
import { CloudAccount } from './CloudAccount'
import { useCloudWorkspace } from './useCloudWorkspace'
import type { CloudWorkspace } from './useCloudWorkspace'
import type { CloudClientFactory } from './cloudClientTypes'
import './App.css'

type View = 'home' | 'workout' | 'exercises' | 'history' | 'progress'
type Dialog = 'settings' | 'help' | 'finish' | 'discard' | 'reset' | null
const navigation = [
  { id: 'home', label: 'Panoramica', icon: LayoutDashboard },
  { id: 'workout', label: 'Allenamento', icon: Dumbbell },
  { id: 'exercises', label: 'Esercizi', icon: BookOpen },
  { id: 'history', label: 'Storico', icon: HistoryIcon },
  { id: 'progress', label: 'Progressi', icon: TrendingUp },
] as const

function WorkspaceApp({ workspace }: { workspace: CloudWorkspace }) {
  const { data, setData, storageError, setStorageError } = workspace
  const [view, setView] = useState<View>(data.active ? 'workout' : 'home')
  const [config, setConfig] = useState<WorkoutSettings | null>(null)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [pendingRepair, setPendingRepair] = useState<{ base: AppData; result: Extract<CsvRepairResult, { error: null }>; backedUp: boolean } | null>(null)
  const [inspecting, setInspecting] = useState<Exercise | null>(null)
  const [toast, setToast] = useState(workspace.notice ?? '')
  const [menuOpen, setMenuOpen] = useState(false)
  const [now, setNow] = useState(Date.now)
  const importInput = useRef<HTMLInputElement>(null)
  const main = useRef<HTMLElement>(null)
  const activeSessionId = data.active?.id
  const legacyCsvCount = data.history.filter(needsCsvRepair).length

  useEffect(() => {
    if (!activeSessionId) return
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [activeSessionId])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(''), 6500)
    return () => window.clearTimeout(timeout)
  }, [toast])

  function navigate(next: View) {
    setView(next)
    setMenuOpen(false)
    window.scrollTo({ top: 0, behavior: 'instant' })
    main.current?.focus({ preventScroll: true })
  }

  function configure(preset?: Partial<WorkoutSettings>) {
    if (workspace.accountChangePending) { workspace.report('Completa il cambio account prima di creare un altro piano.'); return }
    if (data.active) { navigate('workout'); setToast('Hai una sessione in corso. Salvala o scartala prima di creare un altro piano.'); return }
    setConfig({ ...data.settings, ...preset })
  }

  function generated(plan: WorkoutPlan, settings: WorkoutSettings, message: string) {
    setData((old) => ({ ...old, draft: plan, settings }))
    setConfig(null)
    navigate('workout')
    setToast(message || 'Il tuo allenamento e pronto. Controlla i dettagli e scegli i carichi.')
  }

  function startWorkout() {
    if (!data.draft || data.active || storageError) return
    const issues = validatePlan(data.draft)
    if (issues.length) { setToast(issues.join(' ')); return }
    const startedAt = new Date().toISOString()
    setNow(Date.now())
    setData((old) => ({ ...old, active: { id: crypto.randomUUID(), plan: structuredClone(data.draft!), startedAt, finishedAt: null, logs: [] }, restEndsAt: null }))
  }

  function logSet(log: SetLog) {
    if (storageError) return
    const session = data.active
    if (!session) { setToast('Nessuna sessione attiva: riapri il tuo allenamento.'); return }
    const steps = workoutSetSteps(session.plan)
    const step = steps.find((item) => item.item.id === log.planExerciseId && item.setIndex === log.setIndex && item.part === log.part)
    if (!step) { setToast('Questo passaggio non appartiene al piano attivo.'); return }
    const recorded = (candidate: typeof step) => session.logs.some((item) => item.planExerciseId === candidate.item.id && item.setIndex === candidate.setIndex && item.part === candidate.part)
    if (recorded(step)) { setToast('Questo passaggio e gia stato registrato.'); return }
    if (step.part && !session.logs.some((item) => item.planExerciseId === log.planExerciseId && item.setIndex === log.setIndex && !item.part)) {
      setToast('Registra la serie principale prima della mini-serie.'); return
    }
    if (step.item.supersetGroup) {
      const next = steps.find((candidate) => candidate.item.supersetGroup === step.item.supersetGroup && !recorded(candidate))
      if (next !== step) { setToast('Nella superserie completa prima il passaggio precedente: A, poi B.'); return }
    }
    setNow(Date.now())
    setData((old) => {
      if (!old.active || old.active.logs.some((item) => item.planExerciseId === log.planExerciseId && item.setIndex === log.setIndex && item.part === log.part)) return old
      return { ...old, active: { ...old.active, logs: [...old.active.logs, log] }, restEndsAt: step.restAfterSeconds > 0 ? Date.now() + step.restAfterSeconds * 1000 : null }
    })
  }

  function undoSet(id: string) {
    setData((old) => {
      const target = old.active?.logs.find((log) => log.id === id)
      if (!old.active || !target) return old
      const logs = old.active.logs.filter((log) => log.id !== id && !(target.part === undefined
        && log.planExerciseId === target.planExerciseId && log.setIndex === target.setIndex && log.part !== undefined))
      return { ...old, active: { ...old.active, logs }, restEndsAt: null }
    })
  }

  function finishWorkout() {
    if (!data.active || !data.active.logs.length || storageError) return
    const session = { ...data.active, finishedAt: new Date().toISOString() }
    setData((old) => ({ ...old, active: null, draft: null, history: [session, ...old.history], restEndsAt: null }))
    setDialog(null)
    navigate('history')
    setToast('Allenamento salvato. Un altro passo nel tuo percorso.')
  }

  function exportRaw() {
    try { downloadData(workspace.original() ?? JSON.stringify(data), 'tempofit-backup-originale.json') }
    catch (error) {
      if (error instanceof DOMException) setToast("Impossibile leggere il salvataggio originale: il browser blocca l'accesso.")
      else throw error
    }
  }

  async function importData(file: File) {
    const scopeToken = workspace.token()
    if (file.size > 10 * 1024 * 1024) { setToast('Il file supera il limite di 10 MB.'); return }
    try {
      const csv = file.name.toLocaleLowerCase('it').endsWith('.csv') || file.type === 'text/csv'
      if ((data.active || data.history.length > 0 || data.draft) && !(csv && legacyCsvCount > 0)) { setToast('Per proteggere i tuoi dati, importa in un archivio vuoto. Esporta prima il backup, poi usa Ripristina.'); return }
      if (csv && legacyCsvCount > 0 && storageError) { setToast('Risolvi il blocco di salvataggio prima di correggere lo storico.'); return }
      const content = await file.text()
      if (!workspace.isCurrentToken(scopeToken)) { workspace.report('Cambio account in corso o completato: importazione annullata. Seleziona nuovamente il file nel profilo corretto.'); return }
      if (!workspace.isCurrentData(data)) { workspace.report('I dati sono cambiati durante la lettura: importazione annullata. Riapri lo storico e seleziona nuovamente il file.'); return }
      if (csv) {
        const imported = importWorkoutCsv(content)
        if (imported.error || !imported.data) { setToast(imported.error ?? 'Nessuna seduta importabile.'); return }
        if (legacyCsvCount > 0) {
          const result = repairCsvHistory(data, imported.data.history)
          if (result.error !== null) { setToast(result.error); return }
          setPendingRepair({ base: data, result, backedUp: false })
          setDialog(null)
          return
        }
        setData(imported.data)
        setStorageError(null)
        setDialog(null)
        navigate('history')
        setToast(`Importate ${imported.importedSessions} sedute e ${imported.importedSets} serie.${imported.skippedRows ? ` Ignorate ${imported.skippedRows} righe di riscaldamento o non leggibili.` : ''}${imported.skippedExercises.length ? ` Esercizi non riconosciuti: ${imported.skippedExercises.slice(0, 3).join(', ')}${imported.skippedExercises.length > 3 ? '…' : ''}.` : ''}`)
        return
      }
      const decoded = decodeData(JSON.parse(content))
      if (!decoded) { setToast('Backup non compatibile. Nessun dato e stato modificato.'); return }
      setData(decoded.data)
      setStorageError(null)
      setDialog(null)
      navigate(decoded.data.active ? 'workout' : 'home')
      setToast(decoded.migrated ? MIGRATION_NOTICE : 'Backup importato.')
    } catch (error) {
      if (error instanceof SyntaxError) setToast('Il file non contiene un JSON valido. Nessun dato e stato modificato.')
      else if (error instanceof DOMException) setToast('Il browser non ha potuto leggere il file selezionato.')
      else throw error
    }
  }

  const currentLabel = navigation.find((item) => item.id === view)?.label
  const identity = workspace.identity
  const initials = identity ? (identity.displayName || identity.email || 'TU').slice(0, 2).toLocaleUpperCase('it') : 'TU'
  const cloudLabel = !identity ? 'Solo sul tuo dispositivo' : workspace.status.phase === 'synced' ? 'Sincronizzato'
    : workspace.status.phase === 'offline' ? 'Offline / copia locale' : workspace.status.phase === 'saving' ? 'Sincronizzazione...'
      : workspace.status.phase === 'pending' ? 'Modifiche in attesa' : workspace.status.phase === 'connecting' ? 'Connessione Firebase...' : 'Cloud da collegare'
  return <div className="app-shell">
    <a className="skip-link" href="#main">Vai al contenuto</a>
    {menuOpen && <button className="sidebar-backdrop" aria-label="Chiudi menu" onClick={() => setMenuOpen(false)} />}
    <aside className={`sidebar ${menuOpen ? 'is-open' : ''}`}>
      <button className="brand" onClick={() => navigate('home')} aria-label="TempoFit, panoramica"><span className="brand-mark"><Zap size={23} fill="currentColor" /></span><span>tempo<span className="brand-light">fit</span><span className="brand-dot">.</span></span></button>
      <div className="workspace-label">IL TUO SPAZIO</div>
      <nav className="desktop-navigation" aria-label="Navigazione principale">{navigation.map(({ id, label, icon: Icon }) =>
        <button key={id} className={`nav-item ${view === id ? 'active' : ''}`} aria-current={view === id ? 'page' : undefined} onClick={() => navigate(id)}><Icon size={20} strokeWidth={1.7} />{label}{id === 'workout' && data.active && <span className="nav-live" />}{view === id && <ChevronRight size={15} className="nav-chevron" />}</button>)}</nav>
      <div className="sidebar-bottom"><div className="local-card"><span className="local-card-icon"><LockKeyhole size={19} /></span><strong>Il tuo spazio, davvero.</strong><p>{identity ? 'Copia locale e sincronizzazione privata con il tuo account Google.' : 'Allenati senza account oppure collega Google per ritrovare i tuoi dati su PC e telefono.'}</p><span className="local-status"><span /> {identity ? 'ACCOUNT GOOGLE' : 'MODALITA LOCALE'}</span></div>
        <button className="nav-item subdued" onClick={() => setDialog('help')}><CircleHelp size={19} /> Come funziona <ArrowUpRight size={14} className="nav-chevron" /></button>
        <button className="profile-button" onClick={() => setDialog('settings')}><span className="avatar">{initials}</span><span><strong>{identity?.displayName || 'Il tuo profilo'}</strong><small>{identity ? 'Google / Firebase' : 'Locale / Collega Google'}</small></span><Settings2 size={18} /></button>
      </div>
    </aside>
    <div className="app-content">
      <header className="topbar"><div className="breadcrumb"><button className="icon-button menu-toggle" aria-label="Apri menu" onClick={() => setMenuOpen(true)}><Menu size={21} /></button><span className="breadcrumb-root">Il mio spazio</span><ChevronRight size={13} /><strong>{currentLabel}</strong></div><div className="topbar-actions"><span className="local-indicator"><span className={storageError || workspace.status.phase === 'error' ? 'status-error' : ''} />{storageError ? 'Salvataggio bloccato' : cloudLabel}</span><button className="avatar small" aria-label="Impostazioni e backup" onClick={() => setDialog('settings')}>{initials}</button></div></header>
      <main id="main" ref={main} tabIndex={-1}>
        {workspace.authError && dialog !== 'settings' && <div className="alert cloud-banner" role="alert"><p>{workspace.authError}</p><button className="button secondary compact" onClick={() => setDialog('settings')}>Apri account</button></div>}
        {identity && ['choice', 'conflict', 'error', 'offline'].includes(workspace.status.phase) && <div className="alert cloud-banner" role="status"><p>{workspace.status.message}</p><button className="button secondary compact" onClick={() => setDialog('settings')}>Account e sincronizzazione</button></div>}
        {legacyCsvCount > 0 && <div className="alert storage-alert" role="alert"><p>{legacyCsvCount} sedute provengono dal vecchio import CSV, che accorpava varianti diverse. Non vengono usate nei grafici per esercizio o nei suggerimenti di carico finche non le correggi dal file originale. Se hai un piano gia generato, ricontrolla i carichi prima di iniziare.</p><button className="button secondary compact" onClick={() => setDialog('settings')}>Correggi associazioni CSV</button></div>}
        {storageError && <div className="alert storage-alert" role="alert"><p>{storageError}</p><div><button className="button secondary compact" onClick={() => downloadData(JSON.stringify(data, null, 2), 'tempofit-dati-correnti.json')}>Esporta dati correnti</button><button className="button secondary compact" onClick={exportRaw}>Esporta originale</button><button className="button secondary compact" onClick={() => window.location.reload()}>Ricarica</button><button className="button ghost compact" disabled={Boolean(identity) || workspace.accountChangePending} onClick={() => setDialog('reset')}>Ripristina</button></div></div>}
        {view === 'home' && <Dashboard history={data.history} active={data.active} onCreate={configure} onHistory={() => navigate('history')} onResume={() => navigate('workout')} />}
        {view === 'workout' && (data.active ? <ActiveWorkout session={data.active} now={now} restEndsAt={data.restEndsAt} onLog={logSet} onInspect={setInspecting}
          onUndo={undoSet}
          onRest={(end) => { setNow(Date.now()); setData((old) => ({ ...old, restEndsAt: end })) }} onFinish={() => setDialog('finish')} onDiscard={() => setDialog('discard')} blocked={Boolean(storageError)} />
          : data.draft ? <WorkoutEditor plan={data.draft} onChange={(plan) => setData((old) => ({ ...old, draft: plan }))} onConfigure={() => setConfig(data.draft!.settings)} onStart={startWorkout} onInspect={setInspecting} blocked={Boolean(storageError)} />
            : <NoWorkout onCreate={() => configure()} />)}
        {view === 'exercises' && <ExerciseLibrary equipment={data.settings.equipment} onInspect={setInspecting} />}
        {view === 'history' && <History history={data.history} onCreate={() => configure()} onInspect={setInspecting} />}
        {view === 'progress' && <Progress history={data.history} onInspect={setInspecting} />}
        <footer className="page-footer"><span>Fatto per il tuo ritmo. <a href={`${import.meta.env.BASE_URL}exercises/ATTRIBUTION.json`} target="_blank" rel="noreferrer">Crediti illustrazioni</a></span><span>TempoFit <span className="accent">/</span> {identity ? 'Google + Firebase' : 'Modalita locale'}</span></footer>
      </main>
    </div>
    <nav className="mobile-navigation" aria-label="Navigazione mobile">{navigation.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? 'active' : ''} aria-current={view === id ? 'page' : undefined} onClick={() => navigate(id)}><Icon size={20} /><span>{label}</span></button>)}</nav>
    {toast && <div className="toast" role="status"><Check size={18} /><span>{toast}</span><button className="icon-button" aria-label="Chiudi messaggio" onClick={() => setToast('')}><X size={16} /></button></div>}
    {config && <Configurator initial={config} history={data.history} onClose={() => setConfig(null)} onGenerate={generated} />}
    {inspecting && <Modal title={inspecting.name} onClose={() => setInspecting(null)}><ExerciseDetail exercise={inspecting} /></Modal>}
    {dialog === 'settings' && <Modal title="Il tuo spazio personale." subtitle={identity ? 'Account Google, sincronizzazione e backup.' : 'Accesso Google facoltativo. I dati locali restano tuoi.'} onClose={() => setDialog(null)}>
      <div className="settings-content"><CloudAccount workspace={workspace} /><div className="quiet-note"><HardDrive size={22} /><p>{identity ? 'Controlla lo stato Sincronizzato prima di cambiare dispositivo. Le modifiche in attesa sono conservate nella copia locale di questo account. Mantieni anche un backup JSON.' : 'Senza account i dati restano in questo browser e a questo indirizzo. Collega Google per sincronizzarli, oppure conserva un backup JSON.'}</p></div>
        <button className="settings-action" onClick={() => { downloadData(JSON.stringify(data, null, 2), 'tempofit-backup.json'); setToast('Backup esportato.') }}><Download size={21} /><span><strong>Esporta il tuo backup</strong><small>Profilo, piani, sessione attiva e storico in JSON</small></span><ChevronRight size={18} /></button>
        <button className="settings-action" onClick={() => importInput.current?.click()}><Upload size={21} /><span><strong>{legacyCsvCount > 0 ? 'Correggi storico dal CSV originale' : 'Importa backup o CSV'}</strong><small>{legacyCsvCount > 0 ? 'Ripara solo le vecchie sedute corrispondenti. Non serve cancellare lo storico.' : 'JSON TempoFit o CSV Hevy, disponibile solo con archivio vuoto'}</small></span><ChevronRight size={18} /></button>
        <input className="sr-only" type="file" ref={importInput} accept=".json,.csv,application/json,text/csv" aria-label="Backup JSON o CSV allenamenti" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importData(file); event.target.value = '' }} />
        <div className="settings-divider" /><button className="button danger ghost full" disabled={Boolean(identity) || workspace.accountChangePending} onClick={() => setDialog('reset')}>Ripristina i dati locali</button>
        {identity && <p className="field-help">Esci da Google per ripristinare lo spazio senza account. Questa azione non cancella lo storico nel cloud.</p>}
      </div></Modal>}
    {pendingRepair && <Modal title="Correggi le associazioni CSV." onClose={() => setPendingRepair(null)}>
      <p className="dialog-copy">Il CSV ricostruira {pendingRepair.result.correctedSessions} sedute importate e {pendingRepair.result.restoredSets} serie, separando gli esercizi originali. I dati di queste sedute saranno riletti dal file. Le sessioni registrate in TempoFit, le impostazioni, il piano e la sessione in corso restano invariati: ricontrolla i carichi dei piani gia generati.</p>
      {pendingRepair.result.remainingSessions > 0 && <p className="dialog-copy">{pendingRepair.result.remainingSessions} vecchie sedute non sono presenti nel file: restano conservate e da correggere. Le sedute nuove del CSV non vengono aggiunte da questa operazione.</p>}
      <p className="dialog-copy">Esporta prima una copia dello storico attuale. Nessuna modifica viene applicata finche non confermi.</p>
      <button className="button secondary full" onClick={() => {
        downloadData(JSON.stringify(pendingRepair.base, null, 2), 'tempofit-prima-correzione-csv.json')
        setPendingRepair((old) => old ? { ...old, backedUp: true } : null)
      }}><Download size={18} /> Esporta backup prima della correzione</button>
      <div className="modal-actions"><button className="button secondary" onClick={() => setPendingRepair(null)}>Annulla</button>
        <button className="button primary" disabled={!pendingRepair.backedUp || Boolean(storageError)} onClick={() => {
          if (storageError || data !== pendingRepair.base) { setToast('I dati sono cambiati. Ricarica il CSV prima di confermare.'); setPendingRepair(null); return }
          setData(pendingRepair.result.data)
          setToast(`Corrette ${pendingRepair.result.correctedSessions} sedute. Le varianti ora hanno storico e progressi separati.`)
          setPendingRepair(null)
          navigate('history')
        }}>Applica correzione</button></div>
    </Modal>}
    {dialog === 'help' && <Modal title="Un piano. Non una corsa." onClose={() => setDialog(null)}><div className="help-content">
      <h3>01 / Scegli il tempo reale</h3><p>Il generatore include riscaldamento, avvicinamento, recuperi, transizioni e un margine operativo. La durata rimane una stima.</p>
      <h3>02 / Personalizza prima di iniziare</h3><p>Seleziona muscoli, attrezzatura, esperienza e obiettivo. Preferenze ed esclusioni sono nella configurazione avanzata. Puoi modificare o sostituire ogni esercizio del piano.</p>
      <h3>03 / Registra quello che fai davvero</h3><p>Conferma il carico, inserisci ripetizioni e RIR facoltativo. Il timer parte dopo una serie e resta corretto anche cambiando scheda. Salva anche le sessioni parziali.</p>
      <h3>04 / Ritorna, con un riferimento</h3><p>Lo storico alimenta suggerimenti conservativi sulla stessa variante. Senza dati sufficienti scegli tu il carico. Il prototipo non effettua diagnosi, deload automatici o valutazioni cliniche.</p>
      <div className="quiet-note"><p>Prototipo per adulti senza controindicazioni note. Non e un dispositivo medico. In caso di dolore, interrompi il movimento e chiedi una valutazione qualificata. Nessun LLM riceve i tuoi dati.</p></div>
    </div></Modal>}
    {dialog === 'finish' && data.active && <Modal title="Un altro passo fatto." subtitle={`${loggedSetsLabel(data.active.logs)} registrate. Salviamo il lavoro di oggi?`} onClose={() => setDialog(null)}>
      <p className="dialog-copy">Solo le serie completate entrano nello storico e nella progressione. Le altre restano indicate come non eseguite.</p><div className="modal-actions"><button className="button secondary" onClick={() => setDialog(null)}>Continua sessione</button><button className="button primary" onClick={finishWorkout}><Check size={18} /> Salva e termina</button></div></Modal>}
    {dialog === 'discard' && <Modal title="Scartare questa sessione?" onClose={() => setDialog(null)}><p className="dialog-copy">Le serie della sessione in corso saranno eliminate. Il piano e lo storico precedente restano disponibili.</p><div className="modal-actions"><button className="button secondary" onClick={() => setDialog(null)}>Continua ad allenarti</button><button className="button danger" onClick={() => { setData((old) => ({ ...old, active: null, restEndsAt: null })); setDialog(null) }}>Scarta sessione</button></div></Modal>}
    {dialog === 'reset' && <Modal title="Ripristinare lo spazio locale?" onClose={() => setDialog(null)}><p className="dialog-copy">Questa azione elimina profilo, piani e allenamenti TempoFit da questo browser. Esporta un backup prima di procedere. Nessun altro dato del browser viene modificato.</p><div className="modal-actions"><button className="button secondary" onClick={() => setDialog(null)}>Annulla</button><button className="button danger" onClick={() => {
      if (!workspace.resetGuest()) return
      setDialog(null); navigate('home'); setToast('Spazio locale ripristinato.')
    }}>Elimina dati TempoFit</button></div></Modal>}
  </div>
}

export default function App({ cloudClientFactory }: { cloudClientFactory?: CloudClientFactory } = {}) {
  const workspace = useCloudWorkspace(cloudClientFactory)
  return <fieldset className="workspace-fields" disabled={workspace.busy} aria-busy={workspace.busy}>
    <WorkspaceApp key={`${workspace.scope}:${workspace.accountChangePending ? 'recovery' : 'ready'}`} workspace={workspace} />
  </fieldset>
}
