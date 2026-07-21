import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findDuplicateTitleEvents } from './eventDuplicateCheck.js'

const events = [
  { id: 1, title: '팀 회의' },
  { id: 2, title: '  팀 회의 ' },
  { id: 3, title: '삭제된 일정', deleted_at: '2026-07-20T00:00:00Z' },
]

test('finds events with a matching title, ignoring case and whitespace', () => {
  const result = findDuplicateTitleEvents('팀 회의', events)
  assert.deepEqual(result.map(e => e.id), [1, 2])
})

test('excludes soft-deleted events', () => {
  const result = findDuplicateTitleEvents('삭제된 일정', events)
  assert.deepEqual(result, [])
})

test('excludes the event currently being edited', () => {
  const result = findDuplicateTitleEvents('팀 회의', events, 1)
  assert.deepEqual(result.map(e => e.id), [2])
})

test('returns empty array for blank or missing title', () => {
  assert.deepEqual(findDuplicateTitleEvents('', events), [])
  assert.deepEqual(findDuplicateTitleEvents('   ', events), [])
  assert.deepEqual(findDuplicateTitleEvents(undefined, events), [])
})
