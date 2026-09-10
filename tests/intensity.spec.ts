import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { DEFAULT_SETTINGS, estimatePlanSeconds, getExercise, validatePlan } from '../src/domain'
import type { WorkoutPlan } from '../src/domain'
import { emptyData, isAppData, STORAGE_KEY } from '../src/storage'
import type { AppData } from '../src/storage'

async function navigate(page: Page, name: string) {
  const mobile = page.locator('.mobile-navigation')
  await (await mobile.isVisible() ? mobile : page.locator('.desktop-navigation')).getByRole('button', { name, exact: true }).click()
}

async function saved(page: Page): Promise<AppData> {
  const data: unknown = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY)
  if (!isAppData(data)) throw new Error('The saved workout must remain compatible with browser storage.')
  return data
}

function fixture(): WorkoutPlan {
  return {
    id: 'intensity-fixture', name: 'Focus e complementi', createdAt: new Date().toISOString(),
    settings: { ...structuredClone(DEFAULT_SETTINGS), minutes: 45, muscles: ['chest', 'biceps', 'triceps'], goal: 'hypertrophy', level: 'intermediate', equipment: 'gym', optimizeTime: false },
    warmupSeconds: 300, reserveSeconds: 90,
    exercises: [
      { id: 'focus', exerciseId: 'barbell-bench', sets: 2, repMin: 5, repMax: 8, restSeconds: 180, rir: 2, targetLoad: null },
      { id: 'curl', exerciseId: 'db-curl', sets: 2, repMin: 10, repMax: 15, restSeconds: 90, rir: 2, targetLoad: null },
      { id: 'triceps', exerciseId: 'cable-triceps', sets: 2, repMin: 10, repMax: 15, restSeconds: 90, rir: 2, targetLoad: null },
    ],
  }
}

async function seed(page: Page, plan = fixture()) {
  expect(validatePlan(plan)).toEqual([])
  await page.goto('/')
  await page.evaluate(({ key, data }) => localStorage.setItem(key, JSON.stringify(data)), { key: STORAGE_KEY, data: { ...emptyData(), settings: plan.settings, draft: plan } })
  await page.reload()
  await navigate(page, 'Allenamento')
}

test('time optimization is opt-in, generates a budgeted plan and survives reload', async ({ page }) => {
  await page.goto('/')
  await navigate(page, 'Allenamento')
  await page.getByRole('button', { name: 'Crea allenamento', exact: true }).click()
  await expect(page.getByLabel('Ottimizza il tempo', { exact: true })).not.toBeChecked()
  await page.getByLabel('Ottimizza il tempo', { exact: true }).check()
  await page.locator('.duration-option').filter({ hasText: /^30/ }).click()
  for (const button of await page.locator('.muscle-options button').all()) {
    if (await button.getAttribute('aria-pressed') === 'true') await button.click()
  }
  await page.locator('.muscle-options').getByRole('button', { name: 'Bicipiti', exact: true }).click()
  await page.locator('.muscle-options').getByRole('button', { name: 'Tricipiti', exact: true }).click()
  await page.getByRole('button', { name: /^Ipertrofia/ }).click()
  await page.getByRole('button', { name: 'Genera allenamento', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Inizia allenamento' })).toBeEnabled()
  expect(await page.locator('.toast').evaluate((element) => element.getBoundingClientRect().height < innerHeight * 0.4)).toBe(true)
  const data = await saved(page)
  expect(data.draft!.settings.optimizeTime).toBe(true)
  expect(data.draft!.exercises.some((item) => item.technique || item.supersetGroup)).toBe(true)
  expect(validatePlan(data.draft!)).toEqual([])
  expect(estimatePlanSeconds(data.draft!)).toBeLessThanOrEqual(30 * 60)
  await page.reload()
  await navigate(page, 'Allenamento')
  await page.getByRole('button', { name: 'Configura', exact: true }).click()
  await expect(page.getByLabel('Ottimizza il tempo', { exact: true })).toBeChecked()
})

for (const technique of ['drop-set', 'rest-pause'] as const) {
  test(`${technique} logs its mini-set separately, restores the timer, and cascades undo`, async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-09-09T12:00:00Z'))
    await seed(page)
    await page.getByRole('button', { name: 'Modifica Curl con manubri', exact: true }).click()
    await page.getByRole('combobox', { name: 'Tecnica ultima serie', exact: true }).selectOption(technique)
    await page.getByRole('button', { name: 'Salva modifiche', exact: true }).click()
    expect((await saved(page)).draft!.exercises[1].technique).toBe(technique)
    await page.getByRole('button', { name: 'Inizia allenamento', exact: true }).click()
    const card = page.locator('.session-card').filter({ has: page.getByRole('heading', { name: 'Curl con manubri', exact: true }) })
    const regular = card.locator('.set-row[data-part="regular"]')
    const mini = card.locator('.mini-set')
    await expect(mini.getByRole('button')).toBeDisabled()
    await expect(mini.getByRole('spinbutton').nth(1)).toHaveAttribute('max', '50')
    for (let index = 0; index < 2; index++) {
      await regular.nth(index).getByRole('spinbutton').nth(0).fill('20')
      await regular.nth(index).getByRole('spinbutton').nth(1).fill('10')
      await regular.nth(index).getByRole('spinbutton').nth(2).fill('2')
      await regular.nth(index).getByRole('button').click()
    }
    await expect(page.locator('.rest-clock')).toHaveText('0:20')
    await expect(card.locator('.inline-recovery')).toContainText('0:20')
    const end = (await saved(page)).restEndsAt
    await page.reload()
    await expect(page.locator('.rest-clock')).toHaveText('0:20')
    expect((await saved(page)).restEndsAt).toBe(end)
    await expect(mini.getByRole('spinbutton').nth(0)).toHaveValue(technique === 'drop-set' ? '15' : '20')
    await mini.getByRole('spinbutton').nth(1).fill(technique === 'drop-set' ? '8' : '4')
    await mini.getByRole('button').click()
    expect((await saved(page)).active!.logs).toHaveLength(3)
    await page.reload()
    await expect(card.locator('.set-complete')).toHaveCount(3)
    await regular.nth(1).getByRole('button').click()
    expect((await saved(page)).active!.logs).toHaveLength(1)
    await expect(mini.getByRole('button')).toBeDisabled()
    await regular.nth(1).getByRole('button').click()
    await mini.getByRole('button').click()
    expect((await saved(page)).active!.logs.filter((log) => log.part)).toHaveLength(1)
    await page.getByRole('button', { name: 'Salva allenamento', exact: true }).click()
    await page.getByRole('button', { name: 'Salva e termina', exact: true }).click()
    await expect(page.locator('.history-title')).toContainText('2 serie + 1 mini-serie')
    await page.locator('.history-card > summary').click()
    await expect(page.getByText(technique === 'drop-set' ? 'Serie 2 / Drop set' : 'Serie 2 / Rest-pause', { exact: true })).toBeVisible()
    await page.reload()
    await navigate(page, 'Progressi')
    await page.getByRole('button', { name: 'Volume della serie', exact: true }).click()
    await expect(page.locator('.chart-point')).toHaveCount(3)
    await page.locator('.weight-chart svg').focus()
    await page.keyboard.press('End')
    await expect(page.locator('.chart-detail')).toContainText(technique === 'drop-set' ? 'Drop set' : 'Rest-pause')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}

test('supersets alternate A/B, apply transition and round recovery, and resume correctly', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-09T12:00:00Z'))
  await seed(page)
  await page.getByRole('button', { name: 'Modifica Curl con manubri', exact: true }).click()
  await page.getByRole('combobox', { name: 'Superserie con', exact: true }).selectOption('triceps')
  await page.getByRole('button', { name: 'Salva modifiche', exact: true }).click()
  const data = await saved(page)
  expect(data.draft!.exercises[1].supersetGroup).toBeTruthy()
  expect(data.draft!.exercises[2].supersetGroup).toBe(data.draft!.exercises[1].supersetGroup)
  await page.getByRole('button', { name: 'Inizia allenamento', exact: true }).click()
  const card = page.locator('.superset-card')
  await expect(card.locator('.paired-set-label')).toHaveText([
    'A1 / Curl con manubri', 'B1 / Estensioni tricipiti al cavo',
    'A2 / Curl con manubri', 'B2 / Estensioni tricipiti al cavo',
  ])
  const rows = card.locator('.set-row')
  await expect(rows.nth(1).getByRole('button')).toBeDisabled()
  await rows.nth(0).getByRole('spinbutton').nth(0).fill('20')
  await rows.nth(0).getByRole('button').click()
  await expect(page.locator('.rest-clock')).toHaveText('0:30')
  await page.reload()
  await expect(rows.nth(1).getByRole('button')).toBeEnabled()
  await expect(rows.nth(2).getByRole('button')).toBeDisabled()
  await rows.nth(1).getByRole('spinbutton').nth(0).fill('30')
  await rows.nth(1).getByRole('button').click()
  await expect(page.locator('.rest-clock')).toHaveText('1:30')
  await expect(rows.nth(2).getByRole('button')).toBeEnabled()
  expect((await saved(page)).active!.logs.map((log) => log.planExerciseId)).toEqual(['curl', 'triceps'])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('changing series, substituting, and removing exercises dissolve paired links safely', async ({ page }) => {
  const plan = fixture()
  plan.exercises[1].supersetGroup = 'pair'
  plan.exercises[2].supersetGroup = 'pair'
  await seed(page, plan)
  await page.getByRole('button', { name: 'Aggiungi una serie a Curl con manubri', exact: true }).click()
  expect((await saved(page)).draft!.exercises.every((item) => !item.supersetGroup)).toBe(true)
  await seed(page, plan)
  await page.getByRole('button', { name: 'Sostituisci Curl con manubri', exact: true }).click()
  await page.locator('.substitution-option').first().click()
  let data = await saved(page)
  expect(data.draft!.exercises.every((item) => !item.supersetGroup)).toBe(true)
  expect(data.draft!.exercises[1].exerciseId).not.toBe('db-curl')
  await seed(page, plan)
  await page.getByRole('button', { name: `Modifica ${getExercise(plan.exercises[1].exerciseId).name}`, exact: true }).click()
  await page.getByRole('button', { name: 'Rimuovi', exact: true }).click()
  data = await saved(page)
  expect(data.draft!.exercises.every((item) => !item.supersetGroup)).toBe(true)
  await expect(page.getByRole('button', { name: 'Inizia allenamento', exact: true })).toBeDisabled()
  await expect(page.getByRole('alert')).toContainText('Bicipiti')
  await page.reload()
  expect((await saved(page)).draft!.exercises).toHaveLength(2)
})

test('removing the original focus clears an incompatible technique on the new focus without corrupting storage', async ({ page }) => {
  const plan = fixture()
  plan.settings.muscles = ['biceps', 'triceps']
  plan.exercises = [
    { ...plan.exercises[1], id: 'focus' },
    { ...plan.exercises[1], exerciseId: 'db-hammer-curl', technique: 'rest-pause' },
    plan.exercises[2],
  ]
  await seed(page, plan)
  await page.getByRole('button', { name: 'Modifica Curl con manubri', exact: true }).click()
  await page.getByRole('button', { name: 'Rimuovi', exact: true }).click()
  expect((await saved(page)).draft!.exercises[0].technique).toBeUndefined()
  await expect(page.getByRole('button', { name: 'Inizia allenamento', exact: true })).toBeEnabled()
  await page.reload()
  await navigate(page, 'Allenamento')
  await expect(page.getByRole('button', { name: 'Inizia allenamento', exact: true })).toBeEnabled()
})
