import { test } from 'node:test'
import assert from 'node:assert/strict'
import { todosDueForAlert, DEFAULT_TODO_ALERT_LEAD_MINUTES, TODO_ALERT_LEAD_OPTIONS } from './todoAlerts.js'

const now = new Date(2026, 0, 1, 9, 0).getTime()
const time = minutesFromNow => {
  const d = new Date(now + minutesFromNow * 60000)
  return { todo_date: d.toLocaleDateString('en-CA'), todo_time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
}

test('todosDueForAlert includes todos due within the lead window', () => {
  const todos = [{ id: 1, completed: false, ...time(10) }, { id: 2, completed: false, ...time(20) }]
  const due = todosDueForAlert(todos, now, 15)
  assert.deepEqual(due.map(t => t.id), [1])
})

test('todosDueForAlert excludes completed todos and todos without todo_time', () => {
  const todos = [{ id: 1, completed: true, ...time(5) }, { id: 2, completed: false, todo_date: '2026-01-01' }, { id: 3, completed: false, ...time(5) }]
  const due = todosDueForAlert(todos, now, 15)
  assert.deepEqual(due.map(t => t.id), [3])
})

test('todosDueForAlert excludes past due todos', () => {
  const todos = [{ id: 1, completed: false, ...time(-5) }]
  const due = todosDueForAlert(todos, now, 15)
  assert.deepEqual(due, [])
})

test('todosDueForAlert defaults to a 15 minute window', () => {
  assert.equal(DEFAULT_TODO_ALERT_LEAD_MINUTES, 15)
  const todos = [{ id: 1, completed: false, ...time(15) }, { id: 2, completed: false, ...time(16) }]
  const due = todosDueForAlert(todos, now)
  assert.deepEqual(due.map(t => t.id), [1])
})

test('todosDueForAlert respects a wider configured lead time independent of events', () => {
  const todos = [{ id: 1, completed: false, ...time(25) }]
  const due = todosDueForAlert(todos, now, 30)
  assert.deepEqual(due.map(t => t.id), [1])
})

test('todosDueForAlert lets a per-todo reminder_minutes_before override the global lead time', () => {
  const todos = [{ id: 1, completed: false, reminder_minutes_before: 30, ...time(25) }, { id: 2, completed: false, reminder_minutes_before: 5, ...time(10) }]
  const due = todosDueForAlert(todos, now, 15)
  assert.deepEqual(due.map(t => t.id), [1])
})

test('TODO_ALERT_LEAD_OPTIONS offers an off (0) choice while keeping the 15 minute default', () => {
  assert.ok(TODO_ALERT_LEAD_OPTIONS.includes(0))
  assert.equal(DEFAULT_TODO_ALERT_LEAD_MINUTES, 15)
})
