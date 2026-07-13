import assert from 'node:assert/strict'
import { test } from 'node:test'

import { clearNotificationHistory, loadNotificationHistory, pushNotificationHistory } from './notificationHistory.js'

class MemoryStorage {
  constructor() { this.store = new Map() }
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null }
  setItem(key, value) { this.store.set(key, String(value)) }
}

test('loadNotificationHistory returns an empty array when nothing is stored', () => {
  assert.deepEqual(loadNotificationHistory(new MemoryStorage()), [])
})

test('loadNotificationHistory tolerates corrupted storage content', () => {
  const storage = new MemoryStorage()
  storage.setItem('wm-notification-history', '{not json')
  assert.deepEqual(loadNotificationHistory(storage), [])
})

test('pushNotificationHistory prepends the newest entry first', () => {
  const storage = new MemoryStorage()
  pushNotificationHistory('WorkManager 오늘의 업무', '업무 A', storage)
  pushNotificationHistory('곧 시작: 회의', '10분 후 시작', storage)
  const history = loadNotificationHistory(storage)
  assert.equal(history.length, 2)
  assert.equal(history[0].title, '곧 시작: 회의')
  assert.equal(history[1].title, 'WorkManager 오늘의 업무')
  assert.ok(history[0].firedAt)
})

test('pushNotificationHistory caps history at 30 entries', () => {
  const storage = new MemoryStorage()
  for (let i = 0; i < 35; i++) pushNotificationHistory(`title-${i}`, `body-${i}`, storage)
  const history = loadNotificationHistory(storage)
  assert.equal(history.length, 30)
  assert.equal(history[0].title, 'title-34')
})

test('clearNotificationHistory empties the stored list', () => {
  const storage = new MemoryStorage()
  pushNotificationHistory('t', 'b', storage)
  clearNotificationHistory(storage)
  assert.deepEqual(loadNotificationHistory(storage), [])
})
