import assert from 'node:assert/strict'
import { test } from 'node:test'

import { loadTaskCsvColumns, saveTaskCsvColumns, TASK_CSV_COLUMN_OPTIONS, toggleTaskCsvColumn } from './taskCsvColumns.js'

class MemoryStorage {
  constructor() { this.store = new Map() }
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null }
  setItem(key, value) { this.store.set(key, String(value)) }
}

const ALL_INDICES = TASK_CSV_COLUMN_OPTIONS.map(o => o.index)

test('loadTaskCsvColumns defaults to all columns selected when nothing is stored', () => {
  assert.deepEqual(loadTaskCsvColumns(new MemoryStorage()), new Set(ALL_INDICES))
})

test('loadTaskCsvColumns tolerates corrupt storage', () => {
  const storage = new MemoryStorage()
  storage.setItem('wm-task-csv-columns', '{not json')
  assert.deepEqual(loadTaskCsvColumns(storage), new Set(ALL_INDICES))
})

test('loadTaskCsvColumns falls back to all columns when the stored selection is empty', () => {
  const storage = new MemoryStorage()
  saveTaskCsvColumns(new Set(), storage)
  assert.deepEqual(loadTaskCsvColumns(storage), new Set(ALL_INDICES))
})

test('toggleTaskCsvColumn adds and removes indices without mutating the input set', () => {
  const original = new Set(ALL_INDICES)
  const removed = toggleTaskCsvColumn(original, 0)
  assert.equal(removed.has(0), false)
  assert.equal(original.has(0), true)
  const added = toggleTaskCsvColumn(removed, 0)
  assert.equal(added.has(0), true)
})

test('saveTaskCsvColumns persists the exact selected indices', () => {
  const storage = new MemoryStorage()
  const selected = new Set([0, 2, 4])
  saveTaskCsvColumns(selected, storage)
  assert.deepEqual(loadTaskCsvColumns(storage), selected)
})
