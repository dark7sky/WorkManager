import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildTodoDuplicatePayload, buildTaskFromTodoPayload } from './todoDuplicate.js'

test('buildTodoDuplicatePayload copies fields, resets completion and dates to today', () => {
  const todo = { id: 3, title: '우유 사기', completed: true, tags: ['생활'], recurrence_rule: 'daily', todo_date: '2026-07-01', priority: 'high' }
  const result = buildTodoDuplicatePayload(todo)
  assert.equal(result.title, '우유 사기 (사본)')
  assert.equal(result.completed, false)
  assert.equal(result.todo_date, new Date().toLocaleDateString('en-CA'))
  assert.deepEqual(result.tags, ['생활'])
  assert.equal(result.recurrence_rule, 'daily')
  assert.equal(result.priority, 'high')
})

test('buildTodoDuplicatePayload handles missing optional fields', () => {
  const result = buildTodoDuplicatePayload({ title: '청소' })
  assert.equal(result.title, '청소 (사본)')
  assert.deepEqual(result.tags, [])
  assert.equal(result.recurrence_rule, null)
  assert.equal(result.priority, 'normal')
})

test('buildTaskFromTodoPayload carries title/tags/priority/due date and completion state', () => {
  const todo = { id: 5, title: '보고서 제출', completed: false, tags: ['업무'], todo_date: '2026-07-15', priority: 'high' }
  const result = buildTaskFromTodoPayload(todo)
  assert.equal(result.title, '보고서 제출')
  assert.deepEqual(result.tags, ['업무'])
  assert.equal(result.priority, 'high')
  assert.equal(result.due_date, '2026-07-15')
  assert.equal(result.status, 'todo')
  assert.equal(result.progress, 0)
})

test('buildTaskFromTodoPayload maps a completed todo to a done task', () => {
  const result = buildTaskFromTodoPayload({ title: '정리', completed: true })
  assert.equal(result.status, 'done')
  assert.equal(result.progress, 100)
  assert.equal(result.priority, 'normal')
  assert.equal(result.due_date, null)
})

test('buildTodoDuplicatePayload and buildTaskFromTodoPayload carry link_url', () => {
  const todo = { title: '자료 확인', link_url: 'https://example.com' }
  assert.equal(buildTodoDuplicatePayload(todo).link_url, 'https://example.com')
  assert.equal(buildTaskFromTodoPayload(todo).link_url, 'https://example.com')
  assert.equal(buildTaskFromTodoPayload({ title: '무제' }).link_url, null)
})
