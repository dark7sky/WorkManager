import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findDuplicateTitleTodos } from './todoDuplicateCheck.js'

const todos = [
  { id: 1, title: '보고서 검토', completed: false },
  { id: 2, title: '보고서 검토', completed: true },
  { id: 3, title: '  회의 준비 ', completed: false },
  { id: 4, title: '삭제된 할일', completed: false, deleted_at: '2026-07-20T00:00:00Z' },
]

test('finds todos with a matching title, ignoring case and whitespace', () => {
  const result = findDuplicateTitleTodos('보고서 검토', todos)
  assert.deepEqual(result.map(t => t.id), [1])
})

test('matches trimmed titles regardless of surrounding whitespace', () => {
  const result = findDuplicateTitleTodos(' 회의 준비', todos)
  assert.deepEqual(result.map(t => t.id), [3])
})

test('excludes completed todos', () => {
  const result = findDuplicateTitleTodos('보고서 검토', todos)
  assert.equal(result.some(t => t.id === 2), false)
})

test('excludes soft-deleted todos', () => {
  const result = findDuplicateTitleTodos('삭제된 할일', todos)
  assert.deepEqual(result, [])
})

test('excludes the todo currently being edited', () => {
  const result = findDuplicateTitleTodos('보고서 검토', todos, 1)
  assert.deepEqual(result, [])
})

test('returns empty array for blank or missing title', () => {
  assert.deepEqual(findDuplicateTitleTodos('', todos), [])
  assert.deepEqual(findDuplicateTitleTodos('   ', todos), [])
  assert.deepEqual(findDuplicateTitleTodos(undefined, todos), [])
})
