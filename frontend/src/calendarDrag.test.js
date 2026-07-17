import test from 'node:test'
import assert from 'node:assert/strict'
import { moveEventToDay, postponeEventDates } from './calendarDrag.js'

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

test('postponeEventDates shifts start/end forward keeping time of day and duration', () => {
  assert.deepEqual(postponeEventDates(event, 3),
    { start_at: '2026-07-13T14:00:00', end_at: '2026-07-13T15:30:00' })
  assert.deepEqual(postponeEventDates(event),
    { start_at: '2026-07-11T14:00:00', end_at: '2026-07-11T15:30:00' })
})

test('postponeEventDates crosses month boundaries', () => {
  const endOfMonth = { start_at: '2026-07-30T09:00:00', end_at: '2026-07-30T10:00:00' }
  assert.deepEqual(postponeEventDates(endOfMonth, 2),
    { start_at: '2026-08-01T09:00:00', end_at: '2026-08-01T10:00:00' })
})

test('postponeEventDates returns null for missing start or zero delta', () => {
  assert.equal(postponeEventDates({}, 1), null)
  assert.equal(postponeEventDates(event, 0), null)
})
