import { useEffect, useId, useRef, useState } from 'react'
import { ChartNoAxesCombined, TrendingUp } from 'lucide-react'
import { EXERCISES, getExercise, isBodyweightExercise } from './domain'
import type { WorkoutSession } from './domain'
import { dateLabel } from './format'
import { PROGRESS_METRICS, PROGRESS_RANGES, progressPoints } from './progress'
import type { ProgressMetric, ProgressPoint, ProgressRange } from './progress'

const number = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 3 })
const format = (value: number) => number.format(value)
const formatMetric = (value: number, metric: ProgressMetric) => format(metric === 'oneRepMax' ? Math.round(value * 10) / 10 : value)

function InteractiveChart({ points, metric, exerciseName }: { points: ProgressPoint[]; metric: ProgressMetric; exerciseName: string }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [width, setWidth] = useState(600)
  const container = useRef<HTMLDivElement>(null)
  const detailId = useId()
  useEffect(() => {
    const element = container.current!
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const option = PROGRESS_METRICS.find((item) => item.id === metric)!
  const left = 52
  const right = Math.max(left + 1, width - 20)
  const top = 28
  const bottom = 218
  const max = points.reduce((highest, point) => Math.max(highest, point.value), 1) * 1.15
  const x = (index: number) => points.length === 1 ? (left + right) / 2 : left + index * (right - left) / (points.length - 1)
  const y = (value: number) => bottom - value / max * (bottom - top)
  const active = activeIndex === null ? null : points[activeIndex]
  const ticks = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])]
  const announce = (point: ProgressPoint) => `${dateLabel(point.date)}, serie ${point.log.setIndex + 1}: ${formatMetric(point.value, metric)} ${option.unit}`
  function selectPoint(event: { currentTarget: SVGSVGElement; clientX: number }) {
    const rect = event.currentTarget.getBoundingClientRect()
    const position = (event.clientX - rect.left) * width / rect.width
    setActiveIndex(Math.max(0, Math.min(points.length - 1, Math.round((position - left) / (right - left) * (points.length - 1)))))
  }

  return <div className="interactive-chart" ref={container}>
    <div className="weight-chart">
      <svg width="100%" height="260" viewBox={`0 0 ${width} 260`} role="group" tabIndex={0}
        aria-label={`${option.label} per ${exerciseName}. ${points.length} punti. Usa le frecce per esplorare, Home e Fine per il primo e ultimo punto.`}
        aria-describedby={detailId}
        onFocus={() => setActiveIndex((index) => index ?? points.length - 1)}
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape'].includes(event.key)) return
          event.preventDefault()
          setActiveIndex((index) => {
            if (event.key === 'Escape') return null
            if (event.key === 'Home') return 0
            if (event.key === 'End') return points.length - 1
            return Math.max(0, Math.min(points.length - 1, (index ?? points.length - 1) + (event.key === 'ArrowRight' ? 1 : -1)))
          })
        }}
        onPointerMove={(event) => {
          if (event.pointerType === 'mouse') selectPoint(event)
        }}
        onClick={selectPoint}>
        <text x={left} y="14" fill="#a0a1ab" fontSize="11">{option.unit}</text>
        {[0, 1, 2, 3].map((line) => {
          const value = max * line / 3
          return <g key={line}><line x1={left} x2={right} y1={y(value)} y2={y(value)} stroke="#303137" strokeDasharray="4 5" />
            <text x={left - 8} y={y(value) + 4} textAnchor="end" fill="#a0a1ab" fontSize="11">{new Intl.NumberFormat('it-IT', { notation: 'compact', maximumFractionDigits: 1 }).format(value)}</text></g>
        })}
        <polyline points={points.map((point, index) => `${x(index)},${y(point.value)}`).join(' ')} fill="none" stroke="#d0f58a" strokeWidth="2" strokeLinejoin="round" />
        {points.map((point, index) => <circle key={`${point.sessionId}-${point.log.id}`} className="chart-point" cx={x(index)} cy={y(point.value)} r={points.length > 100 ? 2 : 3.5} fill="#d0f58a">
          <title>{announce(point)}</title>
        </circle>)}
        {active && activeIndex !== null && <g aria-hidden="true">
          <line x1={x(activeIndex)} x2={x(activeIndex)} y1={top} y2={bottom} stroke="#a0a1ab" strokeDasharray="3 4" />
          <circle cx={x(activeIndex)} cy={y(active.value)} r="6" fill="#d0f58a" stroke="#191a1e" strokeWidth="2" />
          <text x={Math.max(left + 45, Math.min(right - 45, x(activeIndex)))} y={Math.max(24, y(active.value) - 13)} textAnchor="middle" fill="#f3f3f4" fontSize="12" stroke="#191a1e" strokeWidth="4" paintOrder="stroke">{formatMetric(active.value, metric)} {option.unit}</text>
        </g>}
        {ticks.map((index) => <text key={index} x={x(index)} y="248" textAnchor={points.length === 1 ? 'middle' : index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'} fill="#a0a1ab" fontSize="11">
          {dateLabel(points[index].date, { day: 'numeric', month: 'numeric', year: '2-digit' })}
        </text>)}
      </svg>
    </div>
    <div className="chart-detail" id={detailId} role="status" aria-live="polite" aria-atomic="true">
      {active ? <>
        <div className="chart-detail-heading"><div><strong>{dateLabel(active.date)} / Serie {active.log.setIndex + 1}</strong><span>{active.sessionName}</span></div>
          <strong className="chart-detail-value">{formatMetric(active.value, metric)} <small>{option.unit}{metric === 'oneRepMax' ? ' stimati' : ''}</small></strong></div>
        <dl className="chart-set-values"><div><dt>Peso utilizzato</dt><dd>{format(active.log.weight!)} kg</dd></div>
          <div><dt>Ripetizioni</dt><dd>{active.log.reps}</dd></div><div><dt>Volume serie</dt><dd>{format(active.log.weight! * active.log.reps)} kg × rip.</dd></div>
          <div><dt>RIR</dt><dd>{active.log.rir === null ? '--' : format(active.log.rir)}</dd></div></dl>
      </> : <p>Passa sul grafico o tocca un punto per vedere i valori della serie. Da tastiera usa le frecce.</p>}
    </div>
    <div className="chart-point-navigation" aria-label="Navigazione punti del grafico">
      <button className="chip" disabled={activeIndex === 0} onClick={() => setActiveIndex((index) => Math.max(0, (index ?? points.length) - 1))}>Precedente</button>
      <span>{activeIndex === null ? `${points.length} punti` : `${activeIndex + 1} / ${points.length}`}</span>
      <button className="chip" disabled={activeIndex === points.length - 1} onClick={() => setActiveIndex((index) => Math.min(points.length - 1, (index ?? -1) + 1))}>Successivo</button>
    </div>
  </div>
}

export function ProgressChart({ history }: { history: WorkoutSession[] }) {
  const [selected, setSelected] = useState('')
  const [range, setRange] = useState<ProgressRange>('3m')
  const [metric, setMetric] = useState<ProgressMetric>('weight')
  const tracked = EXERCISES.filter((exercise) => history.some((session) => session.plan.exercises.some((item) => item.exerciseId === exercise.id && session.logs.some((log) => log.planExerciseId === item.id && log.weight !== null))))
  const exerciseId = tracked.some((exercise) => exercise.id === selected) ? selected : tracked[0]?.id
  const exercise = exerciseId ? getExercise(exerciseId) : null
  const points = exerciseId ? progressPoints(history, exerciseId, range, metric) : []
  const option = PROGRESS_METRICS.find((item) => item.id === metric)!
  return <section className="panel chart-panel">
    <div className="section-heading"><div><h3>Un esercizio, nel tempo</h3><p>{option.description}</p></div><TrendingUp size={20} className="accent" /></div>
    <div className="chart-controls" role="group" aria-label="Metrica del grafico">{PROGRESS_METRICS.map((item) =>
      <button key={item.id} className={`chip ${metric === item.id ? 'selected' : ''}`} aria-pressed={metric === item.id} onClick={() => setMetric(item.id)}>{item.label}</button>)}</div>
    <div className="chart-controls chart-periods" role="group" aria-label="Periodo del grafico">{PROGRESS_RANGES.map((item) =>
      <button key={item.id} className={`chip ${range === item.id ? 'selected' : ''}`} aria-pressed={range === item.id} onClick={() => setRange(item.id)}>{item.label}</button>)}</div>
    {exercise ? <>
      <select className="full" aria-label="Esercizio del grafico" value={exercise.id} onChange={(event) => setSelected(event.target.value)}>{tracked.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      {points.length ? <>
        <p className="field-help chart-summary">{new Set(points.map((point) => point.sessionId)).size} sessioni / {points.length} {metric === 'oneRepMax' ? 'stime' : metric === 'weight' ? 'carichi massimi' : 'serie'} / {range === 'max' ? 'tutto lo storico' : `ultimi ${PROGRESS_RANGES.find((item) => item.id === range)!.label}`}.<br />
          {metric === 'volume' ? 'Un punto per serie' : 'Un punto per sessione'}, in ordine cronologico; la distanza tra i punti non indica il tempo trascorso.</p>
        <InteractiveChart key={`${exercise.id}-${range}-${metric}`} points={points} metric={metric} exerciseName={exercise.name} />
      </> : <div className="chart-empty"><ChartNoAxesCombined size={36} strokeWidth={1.3} /><h4>Nessun dato per questa selezione.</h4><p>{metric === 'oneRepMax' ? 'Servono serie da 1 a 10 ripetizioni con un carico positivo, su esercizi non a corpo libero.' : 'Nessuna serie con carico registrato nel periodo scelto.'} Prova un altro periodo o una metrica diversa.</p></div>}
      {metric === 'oneRepMax' && <p className="field-help">Stima Epley: peso × (1 + ripetizioni / 30); con una ripetizione si usa il peso registrato. Solo serie da 1 a 10 ripetizioni. RIR non incluso: la stima non e un carico da provare ne una prescrizione.</p>}
      {isBodyweightExercise(exercise) && <p className="field-help">Per questo esercizio il peso indica la sola zavorra: il volume non comprende il peso corporeo. Il massimale non viene stimato senza il carico totale.</p>}
      <p className="field-help">Peso e volume usano il carico come registrato, senza raddoppiare manubri o lati. Il carico da solo non misura forza o crescita muscolare.</p>
    </> : <div className="chart-empty"><ChartNoAxesCombined size={36} strokeWidth={1.3} /><h4>Niente numeri inventati.</h4><p>Registra il carico di una serie per iniziare a costruire il tuo grafico.</p></div>}
  </section>
}
