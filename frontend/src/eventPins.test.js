import assert from 'node:assert/strict'
import { test } from 'node:test'

import { loadPinnedEventIds, orderEventsByPin, savePinnedEventIds, togglePinnedEvent } from './eventPins.js'

class MemoryStorage {
  constructor() { this.store = new Map() }
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null }
  setItem(key, value) { this.store.set(key, String(value)) }
}

test('loadPinnedEventIds returns an empty set when nothing is stored', () => {
  assert.deepEqual([...loadPinnedEventIds(new MemoryStorage())], [])
})

test('loadPinnedEventIds tolerates corrupted storage content', () => {
  const storage = new MemoryStorage()
  storage.setItem('wm-pinned-events', '{not json')
  assert.deepEqual([...loadPinnedEventIds(storage)], [])
})

test('togglePinnedEvent adds then removes an id without mutating the original set', () => {
  const original = new Set([1])
  const added = togglePinnedEvent(original, 2)
  assert.deepEqual([...added].sort(), [1, 2])
  assert.deepEqual([...original], [1])
  const removed = togglePinnedEvent(added, 2)
  assert.deepEqual([...removed], [1])
})

test('savePinnedEventIds round-trips through loadPinnedEventIds', () => {
  const storage = new MemoryStorage()
  savePinnedEventIds(new Set([3, 5]), storage)
  assert.deepEqual([...loadPinnedEventIds(storage)].sort(), [3, 5])
})

test('orderEventsByPin moves pinned events to the front while preserving relative order', () => {
  const events = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]
  const pinned = new Set([3])
  assert.deepEqual(orderEventsByPin(events, pinned).map(e => e.id), [3, 1, 2, 4])
})

test('orderEventsByPin does not mutate the input array', () => {
  const events = [{ id: 1 }, { id: 2 }]
  const copy = [...events]
  orderEventsByPin(events, new Set([2]))
  assert.deepEqual(events, copy)
})
