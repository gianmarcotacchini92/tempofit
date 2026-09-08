import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, BookOpen, Check, ChevronRight, CircleHelp, Download, Dumbbell, HardDrive, History as HistoryIcon, LayoutDashboard, LockKeyhole, Menu, Settings2, TrendingUp, Upload, X, Zap } from 'lucide-react'
import { Configurator } from './Configurator'
import { ActiveWorkout, WorkoutEditor } from './Workout'
import { Dashboard, ExerciseDetail, ExerciseLibrary, History, NoWorkout, Progress } from './Screens'
import { Modal } from './components'
import { decodeData, downloadData, emptyData, loadData, MIGRATION_NOTICE, STORAGE_KEY } from './storage'
import { validatePlan } from './domain'
import type { Exercise, SetLog, WorkoutPlan, WorkoutSettings } from './domain'
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

function App() {
  const [initial] = useState(loadData)
  const [data, setData] = useState(initial.data)
  const [storageError, setStorageError] = useState(initial.error)
  const [view, setView] = useState<View>(initial.data.active ? 'workout' : 'home')
  const [config, setConfig] = useState<WorkoutSettings | null>(null)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [inspecting, setInspecting] = useState<Exercise | null>(null)
  const [toast, setToast] = useState(initial.notice ?? '')
  const [menuOpen, setMenuOpen] = useState(false)
  const [now, setNow] = useState(Date.now)
  const importInput = useRef<HTMLInputElement>(null)
  const main = useRef<HTMLElement>(null)
  const activeSessionId = data.active?.id

  useEffect(() => {
    if (storageError) return
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)) }
    catch (error) {
      if (error instanceof DOMException) {
        // Report a failed browser write without triggering another synchronous persistence effect.
        queueMicrotask(() => setStorageError('Salvataggio non riuscito: spazio esaurito o accesso bloccato. Esporta i dati di questa sessione prima di chiudere la pagina.'))
      }
      else throw error
    }
  }, [data, storageError])

  useEffect(() => {
    function changed(event: StorageEvent) {
      if ((event.key === STORAGE_KEY || event.key === null) && event.storageArea === localStorage) {
        setStorageError("Dati modificati in un'altra scheda. Esporta eventuali modifiche di questa scheda, poi ricarica per evitare sovrascritture.")
      }
    }
    window.addEventListener('storage', changed)
    return () => window.removeEventListener('storage', changed)
  }, [])

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
    setNow(Date.now())
    setData((old) => {
      if (!old.active || old.active.logs.some((item) => item.planExerciseId === log.planExerciseId && item.setIndex === log.setIndex)) return old
      const item = old.active.plan.exercises.find((exercise) => exercise.id === log.planExerciseId)
      if (!item) throw new Error('Serie non associata alla sessione corrente')
      return { ...old, active: { ...old.active, logs: [...old.active.logs, log] }, restEndsAt: Date.now() + item.restSeconds * 1000 }
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
    try { downloadData(localStorage.getItem(STORAGE_KEY) ?? JSON.stringify(data), 'tempofit-backup-originale.json') }
    catch (error) {
      if (error instanceof DOMException) setToast("Impossibile leggere il salvataggio originale: il browser blocca l'accesso.")
      else throw error
    }
  }

  async function importData(file: File) {
    if (file.size > 10 * 1024 * 1024) { setToast('Il file supera il limite di 10 MB.'); return }
    try {
      const parsed: unknown = JSON.parse(await file.text())
      const decoded = decodeData(parsed)
      if (!decoded) { setToast('Backup non compatibile. Nessun dato e stato modificato.'); return }
      if (data.active || data.history.length > 0 || data.draft) { setToast('Per proteggere i tuoi dati, importa in un archivio vuoto. Esporta prima il backup, poi usa Ripristina.'); return }
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
  return <div className="app-shell">
    <a className="skip-link" href="#main">Vai al contenuto</a>
    {menuOpen && <button className="sidebar-backdrop" aria-label="Chiudi menu" onClick={() => setMenuOpen(false)} />}
    <aside className={`sidebar ${menuOpen ? 'is-open' : ''}`}>
      <button className="brand" onClick={() => navigate('home')} aria-label="TempoFit, panoramica"><span className="brand-mark"><Zap size={23} fill="currentColor" /></span><span>tempo<span className="brand-light">fit</span><span className="brand-dot">.</span></span></button>
      <div className="workspace-label">IL TUO SPAZIO</div>
      <nav className="desktop-navigation" aria-label="Navigazione principale">{navigation.map(({ id, label, icon: Icon }) =>
        <button key={id} className={`nav-item ${view === id ? 'active' : ''}`} aria-current={view === id ? 'page' : undefined} onClick={() => navigate(id)}><Icon size={20} strokeWidth={1.7} />{label}{id === 'workout' && data.active && <span className="nav-live" />}{view === id && <ChevronRight size={15} className="nav-chevron" />}</button>)}</nav>
      <div className="sidebar-bottom"><div className="local-card"><span className="local-card-icon"><LockKeyhole size={19} /></span><strong>Il tuo spazio, davvero.</strong><p>I tuoi allenamenti restano su questo dispositivo. Nessun account necessario.</p><span className="local-status"><span /> MODALITA LOCALE</span></div>
        <button className="nav-item subdued" onClick={() => setDialog('help')}><CircleHelp size={19} /> Come funziona <ArrowUpRight size={14} className="nav-chevron" /></button>
        <button className="profile-button" onClick={() => setDialog('settings')}><span className="avatar">TU</span><span><strong>Il tuo profilo</strong><small>Personale / Locale</small></span><Settings2 size={18} /></button>
      </div>
    </aside>
    <div className="app-content">
      <header className="topbar"><div className="breadcrumb"><button className="icon-button menu-toggle" aria-label="Apri menu" onClick={() => setMenuOpen(true)}><Menu size={21} /></button><span className="breadcrumb-root">Il mio spazio</span><ChevronRight size={13} /><strong>{currentLabel}</strong></div><div className="topbar-actions"><span className="local-indicator"><span className={storageError ? 'status-error' : ''} />{storageError ? 'Salvataggio bloccato' : 'Solo sul tuo dispositivo'}</span><button className="avatar small" aria-label="Impostazioni e backup" onClick={() => setDialog('settings')}>TU</button></div></header>
      <main id="main" ref={main} tabIndex={-1}>
        {storageError && <div className="alert storage-alert" role="alert"><p>{storageError}</p><div><button className="button secondary compact" onClick={() => downloadData(JSON.stringify(data, null, 2), 'tempofit-dati-correnti.json')}>Esporta dati correnti</button><button className="button secondary compact" onClick={exportRaw}>Esporta originale</button><button className="button secondary compact" onClick={() => window.location.reload()}>Ricarica</button><button className="button ghost compact" onClick={() => setDialog('reset')}>Ripristina</button></div></div>}
        {view === 'home' && <Dashboard history={data.history} active={data.active} onCreate={configure} onHistory={() => navigate('history')} onResume={() => navigate('workout')} />}
        {view === 'workout' && (data.active ? <ActiveWorkout session={data.active} now={now} restEndsAt={data.restEndsAt} onLog={logSet}
          onUndo={(id) => setData((old) => ({ ...old, active: old.active ? { ...old.active, logs: old.active.logs.filter((log) => log.id !== id) } : null, restEndsAt: null }))}
          onRest={(end) => { setNow(Date.now()); setData((old) => ({ ...old, restEndsAt: end })) }} onFinish={() => setDialog('finish')} onDiscard={() => setDialog('discard')} blocked={Boolean(storageError)} />
          : data.draft ? <WorkoutEditor plan={data.draft} onChange={(plan) => setData((old) => ({ ...old, draft: plan }))} onConfigure={() => setConfig(data.draft!.settings)} onStart={startWorkout} blocked={Boolean(storageError)} />
            : <NoWorkout onCreate={configure} />)}
        {view === 'exercises' && <ExerciseLibrary equipment={data.settings.equipment} onInspect={setInspecting} />}
        {view === 'history' && <History history={data.history} onCreate={configure} />}
        {view === 'progress' && <Progress history={data.history} />}
        <footer className="page-footer"><span>Fatto per il tuo ritmo.</span><span>TempoFit <span className="accent">/</span> Prototipo locale 0.1</span></footer>
      </main>
    </div>
    <nav className="mobile-navigation" aria-label="Navigazione mobile">{navigation.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? 'active' : ''} aria-current={view === id ? 'page' : undefined} onClick={() => navigate(id)}><Icon size={20} /><span>{label}</span></button>)}</nav>
    {toast && <div className="toast" role="status"><Check size={18} /><span>{toast}</span><button className="icon-button" aria-label="Chiudi messaggio" onClick={() => setToast('')}><X size={16} /></button></div>}
    {config && <Configurator initial={config} history={data.history} onClose={() => setConfig(null)} onGenerate={generated} />}
    {inspecting && <Modal title={inspecting.name} onClose={() => setInspecting(null)}><ExerciseDetail exercise={inspecting} /></Modal>}
    {dialog === 'settings' && <Modal title="Il tuo spazio personale." subtitle="Senza account. Senza dati inviati a un server." onClose={() => setDialog(null)}>
      <div className="settings-content"><div className="quiet-note"><HardDrive size={22} /><p>I dati sono salvati in questo browser e a questo indirizzo. Cambiare browser, porta o cancellare i dati del sito li rende inaccessibili. Conserva un backup.</p></div>
        <button className="settings-action" onClick={() => { downloadData(JSON.stringify(data, null, 2), 'tempofit-backup.json'); setToast('Backup esportato.') }}><Download size={21} /><span><strong>Esporta il tuo backup</strong><small>Profilo, piani, sessione attiva e storico in JSON</small></span><ChevronRight size={18} /></button>
        <button className="settings-action" onClick={() => importInput.current?.click()}><Upload size={21} /><span><strong>Importa un backup</strong><small>Disponibile solo con archivio vuoto, per evitare sovrascritture</small></span><ChevronRight size={18} /></button>
        <input className="sr-only" type="file" ref={importInput} accept=".json,application/json" aria-label="File backup JSON" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importData(file); event.target.value = '' }} />
        <div className="settings-divider" /><button className="button danger ghost full" onClick={() => setDialog('reset')}>Ripristina i dati locali</button>
      </div></Modal>}
    {dialog === 'help' && <Modal title="Un piano. Non una corsa." onClose={() => setDialog(null)}><div className="help-content">
      <h3>01 / Scegli il tempo reale</h3><p>Il generatore include riscaldamento, avvicinamento, recuperi, transizioni e un margine operativo. La durata rimane una stima.</p>
      <h3>02 / Personalizza prima di iniziare</h3><p>Seleziona muscoli, attrezzatura, esperienza e obiettivo. Preferenze ed esclusioni sono nella configurazione avanzata. Puoi modificare o sostituire ogni esercizio del piano.</p>
      <h3>03 / Registra quello che fai davvero</h3><p>Conferma il carico, inserisci ripetizioni e RIR facoltativo. Il timer parte dopo una serie e resta corretto anche cambiando scheda. Salva anche le sessioni parziali.</p>
      <h3>04 / Ritorna, con un riferimento</h3><p>Lo storico alimenta suggerimenti conservativi sulla stessa variante. Senza dati sufficienti scegli tu il carico. Il prototipo non effettua diagnosi, deload automatici o valutazioni cliniche.</p>
      <div className="quiet-note"><p>Prototipo per adulti senza controindicazioni note. Non e un dispositivo medico. In caso di dolore, interrompi il movimento e chiedi una valutazione qualificata. Nessun LLM riceve i tuoi dati.</p></div>
    </div></Modal>}
    {dialog === 'finish' && data.active && <Modal title="Un altro passo fatto." subtitle={`${data.active.logs.length} serie registrate. Salviamo il lavoro di oggi?`} onClose={() => setDialog(null)}>
      <p className="dialog-copy">Solo le serie completate entrano nello storico e nella progressione. Le altre restano indicate come non eseguite.</p><div className="modal-actions"><button className="button secondary" onClick={() => setDialog(null)}>Continua sessione</button><button className="button primary" onClick={finishWorkout}><Check size={18} /> Salva e termina</button></div></Modal>}
    {dialog === 'discard' && <Modal title="Scartare questa sessione?" onClose={() => setDialog(null)}><p className="dialog-copy">Le serie della sessione in corso saranno eliminate. Il piano e lo storico precedente restano disponibili.</p><div className="modal-actions"><button className="button secondary" onClick={() => setDialog(null)}>Continua ad allenarti</button><button className="button danger" onClick={() => { setData((old) => ({ ...old, active: null, restEndsAt: null })); setDialog(null) }}>Scarta sessione</button></div></Modal>}
    {dialog === 'reset' && <Modal title="Ripristinare lo spazio locale?" onClose={() => setDialog(null)}><p className="dialog-copy">Questa azione elimina profilo, piani e allenamenti TempoFit da questo browser. Esporta un backup prima di procedere. Nessun altro dato del browser viene modificato.</p><div className="modal-actions"><button className="button secondary" onClick={() => setDialog(null)}>Annulla</button><button className="button danger" onClick={() => {
      try { localStorage.removeItem(STORAGE_KEY); setData(emptyData()); setStorageError(null); setDialog(null); navigate('home'); setToast('Spazio locale ripristinato.') }
      catch (error) { if (error instanceof DOMException) setToast('Il browser non consente di ripristinare i dati.'); else throw error }
    }}>Elimina dati TempoFit</button></div></Modal>}
  </div>
}

export default App
