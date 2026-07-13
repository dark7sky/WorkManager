import assert from 'node:assert/strict'
import { test } from 'node:test'

import { loadPinnedTaskIds, savePinnedTaskIds, togglePinnedTask } from './taskPins.js'

class MemoryStorage {
  constructor() { this.store = new Map() }
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null }
  setItem(key, value) { this.store.set(key, String(value)) }
}

test('loadPinnedTaskIds returns an empty set when nothing is stored', () => {
  assert.deepEqual([...loadPinnedTaskIds(new MemoryStorage())], [])
})

test('loadPinnedTaskIds tolerates corrupted storage content', () => {
  const storage = new MemoryStorage()
  storage.setItem('wm-pinned-tasks', '{not json')
  assert.deepEqual([...loadPinnedTaskIds(storage)], [])
})

test('togglePinnedTask adds then removes an id without mutating the original set', () => {
  const original = new Set([1])
  const added = togglePinnedTask(original, 2)
  assert.deepEqual([...added].sort(), [1, 2])
  assert.deepEqual([...original], [1])
  const removed = togglePinnedTask(added, 2)
  assert.deepEqual([...removed], [1])
})

test('savePinnedTaskIds round-trips through loadPinnedTaskIds', () => {
  const storage = new MemoryStorage()
  savePinnedTaskIds(new Set([3, 5]), storage)
  assert.deepEqual([...loadPinnedTaskIds(storage)].sort(), [3, 5])
})
