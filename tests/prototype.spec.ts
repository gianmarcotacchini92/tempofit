import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { DEFAULT_SETTINGS, generatePlan } from '../src/domain'
import { emptyData } from '../src/storage'

async function generate(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Crea allenamento', exact: true }).click()
  await page.locator('.duration-option').filter({ hasText: '30' }).click()
  await page.getByRole('button', { name: 'Genera allenamento' }).click()
  await expect(page.getByRole('button', { name: 'Inizia allenamento' })).toBeEnabled()
}

async function navigate(page: Page, name: string) {
  const mobile = page.locator('.mobile-navigation')
  if (await mobile.isVisible()) await mobile.getByRole('button', { name, exact: true }).click()
  else await page.locator('.desktop-navigation').getByRole('button', { name, exact: true }).click()
}

for (const [screen, button] of [
  ['Panoramica', 'Crea allenamento'],
  ['Allenamento', 'Crea allenamento'],
  ['Storico', 'Nuovo workout'],
  ['Storico', 'Crea il primo allenamento'],
]) {
  test(`workout creation from ${screen}: ${button} does not copy the click event`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('/')
    await navigate(page, screen)
    await page.getByRole('button', { name: button, exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Facciamo spazio al tuo allenamento.' })).toBeVisible()
    await page.getByRole('button', { name: 'Genera allenamento', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Inizia allenamento', exact: true })).toBeEnabled()
    expect(errors).toEqual([])
    const settings = await page.evaluate(() => JSON.parse(localStorage.getItem('tempofit.local.v1')!).draft.settings)
    expect(settings).not.toHaveProperty('nativeEvent')
    expect(settings).not.toHaveProperty('currentTarget')
  })
}

test('dashboard is original, empty, responsive, and has working navigation', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Trova il tuo ritmo.' })).toBeVisible()
  await expect(page.locator('.metric-value').first()).toHaveText('0')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await navigate(page, 'Esercizi')
  await page.getByRole('textbox', { name: 'Cerca esercizio' }).fill('zzzz-non-esiste')
  await expect(page.getByText('Nessun esercizio trovato.')).toBeVisible()
  await navigate(page, 'Progressi')
  await expect(page.getByText('Niente numeri inventati.')).toBeVisible()
  expect(errors).toEqual([])
})

test('generate, log, restore timer, undo, finish partial session, and show real progress', async ({ page }) => {
  await generate(page)
  const budget = await page.evaluate(() => JSON.parse(localStorage.getItem('tempofit.local.v1')!).draft.settings.minutes)
  expect(budget).toBe(30)
  await page.getByRole('button', { name: 'Inizia allenamento' }).click()
  await page.locator('.set-row').first().getByRole('spinbutton').nth(0).fill('40')
  await page.locator('.set-row').first().getByRole('spinbutton').nth(1).fill('5')
  await page.locator('.set-row').first().getByRole('spinbutton').nth(2).fill('2')
  await page.locator('.set-row').first().getByRole('button').click()
  await expect(page.locator('.set-complete')).toHaveCount(1)
  const end = await page.evaluate(() => JSON.parse(localStorage.getItem('tempofit.local.v1')!).restEndsAt)
  expect(end).toBeGreaterThan(Date.now())
  await page.reload()
  await expect(page.locator('.set-complete')).toHaveCount(1)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tempofit.local.v1')!).restEndsAt)).toBe(end)
  await page.locator('.set-complete').getByRole('button').click()
  await expect(page.locator('.set-complete')).toHaveCount(0)
  await page.locator('.set-row').first().getByRole('spinbutton').nth(0).fill('40')
  await page.locator('.set-row').first().getByRole('button').click()
  await page.getByRole('button', { name: 'Salva allenamento', exact: true }).click()
  await page.getByRole('button', { name: 'Salva e termina' }).click()
  await expect(page.locator('.history-card')).toHaveCount(1)
  await expect(page.getByText('Parziale', { exact: true })).toBeVisible()
  await page.locator('.history-card > summary').click()
  await expect(page.getByText(/40 kg/)).toBeVisible()
  await page.reload()
  await navigate(page, 'Storico')
  await expect(page.locator('.history-card')).toHaveCount(1)
  await navigate(page, 'Progressi')
  await expect(page.locator('.weight-chart svg')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('substitutions work and over-budget edits block starting', async ({ page }) => {
  await generate(page)
  const firstName = await page.locator('.exercise-card-title h3').first().textContent()
  await page.getByRole('button', { name: /^Sostituisci / }).first().click()
  await page.locator('.substitution-option').first().click()
  await expect(page.locator('.exercise-card-title h3').first()).not.toHaveText(firstName!)
  await page.getByRole('button', { name: /^Modifica / }).first().click()
  await page.getByLabel('Serie', { exact: true }).fill('4')
  await page.getByLabel('Recupero (secondi)').fill('300')
  await page.getByRole('button', { name: 'Salva modifiche' }).click()
  await expect(page.getByRole('button', { name: 'Inizia allenamento' })).toBeDisabled()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('tempo disponibile')
})

test('incompatible exclusions show a real failure instead of an invented workout', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Crea allenamento', exact: true }).click()
  await page.locator('.advanced-options > summary').click()
  for (const checkbox of await page.locator('.check-grid input').all()) await checkbox.check()
  await page.getByRole('button', { name: 'Genera allenamento' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('alert')).toBeVisible()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tempofit.local.v1')!).draft)).toBeNull()
})

test('corrupt local data is not overwritten', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.setItem('tempofit.local.v1', '{broken-json'))
  await page.reload()
  await expect(page.getByRole('alert')).toContainText('salvataggio locale')
  expect(await page.evaluate(() => localStorage.getItem('tempofit.local.v1'))).toBe('{broken-json')
})

test('90-minute plans show multiple exercises per muscle and retain edits after reload', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Crea allenamento', exact: true }).click()
  await page.locator('.duration-option').filter({ hasText: '90' }).click()
  await page.getByRole('button', { name: 'Genera allenamento' }).click()
  await expect(page.getByRole('button', { name: 'Inizia allenamento' })).toBeEnabled()
  await expect(page.locator('.exercise-card')).toHaveCount(6)
  await expect(page.locator('.plan-summary .tag').filter({ hasText: 'Petto' })).toContainText('3 esercizi')
  await expect(page.locator('.plan-summary .tag').filter({ hasText: 'Schiena' })).toContainText('3 esercizi')
  const id = await page.evaluate(() => JSON.parse(localStorage.getItem('tempofit.local.v1')!).draft.id)
  await page.getByRole('button', { name: /^Togli una serie/ }).first().click()
  const series = await page.locator('.prescription').first().innerText()
  await page.reload()
  await navigate(page, 'Allenamento')
  await expect(page.locator('.exercise-card')).toHaveCount(6)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tempofit.local.v1')!).draft.id)).toBe(id)
  await expect(page.locator('.prescription').first()).toHaveText(series, { useInnerText: true })
})

test('limited equipment explains why a long budget is not filled with duplicate rows', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Crea allenamento', exact: true }).click()
  await page.locator('.duration-option').filter({ hasText: '90' }).click()
  await page.locator('.muscle-options button').filter({ hasText: 'Petto' }).click()
  await page.getByRole('combobox', { name: 'Attrezzatura', exact: true }).selectOption('dumbbells')
  await page.getByRole('button', { name: 'Genera allenamento' }).click()
  await expect(page.locator('.exercise-card')).toHaveCount(1)
  await expect(page.getByRole('note')).toContainText('varianti compatibili')
  await expect(page.getByRole('note')).toContainText('90 minuti')
})

test('120-minute workouts keep two-minute minimum rests and optional accessories across reload', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Crea allenamento', exact: true }).click()
  await page.locator('.duration-option').filter({ hasText: '120' }).click()
  await page.getByLabel('Recupero minimo tra le serie').selectOption('120')
  await expect(page.getByLabel('Aggiungi accessori per gruppi collegati')).not.toBeChecked()
  await page.getByLabel('Aggiungi accessori per gruppi collegati').check()
  await page.getByRole('button', { name: 'Genera allenamento' }).click()
  await expect(page.getByRole('button', { name: 'Inizia allenamento' })).toBeEnabled()
  await expect(page.locator('.exercise-card')).toHaveCount(8)
  await expect(page.locator('.plan-summary .tag').filter({ hasText: '(accessorio)' })).toHaveCount(2)
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('tempofit.local.v1')!))
  expect(saved.draft.settings.minutes).toBe(120)
  expect(saved.draft.settings.minRestSeconds).toBe(120)
  expect(saved.draft.exercises.every((item: { restSeconds: number }) => item.restSeconds >= 120)).toBe(true)
  await page.getByRole('button', { name: /^Modifica / }).last().click()
  await expect(page.getByLabel('Recupero (secondi)')).toHaveAttribute('min', '120')
  await page.getByLabel('Recupero (secondi)').fill('90')
  await page.getByRole('button', { name: 'Salva modifiche' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Chiudi finestra' }).click()
  await page.reload()
  await navigate(page, 'Allenamento')
  await page.getByRole('button', { name: 'Configura', exact: true }).click()
  await expect(page.getByLabel('Recupero minimo tra le serie')).toHaveValue('120')
  await expect(page.getByLabel('Aggiungi accessori per gruppi collegati')).toBeChecked()
  await page.getByLabel('Aggiungi accessori per gruppi collegati').uncheck()
  await page.getByRole('button', { name: 'Genera allenamento' }).click()
  await expect(page.locator('.exercise-card')).toHaveCount(6)
  await expect(page.locator('.plan-summary .tag').filter({ hasText: '(accessorio)' })).toHaveCount(0)
})

test('separate arm groups and click order control the persisted focus and its workout guidance', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Crea allenamento', exact: true }).click()
  const muscles = page.locator('.muscle-options')
  await expect(muscles.getByRole('button', { name: /Glutei|Braccia/ })).toHaveCount(0)
  await expect(muscles.getByRole('button', { name: 'Bicipiti', exact: true })).toBeVisible()
  await expect(muscles.getByRole('button', { name: 'Tricipiti', exact: true })).toBeVisible()
  for (const button of await muscles.getByRole('button').all()) {
    if (await button.getAttribute('aria-pressed') === 'true') await button.click()
  }
  for (const name of ['Schiena', 'Petto', 'Tricipiti', 'Bicipiti']) await muscles.getByRole('button', { name, exact: true }).click()
  await expect(page.locator('.focus-selection')).toContainText('1. Schiena / 2. Petto / 3. Tricipiti / 4. Bicipiti')
  await expect(muscles.locator('.focus-chip')).toContainText('Schiena')
  await muscles.getByRole('button', { name: /Schiena/ }).click()
  await expect(page.locator('.focus-selection strong')).toHaveText('Focus: Petto')
  for (const button of await muscles.getByRole('button').all()) {
    if (await button.getAttribute('aria-pressed') === 'true') await button.click()
  }
  for (const name of ['Schiena', 'Petto']) await muscles.getByRole('button', { name, exact: true }).click()
  await page.locator('.duration-option').filter({ hasText: '60' }).click()
  await page.getByRole('button', { name: 'Genera allenamento' }).click()
  await expect(page.locator('.exercise-card').first().locator('.eyebrow')).toContainText('FOCUS')
  await expect(page.locator('.exercise-card').first().locator('.exercise-card-title p')).toContainText('Schiena')
  await expect(page.locator('.plan-summary .tag').filter({ hasText: 'Schiena' })).toContainText('3 esercizi')
  await expect(page.locator('.plan-summary .tag').filter({ hasText: 'Petto' })).toContainText('2 esercizi')
  await expect(page.locator('.progression-note')).toHaveCount(3)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.reload()
  await navigate(page, 'Allenamento')
  await page.getByRole('button', { name: 'Configura', exact: true }).click()
  await expect(page.locator('.focus-selection strong')).toHaveText('Focus: Schiena')
  await expect(muscles.locator('[aria-pressed="true"]')).toHaveCount(2)
  await page.getByRole('button', { name: 'Annulla', exact: true }).click()
  await page.getByRole('button', { name: 'Inizia allenamento' }).click()
  await expect(page.locator('.focus-selection strong')).toHaveText('Focus: Schiena')
  await expect(page.locator('.session-card').first().locator('.eyebrow')).toHaveText('FOCUS')
})

function oldTaxonomyBackup() {
  const result = generatePlan({ ...DEFAULT_SETTINGS, minutes: 90, muscles: ['biceps', 'triceps', 'legs'] })
  if (!result.plan) throw new Error(result.message)
  const plan = { ...result.plan, name: 'Braccia e glutei', settings: { ...result.plan.settings, muscles: ['arms', 'glutes', 'legs'] } }
  const startedAt = new Date(Date.now() - 300000).toISOString()
  const completedAt = new Date(Date.now() - 60000).toISOString()
  const active = {
    id: 'legacy-active', plan, startedAt, finishedAt: null,
    logs: plan.exercises.map((entry, index) => ({
      id: `legacy-log-${index}`, planExerciseId: entry.id, setIndex: 0,
      weight: 20, reps: 10, rir: 2, completedAt,
    })),
  }
  return {
    ...emptyData(), version: 1, settings: plan.settings, draft: plan, active,
    history: [{ ...active, id: 'legacy-finished', finishedAt: completedAt }],
    restEndsAt: Date.now() + 120000,
  }
}

for (const source of ['local storage', 'import']) {
  test(`legacy muscle migration from ${source} preserves live sets, history and timer`, async ({ page }) => {
    const legacy = oldTaxonomyBackup()
    await page.goto('/')
    if (source === 'local storage') {
      await page.evaluate((data) => localStorage.setItem('tempofit.local.v1', JSON.stringify(data)), legacy)
      await page.reload()
    } else {
      await page.getByRole('button', { name: 'Impostazioni e backup' }).click()
      await page.locator('input[type="file"]').setInputFiles({
        name: 'legacy-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(legacy)),
      })
    }
    await expect(page.locator('.set-complete')).toHaveCount(legacy.active.logs.length)
    const migrated = await page.evaluate(() => JSON.parse(localStorage.getItem('tempofit.local.v1')!))
    expect(migrated.version).toBe(3)
    expect(migrated.settings.muscles).toEqual(['biceps', 'triceps', 'legs'])
    expect(migrated.draft.settings.muscles).toEqual(['biceps', 'triceps', 'legs'])
    expect(migrated.active.plan.settings.muscles).toEqual(['biceps', 'triceps', 'legs'])
    expect(migrated.history[0].plan.settings.muscles).toEqual(['biceps', 'triceps', 'legs'])
    expect(migrated.active.logs).toEqual(legacy.active.logs)
    expect(migrated.active.plan.exercises).toEqual(legacy.active.plan.exercises)
    expect(migrated.history[0].logs).toEqual(legacy.history[0].logs)
    expect(migrated.history[0].plan.name).toBe('Braccia e glutei')
    expect(migrated.restEndsAt).toBe(legacy.restEndsAt)
    await page.reload()
    await expect(page.locator('.set-complete')).toHaveCount(legacy.active.logs.length)
    await navigate(page, 'Storico')
    await expect(page.locator('.history-card')).toHaveCount(1)
    await navigate(page, 'Esercizi')
    const muscleFilter = page.locator('.library-filters')
    await expect(muscleFilter.getByRole('button', { name: 'Bicipiti', exact: true })).toBeVisible()
    await expect(muscleFilter.getByRole('button', { name: 'Tricipiti', exact: true })).toBeVisible()
    await expect(muscleFilter.getByRole('button', { name: /^Glutei$|^Braccia$/ })).toHaveCount(0)
    await muscleFilter.getByRole('button', { name: 'Bicipiti', exact: true }).click()
    await expect(page.locator('.library-card')).not.toHaveCount(0)
    for (const label of await page.locator('.library-card-copy small').all()) await expect(label).toHaveText('Bicipiti')
  })
}
