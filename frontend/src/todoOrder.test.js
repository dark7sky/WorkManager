import assert from 'node:assert/strict'
import { test } from 'node:test'

import { applyManualOrder, loadTodoManualOrder, moveTodoBefore, saveTodoManualOrder } from './todoOrder.js'

class MemoryStorage {
  constructor() { this.store = new Map() }
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null }
  setItem(key, value) { this.store.set(key, String(value)) }
}

test('loadTodoManualOrder returns an empty object when nothing is stored', () => {
  assert.deepEqual(loadTodoManualOrder(new MemoryStorage()), {})
})

test('loadTodoManualOrder tolerates corrupted storage content', () => {
  const storage = new MemoryStorage()
  storage.setItem('wm-todo-manual-order', '{not json')
  assert.deepEqual(loadTodoManualOrder(storage), {})
})

test('saveTodoManualOrder round-trips through loadTodoManualOrder', () => {
  const storage = new MemoryStorage()
  saveTodoManualOrder({ 3: 0, 1: 1 }, storage)
  assert.deepEqual(loadTodoManualOrder(storage), { 3: 0, 1: 1 })
})

test('applyManualOrder sorts by stored index, unordered items last in original relative order', () => {
  const todos = [{ id: 1 }, { id: 2 }, { id: 3 }]
  assert.deepEqual(applyManualOrder(todos, { 2: 0, 1: 1 }).map(t => t.id), [2, 1, 3])
})

test('applyManualOrder does not mutate the input array', () => {
  const todos = [{ id: 1 }, { id: 2 }]
  const copy = [...todos]
  applyManualOrder(todos, { 2: 0 })
  assert.deepEqual(todos, copy)
})

test('moveTodoBefore moves the dragged id to sit just before the target id', () => {
  const order = moveTodoBefore([1, 2, 3, 4], {}, 4, 2)
  assert.deepEqual(order, { 1: 0, 4: 1, 2: 2, 3: 3 })
})

test('moveTodoBefore is a no-op when dragging an item onto itself', () => {
  const order = moveTodoBefore([1, 2, 3], { 1: 0, 2: 1, 3: 2 }, 2, 2)
  assert.deepEqual(order, { 1: 0, 2: 1, 3: 2 })
})

test('moveTodoBefore returns the order unchanged for unknown ids', () => {
  const order = { 1: 0, 2: 1 }
  assert.equal(moveTodoBefore([1, 2], order, 9, 2), order)
})

test('moveTodoBefore(id, prevId) swaps an item up with its immediate predecessor (keyboard move-up)', () => {
  const order = moveTodoBefore([1, 2, 3], {}, 2, 1)
  assert.deepEqual(order, { 2: 0, 1: 1, 3: 2 })
})

test('moveTodoBefore(nextId, id) swaps an item down with its immediate successor (keyboard move-down)', () => {
  const order = moveTodoBefore([1, 2, 3], {}, 2, 1)
  const swappedBack = moveTodoBefore([2, 1, 3], order, 1, 2)
  assert.deepEqual(swappedBack, { 1: 0, 2: 1, 3: 2 })
})
