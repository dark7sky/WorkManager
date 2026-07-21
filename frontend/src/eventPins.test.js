import assert from 'node:assert/strict'
import { test } from 'node:test'

import { loadEventSort, loadPinnedEventIds, orderEventsByPin, savePinnedEventIds, saveEventSort, togglePinnedEvent } from './eventPins.js'

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

test('orderEventsByPin sorts by start time by default', () => {
  const events = [{ id: 1, start_at: '2026-07-20T15:00:00' }, { id: 2, start_at: '2026-07-20T09:00:00' }]
  assert.deepEqual(orderEventsByPin(events, new Set()).map(e => e.id), [2, 1])
})

test('orderEventsByPin sorts by priority (high, normal, low) when sortBy is "priority"', () => {
  const events = [{ id: 1, priority: 'normal' }, { id: 2, priority: 'high' }, { id: 3, priority: 'low' }]
  assert.deepEqual(orderEventsByPin(events, new Set(), 'priority').map(e => e.id), [2, 1, 3])
})

test('orderEventsByPin sorts by title when sortBy is "title"', () => {
  const events = [{ id: 1, title: '나' }, { id: 2, title: '가' }, { id: 3, title: '다' }]
  assert.deepEqual(orderEventsByPin(events, new Set(), 'title').map(e => e.id), [2, 1, 3])
})

test('orderEventsByPin ranks pin above sort order', () => {
  const events = [{ id: 1, start_at: '2026-07-20T09:00:00' }, { id: 2, start_at: '2026-07-20T15:00:00' }]
  assert.deepEqual(orderEventsByPin(events, new Set([2])).map(e => e.id), [2, 1])
})

test('loadEventSort defaults to time and round-trips through saveEventSort', () => {
  const storage = new MemoryStorage()
  assert.equal(loadEventSort(storage), 'time')
  saveEventSort('priority', storage)
  assert.equal(loadEventSort(storage), 'priority')
})

test('loadEventSort falls back to the default for an unknown stored value', () => {
  const storage = new MemoryStorage()
  storage.setItem('wm-event-sort', 'bogus')
  assert.equal(loadEventSort(storage), 'time')
})

test('orderEventsByPin sorts by stored manual order when sortBy is "manual"', () => {
  const events = [{ id: 1 }, { id: 2 }, { id: 3 }]
  assert.deepEqual(orderEventsByPin(events, new Set(), 'manual', { 2: 0, 1: 1 }).map(e => e.id), [2, 1, 3])
})
