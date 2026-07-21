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

test('expands biweekly occurrences', () => {
  const result = expandRecurringEvent(basePayload, 'biweekly', '2026-08-10')
  assert.equal(result.length, 3)
  assert.equal(result[0].start_at, '2026-07-13T10:00:00')
  assert.equal(result[1].start_at, '2026-07-27T10:00:00')
  assert.equal(result[2].start_at, '2026-08-10T10:00:00')
})

test('expands weekdays occurrences, skipping weekends', () => {
  const result = expandRecurringEvent(basePayload, 'weekdays', '2026-07-20')
  assert.deepEqual(result.map(e => e.start_at.slice(0, 10)),
    ['2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16', '2026-07-17', '2026-07-20'])
})

test('expands daily occurrences', () => {
  const result = expandRecurringEvent(basePayload, 'daily', '2026-07-16')
  assert.deepEqual(result.map(e => e.start_at.slice(0, 10)), ['2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16'])
})

test('expands yearly occurrences', () => {
  const result = expandRecurringEvent(basePayload, 'yearly', '2028-07-13')
  assert.deepEqual(result.map(e => e.start_at.slice(0, 10)), ['2026-07-13', '2027-07-13', '2028-07-13'])
})

test('caps at 52 occurrences for a far-future until date', () => {
  const result = expandRecurringEvent(basePayload, 'daily', '2030-01-01')
  assert.equal(result.length, 52)
})

test('falls back to a single event when until is before start', () => {
  const result = expandRecurringEvent(basePayload, 'weekly', '2026-07-01')
  assert.deepEqual(result, [basePayload])
})

test('stamps a shared recurrence_group_id on multi-occurrence series but not single occurrences', () => {
  const series = expandRecurringEvent(basePayload, 'weekly', '2026-07-27')
  assert.equal(series.length, 3)
  assert.ok(series[0].recurrence_group_id)
  assert.equal(series[1].recurrence_group_id, series[0].recurrence_group_id)
  assert.equal(series[2].recurrence_group_id, series[0].recurrence_group_id)
  const single = expandRecurringEvent(basePayload, null, null)
  assert.equal(single[0].recurrence_group_id, undefined)
})
