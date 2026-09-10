import test from 'node:test'
import assert from 'node:assert/strict'
import { loggedSetsLabel, regularSetCount, setLabel } from './format.ts'

test('mini-sets are labelled separately without inflating regular set counts', () => {
  const first = { id: 'first', planExerciseId: 'curl', setIndex: 0, weight: 20, reps: 10, rir: 2, completedAt: '2026-09-09T10:00:00Z' }
  const second = { ...first, id: 'second', setIndex: 1 }
  const drop = { ...second, id: 'drop', part: 'drop', weight: 15, reps: 8 }
  assert.equal(regularSetCount([first, second, drop]), 2)
  assert.equal(loggedSetsLabel([first, second, drop]), '2 serie + 1 mini-serie')
  assert.equal(loggedSetsLabel([first, second]), '2 serie')
  assert.equal(setLabel(drop), 'Serie 2 / Drop set')
  assert.equal(setLabel({ ...drop, part: 'rest-pause' }), 'Serie 2 / Rest-pause')
  assert.equal(setLabel({ ...first, sourceSetIndex: 5 }), 'Serie 6')
  assert.equal(loggedSetsLabel([]), '0 serie')
})
