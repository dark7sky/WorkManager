import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findOverlappingTasks } from './taskOverlap.js'

const tasks = [
  { id: 1, title: '기존 업무', start_date: '2026-07-19', start_time: '10:00', due_date: '2026-07-21', due_time: '18:00', status: 'todo' },
  { id: 2, title: '완료된 업무', start_date: '2026-07-19', start_time: '10:00', due_date: '2026-07-21', due_time: '18:00', status: 'done' },
  { id: 3, title: '삭제된 업무', start_date: '2026-07-19', start_time: '10:00', due_date: '2026-07-21', due_time: '18:00', status: 'todo', deleted_at: '2026-07-18T00:00:00' },
]

test('finds a task whose date range overlaps', () => {
  const result = findOverlappingTasks('2026-07-20', '09:00', '2026-07-22', '09:00', tasks, null)
  assert.deepEqual(result.map(t => t.id), [1])
})

test('excludes the task being edited', () => {
  const result = findOverlappingTasks('2026-07-20', '09:00', '2026-07-22', '09:00', tasks, 1)
  assert.equal(result.length, 0)
})

test('ignores done tasks', () => {
  const result = findOverlappingTasks('2026-07-20', '09:00', '2026-07-22', '09:00', tasks.filter(t => t.id !== 1), null)
  assert.equal(result.length, 0)
})

test('ignores soft-deleted tasks', () => {
  const result = findOverlappingTasks('2026-07-19', '10:00', '2026-07-21', '18:00', tasks.filter(t => t.id === 3), null)
  assert.equal(result.length, 0)
})

test('returns nothing when start or due date is missing', () => {
  assert.equal(findOverlappingTasks('', '09:00', '2026-07-22', '09:00', tasks, null).length, 0)
  assert.equal(findOverlappingTasks('2026-07-20', '09:00', '', '09:00', tasks, null).length, 0)
})

test('ignores non-overlapping date ranges', () => {
  const result = findOverlappingTasks('2026-07-25', '09:00', '2026-07-26', '09:00', tasks, null)
  assert.equal(result.length, 0)
})
