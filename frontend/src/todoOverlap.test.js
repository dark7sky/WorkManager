import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findOverlappingTodos } from './todoOverlap.js'

const todos = [
  { id: 1, title: '기존 할 일', todo_date: '2026-07-19', todo_time: '10:00', completed: false },
  { id: 2, title: '완료된 할 일', todo_date: '2026-07-19', todo_time: '11:00', completed: true },
  { id: 3, title: '삭제된 할 일', todo_date: '2026-07-19', todo_time: '10:00', completed: false, deleted_at: '2026-07-18T00:00:00' },
]

test('finds a todo at the same date and time', () => {
  const result = findOverlappingTodos('2026-07-19', '10:00', todos, null)
  assert.deepEqual(result.map(t => t.id), [1])
})

test('excludes the todo being edited', () => {
  const result = findOverlappingTodos('2026-07-19', '10:00', todos, 1)
  assert.equal(result.length, 0)
})

test('ignores completed todos', () => {
  const result = findOverlappingTodos('2026-07-19', '11:00', todos, null)
  assert.equal(result.length, 0)
})

test('ignores soft-deleted todos', () => {
  const result = findOverlappingTodos('2026-07-19', '10:00', todos.filter(t => t.id !== 1), null)
  assert.equal(result.length, 0)
})

test('returns nothing when date or time is missing', () => {
  assert.equal(findOverlappingTodos('', '10:00', todos, null).length, 0)
  assert.equal(findOverlappingTodos('2026-07-19', '', todos, null).length, 0)
})

test('ignores todos on a different date', () => {
  const result = findOverlappingTodos('2026-07-20', '10:00', todos, null)
  assert.equal(result.length, 0)
})

test('ignores todos at a different time', () => {
  const result = findOverlappingTodos('2026-07-19', '09:00', todos, null)
  assert.equal(result.length, 0)
})
