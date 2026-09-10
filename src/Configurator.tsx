import { useState } from 'react'
import { ArrowRight, Check, ChevronDown, Clock3, Dumbbell, ShieldCheck, Sparkles, Target, Zap } from 'lucide-react'
import { EXERCISES, EQUIPMENT_LABELS, GOAL_LABELS, LEVEL_LABELS, MUSCLE_LABELS, PATTERN_LABELS, generatePlan } from './domain'
import type { Equipment, Goal, Level, Muscle, WorkoutPlan, WorkoutSession, WorkoutSettings } from './domain'
import { Modal } from './components'

export function Configurator({ initial, history, onClose, onGenerate }: {
  initial: WorkoutSettings; history: WorkoutSession[]; onClose: () => void
  onGenerate: (plan: WorkoutPlan, settings: WorkoutSettings, message: string) => void
}) {
  const [settings, setSettings] = useState(() => structuredClone(initial))
  const [error, setError] = useState('')
  function update(patch: Partial<WorkoutSettings>) { setSettings((old) => ({ ...old, ...patch })); setError('') }
  function toggleMuscle(muscle: Muscle) {
    update({ muscles: settings.muscles.includes(muscle) ? settings.muscles.filter((item) => item !== muscle) : [...settings.muscles, muscle] })
  }
  function toggleList(key: 'avoidedIds' | 'preferredIds' | 'avoidedPatterns', value: string) {
    const next = settings[key].includes(value) ? settings[key].filter((item) => item !== value) : [...settings[key], value]
    update({ [key]: next })
  }
  return <Modal title="Facciamo spazio al tuo allenamento." subtitle="Pochi dettagli. Un workout costruito intorno a te." onClose={onClose} wide>
    <form className="config-form" onSubmit={(event) => {
      event.preventDefault()
      const result = generatePlan(settings, history)
      if (!result.plan) { setError(result.message); return }
      onGenerate(result.plan, settings, result.message)
    }}>
      <section className="config-section">
        <div className="field-title"><Clock3 size={18} /><h3>Quanto tempo hai?</h3><span>Tutto incluso</span></div>
        <div className="duration-options">{[20, 30, 45, 60, 90, 120].map((minutes) => <button key={minutes} type="button"
          className={`duration-option ${settings.minutes === minutes ? 'selected' : ''}`} aria-pressed={settings.minutes === minutes}
          onClick={() => update({ minutes })}><strong>{minutes}</strong><span>min</span></button>)}</div>
        <p className="field-help">Riscaldamento, preparazione, recuperi e un margine per gli imprevisti.</p>
      </section>
      <section className="config-section">
        <div className="field-title"><Target size={18} /><h3>Cosa alleniamo?</h3></div>
        <div className="muscle-options">{(Object.entries(MUSCLE_LABELS) as [Muscle, string][]).map(([key, label]) =>
          <button type="button" className={`chip ${settings.muscles.includes(key) ? 'selected' : ''} ${settings.muscles[0] === key ? 'focus-chip' : ''}`} key={key}
            aria-pressed={settings.muscles.includes(key)} onClick={() => toggleMuscle(key)}>
            {settings.muscles.includes(key) && <span className="priority-dot">{settings.muscles.indexOf(key) + 1}</span>}{label}
            {settings.muscles[0] === key && <span className="focus-badge">FOCUS</span>}
          </button>)}</div>
        {settings.muscles.length > 0 && <div className="focus-selection" role="status"><strong>Focus: {MUSCLE_LABELS[settings.muscles[0]!]}</strong>
          <span>{settings.muscles.map((muscle, index) => `${index + 1}. ${MUSCLE_LABELS[muscle]}`).join(' / ')}</span></div>}
        <p className="field-help">Il primo muscolo scelto e il focus: viene allenato prima, ha precedenza nel lavoro aggiuntivo e nelle proposte di progressione. Gli altri seguono l'ordine scelto, senza essere esclusi. Per cambiare ordine, deseleziona e riseleziona i gruppi.</p>
        <p className="field-help">Gambe comprende anche il lavoro per i glutei. Bicipiti e tricipiti si selezionano separatamente.</p>
      </section>
      <section className="config-section">
        <div className="field-title"><Zap size={18} /><h3>Il tuo obiettivo</h3></div>
        <div className="goal-options">{(Object.entries(GOAL_LABELS) as [Goal, string][]).map(([key, label]) =>
          <button type="button" key={key} className={`goal-option ${settings.goal === key ? 'selected' : ''}`}
            aria-pressed={settings.goal === key} onClick={() => update({ goal: key })}>
            {key === 'strength' ? <Dumbbell size={22} /> : key === 'hypertrophy' ? <Target size={22} /> : <Zap size={22} />}
            <strong>{label}</strong><small>{key === 'strength' ? 'Qualita e carichi' : key === 'hypertrophy' ? 'Volume e controllo' : 'Il meglio di entrambi'}</small>
            {settings.goal === key && <Check className="goal-check" size={16} />}
          </button>)}</div>
      </section>
      <div className="form-grid">
        <label className="field">Esperienza<select value={settings.level} onChange={(event) => update({ level: event.target.value as Level })}>
          {Object.entries(LEVEL_LABELS).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
        <label className="field">Attrezzatura<select value={settings.equipment} onChange={(event) => update({ equipment: event.target.value as Equipment })}>
          {Object.entries(EQUIPMENT_LABELS).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
      </div>
      <section className="config-section">
        <label className="field">Recupero minimo tra le serie
          <select value={settings.minRestSeconds ?? 0} onChange={(event) => update({ minRestSeconds: Number(event.target.value) })}>
            <option value="0">In base all'esercizio</option>
            <option value="90">Almeno 1 minuto e 30 secondi</option>
            <option value="120">Almeno 2 minuti</option>
            <option value="180">Almeno 3 minuti</option>
          </select>
        </label>
        <p className="field-help">Il piano usa questo minimo o il recupero richiesto dall'esercizio, se maggiore. Meno tempo significa meno lavoro, non pause piu corte.</p>
      </section>
      <section className="config-section">
        <label className="checkbox-label"><input type="checkbox" checked={settings.optimizeTime === true}
          onChange={(event) => update({ optimizeTime: event.target.checked })} /> Ottimizza il tempo</label>
        <p className="field-help">Consenti drop set (stripping), rest-pause e superserie compatibili, soprattutto nelle sedute fino a 45 minuti. Puoi cambiarli nel piano: non vengono aggiunti a ogni esercizio e non sostituiscono il lavoro pesante del focus.</p>
        <p className="field-help">Le mini-serie non equivalgono a serie complete. Le pause brevi valgono solo dentro il blocco; il recupero tra serie o giri resta rispettato. Per le superserie servono attrezzi vicini e disponibili.</p>
        {settings.optimizeTime && (settings.level === 'beginner' || settings.goal === 'strength') && <p className="field-help">Con livello principiante o obiettivo solo forza manterremo serie tradizionali.</p>}
      </section>
      <section className="config-section">
        <label className="checkbox-label"><input type="checkbox" checked={settings.includeAccessories === true}
          onChange={(event) => update({ includeAccessories: event.target.checked })} /> Aggiungi accessori per gruppi collegati</label>
        <p className="field-help">Facoltativo, da 60 minuti: piccoli complementi per spalle, bicipiti, tricipiti o core solo dopo il lavoro prioritario e se resta spazio. Senza questa opzione, restiamo sui gruppi scelti.</p>
      </section>
      <details className="advanced-options">
        <summary>Preferenze e movimenti da evitare <ChevronDown size={18} /></summary>
        <div className="advanced-content">
          <p className="field-help">Le esclusioni hanno sempre precedenza sulle preferenze. Per dolore o condizioni cliniche, chiedi indicazioni a un professionista: questa app non propone riabilitazione.</p>
          <h4>Movimenti da evitare</h4>
          <div className="check-grid">{Object.entries(PATTERN_LABELS).map(([key, label]) =>
            <label className="checkbox-label" key={key}><input type="checkbox" checked={settings.avoidedPatterns.includes(key)}
              onChange={() => toggleList('avoidedPatterns', key)} />{label}</label>)}</div>
          <div className="preference-header"><h4>Esercizio</h4><span>Preferito</span><span>Escluso</span></div>
          <div className="preference-list">{EXERCISES.filter((item) => !item.historyOnly && item.equipment.includes(settings.equipment)).map((exercise) =>
            <div className="preference-row" key={exercise.id}><span>{exercise.name}</span>
              <input type="checkbox" aria-label={`Preferisci ${exercise.name}`} checked={settings.preferredIds.includes(exercise.id)} onChange={() => toggleList('preferredIds', exercise.id)} />
              <input type="checkbox" aria-label={`Escludi ${exercise.name}`} checked={settings.avoidedIds.includes(exercise.id)} onChange={() => toggleList('avoidedIds', exercise.id)} />
            </div>)}</div>
        </div>
      </details>
      <div className="quiet-note"><ShieldCheck size={17} /><span>Regole trasparenti, non esercizi inventati da un'AI. Il carico va sempre confermato da te.</span></div>
      {error && <div className="alert" role="alert">{error}</div>}
      <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Annulla</button>
        <button type="submit" className="button primary"><Sparkles size={18} /> Genera allenamento <ArrowRight size={18} /></button></div>
    </form>
  </Modal>
}
