import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { generatePlan, workoutSetSteps } from '../src/domain'
import type { WorkoutSession } from '../src/domain'
import { emptyData, STORAGE_KEY } from '../src/storage'

function session(id: string, name: string, startedAt: string, completedSets: number): WorkoutSession {
  const generated = generatePlan({ ...emptyData().settings, minutes: 90, muscles: ['shoulders', 'chest', 'biceps'], level: 'advanced' })
  if (!generated.plan) throw new Error(generated.error)
  const plan = { ...generated.plan, id: `${id}-plan`, name, createdAt: startedAt }
  const steps = workoutSetSteps(plan).filter((step) => !step.part).slice(0, completedSets)
  return {
    id,
    plan,
    startedAt,
    finishedAt: new Date(Date.parse(startedAt) + 58 * 60_000).toISOString(),
    logs: steps.map((step, index) => ({
      id: `${id}-log-${index}`,
      planExerciseId: step.item.id,
      setIndex: step.setIndex,
      weight: step.item.targetLoad,
      reps: step.repMin,
      rir: step.rir,
      completedAt: startedAt,
    })),
  }
}

async function openHistory(page: Page) {
  const mobile = page.locator('.mobile-navigation')
  await (await mobile.isVisible() ? mobile : page.locator('.desktop-navigation')).getByRole('button', { name: 'Storico', exact: true }).click()
}

test('deleting a selected partial workout preserves all unrelated workspace data', async ({ page }) => {
  const target = session('target', 'Spalle - Petto - Bicipiti', '2026-09-18T06:30:00.000Z', 11)
  const keep = session('keep', 'Seduta da conservare', '2026-09-17T06:30:00.000Z', 2)
  const state = { ...emptyData(), history: [target, keep], draft: structuredClone(keep.plan), active: { ...structuredClone(keep), id: 'active', finishedAt: null }, restEndsAt: Date.parse('2026-09-18T16:00:00.000Z') }
  await page.goto('/')
  await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: STORAGE_KEY, value: state })
  await page.reload()
  await openHistory(page)
  const card = page.locator('.history-card').filter({ has: page.getByRole('heading', { name: target.plan.name, exact: true }) })
  await card.locator('summary').click()
  await card.getByRole('button', { name: 'Elimina dallo storico', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Eliminare questo allenamento?' })
  await expect(dialog).toContainText('18 set 2026 / 58 min / 11 serie / Parziale')
  await dialog.getByRole('button', { name: 'Elimina allenamento', exact: true }).click()
  await expect(page.locator('.history-card')).toHaveCount(1)
  await expect(page.getByRole('heading', { name: target.plan.name, exact: true })).toHaveCount(0)
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY)
  expect(saved.history).toEqual([keep])
  expect(saved.draft).toEqual(state.draft)
  expect(saved.active).toEqual(state.active)
  expect(saved.restEndsAt).toBe(state.restEndsAt)
  await page.reload()
  await openHistory(page)
  await expect(page.locator('.history-card')).toHaveCount(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
