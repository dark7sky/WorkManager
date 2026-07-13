import assert from 'node:assert/strict'
import { test } from 'node:test'

import { clearWorkLogTimer, elapsedMinutes, formatElapsed, loadWorkLogTimer, startWorkLogTimer } from './workLogTimer.js'

class MemoryStorage {
  constructor() { this.store = new Map() }
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null }
  setItem(key, value) { this.store.set(key, String(value)) }
  removeItem(key) { this.store.delete(key) }
}

test('loadWorkLogTimer returns null when nothing is stored', () => {
  assert.equal(loadWorkLogTimer(new MemoryStorage()), null)
})

test('loadWorkLogTimer tolerates corrupted storage content', () => {
  const storage = new MemoryStorage()
  storage.setItem('wm-worklog-timer', '{not json')
  assert.equal(loadWorkLogTimer(storage), null)
})

test('startWorkLogTimer persists start time and optional task id', () => {
  const storage = new MemoryStorage()
  const state = startWorkLogTimer(7, storage)
  assert.equal(state.taskId, 7)
  assert.deepEqual(loadWorkLogTimer(storage), state)
})

test('clearWorkLogTimer removes the stored state', () => {
  const storage = new MemoryStorage()
  startWorkLogTimer(null, storage)
  clearWorkLogTimer(storage)
  assert.equal(loadWorkLogTimer(storage), null)
})

test('elapsedMinutes rounds the difference to the nearest minute', () => {
  const start = '2026-07-13T10:00:00+09:00'
  assert.equal(elapsedMinutes(start, new Date('2026-07-13T10:00:00+09:00')), 0)
  assert.equal(elapsedMinutes(start, new Date('2026-07-13T10:29:40+09:00')), 30)
  assert.equal(elapsedMinutes(start, new Date('2026-07-13T10:44:00+09:00')), 44)
})

test('elapsedMinutes never goes negative for a future start time', () => {
  assert.equal(elapsedMinutes('2026-07-13T10:00:00+09:00', new Date('2026-07-13T09:00:00+09:00')), 0)
})

test('formatElapsed renders HH:MM:SS', () => {
  const start = '2026-07-13T10:00:00+09:00'
  assert.equal(formatElapsed(start, new Date('2026-07-13T10:00:00+09:00')), '00:00:00')
  assert.equal(formatElapsed(start, new Date('2026-07-13T11:02:09+09:00')), '01:02:09')
})
