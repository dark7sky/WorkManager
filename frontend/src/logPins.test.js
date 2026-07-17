import assert from 'node:assert/strict'
import { test } from 'node:test'

import { loadLogSort, loadPinnedLogIds, orderLogsByPin, savePinnedLogIds, saveLogSort, togglePinnedLog } from './logPins.js'

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

test('orderLogsByPin sorts by log_time when sortBy is "time"', () => {
  const logs = [{ id: 1, log_time: '15:00' }, { id: 2, log_time: '09:00' }, { id: 3 }]
  assert.deepEqual(orderLogsByPin(logs, new Set(), 'time').map(l => l.id), [3, 2, 1])
})

test('orderLogsByPin sorts by duration_minutes descending when sortBy is "duration"', () => {
  const logs = [{ id: 1, duration_minutes: 10 }, { id: 2, duration_minutes: 90 }, { id: 3 }]
  assert.deepEqual(orderLogsByPin(logs, new Set(), 'duration').map(l => l.id), [2, 1, 3])
})

test('orderLogsByPin sorts by content when sortBy is "content"', () => {
  const logs = [{ id: 1, content: '나' }, { id: 2, content: '가' }]
  assert.deepEqual(orderLogsByPin(logs, new Set(), 'content').map(l => l.id), [2, 1])
})

test('loadLogSort defaults to "none" and round-trips through saveLogSort', () => {
  const storage = new MemoryStorage()
  assert.equal(loadLogSort(storage), 'none')
  saveLogSort('duration', storage)
  assert.equal(loadLogSort(storage), 'duration')
})

test('loadLogSort falls back to the default for an unknown stored value', () => {
  const storage = new MemoryStorage()
  storage.setItem('wm-log-sort', 'bogus')
  assert.equal(loadLogSort(storage), 'none')
})
