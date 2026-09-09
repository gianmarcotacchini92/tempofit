import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { EXERCISES } from './domain.ts'
import { getExerciseMedia, mediaAssetUrl } from './exerciseMedia.ts'
import { MEDIA_SOURCES, MEDIA_REVISIONS } from './exerciseMediaSources.ts'

test('every curated illustration exists locally with pinned sources and reusable-license attribution', () => {
  const ids = new Set(EXERCISES.map((exercise) => exercise.id))
  for (const id of Object.keys(MEDIA_SOURCES)) {
    assert.ok(ids.has(id), id)
    const media = getExerciseMedia(id)
    assert.ok(media && media.frames.length > 0, id)
    for (const frame of media.frames) {
      assert.match(frame.file, /^[a-z0-9-]+\.(svg|png)$/)
      const path = new URL(`../public/exercises/${frame.file}`, import.meta.url)
      assert.ok(existsSync(path), frame.file)
      const bytes = readFileSync(path)
      if (frame.file.endsWith('.svg')) {
        assert.match(bytes.toString('utf8'), /<svg\b/)
        assert.doesNotMatch(bytes.toString('utf8'), /<script\b|<foreignObject\b|\bon\w+\s*=|(?:href|src)\s*=\s*["'](?:https?:|\/\/)/i)
      } else assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
      assert.ok(frame.creator && frame.creatorUrl && frame.changes)
      assert.equal(frame.licenseUrl, 'https://creativecommons.org/licenses/by-sa/4.0/')
      assert.ok(Object.values(MEDIA_REVISIONS).some((revision) => frame.sourceUrl.includes(revision)))
    }
  }
  assert.ok(existsSync(new URL('../public/exercises/LICENSE-CC-BY-SA-4.0.txt', import.meta.url)))
  const credits = JSON.parse(readFileSync(new URL('../public/exercises/ATTRIBUTION.json', import.meta.url), 'utf8'))
  assert.deepEqual(Object.keys(credits.images), Object.keys(MEDIA_SOURCES))
})

test('images never fall back to another variant and Pages URLs remain under the configured base', () => {
  const bench = getExerciseMedia('barbell-bench')
  const decline = getExerciseMedia('machine-decline-chest-press')
  assert.notEqual(bench.frames[0].file, decline.frames[0].file)
  assert.equal(decline.title, 'Decline Chest Press')
  assert.equal(getExerciseMedia('machine-iso-chest-press'), undefined)
  assert.equal(getExerciseMedia('db-floor-press'), undefined)
  // Rejected artwork depicted bodyweight, bilateral, straight-bar or seated variants.
  for (const id of ['db-bulgarian-split-squat', 'cable-single-arm-lateral-raise', 'ez-bar-curl', 'cable-crunch']) {
    assert.equal(getExerciseMedia(id), undefined, id)
  }
  assert.equal(getExerciseMedia('constructor'), undefined)
  assert.equal(mediaAssetUrl(decline.frames[0].file, '/tempofit/'), `/tempofit/exercises/${decline.frames[0].file}`)
  assert.equal(mediaAssetUrl(bench.frames[0].file, '/'), `/exercises/${bench.frames[0].file}`)
})
