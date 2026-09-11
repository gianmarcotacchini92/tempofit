import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { EXERCISES, getExercise, validatePlan } from '../src/domain'
import { importWorkoutCsv } from '../src/csvImport'
import { extractHistoryRoutines } from '../src/routines'
import { isAppData } from '../src/storage'
import type { AppData } from '../src/storage'

const BENCH = 'barbell-bench'
const csv = [
  'title,start_time,end_time,exercise_title,set_index,set_type,weight_kg,reps,rpe',
  '"Push","1 set 2026, 10:00","1 set 2026, 11:00","Decline Bench Press (Machine)",0,normal,120,8,9',
  '" PUSH ","8 set 2026, 10:00","8 set 2026, 11:00","Bench Press (Barbell)",0,normal,60,8,8',
  '"Declinata","9 set 2026, 10:00","9 set 2026, 11:00","Decline Bench Press (Machine)",0,normal,95,8,8',
].join('\n')

function imported() {
  const result = importWorkoutCsv(csv)
  if (!result.data) throw new Error(result.error ?? 'Invalid fixture')
  return result.data
}
async function seed(page: Page, value: unknown) {
  await page.addInitScript((data) => {
    if (localStorage.getItem('tempofit.local.v1') === null) localStorage.setItem('tempofit.local.v1', JSON.stringify(data))
  }, value)
}
async function state(page: Page): Promise<AppData> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('tempofit.local.v1')!))
}
async function navigate(page: Page, name: string) {
  const mobile = page.locator('.mobile-navigation')
  await (await mobile.isVisible() ? mobile : page.locator('.desktop-navigation')).getByRole('button', { name, exact: true }).click()
}
async function addExercise(page: Page, id: string) {
  await page.getByRole('button', { name: 'Aggiungi esercizio', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Aggiungi un esercizio.' })
  await dialog.getByRole('textbox', { name: 'Cerca esercizio per la routine' }).fill(getExercise(id).name)
  await dialog.getByText(getExercise(id).name, { exact: true }).click()
}

test('legacy history automatically creates the latest routine per name without merging exercise variants', async ({ page }) => {
  const original = imported()
  const { routines: _routines, routineHistoryInitialized: _initialized, ...old } = original
  await seed(page, { ...old, version: 2 })
  await page.goto('/')
  await navigate(page, 'Routine')
  await expect(page.locator('.routine-card')).toHaveCount(2)
  const saved = await state(page)
  expect(saved.version).toBe(3)
  expect(saved.routineHistoryInitialized).toBe(true)
  expect(saved.history).toEqual(original.history)
  const push = saved.routines.find((routine) => routine.name.trim().toLowerCase() === 'push')!
  const decline = saved.routines.find((routine) => routine.name === 'Declinata')!
  const latest = original.history.find((session) => session.plan.name.trim().toLowerCase() === 'push' && session.plan.exercises[0].exerciseId === BENCH)!
  expect(push.sourceSessionId).toBe(latest.id)
  expect(push.plan.exercises.map((item) => item.exerciseId)).toEqual([BENCH])
  expect(decline.plan.exercises[0].exerciseId).not.toBe(BENCH)
  expect(getExercise(decline.plan.exercises[0].exerciseId).historyOnly).toBe(true)
  await page.reload()
  await navigate(page, 'Routine')
  await expect(page.locator('.routine-card')).toHaveCount(2)
  expect((await state(page)).routines).toEqual(saved.routines)
  const card = page.locator('.routine-card').filter({ has: page.getByRole('heading', { name: 'Declinata', exact: true }) })
  await card.getByRole('button', { name: 'Usa routine' }).click()
  await expect(page.getByRole('button', { name: 'Inizia allenamento' })).toBeEnabled()
  expect((await state(page)).draft?.exercises[0].exerciseId).toBe(decline.plan.exercises[0].exerciseId)
  await page.getByRole('button', { name: 'Inizia allenamento' }).click()
  expect((await state(page)).active?.logs).toEqual([])
  expect((await state(page)).history).toEqual(original.history)
  await page.locator('.set-row').first().getByRole('button').click()
  await page.getByRole('button', { name: 'Salva allenamento', exact: true }).click()
  await page.getByRole('button', { name: 'Salva e termina' }).click()
  expect((await state(page)).history).toHaveLength(original.history.length + 1)
  expect((await state(page)).routines).toEqual(saved.routines)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('manual routine editing preserves ordered focus and separates template from per-session changes', async ({ page }) => {
  await page.goto('/')
  await navigate(page, 'Routine')
  await page.getByRole('button', { name: 'Nuova routine', exact: true }).click()
  await page.getByRole('textbox', { name: 'Nome routine' }).fill('Upper personalizzata')
  await addExercise(page, BENCH)
  const back = EXERCISES.find((exercise) => !exercise.historyOnly && exercise.muscles[0] === 'back' && exercise.equipment.includes('gym'))!
  await addExercise(page, back.id)
  await page.getByRole('button', { name: `Sposta in alto ${back.name}`, exact: true }).click()
  await page.getByRole('button', { name: `Modifica ${getExercise(BENCH).name}`, exact: true }).click()
  await page.getByLabel('Ripetizioni massime', { exact: true }).fill('12')
  await page.getByLabel('Ripetizioni minime', { exact: true }).fill('8')
  await page.getByLabel('Recupero (secondi)').fill('150')
  await page.getByLabel('Carico proposto (kg)').fill('40')
  await page.getByRole('button', { name: 'Salva modifiche', exact: true }).click()
  await page.getByRole('checkbox', { name: /Aggiorna i carichi dallo storico/ }).uncheck()
  await page.getByRole('button', { name: 'Salva routine', exact: true }).click()
  await expect(page.locator('.routine-card')).toHaveCount(1)
  const template = (await state(page)).routines[0]
  expect(template.plan.settings.muscles[0]).toBe('back')
  expect(template.plan.exercises.map((item) => item.exerciseId)).toEqual([back.id, BENCH])
  expect(template.plan.exercises[1].targetLoad).toBe(40)
  expect(template.refreshLoads).toBe(false)
  expect((await state(page)).history).toEqual([])
  expect((await state(page)).draft).toBeNull()
  await page.reload()
  await navigate(page, 'Routine')
  await page.getByRole('button', { name: 'Usa routine', exact: true }).click()
  const draft = (await state(page)).draft!
  expect(draft.id).not.toBe(template.plan.id)
  expect(draft.exercises[0].id).not.toBe(template.plan.exercises[0].id)
  expect(draft.routineId).toBe(template.id)
  const extra = EXERCISES.find((exercise) => !exercise.historyOnly && exercise.muscles[0] === 'triceps' && exercise.equipment.includes('gym'))!
  await addExercise(page, extra.id)
  await page.getByRole('button', { name: 'Configura', exact: true }).click()
  await page.getByLabel('Tempo disponibile (minuti)').fill('60')
  await page.getByRole('button', { name: 'Applica parametri' }).click()
  expect((await state(page)).draft?.exercises).toHaveLength(3)
  expect((await state(page)).draft?.settings.minutes).toBe(60)
  expect((await state(page)).routines[0]).toEqual(template)
  expect((await state(page)).history).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('deleted historical routines stay deleted until explicit recovery and duplicate names never overwrite', async ({ page }) => {
  await seed(page, imported())
  await page.goto('/')
  await navigate(page, 'Routine')
  await expect(page.locator('.routine-card')).toHaveCount(2)
  const before = await state(page)
  const push = before.routines.find((routine) => routine.name !== 'Declinata')!
  await page.getByRole('button', { name: `Elimina routine ${push.name}`, exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Elimina routine', exact: true }).click()
  await page.reload()
  await navigate(page, 'Routine')
  await expect(page.locator('.routine-card')).toHaveCount(1)
  expect((await state(page)).history).toEqual(before.history)
  await page.getByRole('button', { name: /Recupera dallo storico/ }).click()
  await expect(page.locator('.routine-card')).toHaveCount(2)
  await page.getByRole('button', { name: 'Duplica Declinata', exact: true }).click()
  await page.getByRole('textbox', { name: 'Nome routine' }).fill(' declinata ')
  await page.getByRole('button', { name: 'Salva routine', exact: true }).click()
  await expect(page.getByText(/Esiste gia una routine con questo nome/)).toBeVisible()
  expect((await state(page)).routines).toHaveLength(2)
  await page.getByRole('textbox', { name: 'Nome routine' }).fill('Declinata alternativa')
  await page.getByRole('button', { name: 'Salva routine', exact: true }).click()
  await expect(page.locator('.routine-card')).toHaveCount(3)
  expect((await state(page)).routines.find((routine) => routine.name === 'Declinata')).toEqual(before.routines.find((routine) => routine.name === 'Declinata'))
})

test('generator can create a saved routine without creating a live session or changing normal creation', async ({ page }) => {
  await page.goto('/')
  await navigate(page, 'Routine')
  await page.getByRole('button', { name: 'Dal generatore', exact: true }).click()
  await page.getByRole('button', { name: 'Genera allenamento', exact: true }).click()
  await page.getByRole('textbox', { name: 'Nome routine' }).fill('Dal generatore')
  await page.getByRole('button', { name: 'Salva routine', exact: true }).click()
  expect((await state(page)).routines).toHaveLength(1)
  expect((await state(page)).draft).toBeNull()
  expect((await state(page)).active).toBeNull()
  await navigate(page, 'Allenamento')
  await page.getByRole('button', { name: 'Crea allenamento', exact: true }).click()
  await page.getByRole('button', { name: 'Genera allenamento', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Inizia allenamento', exact: true })).toBeEnabled()
  expect((await state(page)).routines).toHaveLength(1)
  expect((await state(page)).draft).not.toBeNull()
})

test('saving a workout as a routine keeps the draft and asks before replacing it for reuse', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Crea allenamento', exact: true }).click()
  await page.getByRole('button', { name: 'Genera allenamento', exact: true }).click()
  const draft = (await state(page)).draft
  await page.getByRole('button', { name: 'Salva come routine', exact: true }).click()
  await page.getByRole('textbox', { name: 'Nome routine' }).fill('Dal mio piano')
  await page.getByRole('button', { name: 'Salva routine', exact: true }).click()
  expect((await state(page)).draft).toEqual(draft)
  await page.getByRole('button', { name: 'Usa routine', exact: true }).click()
  await page.getByRole('dialog', { name: 'Usare questa routine?' }).getByRole('button', { name: 'Annulla' }).click()
  expect((await state(page)).draft).toEqual(draft)
  await page.getByRole('button', { name: 'Usa routine', exact: true }).click()
  await page.getByRole('button', { name: 'Sostituisci il piano', exact: true }).click()
  expect((await state(page)).draft?.id).not.toBe(draft?.id)
  expect((await state(page)).history).toEqual([])
})

test('CSV import recovers named routines while retaining manually saved templates', async ({ page }) => {
  await page.goto('/')
  await navigate(page, 'Routine')
  await page.getByRole('button', { name: 'Nuova routine', exact: true }).click()
  await page.getByRole('textbox', { name: 'Nome routine' }).fill('La mia scheda vuota')
  await page.getByRole('button', { name: 'Salva routine', exact: true }).click()
  const manual = (await state(page)).routines[0]
  await page.getByRole('button', { name: 'Impostazioni e backup' }).click()
  await page.locator('input[type=file]').setInputFiles({ name: 'workouts.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
  await expect(page.locator('.history-card')).toHaveCount(3)
  const imported = await state(page)
  expect(imported.routines).toHaveLength(3)
  expect(imported.routines.find((routine) => routine.id === manual.id)).toEqual(manual)
  await page.locator('.history-card > summary').first().click()
  await page.locator('.history-card').first().getByRole('button', { name: 'Salva questa seduta come routine' }).click()
  await expect(page.getByRole('textbox', { name: 'Nome routine' })).toBeVisible()
  expect((await state(page)).history).toEqual(imported.history)
})

test('ambiguous legacy imports do not become misleading exercise routines', async ({ page }) => {
  const data = imported()
  data.history = data.history.map((session) => {
    const result = structuredClone(session)
    result.id = `imported-session-${session.startedAt}`
    delete result.importSource
    return result
  })
  await seed(page, data)
  await page.goto('/')
  await navigate(page, 'Routine')
  await expect(page.locator('.routine-card')).toHaveCount(0)
  await expect(page.getByText(/sedute con vecchie associazioni CSV non vengono usate per creare routine/)).toBeVisible()
  await expect(page.getByRole('button', { name: /Recupera dallo storico/ })).toBeDisabled()
  expect((await state(page)).history).toEqual(data.history)
})

test('personal volume is advisory but changing equipment cannot silently remove exercises or start an incompatible session', async ({ page }) => {
  await seed(page, imported())
  await page.goto('/')
  await navigate(page, 'Routine')
  const card = page.locator('.routine-card').filter({ has: page.getByRole('heading', { name: 'Declinata', exact: true }) })
  await card.getByRole('button', { name: 'Modifica', exact: true }).click()
  const original = (await state(page)).routines.find((routine) => routine.name === 'Declinata')!
  await page.getByRole('button', { name: `Modifica ${getExercise(original.plan.exercises[0].exerciseId).name}`, exact: true }).click()
  await page.getByLabel('Serie', { exact: true }).fill('6')
  await page.getByRole('button', { name: 'Salva modifiche', exact: true }).click()
  await expect(page.getByRole('note', { name: 'Avvisi sul volume della routine' })).toContainText('6 serie')
  await page.getByRole('button', { name: 'Salva routine', exact: true }).click()
  await card.getByRole('button', { name: 'Usa routine', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Inizia allenamento', exact: true })).toBeEnabled()
  expect((await state(page)).draft?.exercises[0].sets).toBe(6)
  await page.getByRole('button', { name: 'Configura', exact: true }).click()
  await page.getByRole('combobox', { name: 'Attrezzatura', exact: true }).selectOption('bodyweight')
  await page.getByRole('button', { name: 'Applica parametri', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Inizia allenamento', exact: true })).toBeDisabled()
  expect((await state(page)).draft?.exercises[0].exerciseId).toBe(original.plan.exercises[0].exerciseId)
  expect((await state(page)).draft?.exercises[0].sets).toBe(6)
  await page.getByRole('button', { name: 'Configura', exact: true }).click()
  await page.getByRole('combobox', { name: 'Attrezzatura', exact: true }).selectOption('gym')
  await page.getByRole('button', { name: 'Applica parametri', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Inizia allenamento', exact: true })).toBeEnabled()
})

for (const rir of [0, 1.5]) {
  test(`valid historical values remain editable and loggable without rounding (RIR ${rir})`, async ({ page }) => {
    const data = imported()
    data.routines = extractHistoryRoutines(data.history).filter((routine) => routine.name === 'Declinata')
    data.routineHistoryInitialized = true
    const routine = data.routines[0]
    routine.refreshLoads = false
    routine.plan.settings = { ...routine.plan.settings, level: 'advanced', minutes: 60.5, minRestSeconds: 125 }
    routine.plan.exercises[0] = { ...routine.plan.exercises[0], repMin: 35, repMax: 40, restSeconds: 125, rir, targetLoad: 95.3 }
    expect(isAppData(data)).toBe(true)
    expect(validatePlan(routine.plan)).toEqual([])
    await seed(page, data)
    await page.goto('/')
    await navigate(page, 'Routine')
    await page.getByRole('button', { name: 'Modifica', exact: true }).click()
    await page.getByRole('button', { name: `Modifica ${getExercise(routine.plan.exercises[0].exerciseId).name}`, exact: true }).click()
    await page.getByLabel('Recupero (secondi)', { exact: true }).fill('126')
    await page.getByRole('button', { name: 'Salva modifiche', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.getByRole('button', { name: 'Parametri routine', exact: true }).click()
    await page.getByRole('button', { name: 'Applica parametri', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.getByRole('button', { name: 'Salva routine', exact: true }).click()
    const saved = (await state(page)).routines[0]
    expect(saved.plan.settings).toEqual(routine.plan.settings)
    expect(saved.plan.exercises[0]).toMatchObject({ repMin: 35, repMax: 40, restSeconds: 126, rir, targetLoad: 95.3 })
    expect((await state(page)).history).toEqual(data.history)
    await page.getByRole('button', { name: 'Usa routine', exact: true }).click()
    await page.getByRole('button', { name: 'Inizia allenamento', exact: true }).click()
    const row = page.locator('.set-row').first()
    await row.getByRole('spinbutton', { name: / RIR$/ }).fill('1.5')
    await row.getByRole('button').click()
    expect((await state(page)).active?.logs[0]).toMatchObject({ weight: 95.3, reps: 35, rir: 1.5 })
    await page.getByRole('button', { name: 'Salva allenamento', exact: true }).click()
    await page.getByRole('button', { name: 'Salva e termina' }).click()
    await page.reload()
    const persisted = await state(page)
    expect(persisted.routines[0]).toEqual(saved)
    expect(persisted.history.find((session) => session.plan.routineId === routine.id)?.logs[0]).toMatchObject({ weight: 95.3, reps: 35, rir: 1.5 })
  })
}
