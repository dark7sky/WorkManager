import assert from 'node:assert/strict'
import { test } from 'node:test'

import { loadPinnedLogIds, orderLogsByPin, savePinnedLogIds, togglePinnedLog } from './logPins.js'

class MemoryStorage {
  constructor() { this.store = new Map() }
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null }
  setItem(key, value) { this.store.set(key, String(value)) }
}

test('loadPinnedLogIds returns an empty set when nothing is stored', () => {
  assert.deepEqual([...loadPinnedLogIds(new MemoryStorage())], [])
})

test('loadPinnedLogIds tolerates corrupted storage content', () => {
  const storage = new MemoryStorage()
  storage.setItem('wm-pinned-logs', '{not json')
  assert.deepEqual([...loadPinnedLogIds(storage)], [])
})

test('togglePinnedLog adds then removes an id without mutating the original set', () => {
  const original = new Set([1])
  const added = togglePinnedLog(original, 2)
  assert.deepEqual([...added].sort(), [1, 2])
  assert.deepEqual([...original], [1])
  const removed = togglePinnedLog(added, 2)
  assert.deepEqual([...removed], [1])
})

test('savePinnedLogIds round-trips through loadPinnedLogIds', () => {
  const storage = new MemoryStorage()
  savePinnedLogIds(new Set([3, 5]), storage)
  assert.deepEqual([...loadPinnedLogIds(storage)].sort(), [3, 5])
})

test('orderLogsByPin moves pinned logs to the front while preserving relative order', () => {
  const logs = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]
  const pinned = new Set([3])
  assert.deepEqual(orderLogsByPin(logs, pinned).map(l => l.id), [3, 1, 2, 4])
})

test('orderLogsByPin does not mutate the input array', () => {
  const logs = [{ id: 1 }, { id: 2 }]
  const copy = [...logs]
  orderLogsByPin(logs, new Set([2]))
  assert.deepEqual(logs, copy)
})
