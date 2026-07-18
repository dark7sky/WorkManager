import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findOverlappingWorkLogs } from './workLogOverlap.js'

const logs = [
  { id: 1, content: '기존 작업', log_date: '2026-07-19', log_time: '10:00', duration_minutes: 60 },
  { id: 2, content: '점심', log_date: '2026-07-19', log_time: '12:00', duration_minutes: 60 },
  { id: 3, content: '삭제된 기록', log_date: '2026-07-19', log_time: '10:30', duration_minutes: 60, deleted_at: '2026-07-18T00:00:00' },
]

test('finds a work log whose time range overlaps the candidate range', () => {
  const result = findOverlappingWorkLogs('2026-07-19', '10:30', 60, logs, null)
  assert.deepEqual(result.map(l => l.id), [1])
})

test('excludes the log being edited', () => {
  const result = findOverlappingWorkLogs('2026-07-19', '10:00', 60, logs, 1)
  assert.equal(result.length, 0)
})

test('does not flag back-to-back logs that only touch at the boundary', () => {
  const result = findOverlappingWorkLogs('2026-07-19', '11:00', 60, logs, null)
  assert.equal(result.length, 0)
})

test('ignores soft-deleted logs', () => {
  const result = findOverlappingWorkLogs('2026-07-19', '10:45', 30, logs, null)
  assert.deepEqual(result.map(l => l.id), [1])
})

test('returns nothing when date or time is missing', () => {
  assert.equal(findOverlappingWorkLogs('', '10:00', 60, logs, null).length, 0)
  assert.equal(findOverlappingWorkLogs('2026-07-19', '', 60, logs, null).length, 0)
})

test('ignores logs on a different date', () => {
  const result = findOverlappingWorkLogs('2026-07-20', '10:30', 60, logs, null)
  assert.equal(result.length, 0)
})
