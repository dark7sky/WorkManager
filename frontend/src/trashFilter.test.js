import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filterTrashItems, trashTables } from './trashFilter.js'

const items = [
  { table: 'tasks', id: 1, title: '보고서 작성' },
  { table: 'events', id: 2, title: '팀 회의' },
  { table: 'todos', id: 3, title: '이메일 확인' },
  { table: 'work_logs', id: 4, content: '보고서 초안 검토 기록' },
]

test('filterTrashItems returns all items with default filters', () => {
  assert.equal(filterTrashItems(items, {}).length, 4)
})

test('filterTrashItems matches query against title and content', () => {
  const result = filterTrashItems(items, { query: '보고서' })
  assert.deepEqual(result.map(i => i.id), [1, 4])
})

test('filterTrashItems is case-insensitive', () => {
  const result = filterTrashItems(items, { query: '회의' })
  assert.deepEqual(result.map(i => i.id), [2])
})

test('filterTrashItems filters by table', () => {
  const result = filterTrashItems(items, { table: 'todos' })
  assert.deepEqual(result.map(i => i.id), [3])
})

test('filterTrashItems combines table and query filters', () => {
  const result = filterTrashItems(items, { table: 'work_logs', query: '보고서' })
  assert.deepEqual(result.map(i => i.id), [4])
})

test('trashTables lists distinct tables present in items', () => {
  assert.deepEqual(trashTables(items), ['tasks', 'events', 'todos', 'work_logs'])
})
