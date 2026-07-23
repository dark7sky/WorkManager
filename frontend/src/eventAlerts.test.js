import { test } from 'node:test'
import assert from 'node:assert/strict'
import { eventsDueForAlert, DEFAULT_EVENT_ALERT_LEAD_MINUTES, EVENT_ALERT_LEAD_OPTIONS, isWithinQuietHours } from './eventAlerts.js'

const at = minutesFromNow => new Date(Date.UTC(2026, 0, 1, 0, minutesFromNow)).toISOString()
const now = new Date(Date.UTC(2026, 0, 1, 0, 0)).getTime()

test('eventsDueForAlert includes events starting within the lead window', () => {
  const events = [{ id: 1, start_at: at(10) }, { id: 2, start_at: at(20) }]
  const due = eventsDueForAlert(events, now, 15)
  assert.deepEqual(due.map(e => e.id), [1])
})

test('eventsDueForAlert excludes past events and events without start_at', () => {
  const events = [{ id: 1, start_at: at(-5) }, { id: 2 }, { id: 3, start_at: at(5) }]
  const due = eventsDueForAlert(events, now, 15)
  assert.deepEqual(due.map(e => e.id), [3])
})

test('eventsDueForAlert defaults to a 15 minute window', () => {
  assert.equal(DEFAULT_EVENT_ALERT_LEAD_MINUTES, 15)
  const events = [{ id: 1, start_at: at(15) }, { id: 2, start_at: at(16) }]
  const due = eventsDueForAlert(events, now)
  assert.deepEqual(due.map(e => e.id), [1])
})

test('eventsDueForAlert respects a wider configured lead time', () => {
  const events = [{ id: 1, start_at: at(25) }]
  const due = eventsDueForAlert(events, now, 30)
  assert.deepEqual(due.map(e => e.id), [1])
})

test('eventsDueForAlert lets a per-event reminder_minutes_before override the global lead time', () => {
  const events = [{ id: 1, start_at: at(25), reminder_minutes_before: 30 }, { id: 2, start_at: at(10), reminder_minutes_before: 5 }]
  const due = eventsDueForAlert(events, now, 15)
  assert.deepEqual(due.map(e => e.id), [1])
})

test('EVENT_ALERT_LEAD_OPTIONS offers an off (0) choice while keeping the 15 minute default', () => {
  assert.ok(EVENT_ALERT_LEAD_OPTIONS.includes(0))
  assert.equal(DEFAULT_EVENT_ALERT_LEAD_MINUTES, 15)
})

test('isWithinQuietHours is always false when disabled', () => {
  assert.equal(isWithinQuietHours(new Date(2026, 0, 1, 23, 0), { enabled: false, start: '22:00', end: '08:00' }), false)
})

test('isWithinQuietHours handles an overnight window', () => {
  const quiet = { enabled: true, start: '22:00', end: '08:00' }
  assert.equal(isWithinQuietHours(new Date(2026, 0, 1, 23, 0), quiet), true)
  assert.equal(isWithinQuietHours(new Date(2026, 0, 2, 3, 0), quiet), true)
  assert.equal(isWithinQuietHours(new Date(2026, 0, 1, 12, 0), quiet), false)
  assert.equal(isWithinQuietHours(new Date(2026, 0, 1, 8, 0), quiet), false)
})

test('isWithinQuietHours handles a same-day window', () => {
  const quiet = { enabled: true, start: '13:00', end: '14:00' }
  assert.equal(isWithinQuietHours(new Date(2026, 0, 1, 13, 30), quiet), true)
  assert.equal(isWithinQuietHours(new Date(2026, 0, 1, 15, 0), quiet), false)
})
