import { useState } from 'react'
import { ArrowDown, ArrowLeftRight, ArrowUp, BookmarkPlus, Check, ChevronDown, Clock3, Dumbbell, Info, Minus, Pencil, Play, Plus, Save, ShieldCheck, SlidersHorizontal, Timer, Trash2 } from 'lucide-react'
import { GOAL_LABELS, MAX_PLAN_EXERCISES, MAX_PRESCRIPTION_SETS, MAX_SETS, MUSCLE_LABELS, estimateExerciseSeconds, estimatePlanSeconds, getExercise, getSubstitutions, intensityOptions, isBodyweightExercise, isFocusExercise, minimumRestSeconds, planBudgetNote, routineVolumeWarnings, supersetCandidates, validatePlan, workoutSetSteps } from './domain'
import type { Exercise, PlanExercise, SetLog, SetStep, WorkoutPlan, WorkoutSession } from './domain'
import { ExerciseArtwork, Modal } from './components'
import { setLabel, timeLabel } from './format'
import { TechniqueNote } from './Intensity'
import { INTENSITY_LABELS, recoverySeconds } from './intensityPresentation'
import { canonicalJson } from './cloudModel'

function withoutPair(plan: WorkoutPlan, itemId: string): WorkoutPlan {
  const group = plan.exercises.find((item) => item.id === itemId)?.supersetGroup
  if (!group) return plan
  return { ...plan, exercises: plan.exercises.map((item) => item.supersetGroup === group ? { ...item, supersetGroup: undefined } : item) }
}

function clearIncompatibleTechniques(plan: WorkoutPlan): WorkoutPlan {
  return { ...plan, exercises: plan.exercises.map((item) => ({
    ...item,
    ...(item.technique && !intensityOptions(plan, item).includes(item.technique) ? { technique: undefined } : {}),
    ...(item.supersetGroup && supersetCandidates(plan, item).length !== 1 ? { supersetGroup: undefined } : {}),
  })) }
}

export function WorkoutEditor({ plan, onChange, onConfigure, onStart, onInspect, blocked, editingRoutine = false, onAddExercise, onMoveExercise, onSaveRoutine, saveRoutineLabel = 'Salva come routine' }: {
  plan: WorkoutPlan; onChange: (plan: WorkoutPlan) => void; onConfigure: () => void; onStart: () => void; blocked: boolean
  onInspect: (exercise: Exercise) => void
  editingRoutine?: boolean
  onAddExercise?: () => void
  onMoveExercise?: (id: string, direction: -1 | 1) => void
  onSaveRoutine?: () => void
  saveRoutineLabel?: string
}) {
  const [editing, setEditing] = useState<PlanExercise | null>(null)
  const [editBase, setEditBase] = useState<WorkoutPlan | null>(null)
  const [replacing, setReplacing] = useState<PlanExercise | null>(null)
  const [replaceBase, setReplaceBase] = useState<WorkoutPlan | null>(null)
  const [partnerId, setPartnerId] = useState('')
  const [editError, setEditError] = useState('')
  const [changeNote, setChangeNote] = useState('')
  const issues = validatePlan(plan)
  const duration = estimatePlanSeconds(plan)
  const isRoutine = plan.kind === 'routine'
  const setLimit = isRoutine ? MAX_PRESCRIPTION_SETS : MAX_SETS[plan.settings.level]
  const volumeWarnings = routineVolumeWarnings(plan)
  const budgetNote = planBudgetNote(plan)
  const displayedMuscles = [...new Set([...plan.settings.muscles, ...plan.exercises.flatMap((item) => getExercise(item.exerciseId).muscles)])]
  const unpairedPlan = editing ? withoutPair(plan, editing.id) : plan
  const editPlan = editing ? { ...unpairedPlan, exercises: unpairedPlan.exercises.map((item) => item.id === editing.id ? editing : item) } : plan
  const techniques = editing ? intensityOptions(editPlan, editing) : []
  const partners = editing && !editing.technique ? supersetCandidates(editPlan, { ...editing, supersetGroup: undefined }) : []
  function replace(item: PlanExercise) {
    const old = plan.exercises.find((entry) => entry.id === item.id)
    if (!old || (replacing && (!replaceBase || canonicalJson(plan) !== canonicalJson(replaceBase)))) {
      setChangeNote('Il piano e cambiato. Riapri la modifica prima di sostituire un esercizio.')
      setReplacing(null)
      return
    }
    const changedExercise = old.exerciseId !== item.exerciseId
    const detach = Boolean(old.supersetGroup && (changedExercise || old.sets !== item.sets || item.technique))
    const next = detach ? withoutPair(plan, item.id) : plan
    onChange({ ...next, exercises: next.exercises.map((entry) => entry.id === item.id
      ? { ...item, progressionNote: undefined, ...(detach ? { supersetGroup: undefined } : {}), ...(changedExercise ? { technique: undefined } : {}) } : entry) })
    setChangeNote(detach ? 'Superserie sciolta dopo la modifica: ricontrolla il tempo e gli abbinamenti.' : changedExercise && old.technique ? 'Tecnica rimossa sulla nuova variante: scegli un abbinamento compatibile e ricontrolla il tempo.' : '')
  }
  function edit(item: PlanExercise) {
    setEditBase(plan)
    setEditing({ ...item, supersetGroup: undefined })
    setPartnerId(item.supersetGroup ? plan.exercises.find((other) => other.id !== item.id && other.supersetGroup === item.supersetGroup)?.id ?? '' : '')
    setEditError('')
  }
  function saveEdit() {
    if (!editing) return
    if (!editBase || canonicalJson(plan) !== canonicalJson(editBase)) { setEditError('Il piano e cambiato mentre lo modificavi. Chiudi e riapri la modifica per non perdere gli aggiornamenti.'); return }
    if (editing.targetLoad !== null && (!Number.isFinite(editing.targetLoad) || editing.targetLoad <= 0)) { setEditError('Inserisci un carico positivo oppure lascia il campo vuoto.'); return }
    if (editing.technique && !techniques.includes(editing.technique)) { setEditError('Questa tecnica non e compatibile con la prescrizione. Scegli serie tradizionali o modifica i valori.'); return }
    if (partnerId && !partners.some((item) => item.id === partnerId)) { setEditError('Coppia non compatibile: scegli due esercizi vicini con lo stesso numero di serie, oppure nessuna superserie.'); return }
    let next: WorkoutPlan = { ...editPlan, exercises: editPlan.exercises.map((item) => item.id === editing.id ? { ...item, progressionNote: undefined } : item) }
    if (partnerId) {
      const group = crypto.randomUUID()
      next = { ...next, exercises: next.exercises.map((item) => item.id === editing.id || item.id === partnerId
        ? { ...item, supersetGroup: group, technique: undefined, progressionNote: undefined } : item) }
    }
    onChange(next)
    setEditing(null)
    setChangeNote('Piano aggiornato: durata e recuperi ricalcolati. Le mini-serie non sono equivalenti a serie complete.')
  }
  return <div className="workout-layout">
    <div>
      <div className="section-heading"><div><span className="eyebrow">{editingRoutine ? 'LA TUA ROUTINE' : 'IL TUO PIANO'}</span><h2>{editingRoutine ? 'Una scheda, il tuo ordine.' : 'Pronto quando lo sei tu.'}</h2></div>
        <button className="button secondary compact" onClick={onConfigure}><SlidersHorizontal size={16} /> {editingRoutine ? 'Parametri routine' : 'Configura'}</button></div>
      {issues.length > 0 && <div className="alert" role="alert">{issues.map((issue) => <p key={issue}>{issue}</p>)}</div>}
      {volumeWarnings.length > 0 && <div className="routine-volume-advice" role="note" aria-label="Avvisi sul volume della routine"><strong>Le tue prescrizioni restano intatte.</strong>{volumeWarnings.map((warning) => <p key={warning}>{warning}</p>)}</div>}
      {changeNote && <p className="field-help" role="status">{changeNote}</p>}
      <div className="warmup-card"><div className="warmup-icon"><ActivityIcon /></div><div><h3>Prima, preparati al movimento</h3><p>Riscaldamento iniziale + serie di avvicinamento indicate in ogni blocco.</p></div><span className="mono">{timeLabel(plan.warmupSeconds)}</span></div>
      <div className="workout-list">{plan.exercises.map((item, index) => {
        const exercise = getExercise(item.exerciseId)
        return <article className="exercise-card" key={item.id}>
          <div className="exercise-card-head"><button className="exercise-image-button" aria-label={`Mostra illustrazione di ${exercise.name}`} onClick={() => onInspect(exercise)}><ExerciseArtwork exercise={exercise} /></button><div className="exercise-card-title">
            <span className="eyebrow">{isFocusExercise(item, plan.settings) ? 'FOCUS' : exercise.muscles.some((muscle) => plan.settings.muscles.includes(muscle)) ? 'ESERCIZIO' : 'ACCESSORIO'} {String(index + 1).padStart(2, '0')}</span><h3>{exercise.name}</h3>
            <p>{exercise.muscles.map((muscle) => MUSCLE_LABELS[muscle]).join(' / ')}</p>
            {plan.kind === 'routine' && item.sourceExerciseName && <p>CSV: {item.sourceExerciseName}</p>}
          </div><div className="exercise-tools"><button className="icon-button" aria-label={`Sostituisci ${exercise.name}`} onClick={() => { setReplacing(item); setReplaceBase(plan) }}><ArrowLeftRight size={18} /></button>
            <button className="icon-button" aria-label={`Modifica ${exercise.name}`} onClick={() => edit(item)}><Pencil size={17} /></button></div></div>
          <div className="prescription"><div><span>Serie</span><strong>{item.sets}</strong></div><div><span>Ripetizioni</span><strong>{item.repMin} - {item.repMax}</strong></div>
            <div><span>{item.supersetGroup ? 'Recupero giro' : 'Recupero'}</span><strong>{timeLabel(recoverySeconds(item, plan))}</strong></div><div><span>RIR target</span><strong>{item.rir}</strong></div></div>
          {item.progressionNote && <p className="progression-note">{item.progressionNote}</p>}
          <TechniqueNote item={item} plan={plan} />
          {onMoveExercise && <div className="routine-reorder"><span>Posizione {index + 1}</span>
            <button className="icon-button" aria-label={`Sposta in alto ${exercise.name}`} disabled={index === 0} onClick={() => onMoveExercise(item.id, -1)}><ArrowUp size={16} /></button>
            <button className="icon-button" aria-label={`Sposta in basso ${exercise.name}`} disabled={index === plan.exercises.length - 1} onClick={() => onMoveExercise(item.id, 1)}><ArrowDown size={16} /></button></div>}
          <div className="exercise-card-foot"><span><Clock3 size={14} /> {timeLabel(estimateExerciseSeconds(item))} {item.supersetGroup ? 'stima singola; pause condivise nel totale' : 'incl. preparazione'}</span>
            <div className="set-stepper"><button aria-label={`Togli una serie a ${exercise.name}`} disabled={item.sets <= 1} onClick={() => replace({ ...item, sets: item.sets - 1 })}><Minus size={14} /></button><span>Serie</span><button aria-label={`Aggiungi una serie a ${exercise.name}`} disabled={item.sets >= setLimit} onClick={() => replace({ ...item, sets: item.sets + 1 })}><Plus size={14} /></button></div></div>
        </article>
      })}</div>
      {onAddExercise && <button className="button secondary full routine-add-exercise" disabled={blocked || plan.exercises.length >= MAX_PLAN_EXERCISES} onClick={onAddExercise}><Plus size={18} /> Aggiungi esercizio</button>}
    </div>
    <aside className="plan-aside">
      <div className="panel plan-summary"><span className="eyebrow">OGNI MINUTO CONTA</span><div className="duration-display">{Number.isFinite(duration) ? Math.ceil(duration / 60) : '--'}<span>/ {plan.settings.minutes} min</span></div>
        <div className="budget-bar"><span style={{ width: `${Number.isFinite(duration) ? Math.min(100, duration / (plan.settings.minutes * 60) * 100) : 0}%` }} /></div>
        <p className="field-help">Stima prudente, non un conto alla rovescia da battere.</p>
        <dl className="summary-list"><div><dt>Focus</dt><dd>{MUSCLE_LABELS[plan.settings.muscles[0]!]}</dd></div><div><dt>Obiettivo</dt><dd>{GOAL_LABELS[plan.settings.goal]}</dd></div><div><dt>Esercizi</dt><dd>{plan.exercises.length}</dd></div>
          <div><dt>Serie allenanti</dt><dd>{plan.exercises.reduce((sum, item) => sum + item.sets, 0)}</dd></div>
          {plan.exercises.some((item) => item.technique) && <div><dt>Mini-serie aggiuntive</dt><dd>{plan.exercises.filter((item) => item.technique).length}</dd></div>}
          <div><dt>Margine incluso</dt><dd>{timeLabel(plan.reserveSeconds)}</dd></div>
          {Boolean(plan.settings.minRestSeconds) && <div><dt>Recupero minimo</dt><dd>{timeLabel(plan.settings.minRestSeconds!)}</dd></div>}</dl>
        <div className="tag-list">{displayedMuscles.map((muscle) => {
          const exercises = plan.exercises.filter((item) => getExercise(item.exerciseId).muscles.includes(muscle))
          return <span className="tag" key={muscle}>{MUSCLE_LABELS[muscle]}{plan.settings.muscles.includes(muscle) ? '' : ' (accessorio)'} / {exercises.length} {exercises.length === 1 ? 'esercizio' : 'esercizi'} / {exercises.reduce((sum, item) => sum + item.sets, 0)} serie</span>
        })}</div>
        <p className="field-help">Progressione prioritaria sul focus, a tecnica e RIR costanti. Sugli altri gruppi riproponiamo il carico registrato, senza aumenti automatici. Le varianti nuove vanno calibrate.</p>
        {budgetNote && <p className="field-help" style={{ marginBottom: 18 }} role="note">{budgetNote}</p>}
        {onSaveRoutine && <button className="button secondary full routine-save-copy" disabled={blocked} onClick={onSaveRoutine}><BookmarkPlus size={17} /> {saveRoutineLabel}</button>}
        <button className="button primary full" disabled={(!editingRoutine && issues.length > 0) || blocked} onClick={onStart}>
          {editingRoutine ? <Save size={18} /> : <Play size={18} fill="currentColor" />} {editingRoutine ? 'Salva routine' : 'Inizia allenamento'}</button>
        <span className="micro-copy"><ShieldCheck size={14} /> {editingRoutine ? 'Salva la scheda, non una seduta nello storico.' : 'Controlla i carichi prima di iniziare.'}</span>
      </div>
      <div className="coach-note"><Info size={19} /><div><h4>Lascia spazio alla qualita.</h4><p>RIR 2 significa fermarti quando ritieni di poter fare ancora 2 ripetizioni pulite. Non serve arrivare al cedimento.</p></div></div>
    </aside>
    {editing && <Modal title={`Modifica ${getExercise(editing.exerciseId).name}`} subtitle="Il tempo totale viene ricalcolato al salvataggio." onClose={() => setEditing(null)}>
      <form onSubmit={(event) => { event.preventDefault(); saveEdit() }}>
        <div className="form-grid edit-grid">
          <label className="field">Serie<input required type="number" min="1" max={setLimit} step="1" value={editing.sets} onChange={(event) => { setEditing({ ...editing, sets: event.target.valueAsNumber }); setPartnerId(''); setEditError('') }} /></label>
          <label className="field">Recupero (secondi)<input required type="number" min={Math.max(minimumRestSeconds(editing), plan.settings.minRestSeconds ?? 0)} max="300" step={isRoutine ? 1 : 15} value={editing.restSeconds} onChange={(event) => setEditing({ ...editing, restSeconds: event.target.valueAsNumber })} /></label>
          <label className="field">Ripetizioni minime<input required type="number" min="1" max={editing.repMax} step="1" value={editing.repMin} onChange={(event) => setEditing({ ...editing, repMin: event.target.valueAsNumber })} /></label>
          <label className="field">Ripetizioni massime<input required type="number" min={editing.repMin} max={isRoutine ? 50 : 30} step="1" value={editing.repMax} onChange={(event) => setEditing({ ...editing, repMax: event.target.valueAsNumber })} /></label>
          <label className="field">RIR target<input required type="number" min={plan.settings.level === 'beginner' ? 3 : isRoutine ? 0 : 1} max="5" step={isRoutine ? 'any' : 1} value={editing.rir} onChange={(event) => setEditing({ ...editing, rir: event.target.valueAsNumber })} /></label>
          <label className="field">Carico proposto (kg)<input type="number" min={isRoutine ? 0 : 0.25} max={isRoutine ? undefined : 1000} step={isRoutine ? 'any' : 0.25} placeholder={isBodyweightExercise(getExercise(editing.exerciseId)) ? 'Corpo libero' : 'Da scegliere'} disabled={isBodyweightExercise(getExercise(editing.exerciseId))} value={editing.targetLoad ?? ''} onChange={(event) => setEditing({ ...editing, targetLoad: event.target.value === '' ? null : event.target.valueAsNumber })} /></label>
        </div>
        <div className="intensity-editor">
          <label className="field">Tecnica ultima serie<select value={editing.technique ?? ''} onChange={(event) => {
            const technique = event.target.value
            if (technique === '' || technique === 'drop-set' || technique === 'rest-pause') {
              setEditing({ ...editing, technique: technique || undefined })
              if (technique) setPartnerId('')
              setEditError('')
            }
          }}><option value="">Serie tradizionali</option>
            {techniques.map((technique) => <option key={technique} value={technique}>{INTENSITY_LABELS[technique]}</option>)}
            {editing.technique && !techniques.includes(editing.technique) && <option value={editing.technique} disabled>{INTENSITY_LABELS[editing.technique]} (non compatibile)</option>}
          </select></label>
          <label className="field">Superserie con<select value={partnerId} disabled={Boolean(editing.technique)} onChange={(event) => { setPartnerId(event.target.value); setEditError('') }}>
            <option value="">Nessuna superserie</option>
            {partners.map((item) => <option key={item.id} value={item.id}>{getExercise(item.exerciseId).name}</option>)}
            {partnerId && !partners.some((item) => item.id === partnerId) && <option value={partnerId} disabled>Coppia attuale non compatibile</option>}
          </select></label>
          <p className="field-help">Solo tecniche compatibili con livello, obiettivo e movimento. Nessuna sovrapposizione di tecniche. Le superserie uniscono esercizi adiacenti con uguali serie: sostituire, rimuovere o cambiare le serie di un componente scioglie la coppia.</p>
          <TechniqueNote item={editing} plan={editPlan} />
          {editError && <p className="alert" role="alert">{editError}</p>}
        </div>
        <p className="field-help">Bilanciere: carico totale. Manubri: carico di un manubrio. Corpo libero: il piano non prescrive zavorra; puoi annotare quella effettiva nella sessione. I carichi non sono equivalenti tra varianti.</p>
        <div className="modal-actions"><button type="button" className="button danger ghost" onClick={() => {
          if (!editBase || canonicalJson(plan) !== canonicalJson(editBase)) { setEditError('Il piano e cambiato mentre lo modificavi. Chiudi e riapri la modifica per non perdere gli aggiornamenti.'); return }
          const next = withoutPair(plan, editing.id)
          onChange(clearIncompatibleTechniques({ ...next, exercises: next.exercises.filter((item) => item.id !== editing.id) }))
          setChangeNote('Esercizio rimosso; superserie e tecniche non piu compatibili sono state sciolte. Il primo esercizio del focus resta tradizionale. Ricontrolla muscoli e tempo.')
          setEditing(null)
        }}><Trash2 size={16} /> Rimuovi</button><button className="button primary" type="submit">Salva modifiche</button></div>
      </form>
    </Modal>}
    {replacing && <Modal title="Un'alternativa, stesso intento." subtitle="Attrezzatura ed esclusioni sono gia considerate." onClose={() => setReplacing(null)}>
      <div className="substitution-list">{getSubstitutions(replacing, plan.settings, plan.exercises.map((item) => item.exerciseId), plan.kind === 'routine').map((exercise) =>
        <button className="substitution-option" key={exercise.id} onClick={() => { replace({ ...replacing, exerciseId: exercise.id, targetLoad: null }); setReplacing(null) }}>
          <ExerciseArtwork small exercise={exercise} /><span><strong>{exercise.name}</strong><small>{exercise.muscles.map((muscle) => MUSCLE_LABELS[muscle]).join(' / ')}</small></span><ArrowLeftRight size={17} />
        </button>)}
        {getSubstitutions(replacing, plan.settings, plan.exercises.map((item) => item.exerciseId), plan.kind === 'routine').length === 0 && <div className="empty-inline">Nessuna alternativa compatibile con questi vincoli. Puoi modificare la configurazione.</div>}
      </div>
      <p className="field-help">Una variante nuova richiede un carico da calibrare. Controlla il nuovo tempo prima di iniziare.</p>
    </Modal>}
  </div>
}

function ActivityIcon() { return <Dumbbell size={22} /> }

function SetRow({ step, parent, log, onLog, onUndo, blocked, locked, isRoutine }: {
  step: SetStep; parent?: SetLog; log?: SetLog; onLog: (log: SetLog) => void; onUndo: (id: string) => void; blocked: boolean; locked: boolean; isRoutine: boolean
}) {
  const { item, setIndex: index, part } = step
  const [weight, setWeight] = useState<string | null>(null)
  const suggested = part ? parent?.weight == null ? null : part === 'drop' ? Math.floor(parent.weight * 0.75 * 4) / 4 : parent.weight : item.targetLoad
  const currentWeight = weight ?? (suggested === null ? '' : String(suggested))
  const [reps, setReps] = useState(String(step.repMin))
  const [rir, setRir] = useState('')
  const name = getExercise(item.exerciseId).name
  const label = `${name} ${setLabel({ setIndex: index, part }).toLocaleLowerCase('it')}`
  return <form className={`set-row ${log ? 'set-complete' : ''} ${part ? 'mini-set' : ''}`} data-part={part ?? 'regular'} aria-label={label} onSubmit={(event) => {
    event.preventDefault()
    if (log) return
    onLog({ id: crypto.randomUUID(), planExerciseId: item.id, setIndex: index, ...(part ? { part } : {}), weight: currentWeight === '' ? null : Number(currentWeight), reps: Number(reps), rir: rir === '' ? null : Number(rir), completedAt: new Date().toISOString() })
  }}>
    <span className="set-index" title={setLabel({ setIndex: index, part })}>{index + 1}{part === 'drop' ? 'D' : part === 'rest-pause' ? 'RP' : ''}</span>
    <input aria-label={`${label} carico kg`} inputMode="decimal" type="number" min="0" max={isRoutine ? undefined : 1000} step={isRoutine ? 'any' : 0.25} placeholder="--" value={log ? log.weight ?? '' : currentWeight} disabled={Boolean(log) || blocked || locked} onChange={(event) => setWeight(event.target.value)} />
    <input aria-label={`${label} ripetizioni`} inputMode="numeric" type="number" min="1" max={part ? 50 : 100} step="1" required value={log ? log.reps : reps} disabled={Boolean(log) || blocked || locked} onChange={(event) => setReps(event.target.value)} />
    <input aria-label={`${label} RIR`} inputMode={isRoutine ? 'decimal' : 'numeric'} type="number" min="0" max="10" step={isRoutine ? 'any' : 1} placeholder="--" value={log ? log.rir ?? '' : rir} disabled={Boolean(log) || blocked || locked} onChange={(event) => setRir(event.target.value)} />
    {log ? <button type="button" className="complete-set checked" aria-label={`Annulla ${label}`} disabled={blocked} onClick={(event) => {
      event.preventDefault()
      setWeight(log.weight === null ? '' : String(log.weight))
      setReps(String(log.reps))
      setRir(log.rir === null ? '' : String(log.rir))
      onUndo(log.id)
    }}><Check size={20} /></button>
      : <button type="submit" className="complete-set" aria-label={`Completa ${label}`} disabled={blocked || locked}><Check size={20} /></button>}
  </form>
}

export function ActiveWorkout({ session, now, restEndsAt, onLog, onUndo, onRest, onFinish, onDiscard, onInspect, blocked }: {
  session: WorkoutSession; now: number; restEndsAt: number | null; onLog: (log: SetLog) => void; onUndo: (id: string) => void
  onRest: (end: number | null) => void; onFinish: () => void; onDiscard: () => void; blocked: boolean
  onInspect: (exercise: Exercise) => void
}) {
  const steps = workoutSetSteps(session.plan)
  const total = steps.length
  const advanced = session.plan.exercises.some((item) => item.technique || item.supersetGroup)
  const logFor = (step: SetStep) => session.logs.find((log) => log.planExerciseId === step.item.id && log.setIndex === step.setIndex && log.part === step.part)
  const nextStep = steps.find((step) => !logFor(step))
  const blocks: PlanExercise[][] = []
  for (let index = 0; index < session.plan.exercises.length; index++) {
    const item = session.plan.exercises[index]
    const partner = session.plan.exercises[index + 1]
    if (item.supersetGroup && partner?.supersetGroup === item.supersetGroup) {
      blocks.push([item, partner])
      index++
    } else blocks.push([item])
  }
  const remaining = restEndsAt === null ? 0 : Math.max(0, Math.ceil((restEndsAt - now) / 1000))
  return <div className="active-layout">
    <div className="session-toolbar"><div><span className="live-label"><span /> SESSIONE IN CORSO</span><h2>{session.plan.name}</h2></div>
      <div className="elapsed"><Clock3 size={20} /><span className="mono">{timeLabel((now - Date.parse(session.startedAt)) / 1000)}</span></div></div>
    <div className="session-progress"><div><span>{session.logs.length} di {total} {advanced ? 'passaggi completati' : 'serie completate'}</span><span>{Math.round(session.logs.length / total * 100)}%</span></div><div className="budget-bar"><span style={{ width: `${session.logs.length / total * 100}%` }} /></div></div>
    <div className="focus-selection"><strong>Focus: {MUSCLE_LABELS[session.plan.settings.muscles[0]!]}</strong><span>Priorita: {session.plan.settings.muscles.map((muscle) => MUSCLE_LABELS[muscle]).join(' / ')}</span></div>
    <div className="quiet-note"><Info size={17} /><span>Prima le serie di avvicinamento. Registra qui solo le serie allenanti. Carico totale per bilanciere, per singolo manubrio, sola zavorra per corpo libero. RIR facoltativo.</span></div>
    {advanced && nextStep && <p className="next-set"><strong>Prossimo passaggio:</strong> {getExercise(nextStep.item.exerciseId).name} / {setLabel({ setIndex: nextStep.setIndex, part: nextStep.part })}. {nextStep.repMin}-{nextStep.repMax} rip., RIR {nextStep.rir}.</p>}
    <div className="session-columns"><div className="workout-list">{blocks.map((items) => {
      const paired = items.length === 2
      const blockSteps = steps.filter((step) => items.some((item) => item.id === step.item.id))
      const pending = blockSteps.find((step) => !logFor(step))
      return <article className={`exercise-card session-card ${paired ? 'superset-card' : ''}`} key={items[0].id}>
        {paired && <h3 className="superset-heading">Superserie / alterna A e B</h3>}
        {items.map((item, index) => {
          const exercise = getExercise(item.exerciseId)
          return <div key={item.id}><div className="exercise-card-head"><button className="exercise-image-button" aria-label={`Mostra illustrazione di ${exercise.name}`} onClick={() => onInspect(exercise)}><ExerciseArtwork small exercise={exercise} /></button><div className="exercise-card-title">{isFocusExercise(item, session.plan.settings) && <span className="eyebrow">FOCUS</span>}<h3>{paired ? `${index === 0 ? 'A' : 'B'} / ` : ''}{exercise.name}</h3>
            <p>{item.repMin}-{item.repMax} rip. <span className="text-dot">/</span> RIR {item.rir} <span className="text-dot">/</span> {paired ? 'Recupero dopo il giro' : 'Recupero'} {timeLabel(recoverySeconds(item, session.plan))}</p></div></div>
            {item.progressionNote && <p className="progression-note">{item.progressionNote}</p>}
            <details className="exercise-instructions"><summary>Istruzioni e preparazione {paired ? (index === 0 ? 'A' : 'B') : ''} <ChevronDown size={14} /></summary><p>{exercise.instructions}</p><p>Prepara l'attrezzo e completa un avvicinamento progressivo: circa {timeLabel(exercise.rampSeconds)}, recuperi inclusi. Se serve piu tempo, prendilo.</p></details></div>
        })}
        <TechniqueNote item={items[0]} plan={session.plan} />
        <div className="set-table"><div className="set-table-head"><span>Serie</span><span>Kg</span><span>Rip.</span><span>RIR</span><span className="sr-only">Completa</span></div>
          {blockSteps.map((step) => {
            const parent = session.logs.find((log) => log.planExerciseId === step.item.id && log.setIndex === step.setIndex && !log.part)
            const log = logFor(step)
            return <div key={`${step.item.id}-${step.setIndex}-${step.part ?? 'regular'}`}>
              {paired && <p className="paired-set-label">{items[0].id === step.item.id ? 'A' : 'B'}{step.setIndex + 1} / {getExercise(step.item.exerciseId).name}</p>}
              {step.part && <p className="mini-set-label">{step.part === 'drop' ? 'Drop set / carico ridotto' : 'Rest-pause / stesso carico'} / {step.repMin}-{step.repMax} rip., RIR {step.rir}. {parent ? 'Conferma il carico disponibile.' : 'Prima registra la serie principale.'}</p>}
              <SetRow step={step} parent={parent} log={log} onLog={onLog} onUndo={onUndo} blocked={blocked} isRoutine={session.plan.kind === 'routine'}
                locked={!log && (Boolean(step.part && !parent) || Boolean(paired && pending !== step))} />
              {advanced && log && log.id === session.logs.at(-1)?.id && restEndsAt !== null && <div className="inline-recovery" aria-live="off">
                <span>{remaining ? `Pausa / cambio: ${timeLabel(remaining)}` : 'Pausa terminata. Riparti quando sei pronto.'}</span>
                <button className="button secondary compact" onClick={() => onRest(Math.max(now, restEndsAt) + 30000)}>+30 sec</button>
              </div>}
            </div>
          })}</div>
      </article>
    })}</div>
    <aside className="session-aside"><div className={`panel rest-panel ${restEndsAt !== null ? 'rest-running' : ''}`} role="timer" aria-label="Timer recupero">
      <span className="eyebrow"><Timer size={16} /> IL RECUPERO FA PARTE DEL LAVORO</span>
      <div className="rest-clock mono">{timeLabel(remaining)}</div><p>{restEndsAt === null ? 'Parte quando completi una serie.' : remaining === 0 ? 'Recupero terminato. Riparti quando sei pronto.' : 'Respira. La prossima serie puo aspettare.'}</p>
      <div className="timer-actions"><button className="button secondary compact" onClick={() => onRest(Math.max(now, restEndsAt ?? now) + 30000)}>+30 sec</button><button className="button secondary compact" onClick={() => onRest(null)} disabled={restEndsAt === null}>Termina</button></div>
    </div>
      <button className="button primary full" onClick={onFinish} disabled={session.logs.length === 0 || blocked}><Check size={19} /> Salva allenamento</button>
      <p className="field-help centered">Puoi salvare anche una sessione parziale.</p>
      <button className="button ghost full muted" onClick={onDiscard}><Trash2 size={15} /> Scarta sessione</button>
      <div className="coach-note"><ShieldCheck size={18} /><p>Dolore durante un movimento? Interrompilo. L'app non sostituisce una valutazione professionale.</p></div>
    </aside></div>
  </div>
}
