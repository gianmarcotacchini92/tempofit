import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { importWorkoutCsv } from '../src/csvImport'
import { emptyData, STORAGE_KEY } from '../src/storage'
import type { AppData } from '../src/storage'

const csv = [
  'title,start_time,end_time,exercise_title,set_index,set_type,weight_kg,reps,rpe',
  '"Seduta esempio","8 set 2026, 11:09","8 set 2026, 13:07","Decline Bench Press (Machine)",0,normal,120,8,9',
  '"Seduta esempio","8 set 2026, 11:09","8 set 2026, 13:07","Bench Press (Barbell)",0,normal,60,8,8',
].join('\n')
const file = { name: 'workouts.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) }

function oldData(): AppData {
  const imported = importWorkoutCsv(csv).data!
  const legacy = structuredClone(imported.history[0])
  legacy.id = `imported-session-${legacy.startedAt}`
  delete legacy.importSource
  const item = legacy.plan.exercises[1]
  item.sets = 2
  delete item.sourceExerciseName
  legacy.plan.exercises = [item]
  legacy.logs.forEach((log, index) => {
    log.planExerciseId = item.id
    log.setIndex = index
    delete log.sourceSetIndex
  })
  const native = structuredClone(legacy)
  native.id = 'native-session'
  native.plan.name = 'Sessione TempoFit'
  native.plan.exercises[0].sets = 1
  native.logs = [{ ...native.logs[0], weight: 50 }]
  return {
    ...emptyData(), settings: { ...emptyData().settings, minutes: 90 },
    history: [native, legacy], draft: native.plan,
    active: { ...native, id: 'native-active', finishedAt: null }, restEndsAt: new Date(2026, 8, 9, 18, 30).getTime(),
  }
}

async function open(page: Page, data: AppData) {
  await page.clock.setFixedTime(new Date(2026, 8, 9, 18))
  await page.goto('/')
  await page.evaluate(({ key, data }) => localStorage.setItem(key, JSON.stringify(data)), { key: STORAGE_KEY, data })
  await page.reload()
}

async function navigate(page: Page, name: string) {
  const mobile = page.locator('.mobile-navigation')
  await (await mobile.isVisible() ? mobile : page.locator('.desktop-navigation')).getByRole('button', { name, exact: true }).click()
}

async function selectRepair(page: Page, selected = file) {
  await page.getByRole('button', { name: 'Impostazioni e backup' }).click()
  await page.getByLabel('Backup JSON o CSV allenamenti').setInputFiles(selected)
}

test('CSV repair requires a backup and confirmation, preserves native work, and separates progress after reload', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const original = oldData()
  await open(page, original)
  await expect(page.getByRole('alert')).toContainText('vecchio import CSV')
  await navigate(page, 'Progressi')
  await expect(page.locator('.chart-point')).toHaveCount(1)
  await page.getByRole('button', { name: 'Successivo', exact: true }).click()
  await expect(page.locator('.chart-detail-value')).toHaveText('50 kg')
  await selectRepair(page)
  await expect(page.getByRole('dialog')).toContainText('1 sedute importate e 2 serie')
  await expect(page.getByRole('button', { name: 'Applica correzione' })).toBeDisabled()
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY)).toEqual(original)
  await page.getByRole('button', { name: 'Annulla', exact: true }).click()
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY)).toEqual(original)

  await selectRepair(page)
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Esporta backup prima della correzione' }).click()
  const download = await downloading
  expect(download.suggestedFilename()).toBe('tempofit-prima-correzione-csv.json')
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  expect(JSON.parse(Buffer.concat(chunks).toString())).toEqual(original)
  await page.getByRole('button', { name: 'Applica correzione' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.locator('.history-card')).toHaveCount(2)
  const repaired = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY)
  expect(repaired.history[0]).toEqual(original.history[0])
  expect(repaired.active).toEqual(original.active)
  expect(repaired.draft).toEqual(original.draft)
  expect(repaired.settings).toEqual(original.settings)
  expect(repaired.restEndsAt).toBe(original.restEndsAt)
  expect(repaired.history[1].id).toBe(original.history[1].id)
  expect(repaired.history[1].plan.exercises.map((entry: { exerciseId: string }) => entry.exerciseId)).toEqual(['machine-decline-chest-press', 'barbell-bench'])
  await page.locator('.history-card').filter({ hasText: 'Seduta esempio' }).locator('summary').click()
  await expect(page.getByRole('heading', { name: 'Chest press declinata alla macchina', exact: true })).toBeVisible()
  await expect(page.getByText('Nome nel CSV: Decline Bench Press (Machine)', { exact: true })).toBeVisible()
  await page.reload()
  await navigate(page, 'Progressi')
  await page.getByLabel('Esercizio del grafico').selectOption('barbell-bench')
  await expect(page.locator('.chart-point')).toHaveCount(2)
  await page.locator('.weight-chart svg').focus()
  await page.locator('.weight-chart svg').press('End')
  await expect(page.locator('.chart-detail-value')).toHaveText('60 kg')
  await page.getByLabel('Esercizio del grafico').selectOption('machine-decline-chest-press')
  await expect(page.locator('.chart-point')).toHaveCount(1)
  await page.getByRole('button', { name: 'Successivo', exact: true }).click()
  await expect(page.locator('.chart-detail-value')).toHaveText('120 kg')
  await selectRepair(page)
  await expect(page.locator('.toast')).toContainText('archivio vuoto')
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY)).toEqual(repaired)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(errors).toEqual([])
})

test('new CSV imports preserve source names and distinct exercise weights', async ({ page }) => {
  await open(page, emptyData())
  await selectRepair(page)
  await expect(page.locator('.history-card')).toHaveCount(1)
  await page.locator('.history-card > summary').click()
  await expect(page.getByText('Nome nel CSV: Decline Bench Press (Machine)', { exact: true })).toBeVisible()
  await expect(page.getByText('Nome nel CSV: Bench Press (Barbell)', { exact: true })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.reload()
  await navigate(page, 'Progressi')
  await expect(page.getByLabel('Esercizio del grafico').locator('option')).toHaveCount(2)
})

test('unrelated CSV files and changes in another tab cannot overwrite history through repair', async ({ page, context }) => {
  const original = oldData()
  await open(page, original)
  await selectRepair(page, { ...file, buffer: Buffer.from(csv.replaceAll('Seduta esempio', 'Seduta differente')) })
  await expect(page.getByRole('status')).toContainText('Nessuna vecchia seduta corrisponde')
  await expect(page.getByRole('button', { name: 'Applica correzione' })).toHaveCount(0)
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY)).toEqual(original)
  await page.getByLabel('Backup JSON o CSV allenamenti').setInputFiles(file)
  await expect(page.getByRole('button', { name: 'Applica correzione' })).toBeDisabled()
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Esporta backup prima della correzione' }).click()
  await downloading
  await expect(page.getByRole('button', { name: 'Applica correzione' })).toBeEnabled()
  const other = await context.newPage()
  await other.goto('/')
  const updated = { ...original, settings: { ...original.settings, minutes: 120 } }
  await other.evaluate(({ key, data }) => localStorage.setItem(key, JSON.stringify(data)), { key: STORAGE_KEY, data: updated })
  await expect(page.getByRole('button', { name: 'Applica correzione' })).toBeDisabled()
  await page.getByRole('button', { name: 'Annulla', exact: true }).click()
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY)).toEqual(updated)
})
