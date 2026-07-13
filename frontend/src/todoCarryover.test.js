import { test } from 'node:test'
import assert from 'node:assert/strict'
import { overdueIncompleteTodos } from './todoCarryover.js'

test('overdueIncompleteTodos keeps only incomplete todos before today', () => {
  const todos = [
    { id: 1, todo_date: '2026-07-10', completed: false },
    { id: 2, todo_date: '2026-07-10', completed: true },
    { id: 3, todo_date: '2026-07-13', completed: false },
    { id: 4, todo_date: '2026-07-12', completed: false },
  ]
  const result = overdueIncompleteTodos(todos, '2026-07-13')
  assert.deepEqual(result.map(t => t.id), [1, 4])
})

test('overdueIncompleteTodos returns empty for no todos or missing today', () => {
  assert.deepEqual(overdueIncompleteTodos([], '2026-07-13'), [])
  assert.deepEqual(overdueIncompleteTodos([{ id: 1, todo_date: '2026-07-10', completed: false }], ''), [])
  assert.deepEqual(overdueIncompleteTodos(null, '2026-07-13'), [])
})
