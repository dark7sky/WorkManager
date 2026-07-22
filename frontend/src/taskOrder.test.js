import assert from 'node:assert/strict'
import { test } from 'node:test'

import { applyManualOrder, loadTaskManualOrder, moveTaskBefore, saveTaskManualOrder } from './taskOrder.js'

class MemoryStorage {
  constructor() { this.store = new Map() }
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null }
  setItem(key, value) { this.store.set(key, String(value)) }
}

test('loadTaskManualOrder returns an empty object when nothing is stored', () => {
  assert.deepEqual(loadTaskManualOrder(new MemoryStorage()), {})
})

test('loadTaskManualOrder tolerates corrupted storage content', () => {
  const storage = new MemoryStorage()
  storage.setItem('wm-task-manual-order', '{not json')
  assert.deepEqual(loadTaskManualOrder(storage), {})
})

test('saveTaskManualOrder round-trips through loadTaskManualOrder', () => {
  const storage = new MemoryStorage()
  saveTaskManualOrder({ 3: 0, 1: 1 }, storage)
  assert.deepEqual(loadTaskManualOrder(storage), { 3: 0, 1: 1 })
})

test('applyManualOrder sorts ids by stored index, unordered ids last in original relative order', () => {
  assert.deepEqual(applyManualOrder([1, 2, 3], { 2: 0, 1: 1 }), [2, 1, 3])
})

test('moveTaskBefore moves the dragged id to sit just before the target id', () => {
  const order = moveTaskBefore([1, 2, 3, 4], {}, 4, 2)
  assert.deepEqual(order, { 1: 0, 4: 1, 2: 2, 3: 3 })
})

test('moveTaskBefore is a no-op when dragging an item onto itself', () => {
  const order = moveTaskBefore([1, 2, 3], { 1: 0, 2: 1, 3: 2 }, 2, 2)
  assert.deepEqual(order, { 1: 0, 2: 1, 3: 2 })
})

test('moveTaskBefore returns the order unchanged for unknown ids', () => {
  const order = { 1: 0, 2: 1 }
  assert.equal(moveTaskBefore([1, 2], order, 9, 2), order)
})

test('moveTaskBefore only reorders within the provided sibling id list, scoping manual order to one parent group', () => {
  const order = moveTaskBefore([2, 3], {}, 3, 2)
  assert.deepEqual(order, { 3: 0, 2: 1 })
})
