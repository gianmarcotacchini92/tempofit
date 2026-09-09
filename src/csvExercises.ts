import type { Exercise } from './domain.ts'

type Variant = { source: string; id: string; base: string; name: string; unilateral?: boolean; bodyweight?: boolean }

// Base entries provide movement metadata; these distinct archive variants are not
// eligible for generated workouts and never borrow the base exercise's identity.
const VARIANTS: Variant[] = [
  { source: 'Chest Press (Machine)', id: 'machine-chest-press', base: 'barbell-bench', name: 'Chest press alla macchina' },
  { source: 'Iso-Lateral Chest Press (Machine)', id: 'machine-iso-chest-press', base: 'barbell-bench', name: 'Chest press iso-laterale alla macchina' },
  { source: 'Decline Bench Press (Machine)', id: 'machine-decline-chest-press', base: 'barbell-bench', name: 'Chest press declinata alla macchina' },
  { source: 'Incline Bench Press (Barbell)', id: 'barbell-incline-bench', base: 'barbell-bench', name: 'Panca inclinata con bilanciere' },
  { source: 'Chest Fly (Dumbbell)', id: 'db-bench-fly', base: 'db-floor-fly', name: 'Croci con manubri su panca' },
  { source: 'Chest Fly (Machine)', id: 'machine-chest-fly', base: 'cable-fly', name: 'Croci alla macchina' },
  { source: 'Pull Up (Band)', id: 'band-assisted-pull-up', base: 'pull-up', name: 'Trazioni assistite con elastico', bodyweight: true },
  { source: 'Lat Pulldown (Machine)', id: 'machine-lat-pulldown', base: 'lat-pulldown', name: 'Lat pulldown alla macchina' },
  { source: 'Single Arm Lat Pulldown', id: 'single-arm-lat-pulldown', base: 'lat-pulldown', name: 'Lat pulldown a un braccio', unilateral: true },
  { source: 'T Bar Row', id: 't-bar-row', base: 'barbell-row', name: 'Rematore T-bar' },
  { source: 'Landmine Row', id: 'landmine-row', base: 'barbell-row', name: 'Rematore landmine' },
  { source: 'Dumbbell Row', id: 'hevy-dumbbell-row', base: 'db-row', name: 'Rematore con manubrio (Dumbbell Row)' },
  { source: 'Seated Cable Row - Bar Grip', id: 'cable-row-bar-grip', base: 'cable-row', name: 'Rematore al cavo con barra' },
  { source: 'Seated Cable Row - Bar Wide Grip', id: 'cable-row-wide-grip', base: 'cable-row', name: 'Rematore al cavo con barra larga' },
  { source: 'Seated Cable Row - V Grip (Cable)', id: 'cable-row-v-grip', base: 'cable-row', name: 'Rematore al cavo con maniglia a V' },
  { source: 'Seated Row (Machine)', id: 'machine-seated-row', base: 'cable-row', name: 'Rematore da seduto alla macchina' },
  { source: 'Iso-Lateral Row (Machine)', id: 'machine-iso-row', base: 'cable-row', name: 'Rematore iso-laterale alla macchina' },
  { source: 'Iso-Lateral Low Row', id: 'machine-iso-low-row', base: 'cable-row', name: 'Rematore basso iso-laterale' },
  { source: 'Rope Straight Arm Pulldown', id: 'rope-straight-arm-pulldown', base: 'cable-straight-arm-pulldown', name: 'Pulldown a braccia tese con corda' },
  { source: 'Hack Squat (Machine)', id: 'machine-hack-squat', base: 'leg-press', name: 'Hack squat alla macchina' },
  { source: 'Single Leg Press (Machine)', id: 'machine-single-leg-press', base: 'leg-press', name: 'Leg press a una gamba', unilateral: true },
  { source: 'Bulgarian Split Squat (Dumbbell)', id: 'db-bulgarian-split-squat', base: 'db-reverse-lunge', name: 'Squat bulgaro con manubri', unilateral: true },
  { source: 'Lunge (Dumbbell)', id: 'db-lunge', base: 'db-reverse-lunge', name: 'Affondi con manubri', unilateral: true },
  { source: 'Curtsy Lunge (Dumbbell)', id: 'db-curtsy-lunge', base: 'db-reverse-lunge', name: 'Affondi incrociati con manubri', unilateral: true },
  { source: 'Lying Leg Curl (Machine)', id: 'machine-lying-leg-curl', base: 'seated-leg-curl', name: 'Leg curl da sdraiato' },
  { source: 'Standing Leg Curls', id: 'standing-leg-curl', base: 'seated-leg-curl', name: 'Leg curl in piedi' },
  { source: 'Single Leg Extensions', id: 'single-leg-extension', base: 'leg-extension', name: 'Leg extension a una gamba', unilateral: true },
  { source: 'Shoulder Press (Dumbbell)', id: 'hevy-db-shoulder-press', base: 'db-overhead-press', name: 'Shoulder press con manubri' },
  { source: 'Arnold Press (Dumbbell)', id: 'db-arnold-press', base: 'db-overhead-press', name: 'Arnold press con manubri' },
  { source: 'Seated Lateral Raise (Dumbbell)', id: 'db-seated-lateral-raise', base: 'db-lateral-raise', name: 'Alzate laterali da seduto con manubri' },
  { source: 'Single Arm Lateral Raise (Cable)', id: 'cable-single-arm-lateral-raise', base: 'db-lateral-raise', name: 'Alzate laterali al cavo a un braccio', unilateral: true },
  { source: 'Reverse Fly Single Arm (Cable)', id: 'cable-single-arm-reverse-fly', base: 'db-reverse-fly', name: 'Aperture posteriori al cavo a un braccio', unilateral: true },
  { source: 'Face Pull', id: 'cable-face-pull', base: 'db-reverse-fly', name: 'Face pull' },
  { source: 'EZ Bar Biceps Curl', id: 'ez-bar-curl', base: 'db-curl', name: 'Curl con bilanciere EZ' },
  { source: 'Seated Incline Curl (Dumbbell)', id: 'db-incline-curl', base: 'db-curl', name: 'Curl da seduto su panca inclinata' },
  { source: 'Concentration Curl', id: 'concentration-curl', base: 'db-curl', name: 'Curl concentrato', unilateral: true },
  { source: 'Behind the Back Curl (Cable)', id: 'cable-behind-back-curl', base: 'db-curl', name: 'Curl al cavo dietro il corpo' },
  { source: 'Spider Curl (Dumbbell)', id: 'db-spider-curl', base: 'db-preacher-curl', name: 'Spider curl con manubri' },
  { source: 'Triceps Kickback (Cable)', id: 'cable-triceps-kickback', base: 'cable-triceps', name: 'Kickback tricipiti al cavo' },
  { source: 'Overhead Triceps Extension (Cable)', id: 'cable-overhead-triceps', base: 'db-triceps-extension', name: 'Estensioni tricipiti sopra la testa al cavo' },
  { source: 'Skullcrusher (Dumbbell)', id: 'db-skullcrusher', base: 'db-triceps-extension', name: 'Skullcrusher con manubri' },
  { source: 'Single Arm Tricep Extension (Dumbbell)', id: 'db-single-arm-triceps-extension', base: 'db-triceps-extension', name: 'Estensioni tricipiti con manubrio a un braccio', unilateral: true },
  { source: 'Cable Crunch', id: 'cable-crunch', base: 'reverse-crunch', name: 'Crunch al cavo' },
  { source: 'Decline Crunch (Weighted)', id: 'weighted-decline-crunch', base: 'reverse-crunch', name: 'Crunch declinato con sovraccarico', bodyweight: true },
]

export const CSV_EXERCISE_MAP: Readonly<Record<string, string>> = {
  'Bench Press (Barbell)': 'barbell-bench',
  'Bench Press (Dumbbell)': 'db-flat-bench-press',
  'Incline Bench Press (Dumbbell)': 'db-incline-press',
  'Cable Fly Crossovers': 'cable-fly',
  'Chest Dip': 'chest-dip',
  'Push Up': 'push-up',
  'Pull Up': 'pull-up',
  'Lat Pulldown (Cable)': 'lat-pulldown',
  'Lat Pulldown - Close Grip (Cable)': 'close-grip-lat-pulldown',
  'Straight Arm Lat Pulldown (Cable)': 'cable-straight-arm-pulldown',
  'Squat (Barbell)': 'barbell-squat',
  'Leg Press (Machine)': 'leg-press',
  'Romanian Deadlift (Barbell)': 'barbell-rdl',
  'Romanian Deadlift (Dumbbell)': 'db-rdl',
  'Seated Leg Curl (Machine)': 'seated-leg-curl',
  'Leg Extension (Machine)': 'leg-extension',
  'Overhead Press (Barbell)': 'barbell-overhead-press',
  'Lateral Raise (Dumbbell)': 'db-lateral-raise',
  'Rear Delt Reverse Fly (Dumbbell)': 'db-reverse-fly',
  'Bicep Curl (Dumbbell)': 'db-curl',
  'Preacher Curl (Dumbbell)': 'db-preacher-curl',
  'Hammer Curl (Dumbbell)': 'db-hammer-curl',
  'Triceps Rope Pushdown': 'cable-triceps',
  'Iso-Lateral Chest Press': 'machine-iso-chest-press',
  ...Object.fromEntries(VARIANTS.map((variant) => [variant.source, variant.id])),
}

export function csvExerciseVariants(base: Exercise[]): Exercise[] {
  return VARIANTS.map((variant) => {
    const reference = base.find((exercise) => exercise.id === variant.base)
    if (!reference) throw new Error(`Riferimento di catalogo mancante: ${variant.base}`)
    return {
      ...reference, id: variant.id, name: variant.name, historyOnly: true,
      equipment: ['gym'], bodyweight: variant.bodyweight ?? false,
      unilateral: variant.unilateral ?? false,
      instructions: `Variante conservata dall'export: ${variant.source}. Disponibile nello storico e nei progressi, non nella generazione automatica. Nessuna equivalenza di carico con altre varianti.`,
    }
  })
}
