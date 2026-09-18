import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)

test('manifest defines a Pages-scoped standalone application and complete icons', async () => {
  const manifest = JSON.parse(await readFile(new URL('public/manifest.webmanifest', root), 'utf8'))
  assert.equal(manifest.id, '/tempofit/')
  assert.equal(manifest.start_url, '/tempofit/')
  assert.equal(manifest.scope, '/tempofit/')
  assert.equal(manifest.display, 'standalone')
  assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192' && icon.purpose === 'any'))
  assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512' && icon.purpose === 'any'))
  assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512' && icon.purpose === 'maskable'))
  await Promise.all(manifest.icons.map((icon) => readFile(new URL(`public/${icon.src}`, root))))
})

test('page exposes install metadata and production entry registers the scoped worker', async () => {
  const [html, main, worker] = await Promise.all([
    readFile(new URL('index.html', root), 'utf8'),
    readFile(new URL('src/main.tsx', root), 'utf8'),
    readFile(new URL('public/service-worker.js', root), 'utf8'),
  ])
  assert.match(html, /rel="manifest" href="%BASE_URL%manifest\.webmanifest"/)
  assert.match(html, /apple-mobile-web-app-capable" content="yes"/)
  assert.match(html, /rel="apple-touch-icon"/)
  assert.match(main, /import\.meta\.env\.PROD/)
  assert.match(main, /import\.meta\.env\.BASE_URL.*service-worker\.js/)
  assert.match(worker, /request\.mode === 'navigate'/)
  assert.match(worker, /url\.origin !== self\.location\.origin/)
})
