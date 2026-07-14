import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tasksDueByDay } from './calendarTaskDue.js'

test('groups tasks by due_date, skipping done tasks and tasks without a due date', () => {
  const tasks = [
    { id: 1, title: 'A', due_date: '2026-07-14', status: 'in_progress' },
    { id: 2, title: 'B', due_date: '2026-07-14', status: 'todo' },
    { id: 3, title: 'C', due_date: '2026-07-15', status: 'done' },
    { id: 4, title: 'D', due_date: null, status: 'todo' },
  ]
  const map = tasksDueByDay(tasks)
  assert.deepEqual(map.get('2026-07-14').map(t => t.id), [1, 2])
  assert.equal(map.has('2026-07-15'), false)
  assert.equal(map.size, 1)
})

test('returns an empty map for no tasks', () => {
  assert.equal(tasksDueByDay([]).size, 0)
  assert.equal(tasksDueByDay(undefined).size, 0)
})
