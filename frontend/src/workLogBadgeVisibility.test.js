import assert from 'node:assert/strict'
import { test } from 'node:test'

import { loadWorkLogBadgeVisibility, saveWorkLogBadgeVisibility, WORK_LOG_BADGE_OPTIONS, toggleWorkLogBadgeVisibility } from './workLogBadgeVisibility.js'

class MemoryStorage {
  constructor() { this.store = new Map() }
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null }
  setItem(key, value) { this.store.set(key, String(value)) }
}

const ALL_KEYS = WORK_LOG_BADGE_OPTIONS.map(o => o.key)

test('loadWorkLogBadgeVisibility defaults to all badges visible when nothing is stored', () => {
  assert.deepEqual(loadWorkLogBadgeVisibility(new MemoryStorage()), new Set(ALL_KEYS))
})

test('loadWorkLogBadgeVisibility tolerates corrupt storage', () => {
  const storage = new MemoryStorage()
  storage.setItem('wm-worklog-badge-visibility', '{not json')
  assert.deepEqual(loadWorkLogBadgeVisibility(storage), new Set(ALL_KEYS))
})

test('toggleWorkLogBadgeVisibility adds and removes keys without mutating the input set', () => {
  const original = new Set(ALL_KEYS)
  const removed = toggleWorkLogBadgeVisibility(original, 'estimate')
  assert.equal(removed.has('estimate'), false)
  assert.equal(original.has('estimate'), true)
  const added = toggleWorkLogBadgeVisibility(removed, 'estimate')
  assert.equal(added.has('estimate'), true)
})

test('saveWorkLogBadgeVisibility persists only the hidden keys as false', () => {
  const storage = new MemoryStorage()
  const visible = new Set(ALL_KEYS.filter(k => k !== 'checklist' && k !== 'comments'))
  saveWorkLogBadgeVisibility(visible, storage)
  assert.deepEqual(loadWorkLogBadgeVisibility(storage), visible)
})
