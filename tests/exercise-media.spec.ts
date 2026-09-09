import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { emptyData, STORAGE_KEY } from '../src/storage'
import { importWorkoutCsv } from '../src/csvImport'

async function navigate(page: Page, name: string) {
  const mobile = page.locator('.mobile-navigation')
  await (await mobile.isVisible() ? mobile : page.locator('.desktop-navigation')).getByRole('button', { name, exact: true }).click()
}

async function loaded(page: Page) {
  await expect(page.locator('.media-frame > img')).toBeVisible()
  await expect.poll(() => page.locator('.media-frame > img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true)
}

test('illustrations show exact variants, enlarge on tap, switch poses, and expose credits without remote requests', async ({ page }) => {
  const errors: string[] = []
  const remote: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => { if (/^https?:/.test(request.url()) && new URL(request.url()).hostname !== '127.0.0.1') remote.push(request.url()) })
  await page.goto('/')
  await navigate(page, 'Esercizi')
  const search = page.getByRole('textbox', { name: 'Cerca esercizio' })
  await search.fill('Panca piana con bilanciere')
  const card = page.locator('.library-card').first()
  await expect.poll(() => card.locator('img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true)
  await card.click()
  await loaded(page)
  const first = await page.locator('.media-frame > img').getAttribute('src')
  await expect(page.locator('.media-frame > img')).toHaveAttribute('alt', /Panca piana con bilanciere/)
  await page.getByRole('button', { name: 'Immagine 2', exact: true }).click()
  await loaded(page)
  await expect(page.locator('.media-frame > img')).not.toHaveAttribute('src', first!)
  await page.locator('.media-credits > summary').click()
  await expect(page.getByRole('link', { name: 'Everkinetic / Greg Priday', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'CC BY-SA 4.0', exact: true })).toHaveAttribute('href', 'https://creativecommons.org/licenses/by-sa/4.0/')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.keyboard.press('Escape')
  await expect(card).toBeFocused()
  await search.fill('Chest press declinata')
  await page.locator('.library-card').click()
  await loaded(page)
  await expect(page.locator('.media-frame > img')).toHaveAttribute('src', /everkinetic-0085-1\.svg$/)
  await expect(page.getByRole('button', { name: 'Immagine 1', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Chiudi finestra', exact: true }).click()
  await search.fill('Chest press iso-laterale')
  await page.locator('.library-card').click()
  await expect(page.getByText('Illustrazione non disponibile per questa variante.', { exact: true })).toBeVisible()
  await expect(page.locator('.media-frame img')).toHaveCount(0)
  expect(errors).toEqual([])
  expect(remote).toEqual([])
})

test('illustrations are available in the workout editor and active session without changing recorded data', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Crea allenamento', exact: true }).click()
  await page.getByRole('button', { name: 'Genera allenamento' }).click()
  const before = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)
  await page.getByRole('button', { name: 'Mostra illustrazione di Spinte inclinate con manubri', exact: true }).click()
  await loaded(page)
  await page.getByRole('button', { name: 'Chiudi finestra', exact: true }).click()
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(before)
  await page.getByRole('button', { name: 'Inizia allenamento' }).click()
  const active = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)
  await page.getByRole('button', { name: 'Mostra illustrazione di Spinte inclinate con manubri', exact: true }).click()
  await loaded(page)
  await page.getByRole('button', { name: 'Chiudi finestra', exact: true }).click()
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(active)
})

test('illustrations are accessible from corrected history and progress while legacy associations stay unillustrated', async ({ page }) => {
  const csv = ['title,start_time,end_time,exercise_title,set_index,set_type,weight_kg,reps,rpe',
    '"Esempio","8 set 2026, 11:09","8 set 2026, 13:07","Decline Bench Press (Machine)",0,normal,80,8,8'].join('\n')
  const imported = importWorkoutCsv(csv).data!
  const legacy = structuredClone(imported.history[0])
  legacy.id = 'imported-session-legacy'
  delete legacy.importSource
  legacy.plan.exercises[0].exerciseId = 'barbell-bench'
  await page.clock.setFixedTime(new Date(2026, 8, 9, 18))
  await page.goto('/')
  await page.evaluate(({ key, data }) => localStorage.setItem(key, JSON.stringify(data)), { key: STORAGE_KEY, data: { ...emptyData(), history: [...imported.history, legacy] } })
  await page.reload()
  await navigate(page, 'Storico')
  for (const summary of await page.locator('.history-card > summary').all()) await summary.click()
  await expect(page.getByRole('button', { name: 'Mostra illustrazione di Panca piana con bilanciere', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Mostra illustrazione di Panca piana con bilanciere', exact: true }).locator('img')).toHaveCount(0)
  await page.getByRole('button', { name: 'Mostra illustrazione di Chest press declinata alla macchina', exact: true }).click()
  await loaded(page)
  await page.getByRole('button', { name: 'Chiudi finestra', exact: true }).click()
  await navigate(page, 'Progressi')
  await page.getByRole('button', { name: 'Mostra illustrazione di Chest press declinata alla macchina', exact: true }).click()
  await loaded(page)
})

test('illustration loading failures are visible and can be retried without a different exercise image', async ({ page }) => {
  const pattern = '**/exercises/everkinetic-0042-1.svg'
  await page.route(pattern, (route) => route.abort())
  await page.goto('/')
  await navigate(page, 'Esercizi')
  await page.getByRole('textbox', { name: 'Cerca esercizio' }).fill('Panca piana con bilanciere')
  await page.locator('.library-card').click()
  await expect(page.getByRole('alert')).toContainText("Impossibile caricare l'illustrazione.")
  await page.unroute(pattern)
  await page.getByRole('button', { name: 'Riprova', exact: true }).click()
  await loaded(page)
  await expect(page.locator('.media-frame > img')).toHaveAttribute('src', /everkinetic-0042-1\.svg$/)
})
