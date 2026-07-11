import assert from 'node:assert/strict'
import { test } from 'node:test'

import { orderTasksHierarchically, subtaskCompletionSummary, taskParentOptions } from './taskHierarchy.js'

const tasks = [
  { id: 1, title: 'Alpha' },
  { id: 2, title: 'Bravo', parent_id: 1, status: 'done' },
  { id: 3, title: 'Charlie', parent_id: 2 },
  { id: 4, title: 'Delta' },
]

test('taskParentOptions excludes the current task and descendants', () => {
  assert.deepEqual(taskParentOptions(tasks, 1).map(option => option.id), [4])
  assert.deepEqual(taskParentOptions(tasks, 2).map(option => option.id), [1, 4])
})

test('taskParentOptions includes all tasks when creating a new child task', () => {
  assert.deepEqual(taskParentOptions(tasks).map(option => option.id), [1, 2, 3, 4])
})

test('taskParentOptions labels nested parent choices with hierarchy depth', () => {
  assert.deepEqual(taskParentOptions(tasks).map(option => option.label), ['Alpha', '-- Bravo', '-- -- Charlie', 'Delta'])
})

test('orderTasksHierarchically places children directly below visible parents', () => {
  const ordered = orderTasksHierarchically([tasks[3], tasks[2], tasks[1], tasks[0]], tasks)
  assert.deepEqual(ordered.map(item => [item.task.id, item.depth]), [[1, 0], [2, 1], [3, 2], [4, 0]])
})

test('orderTasksHierarchically keeps matching children visible when parent is filtered out', () => {
  const ordered = orderTasksHierarchically([tasks[2], tasks[3]], tasks)
  assert.deepEqual(ordered.map(item => [item.task.id, item.depth]), [[3, 2], [4, 0]])
})

test('subtaskCompletionSummary counts direct children only and reports done vs total', () => {
  assert.deepEqual(subtaskCompletionSummary(tasks, 1), { total: 1, done: 1 })
  assert.deepEqual(subtaskCompletionSummary(tasks, 2), { total: 1, done: 0 })
})

test('subtaskCompletionSummary returns null for tasks without children', () => {
  assert.equal(subtaskCompletionSummary(tasks, 3), null)
  assert.equal(subtaskCompletionSummary(tasks, 4), null)
})

test('orderTasksHierarchically sorts sibling tasks by start date instead of title', () => {
  const scheduled = [
    { id: 1, title: 'Zeta', start_date: '2026-07-10' },
    { id: 2, title: 'Alpha', start_date: '2026-07-20' },
    { id: 3, title: 'Beta', start_date: null },
  ]
  const ordered = orderTasksHierarchically(scheduled, scheduled)
  assert.deepEqual(ordered.map(item => item.task.id), [1, 2, 3])
})
