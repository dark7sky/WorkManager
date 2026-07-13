import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filterTodosByQuery, filterLogsByQuery } from './todaySearch.js'

const todos = [
  { id: 1, title: '보고서 작성' },
  { id: 2, title: '이메일 확인' },
  { id: 3, title: '팀 회의 준비' },
]

const logs = [
  { id: 1, content: '주간 보고서 초안 작성' },
  { id: 2, content: '고객 통화' },
]

test('filterTodosByQuery returns all todos for an empty query', () => {
  assert.equal(filterTodosByQuery(todos, '').length, 3)
  assert.equal(filterTodosByQuery(todos).length, 3)
})

test('filterTodosByQuery matches by title case-insensitively and trims whitespace', () => {
  assert.deepEqual(filterTodosByQuery(todos, '  회의  ').map(t => t.id), [3])
})

test('filterLogsByQuery returns all logs for an empty query', () => {
  assert.equal(filterLogsByQuery(logs, '').length, 2)
})

test('filterLogsByQuery matches by content', () => {
  assert.deepEqual(filterLogsByQuery(logs, '보고서').map(l => l.id), [1])
})
