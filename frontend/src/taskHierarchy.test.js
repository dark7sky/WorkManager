import assert from 'node:assert/strict'
import { test } from 'node:test'

import { orderTasksHierarchically, subtaskCompletionSummary, subtaskRowClass, taskIndent, taskParentOptions, taskDependencyOptions } from './taskHierarchy.js'

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

test('taskDependencyOptions excludes tasks that already transitively depend on the current task', () => {
  const linked = [
    { id: 1, title: 'Alpha' },
    { id: 2, title: 'Bravo', dependency_ids: [1] },
    { id: 3, title: 'Charlie', dependency_ids: [2] },
    { id: 4, title: 'Delta' },
  ]
  assert.deepEqual(taskDependencyOptions(linked, 1).map(option => option.id), [4])
  assert.deepEqual(taskDependencyOptions(linked, 2).map(option => option.id), [1, 4])
})

test('taskDependencyOptions includes all tasks when creating a new task', () => {
  const linked = [
    { id: 1, title: 'Alpha' },
    { id: 2, title: 'Bravo', dependency_ids: [1] },
  ]
  assert.deepEqual(taskDependencyOptions(linked).map(option => option.id), [1, 2])
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

test('orderTasksHierarchically sorts siblings by priority when sortBy is priority', () => {
  const items = [
    { id: 1, title: 'Zeta', priority: 'low', start_date: '2026-07-01' },
    { id: 2, title: 'Alpha', priority: 'high', start_date: '2026-07-20' },
    { id: 3, title: 'Beta', priority: 'normal', start_date: '2026-07-10' },
  ]
  const ordered = orderTasksHierarchically(items, items, 'priority')
  assert.deepEqual(ordered.map(item => item.task.id), [2, 3, 1])
})

test('orderTasksHierarchically sorts siblings by progress descending when sortBy is progress', () => {
  const items = [
    { id: 1, title: 'Zeta', progress: 10 },
    { id: 2, title: 'Alpha', progress: 90 },
    { id: 3, title: 'Beta', progress: 50 },
  ]
  const ordered = orderTasksHierarchically(items, items, 'progress')
  assert.deepEqual(ordered.map(item => item.task.id), [2, 3, 1])
})

test('orderTasksHierarchically sorts siblings by title when sortBy is title', () => {
  const items = [
    { id: 1, title: 'Zeta' },
    { id: 2, title: 'Alpha' },
    { id: 3, title: 'Beta' },
  ]
  const ordered = orderTasksHierarchically(items, items, 'title')
  assert.deepEqual(ordered.map(item => item.task.id), [2, 3, 1])
})

test('orderTasksHierarchically keeps children grouped under their parent regardless of sortBy', () => {
  const ordered = orderTasksHierarchically([tasks[3], tasks[2], tasks[1], tasks[0]], tasks, 'title')
  assert.deepEqual(ordered.map(item => [item.task.id, item.depth]), [[1, 0], [2, 1], [3, 2], [4, 0]])
})

test('subtaskRowClass leaves top-level rows unmarked and shrinks nested rows deeper per depth, capped at 3', () => {
  assert.equal(subtaskRowClass(0), '')
  assert.equal(subtaskRowClass(1), ' subtask-row subtask-depth-1')
  assert.equal(subtaskRowClass(2), ' subtask-row subtask-depth-2')
  assert.equal(subtaskRowClass(3), ' subtask-row subtask-depth-3')
  assert.equal(subtaskRowClass(5), ' subtask-row subtask-depth-3')
})

test('taskIndent increases with depth and caps indentation beyond depth 5', () => {
  assert.equal(taskIndent(0), '8px')
  assert.equal(taskIndent(1), '26px')
  assert.equal(taskIndent(3), '62px')
  assert.equal(taskIndent(5), '98px')
  assert.equal(taskIndent(9), '98px')
})
