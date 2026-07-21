import assert from 'node:assert/strict'
import { test } from 'node:test'

import { EVENT_CSV_COLUMN_OPTIONS, loadEventCsvColumns, saveEventCsvColumns, toggleEventCsvColumn } from './eventCsvColumns.js'

class MemoryStorage {
  constructor() { this.store = new Map() }
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null }
  setItem(key, value) { this.store.set(key, String(value)) }
}

const ALL_INDICES = EVENT_CSV_COLUMN_OPTIONS.map(o => o.index)

test('loadEventCsvColumns defaults to all columns selected when nothing is stored', () => {
  assert.deepEqual(loadEventCsvColumns(new MemoryStorage()), new Set(ALL_INDICES))
})

test('loadEventCsvColumns tolerates corrupt storage', () => {
  const storage = new MemoryStorage()
  storage.setItem('wm-event-csv-columns', '{not json')
  assert.deepEqual(loadEventCsvColumns(storage), new Set(ALL_INDICES))
})

test('loadEventCsvColumns falls back to all columns when the stored selection is empty', () => {
  const storage = new MemoryStorage()
  saveEventCsvColumns(new Set(), storage)
  assert.deepEqual(loadEventCsvColumns(storage), new Set(ALL_INDICES))
})

test('toggleEventCsvColumn adds and removes indices without mutating the input set', () => {
  const original = new Set(ALL_INDICES)
  const removed = toggleEventCsvColumn(original, 0)
  assert.equal(removed.has(0), false)
  assert.equal(original.has(0), true)
  const added = toggleEventCsvColumn(removed, 0)
  assert.equal(added.has(0), true)
})

test('saveEventCsvColumns persists the exact selected indices', () => {
  const storage = new MemoryStorage()
  const selected = new Set([0, 2, 4])
  saveEventCsvColumns(selected, storage)
  assert.deepEqual(loadEventCsvColumns(storage), selected)
})
