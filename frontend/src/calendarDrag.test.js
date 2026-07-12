import test from 'node:test'
import assert from 'node:assert/strict'
import { moveEventToDay } from './calendarDrag.js'

const event = { start_at: '2026-07-10T14:00:00', end_at: '2026-07-10T15:30:00' }

test('moveEventToDay keeps time of day and duration', () => {
  assert.deepEqual(moveEventToDay(event, '2026-07-15'),
    { start_at: '2026-07-15T14:00:00', end_at: '2026-07-15T15:30:00' })
  assert.deepEqual(moveEventToDay(event, '2026-07-08'),
    { start_at: '2026-07-08T14:00:00', end_at: '2026-07-08T15:30:00' })
})

test('moveEventToDay shifts multi-day events without shortening them', () => {
  const long = { start_at: '2026-07-10T22:00:00', end_at: '2026-07-11T02:00:00' }
  assert.deepEqual(moveEventToDay(long, '2026-07-20'),
    { start_at: '2026-07-20T22:00:00', end_at: '2026-07-21T02:00:00' })
})

test('moveEventToDay crosses month boundaries', () => {
  assert.deepEqual(moveEventToDay(event, '2026-08-02'),
    { start_at: '2026-08-02T14:00:00', end_at: '2026-08-02T15:30:00' })
})

test('moveEventToDay returns null for same-day drops and bad input', () => {
  assert.equal(moveEventToDay(event, '2026-07-10'), null)
  assert.equal(moveEventToDay({}, '2026-07-15'), null)
  assert.equal(moveEventToDay(event, null), null)
})
