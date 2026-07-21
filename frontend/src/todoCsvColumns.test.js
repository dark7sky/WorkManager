import assert from 'node:assert/strict'
import { test } from 'node:test'

import { TODO_CSV_COLUMN_OPTIONS, loadTodoCsvColumns, saveTodoCsvColumns, toggleTodoCsvColumn } from './todoCsvColumns.js'

class MemoryStorage {
  constructor() { this.store = new Map() }
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null }
  setItem(key, value) { this.store.set(key, String(value)) }
}

const ALL_INDICES = TODO_CSV_COLUMN_OPTIONS.map(o => o.index)

test('loadTodoCsvColumns defaults to all columns selected when nothing is stored', () => {
  assert.deepEqual(loadTodoCsvColumns(new MemoryStorage()), new Set(ALL_INDICES))
})

test('loadTodoCsvColumns tolerates corrupt storage', () => {
  const storage = new MemoryStorage()
  storage.setItem('wm-todo-csv-columns', '{not json')
  assert.deepEqual(loadTodoCsvColumns(storage), new Set(ALL_INDICES))
})

test('loadTodoCsvColumns falls back to all columns when the stored selection is empty', () => {
  const storage = new MemoryStorage()
  saveTodoCsvColumns(new Set(), storage)
  assert.deepEqual(loadTodoCsvColumns(storage), new Set(ALL_INDICES))
})

test('toggleTodoCsvColumn adds and removes indices without mutating the input set', () => {
  const original = new Set(ALL_INDICES)
  const removed = toggleTodoCsvColumn(original, 0)
  assert.equal(removed.has(0), false)
  assert.equal(original.has(0), true)
  const added = toggleTodoCsvColumn(removed, 0)
  assert.equal(added.has(0), true)
})

test('saveTodoCsvColumns persists the exact selected indices', () => {
  const storage = new MemoryStorage()
  const selected = new Set([0, 2, 4])
  saveTodoCsvColumns(selected, storage)
  assert.deepEqual(loadTodoCsvColumns(storage), selected)
})
