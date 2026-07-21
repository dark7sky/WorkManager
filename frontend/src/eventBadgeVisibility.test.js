import assert from 'node:assert/strict'
import { test } from 'node:test'

import { loadEventBadgeVisibility, saveEventBadgeVisibility, EVENT_BADGE_OPTIONS, toggleEventBadgeVisibility } from './eventBadgeVisibility.js'

class MemoryStorage {
  constructor() { this.store = new Map() }
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null }
  setItem(key, value) { this.store.set(key, String(value)) }
}

const ALL_KEYS = EVENT_BADGE_OPTIONS.map(o => o.key)

test('loadEventBadgeVisibility defaults to all badges visible when nothing is stored', () => {
  assert.deepEqual(loadEventBadgeVisibility(new MemoryStorage()), new Set(ALL_KEYS))
})

test('loadEventBadgeVisibility tolerates corrupt storage', () => {
  const storage = new MemoryStorage()
  storage.setItem('wm-event-badge-visibility', '{not json')
  assert.deepEqual(loadEventBadgeVisibility(storage), new Set(ALL_KEYS))
})

test('toggleEventBadgeVisibility adds and removes keys without mutating the input set', () => {
  const original = new Set(ALL_KEYS)
  const removed = toggleEventBadgeVisibility(original, 'estimate')
  assert.equal(removed.has('estimate'), false)
  assert.equal(original.has('estimate'), true)
  const added = toggleEventBadgeVisibility(removed, 'estimate')
  assert.equal(added.has('estimate'), true)
})

test('saveEventBadgeVisibility persists only the hidden keys as false', () => {
  const storage = new MemoryStorage()
  const visible = new Set(ALL_KEYS.filter(k => k !== 'checklist' && k !== 'comments'))
  saveEventBadgeVisibility(visible, storage)
  assert.deepEqual(loadEventBadgeVisibility(storage), visible)
})
