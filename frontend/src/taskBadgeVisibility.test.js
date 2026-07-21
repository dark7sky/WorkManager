import assert from 'node:assert/strict'
import { test } from 'node:test'

import { loadTaskBadgeVisibility, saveTaskBadgeVisibility, TASK_BADGE_OPTIONS, toggleTaskBadgeVisibility } from './taskBadgeVisibility.js'

class MemoryStorage {
  constructor() { this.store = new Map() }
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null }
  setItem(key, value) { this.store.set(key, String(value)) }
}

const ALL_KEYS = TASK_BADGE_OPTIONS.map(o => o.key)

test('loadTaskBadgeVisibility defaults to all badges visible when nothing is stored', () => {
  assert.deepEqual(loadTaskBadgeVisibility(new MemoryStorage()), new Set(ALL_KEYS))
})

test('loadTaskBadgeVisibility tolerates corrupt storage', () => {
  const storage = new MemoryStorage()
  storage.setItem('wm-task-badge-visibility', '{not json')
  assert.deepEqual(loadTaskBadgeVisibility(storage), new Set(ALL_KEYS))
})

test('toggleTaskBadgeVisibility adds and removes keys without mutating the input set', () => {
  const original = new Set(ALL_KEYS)
  const removed = toggleTaskBadgeVisibility(original, 'estimate')
  assert.equal(removed.has('estimate'), false)
  assert.equal(original.has('estimate'), true)
  const added = toggleTaskBadgeVisibility(removed, 'estimate')
  assert.equal(added.has('estimate'), true)
})

test('saveTaskBadgeVisibility persists only the hidden keys as false', () => {
  const storage = new MemoryStorage()
  const visible = new Set(ALL_KEYS.filter(k => k !== 'checklist' && k !== 'comments'))
  saveTaskBadgeVisibility(visible, storage)
  assert.deepEqual(loadTaskBadgeVisibility(storage), visible)
})
