import { useMemo, useState } from 'react'
import { ArrowLeft, BookmarkPlus, Clock3, Copy, Download, Pencil, Play, Plus, Search, Trash2, WandSparkles } from 'lucide-react'
import { EQUIPMENT_LABELS, GOAL_LABELS, LEVEL_LABELS, MUSCLE_LABELS, estimatePlanSeconds, getExercise, needsCsvRepair, routineVolumeWarnings, validatePlan } from './domain'
import type { Exercise, WorkoutPlan, WorkoutSession, WorkoutSettings } from './domain'
import { addRoutineExercise, extractHistoryRoutines, getRoutineExercises, moveRoutineExercise, normalizeRoutineName, setRoutineExercises } from './routines'
import type { WorkoutRoutine } from './routines'
import { ExerciseArtwork, Modal } from './components'
import { WorkoutEditor } from './Workout'

export function RoutineLibrary({ routines, history, blocked, onCreate, onGenerate, onRecover, onUse, onEdit, onDuplicate, onDelete }: {
  routines: WorkoutRoutine[]; history: WorkoutSession[]; blocked: boolean
  onCreate: () => void; onGenerate: () => void; onRecover: () => void
  onUse: (routine: WorkoutRoutine) => void; onEdit: (routine: WorkoutRoutine) => void
  onDuplicate: (routine: WorkoutRoutine) => void; onDelete: (routine: WorkoutRoutine) => void
}) {
  const [search, setSearch] = useState('')
  const recovered = useMemo(() => extractHistoryRoutines(history), [history])
  const known = new Set(routines.flatMap((routine) => [normalizeRoutineName(routine.name), ...(routine.historyKey ? [routine.historyKey] : [])]))
  const missing = recovered.filter((routine) => !known.has(normalizeRoutineName(routine.name)) && (!routine.historyKey || !known.has(routine.historyKey))).length
  const legacy = history.filter(needsCsvRepair).length
  const query = normalizeRoutineName(search)
  const visible = routines.filter((routine) => normalizeRoutineName(routine.name).includes(query)
    || routine.plan.exercises.some((item) => normalizeRoutineName(getExercise(item.exerciseId).name).includes(query)))
  return <>
    <div className="page-heading routine-heading"><div><span className="eyebrow">LE TUE SCHEDE, PRONTE A RIPARTIRE</span><h1>Le tue routine.</h1>
      <p>Schede salvate, pronte per la prossima sessione.</p></div>
      <button className="button primary" disabled={blocked} onClick={onCreate}><Plus size={18} /> Nuova routine</button></div>
    <div className="routine-toolbar"><label className="search-field"><Search size={17} /><input aria-label="Cerca routine" placeholder="Cerca routine o esercizio" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <button className="button secondary compact" disabled={blocked} onClick={onGenerate}><WandSparkles size={16} /> Dal generatore</button>
      <button className="button secondary compact" disabled={blocked || missing === 0} onClick={onRecover}><Download size={16} /> Recupera dallo storico{missing > 0 ? ` (${missing})` : ''}</button></div>
    <details className="routine-help"><summary>Come vengono recuperate le routine</summary><p className="field-help">Una routine per nome, dalla seduta piu recente. Il recupero aggiunge solo quelle mancanti e non sovrascrive le tue modifiche. Tempo, obiettivo, livello e recuperi mancanti nel CSV sono valori da ricontrollare. Il volume originale resta invariato, con avvisi e non tagli automatici.</p></details>
    {legacy > 0 && <p className="alert" role="status">{legacy} sedute con vecchie associazioni CSV non vengono usate per creare routine. Correggile dal profilo con il file originale.</p>}
    {routines.length === 0 ? <div className="panel routine-empty"><BookmarkPlus size={35} /><h2>La prossima volta parti da qui.</h2><p>Crea una scheda da zero, salvala da un workout oppure recuperala dallo storico.</p>
      <button className="button secondary" disabled={blocked} onClick={onCreate}>Crea la prima routine</button></div>
      : visible.length === 0 ? <div className="empty-inline">Nessuna routine corrisponde alla ricerca.</div>
        : <div className="routine-grid">{visible.map((routine) => {
          const issues = validatePlan(routine.plan)
          const volumeWarnings = routineVolumeWarnings(routine.plan)
          const duration = estimatePlanSeconds(routine.plan)
          return <article className="panel routine-card" key={routine.id}>
            <div className="routine-card-heading"><h2>{routine.name}</h2><span className="tag">{routine.source === 'history' ? 'Dallo storico' : 'Personalizzata'}</span></div>
            <div className="routine-meta"><span><Clock3 size={14} /> {Math.ceil(duration / 60)} min stimati</span><span>{routine.plan.exercises.length} esercizi</span><span>{routine.plan.exercises.reduce((sum, item) => sum + item.sets, 0)} serie</span></div>
            <div className="tag-list">{routine.plan.settings.muscles.map((muscle, index) => <span className={`tag ${index === 0 ? 'routine-focus' : ''}`} key={muscle}>{index === 0 ? 'Focus: ' : ''}{MUSCLE_LABELS[muscle]}</span>)}</div>
            <ol className="routine-preview">{routine.plan.exercises.slice(0, 4).map((item) => <li key={item.id}><span>{getExercise(item.exerciseId).name}</span><small>{item.sets} x {item.repMin === item.repMax ? item.repMin : `${item.repMin}-${item.repMax}`}</small></li>)}</ol>
            {routine.plan.exercises.length > 4 && <p className="field-help">Altri {routine.plan.exercises.length - 4} esercizi nella scheda.</p>}
            {issues.length > 0 && <p className="routine-warning">Da rivedere prima di iniziare: {issues.length} {issues.length === 1 ? 'indicazione' : 'indicazioni'}.</p>}
            {volumeWarnings.length > 0 && <p className="routine-warning">Volume personale: {volumeWarnings.length} {volumeWarnings.length === 1 ? 'avviso' : 'avvisi'}. Serie ed esercizi conservati.</p>}
            <div className="routine-card-actions"><button className="button primary compact" disabled={blocked || routine.plan.exercises.length === 0} onClick={() => onUse(routine)}><Play size={16} /> Usa routine</button>
              <button className="button secondary compact" disabled={blocked} onClick={() => onEdit(routine)}><Pencil size={16} /> Modifica</button>
              <button className="icon-button" aria-label={`Duplica ${routine.name}`} disabled={blocked} onClick={() => onDuplicate(routine)}><Copy size={17} /></button>
              <button className="icon-button" aria-label={`Elimina routine ${routine.name}`} disabled={blocked} onClick={() => onDelete(routine)}><Trash2 size={17} /></button></div>
            <span className="routine-updated">{routine.source === 'history' ? 'Seduta di riferimento' : 'Aggiornata'}: {new Date(routine.updatedAt).toLocaleDateString('it-IT')}</span>
          </article>
        })}</div>}
  </>
}

export function RoutineSettingsDialog({ plan, onApply, onClose }: {
  plan: WorkoutPlan; onApply: (settings: WorkoutSettings) => void; onClose: () => void
}) {
  const [settings, setSettings] = useState(() => structuredClone(plan.settings))
  return <Modal title="Parametri della routine." subtitle="Cambiano i vincoli della scheda, non gli esercizi scelti." onClose={onClose}>
    <form onSubmit={(event) => { event.preventDefault(); onApply(settings) }}>
      <div className="form-grid edit-grid">
        <label className="field">Tempo disponibile (minuti)<input type="number" required min="1" max="180" step="any" value={settings.minutes} onChange={(event) => setSettings({ ...settings, minutes: event.target.valueAsNumber })} /></label>
        <label className="field">Recupero minimo (secondi)<input type="number" required min="0" max="300" step="1" value={settings.minRestSeconds ?? 0} onChange={(event) => setSettings({ ...settings, minRestSeconds: event.target.valueAsNumber })} /></label>
        <label className="field">Obiettivo<select value={settings.goal} onChange={(event) => {
          const goal = event.target.value
          if (goal === 'strength' || goal === 'hypertrophy' || goal === 'mixed') setSettings({ ...settings, goal })
        }}>{Object.entries(GOAL_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="field">Livello<select value={settings.level} onChange={(event) => {
          const level = event.target.value
          if (level === 'beginner' || level === 'intermediate' || level === 'advanced') setSettings({ ...settings, level })
        }}>{Object.entries(LEVEL_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="field">Attrezzatura<select value={settings.equipment} onChange={(event) => {
          const equipment = event.target.value
          if (equipment === 'gym' || equipment === 'dumbbells' || equipment === 'bodyweight') setSettings({ ...settings, equipment })
        }}>{Object.entries(EQUIPMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>
      <p className="field-help">Il primo gruppo incontrato nell'ordine degli esercizi e il focus. Riordina gli esercizi per cambiare priorita. Le esclusioni personali della scheda restano attive; le incompatibilita vengono segnalate senza sostituzioni automatiche.</p>
      <div className="modal-actions"><button className="button secondary" type="button" onClick={onClose}>Annulla</button><button className="button primary" type="submit">Applica parametri</button></div>
    </form>
  </Modal>
}

export function RoutineExercisePicker({ plan, onChoose, onClose }: {
  plan: WorkoutPlan; onChoose: (exercise: Exercise) => void; onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const existing = new Set(plan.exercises.map((item) => item.exerciseId))
  const query = normalizeRoutineName(search)
  const choices = getRoutineExercises(plan.settings).filter((exercise) => !existing.has(exercise.id) && normalizeRoutineName(exercise.name).includes(query))
  return <Modal title="Aggiungi un esercizio." subtitle="Varianti esatte, compatibili con attrezzatura ed esclusioni." onClose={onClose}>
    <label className="search-field"><Search size={17} /><input autoFocus aria-label="Cerca esercizio per la routine" placeholder="Nome dell'esercizio" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
    <div className="routine-picker substitution-list">{choices.map((exercise) => <button className="substitution-option" key={exercise.id} onClick={() => onChoose(exercise)}>
      <ExerciseArtwork small exercise={exercise} /><span><strong>{exercise.name}</strong><small>{exercise.muscles.map((muscle) => MUSCLE_LABELS[muscle]).join(' / ')}</small></span><Plus size={17} /></button>)}</div>
    {choices.length === 0 && <p className="empty-inline">Nessun esercizio disponibile. Controlla la ricerca, gli esercizi gia presenti o l'attrezzatura della scheda.</p>}
  </Modal>
}

export function RoutineEditor({ initial, blocked, onSave, onCancel, onInspect }: {
  initial: WorkoutRoutine; blocked: boolean; onSave: (routine: WorkoutRoutine) => string | null
  onCancel: () => void; onInspect: (exercise: Exercise) => void
}) {
  const [routine, setRoutine] = useState(() => structuredClone(initial))
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [error, setError] = useState('')
  function changePlan(plan: WorkoutPlan) {
    setRoutine((old) => ({ ...old, plan: setRoutineExercises({ ...plan, exercises: old.plan.exercises }, plan.exercises) }))
    setError('')
  }
  function save() {
    const name = routine.name.trim()
    if (!name) { setError('Dai un nome alla routine.'); return }
    setError(onSave({ ...routine, name, plan: { ...routine.plan, name } }) ?? '')
  }
  return <>
    <div className="page-heading"><div><span className="eyebrow">COSTRUISCI IL TUO ALLENAMENTO</span><h1>La tua routine.</h1><p>Le modifiche diventano una scheda riutilizzabile solo quando premi Salva routine.</p></div>
      <button className="button secondary compact" onClick={onCancel}><ArrowLeft size={17} /> Torna alle routine</button></div>
    <div className="panel routine-editor-name"><label className="field">Nome routine<input aria-label="Nome routine" value={routine.name} maxLength={200} onChange={(event) => { setRoutine({ ...routine, name: event.target.value, plan: { ...routine.plan, name: event.target.value } }); setError('') }} /></label>
      <label className="routine-load-option"><input type="checkbox" checked={routine.refreshLoads} onChange={(event) => setRoutine({ ...routine, refreshLoads: event.target.checked })} /><span><strong>Aggiorna i carichi dallo storico quando la uso</strong><small>Solo varianti esatte e progressione prudente sul focus. Disattiva per mantenere i carichi impostati nella scheda.</small></span></label>
      <p className="field-help">Puoi salvare anche una routine da completare: le indicazioni rosse vanno risolte prima di iniziare un allenamento, senza tagliare o sostituire esercizi di nascosto.</p>
      {error && <p className="alert" role="alert">{error}</p>}</div>
    <WorkoutEditor plan={routine.plan} editingRoutine blocked={blocked} onChange={changePlan} onConfigure={() => setSettingsOpen(true)} onStart={save} onInspect={onInspect}
      onAddExercise={() => setPickerOpen(true)} onMoveExercise={(id, direction) => {
        try { changePlan(moveRoutineExercise(routine.plan, id, direction)) }
        catch (cause) { if (cause instanceof Error) setError(cause.message); else throw cause }
      }} />
    {settingsOpen && <RoutineSettingsDialog plan={routine.plan} onClose={() => setSettingsOpen(false)} onApply={(settings) => { changePlan({ ...routine.plan, settings }); setSettingsOpen(false) }} />}
    {pickerOpen && <RoutineExercisePicker plan={routine.plan} onClose={() => setPickerOpen(false)} onChoose={(exercise) => {
      try { changePlan(addRoutineExercise(routine.plan, exercise.id)); setPickerOpen(false) }
      catch (cause) { if (cause instanceof Error) { setError(cause.message); setPickerOpen(false) } else throw cause }
    }} />}
  </>
}
