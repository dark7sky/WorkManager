import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findDuplicateTitleTasks } from './taskDuplicateCheck.js'

const tasks = [
  { id: 1, title: '보고서 작성', status: 'todo' },
  { id: 2, title: '보고서 작성', status: 'done' },
  { id: 3, title: '  회의 준비 ', status: 'in_progress' },
  { id: 4, title: '삭제된 업무', status: 'todo', deleted_at: '2026-07-20T00:00:00Z' },
]

test('finds tasks with a matching title, ignoring case and whitespace', () => {
  const result = findDuplicateTitleTasks('보고서 작성', tasks)
  assert.deepEqual(result.map(t => t.id), [1])
})

test('matches trimmed titles regardless of surrounding whitespace', () => {
  const result = findDuplicateTitleTasks(' 회의 준비', tasks)
  assert.deepEqual(result.map(t => t.id), [3])
})

test('excludes done tasks', () => {
  const result = findDuplicateTitleTasks('보고서 작성', tasks)
  assert.equal(result.some(t => t.id === 2), false)
})

test('excludes soft-deleted tasks', () => {
  const result = findDuplicateTitleTasks('삭제된 업무', tasks)
  assert.deepEqual(result, [])
})

test('excludes the task currently being edited', () => {
  const result = findDuplicateTitleTasks('보고서 작성', tasks, 1)
  assert.deepEqual(result, [])
})

test('returns empty array for blank or missing title', () => {
  assert.deepEqual(findDuplicateTitleTasks('', tasks), [])
  assert.deepEqual(findDuplicateTitleTasks('   ', tasks), [])
  assert.deepEqual(findDuplicateTitleTasks(undefined, tasks), [])
})
