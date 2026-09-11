import { test, expect } from '@playwright/test'
import type { BrowserContext, Page, Route } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { DEFAULT_SETTINGS, generatePlan } from '../src/domain'
import { emptyData } from '../src/storage'
import type { AppData } from '../src/storage'
import type { CloudSnapshot } from '../src/cloudModel'

class Backend {
  snapshots = new Map<string, CloudSnapshot>()
  writes: Array<{ uid: string; data: AppData }> = []
  holdA: Promise<void> | null = null
  async route(route: Route) {
    const request = route.request()
    const uid = decodeURIComponent(new URL(request.url()).pathname.split('/').at(-1)!)
    if (uid === 'a' && request.method() === 'GET' && this.holdA) await this.holdA
    const current = this.snapshots.get(uid) ?? { revision: null, data: null }
    if (request.method() === 'GET') { await route.fulfill({ json: current }); return }
    const value = request.postDataJSON()
    if (value.expectedRevision !== current.revision) { await route.fulfill({ status: 409, json: current }); return }
    const next = { revision: crypto.randomUUID(), data: value.data }
    this.snapshots.set(uid, next)
    this.writes.push({ uid, data: structuredClone(value.data) })
    await route.fulfill({ json: next })
  }
  connect(context: BrowserContext) { return context.route('**/__test_cloud/*', (route) => this.route(route)) }
}

function withActive(): AppData {
  const data = emptyData()
  const { plan } = generatePlan(DEFAULT_SETTINGS)
  if (!plan) throw new Error('Expected plan')
  data.active = { id: 'active-session', plan, startedAt: new Date().toISOString(), finishedAt: null, logs: [] }
  return data
}

async function seed(page: Page, data: AppData) {
  await page.addInitScript((value) => {
    if (localStorage.getItem('tempofit.local.v1') === null) localStorage.setItem('tempofit.local.v1', JSON.stringify(value))
  }, data)
}
async function openAccount(page: Page) {
  await page.getByRole('button', { name: 'Impostazioni e backup' }).click()
}
async function closeAccount(page: Page) {
  await page.getByRole('dialog').getByRole('button', { name: 'Chiudi finestra' }).click()
}
async function login(page: Page, uid = 'a') {
  await page.locator('#test-account').selectOption(uid)
  await openAccount(page)
  await page.getByRole('button', { name: 'Accedi con Google', exact: true }).click()
  await openAccount(page)
}
async function local(page: Page, uid = 'a'): Promise<AppData | null> {
  return page.evaluate((id) => {
    const raw = localStorage.getItem(`tempofit.account.v1.${id}`)
    return raw ? JSON.parse(raw).data : null
  }, uid)
}
async function logFirst(page: Page, weight: string) {
  const row = page.locator('.set-row').first()
  await row.getByRole('spinbutton').nth(0).fill(weight)
  await row.getByRole('spinbutton').nth(1).fill('5')
  await row.getByRole('button').click()
  await expect(page.locator('.set-complete')).toHaveCount(1)
}
async function deferFileRead(page: Page) {
  await page.evaluate(() => {
    const read = File.prototype.text
    File.prototype.text = function () {
      const readFile = read.bind(this)
      return new Promise<string>((resolve, reject) => {
        window.addEventListener('release-file', () => { void readFile().then(resolve, reject) }, { once: true })
      })
    }
  })
}

test('Google linking needs consent, syncs a second device and retains offline edits', async ({ page, context, browser }) => {
  const backend = new Backend()
  const downloads: string[] = []
  page.on('download', (file) => downloads.push(file.suggestedFilename()))
  await backend.connect(context)
  await seed(page, withActive())
  await page.goto('/tests/fixtures/cloud.html')
  await login(page)
  await expect(page.getByRole('button', { name: 'Attiva sincronizzazione di questa copia' })).toBeVisible()
  expect(backend.writes).toHaveLength(0)
  await page.getByRole('button', { name: 'Attiva sincronizzazione di questa copia' }).click()
  await expect(page.locator('.cloud-synced')).toBeVisible()
  await closeAccount(page)
  const other = await browser.newContext()
  try {
    await backend.connect(other)
    const second = await other.newPage()
    second.on('download', (file) => downloads.push(file.suggestedFilename()))
    await second.goto('http://127.0.0.1:5173/tests/fixtures/cloud.html')
    await login(second)
    await expect(second.locator('.cloud-synced')).toBeVisible()
    expect((await local(second))?.active?.id).toBe('active-session')
    await context.setOffline(true)
    await logFirst(page, '45')
    expect((await local(page))?.active?.logs[0].weight).toBe(45)
    expect(backend.snapshots.get('a')?.data?.active?.logs).toHaveLength(0)
    await context.setOffline(false)
    await expect.poll(() => backend.snapshots.get('a')?.data?.active?.logs[0]?.weight).toBe(45)
    await expect.poll(async () => (await local(second))?.active?.logs[0]?.weight).toBe(45)
    await page.reload()
    await expect(page.locator('.set-complete')).toHaveCount(1)
    expect((await local(page))?.active?.logs[0].weight).toBe(45)
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tempofit.local.v1')!).active.logs)).toHaveLength(0)
    expect(downloads).toEqual([])
  } finally { await other.close() }
})

test('account switching never imports the previous Google user into the next one', async ({ page, context }) => {
  const backend = new Backend()
  backend.snapshots.set('a', { revision: crypto.randomUUID(), data: withActive() })
  await backend.connect(context)
  await page.goto('/tests/fixtures/cloud.html')
  await login(page)
  await expect(page.locator('.cloud-synced')).toBeVisible()
  await page.getByRole('button', { name: 'Esci da Google', exact: true }).click()
  await login(page, 'b')
  await page.getByRole('button', { name: 'Attiva sincronizzazione di questa copia' }).click()
  await expect(page.locator('.cloud-synced')).toBeVisible()
  expect((await local(page, 'b'))?.active).toBeNull()
  expect(backend.snapshots.get('b')?.data).toEqual(emptyData())
  expect((await local(page, 'a'))?.active?.id).toBe('active-session')
  await page.getByRole('button', { name: 'Esci da Google', exact: true }).click()
  await login(page, 'a')
  await expect(page.locator('.cloud-synced')).toBeVisible()
  expect((await local(page, 'a'))?.active?.id).toBe('active-session')
})

test('concurrent live session changes require a choice and export a backup before replacement', async ({ page, context, browser }) => {
  const backend = new Backend()
  backend.snapshots.set('a', { revision: crypto.randomUUID(), data: withActive() })
  await backend.connect(context)
  await page.goto('/tests/fixtures/cloud.html')
  await login(page)
  await expect(page.locator('.cloud-synced')).toBeVisible()
  await closeAccount(page)
  await page.reload()
  const other = await browser.newContext()
  try {
    await backend.connect(other)
    const second = await other.newPage()
    await second.goto('http://127.0.0.1:5173/tests/fixtures/cloud.html')
    await login(second)
    await expect(second.locator('.cloud-synced')).toBeVisible()
    await closeAccount(second)
    await second.reload()
    await context.setOffline(true)
    await other.setOffline(true)
    await logFirst(page, '40')
    await logFirst(second, '50')
    await context.setOffline(false)
    await expect.poll(() => backend.snapshots.get('a')?.data?.active?.logs[0]?.weight).toBe(40)
    await other.setOffline(false)
    await openAccount(second)
    await expect(second.locator('.cloud-conflict')).toBeVisible()
    expect((await local(second))?.active?.logs[0].weight).toBe(50)
    await second.getByRole('button', { name: 'Usa la copia Firebase', exact: true }).click()
    const download = second.waitForEvent('download')
    await second.getByRole('button', { name: 'Esporta backup e conferma' }).click()
    const backup = await download
    const path = await backup.path()
    if (!path) throw new Error('Missing downloaded backup')
    expect(JSON.parse(await readFile(path, 'utf8')).active.logs[0].weight).toBe(50)
    await expect(second.locator('.cloud-synced')).toBeVisible()
    expect((await local(second))?.active?.logs[0].weight).toBe(40)
    expect(backend.snapshots.get('a')?.data?.active?.logs[0]?.weight).toBe(40)
  } finally { await other.close() }
})

test('a delayed response from the previous account cannot replace the new workspace', async ({ page, context }) => {
  const backend = new Backend()
  backend.snapshots.set('a', { revision: crypto.randomUUID(), data: withActive() })
  let release = () => {}
  backend.holdA = new Promise<void>((resolve) => { release = resolve })
  await backend.connect(context)
  await page.goto('/tests/fixtures/cloud.html')
  await login(page)
  await page.getByRole('button', { name: 'Esci da Google', exact: true }).click()
  await login(page, 'b')
  await page.getByRole('button', { name: 'Attiva sincronizzazione di questa copia' }).click()
  await expect(page.locator('.cloud-synced')).toBeVisible()
  backend.holdA = null
  release()
  await expect.poll(async () => (await local(page, 'b'))?.active).toBeNull()
  await page.reload()
  await openAccount(page)
  await expect(page.locator('.cloud-account-heading')).toContainText('Account b')
  expect((await local(page, 'b'))?.active).toBeNull()
  expect(backend.writes.some((entry) => entry.uid === 'b' && entry.data.active)).toBe(false)
})

test('a full imported-size history fits the local account cache without duplicating its baseline', async ({ page, context }) => {
  const backend = new Backend()
  await backend.connect(context)
  const source = withActive().active!
  const data = emptyData()
  for (let index = 0; index < 120; index++) data.history.push({
    ...structuredClone(source), id: `history-${index}`, finishedAt: new Date().toISOString(),
    plan: { ...structuredClone(source.plan), name: 'Synthetic history '.repeat(405) },
  })
  expect(JSON.stringify(data).length).toBeGreaterThan(1024 * 1024)
  await seed(page, data)
  await page.goto('/tests/fixtures/cloud.html')
  await login(page)
  await page.getByRole('button', { name: 'Attiva sincronizzazione di questa copia' }).click()
  await expect(page.locator('.cloud-synced')).toBeVisible()
  const sizes = await page.evaluate(() => ({
    guest: localStorage.getItem('tempofit.local.v1')!.length,
    account: localStorage.getItem('tempofit.account.v1.a')!.length,
  }))
  expect(sizes.account - sizes.guest).toBeLessThan(35000)
  expect(backend.snapshots.get('a')?.data?.history).toHaveLength(120)
  await page.reload()
  await openAccount(page)
  await expect(page.locator('.cloud-synced')).toBeVisible()
  expect((await local(page))?.history).toHaveLength(120)
})

test('a quota failure preserves in-memory work and exports it before signing out', async ({ page, context }) => {
  const backend = new Backend()
  backend.snapshots.set('a', { revision: crypto.randomUUID(), data: withActive() })
  await backend.connect(context)
  await page.goto('/tests/fixtures/cloud.html')
  await login(page)
  await expect(page.locator('.cloud-synced')).toBeVisible()
  await closeAccount(page)
  await page.reload()
  await expect(page.locator('.set-row').first()).toBeVisible()
  await page.evaluate(() => {
    const save = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('tempofit.account.v1.') && JSON.parse(value).data.active?.logs.length) throw new DOMException('Full storage', 'QuotaExceededError')
      save.call(this, key, value)
    }
  })
  await logFirst(page, '65')
  await expect(page.getByRole('alert')).toContainText('Salvataggio locale non riuscito')
  expect((await local(page))?.active?.logs).toHaveLength(0)
  await openAccount(page)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Esporta copia corrente ed esci' }).click()
  const file = await (await download).path()
  if (!file) throw new Error('Missing recovery export')
  expect(JSON.parse(await readFile(file, 'utf8')).active.logs[0].weight).toBe(65)
  await openAccount(page)
  await expect(page.getByRole('button', { name: 'Accedi con Google', exact: true })).toBeVisible()
  expect(backend.snapshots.get('a')?.data?.active?.logs).toHaveLength(0)
})

test('an import still reading during an account change is cancelled, not applied to the next user', async ({ page, context }) => {
  const backend = new Backend()
  backend.snapshots.set('a', { revision: crypto.randomUUID(), data: emptyData() })
  backend.snapshots.set('b', { revision: crypto.randomUUID(), data: emptyData() })
  await backend.connect(context)
  await page.goto('/tests/fixtures/cloud.html')
  await login(page)
  await expect(page.locator('.cloud-synced')).toBeVisible()
  await closeAccount(page)
  await page.locator('#test-account').selectOption('b')
  await openAccount(page)
  await deferFileRead(page)
  await page.locator('input[type=file]').setInputFiles({ name: 'workout.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(withActive())) })
  await page.getByRole('button', { name: 'Esci da Google', exact: true }).click()
  await openAccount(page)
  await page.getByRole('button', { name: 'Accedi con Google', exact: true }).click()
  await openAccount(page)
  await expect(page.locator('.cloud-synced')).toBeVisible()
  await page.evaluate(() => window.dispatchEvent(new Event('release-file')))
  await expect(page.getByText(/Cambio account in corso o completato: importazione annullata/)).toBeVisible()
  expect((await local(page, 'b'))?.active).toBeNull()
  expect(backend.snapshots.get('b')?.data?.active).toBeNull()
})

for (const source of ['cloud', 'browser tab']) test(`same-account ${source} changes invalidate an import that is still reading`, async ({ page, context }) => {
  const backend = new Backend()
  backend.snapshots.set('a', { revision: crypto.randomUUID(), data: emptyData() })
  await backend.connect(context)
  await page.goto('/tests/fixtures/cloud.html')
  await login(page)
  await expect(page.locator('.cloud-synced')).toBeVisible()
  await deferFileRead(page)
  await page.locator('input[type=file]').setInputFiles({ name: 'workout.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(withActive())) })
  const remote = withActive()
  remote.active!.id = 'remote-session'
  if (source === 'cloud') {
    backend.snapshots.set('a', { revision: crypto.randomUUID(), data: remote })
    await expect.poll(async () => (await local(page))?.active?.id).toBe('remote-session')
  } else await page.evaluate((data) => {
    const key = 'tempofit.account.v1.a'
    const copy = JSON.parse(localStorage.getItem(key)!)
    copy.data = data
    localStorage.setItem(key, JSON.stringify(copy))
    window.dispatchEvent(new StorageEvent('storage', { key, storageArea: localStorage }))
  }, remote)
  await page.evaluate(() => window.dispatchEvent(new Event('release-file')))
  await expect(page.getByText(/I dati sono cambiati durante la lettura: importazione annullata/)).toBeVisible()
  expect((await local(page))?.active?.id).toBe('remote-session')
  expect(backend.writes).toHaveLength(0)
})

test('account storage recovery cannot reset the retained guest archive', async ({ page, context }) => {
  const backend = new Backend()
  await backend.connect(context)
  await seed(page, withActive())
  await page.goto('/tests/fixtures/cloud.html')
  const guest = await page.evaluate(() => localStorage.getItem('tempofit.local.v1'))
  await login(page)
  await page.getByRole('button', { name: 'Attiva sincronizzazione di questa copia' }).click()
  await expect(page.locator('.cloud-synced')).toBeVisible()
  await closeAccount(page)
  await page.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: 'tempofit.account.v1.a', storageArea: localStorage })))
  await expect(page.getByRole('button', { name: 'Ripristina', exact: true })).toBeDisabled()
  await openAccount(page)
  await expect(page.getByRole('button', { name: 'Ripristina i dati locali', exact: true })).toBeDisabled()
  expect(await page.evaluate(() => localStorage.getItem('tempofit.local.v1'))).toBe(guest)
})

test('failed guest writes block login and an external auth switch waits for a recovery export', async ({ page, context }) => {
  const backend = new Backend()
  await backend.connect(context)
  await seed(page, withActive())
  await page.goto('/tests/fixtures/cloud.html')
  await expect(page.locator('.workspace-fields')).toHaveAttribute('aria-busy', 'false')
  await page.evaluate(() => {
    const save = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === 'tempofit.local.v1' && JSON.parse(value).active?.logs.length) throw new DOMException('Full storage', 'QuotaExceededError')
      save.call(this, key, value)
    }
  })
  await logFirst(page, '75')
  await openAccount(page)
  await expect(page.getByRole('button', { name: 'Accedi con Google', exact: true })).toBeDisabled()
  await page.evaluate(() => {
    localStorage.setItem('test.auth', 'b')
    window.dispatchEvent(new StorageEvent('storage', { key: 'test.auth', newValue: 'b', storageArea: localStorage }))
  })
  await openAccount(page)
  await expect(page.getByRole('button', { name: 'Esporta copia e completa cambio account' })).toBeVisible()
  expect(await local(page, 'b')).toBeNull()
  await expect(page.locator('.set-complete')).toHaveCount(1)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Esporta copia e completa cambio account' }).click()
  const file = await (await download).path()
  if (!file) throw new Error('Missing protected guest export')
  expect(JSON.parse(await readFile(file, 'utf8')).active.logs[0].weight).toBe(75)
  await expect.poll(async () => (await local(page, 'b'))?.active?.logs.length).toBe(0)
  expect(backend.writes).toHaveLength(0)
})
