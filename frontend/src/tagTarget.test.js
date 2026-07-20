import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pickTagTarget } from './tagTarget.js'

test('pickTagTarget defaults to tasks screen when tasks has the most (or tied) uses', () => {
  assert.deepEqual(pickTagTarget({ tasks: 3, events: 1, todos: 0, work_logs: 0 }), { page: 'tasks', label: '업무' })
  assert.deepEqual(pickTagTarget({ tasks: 2, events: 2, todos: 2, work_logs: 2 }), { page: 'tasks', label: '업무' })
})

test('pickTagTarget routes to calendar when a tag is mostly used on events', () => {
  assert.deepEqual(pickTagTarget({ tasks: 0, events: 4, todos: 1, work_logs: 0 }), { page: 'calendar', label: '일정' })
})

test('pickTagTarget routes to today when a tag is mostly used on todos or work logs', () => {
  assert.deepEqual(pickTagTarget({ tasks: 0, events: 0, todos: 5, work_logs: 1 }), { page: 'today', label: '할 일' })
  assert.deepEqual(pickTagTarget({ tasks: 0, events: 0, todos: 1, work_logs: 5 }), { page: 'today', label: '업무 기록' })
})

test('pickTagTarget handles missing/undefined table counts', () => {
  assert.deepEqual(pickTagTarget({}), { page: 'tasks', label: '업무' })
  assert.deepEqual(pickTagTarget(undefined), { page: 'tasks', label: '업무' })
})
