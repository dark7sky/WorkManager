import { test } from 'node:test'
import assert from 'node:assert/strict'
import { expandRecurringEvent } from './eventRecurrence.js'

const basePayload = { title: '주간 회의', start_at: '2026-07-13T10:00:00', end_at: '2026-07-13T11:00:00', location: '', tags: [] }

test('returns the single payload when no rule is given', () => {
  const result = expandRecurringEvent(basePayload, null, null)
  assert.deepEqual(result, [basePayload])
})

test('expands weekly occurrences until the end date, preserving duration', () => {
  const result = expandRecurringEvent(basePayload, 'weekly', '2026-07-27')
  assert.equal(result.length, 3)
  assert.equal(result[0].start_at, '2026-07-13T10:00:00')
  assert.equal(result[1].start_at, '2026-07-20T10:00:00')
  assert.equal(result[1].end_at, '2026-07-20T11:00:00')
  assert.equal(result[2].start_at, '2026-07-27T10:00:00')
})

test('expands daily occurrences', () => {
  const result = expandRecurringEvent(basePayload, 'daily', '2026-07-16')
  assert.deepEqual(result.map(e => e.start_at.slice(0, 10)), ['2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16'])
})

test('caps at 52 occurrences for a far-future until date', () => {
  const result = expandRecurringEvent(basePayload, 'daily', '2030-01-01')
  assert.equal(result.length, 52)
})

test('falls back to a single event when until is before start', () => {
  const result = expandRecurringEvent(basePayload, 'weekly', '2026-07-01')
  assert.deepEqual(result, [basePayload])
})
