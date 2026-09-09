import { useState } from 'react'
import { ArrowLeftRight, Check, ChevronDown, Clock3, Dumbbell, Info, Minus, Pencil, Play, Plus, ShieldCheck, SlidersHorizontal, Timer, Trash2 } from 'lucide-react'
import { GOAL_LABELS, MAX_SETS, MUSCLE_LABELS, estimateExerciseSeconds, estimatePlanSeconds, getExercise, getSubstitutions, isBodyweightExercise, isFocusExercise, minimumRestSeconds, planBudgetNote, validatePlan } from './domain'
import type { Exercise, PlanExercise, SetLog, WorkoutPlan, WorkoutSession } from './domain'
import { ExerciseArtwork, Modal } from './components'
import { timeLabel } from './format'

export function WorkoutEditor({ plan, onChange, onConfigure, onStart, onInspect, blocked }: {
  plan: WorkoutPlan; onChange: (plan: WorkoutPlan) => void; onConfigure: () => void; onStart: () => void; blocked: boolean
  onInspect: (exercise: Exercise) => void
}) {
  const [editing, setEditing] = useState<PlanExercise | null>(null)
  const [replacing, setReplacing] = useState<PlanExercise | null>(null)
  const issues = validatePlan(plan)
  const duration = estimatePlanSeconds(plan)
  const setLimit = MAX_SETS[plan.settings.level]
  const budgetNote = planBudgetNote(plan)
  const displayedMuscles = [...new Set([...plan.settings.muscles, ...plan.exercises.flatMap((item) => getExercise(item.exerciseId).muscles)])]
  function replace(item: PlanExercise) {
    onChange({ ...plan, exercises: plan.exercises.map((old) => old.id === item.id ? { ...item, progressionNote: undefined } : old) })
  }
  return <div className="workout-layout">
    <div>
      <div className="section-heading"><div><span className="eyebrow">IL TUO PIANO</span><h2>Pronto quando lo sei tu.</h2></div>
        <button className="button secondary compact" onClick={onConfigure}><SlidersHorizontal size={16} /> Configura</button></div>
      {issues.length > 0 && <div className="alert" role="alert">{issues.map((issue) => <p key={issue}>{issue}</p>)}</div>}
      <div className="warmup-card"><div className="warmup-icon"><ActivityIcon /></div><div><h3>Prima, preparati al movimento</h3><p>Riscaldamento iniziale + serie di avvicinamento indicate in ogni blocco.</p></div><span className="mono">{timeLabel(plan.warmupSeconds)}</span></div>
      <div className="workout-list">{plan.exercises.map((item, index) => {
        const exercise = getExercise(item.exerciseId)
        return <article className="exercise-card" key={item.id}>
          <div className="exercise-card-head"><button className="exercise-image-button" aria-label={`Mostra illustrazione di ${exercise.name}`} onClick={() => onInspect(exercise)}><ExerciseArtwork exercise={exercise} /></button><div className="exercise-card-title">
            <span className="eyebrow">{isFocusExercise(item, plan.settings) ? 'FOCUS' : exercise.muscles.some((muscle) => plan.settings.muscles.includes(muscle)) ? 'ESERCIZIO' : 'ACCESSORIO'} {String(index + 1).padStart(2, '0')}</span><h3>{exercise.name}</h3>
            <p>{exercise.muscles.map((muscle) => MUSCLE_LABELS[muscle]).join(' / ')}</p>
          </div><div className="exercise-tools"><button className="icon-button" aria-label={`Sostituisci ${exercise.name}`} onClick={() => setReplacing(item)}><ArrowLeftRight size={18} /></button>
            <button className="icon-button" aria-label={`Modifica ${exercise.name}`} onClick={() => setEditing({ ...item })}><Pencil size={17} /></button></div></div>
          <div className="prescription"><div><span>Serie</span><strong>{item.sets}</strong></div><div><span>Ripetizioni</span><strong>{item.repMin} - {item.repMax}</strong></div>
            <div><span>Recupero</span><strong>{timeLabel(item.restSeconds)}</strong></div><div><span>RIR target</span><strong>{item.rir}</strong></div></div>
          {item.progressionNote && <p className="progression-note">{item.progressionNote}</p>}
          <div className="exercise-card-foot"><span><Clock3 size={14} /> {timeLabel(estimateExerciseSeconds(item))} incl. preparazione</span>
            <div className="set-stepper"><button aria-label={`Togli una serie a ${exercise.name}`} disabled={item.sets <= 1} onClick={() => replace({ ...item, sets: item.sets - 1 })}><Minus size={14} /></button><span>Serie</span><button aria-label={`Aggiungi una serie a ${exercise.name}`} disabled={item.sets >= setLimit} onClick={() => replace({ ...item, sets: item.sets + 1 })}><Plus size={14} /></button></div></div>
        </article>
      })}</div>
    </div>
    <aside className="plan-aside">
      <div className="panel plan-summary"><span className="eyebrow">OGNI MINUTO CONTA</span><div className="duration-display">{Number.isFinite(duration) ? Math.ceil(duration / 60) : '--'}<span>/ {plan.settings.minutes} min</span></div>
        <div className="budget-bar"><span style={{ width: `${Number.isFinite(duration) ? Math.min(100, duration / (plan.settings.minutes * 60) * 100) : 0}%` }} /></div>
        <p className="field-help">Stima prudente, non un conto alla rovescia da battere.</p>
        <dl className="summary-list"><div><dt>Focus</dt><dd>{MUSCLE_LABELS[plan.settings.muscles[0]!]}</dd></div><div><dt>Obiettivo</dt><dd>{GOAL_LABELS[plan.settings.goal]}</dd></div><div><dt>Esercizi</dt><dd>{plan.exercises.length}</dd></div>
          <div><dt>Serie allenanti</dt><dd>{plan.exercises.reduce((sum, item) => sum + item.sets, 0)}</dd></div><div><dt>Margine incluso</dt><dd>{timeLabel(plan.reserveSeconds)}</dd></div>
          {Boolean(plan.settings.minRestSeconds) && <div><dt>Recupero minimo</dt><dd>{timeLabel(plan.settings.minRestSeconds!)}</dd></div>}</dl>
        <div className="tag-list">{displayedMuscles.map((muscle) => {
          const exercises = plan.exercises.filter((item) => getExercise(item.exerciseId).muscles.includes(muscle))
          return <span className="tag" key={muscle}>{MUSCLE_LABELS[muscle]}{plan.settings.muscles.includes(muscle) ? '' : ' (accessorio)'} / {exercises.length} {exercises.length === 1 ? 'esercizio' : 'esercizi'} / {exercises.reduce((sum, item) => sum + item.sets, 0)} serie</span>
        })}</div>
        <p className="field-help">Progressione prioritaria sul focus, a tecnica e RIR costanti. Sugli altri gruppi riproponiamo il carico registrato, senza aumenti automatici. Le varianti nuove vanno calibrate.</p>
        {budgetNote && <p className="field-help" style={{ marginBottom: 18 }} role="note">{budgetNote}</p>}
        <button className="button primary full" disabled={issues.length > 0 || blocked} onClick={onStart}><Play size={18} fill="currentColor" /> Inizia allenamento</button>
        <span className="micro-copy"><ShieldCheck size={14} /> Salvato solo su questo browser</span>
      </div>
      <div className="coach-note"><Info size={19} /><div><h4>Lascia spazio alla qualita.</h4><p>RIR 2 significa fermarti quando ritieni di poter fare ancora 2 ripetizioni pulite. Non serve arrivare al cedimento.</p></div></div>
    </aside>
    {editing && <Modal title={`Modifica ${getExercise(editing.exerciseId).name}`} subtitle="Il tempo totale viene ricalcolato al salvataggio." onClose={() => setEditing(null)}>
      <form onSubmit={(event) => { event.preventDefault(); replace(editing); setEditing(null) }}>
        <div className="form-grid edit-grid">
          <label className="field">Serie<input required type="number" min="1" max={setLimit} step="1" value={editing.sets} onChange={(event) => setEditing({ ...editing, sets: event.target.valueAsNumber })} /></label>
          <label className="field">Recupero (secondi)<input required type="number" min={Math.max(minimumRestSeconds(editing), plan.settings.minRestSeconds ?? 0)} max="300" step="15" value={editing.restSeconds} onChange={(event) => setEditing({ ...editing, restSeconds: event.target.valueAsNumber })} /></label>
          <label className="field">Ripetizioni minime<input required type="number" min="1" max={editing.repMax} step="1" value={editing.repMin} onChange={(event) => setEditing({ ...editing, repMin: event.target.valueAsNumber })} /></label>
          <label className="field">Ripetizioni massime<input required type="number" min={editing.repMin} max="30" step="1" value={editing.repMax} onChange={(event) => setEditing({ ...editing, repMax: event.target.valueAsNumber })} /></label>
          <label className="field">RIR target<input required type="number" min={plan.settings.level === 'beginner' ? 3 : 1} max="5" step="1" value={editing.rir} onChange={(event) => setEditing({ ...editing, rir: event.target.valueAsNumber })} /></label>
          <label className="field">Carico proposto (kg)<input type="number" min="0.25" max="1000" step="0.25" placeholder={isBodyweightExercise(getExercise(editing.exerciseId)) ? 'Corpo libero' : 'Da scegliere'} disabled={isBodyweightExercise(getExercise(editing.exerciseId))} value={editing.targetLoad ?? ''} onChange={(event) => setEditing({ ...editing, targetLoad: event.target.value === '' ? null : event.target.valueAsNumber })} /></label>
        </div>
        <p className="field-help">Bilanciere: carico totale. Manubri: carico di un manubrio. Corpo libero: il piano non prescrive zavorra; puoi annotare quella effettiva nella sessione. I carichi non sono equivalenti tra varianti.</p>
        <div className="modal-actions"><button type="button" className="button danger ghost" onClick={() => { onChange({ ...plan, exercises: plan.exercises.filter((item) => item.id !== editing.id) }); setEditing(null) }}><Trash2 size={16} /> Rimuovi</button><button className="button primary" type="submit">Salva modifiche</button></div>
      </form>
    </Modal>}
    {replacing && <Modal title="Un'alternativa, stesso intento." subtitle="Attrezzatura ed esclusioni sono gia considerate." onClose={() => setReplacing(null)}>
      <div className="substitution-list">{getSubstitutions(replacing, plan.settings, plan.exercises.map((item) => item.exerciseId)).map((exercise) =>
        <button className="substitution-option" key={exercise.id} onClick={() => { replace({ ...replacing, exerciseId: exercise.id, targetLoad: null }); setReplacing(null) }}>
          <ExerciseArtwork small exercise={exercise} /><span><strong>{exercise.name}</strong><small>{exercise.muscles.map((muscle) => MUSCLE_LABELS[muscle]).join(' / ')}</small></span><ArrowLeftRight size={17} />
        </button>)}
        {getSubstitutions(replacing, plan.settings, plan.exercises.map((item) => item.exerciseId)).length === 0 && <div className="empty-inline">Nessuna alternativa compatibile con questi vincoli. Puoi modificare la configurazione.</div>}
      </div>
      <p className="field-help">Una variante nuova richiede un carico da calibrare. Controlla il nuovo tempo prima di iniziare.</p>
    </Modal>}
  </div>
}

function ActivityIcon() { return <Dumbbell size={22} /> }

function SetRow({ item, index, log, onLog, onUndo, blocked }: {
  item: PlanExercise; index: number; log?: SetLog; onLog: (log: SetLog) => void; onUndo: (id: string) => void; blocked: boolean
}) {
  const [weight, setWeight] = useState(item.targetLoad === null ? '' : String(item.targetLoad))
  const [reps, setReps] = useState(String(item.repMin))
  const [rir, setRir] = useState('')
  const name = getExercise(item.exerciseId).name
  return <form className={`set-row ${log ? 'set-complete' : ''}`} onSubmit={(event) => {
    event.preventDefault()
    if (log) return
    onLog({ id: crypto.randomUUID(), planExerciseId: item.id, setIndex: index, weight: weight === '' ? null : Number(weight), reps: Number(reps), rir: rir === '' ? null : Number(rir), completedAt: new Date().toISOString() })
  }}>
    <span className="set-index">{index + 1}</span>
    <input aria-label={`${name} serie ${index + 1} carico kg`} inputMode="decimal" type="number" min="0" max="1000" step="0.25" placeholder="--" value={log ? log.weight ?? '' : weight} disabled={Boolean(log) || blocked} onChange={(event) => setWeight(event.target.value)} />
    <input aria-label={`${name} serie ${index + 1} ripetizioni`} inputMode="numeric" type="number" min="1" max="100" step="1" required value={log ? log.reps : reps} disabled={Boolean(log) || blocked} onChange={(event) => setReps(event.target.value)} />
    <input aria-label={`${name} serie ${index + 1} RIR`} inputMode="numeric" type="number" min="0" max="10" step="1" placeholder="--" value={log ? log.rir ?? '' : rir} disabled={Boolean(log) || blocked} onChange={(event) => setRir(event.target.value)} />
    {log ? <button type="button" className="complete-set checked" aria-label={`Annulla ${name} serie ${index + 1}`} disabled={blocked} onClick={(event) => {
      event.preventDefault()
      setWeight(log.weight === null ? '' : String(log.weight))
      setReps(String(log.reps))
      setRir(log.rir === null ? '' : String(log.rir))
      onUndo(log.id)
    }}><Check size={20} /></button>
      : <button type="submit" className="complete-set" aria-label={`Completa ${name} serie ${index + 1}`} disabled={blocked}><Check size={20} /></button>}
  </form>
}

export function ActiveWorkout({ session, now, restEndsAt, onLog, onUndo, onRest, onFinish, onDiscard, onInspect, blocked }: {
  session: WorkoutSession; now: number; restEndsAt: number | null; onLog: (log: SetLog) => void; onUndo: (id: string) => void
  onRest: (end: number | null) => void; onFinish: () => void; onDiscard: () => void; blocked: boolean
  onInspect: (exercise: Exercise) => void
}) {
  const total = session.plan.exercises.reduce((sum, item) => sum + item.sets, 0)
  const remaining = restEndsAt === null ? 0 : Math.max(0, Math.ceil((restEndsAt - now) / 1000))
  return <div className="active-layout">
    <div className="session-toolbar"><div><span className="live-label"><span /> SESSIONE IN CORSO</span><h2>{session.plan.name}</h2></div>
      <div className="elapsed"><Clock3 size={20} /><span className="mono">{timeLabel((now - Date.parse(session.startedAt)) / 1000)}</span></div></div>
    <div className="session-progress"><div><span>{session.logs.length} di {total} serie completate</span><span>{Math.round(session.logs.length / total * 100)}%</span></div><div className="budget-bar"><span style={{ width: `${session.logs.length / total * 100}%` }} /></div></div>
    <div className="focus-selection"><strong>Focus: {MUSCLE_LABELS[session.plan.settings.muscles[0]!]}</strong><span>Priorita: {session.plan.settings.muscles.map((muscle) => MUSCLE_LABELS[muscle]).join(' / ')}</span></div>
    <div className="quiet-note"><Info size={17} /><span>Prima le serie di avvicinamento. Registra qui solo le serie allenanti. Carico totale per bilanciere, per singolo manubrio, sola zavorra per corpo libero. RIR facoltativo.</span></div>
    <div className="session-columns"><div className="workout-list">{session.plan.exercises.map((item) => {
      const exercise = getExercise(item.exerciseId)
      return <article className="exercise-card session-card" key={item.id}>
        <div className="exercise-card-head"><button className="exercise-image-button" aria-label={`Mostra illustrazione di ${exercise.name}`} onClick={() => onInspect(exercise)}><ExerciseArtwork small exercise={exercise} /></button><div className="exercise-card-title">{isFocusExercise(item, session.plan.settings) && <span className="eyebrow">FOCUS</span>}<h3>{exercise.name}</h3>
          <p>{item.repMin}-{item.repMax} rip. <span className="text-dot">/</span> RIR {item.rir} <span className="text-dot">/</span> Recupero {timeLabel(item.restSeconds)}</p></div></div>
        {item.progressionNote && <p className="progression-note">{item.progressionNote}</p>}
        <details className="exercise-instructions"><summary>Istruzioni e preparazione <ChevronDown size={14} /></summary><p>{exercise.instructions}</p><p>Prepara l'attrezzo e completa un avvicinamento progressivo: circa {timeLabel(exercise.rampSeconds)}, recuperi inclusi. Se serve piu tempo, prendilo.</p></details>
        <div className="set-table"><div className="set-table-head"><span>Serie</span><span>Kg</span><span>Rip.</span><span>RIR</span><span className="sr-only">Completa</span></div>
          {Array.from({ length: item.sets }, (_, index) => <SetRow key={`${item.id}-${index}`} item={item} index={index}
            log={session.logs.find((log) => log.planExerciseId === item.id && log.setIndex === index)} onLog={onLog} onUndo={onUndo} blocked={blocked} />)}</div>
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
