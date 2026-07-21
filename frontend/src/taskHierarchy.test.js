import assert from 'node:assert/strict'
import { test } from 'node:test'

import { criticalPathTaskIds, DEFAULT_TASK_SORT, directDependentTasks, loadTaskSort, matchesDependencyFilter, orderTasksHierarchically, saveTaskSort, subtaskCompletionSummary, subtaskRowClass, taskIndent, taskParentOptions, taskDependencyOptions, taskBulkParentOptions } from './taskHierarchy.js'

class MemoryStorage {
  constructor() { this.store = new Map() }
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null }
  setItem(key, value) { this.store.set(key, String(value)) }
}

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

test('taskParentOptions keeps the current parent selectable even when archived/missing from the list', () => {
  const options = taskParentOptions(tasks, 3, 99)
  assert.deepEqual(options[0], { id: 99, label: '#99 (보관됨/목록에 없음)' })
})

test('taskDependencyOptions keeps current dependencies selectable even when archived/missing from the list', () => {
  const options = taskDependencyOptions(tasks, 3, [99])
  assert.ok(options.some(option => option.id === 99))
})

test('taskBulkParentOptions excludes every selected task and all their descendants', () => {
  assert.deepEqual(taskBulkParentOptions(tasks, [2]).map(o => o.id), [1, 4])
  assert.deepEqual(taskBulkParentOptions(tasks, [1]).map(o => o.id), [4])
  assert.deepEqual(taskBulkParentOptions(tasks, [1, 4]).map(o => o.id), [])
})

test('orderTasksHierarchically places children directly below visible parents', () => {
  const ordered = orderTasksHierarchically([tasks[3], tasks[2], tasks[1], tasks[0]], tasks)
  assert.deepEqual(ordered.map(item => [item.task.id, item.depth]), [[1, 0], [2, 1], [3, 2], [4, 0]])
})

test('orderTasksHierarchically keeps matching children visible when parent is filtered out', () => {
  const ordered = orderTasksHierarchically([tasks[2], tasks[3]], tasks)
  assert.deepEqual(ordered.map(item => [item.task.id, item.depth]), [[3, 2], [4, 0]])
})

test('orderTasksHierarchically reports hasChildren for parent rows', () => {
  const ordered = orderTasksHierarchically([tasks[3], tasks[2], tasks[1], tasks[0]], tasks)
  assert.deepEqual(ordered.map(item => [item.task.id, item.hasChildren]), [[1, true], [2, true], [3, false], [4, false]])
})

test('orderTasksHierarchically hides descendants of collapsed tasks but keeps the task itself', () => {
  const ordered = orderTasksHierarchically([tasks[3], tasks[2], tasks[1], tasks[0]], tasks, DEFAULT_TASK_SORT, null, new Set([1]))
  assert.deepEqual(ordered.map(item => item.task.id), [1, 4])
})

test('orderTasksHierarchically only collapses direct/indirect descendants of the collapsed id, not siblings', () => {
  const ordered = orderTasksHierarchically([tasks[3], tasks[2], tasks[1], tasks[0]], tasks, DEFAULT_TASK_SORT, null, new Set([2]))
  assert.deepEqual(ordered.map(item => item.task.id), [1, 2, 4])
})

test('subtaskCompletionSummary counts direct children only and reports done vs total', () => {
  assert.deepEqual(subtaskCompletionSummary(tasks, 1), { total: 1, done: 1 })
  assert.deepEqual(subtaskCompletionSummary(tasks, 2), { total: 1, done: 0 })
})

test('loadTaskSort defaults to schedule when nothing is stored', () => {
  assert.equal(loadTaskSort(new MemoryStorage()), DEFAULT_TASK_SORT)
})

test('loadTaskSort ignores an unrecognized stored value', () => {
  const storage = new MemoryStorage()
  storage.setItem('wm-task-sort', 'bogus')
  assert.equal(loadTaskSort(storage), DEFAULT_TASK_SORT)
})

test('saveTaskSort persists a valid sort key for loadTaskSort to read back', () => {
  const storage = new MemoryStorage()
  saveTaskSort('priority', storage)
  assert.equal(loadTaskSort(storage), 'priority')
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

test('directDependentTasks lists only tasks that directly depend on the given task', () => {
  const linked = [
    { id: 1, title: 'Alpha' },
    { id: 2, title: 'Bravo', dependency_ids: [1] },
    { id: 3, title: 'Charlie', dependency_ids: [2] },
    { id: 4, title: 'Delta' },
  ]
  assert.deepEqual(directDependentTasks(linked, 1).map(t => t.id), [2])
  assert.deepEqual(directDependentTasks(linked, 2).map(t => t.id), [3])
  assert.deepEqual(directDependentTasks(linked, 4), [])
})

test('directDependentTasks returns an empty list when there is no current task', () => {
  assert.deepEqual(directDependentTasks([{ id: 1, dependency_ids: [] }]), [])
})

test('matchesDependencyFilter matches case-insensitively on the option label', () => {
  const option = { id: 1, label: '-- 분기 업무 보고서 작성' }
  assert.equal(matchesDependencyFilter(option, '보고서'), true)
  assert.equal(matchesDependencyFilter(option, 'BOGOSEO'), false)
  assert.equal(matchesDependencyFilter(option, '없는업무'), false)
})

test('matchesDependencyFilter matches everything when the query is blank', () => {
  const option = { id: 1, label: '분기 업무 보고서 작성' }
  assert.equal(matchesDependencyFilter(option, ''), true)
  assert.equal(matchesDependencyFilter(option, '   '), true)
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

test('orderTasksHierarchically puts pinned siblings first regardless of sortBy', () => {
  const items = [
    { id: 1, title: 'Zeta' },
    { id: 2, title: 'Alpha' },
    { id: 3, title: 'Beta' },
  ]
  const ordered = orderTasksHierarchically(items, items, 'title', new Set([1]))
  assert.deepEqual(ordered.map(item => item.task.id), [1, 2, 3])
})

test('orderTasksHierarchically ignores an empty pinned set', () => {
  const items = [
    { id: 1, title: 'Zeta' },
    { id: 2, title: 'Alpha' },
  ]
  const ordered = orderTasksHierarchically(items, items, 'title', new Set())
  assert.deepEqual(ordered.map(item => item.task.id), [2, 1])
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

test('criticalPathTaskIds marks the longest chain of dependent tasks', () => {
  const chain = [
    { id: 1, title: 'Design', status: 'todo', dependency_ids: [] },
    { id: 2, title: 'Build', status: 'todo', dependency_ids: [1] },
    { id: 3, title: 'Test', status: 'todo', dependency_ids: [2] },
    { id: 4, title: 'Unrelated', status: 'todo', dependency_ids: [] },
  ]
  assert.deepEqual([...criticalPathTaskIds(chain)].sort(), [1, 2, 3])
})

test('criticalPathTaskIds prefers the longer-duration chain over a longer node count', () => {
  const tasksWithDurations = [
    { id: 1, title: 'A', status: 'todo', dependency_ids: [], start_date: '2026-01-01', due_date: '2026-01-10' },
    { id: 2, title: 'B', status: 'todo', dependency_ids: [1], start_date: '2026-01-11', due_date: '2026-01-12' },
    { id: 3, title: 'C', status: 'todo', dependency_ids: [], start_date: '2026-01-01', due_date: '2026-01-02' },
    { id: 4, title: 'D', status: 'todo', dependency_ids: [3], start_date: '2026-01-03', due_date: '2026-01-04' },
    { id: 5, title: 'E', status: 'todo', dependency_ids: [4], start_date: '2026-01-05', due_date: '2026-01-06' },
  ]
  assert.deepEqual([...criticalPathTaskIds(tasksWithDurations)].sort(), [1, 2])
})

test('criticalPathTaskIds ignores completed tasks and returns empty when no chain exists', () => {
  assert.deepEqual(criticalPathTaskIds([{ id: 1, title: 'Solo', status: 'todo', dependency_ids: [] }]), new Set())
  assert.deepEqual(criticalPathTaskIds([
    { id: 1, title: 'Done', status: 'done', dependency_ids: [] },
    { id: 2, title: 'Next', status: 'todo', dependency_ids: [1] },
  ]), new Set())
})
