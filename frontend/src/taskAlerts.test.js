import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tasksDueForAlert, DEFAULT_TASK_ALERT_LEAD_MINUTES } from './taskAlerts.js'

const now = new Date(2026, 0, 1, 9, 0).getTime()
const time = minutesFromNow => {
  const d = new Date(now + minutesFromNow * 60000)
  return { due_date: d.toLocaleDateString('en-CA'), due_time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
}

test('tasksDueForAlert includes tasks due within the lead window', () => {
  const tasks = [{ id: 1, status: 'in_progress', ...time(10) }, { id: 2, status: 'in_progress', ...time(20) }]
  const due = tasksDueForAlert(tasks, now, 15)
  assert.deepEqual(due.map(t => t.id), [1])
})

test('tasksDueForAlert excludes done tasks and tasks without due_time', () => {
  const tasks = [{ id: 1, status: 'done', ...time(5) }, { id: 2, status: 'pending', due_date: '2026-01-01' }, { id: 3, status: 'pending', ...time(5) }]
  const due = tasksDueForAlert(tasks, now, 15)
  assert.deepEqual(due.map(t => t.id), [3])
})

test('tasksDueForAlert excludes past due tasks', () => {
  const tasks = [{ id: 1, status: 'pending', ...time(-5) }]
  const due = tasksDueForAlert(tasks, now, 15)
  assert.deepEqual(due, [])
})

test('tasksDueForAlert defaults to a 15 minute window', () => {
  assert.equal(DEFAULT_TASK_ALERT_LEAD_MINUTES, 15)
  const tasks = [{ id: 1, status: 'pending', ...time(15) }, { id: 2, status: 'pending', ...time(16) }]
  const due = tasksDueForAlert(tasks, now)
  assert.deepEqual(due.map(t => t.id), [1])
})

test('tasksDueForAlert respects a wider configured lead time independent of events/todos', () => {
  const tasks = [{ id: 1, status: 'pending', ...time(25) }]
  const due = tasksDueForAlert(tasks, now, 30)
  assert.deepEqual(due.map(t => t.id), [1])
})
