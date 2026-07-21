import assert from 'node:assert/strict'
import { test } from 'node:test'

import { WORK_LOG_CSV_COLUMN_OPTIONS, loadWorkLogCsvColumns, saveWorkLogCsvColumns, toggleWorkLogCsvColumn } from './workLogCsvColumns.js'

class MemoryStorage {
  constructor() { this.store = new Map() }
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null }
  setItem(key, value) { this.store.set(key, String(value)) }
}

const ALL_INDICES = WORK_LOG_CSV_COLUMN_OPTIONS.map(o => o.index)

test('loadWorkLogCsvColumns defaults to all columns selected when nothing is stored', () => {
  assert.deepEqual(loadWorkLogCsvColumns(new MemoryStorage()), new Set(ALL_INDICES))
})

test('loadWorkLogCsvColumns tolerates corrupt storage', () => {
  const storage = new MemoryStorage()
  storage.setItem('wm-work-log-csv-columns', '{not json')
  assert.deepEqual(loadWorkLogCsvColumns(storage), new Set(ALL_INDICES))
})

test('loadWorkLogCsvColumns falls back to all columns when the stored selection is empty', () => {
  const storage = new MemoryStorage()
  saveWorkLogCsvColumns(new Set(), storage)
  assert.deepEqual(loadWorkLogCsvColumns(storage), new Set(ALL_INDICES))
})

test('toggleWorkLogCsvColumn adds and removes indices without mutating the input set', () => {
  const original = new Set(ALL_INDICES)
  const removed = toggleWorkLogCsvColumn(original, 0)
  assert.equal(removed.has(0), false)
  assert.equal(original.has(0), true)
  const added = toggleWorkLogCsvColumn(removed, 0)
  assert.equal(added.has(0), true)
})

test('saveWorkLogCsvColumns persists the exact selected indices', () => {
  const storage = new MemoryStorage()
  const selected = new Set([0, 2, 4])
  saveWorkLogCsvColumns(selected, storage)
  assert.deepEqual(loadWorkLogCsvColumns(storage), selected)
})
