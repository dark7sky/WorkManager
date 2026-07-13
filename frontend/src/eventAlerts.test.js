import { test } from 'node:test'
import assert from 'node:assert/strict'
import { eventsDueForAlert, DEFAULT_EVENT_ALERT_LEAD_MINUTES } from './eventAlerts.js'

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
