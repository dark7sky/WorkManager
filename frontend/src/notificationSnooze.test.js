import assert from 'node:assert/strict'
import { test } from 'node:test'

import { clearSnooze, isSnoozed, snoozeAlert } from './notificationSnooze.js'

class MemoryStorage {
  constructor() { this.store = new Map() }
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null }
  setItem(key, value) { this.store.set(key, String(value)) }
  removeItem(key) { this.store.delete(key) }
}

test('isSnoozed is false when nothing was snoozed', () => {
  assert.equal(isSnoozed('wm-task-alert-1', Date.now(), new MemoryStorage()), false)
})

test('snoozeAlert marks the tag snoozed for the configured window', () => {
  const storage = new MemoryStorage()
  const now = 1_000_000
  snoozeAlert('wm-task-alert-1', now, storage)
  assert.equal(isSnoozed('wm-task-alert-1', now + 5 * 60 * 1000, storage), true)
  assert.equal(isSnoozed('wm-task-alert-1', now + 11 * 60 * 1000, storage), false)
})

test('snoozeAlert clears the original shown flag so the alert can re-fire', () => {
  const storage = new MemoryStorage()
  storage.setItem('wm-task-alert-1', 'shown')
  snoozeAlert('wm-task-alert-1', Date.now(), storage)
  assert.equal(storage.getItem('wm-task-alert-1'), null)
})

test('clearSnooze removes the snooze marker', () => {
  const storage = new MemoryStorage()
  snoozeAlert('wm-task-alert-1', Date.now(), storage)
  clearSnooze('wm-task-alert-1', storage)
  assert.equal(isSnoozed('wm-task-alert-1', Date.now(), storage), false)
})

test('snoozeAlert respects a custom minutes window', () => {
  const storage = new MemoryStorage()
  const now = 1_000_000
  snoozeAlert('wm-task-alert-1', now, storage, 30)
  assert.equal(isSnoozed('wm-task-alert-1', now + 20 * 60 * 1000, storage), true)
  assert.equal(isSnoozed('wm-task-alert-1', now + 31 * 60 * 1000, storage), false)
})
