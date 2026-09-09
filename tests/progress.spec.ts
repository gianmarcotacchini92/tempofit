import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { DEFAULT_SETTINGS } from '../src/domain'
import type { WorkoutSession } from '../src/domain'
import { emptyData, STORAGE_KEY } from '../src/storage'

const today = new Date(2026, 8, 9, 18)
function session(id: string, date: Date, exerciseId = 'barbell-bench', weights: Array<number | null> = [80, 70]): WorkoutSession {
  return {
    id, startedAt: date.toISOString(), finishedAt: date.toISOString(),
    plan: { id, name: `Workout ${id}`, createdAt: date.toISOString(), settings: DEFAULT_SETTINGS, warmupSeconds: 300, reserveSeconds: 90,
      exercises: [{ id: 'entry', exerciseId, sets: weights.length, repMin: 3, repMax: 10, restSeconds: 120, rir: 2, targetLoad: 200 }] },
    logs: weights.map((weight, setIndex) => ({ id: `${id}-${setIndex}`, planExerciseId: 'entry', setIndex, weight, reps: setIndex === 0 ? 3 : 10, rir: setIndex === 0 ? null : 1.5, completedAt: date.toISOString() })),
  }
}

async function openProgress(page: Page, history: WorkoutSession[]) {
  await page.clock.setFixedTime(today)
  await page.goto('/')
  await page.evaluate(({ key, data }) => localStorage.setItem(key, JSON.stringify(data)), { key: STORAGE_KEY, data: { ...emptyData(), history } })
  await page.reload()
  const mobile = page.locator('.mobile-navigation')
  await (await mobile.isVisible() ? mobile : page.locator('.desktop-navigation')).getByRole('button', { name: 'Progressi', exact: true }).click()
}

test('progress ranges include every session, and metric buttons show heaviest weight, set volume and estimated 1RM', async ({ page, isMobile }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const history = [
    ...Array.from({ length: 12 }, (_, index) => session(`recent-${index}`, new Date(2026, 7, index + 1))),
    session('four-months', new Date(2026, 4, 1)),
    session('eight-months', new Date(2026, 0, 1)),
    session('old', new Date(2024, 0, 1)),
  ].reverse()
  await openProgress(page, history)
  const stored = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)
  const periods = page.getByRole('group', { name: 'Periodo del grafico' })
  const metrics = page.getByRole('group', { name: 'Metrica del grafico' })
  await expect(periods.getByRole('button', { name: '3 mesi', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.chart-point')).toHaveCount(12)
  for (const [label, count] of [['6 mesi', 13], ['1 anno', 14], ['Max', 15]] as const) {
    await periods.getByRole('button', { name: label, exact: true }).click()
    await expect(page.locator('.chart-point')).toHaveCount(count)
    await expect(periods.getByRole('button', { name: label, exact: true })).toHaveAttribute('aria-pressed', 'true')
  }
  await expect(page.locator('.chart-summary')).toContainText('15 sessioni / 15 carichi massimi / tutto lo storico')
  await expect(page.locator('.chart-summary')).toContainText('Un punto per sessione')
  const first = page.locator('.chart-point').first()
  if (isMobile) await first.tap()
  else await first.hover()
  await expect(page.locator('.chart-detail')).toContainText('Serie 1')
  await expect(page.locator('.chart-detail-value')).toHaveText('80 kg')
  await expect(page.locator('.chart-detail')).toContainText('240 kg × rip.')
  await expect(page.locator('.chart-detail')).toContainText('RIR--')
  await page.getByRole('button', { name: 'Successivo', exact: true }).click()
  await expect(page.locator('.chart-detail')).toContainText('Workout eight-months')
  await expect(page.locator('.chart-detail-value')).toHaveText('80 kg')
  await metrics.getByRole('button', { name: 'Volume della serie', exact: true }).click()
  await expect(page.locator('.chart-point')).toHaveCount(30)
  await expect(page.locator('.chart-detail')).not.toContainText('Workout eight-months')
  await expect(page.locator('.chart-summary')).toContainText('Un punto per serie')
  const chart = page.locator('.weight-chart svg')
  await chart.focus()
  await chart.press('Home')
  await expect(page.locator('.chart-detail-value')).toHaveText('240 kg × rip.')
  await chart.press('ArrowRight')
  await expect(page.locator('.chart-detail-value')).toHaveText('700 kg × rip.')
  await expect(page.locator('.chart-detail')).toContainText('Serie 2')
  await expect(page.locator('.chart-detail')).toContainText('70 kg')
  await expect(page.locator('.chart-detail')).toContainText('1,5')
  await chart.press('End')
  await expect(page.getByRole('button', { name: 'Successivo', exact: true })).toBeDisabled()
  await chart.press('Escape')
  await expect(page.locator('.chart-detail')).toContainText('Passa sul grafico')
  await metrics.getByRole('button', { name: 'Carico massimale', exact: true }).click()
  await expect(page.locator('.chart-point')).toHaveCount(15)
  await page.getByRole('button', { name: 'Successivo', exact: true }).click()
  await expect(page.locator('.chart-detail-value')).toHaveText('93,3 kg stimati')
  await expect(page.locator('.chart-detail')).toContainText('70 kg')
  await expect(page.locator('.chart-detail')).toContainText('Serie 2')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(stored)
  expect(errors).toEqual([])
})

test('progress handles old-only data, a single zero, missing weight, and unsupported bodyweight estimates', async ({ page, isMobile }) => {
  await openProgress(page, [
    session('old', new Date(2024, 0, 1), 'barbell-bench', [20.25, 17.5]),
    session('bodyweight', new Date(2026, 8, 1), 'pull-up', [0, null]),
  ])
  await expect(page.getByText('Nessun dato per questa selezione.')).toBeVisible()
  await page.getByRole('button', { name: 'Max', exact: true }).click()
  await expect(page.locator('.chart-point')).toHaveCount(1)
  await page.getByRole('button', { name: 'Successivo', exact: true }).click()
  await expect(page.locator('.chart-detail-value')).toHaveText('20,25 kg')
  await expect(page.locator('.chart-detail')).toContainText('60,75 kg × rip.')
  await page.getByLabel('Esercizio del grafico').selectOption('pull-up')
  await expect(page.locator('.chart-point')).toHaveCount(1)
  if (isMobile) await page.locator('.chart-point').tap()
  else await page.locator('.chart-point').hover()
  await expect(page.locator('.chart-detail-value')).toHaveText('0 kg')
  await page.getByRole('button', { name: 'Carico massimale', exact: true }).click()
  await expect(page.getByText('Nessun dato per questa selezione.')).toBeVisible()
  await expect(page.locator('.chart-point')).toHaveCount(0)
  await expect(page.getByText(/Il massimale non viene stimato senza il carico totale/)).toBeVisible()
  await page.getByRole('button', { name: 'Volume della serie', exact: true }).click()
  await expect(page.locator('.chart-point')).toHaveCount(1)
  await page.getByRole('button', { name: 'Successivo', exact: true }).click()
  await expect(page.locator('.chart-detail-value')).toHaveText('0 kg × rip.')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
