import { test } from 'node:test'
import assert from 'node:assert/strict'
import { taskWorkLogs, taskWorkLogsTotalMinutes, taskEstimateOverrun } from './taskLogs.js'

test('taskWorkLogs filters to the given task and sorts newest first', () => {
  const logs = [
    { id: 1, task_id: 5, log_date: '2026-07-01', content: 'a' },
    { id: 2, task_id: 9, log_date: '2026-07-02', content: 'other' },
    { id: 3, task_id: 5, log_date: '2026-07-03', content: 'c' },
    { id: 4, task_id: 5, log_date: '2026-07-03', content: 'd' },
  ]
  const result = taskWorkLogs(logs, 5)
  assert.deepEqual(result.map(l => l.id), [4, 3, 1])
})

test('taskWorkLogs returns empty array when no logs match', () => {
  assert.deepEqual(taskWorkLogs([{ id: 1, task_id: 2 }], 5), [])
  assert.deepEqual(taskWorkLogs(null, 5), [])
})

test('taskWorkLogsTotalMinutes sums duration_minutes, treating missing as 0', () => {
  assert.equal(taskWorkLogsTotalMinutes([{ duration_minutes: 30 }, { duration_minutes: null }, { duration_minutes: 45 }]), 75)
  assert.equal(taskWorkLogsTotalMinutes([]), 0)
})

test('taskEstimateOverrun returns null when no estimate is set', () => {
  assert.equal(taskEstimateOverrun(null, 120), null)
  assert.equal(taskEstimateOverrun(0, 120), null)
})

test('taskEstimateOverrun flags actual time exceeding the estimate', () => {
  assert.deepEqual(taskEstimateOverrun(60, 90), { overMinutes: 30, isOver: true })
  assert.deepEqual(taskEstimateOverrun(60, 60), { overMinutes: 0, isOver: false })
  assert.deepEqual(taskEstimateOverrun(60, 30), { overMinutes: -30, isOver: false })
})
