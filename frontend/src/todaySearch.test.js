import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filterTodosByQuery, filterLogsByQuery, filterTodosByPriority, filterLogsByBillable } from './todaySearch.js'

const todos = [
  { id: 1, title: '보고서 작성', priority: 'high' },
  { id: 2, title: '이메일 확인', priority: 'low', memo: '결제 승인 필요' },
  { id: 3, title: '팀 회의 준비', tags: ['urgent'] },
]

const logs = [
  { id: 1, content: '주간 보고서 초안 작성' },
  { id: 2, content: '고객 통화', tags: ['sales'] },
]

const billingLogs = [
  { id: 1, content: '청구 가능 작업', billable: true },
  { id: 2, content: '내부 작업', billable: false },
  { id: 3, content: '태그 없는 작업' },
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

test('filterTodosByQuery matches by memo text', () => {
  assert.deepEqual(filterTodosByQuery(todos, '결제 승인').map(t => t.id), [2])
})

test('filterTodosByQuery matches by tags', () => {
  assert.deepEqual(filterTodosByQuery(todos, 'urgent').map(t => t.id), [3])
})

test('filterLogsByQuery matches by tags', () => {
  assert.deepEqual(filterLogsByQuery(logs, 'sales').map(l => l.id), [2])
})

test('filterTodosByPriority returns all todos when priority is all', () => {
  assert.equal(filterTodosByPriority(todos, 'all').length, 3)
  assert.equal(filterTodosByPriority(todos).length, 3)
})

test('filterTodosByPriority matches an explicit priority', () => {
  assert.deepEqual(filterTodosByPriority(todos, 'high').map(t => t.id), [1])
})

test('filterTodosByPriority treats a missing priority as normal', () => {
  assert.deepEqual(filterTodosByPriority(todos, 'normal').map(t => t.id), [3])
})

test('filterLogsByBillable returns all logs when billable is all', () => {
  assert.equal(filterLogsByBillable(billingLogs, 'all').length, 3)
  assert.equal(filterLogsByBillable(billingLogs).length, 3)
})

test('filterLogsByBillable matches only billable logs', () => {
  assert.deepEqual(filterLogsByBillable(billingLogs, 'billable').map(l => l.id), [1])
})

test('filterLogsByBillable matches non-billable logs including missing field', () => {
  assert.deepEqual(filterLogsByBillable(billingLogs, 'non-billable').map(l => l.id), [2, 3])
})
