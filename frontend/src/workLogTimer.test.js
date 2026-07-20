import assert from 'node:assert/strict'
import { test } from 'node:test'

import { clearWorkLogTimer, elapsedMinutes, formatElapsed, formatTimerElapsed, loadWorkLogTimer, pauseWorkLogTimer, resumeWorkLogTimer, startTimeString, startWorkLogTimer, timerElapsedMinutes, timerElapsedMs } from './workLogTimer.js'

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

test('startTimeString renders local HH:MM for the timer start', () => {
  const start = new Date()
  start.setHours(9, 5, 30, 0)
  const expected = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`
  assert.equal(startTimeString(start.toISOString()), expected)
})

test('startTimeString returns empty string for an invalid start time', () => {
  assert.equal(startTimeString('not-a-date'), '')
})

test('pauseWorkLogTimer marks the timer paused and resumeWorkLogTimer clears it', () => {
  const storage = new MemoryStorage()
  startWorkLogTimer(3, storage)
  const paused = pauseWorkLogTimer(storage)
  assert.ok(paused.pausedAt)
  assert.deepEqual(loadWorkLogTimer(storage), paused)
  const resumed = resumeWorkLogTimer(storage)
  assert.equal(resumed.pausedAt, null)
  assert.ok(resumed.totalPausedMs >= 0)
})

test('pauseWorkLogTimer is a no-op when already paused or missing', () => {
  const storage = new MemoryStorage()
  assert.equal(pauseWorkLogTimer(storage), null)
  startWorkLogTimer(null, storage)
  const paused = pauseWorkLogTimer(storage)
  assert.deepEqual(pauseWorkLogTimer(storage), paused)
})

test('resumeWorkLogTimer is a no-op when already running or missing', () => {
  const storage = new MemoryStorage()
  assert.equal(resumeWorkLogTimer(storage), null)
  const running = startWorkLogTimer(null, storage)
  assert.deepEqual(resumeWorkLogTimer(storage), running)
})

test('timerElapsedMs excludes paused time and freezes while paused', () => {
  const timer = { startedAt: '2026-07-13T10:00:00+09:00', pausedAt: '2026-07-13T10:10:00+09:00', totalPausedMs: 0 }
  assert.equal(timerElapsedMs(timer, new Date('2026-07-13T10:30:00+09:00')), 10 * 60000)
  const resumedTimer = { startedAt: '2026-07-13T10:00:00+09:00', pausedAt: null, totalPausedMs: 5 * 60000 }
  assert.equal(timerElapsedMs(resumedTimer, new Date('2026-07-13T10:20:00+09:00')), 15 * 60000)
})

test('timerElapsedMinutes and formatTimerElapsed round-trip through pause/resume', () => {
  const timer = { startedAt: '2026-07-13T10:00:00+09:00', pausedAt: null, totalPausedMs: 3 * 60000 }
  assert.equal(timerElapsedMinutes(timer, new Date('2026-07-13T10:13:00+09:00')), 10)
  assert.equal(formatTimerElapsed(timer, new Date('2026-07-13T10:13:00+09:00')), '00:10:00')
})
