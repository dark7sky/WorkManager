import assert from 'node:assert/strict'
import { test } from 'node:test'

import { loadTodoBadgeVisibility, saveTodoBadgeVisibility, TODO_BADGE_OPTIONS, toggleTodoBadgeVisibility } from './todoBadgeVisibility.js'

class MemoryStorage {
  constructor() { this.store = new Map() }
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null }
  setItem(key, value) { this.store.set(key, String(value)) }
}

const ALL_KEYS = TODO_BADGE_OPTIONS.map(o => o.key)

test('loadTodoBadgeVisibility defaults to all badges visible when nothing is stored', () => {
  assert.deepEqual(loadTodoBadgeVisibility(new MemoryStorage()), new Set(ALL_KEYS))
})

test('loadTodoBadgeVisibility tolerates corrupt storage', () => {
  const storage = new MemoryStorage()
  storage.setItem('wm-todo-badge-visibility', '{not json')
  assert.deepEqual(loadTodoBadgeVisibility(storage), new Set(ALL_KEYS))
})

test('toggleTodoBadgeVisibility adds and removes keys without mutating the input set', () => {
  const original = new Set(ALL_KEYS)
  const removed = toggleTodoBadgeVisibility(original, 'estimate')
  assert.equal(removed.has('estimate'), false)
  assert.equal(original.has('estimate'), true)
  const added = toggleTodoBadgeVisibility(removed, 'estimate')
  assert.equal(added.has('estimate'), true)
})

test('saveTodoBadgeVisibility persists only the hidden keys as false', () => {
  const storage = new MemoryStorage()
  const visible = new Set(ALL_KEYS.filter(k => k !== 'checklist' && k !== 'comments'))
  saveTodoBadgeVisibility(visible, storage)
  assert.deepEqual(loadTodoBadgeVisibility(storage), visible)
})
