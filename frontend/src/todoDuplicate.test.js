import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildTodoDuplicatePayload } from './todoDuplicate.js'

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
