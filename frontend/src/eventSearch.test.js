import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filterEventsByPriority, filterEventsByQuery } from './eventSearch.js'

const events = [
  { id: 1, title: '팀 회의', location: '3층 회의실', description: '', priority: 'high' },
  { id: 2, title: '병원 예약', location: '', description: '정기 검진', priority: 'low' },
  { id: 3, title: '고객 미팅', location: '강남 사무실', description: '' },
  { id: 4, title: '워크숍', location: '', description: '', priority: 'high', tags: ['긴급', '외부'] },
]

test('filterEventsByQuery returns all events for an empty query', () => {
  assert.equal(filterEventsByQuery(events, '').length, 4)
  assert.equal(filterEventsByQuery(events).length, 4)
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

test('filterEventsByQuery matches by tags', () => {
  assert.deepEqual(filterEventsByQuery(events, '외부').map(e => e.id), [4])
})

test('filterEventsByQuery matches by checklist item text', () => {
  const withChecklist = [...events, { id: 5, title: '컨퍼런스', checklist: [{ text: '배너 인쇄 확인', done: false }] }]
  assert.deepEqual(filterEventsByQuery(withChecklist, '배너 인쇄').map(e => e.id), [5])
})

test('filterEventsByQuery matches by attachment filename', () => {
  const withAttachment = [...events, { id: 6, title: '분기 결산', attachment_names: ['Q3_budget_final.xlsx'] }]
  assert.deepEqual(filterEventsByQuery(withAttachment, 'Q3_budget').map(e => e.id), [6])
})

test('filterEventsByQuery matches by custom field label or value', () => {
  const withCustomField = [...events, { id: 7, title: '분기 리뷰', custom_fields: [{ label: '담당팀', value: 'growth squad' }] }]
  assert.deepEqual(filterEventsByQuery(withCustomField, 'growth squad').map(e => e.id), [7])
})

test('filterEventsByPriority returns all events for "all"', () => {
  assert.equal(filterEventsByPriority(events, 'all').length, 4)
  assert.equal(filterEventsByPriority(events).length, 4)
})

test('filterEventsByPriority matches high priority', () => {
  assert.deepEqual(filterEventsByPriority(events, 'high').map(e => e.id), [1, 4])
})

test('filterEventsByPriority treats missing priority as normal', () => {
  assert.deepEqual(filterEventsByPriority(events, 'normal').map(e => e.id), [3])
})
