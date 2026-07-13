import assert from 'node:assert/strict'
import { test } from 'node:test'

import { loadPinnedTodoIds, orderTodosByPin, savePinnedTodoIds, togglePinnedTodo } from './todoPins.js'

class MemoryStorage {
  constructor() { this.store = new Map() }
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null }
  setItem(key, value) { this.store.set(key, String(value)) }
}

test('loadPinnedTodoIds returns an empty set when nothing is stored', () => {
  assert.deepEqual([...loadPinnedTodoIds(new MemoryStorage())], [])
})

test('loadPinnedTodoIds tolerates corrupted storage content', () => {
  const storage = new MemoryStorage()
  storage.setItem('wm-pinned-todos', '{not json')
  assert.deepEqual([...loadPinnedTodoIds(storage)], [])
})

test('togglePinnedTodo adds then removes an id without mutating the original set', () => {
  const original = new Set([1])
  const added = togglePinnedTodo(original, 2)
  assert.deepEqual([...added].sort(), [1, 2])
  assert.deepEqual([...original], [1])
  const removed = togglePinnedTodo(added, 2)
  assert.deepEqual([...removed], [1])
})

test('savePinnedTodoIds round-trips through loadPinnedTodoIds', () => {
  const storage = new MemoryStorage()
  savePinnedTodoIds(new Set([3, 5]), storage)
  assert.deepEqual([...loadPinnedTodoIds(storage)].sort(), [3, 5])
})

test('orderTodosByPin moves pinned todos to the front while preserving relative order', () => {
  const todos = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]
  const pinned = new Set([3])
  assert.deepEqual(orderTodosByPin(todos, pinned).map(t => t.id), [3, 1, 2, 4])
})

test('orderTodosByPin does not mutate the input array', () => {
  const todos = [{ id: 1 }, { id: 2 }]
  const copy = [...todos]
  orderTodosByPin(todos, new Set([2]))
  assert.deepEqual(todos, copy)
})

test('orderTodosByPin sorts unpinned todos by priority (high, normal, low) while preserving relative order within a tier', () => {
  const todos = [
    { id: 1, priority: 'normal' },
    { id: 2, priority: 'high' },
    { id: 3, priority: 'low' },
    { id: 4, priority: 'high' },
  ]
  assert.deepEqual(orderTodosByPin(todos, new Set()).map(t => t.id), [2, 4, 1, 3])
})

test('orderTodosByPin ranks pin above priority', () => {
  const todos = [{ id: 1, priority: 'high' }, { id: 2, priority: 'low' }]
  assert.deepEqual(orderTodosByPin(todos, new Set([2])).map(t => t.id), [2, 1])
})

test('orderTodosByPin treats a missing priority as normal', () => {
  const todos = [{ id: 1 }, { id: 2, priority: 'high' }]
  assert.deepEqual(orderTodosByPin(todos, new Set()).map(t => t.id), [2, 1])
})
