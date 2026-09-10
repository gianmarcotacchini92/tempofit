import { getExercise, workoutSetSteps } from './domain'
import type { PlanExercise, WorkoutPlan } from './domain'
import { timeLabel } from './format'
import { INTENSITY_LABELS, recoverySeconds } from './intensityPresentation'

export function TechniqueNote({ item, plan }: { item: PlanExercise; plan: WorkoutPlan }) {
  if (item.supersetGroup) {
    const pair = plan.exercises.filter((other) => other.supersetGroup === item.supersetGroup)
    const partner = pair.find((other) => other.id !== item.id)
    if (!partner) return null
    return <div className="intensity-note"><strong>Superserie {pair[0].id === item.id ? 'A' : 'B'} / {getExercise(partner.exerciseId).name}</strong>
      <p>A1, poi B1; ripeti per ogni giro. Circa 30 s per cambiare esercizio, poi {timeLabel(recoverySeconds(item, plan))} di recupero tra i giri. Prepara entrambi gli attrezzi; se non sono disponibili, sciogli la coppia nel piano.</p></div>
  }
  if (!item.technique) return null
  const steps = workoutSetSteps(plan)
  const base = steps.find((step) => step.item.id === item.id && step.setIndex === item.sets - 1 && !step.part)
  const extension = steps.find((step) => step.item.id === item.id && step.part)
  if (!base || !extension) return null
  return <div className="intensity-note"><strong>{INTENSITY_LABELS[item.technique]} / solo ultima serie</strong>
    <p>{item.technique === 'drop-set'
      ? `Dopo l'ultima serie riduci il carico di circa il 20-25%, con ${timeLabel(base.restAfterSeconds)} per il cambio, e fai una sola mini-serie da ${extension.repMin}-${extension.repMax} ripetizioni.`
      : `Dopo l'ultima serie recupera ${timeLabel(base.restAfterSeconds)}, poi fai una sola mini-serie da ${extension.repMin}-${extension.repMax} ripetizioni con lo stesso carico.`} Mantieni almeno {extension.rir} RIR. Registra separatamente i valori reali, senza sommare ripetizioni o carichi.</p></div>
}
