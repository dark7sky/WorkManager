import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filterTodosByQuery, filterLogsByQuery, filterTodosByPriority, filterTodosByCompleted, filterLogsByPriority, filterLogsByBillable } from './todaySearch.js'

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

test('filterTodosByQuery matches by checklist item text', () => {
  const withChecklist = [...todos, { id: 4, title: '여행 준비', checklist: [{ text: '여권 확인', done: false }] }]
  assert.deepEqual(filterTodosByQuery(withChecklist, '여권').map(t => t.id), [4])
})

test('filterLogsByQuery matches by checklist item text', () => {
  const withChecklist = [...logs, { id: 3, content: '배포 작업', checklist: [{ text: '롤백 스크립트 점검', done: false }] }]
  assert.deepEqual(filterLogsByQuery(withChecklist, '롤백').map(l => l.id), [3])
})

test('filterTodosByQuery matches by attachment filename', () => {
  const withAttachment = [...todos, { id: 5, title: '계약서 검토', attachment_names: ['contract_v2.pdf'] }]
  assert.deepEqual(filterTodosByQuery(withAttachment, 'contract_v2').map(t => t.id), [5])
})

test('filterLogsByQuery matches by attachment filename', () => {
  const withAttachment = [...logs, { id: 4, content: '분석 자료 첨부', attachment_names: ['report.xlsx'] }]
  assert.deepEqual(filterLogsByQuery(withAttachment, 'report.xlsx').map(l => l.id), [4])
})

test('filterTodosByQuery matches by custom field label or value', () => {
  const withCustomField = [...todos, { id: 6, title: '계약 갱신', custom_fields: [{ label: '거래처', value: 'acme co' }] }]
  assert.deepEqual(filterTodosByQuery(withCustomField, 'acme co').map(t => t.id), [6])
})

test('filterLogsByQuery matches by custom field label or value', () => {
  const withCustomField = [...logs, { id: 5, content: '견적 검토', custom_fields: [{ label: '프로젝트 코드', value: 'PRJ-2026' }] }]
  assert.deepEqual(filterLogsByQuery(withCustomField, 'PRJ-2026').map(l => l.id), [5])
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

test('filterTodosByCompleted keeps all todos when not hiding', () => {
  const withCompleted = [...todos, { id: 4, title: '완료된 항목', completed: true }]
  assert.equal(filterTodosByCompleted(withCompleted, false).length, 4)
})

test('filterTodosByCompleted excludes completed todos when hiding', () => {
  const withCompleted = [...todos, { id: 4, title: '완료된 항목', completed: true }]
  assert.deepEqual(filterTodosByCompleted(withCompleted, true).map(t => t.id), [1, 2, 3])
})

test('filterLogsByPriority returns all logs when priority is all', () => {
  const priorityLogs = [{ id: 1, content: '보고서', priority: 'high' }, { id: 2, content: '통화' }]
  assert.equal(filterLogsByPriority(priorityLogs, 'all').length, 2)
  assert.equal(filterLogsByPriority(priorityLogs).length, 2)
})

test('filterLogsByPriority matches an explicit priority and treats missing as normal', () => {
  const priorityLogs = [{ id: 1, content: '보고서', priority: 'high' }, { id: 2, content: '통화' }]
  assert.deepEqual(filterLogsByPriority(priorityLogs, 'high').map(l => l.id), [1])
  assert.deepEqual(filterLogsByPriority(priorityLogs, 'normal').map(l => l.id), [2])
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
