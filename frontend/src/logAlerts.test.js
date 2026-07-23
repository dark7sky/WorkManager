import { test } from 'node:test'
import assert from 'node:assert/strict'
import { logsDueForAlert, DEFAULT_LOG_ALERT_LEAD_MINUTES, LOG_ALERT_LEAD_OPTIONS } from './logAlerts.js'

const now = new Date(2026, 0, 1, 9, 0).getTime()
const time = minutesFromNow => {
  const d = new Date(now + minutesFromNow * 60000)
  return { log_date: d.toLocaleDateString('en-CA'), log_time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
}

test('logsDueForAlert includes logs due within the lead window', () => {
  const logs = [{ id: 1, ...time(10) }, { id: 2, ...time(20) }]
  const due = logsDueForAlert(logs, now, 15)
  assert.deepEqual(due.map(l => l.id), [1])
})

test('logsDueForAlert excludes logs without log_time', () => {
  const logs = [{ id: 1, log_date: '2026-01-01' }, { id: 2, ...time(5) }]
  const due = logsDueForAlert(logs, now, 15)
  assert.deepEqual(due.map(l => l.id), [2])
})

test('logsDueForAlert excludes past due logs', () => {
  const logs = [{ id: 1, ...time(-5) }]
  const due = logsDueForAlert(logs, now, 15)
  assert.deepEqual(due, [])
})

test('logsDueForAlert defaults to a 15 minute window', () => {
  assert.equal(DEFAULT_LOG_ALERT_LEAD_MINUTES, 15)
  const logs = [{ id: 1, ...time(15) }, { id: 2, ...time(16) }]
  const due = logsDueForAlert(logs, now)
  assert.deepEqual(due.map(l => l.id), [1])
})

test('logsDueForAlert lets a per-log reminder_minutes_before override the global lead time', () => {
  const logs = [{ id: 1, reminder_minutes_before: 30, ...time(25) }, { id: 2, reminder_minutes_before: 5, ...time(10) }]
  const due = logsDueForAlert(logs, now, 15)
  assert.deepEqual(due.map(l => l.id), [1])
})

test('LOG_ALERT_LEAD_OPTIONS offers an off (0) choice while keeping the 15 minute default', () => {
  assert.ok(LOG_ALERT_LEAD_OPTIONS.includes(0))
  assert.equal(DEFAULT_LOG_ALERT_LEAD_MINUTES, 15)
})
