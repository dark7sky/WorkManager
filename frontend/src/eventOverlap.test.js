import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findOverlappingEvents } from './eventOverlap.js'

const events = [
  { id: 1, title: '기존 회의', start_at: '2026-07-14T10:00:00', end_at: '2026-07-14T11:00:00' },
  { id: 2, title: '점심', start_at: '2026-07-14T12:00:00', end_at: '2026-07-14T13:00:00' },
  { id: 3, title: '삭제된 일정', start_at: '2026-07-14T10:30:00', end_at: '2026-07-14T11:30:00', deleted_at: '2026-07-13T00:00:00' },
]

test('finds an event whose range overlaps the candidate range', () => {
  const result = findOverlappingEvents('2026-07-14T10:30:00', '2026-07-14T11:30:00', events, null)
  assert.deepEqual(result.map(e => e.id), [1])
})

test('excludes the event being edited', () => {
  const result = findOverlappingEvents('2026-07-14T10:00:00', '2026-07-14T11:00:00', events, 1)
  assert.equal(result.length, 0)
})

test('does not flag back-to-back events that only touch at the boundary', () => {
  const result = findOverlappingEvents('2026-07-14T11:00:00', '2026-07-14T12:00:00', events, null)
  assert.equal(result.length, 0)
})

test('ignores soft-deleted events', () => {
  const result = findOverlappingEvents('2026-07-14T10:45:00', '2026-07-14T11:15:00', events, null)
  assert.deepEqual(result.map(e => e.id), [1])
})

test('returns nothing for an invalid or inverted range', () => {
  assert.equal(findOverlappingEvents('bad', '2026-07-14T11:00:00', events, null).length, 0)
  assert.equal(findOverlappingEvents('2026-07-14T11:00:00', '2026-07-14T10:00:00', events, null).length, 0)
})
