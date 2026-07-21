import assert from 'node:assert/strict'
import { test } from 'node:test'

import { applyManualOrder, loadLogManualOrder, moveLogBefore, saveLogManualOrder } from './logOrder.js'

class MemoryStorage {
  constructor() { this.store = new Map() }
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null }
  setItem(key, value) { this.store.set(key, String(value)) }
}

test('loadLogManualOrder returns an empty object when nothing is stored', () => {
  assert.deepEqual(loadLogManualOrder(new MemoryStorage()), {})
})

test('loadLogManualOrder tolerates corrupted storage content', () => {
  const storage = new MemoryStorage()
  storage.setItem('wm-log-manual-order', '{not json')
  assert.deepEqual(loadLogManualOrder(storage), {})
})

test('saveLogManualOrder round-trips through loadLogManualOrder', () => {
  const storage = new MemoryStorage()
  saveLogManualOrder({ 3: 0, 1: 1 }, storage)
  assert.deepEqual(loadLogManualOrder(storage), { 3: 0, 1: 1 })
})

test('applyManualOrder sorts by stored index, unordered items last in original relative order', () => {
  const logs = [{ id: 1 }, { id: 2 }, { id: 3 }]
  assert.deepEqual(applyManualOrder(logs, { 2: 0, 1: 1 }).map(l => l.id), [2, 1, 3])
})

test('applyManualOrder does not mutate the input array', () => {
  const logs = [{ id: 1 }, { id: 2 }]
  const copy = [...logs]
  applyManualOrder(logs, { 2: 0 })
  assert.deepEqual(logs, copy)
})

test('moveLogBefore moves the dragged id to sit just before the target id', () => {
  const order = moveLogBefore([1, 2, 3, 4], {}, 4, 2)
  assert.deepEqual(order, { 1: 0, 4: 1, 2: 2, 3: 3 })
})

test('moveLogBefore is a no-op when dragging an item onto itself', () => {
  const order = moveLogBefore([1, 2, 3], { 1: 0, 2: 1, 3: 2 }, 2, 2)
  assert.deepEqual(order, { 1: 0, 2: 1, 3: 2 })
})

test('moveLogBefore returns the order unchanged for unknown ids', () => {
  const order = { 1: 0, 2: 1 }
  assert.equal(moveLogBefore([1, 2], order, 9, 2), order)
})

test('moveLogBefore(id, prevId) swaps an item up with its immediate predecessor (keyboard move-up)', () => {
  const order = moveLogBefore([1, 2, 3], {}, 2, 1)
  assert.deepEqual(order, { 2: 0, 1: 1, 3: 2 })
})

test('moveLogBefore(nextId, id) swaps an item down with its immediate successor (keyboard move-down)', () => {
  const order = moveLogBefore([1, 2, 3], {}, 2, 1)
  const swappedBack = moveLogBefore([2, 1, 3], order, 1, 2)
  assert.deepEqual(swappedBack, { 1: 0, 2: 1, 3: 2 })
})
