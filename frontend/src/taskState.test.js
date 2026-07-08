import assert from 'node:assert/strict'
import { test } from 'node:test'

import { upsertTask } from './taskState.js'

test('upsertTask updates an existing saved task in place by id', () => {
  const tasks = [
    { id: 1, title: '기존 업무', progress: 10, status: 'doing' },
    { id: 2, title: '다른 업무', progress: 0, status: 'todo' },
  ]

  const updated = upsertTask(tasks, { id: 1, title: '기존 업무 수정', progress: 40 })

  assert.deepEqual(updated, [
    { id: 1, title: '기존 업무 수정', progress: 40, status: 'doing' },
    { id: 2, title: '다른 업무', progress: 0, status: 'todo' },
  ])
  assert.notStrictEqual(updated, tasks)
})

test('upsertTask appends a newly created task when it is missing from the current list', () => {
  const tasks = [{ id: 2, title: '다른 업무', progress: 0, status: 'todo' }]

  const updated = upsertTask(tasks, { id: 3, title: '새 업무', progress: 0, status: 'todo' })

  assert.deepEqual(updated, [
    { id: 2, title: '다른 업무', progress: 0, status: 'todo' },
    { id: 3, title: '새 업무', progress: 0, status: 'todo' },
  ])
})
