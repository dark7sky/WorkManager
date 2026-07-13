import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filterEventsByQuery } from './eventSearch.js'

const events = [
  { id: 1, title: '팀 회의', location: '3층 회의실', description: '' },
  { id: 2, title: '병원 예약', location: '', description: '정기 검진' },
  { id: 3, title: '고객 미팅', location: '강남 사무실', description: '' },
]

test('filterEventsByQuery returns all events for an empty query', () => {
  assert.equal(filterEventsByQuery(events, '').length, 3)
  assert.equal(filterEventsByQuery(events).length, 3)
})

test('filterEventsByQuery matches by title', () => {
  assert.deepEqual(filterEventsByQuery(events, '회의').map(e => e.id), [1])
})

test('filterEventsByQuery matches by location', () => {
  assert.deepEqual(filterEventsByQuery(events, '강남').map(e => e.id), [3])
})

test('filterEventsByQuery matches by description case-insensitively and trims whitespace', () => {
  assert.deepEqual(filterEventsByQuery(events, '  검진  ').map(e => e.id), [2])
})
