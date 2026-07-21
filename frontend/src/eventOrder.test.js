import assert from 'node:assert/strict'
import { test } from 'node:test'

import { applyManualOrder, loadEventManualOrder, moveEventBefore, saveEventManualOrder } from './eventOrder.js'

class MemoryStorage {
  constructor() { this.store = new Map() }
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null }
  setItem(key, value) { this.store.set(key, String(value)) }
}

test('loadEventManualOrder returns an empty object when nothing is stored', () => {
  assert.deepEqual(loadEventManualOrder(new MemoryStorage()), {})
})

test('loadEventManualOrder tolerates corrupted storage content', () => {
  const storage = new MemoryStorage()
  storage.setItem('wm-event-manual-order', '{not json')
  assert.deepEqual(loadEventManualOrder(storage), {})
})

test('saveEventManualOrder round-trips through loadEventManualOrder', () => {
  const storage = new MemoryStorage()
  saveEventManualOrder({ 3: 0, 1: 1 }, storage)
  assert.deepEqual(loadEventManualOrder(storage), { 3: 0, 1: 1 })
})

test('applyManualOrder sorts by stored index, unordered items last in original relative order', () => {
  const events = [{ id: 1 }, { id: 2 }, { id: 3 }]
  assert.deepEqual(applyManualOrder(events, { 2: 0, 1: 1 }).map(e => e.id), [2, 1, 3])
})

test('applyManualOrder does not mutate the input array', () => {
  const events = [{ id: 1 }, { id: 2 }]
  const copy = [...events]
  applyManualOrder(events, { 2: 0 })
  assert.deepEqual(events, copy)
})

test('moveEventBefore moves the dragged id to sit just before the target id', () => {
  const order = moveEventBefore([1, 2, 3, 4], {}, 4, 2)
  assert.deepEqual(order, { 1: 0, 4: 1, 2: 2, 3: 3 })
})

test('moveEventBefore is a no-op when dragging an item onto itself', () => {
  const order = moveEventBefore([1, 2, 3], { 1: 0, 2: 1, 3: 2 }, 2, 2)
  assert.deepEqual(order, { 1: 0, 2: 1, 3: 2 })
})

test('moveEventBefore returns the order unchanged for unknown ids', () => {
  const order = { 1: 0, 2: 1 }
  assert.equal(moveEventBefore([1, 2], order, 9, 2), order)
})

test('moveEventBefore(id, prevId) swaps an item up with its immediate predecessor (keyboard move-up)', () => {
  const order = moveEventBefore([1, 2, 3], {}, 2, 1)
  assert.deepEqual(order, { 2: 0, 1: 1, 3: 2 })
})

test('moveEventBefore(nextId, id) swaps an item down with its immediate successor (keyboard move-down)', () => {
  const order = moveEventBefore([1, 2, 3], {}, 2, 1)
  const swappedBack = moveEventBefore([2, 1, 3], order, 1, 2)
  assert.deepEqual(swappedBack, { 1: 0, 2: 1, 3: 2 })
})
