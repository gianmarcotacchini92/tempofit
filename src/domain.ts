import { csvExerciseVariants } from './csvExercises.ts'

export type Muscle = 'chest' | 'back' | 'shoulders' | 'legs' | 'biceps' | 'triceps' | 'core'
export type Equipment = 'gym' | 'dumbbells' | 'bodyweight'
export type Goal = 'strength' | 'hypertrophy' | 'mixed'
export type Level = 'beginner' | 'intermediate' | 'advanced'

export const MUSCLE_LABELS: Record<Muscle, string> = {
  chest: 'Petto', back: 'Schiena', shoulders: 'Spalle', legs: 'Gambe',
  biceps: 'Bicipiti', triceps: 'Tricipiti', core: 'Core',
}
export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  gym: 'Palestra', dumbbells: 'Manubri', bodyweight: 'Corpo libero',
}
export const GOAL_LABELS: Record<Goal, string> = {
  strength: 'Forza', hypertrophy: 'Ipertrofia', mixed: 'Forza + ipertrofia',
}
export const LEVEL_LABELS: Record<Level, string> = {
  beginner: 'Principiante', intermediate: 'Intermedio', advanced: 'Avanzato',
}
export const PATTERN_LABELS: Record<string, string> = {
  horizontal_push: 'Spinta orizzontale',
  vertical_push: 'Spinta verticale',
  horizontal_pull: 'Tirata orizzontale',
  vertical_pull: 'Tirata verticale',
  horizontal_adduction: 'Aperture e chiusure del petto',
  shoulder_abduction: 'Abduzione delle spalle',
  squat: 'Accosciata e affondi',
  hinge: 'Estensione dell’anca',
  elbow_flexion: 'Flessione del gomito',
  elbow_extension: 'Estensione del gomito',
  core: 'Controllo del tronco',
  knee_extension: 'Estensione del ginocchio',
  knee_flexion: 'Flessione del ginocchio',
  shoulder_extension: 'Estensione delle spalle a braccia tese',
  shoulder_horizontal_abduction: 'Apertura posteriore delle spalle',
}

export interface Exercise {
  id: string
  name: string
  muscles: Muscle[]
  secondary: Muscle[]
  equipment: Equipment[]
  pattern: string
  stimulus: string
  category: 'compound' | 'isolation'
  instructions: string
  setupSeconds: number
  rampSeconds: number
  secondsPerRep: number
  unilateral: boolean
  bodyweight?: boolean
  historyOnly?: boolean
}

const ALL: Equipment[] = ['gym', 'dumbbells', 'bodyweight']
const DB: Equipment[] = ['gym', 'dumbbells']
const GYM: Equipment[] = ['gym']

// Equipment lists describe complete available profiles, not individual pieces of kit.
// Ramp time includes practice sets AND their recovery; setup is equipment preparation only.
const PLANNING_EXERCISES: Exercise[] = [
  {
    id: 'barbell-bench', name: 'Panca piana con bilanciere', muscles: ['chest'],
    secondary: ['shoulders', 'triceps'], equipment: [...GYM], pattern: 'horizontal_push', stimulus: 'flat_press',
    category: 'compound', instructions: 'Piedi stabili, scapole appoggiate. Abbassa il bilanciere con controllo e spingi senza rimbalzo; usa sicurezze o assistenza.',
    setupSeconds: 65, rampSeconds: 180, secondsPerRep: 3, unilateral: false,
  },
  {
    id: 'db-incline-press', name: 'Spinte inclinate con manubri', muscles: ['chest'],
    secondary: ['shoulders', 'triceps'], equipment: [...GYM], pattern: 'horizontal_push', stimulus: 'incline_press',
    category: 'compound', instructions: 'Su panca poco inclinata, tieni i polsi sopra i gomiti. Scendi entro un’ampiezza controllabile e risali senza urtare i manubri.',
    setupSeconds: 55, rampSeconds: 120, secondsPerRep: 3, unilateral: false,
  },
  {
    id: 'db-floor-press', name: 'Spinte con manubri a terra', muscles: ['chest'],
    secondary: ['triceps', 'shoulders'], equipment: [...DB], pattern: 'horizontal_push', stimulus: 'flat_press',
    category: 'compound', instructions: 'Sdraiato a terra, ginocchia piegate: sfiora il pavimento con la parte alta delle braccia e spingi. Parti da manubri gestibili.',
    setupSeconds: 35, rampSeconds: 90, secondsPerRep: 3, unilateral: false,
  },
  {
    id: 'push-up', name: 'Piegamenti a terra', muscles: ['chest'],
    secondary: ['triceps', 'shoulders', 'core'], equipment: [...ALL], pattern: 'horizontal_push', stimulus: 'flat_press',
    category: 'compound', instructions: 'Mantieni il corpo allineato e abbassa il petto tra le mani. Appoggia le ginocchia se necessario per mantenere le ripetizioni in riserva.',
    setupSeconds: 20, rampSeconds: 45, secondsPerRep: 3, unilateral: false,
  },
  {
    id: 'close-push-up', name: 'Piegamenti a presa stretta', muscles: ['triceps', 'chest'],
    secondary: ['shoulders', 'core'], equipment: [...ALL], pattern: 'horizontal_push', stimulus: 'close_grip_press',
    category: 'compound', instructions: 'Mani poco più strette delle spalle, gomiti vicini al busto. Riduci la leva con le ginocchia a terra se perdi il controllo.',
    setupSeconds: 20, rampSeconds: 45, secondsPerRep: 3, unilateral: false,
  },
  {
    id: 'cable-row', name: 'Rematore al cavo basso', muscles: ['back'],
    secondary: ['biceps'], equipment: [...GYM], pattern: 'horizontal_pull', stimulus: 'horizontal_row',
    category: 'compound', instructions: 'Busto stabile, tira la maniglia verso le costole senza slanci. Lascia avanzare le braccia mantenendo il controllo.',
    setupSeconds: 45, rampSeconds: 105, secondsPerRep: 3, unilateral: false,
  },
  {
    id: 'lat-pulldown', name: 'Lat machine davanti', muscles: ['back'],
    secondary: ['biceps'], equipment: [...GYM], pattern: 'vertical_pull', stimulus: 'vertical_pull',
    category: 'compound', instructions: 'Regola il fermo sulle cosce. Porta la barra verso la parte alta del petto senza tirare dietro la nuca o oscillare.',
    setupSeconds: 45, rampSeconds: 105, secondsPerRep: 3, unilateral: false,
  },
  {
    id: 'barbell-row', name: 'Rematore con bilanciere', muscles: ['back'],
    secondary: ['biceps', 'core'], equipment: [...GYM], pattern: 'horizontal_pull', stimulus: 'horizontal_row',
    category: 'compound', instructions: 'Inclina il busto dall’anca, ginocchia morbide. Tira verso il bacino mantenendo la posizione del tronco; evita di sollevare il peso a scatti.',
    setupSeconds: 55, rampSeconds: 150, secondsPerRep: 3, unilateral: false,
  },
  {
    id: 'db-row', name: 'Rematore con due manubri', muscles: ['back'],
    secondary: ['biceps', 'core'], equipment: [...DB], pattern: 'horizontal_pull', stimulus: 'horizontal_row',
    category: 'compound', instructions: 'Busto inclinato dall’anca e piedi saldi. Avvicina i gomiti al bacino, poi allunga le braccia senza cambiare assetto.',
    setupSeconds: 35, rampSeconds: 90, secondsPerRep: 3, unilateral: false,
  },
  {
    id: 'db-one-arm-row', name: 'Rematore a un braccio', muscles: ['back'],
    secondary: ['biceps', 'core'], equipment: [...DB], pattern: 'horizontal_pull', stimulus: 'horizontal_row',
    category: 'compound', instructions: 'In posizione sfalsata, appoggia la mano libera sulla tua coscia. Tira il manubrio senza ruotare il busto; completa entrambi i lati.',
    setupSeconds: 35, rampSeconds: 105, secondsPerRep: 3, unilateral: true,
  },
  {
    id: 'barbell-overhead-press', name: 'Lento avanti con bilanciere', muscles: ['shoulders'],
    secondary: ['triceps', 'core'], equipment: [...GYM], pattern: 'vertical_push', stimulus: 'overhead_press',
    category: 'compound', instructions: 'Parti dalle spalle e spingi verso l’alto mantenendo il busto stabile. Non compensare inarcando la schiena.',
    setupSeconds: 55, rampSeconds: 150, secondsPerRep: 3, unilateral: false,
  },
  {
    id: 'db-overhead-press', name: 'Spinte sopra la testa con manubri', muscles: ['shoulders'],
    secondary: ['triceps', 'core'], equipment: [...DB], pattern: 'vertical_push', stimulus: 'overhead_press',
    category: 'compound', instructions: 'In piedi, addome attivo e ginocchia morbide. Spingi da altezza spalle senza inarcare il busto; scendi lentamente.',
    setupSeconds: 30, rampSeconds: 90, secondsPerRep: 3, unilateral: false,
  },
  {
    id: 'pike-push-up', name: 'Piegamenti a V', muscles: ['shoulders'],
    secondary: ['triceps', 'core'], equipment: [...ALL], pattern: 'vertical_push', stimulus: 'overhead_press',
    category: 'compound', instructions: 'Bacino alto e mani a terra: piega i gomiti portando la testa tra le mani. Accorcia l’escursione se non mantieni controllo e riserva.',
    setupSeconds: 25, rampSeconds: 60, secondsPerRep: 4, unilateral: false,
  },
  {
    id: 'db-lateral-raise', name: 'Alzate laterali', muscles: ['shoulders'],
    secondary: [], equipment: [...DB], pattern: 'shoulder_abduction', stimulus: 'lateral_raise',
    category: 'isolation', instructions: 'Con manubri leggeri e gomiti morbidi, solleva le braccia circa all’altezza delle spalle. Evita slanci e abbassa con controllo.',
    setupSeconds: 25, rampSeconds: 45, secondsPerRep: 3, unilateral: false,
  },
  {
    id: 'barbell-squat', name: 'Squat con bilanciere', muscles: ['legs'],
    secondary: ['core'], equipment: [...GYM], pattern: 'squat', stimulus: 'squat',
    category: 'compound', instructions: 'Regola le sicurezze del rack. Scendi tra le anche con piedi stabili, entro un’ampiezza controllata, poi risali senza perdere l’assetto.',
    setupSeconds: 75, rampSeconds: 180, secondsPerRep: 4, unilateral: false,
  },
  {
    id: 'db-goblet-squat', name: 'Goblet squat', muscles: ['legs'],
    secondary: ['core'], equipment: [...DB], pattern: 'squat', stimulus: 'squat',
    category: 'compound', instructions: 'Tieni un manubrio davanti al petto. Scendi tra le anche mantenendo tutto il piede a terra e risali senza slanci.',
    setupSeconds: 30, rampSeconds: 90, secondsPerRep: 4, unilateral: false,
  },
  {
    id: 'db-reverse-lunge', name: 'Affondi indietro con manubri', muscles: ['legs'],
    secondary: ['core'], equipment: [...DB], pattern: 'squat', stimulus: 'lunge',
    category: 'compound', instructions: 'Fai un passo indietro e piega le gambe, mantenendo stabile il piede davanti. Torna in piedi; esegui le ripetizioni per ciascun lato.',
    setupSeconds: 35, rampSeconds: 105, secondsPerRep: 4, unilateral: true,
  },
  {
    id: 'bodyweight-squat', name: 'Squat a corpo libero', muscles: ['legs'],
    secondary: ['core'], equipment: [...ALL], pattern: 'squat', stimulus: 'squat',
    category: 'compound', instructions: 'Piedi stabili, scendi senza fretta e risali con controllo. Se la variante è troppo facile, non considerarla lavoro specifico di forza.',
    setupSeconds: 15, rampSeconds: 45, secondsPerRep: 4, unilateral: false,
  },
  {
    id: 'reverse-lunge', name: 'Affondi indietro a corpo libero', muscles: ['legs'],
    secondary: ['core'], equipment: [...ALL], pattern: 'squat', stimulus: 'lunge',
    category: 'compound', instructions: 'Porta un piede indietro e abbassati finché resti stabile. Spingi sul piede davanti; completa lo stesso numero di ripetizioni per lato.',
    setupSeconds: 20, rampSeconds: 60, secondsPerRep: 4, unilateral: true,
  },
  {
    id: 'barbell-hip-thrust', name: 'Hip thrust con bilanciere', muscles: ['legs'],
    secondary: ['core'], equipment: [...GYM], pattern: 'hinge', stimulus: 'hip_bridge',
    category: 'compound', instructions: 'Parte alta del dorso su panca stabile e bilanciere protetto sul bacino. Solleva le anche senza iperestendere la schiena.',
    setupSeconds: 75, rampSeconds: 150, secondsPerRep: 3, unilateral: false,
  },
  {
    id: 'db-glute-bridge', name: 'Ponte glutei con manubrio', muscles: ['legs'],
    secondary: ['core'], equipment: [...DB], pattern: 'hinge', stimulus: 'hip_bridge',
    category: 'compound', instructions: 'A terra, tieni saldamente il manubrio sul bacino. Solleva le anche fino ad allineare il busto alle cosce, poi riappoggia lentamente.',
    setupSeconds: 35, rampSeconds: 75, secondsPerRep: 3, unilateral: false,
  },
  {
    id: 'single-leg-bridge', name: 'Ponte glutei a una gamba', muscles: ['legs'],
    secondary: ['core'], equipment: [...ALL], pattern: 'hinge', stimulus: 'hip_bridge',
    category: 'compound', instructions: 'Da supino, un piede appoggiato e l’altro sollevato. Alza il bacino senza ruotarlo; torna al ponte su due piedi se necessario. Ripeti sui due lati.',
    setupSeconds: 20, rampSeconds: 45, secondsPerRep: 3, unilateral: true,
  },
  {
    id: 'barbell-rdl', name: 'Stacco rumeno con bilanciere', muscles: ['legs'],
    secondary: ['back', 'core'], equipment: [...GYM], pattern: 'hinge', stimulus: 'hip_hinge',
    category: 'compound', instructions: 'Ginocchia morbide: porta il bacino indietro tenendo la barra vicino alle gambe. Ferma la discesa prima di perdere la posizione del tronco.',
    setupSeconds: 60, rampSeconds: 180, secondsPerRep: 4, unilateral: false,
  },
  {
    id: 'db-rdl', name: 'Stacco rumeno con manubri', muscles: ['legs'],
    secondary: ['back', 'core'], equipment: [...DB], pattern: 'hinge', stimulus: 'hip_hinge',
    category: 'compound', instructions: 'Fai scorrere i manubri vicino alle gambe mentre sposti il bacino indietro. Risali estendendo le anche, senza tirare con la schiena.',
    setupSeconds: 35, rampSeconds: 105, secondsPerRep: 4, unilateral: false,
  },
  {
    id: 'db-curl', name: 'Curl con manubri', muscles: ['biceps'],
    secondary: [], equipment: [...DB], pattern: 'elbow_flexion', stimulus: 'supinated_curl',
    category: 'isolation', instructions: 'Gomiti vicini ai fianchi, solleva entrambi i manubri senza oscillare. Abbassa lentamente mantenendo i polsi stabili.',
    setupSeconds: 25, rampSeconds: 45, secondsPerRep: 3, unilateral: false,
  },
  {
    id: 'cable-triceps', name: 'Estensioni tricipiti al cavo', muscles: ['triceps'],
    secondary: [], equipment: [...GYM], pattern: 'elbow_extension', stimulus: 'triceps_pushdown',
    category: 'isolation', instructions: 'Gomiti fermi vicino al busto: estendi le braccia verso il basso. Torna senza spostare le spalle o usare il peso del corpo.',
    setupSeconds: 35, rampSeconds: 45, secondsPerRep: 3, unilateral: false,
  },
  {
    id: 'db-triceps-extension', name: 'Estensioni tricipiti con manubrio', muscles: ['triceps'],
    secondary: [], equipment: [...DB], pattern: 'elbow_extension', stimulus: 'overhead_triceps',
    category: 'isolation', instructions: 'Con due mani su un manubrio leggero, parti sopra la testa. Piega i gomiti entro un’ampiezza comoda e distendi senza inarcare il busto.',
    setupSeconds: 30, rampSeconds: 60, secondsPerRep: 3, unilateral: false,
  },
  {
    id: 'db-hammer-curl', name: 'Curl a martello', muscles: ['biceps'],
    secondary: [], equipment: [...DB], pattern: 'elbow_flexion', stimulus: 'neutral_curl',
    category: 'isolation', instructions: 'Palmi rivolti uno verso l’altro, piega i gomiti senza slancio. Muovi insieme le braccia e controlla la discesa.',
    setupSeconds: 25, rampSeconds: 45, secondsPerRep: 3, unilateral: false,
  },
  {
    id: 'dead-bug', name: 'Dead bug', muscles: ['core'],
    secondary: [], equipment: [...ALL], pattern: 'core', stimulus: 'trunk_stability',
    category: 'isolation', instructions: 'Da supino, allunga lentamente braccio e gamba opposti senza cambiare l’appoggio del tronco. Espira e alterna: le ripetizioni sono per lato.',
    setupSeconds: 20, rampSeconds: 30, secondsPerRep: 4, unilateral: true,
  },
  {
    id: 'reverse-crunch', name: 'Crunch inverso', muscles: ['core'],
    secondary: [], equipment: [...ALL], pattern: 'core', stimulus: 'trunk_flexion',
    category: 'isolation', instructions: 'Da supino con ginocchia piegate, avvicina il bacino alle costole sollevandolo appena da terra. Evita lo slancio delle gambe.',
    setupSeconds: 20, rampSeconds: 30, secondsPerRep: 3, unilateral: false,
  },
  {
    id: 'bird-dog', name: 'Bird dog', muscles: ['core'],
    secondary: ['legs'], equipment: [...ALL], pattern: 'core', stimulus: 'trunk_stability',
    category: 'isolation', instructions: 'A quattro appoggi, allunga braccio e gamba opposti mantenendo il bacino fermo. Rientra lentamente; conta le ripetizioni per ciascun lato.',
    setupSeconds: 20, rampSeconds: 30, secondsPerRep: 4, unilateral: true,
  },
  {
    id: 'side-plank-raise', name: 'Sollevamenti del bacino sul fianco', muscles: ['core'],
    secondary: ['legs', 'shoulders'], equipment: [...ALL], pattern: 'core', stimulus: 'lateral_core',
    category: 'isolation', instructions: 'Sul fianco, avambraccio sotto la spalla e ginocchia piegate: solleva e abbassa il bacino lentamente. Completa entrambi i lati.',
    setupSeconds: 25, rampSeconds: 30, secondsPerRep: 3, unilateral: true,
  },
  {
    id: 'leg-press', name: 'Leg press', muscles: ['legs'],
    secondary: [], equipment: [...GYM], pattern: 'squat', stimulus: 'squat',
    category: 'compound', instructions: 'Regola sedile e sicurezze. Piega le gambe finché il bacino resta appoggiato, poi spingi senza bloccare bruscamente le ginocchia.',
    setupSeconds: 60, rampSeconds: 135, secondsPerRep: 4, unilateral: false,
  },
  {
    id: 'db-floor-fly', name: 'Croci con manubri a terra', muscles: ['chest'],
    secondary: ['shoulders'], equipment: [...DB], pattern: 'horizontal_adduction', stimulus: 'chest_fly',
    category: 'isolation', instructions: 'Usa manubri leggeri e gomiti leggermente piegati. Apri fino al lieve contatto delle braccia con il pavimento, poi richiudi senza slancio.',
    setupSeconds: 35, rampSeconds: 60, secondsPerRep: 3, unilateral: false,
  },
  {
    id: 'cable-fly', name: 'Croci ai cavi', muscles: ['chest'],
    secondary: ['shoulders'], equipment: [...GYM], pattern: 'horizontal_adduction', stimulus: 'chest_fly',
    category: 'isolation', instructions: 'In posizione stabile, chiudi le braccia davanti al petto con gomiti morbidi. Riapri solo finché controlli spalle e tronco.',
    setupSeconds: 50, rampSeconds: 60, secondsPerRep: 3, unilateral: false,
  },
  {
    id: 'pull-up', name: 'Trazioni alla sbarra', muscles: ['back'],
    secondary: ['biceps', 'core'], equipment: [...GYM], pattern: 'vertical_pull', stimulus: 'vertical_pull_bodyweight',
    category: 'compound', instructions: 'Parti con scapole attive e corpo stabile. Porta il petto verso la sbarra senza slanci; usa assistenza se non mantieni il controllo.',
    setupSeconds: 35, rampSeconds: 90, secondsPerRep: 4, unilateral: false, bodyweight: true,
  },
  {
    id: 'db-flat-bench-press', name: 'Panca piana con manubri', muscles: ['chest'],
    secondary: ['shoulders', 'triceps'], equipment: [...GYM], pattern: 'horizontal_push', stimulus: 'flat_press',
    category: 'compound', instructions: 'Piedi stabili e scapole appoggiate. Abbassa i manubri con controllo, poi spingi senza urtarli; usa un peso gestibile.',
    setupSeconds: 60, rampSeconds: 120, secondsPerRep: 3, unilateral: false,
  },
  {
    id: 'close-grip-lat-pulldown', name: 'Lat pulldown a presa stretta', muscles: ['back'],
    secondary: ['biceps'], equipment: [...GYM], pattern: 'vertical_pull', stimulus: 'vertical_pull',
    category: 'compound', instructions: 'Blocca le cosce e porta la maniglia verso la parte alta del petto mantenendo il busto stabile. Risali senza perdere tensione.',
    setupSeconds: 45, rampSeconds: 90, secondsPerRep: 3, unilateral: false,
  },
  {
    id: 'chest-dip', name: 'Dip per il petto', muscles: ['chest'],
    secondary: ['triceps', 'shoulders'], equipment: [...GYM], pattern: 'horizontal_push', stimulus: 'dip_press',
    category: 'compound', instructions: 'Sostieni il corpo con spalle stabili e busto leggermente inclinato. Scendi solo entro un’ampiezza controllata e spingi senza slancio.',
    setupSeconds: 35, rampSeconds: 75, secondsPerRep: 3, unilateral: false, bodyweight: true,
  },
  {
    id: 'cable-preacher-curl', name: 'Curl alla panca Scott al cavo', muscles: ['biceps'],
    secondary: [], equipment: [...GYM], pattern: 'elbow_flexion', stimulus: 'preacher_curl',
    category: 'isolation', instructions: 'Con la maniglia del cavo basso, appoggia le braccia al cuscino e fletti i gomiti senza staccarti. Abbassa lentamente senza bloccare i gomiti.',
    setupSeconds: 40, rampSeconds: 45, secondsPerRep: 3, unilateral: false,
  },
  {
    id: 'db-preacher-curl', name: 'Curl su panca Scott con manubrio', muscles: ['biceps'],
    secondary: [], equipment: [...GYM], pattern: 'elbow_flexion', stimulus: 'preacher_curl',
    category: 'isolation', instructions: 'Appoggia un braccio al cuscino e solleva il manubrio senza muovere la spalla. Abbassa con controllo; completa le ripetizioni su entrambi i lati.',
    setupSeconds: 40, rampSeconds: 60, secondsPerRep: 3, unilateral: true,
  },
  {
    id: 'leg-extension', name: 'Leg extension', muscles: ['legs'],
    secondary: [], equipment: [...GYM], pattern: 'knee_extension', stimulus: 'knee_extension',
    category: 'isolation', instructions: 'Allinea il ginocchio al perno della macchina e regola il rullo sopra la caviglia. Estendi senza slanci e torna con controllo.',
    setupSeconds: 40, rampSeconds: 60, secondsPerRep: 3, unilateral: false,
  },
  {
    id: 'seated-leg-curl', name: 'Leg curl da seduto', muscles: ['legs'],
    secondary: [], equipment: [...GYM], pattern: 'knee_flexion', stimulus: 'knee_flexion',
    category: 'isolation', instructions: 'Regola sedile e fermi per tenere stabile il bacino. Piega le ginocchia senza sollevarti dal sedile e accompagna il ritorno.',
    setupSeconds: 40, rampSeconds: 60, secondsPerRep: 3, unilateral: false,
  },
  {
    id: 'cable-straight-arm-pulldown', name: 'Pulldown a braccia tese', muscles: ['back'],
    secondary: ['core'], equipment: [...GYM], pattern: 'shoulder_extension', stimulus: 'straight_arm_pull',
    category: 'isolation', instructions: 'Con gomiti appena piegati e busto stabile, porta la barra del cavo alto verso le cosce. Risali senza inarcare la schiena.',
    setupSeconds: 40, rampSeconds: 60, secondsPerRep: 3, unilateral: false,
  },
  {
    id: 'db-reverse-fly', name: 'Aperture posteriori con manubri', muscles: ['shoulders'],
    secondary: ['back'], equipment: [...DB], pattern: 'shoulder_horizontal_abduction', stimulus: 'rear_delt',
    category: 'isolation', instructions: 'Inclina il busto dalle anche e usa manubri leggeri. Apri le braccia con gomiti morbidi senza slanciare o cambiare posizione del tronco.',
    setupSeconds: 30, rampSeconds: 60, secondsPerRep: 3, unilateral: false,
  },
]

export const EXERCISES: Exercise[] = [...PLANNING_EXERCISES, ...csvExerciseVariants(PLANNING_EXERCISES)]

export interface WorkoutSettings {
  minutes: number
  muscles: Muscle[]
  goal: Goal
  level: Level
  equipment: Equipment
  avoidedIds: string[]
  preferredIds: string[]
  avoidedPatterns: string[]
  includeAccessories?: boolean
  minRestSeconds?: number
}

export const DEFAULT_SETTINGS: WorkoutSettings = {
  minutes: 45, muscles: ['chest', 'back'], goal: 'mixed',
  level: 'intermediate', equipment: 'gym',
  avoidedIds: [], preferredIds: [], avoidedPatterns: [],
  includeAccessories: false, minRestSeconds: 0,
}

export interface PlanExercise {
  id: string
  exerciseId: string
  sets: number
  repMin: number
  repMax: number
  restSeconds: number
  rir: number
  targetLoad: number | null
  progressionNote?: string
  sourceExerciseName?: string
}
export interface WorkoutPlan {
  id: string
  name: string
  createdAt: string
  settings: WorkoutSettings
  exercises: PlanExercise[]
  warmupSeconds: number
  reserveSeconds: number
}
export interface SetLog {
  id: string
  planExerciseId: string
  setIndex: number
  weight: number | null
  reps: number
  rir: number | null
  completedAt: string
  sourceSetIndex?: number
}
export interface WorkoutSession {
  id: string
  plan: WorkoutPlan
  startedAt: string
  finishedAt: string | null
  logs: SetLog[]
  importSource?: { format: 'hevy-csv'; mappingVersion: 2; key: string }
}

export function needsCsvRepair(session: WorkoutSession): boolean {
  return typeof session.id === 'string' && session.id.startsWith('imported-session-') && session.importSource === undefined
}

export function setNumber(log: SetLog): number {
  return (log.sourceSetIndex ?? log.setIndex) + 1
}

const WARMUP_SECONDS = 300
const RESERVE_SECONDS = 90
const TRANSITION_SECONDS = 45
const LOG_SECONDS = 12
const MAX_EXERCISES: Record<Level, number> = { beginner: 6, intermediate: 8, advanced: 8 }
export const MAX_SETS: Record<Level, number> = { beginner: 3, intermediate: 4, advanced: 5 }
const MAX_TOTAL_SETS: Record<Level, number> = { beginner: 12, intermediate: 21, advanced: 24 }
const exerciseById = new Map(EXERCISES.map((exercise) => [exercise.id, exercise]))

function maxTotalSets(settings: WorkoutSettings): number {
  if (settings.level === 'beginner') return MAX_TOTAL_SETS.beginner
  if (settings.minutes < 60) return MAX_TOTAL_SETS[settings.level]
  const extra = Math.floor((settings.minutes - 45) / 15)
  return Math.min(
    settings.level === 'intermediate' ? 26 : 30,
    MAX_TOTAL_SETS[settings.level] + Math.max(0, extra) * 2,
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasKey<T extends string>(record: Record<T, string>, value: unknown): value is T {
  return typeof value === 'string' && Object.hasOwn(record, value)
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function integerBetween(value: unknown, min: number, max: number): value is number {
  return finite(value) && Number.isInteger(value) && value >= min && value <= max
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && Number.isFinite(Date.parse(value))
}

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function settingsErrors(value: unknown): string[] {
  if (!isRecord(value)) return ['Impostazioni mancanti: scegli durata, obiettivo e gruppi muscolari.']
  const errors: string[] = []
  if (!finite(value.minutes) || value.minutes < 1 || value.minutes > 180) {
    errors.push('Inserisci una durata numerica compresa tra 1 e 180 minuti.')
  }
  if (!Array.isArray(value.muscles) || value.muscles.length === 0
    || value.muscles.some((muscle: unknown) => !hasKey(MUSCLE_LABELS, muscle))) {
    errors.push('Seleziona almeno un gruppo muscolare valido.')
  } else if (new Set(value.muscles).size !== value.muscles.length) {
    errors.push('Seleziona ogni gruppo muscolare una sola volta, nell’ordine di priorità.')
  }
  if (!hasKey(GOAL_LABELS, value.goal)) errors.push('Scegli un obiettivo valido: forza, ipertrofia o misto.')
  if (!hasKey(LEVEL_LABELS, value.level)) errors.push('Scegli un livello di esperienza valido.')
  if (!hasKey(EQUIPMENT_LABELS, value.equipment)) errors.push('Scegli un profilo di attrezzatura valido.')
  if (value.includeAccessories !== undefined && typeof value.includeAccessories !== 'boolean') {
    errors.push('Scegli se includere gli accessori con il controllo dedicato.')
  }
  if (value.minRestSeconds !== undefined && !integerBetween(value.minRestSeconds, 0, 300)) {
    errors.push('Il recupero minimo deve essere un numero intero tra 0 e 300 secondi.')
  }
  for (const [key, label] of [['avoidedIds', 'esclusioni'], ['preferredIds', 'preferenze']] as const) {
    if (!Array.isArray(value[key]) || value[key].some((id: unknown) => typeof id !== 'string' || !exerciseById.has(id))) {
      errors.push(`Controlla le ${label}: usa solo identificativi di esercizi presenti nel catalogo.`)
    }
  }
  if (!Array.isArray(value.avoidedPatterns)
    || value.avoidedPatterns.some((pattern: unknown) => !hasKey(PATTERN_LABELS, pattern))) {
    errors.push('Controlla i movimenti esclusi: selezionali dal catalogo.')
  }
  return errors
}

export function getExercise(id: string): Exercise {
  const exercise = exerciseById.get(id)
  if (!exercise) throw new Error(`Esercizio sconosciuto: ${String(id)}.`)
  return exercise
}

export function isBodyweightExercise(exercise: Exercise): boolean {
  // Needing a bar or parallel bars does not turn bodyweight work into an external-load variant.
  return exercise.bodyweight === true || exercise.equipment.includes('bodyweight')
}

export function minimumRestSeconds(item: PlanExercise): number {
  const exercise = getExercise(item.exerciseId)
  if (exercise.category === 'isolation') return 60
  if (isBodyweightExercise(exercise) && exercise.equipment.includes('bodyweight')) return 60
  return item.repMax <= 8 ? 120 : 90
}

function validPrescription(item: PlanExercise): boolean {
  return !!item && integerBetween(item.sets, 1, 20)
    && integerBetween(item.repMin, 1, 50) && integerBetween(item.repMax, item.repMin, 50)
    && integerBetween(item.restSeconds, 30, 300) && finite(item.rir) && item.rir >= 0 && item.rir <= 5
    && (item.targetLoad === null || (finite(item.targetLoad) && item.targetLoad > 0))
}

export function estimateExerciseSeconds(item: PlanExercise): number {
  if (!validPrescription(item)) return Infinity
  const exercise = exerciseById.get(item.exerciseId)
  if (!exercise) return Infinity
  const work = item.repMax * exercise.secondsPerRep * (exercise.unilateral ? 2 : 1)
  return exercise.setupSeconds + exercise.rampSeconds
    + item.sets * (work + LOG_SECONDS) + (item.sets - 1) * item.restSeconds
}

export function estimatePlanSeconds(plan: WorkoutPlan): number {
  if (!plan || !Array.isArray(plan.exercises)
    || !finite(plan.warmupSeconds) || plan.warmupSeconds < 0
    || !finite(plan.reserveSeconds) || plan.reserveSeconds < 0) return Infinity
  return plan.warmupSeconds + plan.reserveSeconds
    + plan.exercises.reduce((total, item) => total + estimateExerciseSeconds(item), 0)
    + Math.max(0, plan.exercises.length - 1) * TRANSITION_SECONDS
}

function allowed(exercise: Exercise, settings: WorkoutSettings): boolean {
  return !exercise.historyOnly && exercise.equipment.includes(settings.equipment)
    && !settings.avoidedIds.includes(exercise.id)
    && !settings.avoidedPatterns.includes(exercise.pattern)
}

const ACCESSORY_MAP: Partial<Record<Muscle, Muscle[]>> = {
  chest: ['shoulders', 'triceps'],
  back: ['shoulders', 'biceps'],
  shoulders: ['triceps'],
  legs: ['core'],
}

function isRelevantAccessory(exercise: Exercise, settings: WorkoutSettings): boolean {
  if (settings.includeAccessories !== true || settings.minutes < 60 || exercise.category !== 'isolation'
    || exercise.muscles.some((muscle) => settings.muscles.includes(muscle))) return false
  const accessoryMuscles = new Set(settings.muscles.flatMap((muscle) => ACCESSORY_MAP[muscle] ?? []))
  return exercise.muscles.some((muscle) => accessoryMuscles.has(muscle))
}

function accessorySlot(exercise: Exercise): string {
  return exercise.muscles[0]!
}

export function validatePlan(plan: WorkoutPlan): string[] {
  if (!plan || typeof plan !== 'object') return ['Piano mancante: genera un nuovo allenamento.']
  const errors = settingsErrors(plan.settings)
  const settingsValid = errors.length === 0
  if (!nonempty(plan.id)) errors.push('Il piano deve avere un identificativo valido: rigeneralo.')
  if (!nonempty(plan.name)) errors.push('Assegna un nome al piano.')
  if (!validDate(plan.createdAt)) errors.push('La data di creazione del piano non è valida.')
  if (!finite(plan.warmupSeconds) || plan.warmupSeconds < WARMUP_SECONDS) {
    errors.push('Mantieni almeno 5 minuti di riscaldamento generale.')
  }
  if (!finite(plan.reserveSeconds) || plan.reserveSeconds < 60) {
    errors.push('Mantieni almeno 60 secondi di margine per piccoli imprevisti.')
  }
  if (!Array.isArray(plan.exercises) || plan.exercises.length === 0) {
    errors.push('Il piano è vuoto: aggiungi esercizi per tutti i gruppi selezionati.')
    return errors
  }
  const itemIds = new Set<string>()
  const exerciseIds = new Set<string>()
  const covered = new Set<Muscle>()
  let totalSets = 0
  for (const item of plan.exercises) {
    if (!item || typeof item !== 'object') {
      errors.push('Una prescrizione è mancante: rimuovila o rigenera il piano.')
      continue
    }
    if (!nonempty(item.id) || itemIds.has(item.id)) {
      errors.push('Ogni voce del piano deve avere un identificativo unico e non vuoto.')
    }
    itemIds.add(item.id)
    const exercise = exerciseById.get(item.exerciseId)
    if (!exercise) {
      errors.push(`Esercizio non riconosciuto (${String(item.exerciseId)}): scegli una voce del catalogo.`)
    } else {
      if (exerciseIds.has(exercise.id)) errors.push(`${exercise.name}: evita di duplicare lo stesso esercizio.`)
      exerciseIds.add(exercise.id)
      exercise.muscles.forEach((muscle) => covered.add(muscle))
      if (settingsValid && !allowed(exercise, plan.settings)) {
        errors.push(`${exercise.name}: incompatibile con attrezzatura o esclusioni; sostituiscilo.`)
      }
      if (isBodyweightExercise(exercise) && item.targetLoad !== null) {
        errors.push(`${exercise.name}: lascia il carico vuoto per questa variante a corpo libero.`)
      }
      const minRest = Math.max(minimumRestSeconds(item), settingsValid ? plan.settings.minRestSeconds ?? 0 : 0)
      if (finite(item.restSeconds) && item.restSeconds < minRest) {
        errors.push(`${exercise.name}: mantieni almeno ${minRest} secondi di recupero; riduci il lavoro invece di comprimere le pause.`)
      }
    }
    if (!validPrescription(item)) {
      errors.push(`${exercise?.name ?? 'Esercizio'}: usa serie e ripetizioni intere positive (massimo 50 ripetizioni), recupero 30–300 s, RIR 0–5 e carico positivo oppure vuoto.`)
    }
    if (finite(item.sets)) totalSets += item.sets
    if (settingsValid && finite(item.sets) && item.sets > MAX_SETS[plan.settings.level]) {
      errors.push(`${exercise?.name ?? 'Esercizio'}: limita le serie a ${MAX_SETS[plan.settings.level]} per il livello scelto.`)
    }
    if (settingsValid && plan.settings.level === 'beginner' && finite(item.rir) && item.rir < 3) {
      errors.push(`${exercise?.name ?? 'Esercizio'}: per iniziare mantieni almeno 3 ripetizioni in riserva.`)
    }
  }
  if (settingsValid) {
    const missing = plan.settings.muscles.filter((muscle) => !covered.has(muscle))
    if (missing.length) errors.push(`Manca lavoro primario per: ${missing.map((muscle) => MUSCLE_LABELS[muscle]).join(', ')}. Aggiungi o sostituisci un esercizio.`)
    if (plan.exercises.length > MAX_EXERCISES[plan.settings.level] || totalSets > maxTotalSets(plan.settings)) {
      errors.push('Volume eccessivo per il livello scelto: riduci il numero di esercizi o di serie.')
    }
    const seconds = estimatePlanSeconds(plan)
    if (Number.isFinite(seconds) && seconds > plan.settings.minutes * 60) {
      errors.push(`Il piano supera il tempo disponibile di ${Math.ceil((seconds - plan.settings.minutes * 60) / 60)} min: riduci serie o esercizi senza perdere gruppi, oppure aumenta la durata.`)
    }
  }
  return errors
}

export function getSubstitutions(
  item: PlanExercise, settings: WorkoutSettings, existingIds: string[] = [],
): Exercise[] {
  if (settingsErrors(settings).length || !item) return []
  const original = exerciseById.get(item.exerciseId)
  if (!original) return []
  const selectedPrimary = original.muscles.filter((muscle) => settings.muscles.includes(muscle))
  const required = selectedPrimary.length ? selectedPrimary : original.muscles
  return EXERCISES.filter((exercise) => exercise.id !== original.id
    && !existingIds.includes(exercise.id) && allowed(exercise, settings)
    && required.every((muscle) => exercise.muscles.includes(muscle)))
    .sort((a, b) => {
      const score = (exercise: Exercise) => Number(settings.preferredIds.includes(exercise.id)) * 4
        + Number(exercise.pattern === original.pattern) * 2 + Number(exercise.category === original.category)
      return score(b) - score(a) || a.name.localeCompare(b.name, 'it')
    })
}

interface Exposure {
  session: WorkoutSession
  item: PlanExercise
  logs: SetLog[]
  time: number
}

function exposuresFor(exerciseId: string, history: WorkoutSession[]): Exposure[] {
  if (!Array.isArray(history)) return []
  const exposures: Exposure[] = []
  const seen = new Set<string>()
  for (const session of history) {
    if (!session || !nonempty(session.id) || seen.has(session.id)
      || !session.plan || !Array.isArray(session.plan.exercises) || !Array.isArray(session.logs)) continue
    if (needsCsvRepair(session)) continue
    const date = session.finishedAt ?? session.startedAt
    if (!validDate(date)) continue
    const matches = session.plan.exercises.filter((item) => item && item.exerciseId === exerciseId)
    if (matches.length !== 1) continue
    const item = matches[0]!
    if (!nonempty(item.id)) continue
    seen.add(session.id)
    const logs = session.logs.filter((log) => log && log.planExerciseId === item.id)
    exposures.push({ session, item, logs, time: Date.parse(date) })
  }
  return exposures.sort((a, b) => b.time - a.time)
}

function meaningfulLog(log: SetLog): boolean {
  return nonempty(log.id) && finite(log.weight) && log.weight > 0
    && integerBetween(log.reps, 1, 100) && validDate(log.completedAt)
    && integerBetween(log.setIndex, 0, 19)
}

function fullExposure(exposure: Exposure, repMax: number, targetRir: number, load: number): boolean {
  const { session, item, logs } = exposure
  if (!validDate(session.finishedAt) || !validDate(session.startedAt)
    || Date.parse(session.finishedAt) < Date.parse(session.startedAt)
    || !validPrescription(item) || item.sets < 2
    || item.repMax !== repMax || item.rir !== targetRir || logs.length !== item.sets) return false
  const indices = new Set<number>()
  const ids = new Set<string>()
  for (const log of logs) {
    if (!meaningfulLog(log) || log.setIndex >= item.sets || indices.has(log.setIndex) || ids.has(log.id)
      || log.weight !== load || log.reps < repMax
      || !finite(log.rir) || log.rir < targetRir || log.rir > 10
      || Date.parse(log.completedAt) < Date.parse(session.startedAt)
      || Date.parse(log.completedAt) > Date.parse(session.finishedAt)) return false
    indices.add(log.setIndex)
    ids.add(log.id)
  }
  return indices.size === item.sets
}

export function suggestLoad(
  exerciseId: string, history: WorkoutSession[], repMax: number, targetRir: number, allowIncrease = true,
  planned?: Pick<PlanExercise, 'sets' | 'repMin' | 'restSeconds'>,
): number | null {
  const exercise = exerciseById.get(exerciseId)
  if (!exercise || isBodyweightExercise(exercise)
    || !integerBetween(repMax, 1, 50) || !finite(targetRir) || targetRir < 0 || targetRir > 5) return null
  const exposures = exposuresFor(exerciseId, history)
  let lastLoad: number | null = null
  for (const exposure of exposures) {
    const logs = exposure.logs.filter((log) => meaningfulLog(log) && log.setIndex < exposure.item.sets)
      .sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt))
    if (logs.length) {
      lastLoad = logs[0]!.weight
      break
    }
  }
  if (lastLoad === null) return null
  if (!allowIncrease) return lastLoad
  const [latest, previous] = exposures
  if (!latest || !previous || latest.time === previous.time
    || (planned !== undefined && (latest.item.sets !== planned.sets
      || latest.item.repMin !== planned.repMin || latest.item.restSeconds !== planned.restSeconds))
    || latest.item.sets !== previous.item.sets || latest.item.repMin !== previous.item.repMin
    || latest.item.restSeconds !== previous.item.restSeconds
    || !fullExposure(latest, repMax, targetRir, lastLoad)
    || !fullExposure(previous, repMax, targetRir, lastLoad)) return lastLoad
  // Dumbbell values are per implement; barbell/machine values are total displayed kg.
  const step = exercise.id.startsWith('db-') ? 1 : 2.5
  const increment = Math.max(step, Math.round(lastLoad * 0.025 / step) * step)
  if (increment / lastLoad > 0.05 + Number.EPSILON) return lastLoad
  return Math.round((lastLoad + increment) * 100) / 100
}

function normalSets(exercise: Exercise, level: Level): number {
  return level === 'beginner' || (exercise.category === 'isolation' && level !== 'advanced') ? 2 : 3
}

function prescription(
  exercise: Exercise, settings: WorkoutSettings, sets: number, mainUsed: boolean,
): PlanExercise {
  const bodyweight = isBodyweightExercise(exercise)
  const strength = exercise.category === 'compound' && !bodyweight
    && (settings.goal === 'strength' || (settings.goal === 'mixed' && !mainUsed
      && exercise.muscles.includes(settings.muscles[0]!)))
  let repMin = exercise.category === 'isolation' ? 10 : 8
  let repMax = exercise.category === 'isolation' ? 15 : 12
  let restSeconds = exercise.category === 'isolation' ? 75 : 120
  if (strength) {
    repMin = settings.level === 'beginner' ? 5 : 3
    repMax = settings.level === 'beginner' ? 8 : 6
    restSeconds = settings.level === 'advanced' ? 210 : 180
  } else if (bodyweight && exercise.muscles.includes('legs')) {
    repMin = 10
    repMax = 15
  }
  if (exercise.muscles.includes('core')) {
    repMin = 10
    repMax = 12
    restSeconds = 60
  }
  restSeconds = Math.max(restSeconds, settings.minRestSeconds ?? 0)
  return {
    id: `candidate-${exercise.id}`, exerciseId: exercise.id, sets, repMin, repMax, restSeconds,
    rir: settings.level === 'beginner' || bodyweight ? 3 : 2, targetLoad: null,
  }
}

function recentPenalties(history: WorkoutSession[]): Map<string, number> {
  const penalties = new Map<string, number>()
  if (!Array.isArray(history)) return penalties
  const sessions = history.filter((session) => session && !needsCsvRepair(session) && validDate(session.finishedAt)
    && session.plan && Array.isArray(session.plan.exercises) && Array.isArray(session.logs))
    .sort((a, b) => Date.parse(b.finishedAt!) - Date.parse(a.finishedAt!)).slice(0, 3)
  sessions.forEach((session, index) => {
    session.plan.exercises.forEach((item) => {
      if (item && session.logs.some((log) => log && log.planExerciseId === item.id && integerBetween(log.reps, 1, 100))) {
        penalties.set(item.exerciseId, Math.max(penalties.get(item.exerciseId) ?? 0, (3 - index) * 0.5))
      }
    })
  })
  return penalties
}

interface Candidate {
  exercise: Exercise
  mask: number
  quality: number
}
interface SearchState {
  seconds: number
  score: number
  items: PlanExercise[]
}

function stateKey(mask: number, count: number, mainUsed: boolean): number {
  return mask * 32 + count * 2 + Number(mainUsed)
}

function addFrontier(frontiers: Map<number, SearchState[]>, key: number, state: SearchState): void {
  const current = frontiers.get(key) ?? []
  if (current.some((other) => other.seconds <= state.seconds && other.score >= state.score)) return
  const next = current.filter((other) => !(state.seconds <= other.seconds && state.score >= other.score))
  next.push(state)
  next.sort((a, b) => a.seconds - b.seconds || b.score - a.score)
  // Preserve the fastest route unconditionally: bounded quality search must never lose feasibility.
  if (next.length > 24) {
    let remove = 1
    let smallestGap = Infinity
    for (let index = 1; index < next.length - 1; index++) {
      const gap = next[index + 1]!.score - next[index - 1]!.score
      if (gap < smallestGap) {
        smallestGap = gap
        remove = index
      }
    }
    next.splice(remove, 1)
  }
  frontiers.set(key, next)
}

function coverageWeight(mask: number, settings: WorkoutSettings): number {
  return settings.muscles.reduce((sum, _muscle, index) => sum
    + ((mask & (1 << index)) ? index === 0 ? 2.5 : 1 + (settings.muscles.length - index - 1) * 0.12 : 0), 0)
}

export function isFocusExercise(item: PlanExercise, settings: WorkoutSettings): boolean {
  return getExercise(item.exerciseId).muscles.includes(settings.muscles[0]!)
}

function priorityIndex(exercise: Exercise, settings: WorkoutSettings): number {
  const index = settings.muscles.findIndex((muscle) => exercise.muscles.includes(muscle))
  return index < 0 ? settings.muscles.length : index
}

function searchCoverage(
  candidates: Candidate[], settings: WorkoutSettings, availableSeconds: number,
): PlanExercise[] | null {
  const fullMask = (1 << settings.muscles.length) - 1
  const maxCount = MAX_EXERCISES[settings.level]
  const frontiers = new Map<number, SearchState[]>()
  frontiers.set(stateKey(0, 0, false), [{ seconds: 0, score: 0, items: [] }])
  const volumeRewards = [0, 10, 26, 38]
  for (let mask = 0; mask < fullMask; mask++) {
    const firstUncovered = settings.muscles.findIndex((_muscle, index) => !(mask & (1 << index)))
    for (let count = 0; count < maxCount; count++) {
      for (const mainUsed of [false, true]) {
        const states = frontiers.get(stateKey(mask, count, mainUsed))
        if (!states) continue
        for (const candidate of candidates) {
          if (!(candidate.mask & (1 << firstUncovered))) continue
          const newMask = mask | candidate.mask
          const weight = coverageWeight(candidate.mask & ~mask, settings)
          const nextMain = mainUsed || (candidate.exercise.category === 'compound'
            && !isBodyweightExercise(candidate.exercise) && Boolean(candidate.mask & 1))
          for (let sets = 1; sets <= normalSets(candidate.exercise, settings.level); sets++) {
            const item = prescription(candidate.exercise, settings, sets, mainUsed)
            const cost = estimateExerciseSeconds(item) + (count ? TRANSITION_SECONDS : 0)
            for (const state of states) {
              const seconds = state.seconds + cost
              if (seconds > availableSeconds) continue
              addFrontier(frontiers, stateKey(newMask, count + 1, nextMain), {
                seconds,
                score: state.score + volumeRewards[sets]! * weight + candidate.quality,
                items: [...state.items, item],
              })
            }
          }
        }
      }
    }
  }
  let best: SearchState | undefined
  for (let count = 1; count <= maxCount; count++) {
    for (const mainUsed of [false, true]) {
      for (const state of frontiers.get(stateKey(fullMask, count, mainUsed)) ?? []) {
        if (!best || state.score > best.score || (state.score === best.score && state.seconds < best.seconds)) best = state
      }
    }
  }
  return best ? best.items : null
}

function addUsefulVolume(
  items: PlanExercise[], candidates: Candidate[], settings: WorkoutSettings, availableSeconds: number,
): PlanExercise[] {
  const minutesPerGroup = availableSeconds / 60 / settings.muscles.length
  const desiredPerGroup = Math.min(settings.level === 'beginner' ? 2 : 3,
    minutesPerGroup >= 35 ? 3 : minutesPerGroup >= 12 ? 2 : 1)
  const desiredFor = (muscle: Muscle) => Math.min(settings.level === 'beginner' ? 2 : 3,
    desiredPerGroup + Number(muscle === settings.muscles[0] && settings.minutes >= 45))
  const groupCap = settings.level === 'beginner' ? 6 : settings.level === 'intermediate' ? 9 : 12
  const result = items.map((item) => ({ ...item }))
  let used = result.reduce((sum, item) => sum + estimateExerciseSeconds(item), 0)
    + (result.length - 1) * TRANSITION_SECONDS
  for (let iteration = 0; iteration < 32; iteration++) {
    const totalSets = result.reduce((sum, item) => sum + item.sets, 0)
    const groupSets = new Map<Muscle, number>()
    const groupStimuli = new Map<Muscle, Set<string>>()
    result.forEach((item) => getExercise(item.exerciseId).muscles.forEach((muscle) => {
      groupSets.set(muscle, (groupSets.get(muscle) ?? 0) + item.sets)
      const stimuli = groupStimuli.get(muscle) ?? new Set<string>()
      stimuli.add(getExercise(item.exerciseId).stimulus)
      groupStimuli.set(muscle, stimuli)
    }))
    let best: { index: number; item: PlanExercise; cost: number; efficiency: number; tier: number; priority: number; stage: number } | undefined
    const consider = (index: number, item: PlanExercise, cost: number, benefit: number, addedSets: number, tier: number) => {
      if (used + cost > availableSeconds || totalSets + addedSets > maxTotalSets(settings)) return
      if (getExercise(item.exerciseId).muscles.some((muscle) =>
        (groupSets.get(muscle) ?? 0) + addedSets > (settings.muscles.includes(muscle) ? groupCap : 6))) return
      const efficiency = benefit / cost
      const priority = priorityIndex(getExercise(item.exerciseId), settings)
      const stage = tier === 0 ? 0 : tier < 20 ? 1 : tier === 20 ? 2 : 3
      if (!best || stage < best.stage || (stage === best.stage
        && (priority < best.priority || (priority === best.priority
          && (tier < best.tier || (tier === best.tier && efficiency > best.efficiency)))))) {
        best = { index, item, cost, efficiency, tier, priority, stage }
      }
    }
    result.forEach((item, index) => {
      const exercise = getExercise(item.exerciseId)
      const normal = normalSets(exercise, settings.level)
      if (item.sets >= Math.min(MAX_SETS[settings.level], normal + 1)) return
      const extended = { ...item, sets: item.sets + 1 }
      const candidate = candidates.find((entry) => entry.exercise.id === item.exerciseId)!
      const benefit = (item.sets < normal ? 14 : 3) * Math.max(0.5, coverageWeight(candidate.mask, settings))
      // Complete normal working sets, then prefer complementary work over fourth/fifth sets.
      consider(index, extended, estimateExerciseSeconds(extended) - estimateExerciseSeconds(item), benefit, 1,
        item.sets < normal ? 0 : 100)
    })
    if (result.length < MAX_EXERCISES[settings.level]) {
      const mainUsed = result.some((item) => {
        const exercise = getExercise(item.exerciseId)
        return exercise.category === 'compound' && !isBodyweightExercise(exercise) && isFocusExercise(item, settings)
      })
      for (const candidate of candidates) {
        if (result.some((item) => item.exerciseId === candidate.exercise.id)) continue
        const redundant = result.some((item) => {
          const existing = getExercise(item.exerciseId)
          return existing.stimulus === candidate.exercise.stimulus
            && existing.muscles.some((muscle) => candidate.exercise.muscles.includes(muscle))
        })
        if (redundant) continue
        const underrepresented = candidate.exercise.muscles.filter((muscle) => settings.muscles.includes(muscle)
          && (groupStimuli.get(muscle)?.size ?? 0) < desiredFor(muscle))
        const accessory = isRelevantAccessory(candidate.exercise, settings)
        if (accessory && result.some((item) => {
          const exercise = getExercise(item.exerciseId)
          return isRelevantAccessory(exercise, settings) && accessorySlot(exercise) === accessorySlot(candidate.exercise)
        })) continue
        if (!underrepresented.length && !accessory) continue
        const tier = accessory ? 20 : 1 + 4 * Math.min(...underrepresented.map((muscle) => groupStimuli.get(muscle)?.size ?? 0))
          + Number(isBodyweightExercise(candidate.exercise)) * 2
          + Number(candidate.exercise.category === 'isolation')
        const usefulMask = settings.muscles.reduce((mask, muscle, index) =>
          mask | (underrepresented.includes(muscle) ? 1 << index : 0), 0)
        for (let sets = 2; sets <= normalSets(candidate.exercise, settings.level); sets++) {
          const item = prescription(candidate.exercise, settings, sets, mainUsed)
          consider(-1, item, estimateExerciseSeconds(item) + TRANSITION_SECONDS,
            (accessory ? 18 : (18 + (sets - 2) * 8) * coverageWeight(usefulMask, settings))
              + candidate.quality, sets, tier)
        }
      }
    }
    if (!best) break
    if (best.index < 0) result.push(best.item)
    else result[best.index] = best.item
    used += best.cost
  }
  return result.sort((a, b) => priorityIndex(getExercise(a.exerciseId), settings) - priorityIndex(getExercise(b.exerciseId), settings))
}

function focusAnchor(candidates: Candidate[], settings: WorkoutSettings, history: WorkoutSession[]): string | undefined {
  if (!Array.isArray(history)) return undefined
  const eligible = candidates.filter((entry) => entry.mask & 1)
  const preferred = eligible.filter((entry) => settings.preferredIds.includes(entry.exercise.id))
  const ids = new Set((preferred.length ? preferred : eligible).map((entry) => entry.exercise.id))
  const sessions = history.filter((session) => session && !needsCsvRepair(session) && validDate(session.finishedAt)
    && session.plan && Array.isArray(session.plan.exercises) && Array.isArray(session.logs))
    .sort((a, b) => Date.parse(b.finishedAt!) - Date.parse(a.finishedAt!))
  for (const session of sessions) {
    const previous = session.plan.exercises.find((item) => item && ids.has(item.exerciseId)
      && session.logs.some((log) => log && log.planExerciseId === item.id && integerBetween(log.reps, 1, 100)))
    if (previous) return previous.exerciseId
  }
  return undefined
}

function withProgression(item: PlanExercise, settings: WorkoutSettings, history: WorkoutSession[]): PlanExercise {
  const focus = isFocusExercise(item, settings)
  const lastLoad = suggestLoad(item.exerciseId, history, item.repMax, item.rir, false)
  const targetLoad = suggestLoad(item.exerciseId, history, item.repMax, item.rir, focus, item)
  if (!focus) return { ...item, targetLoad }
  let progressionNote: string
  if (targetLoad !== null && lastLoad !== null && targetLoad > lastLoad) {
    progressionNote = `Focus: proposta ${targetLoad} kg (prima ${lastLoad} kg), dopo due sedute comparabili al limite alto delle ripetizioni e con RIR adeguato. Conferma il carico disponibile.`
  } else if (lastLoad !== null) {
    progressionNote = `Focus: riparti da ${lastLoad} kg, da confermare. Cerca piu ripetizioni nel range solo mantenendo RIR ${item.rir} e tecnica; non aumentare automaticamente il carico.`
  } else {
    progressionNote = `Focus: registra una base confrontabile e mantieni RIR ${item.rir}. La progressione parte dalle ripetizioni pulite, non da un carico inventato.`
  }
  return { ...item, targetLoad, progressionNote }
}

export function planBudgetNote(plan: WorkoutPlan): string | null {
  const duration = estimatePlanSeconds(plan)
  const unused = plan.settings.minutes * 60 - duration
  if (!Number.isFinite(duration) || unused < Math.max(15 * 60, plan.settings.minutes * 60 * 0.25)) return null
  return `Il piano usa circa ${Math.ceil(duration / 60)} dei ${plan.settings.minutes} minuti disponibili. `
    + 'Il tempo è un limite massimo: volume per livello, gruppi scelti e varianti compatibili possono lasciare margine. '
    + 'Per una seduta più ampia puoi aggiungere altri gruppi o cambiare attrezzatura, senza accorciare i recuperi.'
}

function uniqueId(prefix: string): string {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  return `${prefix}-${suffix}`
}

export function generatePlan(
  settings: WorkoutSettings, history: WorkoutSession[] = [],
): { plan: WorkoutPlan | null; message: string } {
  const errors = settingsErrors(settings)
  if (errors.length) return { plan: null, message: errors.join(' ') }
  const snapshot: WorkoutSettings = {
    ...settings, muscles: [...settings.muscles], avoidedIds: [...settings.avoidedIds],
    preferredIds: [...settings.preferredIds], avoidedPatterns: [...settings.avoidedPatterns],
  }
  const penalties = recentPenalties(history)
  const candidates: Candidate[] = EXERCISES.filter((exercise) => allowed(exercise, snapshot))
    .map((exercise) => {
      const mask = snapshot.muscles.reduce((value, muscle, index) => value
        | (exercise.muscles.includes(muscle) ? 1 << index : 0), 0)
      const weighted = !isBodyweightExercise(exercise)
      const quality = Number(snapshot.preferredIds.includes(exercise.id)) * 5
        + Number(exercise.category === 'compound') * 2
        + Number(weighted) * (snapshot.goal === 'strength' ? 5 : 2)
        - ((mask & 1) ? 0 : penalties.get(exercise.id) ?? 0)
      return { exercise, mask, quality }
    }).filter((candidate) => candidate.mask !== 0 || isRelevantAccessory(candidate.exercise, snapshot))
  const anchor = focusAnchor(candidates, snapshot, history)
  for (const candidate of candidates) {
    if (candidate.exercise.id === anchor) candidate.quality += 6
  }
  const unavailable = snapshot.muscles.filter((_muscle, index) => !candidates.some((candidate) => candidate.mask & (1 << index)))
  if (unavailable.length) {
    const pulling = snapshot.equipment === 'bodyweight' && unavailable.includes('back')
      ? ' Senza attrezzi per tirare non equipariamo movimenti a terra a rematori o trazioni: scegli manubri o palestra.' : ''
    return {
      plan: null,
      message: `Nessun esercizio primario disponibile per ${unavailable.map((muscle) => MUSCLE_LABELS[muscle]).join(', ')} con questi vincoli. Modifica attrezzatura o esclusioni.${pulling} Nessun gruppo è stato eliminato automaticamente.`,
    }
  }
  const availableSeconds = snapshot.minutes * 60 - WARMUP_SECONDS - RESERVE_SECONDS
  const core = searchCoverage(candidates, snapshot, availableSeconds)
  if (!core) {
    return {
      plan: null,
      message: `In ${snapshot.minutes} minuti non entra una seduta completa per tutti i gruppi scelti, con riscaldamento, preparazione, recuperi e margine, entro il volume del livello. Aumenta la durata o seleziona esplicitamente meno gruppi; nessuno è stato escluso.`,
    }
  }
  const items = addUsefulVolume(core, candidates, snapshot, availableSeconds)
  const plan: WorkoutPlan = {
    id: uniqueId('plan'),
    name: `${GOAL_LABELS[snapshot.goal]} · ${snapshot.muscles.map((muscle) => MUSCLE_LABELS[muscle]).join(' e ')}`,
    createdAt: new Date().toISOString(),
    settings: snapshot,
    exercises: items.map((item) => ({
      ...withProgression(item, snapshot, history), id: uniqueId('exercise'),
    })),
    warmupSeconds: WARMUP_SECONDS,
    reserveSeconds: RESERVE_SECONDS,
  }
  const validation = validatePlan(plan)
  if (validation.length) return { plan: null, message: validation.join(' ') }
  const abbreviated = plan.exercises.some((item) => item.sets < normalSets(getExercise(item.exerciseId), snapshot.level))
  const messages = [
    `Focus della sessione: ${MUSCLE_LABELS[snapshot.muscles[0]!]}. Prima il lavoro di questo gruppo e le sue proposte di progressione; gli altri seguono l'ordine scelto.`,
    abbreviated
      ? 'Piano abbreviato: volume ridotto a 1–2 serie dove necessario, mantenendo tutti i gruppi e il riscaldamento.'
      : 'Piano pronto: tutti i gruppi selezionati sono coperti, nell’ordine di priorità.',
    'Il tempo stimato include preparazione, serie di avvicinamento e relativi recuperi, registrazione, cambi esercizio e margine. Nessuna superserie.',
  ]
  const budgetNote = planBudgetNote(plan)
  if (budgetNote) messages.push(budgetNote)
  if (snapshot.goal === 'strength' && plan.exercises.some((item) => isBodyweightExercise(getExercise(item.exerciseId)))) {
    messages.push('Limite corpo libero: senza conoscere la difficoltà individuale usiamo ripetizioni controllate, non una prescrizione di forza specifica. Se troppo facile, servono carichi o una variante valutata; scegli manubri o palestra.')
  }
  if (snapshot.goal === 'mixed' && !plan.exercises.some((item) => item.repMax <= 8)) {
    messages.push('Il misto e adattato: sul focus manca un fondamentale caricabile. Qui progrediamo con ripetizioni e RIR controllati, senza spostare il blocco pesante su un altro gruppo.')
  }
  messages.push('Carichi da confermare: per varianti nuove parti leggero, rispetta le ripetizioni in riserva (RIR) e non cercare massimali. Manubri: kg per singolo manubrio.')
  return { plan, message: messages.join(' ') }
}
