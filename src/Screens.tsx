import { useState } from 'react'
import { ArrowRight, ArrowUpRight, BookmarkPlus, CalendarDays, ChartNoAxesCombined, Check, ChevronRight, Clock3, Dumbbell, Flame, MoveUpRight, Plus, Search, Sparkles, Target, TrendingUp, Zap } from 'lucide-react'
import { EXERCISES, EQUIPMENT_LABELS, GOAL_LABELS, MUSCLE_LABELS, getExercise, needsCsvRepair, workoutSetSteps } from './domain'
import type { Equipment, Exercise, Muscle, WorkoutSession, WorkoutSettings } from './domain'
import { ExerciseArtwork, ExerciseIllustration, HeroArtwork } from './components'
import { dateLabel, loggedSetsLabel, regularSetCount, setLabel, timeLabel } from './format'
import { ProgressChart } from './ProgressChart'
import { TechniqueNote } from './Intensity'

function startOfWeek() {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() - (date.getDay() + 6) % 7)
  return date
}

function sessionMinutes(session: WorkoutSession) {
  return session.finishedAt === null ? 0 : Math.max(0, Math.round((Date.parse(session.finishedAt) - Date.parse(session.startedAt)) / 60000))
}

export function Dashboard({ history, active, onCreate, onHistory, onResume, onRoutines, routineCount = 0 }: {
  history: WorkoutSession[]; active: WorkoutSession | null; onCreate: (preset?: Partial<WorkoutSettings>) => void; onHistory: () => void; onResume: () => void
  onRoutines?: () => void; routineCount?: number
}) {
  const weekStart = startOfWeek()
  const weekSessions = history.filter((session) => Date.parse(session.startedAt) >= weekStart.getTime())
  const weekDays = Array.from({ length: 7 }, (_, index) => { const day = new Date(weekStart); day.setDate(day.getDate() + index); return day })
  const weekLogs = weekSessions.reduce((sum, session) => sum + regularSetCount(session.logs), 0)
  const recent = history.slice().sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)).slice(0, 3)
  return <>
    <div className="page-heading"><div><div className="eyebrow greeting">UN PASSO AVANTI, OGNI GIORNO</div><h1>Trova il tuo ritmo<span className="accent">.</span></h1><p>Non serve piu tempo. Serve un piano fatto per te.</p></div><div className="date-pill"><CalendarDays size={16} />{new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}</div></div>
    <div className="dashboard-top">
      <section className="hero-card"><div className="hero-copy"><span className="hero-kicker"><span /> IL TUO PROSSIMO ALLENAMENTO</span><h2>Il tuo tempo.<br />Il tuo <span>allenamento.</span></h2><p>Tu scegli i minuti e i muscoli.<br />Noi mettiamo tutto al posto giusto.</p>
        <button className="button primary" onClick={() => active ? onResume() : onCreate()}><Plus size={19} />{active ? 'Riprendi allenamento' : 'Crea allenamento'}<ArrowUpRight size={19} /></button>
        {onRoutines && routineCount > 0 && <div className="routine-entry-action"><button className="button secondary compact" onClick={onRoutines}><BookmarkPlus size={16} /> Le mie routine ({routineCount})</button></div>}
        <span className="hero-footnote"><Sparkles size={13} /> Personalizzato. Realistico. Pronto per te.</span>
      </div><HeroArtwork /></section>
      <section className="panel week-card"><div className="section-heading compact-heading"><h3>La tua settimana</h3><span className="small-icon"><CalendarDays size={17} /></span></div><div className="week-big"><strong>{weekSessions.length}</strong><span>allenamenti completati</span></div>
        <div className="week-days">{weekDays.map((date, index) => {
          const done = weekSessions.some((session) => new Date(session.startedAt).toDateString() === date.toDateString())
          const today = date.toDateString() === new Date().toDateString()
          return <div key={index} className={`week-day ${today ? 'today' : ''} ${done ? 'done' : ''}`}><span>{['L', 'M', 'M', 'G', 'V', 'S', 'D'][index]}</span><div aria-label={`${dateLabel(date.toISOString())}${done ? ', allenamento registrato' : ''}${today ? ', oggi' : ''}`}>{done ? <Check size={16} /> : date.getDate()}</div></div>
        })}</div><div className="week-message"><span className="tiny-accent"><Flame size={17} /></span><p>{weekSessions.length ? 'Un allenamento alla volta. Il ritmo lo scegli tu.' : 'Il primo passo conta. Parti da quello che hai oggi.'}</p></div>
      </section>
    </div>
    <div className="stat-grid">
      <Metric icon={<Dumbbell size={19} />} label="Allenamenti" value={String(history.length)} detail="nel tuo percorso" color="green" />
      <Metric icon={<Clock3 size={19} />} label="Tempo per te" value={String(weekSessions.reduce((sum, session) => sum + sessionMinutes(session), 0))} unit="min" detail="questa settimana" color="purple" />
      <Metric icon={<ChartNoAxesCombined size={19} />} label="Serie completate" value={String(weekLogs)} detail="questa settimana" color="peach" />
    </div>
    <div className="dashboard-bottom">
      <section className="quick-section"><div className="section-heading"><div><h2>Da dove vuoi partire?</h2><p>Un punto di partenza, non una scheda rigida.</p></div></div>
        <div className="quick-grid">
          <QuickStart title="Upper body" subtitle="Petto e schiena" minutes={30} icon={<Dumbbell size={27} />} color="green" onClick={() => onCreate({ muscles: ['chest', 'back'], minutes: 30, goal: 'mixed' })} />
          <QuickStart title="Lower body" subtitle="Focus gambe" minutes={45} icon={<Flame size={27} />} color="purple" onClick={() => onCreate({ muscles: ['legs'], minutes: 45, goal: 'hypertrophy' })} />
          <QuickStart title="Full body" subtitle="Un po' di tutto, con criterio" minutes={60} icon={<Zap size={27} />} color="peach" onClick={() => onCreate({ muscles: ['legs', 'chest', 'back'], minutes: 60, goal: 'mixed' })} />
        </div>
        <div className="principle-strip"><span className="principle-icon"><Target size={21} /></span><div><strong>Meno improvvisazione. Piu intenzione.</strong><p>Recuperi e riscaldamento sono parte del piano, non tempo perso.</p></div><span className="mini-label">IL METODO TEMPOFIT</span></div>
      </section>
      <section className="panel recent-panel"><div className="section-heading compact-heading"><h3>Ultime sessioni</h3><button className="icon-button" aria-label="Apri storico" onClick={onHistory}><ArrowUpRight size={19} /></button></div>
        {recent.length ? <div className="recent-list">{recent.map((session) => <button key={session.id} className="recent-item" onClick={onHistory}><ExerciseArtwork small exercise={needsCsvRepair(session) ? undefined : getExercise(session.plan.exercises[0].exerciseId)} /><span><strong>{session.plan.name}</strong><small>{dateLabel(session.startedAt, { day: 'numeric', month: 'short' })} / {loggedSetsLabel(session.logs)}</small></span><ChevronRight size={17} /></button>)}</div>
          : <div className="recent-empty"><span className="empty-icon"><TrendingUp size={26} strokeWidth={1.5} /></span><h4>La tua storia inizia qui.</h4><p>Completa il primo allenamento.<br />Ogni sessione trovera il suo posto.</p><button className="text-button" onClick={() => active ? onResume() : onCreate()}>{active ? 'Riprendi sessione' : 'Iniziamo'}<ArrowRight size={15} /></button></div>}
      </section>
    </div>
  </>
}

function Metric({ icon, label, value, unit, detail, color }: { icon: React.ReactNode; label: string; value: string; unit?: string; detail: string; color: string }) {
  return <div className="panel metric"><span className={`metric-icon ${color}`}>{icon}</span><div><span className="metric-label">{label}</span><div className="metric-value">{value} <small>{unit}</small></div><span className="metric-detail">{detail}</span></div><span className="metric-decoration"><MoveUpRight size={17} /></span></div>
}

function QuickStart({ title, subtitle, minutes, icon, color, onClick }: { title: string; subtitle: string; minutes: number; icon: React.ReactNode; color: string; onClick: () => void }) {
  return <button className={`quick-card ${color}`} onClick={onClick}><div className="quick-card-top"><span className="quick-icon">{icon}</span><ArrowUpRight size={18} /></div><h3>{title}</h3><p>{subtitle}</p><span className="quick-duration"><Clock3 size={13} />{minutes} min <span>/</span> Personalizzabile</span></button>
}

export function ExerciseLibrary({ equipment, onInspect }: { equipment: Equipment; onInspect: (exercise: Exercise) => void }) {
  const [query, setQuery] = useState('')
  const [muscle, setMuscle] = useState<Muscle | 'all'>('all')
  const [gear, setGear] = useState<Equipment | 'all'>(equipment)
  const exercises = EXERCISES.filter((exercise) => exercise.name.toLocaleLowerCase('it').includes(query.toLocaleLowerCase('it'))
    && (muscle === 'all' || exercise.muscles.includes(muscle)) && (gear === 'all' || exercise.equipment.includes(gear)))
  return <><div className="page-heading"><div><span className="eyebrow">CONOSCI IL MOVIMENTO</span><h1>La tua libreria<span className="accent">.</span></h1><p>Esercizi essenziali. Nessuna scelta lasciata al caso.</p></div><span className="count-pill">{EXERCISES.length} esercizi</span></div>
    <div className="library-toolbar"><label className="search-field"><Search size={19} /><input placeholder="Cerca un esercizio..." aria-label="Cerca esercizio" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <select aria-label="Filtra attrezzatura" value={gear} onChange={(event) => setGear(event.target.value as Equipment | 'all')}><option value="all">Tutta l'attrezzatura</option>{Object.entries(EQUIPMENT_LABELS).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></div>
    <div className="library-filters"><button className={`chip ${muscle === 'all' ? 'selected' : ''}`} onClick={() => setMuscle('all')} aria-pressed={muscle === 'all'}>Tutti</button>
      {(Object.entries(MUSCLE_LABELS) as [Muscle, string][]).map(([key, name]) => <button key={key} className={`chip ${muscle === key ? 'selected' : ''}`} onClick={() => setMuscle(key)} aria-pressed={muscle === key}>{name}</button>)}</div>
    <div className="library-grid">{exercises.map((exercise) => <button className="panel library-card" key={exercise.id} onClick={() => onInspect(exercise)}>
      <ExerciseArtwork exercise={exercise} /><span className="library-card-copy"><strong>{exercise.name}</strong><small>{exercise.muscles.map((item) => MUSCLE_LABELS[item]).join(' / ')}</small><span className="library-type">{exercise.category === 'compound' ? 'Multiarticolare' : 'Mirato'} {exercise.unilateral && '/ Unilaterale'}</span></span><ArrowUpRight size={17} /></button>)}</div>
    {exercises.length === 0 && <div className="panel empty-state"><Search size={30} /><h3>Nessun esercizio trovato.</h3><p>Prova un altro nome o modifica i filtri.</p></div>}
  </>
}

export function History({ history, onCreate, onInspect, onSaveRoutine }: { history: WorkoutSession[]; onCreate: () => void; onInspect: (exercise: Exercise) => void; onSaveRoutine?: (session: WorkoutSession) => void }) {
  return <><div className="page-heading"><div><span className="eyebrow">IL LAVORO RESTA</span><h1>Il tuo percorso<span className="accent">.</span></h1><p>Sessioni reali. Anche quelle piu brevi del previsto.</p></div><button className="button primary compact" onClick={onCreate}><Plus size={18} /> Nuovo workout</button></div>
    {history.length === 0 ? <div className="panel empty-state"><CalendarDays size={36} strokeWidth={1.5} /><h2>Il primo capitolo e da scrivere.</h2><p>Qui ritroverai serie, ripetizioni e carichi di ogni allenamento salvato.</p><button className="button primary" onClick={onCreate}>Crea il primo allenamento <ArrowRight size={17} /></button></div>
      : <div className="history-list">{history.slice().sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)).map((session) => {
        const sets = workoutSetSteps(session.plan).length
        return <details className="panel history-card" key={session.id}><summary><div className="history-date"><strong>{new Date(session.startedAt).getDate()}</strong><span>{new Date(session.startedAt).toLocaleDateString('it-IT', { month: 'short' })}</span></div>
          <div className="history-title"><span className="eyebrow">{GOAL_LABELS[session.plan.settings.goal]}</span><h3>{session.plan.name}</h3><p>{dateLabel(session.startedAt)} / {sessionMinutes(session)} min / {loggedSetsLabel(session.logs)} {session.logs.length < sets && <span className="partial-badge">Parziale</span>}</p></div><ChevronRight className="history-chevron" size={20} /></summary>
          <div className="history-details">{session.plan.exercises.map((item) => {
            const logs = session.logs.filter((log) => log.planExerciseId === item.id).sort((a, b) => a.setIndex - b.setIndex || Number(Boolean(a.part)) - Number(Boolean(b.part)))
            const exercise = getExercise(item.exerciseId)
            const unverified = needsCsvRepair(session)
            return <div className="history-exercise" key={item.id}><div className="history-exercise-heading"><button className="exercise-image-button" aria-label={`Mostra illustrazione di ${exercise.name}`} disabled={unverified} onClick={() => onInspect(exercise)}><ExerciseArtwork small exercise={unverified ? undefined : exercise} /></button><h4>{unverified ? 'Associazione da correggere: ' : ''}{exercise.name}</h4></div>
              {!unverified && <TechniqueNote item={item} plan={session.plan} />}
              {item.sourceExerciseName && <p className="muted">Nome nel CSV: {item.sourceExerciseName}</p>}{logs.length ? logs.map((log) => <p key={log.id}><span>{setLabel(log)}</span><strong>{log.weight === null ? 'Carico non registrato' : `${log.weight} kg`} / {log.reps} rip.</strong><span>{log.rir === null ? 'RIR --' : `RIR ${log.rir}`}</span></p>) : <p className="muted">Non eseguito</p>}</div>
          })}{onSaveRoutine && <button className="button secondary compact history-routine-action" disabled={needsCsvRepair(session) || !session.logs.some((log) => !log.part)} onClick={() => onSaveRoutine(session)}><BookmarkPlus size={16} /> Salva questa seduta come routine</button>}</div>
        </details>
      })}</div>}
  </>
}

export function Progress({ history, onInspect }: { history: WorkoutSession[]; onInspect: (exercise: Exercise) => void }) {
  const trustedHistory = history.filter((session) => !needsCsvRepair(session))
  const muscleSets = (Object.keys(MUSCLE_LABELS) as Muscle[]).map((muscle) => ({ muscle, sets: trustedHistory.reduce((sum, session) =>
    sum + session.logs.filter((log) => {
      if (log.part) return false
      const item = session.plan.exercises.find((exercise) => exercise.id === log.planExerciseId)
      return item ? getExercise(item.exerciseId).muscles.includes(muscle) : false
    }).length, 0) }))
  const maxSets = Math.max(1, ...muscleSets.map((item) => item.sets))
  return <><div className="page-heading"><div><span className="eyebrow">GUARDA QUANTA STRADA FAI</span><h1>Piccoli passi. Dati reali<span className="accent">.</span></h1><p>Il confronto giusto e con il tuo allenamento precedente.</p></div></div>
    <div className="stat-grid"><Metric icon={<Dumbbell size={20} />} label="Sessioni salvate" value={String(history.length)} detail="incluse le parziali" color="green" />
      <Metric icon={<Target size={20} />} label="Serie registrate" value={String(history.reduce((sum, session) => sum + regularSetCount(session.logs), 0))} detail="mini-serie escluse" color="purple" />
      <Metric icon={<Clock3 size={20} />} label="Tempo totale" value={String(history.reduce((sum, session) => sum + sessionMinutes(session), 0))} unit="min" detail="dedicati a te" color="peach" /></div>
    <div className="progress-grid"><ProgressChart history={history} onInspect={onInspect} /><section className="panel distribution-panel"><div className="section-heading"><div><h3>Dove hai messo energia</h3><p>Serie per muscolo principale / {trustedHistory.length < history.length ? 'escluse le associazioni CSV da correggere' : 'tutto lo storico'}</p></div></div>
      <div className="muscle-bars">{muscleSets.map(({ muscle, sets }) => <div key={muscle}><div><span>{MUSCLE_LABELS[muscle]}</span><strong>{sets}</strong></div><div className="distribution-track"><span style={{ width: `${sets / maxSets * 100}%` }} /></div></div>)}</div>
      <p className="field-help">Il coinvolgimento secondario non viene contato. Una serie puo coinvolgere piu muscoli principali.</p>
      {history.some((session) => session.logs.some((log) => log.part)) && <p className="field-help">Drop e rest-pause sono mini-serie aggiuntive: restano nello storico e nei volumi del grafico, senza essere contate come serie complete.</p>}
    </section></div>
  </>
}

export function NoWorkout({ onCreate, onRoutines }: { onCreate: () => void; onRoutines?: () => void }) {
  return <><div className="page-heading"><div><span className="eyebrow">SI PARTE DA TE</span><h1>Il prossimo passo<span className="accent">.</span></h1><p>Un piano chiaro, prima della prima ripetizione.</p></div></div><div className="panel empty-state"><span className="empty-icon large"><Dumbbell size={38} /></span><h2>Quanto tempo hai oggi?</h2><p>Scegli minuti, muscoli e obiettivo.<br />Al resto pensiamo con regole chiare e recuperi realistici.</p><button className="button primary" onClick={onCreate}><Sparkles size={18} /> Crea allenamento <ArrowRight size={18} /></button>{onRoutines && <div className="routine-entry-action"><button className="button secondary" onClick={onRoutines}><BookmarkPlus size={17} /> Scegli una routine salvata</button></div>}</div></>
}

export function ExerciseDetail({ exercise }: { exercise: Exercise }) {
  return <div className="exercise-detail"><ExerciseIllustration key={exercise.id} exercise={exercise} /><div className="tag-list">{exercise.muscles.map((muscle) => <span className="tag" key={muscle}>{MUSCLE_LABELS[muscle]}</span>)}</div>
    <h4>Il movimento</h4><p>{exercise.instructions}</p><h4>Prima di iniziare</h4><p>Prepara l'attrezzatura e avvicinati gradualmente al carico di lavoro. Non scegliere il peso in base al solo livello dichiarato.</p>
    <dl className="summary-list"><div><dt>Tipo</dt><dd>{exercise.category === 'compound' ? 'Multiarticolare' : 'Mirato'}</dd></div><div><dt>Esecuzione</dt><dd>{exercise.unilateral ? 'Entrambi i lati, uno alla volta' : 'Bilaterale / centrale'}</dd></div><div><dt>Preparazione stimata</dt><dd>{timeLabel(exercise.setupSeconds + exercise.rampSeconds)}</dd></div></dl>
    <div className="quiet-note"><span>Interrompi in caso di dolore. Queste indicazioni sintetiche non sostituiscono l'apprendimento della tecnica con un professionista.</span></div></div>
}
