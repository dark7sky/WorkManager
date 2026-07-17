import assert from 'node:assert/strict'
import { test } from 'node:test'

import { loadCollapsedTaskIds, saveCollapsedTaskIds, toggleCollapsedTask } from './taskCollapse.js'

class MemoryStorage {
  constructor() { this.store = new Map() }
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null }
  setItem(key, value) { this.store.set(key, String(value)) }
}

test('loadCollapsedTaskIds returns an empty set when nothing is stored', () => {
  assert.deepEqual(loadCollapsedTaskIds(new MemoryStorage()), new Set())
})

test('loadCollapsedTaskIds tolerates corrupt storage', () => {
  const storage = new MemoryStorage()
  storage.setItem('wm-collapsed-tasks', '{not json')
  assert.deepEqual(loadCollapsedTaskIds(storage), new Set())
})

test('toggleCollapsedTask adds and removes ids without mutating the input set', () => {
  const original = new Set([1])
  const added = toggleCollapsedTask(original, 2)
  assert.deepEqual(added, new Set([1, 2]))
  assert.deepEqual(original, new Set([1]))
  const removed = toggleCollapsedTask(added, 1)
  assert.deepEqual(removed, new Set([2]))
})

test('saveCollapsedTaskIds persists the set as a JSON array', () => {
  const storage = new MemoryStorage()
  saveCollapsedTaskIds(new Set([3, 4]), storage)
  assert.deepEqual(loadCollapsedTaskIds(storage), new Set([3, 4]))
})
